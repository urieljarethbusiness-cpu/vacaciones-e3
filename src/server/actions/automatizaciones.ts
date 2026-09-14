"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { base } from "@/lib/db";
import { exigirAdmin } from "@/server/autorizacion";
import {
  ejecutarRecordatorio,
  guardarAutomatizacion,
} from "@/server/recordatorios";
import { registrarAuditoria } from "@/server/auditoria";

type Resultado = { ok: true } | { ok: false; error: string };

const esquemaHora = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Hora inválida (usa formato HH:MM)" });

const esquemaDias = z
  .array(z.number().int().min(1).max(7))
  .min(1, { error: "Elige al menos un día de la semana" });

const esquemaVacaciones = z.object({
  activo: z.boolean(),
  horarios: z
    .array(esquemaHora)
    .min(1, { error: "Agrega al menos un horario de recordatorio" })
    .max(6, { error: "Máximo 6 horarios al día" }),
  dias: esquemaDias,
  destinatarios_modo: z.enum(["permiso", "personalizado"]),
  destinatarios: z.array(z.string().uuid()).max(100),
});

const esquemaVencimiento = z.object({
  activo: z.boolean(),
  horarios: z
    .array(esquemaHora)
    .min(1, { error: "Agrega al menos un horario de recordatorio" })
    .max(6, { error: "Máximo 6 horarios al día" }),
  dias: esquemaDias,
  aviso_dias: z.coerce
    .number()
    .int({ error: "Los días de aviso deben ser un número entero." })
    .min(0, { error: "El mínimo es 0 (avisar el mismo día del reinicio)." })
    .max(365, { error: "El máximo es 365 días de aviso." }),
});

const esquema = z.object({
  vacaciones: esquemaVacaciones,
  vencimiento: esquemaVencimiento,
});

export type EntradaAutomatizaciones = z.input<typeof esquema>;

/** Guarda la configuración de recordatorios automáticos (solo admins). */
export async function guardarAutomatizaciones(
  entrada: EntradaAutomatizaciones
): Promise<Resultado> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirAdmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parseo = esquema.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }
  const { vacaciones, vencimiento } = parseo.data;

  guardarAutomatizacion(db, "automatizacion_vacaciones", vacaciones);
  guardarAutomatizacion(
    db,
    "automatizacion_vencimiento",
    vencimiento satisfies z.infer<typeof esquemaVencimiento>
  );

  registrarAuditoria(db, {
    categoria: "config",
    accion: "automatizaciones.actualizadas",
    entidad: "ajustes",
    entidad_etiqueta: "automatizacion_vacaciones · automatizacion_vencimiento",
    actor: perfil,
    despues: { vacaciones, vencimiento },
  });

  revalidatePath("/configuracion/automatizaciones");
  return { ok: true };
}

/** Dispara un recordatorio ahora mismo, sin esperar su horario. */
export async function ejecutarRecordatorioAhora(
  clave: "vacaciones" | "vencimiento"
): Promise<{ ok: true; detalle: string } | { ok: false; error: string }> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirAdmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const resultado = await ejecutarRecordatorio(db, clave, perfil, true);
  revalidatePath("/configuracion/automatizaciones");
  return resultado;
}
