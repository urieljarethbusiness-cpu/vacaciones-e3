import { exigirPermisoPagina } from "@/lib/perfil";
import { base } from "@/lib/db";
import {
  ajusteEntero,
  adjuntosDeSolicitudes,
  festivosSet,
  listarSolicitudes,
  misCiclosVacaciones,
  resumenAusencias,
} from "@/lib/db/consultas";
import { politicasActivas } from "@/lib/db/consultas";
import { formatearFecha, type AdjuntoAusencia } from "@/lib/ausencias";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TarjetaBalance,
  type Balance,
} from "@/components/vacaciones/tarjeta-balance";
import { CICLOS_VISIBLES, diaSiguienteISO } from "@/lib/vacaciones";
import { FormularioSolicitud } from "@/components/vacaciones/formulario-solicitud";
import { HistorialSolicitudes } from "@/components/vacaciones/historial-solicitudes";
import { ResumenTipos } from "@/components/vacaciones/resumen-tipos";

/**
 * «Mis vacaciones» — la vista del EMPLEADO. Misma estructura que el original:
 * saldos de los dos ciclos, formulario con las reglas por tipo, historial y
 * resumen anual. Los datos vienen de la capa local (`consultas.ts`), que es
 * el espejo de las RPC de Postgres.
 */
export default async function PaginaVacaciones() {
  const perfil = await exigirPermisoPagina("vacaciones");
  const db = base();

  const ciclos = misCiclosVacaciones(db, perfil.id, CICLOS_VISIBLES);
  const balance = (ciclos[0] ?? null) as Balance | null;
  const proximo = ciclos.find((c) => c.indice === 1) ?? null;

  const festivos = [...festivosSet(db)];
  const anticipacion = ajusteEntero(db, "anticipacion_minima_dias", 14);
  const umbralNaranja = ajusteEntero(db, "semaforo_naranja", 30);
  const umbralRojo = ajusteEntero(db, "semaforo_rojo", 15);

  const ficha = db
    .prepare("select fecha_ingreso from empleados where id = ?")
    .get(perfil.id) as { fecha_ingreso: string } | undefined;

  if (!ficha) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin ficha de empleado</CardTitle>
          <CardDescription>
            Tu cuenta no tiene ficha laboral registrada. Contacta a un manager.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const mias = listarSolicitudes(db, perfil).filter(
    (s) => s.empleado_id === perfil.id
  );

  const adjuntos = adjuntosDeSolicitudes(
    db,
    mias.filter((s) => s.tiene_adjuntos).map((s) => s.id)
  ) as AdjuntoAusencia[];

  const resumen = resumenAusencias(db, perfil.id, new Date().getFullYear());

  const puedeGestionar = perfil.permisos.includes("gestion.vacaciones");
  const politicas = politicasActivas(db).filter(
    (p) => !p.solo_gestor || puedeGestionar
  );

  const sinAntiguedad = !balance || balance.dias_correspondientes === 0;
  const bloqueos: Partial<Record<string, string>> = {};
  for (const politica of politicas) {
    if (politica.exige_antiguedad && sinAntiguedad) {
      bloqueos[politica.tipo] =
        "Disponible al cumplir un año en Consultoría E3.";
    }
  }

  const anio = new Date().getFullYear();

  let resumenSaldo: string;
  if (sinAntiguedad) {
    const aniversario = balance
      ? formatearFecha(diaSiguienteISO(balance.ciclo_fin))
      : null;
    resumenSaldo = aniversario
      ? `Cumples tu primer año el ${aniversario}. Ese día estrenas tus primeros días de vacaciones.`
      : "Todavía no acumulas días de vacaciones.";
  } else {
    const restan = balance?.dias_restantes ?? 0;
    resumenSaldo =
      `${restan === 0 ? "No te quedan días" : `Te ${restan === 1 ? "queda 1 día" : `quedan ${restan} días`}`}` +
      ` · se reinician el ${formatearFecha(balance!.ciclo_fin)}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mis vacaciones</h1>
        <p className="text-muted-foreground">{resumenSaldo}</p>
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start">
        <Card className="order-2 min-w-0 lg:order-none">
          <CardHeader>
            <CardTitle>Registrar una ausencia</CardTitle>
            <CardDescription>
              Elige el tipo y el rango de fechas. Los fines de semana y los días
              festivos no cuentan; cada tipo tiene sus propias reglas de
              anticipación y comprobante.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {sinAntiguedad && (
              <div className="mb-5 rounded-md border border-amber-500/50 bg-amber-500/15 p-3 text-sm text-amber-700 dark:text-amber-300">
                Todavía no acumulas días de vacaciones: se estrenan al cumplir
                un año en Consultoría E3, y son 12 días hábiles. Mientras
                tanto sí puedes pedir permisos y trabajo remoto.
              </div>
            )}
            <FormularioSolicitud
              politicas={politicas}
              festivos={festivos}
              anticipacionDias={anticipacion}
              ciclos={ciclos}
              bloqueos={bloqueos}
            />
          </CardContent>
        </Card>

        <div className="contents lg:flex lg:flex-col lg:gap-6 lg:min-w-0">
          <div className="order-1 grid min-w-0 gap-6 lg:order-none">
            {balance && (
              <TarjetaBalance
                balance={balance}
                umbralNaranja={umbralNaranja}
                umbralRojo={umbralRojo}
              />
            )}
            {proximo && proximo.dias_correspondientes > 0 && (
              <TarjetaBalance
                proximoCiclo
                balance={proximo}
                umbralNaranja={umbralNaranja}
                umbralRojo={umbralRojo}
              />
            )}
          </div>

          <div className="order-3 min-w-0 lg:order-none">
            <HistorialSolicitudes
              solicitudes={mias}
              adjuntos={adjuntos}
              puedeCancelar
            />
          </div>
        </div>
      </div>

      <ResumenTipos resumen={resumen} anio={anio} />
    </div>
  );
}
