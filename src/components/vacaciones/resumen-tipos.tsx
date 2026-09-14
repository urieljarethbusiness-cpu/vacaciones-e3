import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { colorTipo, type ResumenAusencia } from "@/lib/ausencias";

/**
 * Conteo automático del año por tipo de ausencia (`public.resumen_ausencias`).
 *
 * Solo se pintan los tipos con movimiento: la RPC devuelve una fila por cada
 * tipo activo (siete hoy), y una rejilla de ceros en móvil es ruido, no
 * información.
 */
export function ResumenTipos({
  resumen,
  anio,
}: {
  resumen: ResumenAusencia[];
  anio: number;
}) {
  const conMovimiento = resumen.filter(
    (r) => r.solicitudes > 0 || r.dias_aprobados > 0 || r.dias_pendientes > 0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tu {anio} en números</CardTitle>
        <CardDescription>
          Días contabilizados automáticamente por tipo. Solo las vacaciones
          descuentan de tu saldo de la Ley Federal del Trabajo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {conMovimiento.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no registras ausencias en {anio}.
          </p>
        ) : (
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {conMovimiento.map((fila) => {
              return (
                <div
                  key={fila.tipo}
                  className="min-w-0 rounded-lg border border-l-4 p-3"
                  // El color solo vive en la franja lateral. Teñir el número
                  // con el hex de la política lo dejaba ilegible en oscuro
                  // (duelo, #475569, daba ~2.2:1).
                  style={{ borderLeftColor: colorTipo(fila.color) }}
                >
                  <p
                    className="truncate text-xs font-medium text-muted-foreground"
                    title={fila.etiqueta}
                  >
                    {fila.etiqueta}
                  </p>
                  <p className="mt-1.5 text-2xl leading-none font-semibold tabular-nums">
                    {fila.dias_aprobados}
                  </p>
                  <p className="mt-1.5 text-xs leading-snug text-muted-foreground break-words">
                    {fila.dias_aprobados === 1
                      ? "día aprobado"
                      : "días aprobados"}
                    {fila.dias_pendientes > 0 &&
                      ` · ${fila.dias_pendientes} por resolver`}
                    {fila.descuenta_vacaciones && " · descuenta saldo"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
