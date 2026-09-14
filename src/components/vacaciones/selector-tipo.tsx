"use client";

import { Check } from "lucide-react";
import {
  colorTipo,
  estiloTipo,
  type PoliticaAusencia,
  type TipoAusencia,
} from "@/lib/ausencias";

/**
 * Línea de ayuda de un tipo, DERIVADA de su política.
 *
 * No hay textos por tipo en ningún sitio: si un admin cambia
 * `politica_ausencias` (o se añade un tipo nuevo), la ayuda cambia sola.
 */
export function pistasDePolitica(
  politica: PoliticaAusencia,
  anticipacionDias: number
): string[] {
  const pistas: string[] = [];
  if (politica.descuenta_vacaciones) pistas.push("Descuenta de tus días");
  if (politica.requiere_evidencia) pistas.push("Requiere comprobante");
  if (politica.permite_retroactivo) {
    pistas.push("Puedes registrarlo con fecha pasada");
  }
  if (politica.aplica_anticipacion) {
    pistas.push(`Se pide con ${anticipacionDias} días de anticipación`);
  }
  if (politica.exige_antiguedad) pistas.push("Requiere un año de antigüedad");
  if (!politica.ausente_del_trabajo) pistas.push("Sigues disponible");
  return pistas;
}

/**
 * Tarjetas de selección del tipo de ausencia (no un `<Select>`): el empleado
 * tiene que ver de un vistazo el color, la etiqueta y qué implica cada tipo.
 *
 * Es un `radiogroup` de verdad, así que las flechas del navegador y los
 * lectores de pantalla lo entienden sin trucos.
 */
export function SelectorTipo({
  politicas,
  valor,
  onCambio,
  anticipacionDias,
  bloqueos,
  deshabilitado = false,
}: {
  politicas: PoliticaAusencia[];
  valor: TipoAusencia | null;
  onCambio: (tipo: TipoAusencia) => void;
  anticipacionDias: number;
  /** Motivo por el que un tipo no se puede elegir, indexado por tipo. */
  bloqueos?: Partial<Record<TipoAusencia, string>>;
  deshabilitado?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de ausencia"
      className="grid min-w-0 gap-2 @md:grid-cols-2"
    >
      {politicas.map((politica) => {
        const bloqueo = bloqueos?.[politica.tipo];
        const activa = politica.tipo === valor;
        const estilo = estiloTipo(politica.color);
        const hex = colorTipo(politica.color);
        const pistas = pistasDePolitica(politica, anticipacionDias);

        return (
          <button
            key={politica.tipo}
            type="button"
            role="radio"
            aria-checked={activa}
            data-tipo={politica.tipo}
            disabled={deshabilitado || Boolean(bloqueo)}
            onClick={() => onCambio(politica.tipo)}
            title={politica.descripcion ?? politica.etiqueta}
            className="flex min-w-0 items-start gap-2.5 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-55"
            style={
              activa
                ? {
                    backgroundColor: estilo.backgroundColor,
                    borderColor: estilo.borderColor,
                    boxShadow: `0 0 0 1.5px ${hex}`,
                  }
                : undefined
            }
          >
            <span
              aria-hidden="true"
              className="mt-1 flex size-3 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: hex }}
            >
              {activa && <Check className="size-2.5 text-white" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-tight font-medium break-words">
                {politica.etiqueta}
              </span>
              <span className="mt-1 block text-xs leading-snug text-muted-foreground break-words">
                {bloqueo ?? pistas.join(" · ")}
              </span>
            </span>
          </button>
        );
      })}
      {politicas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay tipos de ausencia disponibles. Avisa a Recursos Humanos.
        </p>
      )}
    </div>
  );
}
