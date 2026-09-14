import { CalendarCheck, CalendarDays, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatearFechaCorta } from "@/lib/ausencias";

export type Balance = {
  anios: number;
  ciclo_inicio: string;
  ciclo_fin: string;
  dias_correspondientes: number;
  dias_usados: number;
  dias_restantes: number;
  dias_para_expirar: number;
};

/**
 * El primero es el que contesta la pregunta con la que se entra a la pantalla
 * («¿cuántos días me quedan?»), así que va primero y no en el hueco de la
 * derecha. Las etiquetas evitan la jerga: «Días del año» no eran los del año
 * natural sino los del ciclo aniversario, y «reservados» no le decía a nadie
 * que se refería a lo pedido y aún sin aprobar.
 */
const BLOQUES = [
  {
    etiqueta: "Disponibles",
    Icono: Clock,
    valor: (b: Balance) => b.dias_restantes,
    acento: "border-l-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    numero: "text-emerald-600 dark:text-emerald-400",
  },
  {
    etiqueta: "Usados o ya pedidos",
    Icono: CalendarCheck,
    valor: (b: Balance) => b.dias_usados,
    acento: "border-l-amber-500",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    numero: "text-amber-600 dark:text-amber-400",
  },
  {
    etiqueta: "Te tocan este año",
    Icono: CalendarDays,
    valor: (b: Balance) => b.dias_correspondientes,
    acento: "border-l-sky-500",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    numero: "text-sky-600 dark:text-sky-400",
  },
];

/**
 * Balance del ciclo con semáforo de expiración:
 * verde > umbralNaranja días, naranja ≤ umbralNaranja, rojo ≤ umbralRojo.
 * Solo alerta si quedan días sin usar.
 */
