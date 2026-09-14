import Link from "next/link";
import { CalendarClock, TriangleAlert } from "lucide-react";
import type { NivelAviso } from "@/lib/vacaciones";

/**
 * Aspecto de cada nivel. El área interna arranca en tema oscuro pero el
 * usuario puede cambiarlo, así que cada color lleva su variante `dark:`.
 */
const ESTILO: Record<
  NivelAviso,
  { banda: string; enlace: string; Icono: typeof TriangleAlert }
> = {
  naranja: {
    banda:
      "border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-200",
    enlace:
      "border-orange-500/60 hover:bg-orange-500/25 focus-visible:ring-orange-500/60",
    Icono: CalendarClock,
  },
  rojo: {
    banda: "border-red-500/60 bg-red-500/20 text-red-800 dark:text-red-200",
    enlace:
      "border-red-500/70 hover:bg-red-500/30 focus-visible:ring-red-500/70",
    Icono: TriangleAlert,
  },
};

/**
 * Banda de aviso en movimiento: recuerda que el ciclo de vacaciones está por
 * reiniciarse. Naranja cuando falta poco, roja cuando falta muy poco; los
 * umbrales los decide quien la monta.
 *
 * Tres decisiones que no son cosméticas:
 *
 *  - **El texto que se mueve es `aria-hidden` y está duplicado.** El bucle
 *    necesita dos copias para no dar un salto visible al reiniciarse, y un
 *    lector de pantalla no debería oír el mensaje dos veces. La versión que
 *    se anuncia es el `sr-only` de arriba, estático.
 *  - **El enlace vive FUERA de la marquesina.** Un control que se desplaza no
 *    se puede pulsar con fiabilidad; además la marquesina recorta con
 *    `overflow-hidden` y algo dentro quedaría inalcanzable.
 *  - **`motion-reduce:animate-none`.** Con movimiento reducido la pista se
 *    queda quieta en su primer fotograma, que es el mensaje completo: el
 *    aviso no depende de la animación para leerse.
 */
export function BandaAvisoCiclo({
  nivel,
  mensaje,
}: {
  nivel: NivelAviso;
  /** Frase completa del aviso, ya redactada por quien conoce el balance. */
  mensaje: string;
}) {
  const { banda, enlace, Icono } = ESTILO[nivel];

  return (
    <div
      data-slot="banda-aviso-ciclo"
      data-nivel={nivel}
      // Sin `backdrop-blur`. La banda ya tiene fondo propio, así que el
      // desenfoque no se nota; lo que sí se nota es el coste: WebKit vuelve a
      // muestrear el fondo en CADA fotograma de lo que se mueve encima, y aquí
      // encima corre una marquesina infinita, en TODAS las páginas internas.
      // En un teléfono eso es repintado continuo y batería.
      className={`flex items-center gap-2 border-b px-3 py-1.5 text-xs font-medium sm:gap-3 sm:px-4 ${banda}`}
    >
      <Icono className="size-4 shrink-0" aria-hidden />

      {/* role="status": se anuncia al aparecer sin robar el foco */}
      <p className="sr-only" role="status">
        {mensaje}
      </p>

      {/* `min-w-0` para que el flex-1 pueda encoger de verdad: sin él la pista
          impone su ancho natural y empuja el enlace fuera de la pantalla. */}
      <div className="min-w-0 flex-1 overflow-hidden" aria-hidden>
        {/* `will-change-transform`: le dice a WebKit que promocione la pista a
            su propia capa UNA vez, en lugar de repintar la banda entera en
            cada fotograma de una animación que no para nunca. */}
        <div className="flex w-max animate-[e3-desplazamiento_32s_linear_infinite] will-change-transform motion-reduce:animate-none">
          {/* Dos copias EXACTAS —mensaje + separador— para que un
              `translateX(-50%)` caiga en un fotograma idéntico al inicial. El
              punto no es adorno: en pantallas anchas las dos copias se ven a la
              vez y sin él la frase repetida se lee como una sola, corrida. */}
          {[0, 1].map((copia) => (
            <span
              key={copia}
              className="flex items-center whitespace-nowrap"
            >
              {mensaje}
              <span className="px-8 opacity-60">•</span>
            </span>
          ))}
        </div>
      </div>

      {/*
        `data-tactil="ampliado"`: este enlace es un ítem flex, y por
        especificación un ítem flex se «blockifica» — deja de ser caja de línea
        y SÍ acepta `min-height`. Con el suelo táctil global pasaba de 20 a 44
        px y arrastraba con él a toda la banda, de ~33 a ~57 px, en TODAS las
        páginas del área interna y de forma permanente. Con la marca conserva
        su altura y el área de toque crece por debajo, que es lo que hacía
        falta: la banda es cromo, no contenido.
      */}
      <Link
        href="/vacaciones"
        data-tactil="ampliado"
        className={`shrink-0 rounded-md border px-2 py-0.5 whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:outline-none ${enlace}`}
      >
        Solicitar
      </Link>
    </div>
  );
}
