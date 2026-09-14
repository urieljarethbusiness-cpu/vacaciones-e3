"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { actualizarSolicitud } from "@/server/actions/vacaciones";
import {
  ESTADOS_AUSENCIA,
  etiquetaEstado,
  type EstadoAusencia,
} from "@/lib/ausencias";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Colores por estado — mismos tonos de las píldoras del módulo, aplicados al
 * FONDO y al TEXTO del disparador. El `!` gana a las clases por defecto del
 * trigger (`dark:bg-input/30`), que en tema oscuro las tapaban.
 */
const COLOR_ESTADO: Record<EstadoAusencia, { trigger: string; punto: string }> = {
  pendiente: {
    trigger:
      "!border-amber-500/40 !bg-amber-500/15 !text-amber-700 hover:!bg-amber-500/25 dark:!text-amber-300",
    punto: "bg-amber-500",
  },
  aprobada: {
    trigger:
      "!border-emerald-500/40 !bg-emerald-500/15 !text-emerald-700 hover:!bg-emerald-500/25 dark:!text-emerald-300",
    punto: "bg-emerald-500",
  },
  rechazada: {
    trigger:
      "!border-red-500/40 !bg-red-500/15 !text-red-700 hover:!bg-red-500/25 dark:!text-red-300",
    punto: "bg-red-500",
  },
  cancelada: {
    trigger: "!border-border !bg-muted !text-muted-foreground hover:!bg-muted/70",
    punto: "bg-muted-foreground",
  },
};

/**
 * Cambio de estado EN LÍNEA desde la tabla de «Ausencias del equipo»: sin
 * abrir el diálogo para lo más común (aprobar, rechazar, cancelar, devolver a
 * pendiente). Quien decide de verdad sigue siendo la acción de servidor: si
 * el nuevo estado rompe una regla (saldo, propia ausencia, traslape), el
 * selector revierte y muestra el error en español.
 */
export function SelectorEstado({
  solicitudId,
  estado,
  fechaInicio,
  fechaFin,
}: {
  solicitudId: string;
  estado: EstadoAusencia;
  fechaInicio: string;
  fechaFin: string;
}) {
  const router = useRouter();
  const [valor, setValor] = useState<EstadoAusencia>(estado);
  const [enviando, iniciar] = useTransition();

  // Tras un router.refresh() la fila llega con el estado real del servidor.
  useEffect(() => setValor(estado), [estado]);

  function cambiar(nuevo: string) {
    const siguiente = nuevo as EstadoAusencia;
    if (siguiente === valor) return;
    const anterior = valor;
    setValor(siguiente);
    iniciar(async () => {
      const r = await actualizarSolicitud({
        id: solicitudId,
        estado: siguiente,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });
      if (r.ok) {
        toast.success(`Ausencia marcada como ${etiquetaEstado(siguiente).toLowerCase()}.`);
        router.refresh();
      } else {
        setValor(anterior);
        toast.error(r.error);
        router.refresh();
      }
    });
  }

  const colores = COLOR_ESTADO[valor] ?? COLOR_ESTADO.cancelada;

  return (
    <Select value={valor} onValueChange={cambiar} disabled={enviando}>
      <SelectTrigger
        size="sm"
        aria-label={`Estado de la ausencia: ${etiquetaEstado(valor)}`}
        className={cn(
          "w-36 shrink-0 gap-1 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
          colores.trigger
        )}
      >
        {enviando ? (
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", colores.punto)}
          />
        )}
        {/* Hijos explícitos: sin esto SelectValue hereda los hijos del item
            (con su punto) y el disparador mostraría DOS puntos. */}
        <SelectValue>{etiquetaEstado(valor)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ESTADOS_AUSENCIA.map((e) => (
          <SelectItem key={e} value={e} data-estado={e}>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", COLOR_ESTADO[e].punto)}
              />
              {etiquetaEstado(e)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
