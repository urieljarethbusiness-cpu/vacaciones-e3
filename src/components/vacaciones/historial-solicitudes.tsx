"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarOff, FileText, ShieldUser } from "lucide-react";
import {
  cancelarSolicitud,
  descargarEvidencia,
} from "@/server/actions/vacaciones";
import {
  claseEstado,
  estiloTipo,
  etiquetaEstado,
  etiquetaTipo,
  formatearRango,
  formatearTamano,
  type AdjuntoAusencia,
  type Ausencia,
} from "@/lib/ausencias";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Badge de estado. Lo consume también `/gestion/vacaciones`, así que conserva
 * su firma (`estado: string`).
 */
export function BadgeSolicitud({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${claseEstado(estado)}`}
    >
      {etiquetaEstado(estado)}
    </span>
  );
}

/** Historial de las ausencias propias, con tipo, motivo y comprobantes. */
export function HistorialSolicitudes({
  solicitudes,
  adjuntos = [],
  puedeCancelar,
}: {
  solicitudes: Ausencia[];
  /** Comprobantes visibles de esas ausencias (sin la ruta del objeto). */
  adjuntos?: AdjuntoAusencia[];
  puedeCancelar?: boolean;
}) {
  const router = useRouter();
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);

  const porSolicitud = useMemo(() => {
    const mapa = new Map<string, AdjuntoAusencia[]>();
    for (const adjunto of adjuntos) {
      const lista = mapa.get(adjunto.solicitud_id) ?? [];
      lista.push(adjunto);
      mapa.set(adjunto.solicitud_id, lista);
    }
    return mapa;
  }, [adjuntos]);

  async function cancelar(id: string) {
    setCancelando(id);
    const r = await cancelarSolicitud(id);
    setCancelando(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Ausencia cancelada");
    router.refresh();
  }

  /**
   * El bucket `ausencias` es privado: la acción devuelve una URL firmada de
   * 60 s y se abre en otra pestaña. Nunca se guarda ni se comparte.
   *
   * La pestaña se abre en blanco DENTRO del gesto del usuario y se navega
   * después: si se abriera al volver del `await`, el bloqueador de ventanas
   * emergentes la cancelaría y el comprobante no se vería (comprobado con
   * Playwright). `opener = null` hace lo mismo que `rel="noopener"`.
   */
  async function verComprobante(id: string) {
    const ventana = window.open("", "_blank");
    if (ventana) ventana.opener = null;

    setDescargando(id);
    const r = await descargarEvidencia(id);
    setDescargando(null);

    if (!r.ok) {
      ventana?.close();
      toast.error(r.error);
      return;
    }
    if (ventana) ventana.location.replace(r.url);
    else window.open(r.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mi historial de ausencias</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {solicitudes.map((s) => {
          const estilo = estiloTipo(s.tipo_color);
          const comprobantes = porSolicitud.get(s.id) ?? [];
          return (
            <div
              key={s.id}
              className="flex min-w-0 items-start gap-3 rounded-lg border p-3"
            >
              <div className="shrink-0 rounded-md border bg-muted/40 px-3 py-1.5 text-center">
                <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Días
                </p>
                <p className="text-lg leading-tight font-semibold">
                  {s.dias_habiles}
                </p>
              </div>

              <div className="grid min-w-0 flex-1 gap-1.5 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-block rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={estilo}
                  >
                    {etiquetaTipo(s.tipo, s.tipo_etiqueta)}
                  </span>
                  <BadgeSolicitud estado={s.estado} />
                  {s.registrada_por_gestor && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      title="La dio de alta Recursos Humanos a tu nombre"
                    >
                      <ShieldUser className="size-3" />
                      Registrada por RR. HH.
                    </span>
                  )}
                </div>

                <p className="font-medium break-words">
                  {formatearRango(s.fecha_inicio, s.fecha_fin)}
                </p>

                {s.motivo && (
                  <p className="text-xs break-words text-muted-foreground">
                    {s.motivo}
                  </p>
                )}
                {s.comentario_manager && (
                  <p className="text-xs break-words text-muted-foreground">
                    Respuesta: {s.comentario_manager}
                  </p>
                )}

                {(comprobantes.length > 0 ||
                  (puedeCancelar && s.estado === "pendiente")) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {comprobantes.map((adjunto) => (
                      <Button
                        key={adjunto.id}
                        variant="ghost"
                        size="xs"
                        className="max-w-full"
                        disabled={descargando === adjunto.id}
                        title={`${adjunto.nombre_archivo} · ${formatearTamano(adjunto.tamano)}`}
                        onClick={() => verComprobante(adjunto.id)}
                      >
                        <FileText data-icon="inline-start" />
                        <span className="truncate">
                          {descargando === adjunto.id
                            ? "Abriendo…"
                            : comprobantes.length > 1
                              ? `Ver comprobante · ${adjunto.nombre_archivo}`
                              : "Ver comprobante"}
                        </span>
                      </Button>
                    ))}
                    {/* Con confirmación: cancelar retira la solicitud y no se
                        puede deshacer, y el botón vivía pegado a «Ver
                        comprobante» en una fila de ~24 px de alto — muy fácil
                        de errar en táctil. RR. HH. ya confirmaba para borrar;
                        el empleado no confirmaba nada. */}
                    {puedeCancelar && s.estado === "pendiente" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={cancelando === s.id}
                          >
                            {cancelando === s.id ? "Cancelando…" : "Cancelar"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              ¿Cancelas esta solicitud?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Vas a retirar tu{" "}
                              {etiquetaTipo(
                                s.tipo,
                                s.tipo_etiqueta
                              ).toLocaleLowerCase("es-MX")}{" "}
                              del{" "}
                              <strong className="text-foreground">
                                {formatearRango(s.fecha_inicio, s.fecha_fin)}
                              </strong>
                              . Los {s.dias_habiles}{" "}
                              {s.dias_habiles === 1 ? "día" : "días"} vuelven a
                              tu saldo. Si te arrepientes, tendrás que pedirlos
                              de nuevo.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Mejor no</AlertDialogCancel>
                            <AlertDialogAction onClick={() => cancelar(s.id)}>
                              Sí, cancelar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {/* Mismo patrón de estado vacío que el resto de la app (borde
            punteado + icono + qué falta + qué hacer), en vez de una línea gris
            centrada que no orienta a nadie. */}
        {solicitudes.length === 0 && (
          <div className="grid justify-items-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center">
            <CalendarOff className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Todavía no has pedido días</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Cuando pidas vacaciones o un permiso aparecerán aquí con su
              estado y la respuesta de Recursos Humanos.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
