"use client";

import { useId, useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import {
  ACEPTA_EVIDENCIA,
  MAX_ARCHIVOS_EVIDENCIA,
  errorDeEvidencia,
  formatearTamano,
} from "@/lib/ausencias";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const FORMATOS_EVIDENCIA = "JPG, PNG, WEBP, HEIC o PDF";

/**
 * Comprobantes de una ausencia.
 *
 * **Solo se monta cuando el tipo elegido lo exige** (`requiere_evidencia` de
 * `politica_ausencias`, hoy permiso por salud y maternidad/paternidad). Que el
 * bloque exista ES el requisito: no hay variante «opcional». Antes se
 * renderizaba siempre y en unas vacaciones aparecía un «Comprobante
 * (opcional)» pidiendo «receta, incapacidad o constancia», que no viene a
 * cuento y hace dudar de si falta algo por subir.
 *
 * Valida en cliente con `errorDeEvidencia` — la MISMA función que usa la
 * server action — para dar el aviso antes de subir 10 MB por la red. La
 * validación que manda sigue siendo la del servidor y la del trigger de BD:
 * aquí no se decide nada de negocio, solo se adelanta el feedback.
 */
export function CampoEvidencia({
  archivos,
  onCambio,
  etiquetaTipo,
  deshabilitado = false,
}: {
  archivos: File[];
  onCambio: (archivos: File[]) => void;
  /** Etiqueta viva del tipo, para decir POR QUÉ se pide el comprobante. */
  etiquetaTipo?: string;
  deshabilitado?: boolean;
}) {
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);

  function agregar(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    // Se acumulan entre aperturas del diálogo del navegador; el mismo archivo
    // dos veces no cuenta dos veces.
    const juntos = [...archivos];
    for (const archivo of Array.from(lista)) {
      const repetido = juntos.some(
        (x) => x.name === archivo.name && x.size === archivo.size
      );
      if (!repetido) juntos.push(archivo);
    }
    const error = errorDeEvidencia(juntos);
    if (error) {
      toast.error(error);
      return;
    }
    onCambio(juntos);
  }

  function quitar(indice: number) {
    onCambio(archivos.filter((_, i) => i !== indice));
  }

  const motivo = etiquetaTipo
    ? `Recursos Humanos necesita el justificante para aprobar tu ${etiquetaTipo.toLocaleLowerCase(
        "es-MX"
      )}.`
    : "Este tipo de ausencia necesita justificante para poder aprobarse.";

  return (
    <div
      className="grid min-w-0 gap-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-500/40 dark:bg-amber-500/10"
      data-slot="campo-evidencia"
    >
      <Label htmlFor={id} className="flex flex-wrap items-center gap-1.5">
        Comprobante
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-red-800 uppercase dark:bg-red-500/20 dark:text-red-200">
          Obligatorio
        </span>
      </Label>

      <p className="text-xs text-muted-foreground">{motivo}</p>

      {/* El input real queda accesible pero no visible: la etiqueta y el
          botón son la interfaz. `key` con la cantidad no hace falta porque
          el value se limpia en cada cambio.

          `tabIndex={-1}` porque `sr-only` esconde pero NO saca del orden de
          tabulación: al tabular, el foco desaparecía de la pantalla una parada
          antes del botón. El `<label htmlFor>` de arriba conserva el clic y el
          anuncio por lector de pantalla. */}
      <div className="relative">
        <input
          ref={entrada}
          id={id}
          type="file"
          multiple
          accept={ACEPTA_EVIDENCIA}
          disabled={deshabilitado}
          tabIndex={-1}
          className="sr-only"
          onChange={(e) => {
            agregar(e.target.files);
            // Permite volver a elegir el mismo archivo tras quitarlo
            if (entrada.current) entrada.current.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={deshabilitado || archivos.length >= MAX_ARCHIVOS_EVIDENCIA}
          onClick={() => entrada.current?.click()}
        >
          <Paperclip data-icon="inline-start" />
          {archivos.length === 0 ? "Adjuntar archivo" : "Adjuntar otro"}
        </Button>
      </div>

      {archivos.length > 0 && (
        <ul className="grid gap-1.5">
          {archivos.map((archivo, indice) => (
            <li
              key={`${archivo.name}-${archivo.size}-${indice}`}
              className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 py-1.5 pr-1 pl-2.5"
            >
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span
                className="min-w-0 flex-1 truncate text-xs"
                title={archivo.name}
              >
                {archivo.name}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {formatearTamano(archivo.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Quitar ${archivo.name}`}
                disabled={deshabilitado}
                onClick={() => quitar(indice)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Receta, incapacidad o constancia. {FORMATOS_EVIDENCIA}, hasta{" "}
        {MAX_ARCHIVOS_EVIDENCIA} archivos de 10 MB cada uno.
      </p>
    </div>
  );
}