export function TarjetaBalance({
  balance,
  umbralNaranja,
  umbralRojo,
  compacta = false,
  proximoCiclo = false,
}: {
  balance: Balance;
  umbralNaranja: number;
  umbralRojo: number;
  /** Filas apiladas en lugar de 3 columnas; para columnas angostas. */
  compacta?: boolean;
  /**
   * El ciclo aún no ha empezado: es el SIGUIENTE al que corre hoy.
   *
   * Cambia el encabezado y calla el semáforo. No es cosmética: «2 años de
   * antigüedad cumplidos» sería falso para un ciclo que empieza el día del
   * aniversario, y una alerta de expiración sobre un ciclo que todavía no
   * arranca no significa nada (le faltan más de 365 días por definición).
   */
  proximoCiclo?: boolean;
}) {
  const hayPendientes = balance.dias_restantes > 0;
  const porExpirar = balance.dias_para_expirar;

  let alerta: { color: string; texto: string } | null = null;
  if (!proximoCiclo && hayPendientes && balance.dias_correspondientes > 0) {
    // Colores con opacidad, no el tono 50 sólido: el área interna se sirve en
    // tema oscuro y `bg-red-50` era un bloque casi blanco sobre fondo negro.
    if (porExpirar <= umbralRojo) {
      alerta = {
        color:
          "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300",
        texto: `Últimos ${porExpirar} días para usar tus ${balance.dias_restantes} días. El ${formatearFechaCorta(balance.ciclo_fin)} se reinicia tu año y los pierdes.`,
      };
    } else if (porExpirar <= umbralNaranja) {
      alerta = {
        color:
          "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
        texto: `Se reinician en ${porExpirar} días y todavía tienes ${balance.dias_restantes} sin usar. Después del ${formatearFechaCorta(balance.ciclo_fin)} empiezas de cero.`,
      };
    }
  }

  return (
    <Card>
      <CardHeader>
        {/* «Ciclo» es vocabulario de RR. HH.: lo que la persona entiende es
            «su año de vacaciones», que va de aniversario a aniversario. */}
        <CardTitle>
          {proximoCiclo
            ? "Próximo año de vacaciones"
            : "Año de vacaciones en curso"}{" "}
          ({formatearFechaCorta(balance.ciclo_inicio)} →{" "}
          {formatearFechaCorta(balance.ciclo_fin)})
        </CardTitle>
        <CardDescription>
          {proximoCiclo ? (
            <>
              Empieza el {formatearFechaCorta(balance.ciclo_inicio)}, al
              cumplir {balance.anios} {balance.anios === 1 ? "año" : "años"}.
              Estos días ya se pueden apartar desde hoy: salen de aquí, no de
              los del año en curso.
            </>
          ) : (
            <>
              {balance.anios < 1
                ? "Primer año en curso"
                : `${balance.anios} ${balance.anios === 1 ? "año" : "años"} de antigüedad cumplidos`}
              . Solo las vacaciones descuentan de este saldo; los permisos y el
              trabajo remoto se cuentan aparte.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="@container space-y-4">
        {/*
          UNA sola forma que se adapta, en vez de dos ramas.

          El bloque ancho pedía `@lg` (32 rem DE CONTENEDOR) para ponerse en
          tres columnas, y en un móvil de 390 px el contenedor mide ~326: la
          condición no se cumplía nunca, así que siempre caían apilados. Medido
          en `/vacaciones`: entre las dos tarjetas de saldo había **1 325 px
          antes de llegar al formulario** —4,5 pantallas de scroll para pedir
          unas vacaciones, 7,5 en un móvil de 320—. Y el dato ya estaba dicho
          en el subtítulo de la página («Te quedan 14 días · se reinician el…»).

          Ese arreglo bajó el umbral a `@xs` y ahí nació el defecto que este
          cambio corrige: **`@xs` son 20 rem = 320 px de CONTENEDOR, y tres
          columnas no caben en 320 px.** La consulta de contenedor se cumplía
          —el contenedor sí existe y sí mide más de 320—, así que las variantes
          se aplicaban CUANDO NO TOCABA. No era un `@container` ausente ni un
          `min-w-0` que faltara: `min-w-0` ya estaba puesto y no sirve de nada
          cuando la anchura mínima la fija una palabra que no se puede partir.

          MEDIDO en `/vacaciones` con la sesión de `empleado1`, antes:

            viewport 390 → contenedor 358, rejilla 326 en 3 columnas de 98 px
              «Disponibles»         scrollWidth 141 vs clientWidth  93 → +48 px
              «Usados o ya pedidos» scrollWidth 116 vs clientWidth  93 → +23 px
              «Te tocan este año»   scrollWidth 108 vs clientWidth  93 → +15 px
            viewport 430 → +35 / +10 / +2 px
            viewport 1280 → +38 / +13 / +5 px   (¡también en escritorio!)
            viewport 1440 → +17 /   0 /  0 px

          Solo 768 salía limpio, porque ahí la tarjeta ocupa el ancho entero
          (rejilla de 688 px). El reporte hablaba de móvil, pero el mismo
          bloque se salía en un portátil de 1280.

          POR QUÉ EL UMBRAL ES `@xl` Y NO OTRO. La anchura mínima de un bloque
          es la de su contenido irreductible: icono 36 + hueco 12 + la palabra
          más larga de la etiqueta (~88 px con «Disponibles» a 16 px) + 32 de
          relleno + 5 de bordes = **173 px**. Tres bloques y dos huecos de 16
          piden **551 px de rejilla**. `@lg` (512) se queda 39 px corto y `@md`
          (448) mucho más; el primer tamaño con nombre que da margen es `@xl`
          (36 rem = 576 px). Un `@min-[551px]` clavaría el número de hoy y se
          rompería con el primer rótulo más largo.

          Y no se resuelve encogiendo: el suelo de 16 px de esta plataforma no
          se baja para que quepa un mosaico. Cuando no cabe, se reordena —que
          es exactamente lo que hace la fila compacta—.
        */}
        {/* `data-slot` para que el verificador mida ESTAS cajas y no «el div
            que lleva border-l-4», que es una clase y se mueve con el diseño. */}
        <div
          data-slot="rejilla-saldo"
          className={compacta ? "grid gap-3" : "grid gap-3 @xl:grid-cols-3 @xl:gap-4"}
        >
          {BLOQUES.map((b) => (
            <div
              key={b.etiqueta}
              data-slot="bloque-saldo"
              data-bloque={b.etiqueta}
              className={`flex items-center justify-between gap-3 rounded-lg border border-l-4 px-4 py-3 ${
                compacta ? "" : "@xl:flex-col @xl:items-start @xl:justify-start @xl:gap-0 @xl:p-4"
              } ${b.acento}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                {/* `shrink-0`: el `min-w-0` del padre deja encoger a los hijos,
                    y un icono aplastado a 11 px es peor que uno que no cabe. */}
                <span className={`shrink-0 rounded-md p-2 ${b.chip}`}>
                  <b.Icono className="size-5" />
                </span>
                {/*
                  16 px y caja baja. Estaba en `text-xs` (12 px medidos) con
                  `uppercase tracking-wide`, y las dos cosas iban en contra de
                  quien lee esto: 12 px está por debajo del suelo de la casa
                  para +50, y la caja alta con interletraje ancha la etiqueta un
                  35 % —«Disponibles» pasa de 88 a 103 px— sin que se lea mejor.
                  Subir el tamaño y quitar la caja alta sale casi a cero en
                  anchura y sí se lee.
                */}
                <p className="text-base font-medium text-muted-foreground">
                  {b.etiqueta}
                </p>
              </div>
              <p
                className={`shrink-0 text-2xl font-semibold ${
                  compacta ? "" : "@xl:mt-2 @xl:text-3xl"
                } ${b.numero}`}
              >
                {b.valor(balance)}
              </p>
            </div>
          ))}
        </div>
        {/* También a 16 px: es el aviso de «vas a perder tus días», el texto
            más importante de la tarjeta, y estaba en 14 px, por debajo de las
            etiquetas a las que acompaña. Es una banda de ancho completo con
            texto que envuelve, así que crece de alto y nunca de ancho. */}
        {alerta && (
          <div className={`rounded-md border p-3 text-base font-medium ${alerta.color}`}>
            {alerta.texto}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
