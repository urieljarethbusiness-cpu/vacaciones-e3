"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  TRAMO_ANIOS_MAX,
  TRAMO_ANIOS_MIN,
  TRAMO_DIAS_MAX,
  TRAMO_DIAS_MIN,
  errorDeEscalaVacaciones,
  type TramoVacaciones,
} from "@/lib/vacaciones";
import { exigirAdmin } from "@/server/autorizacion";
import { registrarAuditoria } from "@/server/auditoria";

type Resultado = {
  ok: true;
  /** Número de tramos guardados (lo lee el editor de la escala). */
  tramos: number;
  afectados: number;
} | { ok: false; error: string };

const esquemaEscala = z.object({
  tramos: z
    .array(
      z.object({
        anios: z
          .number({ error: "Cada tramo necesita un año." })
          .int()
          .min(TRAMO_ANIOS_MIN)
          .max(TRAMO_ANIOS_MAX),
        dias: z
          .number({ error: "Cada tramo necesita unos días." })
          .int()
          .min(TRAMO_DIAS_MIN)
          .max(TRAMO_DIAS_MAX),
      })
    )
    .max(99),
});

/**
 * Guarda la escala del art. 76 LFT. Espejo de la acción del original: valida
 * en TypeScript (el mismo espejo del trigger), reemplaza la tabla en una
 * transacción y deja constancia en la bitácora con el número de personas
 * sobregiradas por la tabla nueva.
 */
export async function guardarPoliticaVacaciones(
  entrada: z.input<typeof esquemaEscala>
): Promise<Resultado> {
  let sesion;
  try {
    sesion = await exigirAdmin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { db, perfil } = sesion;

  const parseo = esquemaEscala.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }
  const tramos = parseo.data.tramos as TramoVacaciones[];

  const error = errorDeEscalaVacaciones(tramos);
  if (error) return { ok: false, error };

  const antes = db
    .prepare("select anios, dias from politica_vacaciones order by anios")
    .all() as unknown as TramoVacaciones[];

  try {
    db.exec("begin");
    db.prepare("delete from politica_vacaciones").run();
    const insertar = db.prepare(
      "insert into politica_vacaciones (anios, dias) values (?, ?)"
    );
    for (const t of tramos) insertar.run(t.anios, t.dias);
    db.exec("commit");
  } catch (e) {
    db.exec("rollback");
    return { ok: false, error: (e as Error).message };
  }

  // Los saldos no están guardados: cambiar la escala re-precia todos los
  // ciclos. Se reporta quién quedó consumiendo más de lo que la tabla nueva
  // concede, igual que en el original.
  const filas = db
    .prepare(
      `select e.id, e.fecha_ingreso
       from empleados e join perfiles p on p.id = e.id
       where e.fecha_baja is null and p.activo = 1`
    )
    .all() as unknown as { id: string; fecha_ingreso: string }[];
  let afectados = 0;
  for (const f of filas) {
    const consumido = (
      db
        .prepare(
          `select coalesce(sum(s.dias_habiles), 0) as n
           from solicitudes_vacaciones s
           join politica_ausencias pa on pa.tipo = s.tipo
           where s.empleado_id = ? and pa.descuenta_vacaciones = 1
             and s.estado in ('pendiente','aprobada')`
        )
        .get(f.id) as { n: number }
    ).n;
    if (consumido <= 0) continue;
    const aniosTotales = Math.max(
      Math.floor(
        (Date.now() - new Date(f.fecha_ingreso).getTime()) / (365.25 * 86_400_000)
      ),
      0
    );
    let concedidos = 0;
    for (let a = 1; a <= aniosTotales; a++) {
      const tramo = [...tramos].reverse().find((t) => t.anios <= a);
      concedidos += tramo?.dias ?? 0;
    }
    if (consumido > concedidos) afectados += 1;
  }

  registrarAuditoria(db, {
    categoria: "rrhh",
    accion: "vacaciones_lft.actualizada",
    entidad: "politica_vacaciones",
    entidad_etiqueta: `${tramos.length} tramos`,
    actor: perfil,
    antes,
    despues: tramos,
    metadatos: { empleados_sobregirados: afectados },
  });

  revalidatePath("/configuracion/general");
  revalidatePath("/vacaciones");
  revalidatePath("/gestion/vacaciones");
  return { ok: true, tramos: tramos.length, afectados };
}
