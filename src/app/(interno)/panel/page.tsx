import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import { obtenerPerfilOredirigir } from "@/lib/perfil";
import { base } from "@/lib/db";
import {
  claseEstado,
  colorTipo,
  etiquetaEstado,
  formatearRango,
} from "@/lib/ausencias";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function plural(n: number, s: string, p: string) {
  return `${n} ${n === 1 ? s : p}`;
}

/**
 * El Panel — mismo espíritu que el del original: el bloque de ausencias
 * pendientes va ARRIBA de todo lo demás porque es lo único que bloquea a
 * otra persona. Solo se monta para quien tiene `gestion.vacaciones`.
 */
export default async function PaginaPanel() {
  const perfil = await obtenerPerfilOredirigir();
  const db = base();

  const puedeGestionar = perfil.permisos.includes("gestion.vacaciones");
  const pendientes = puedeGestionar
    ? (db
        .prepare(
          `select s.id, s.empleado_id, p.nombre_completo, s.fecha_inicio,
                  s.fecha_fin, s.dias_habiles, s.tipo,
                  pa.etiqueta as tipo_etiqueta, pa.color as tipo_color
           from solicitudes_vacaciones s
           join perfiles p on p.id = s.empleado_id
           left join politica_ausencias pa on pa.tipo = s.tipo
           where s.estado = 'pendiente'
           order by s.created_at desc
           limit 6`
        )
        .all() as unknown as {
          id: string;
          empleado_id: string;
          nombre_completo: string;
          fecha_inicio: string;
          fecha_fin: string;
          dias_habiles: number;
          tipo: string;
          tipo_etiqueta: string | null;
          tipo_color: string | null;
        }[])
    : [];
  const total = puedeGestionar
    ? (
        db
          .prepare(
            "select count(*) as n from solicitudes_vacaciones where estado = 'pendiente'"
          )
          .get() as { n: number }
      ).n
    : 0;

  const propias = (
    db
      .prepare(
        `select estado, count(*) as n from solicitudes_vacaciones
         where empleado_id = ? group by estado`
      )
      .all(perfil.id) as unknown as { estado: string; n: number }[]
  ).reduce<Record<string, number>>((m, f) => {
    m[f.estado] = Number(f.n);
    return m;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Hola, {perfil.nombre_completo.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground">
          {propias.pendiente
            ? `Tienes ${plural(Number(propias.pendiente), "solicitud", "solicitudes")} esperando revisión.`
            : "No tienes solicitudes esperando revisión."}
        </p>
      </div>

      {puedeGestionar && total > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <CalendarClock className="size-5" aria-hidden />
              Ausencias pendientes por aprobar
              <span
                className={`ml-1 inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${claseEstado("pendiente")}`}
              >
                {total}
              </span>
            </CardTitle>
            <CardDescription>
              {plural(total, "ausencia espera", "ausencias esperan")} tu
              resolución.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 p-2">
            {pendientes.map((p) => (
              <Link
                key={p.id}
                href={`/gestion/vacaciones?estado=pendiente&empleado=${p.empleado_id}`}
                className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colorTipo(p.tipo_color) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {p.nombre_completo}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.tipo_etiqueta ?? p.tipo} ·{" "}
                    {formatearRango(p.fecha_inicio, p.fecha_fin)} ·{" "}
                    {plural(p.dias_habiles, "día hábil", "días hábiles")}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
            <Link
              href="/gestion/vacaciones?estado=pendiente"
              className="mt-1 px-2 text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
            >
              {total > pendientes.length
                ? `Ver las ${total} pendientes (${total - pendientes.length} más) →`
                : "Ir a Ausencias del equipo →"}
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tus solicitudes</CardTitle>
          <CardDescription>
            El estado de lo que has pedido este año.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-sm">
            {(["pendiente", "aprobada", "rechazada", "cancelada"] as const).map(
              (estado) => (
                <span
                  key={estado}
                  className={`inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${claseEstado(estado)}`}
                >
                  {etiquetaEstado(estado)}: {propias[estado] ?? 0}
                </span>
              )
            )}
          </div>
          <div className="mt-4 flex gap-3">
            {perfil.permisos.includes("vacaciones") && (
              <Link
                href="/vacaciones"
                className="text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
              >
                Ir a Mis vacaciones →
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
