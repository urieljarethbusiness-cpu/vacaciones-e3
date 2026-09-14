"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, TriangleAlert, Undo2, X } from "lucide-react";
import { guardarPoliticaVacaciones } from "@/server/actions/configuracion";
import {
  diasPorAnio,
  errorDeEscalaVacaciones,
  TRAMO_ANIOS_MAX,
  TRAMO_ANIOS_MIN,
  TRAMO_DIAS_MAX,
  TRAMO_DIAS_MIN,
  type TramoVacaciones,
} from "@/lib/vacaciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Antigüedades de muestra de la vista previa. */
const MUESTRA = [1, 3, 5, 10, 20, 30];

/**
 * Lo que se le dice al usuario en CUALQUIER rechazo, venga de donde venga.
 *
 * Un error que no distingue «no se guardó» de «se borró» provoca un segundo
 * desastre: alguien intentando recuperar lo que nunca perdió. Pasó: la guarda
 * de «la tabla no puede quedarse vacía» dejó a un administrador creyendo que
 * la escala legal se había ido, cuando ni siquiera se había mandado nada.
 */
const NADA_CAMBIADO = "No se ha cambiado nada: la tabla guardada sigue como estaba.";

/**
 * Una fila del BÚFER DE EDICIÓN. No es un tramo todavía.
 *
 * `id` es la identidad de la fila y NO sale de sus datos: es lo único que
 * mantiene vivo el `<input>` mientras se escribe dentro. Los valores son TEXTO
 * porque un campo a medio escribir no es un número: forzar un 0 en cuanto se
 * borra el contenido convierte «voy a cambiar el 16 por un 9» en un tramo
 * inválido y le pone al usuario un 0 en la casilla que acaba de vaciar.
 */
type Fila = { id: string; anios: string; dias: string };

/**
 * El búfer completo, con la clave de la tabla que lo sembró.
 *
 * Va todo junto en un `useState` para que resembrar sea una sola escritura:
 * clave, generación y filas tienen que moverse a la vez o los `id` de una
 * generación se mezclan con los de la siguiente.
 */
type Estado = { clave: string; gen: number; siguiente: number; filas: Fila[] };

/** Huella de una escala, insensible al orden. La usan `sinCambios` y el resembrado. */
function huella(tramos: TramoVacaciones[]): string {
  return [...tramos]
    .sort((a, b) => a.anios - b.anios)
    .map((t) => `${t.anios}:${t.dias}`)
    .join(",");
}

function sembrar(tramos: TramoVacaciones[], gen: number): Estado {
  return {
    clave: huella(tramos),
    gen,
    siguiente: tramos.length,
    filas: tramos.map((t, i) => ({
      id: `g${gen}f${i}`,
      anios: String(t.anios),
      dias: String(t.dias),
    })),
  };
}

/** El texto de una casilla como entero, o null si todavía no lo es. */
function entero(texto: string): number | null {
  const t = texto.trim();
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

type Analisis = {
  /** Los tramos legibles del búfer. Completo solo si `problema` es null. */
  tramos: TramoVacaciones[];
  problema: string | null;
  /** Casillas concretas a señalar: `"<id>:anios"` / `"<id>:dias"`. */
  culpables: Set<string>;
};

/**
 * Qué dice el búfer y por qué no se puede guardar.
 *
 * Las reglas del CONJUNTO no se reescriben aquí: se delegan en
 * `errorDeEscalaVacaciones`, que es el espejo de
 * `app.validar_politica_vacaciones()`. Lo que se añade es lo que la base no
 * puede juzgar porque nunca lo ve: una casilla a medio escribir. Y se devuelve
 * QUÉ casilla, para que el aviso señale la fila y no solo el pie del
 * formulario.
 */
function analizar(filas: Fila[]): Analisis {
  const culpables = new Set<string>();
  const tramos: TramoVacaciones[] = [];
  let problema: string | null = null;

  for (const f of filas) {
    const a = entero(f.anios);
    const d = entero(f.dias);

    if (a === null) {
      culpables.add(`${f.id}:anios`);
      problema ??= "Hay un tramo sin año de antigüedad: escribe el año o quita la fila.";
    } else if (a < TRAMO_ANIOS_MIN || a > TRAMO_ANIOS_MAX) {
      culpables.add(`${f.id}:anios`);
      problema ??= `El año de antigüedad tiene que estar entre ${TRAMO_ANIOS_MIN} y ${TRAMO_ANIOS_MAX} (hay uno con ${a}).`;
    }

    if (d === null) {
      culpables.add(`${f.id}:dias`);
      problema ??= "Hay un tramo sin días: escribe los días o quita la fila.";
    } else if (d < TRAMO_DIAS_MIN || d > TRAMO_DIAS_MAX) {
      culpables.add(`${f.id}:dias`);
      problema ??= `Los días tienen que estar entre ${TRAMO_DIAS_MIN} y ${TRAMO_DIAS_MAX} (hay un tramo con ${d}).`;
    }

    if (a !== null && d !== null) tramos.push({ anios: a, dias: d });
  }

  // Si alguna casilla está a medias, `tramos` es un subconjunto y preguntarle a
  // `errorDeEscalaVacaciones` daría un veredicto sobre una tabla que nadie ha
  // escrito («falta el tramo del año 1» cuando lo que falta es un dígito).
  if (problema !== null) return { tramos, problema, culpables };

  problema = errorDeEscalaVacaciones(tramos);

  // Señalar las casillas de las dos reglas de conjunto que apuntan a una fila.
  const porAnios = new Map<number, string[]>();
  for (const f of filas) {
    const a = entero(f.anios) as number;
    porAnios.set(a, [...(porAnios.get(a) ?? []), f.id]);
  }
  for (const ids of porAnios.values()) {
    if (ids.length > 1) for (const id of ids) culpables.add(`${id}:anios`);
  }

  const orden = [...filas]
    .map((f) => ({ id: f.id, anios: entero(f.anios) as number, dias: entero(f.dias) as number }))
    .sort((x, y) => x.anios - y.anios);
  for (let i = 1; i < orden.length; i++) {
    if (orden[i].dias < orden[i - 1].dias) culpables.add(`${orden[i].id}:dias`);
  }

  return { tramos, problema, culpables };
}

/** "16 tramos, del año 1 (12 días) al año 56 (42 días)" */
function resumirEscala(tramos: TramoVacaciones[]): string {
  const primero = tramos[0];
  const ultimo = tramos[tramos.length - 1];
  const n = `${tramos.length} ${tramos.length === 1 ? "tramo" : "tramos"}`;
  if (tramos.length === 1) return `${n}, el del año ${primero.anios} (${primero.dias} días)`;
  return `${n}, del año ${primero.anios} (${primero.dias} días) al año ${ultimo.anios} (${ultimo.dias} días)`;
}

/**
 * La escala de días de vacaciones por antigüedad (art. 76 LFT), editable.
 *
 * POR QUÉ ES EDITABLE. Los valores de hoy son los de la reforma de «Vacaciones
 * Dignas» (DOF 27-dic-2022), vigentes en 2026, y no hace falta tocarlos. La
 * pantalla existe para el día que la ley cambie: hasta ahora eso obligaba a
 * escribir una migración.
 *
 * CADA FILA ABRE UN TRAMO. `app.dias_por_anio()` toma la mayor `anios` que no
 * supere la antigüedad, así que «6 → 22» significa «de los 6 a los 10 años,
 * 22 días», y el tramo anterior deja de aplicarse desde ahí. La vista previa
 * de abajo lo enseña con la misma aritmética que usa la base, para que nadie
 * tenga que deducirlo.
 *
 * DOS COSAS QUE PARECEN DETALLE Y SON LA PANTALLA ENTERA:
 *
 *  1. **La identidad de una fila no puede salir de sus datos.** La versión
 *     anterior usaba `key={anios-indice}` y ordenaba la lista en cada pulsación.
 *     Consecuencia medida: al teclear en la casilla del AÑO, la clave cambiaba,
 *     React desmontaba el `<input>` y montaba otro, y el foco se iba al `body`.
 *     La casilla quedaba muerta tras la PRIMERA tecla — borrar «16» dejaba un
 *     «1» y las teclas siguientes no llegaban a ninguna parte —, y la fila
 *     saltaba de sitio porque la lista se reordenaba sola. Quien se topa con un
 *     campo que no responde termina borrando filas con la ✗ para volver a
 *     escribirlas, y ahí es donde se vacía la tabla. Por eso el `id` es opaco y
 *     el orden en pantalla NO se recalcula mientras se escribe: se resiembra
 *     desde la base cuando la base cambia, y nada más.
 *  2. **Rechazar no es borrar, y hay que decirlo.** La guarda de coherencia
 *     hizo su trabajo, pero el mensaje «la tabla no puede quedarse vacía» dejó
 *     a un administrador creyendo que había perdido la escala legal. Lo que
 *     está en vigor se enseña SIEMPRE, salga de donde salga el rechazo, y hay
 *     un botón para volver a ello sin recargar.
 *
 * Patrón del repo: useState + llamada directa a la server action + sonner +
 * router.refresh(). Sin `useActionState` ni react-hook-form.
 */
export function TablaPoliticaVacaciones({
  inicial,
}: {
  inicial: TramoVacaciones[];
}) {
  const router = useRouter();
  const idTabla = useId();

  // Lo que la BASE tiene ahora mismo. Es la referencia contra la que se afirma
  // «no se ha cambiado nada», y se pinta aunque el búfer esté hecho un lío.
  const enVigor = useMemo(
    () => [...inicial].sort((a, b) => a.anios - b.anios),
    [inicial]
  );
  const claveVigente = useMemo(() => huella(enVigor), [enVigor]);

  const [estado, setEstado] = useState<Estado>(() => sembrar(enVigor, 0));
  const [guardando, setGuardando] = useState(false);

  // Resembrar cuando la escala cambia bajo los pies (otro administrador, o el
  // refresco de después de guardar). Es el patrón de React para ajustar estado
  // a props sin un `useEffect` que pinte dos veces. Guardar el búfer viejo
  // sería peor que perderlo: al siguiente «Guardar» reescribiría encima del
  // cambio ajeno sin que nadie lo hubiera visto.
  if (estado.clave !== claveVigente) {
    setEstado(sembrar(enVigor, estado.gen + 1));
  }

  const filas = estado.filas;
  const analisis = useMemo(() => analizar(filas), [filas]);
  const sinCambios = huella(analisis.tramos) === claveVigente && analisis.problema === null;

  // La base NO permite una escala vacía (`trg_politica_vacaciones_coherente`),
  // así que cero filas leídas no significa «está vacía»: significa que no se
  // pudo leer. Distinguirlo importa, porque tratar lo segundo como lo primero
  // es exactamente cómo un fallo de lectura se convierte en un borrado.
  const noLegible = inicial.length === 0;

  function editar(id: string, campo: "anios" | "dias", valor: string) {
    setEstado((p) => ({
      ...p,
      filas: p.filas.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)),
    }));
  }

  function quitar(id: string) {
    setEstado((p) =>
      // La última fila no se quita: la tabla no puede quedarse vacía, y es
      // mejor no dejar construir el estado que rechazarlo después.
      p.filas.length <= 1 ? p : { ...p, filas: p.filas.filter((f) => f.id !== id) }
    );
  }

  function agregar() {
    setEstado((p) => {
      const leidas = p.filas
        .map((f) => ({ anios: entero(f.anios), dias: entero(f.dias) }))
        .filter((t): t is TramoVacaciones => t.anios !== null && t.dias !== null)
        .sort((a, b) => a.anios - b.anios);
      const ultimo = leidas[leidas.length - 1];
      return {
        ...p,
        siguiente: p.siguiente + 1,
        filas: [
          ...p.filas,
          {
            id: `g${p.gen}f${p.siguiente}`,
            anios: String(
              ultimo ? Math.min(ultimo.anios + 5, TRAMO_ANIOS_MAX) : TRAMO_ANIOS_MIN
            ),
            dias: String(ultimo ? Math.min(ultimo.dias + 2, TRAMO_DIAS_MAX) : 12),
          },
        ],
      };
    });
  }

  function descartar() {
    setEstado(sembrar(enVigor, estado.gen + 1));
    toast.info("Se han descartado tus cambios. La tabla vuelve a ser la guardada.");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (analisis.problema) {
      toast.error(analisis.problema, { description: NADA_CAMBIADO });
      return;
    }
    setGuardando(true);
    const r = await guardarPoliticaVacaciones({
      tramos: [...analisis.tramos].sort((a, b) => a.anios - b.anios),
    });
    setGuardando(false);
    if (!r.ok) {
      // El rechazo puede venir de zod, de la RPC o del trigger. Los tres
      // significan lo mismo para quien mira la pantalla: la transacción no
      // llegó a existir y en la base sigue lo de antes.
      toast.error(r.error, { description: NADA_CAMBIADO });
      return;
    }
    toast.success(
      `Tabla guardada: ${r.tramos} ${r.tramos === 1 ? "tramo" : "tramos"}.`
    );
    // No es un aviso decorativo: el saldo no está guardado en ninguna parte, se
    // recalcula al leerlo, así que bajar un tramo puede dejar a alguien con más
    // días disfrutados que concedidos.
    if (r.afectados > 0) {
      toast.warning(
        `${r.afectados} ${
          r.afectados === 1 ? "persona ya disfrutó" : "personas ya disfrutaron"
        } más días de los que concede la tabla nueva en su periodo en curso. No se les quita nada, pero no podrán pedir más hasta su aniversario.`
      );
    }
    router.refresh();
  }

  if (noLegible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Días de vacaciones por antigüedad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            role="alert"
            data-aviso-escala="ilegible"
            className="flex min-w-0 items-start gap-1.5 text-sm break-words text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              <strong>No se ha podido leer la tabla guardada.</strong> No es que
              esté vacía: la base no permite que lo esté, así que la escala legal
              sigue donde estaba. Recarga la página; si vuelve a salir esto, es
              un problema de permisos de lectura y no hay que tocar nada aquí.
            </span>
          </p>
        </CardContent>
      </Card>
    );
  }

  const resumenVigente = resumirEscala(enVigor);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Días de vacaciones por antigüedad
        </CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <p className="text-xs text-muted-foreground">
          Son los días hábiles del art. 76 de la Ley Federal del Trabajo. Cada
          fila <strong>abre un tramo</strong>: «6 años → 22 días» quiere decir
          que de los 6 años en adelante corresponden 22, hasta el tramo
          siguiente. Los valores cargados son los de la reforma de 2023 y solo
          hay que tocarlos si cambia la ley.
        </p>

        <form onSubmit={guardar} className="grid min-w-0 gap-3">
          {/* Grid y no `<table>`: a 320 px una tabla de tres columnas con dos
              campos numéricos se desborda, y `overflow-x` escondería el botón
              de quitar. Aquí las dos columnas se reparten el ancho disponible
              y el botón conserva su objetivo táctil. */}
          <div
            className="grid min-w-0 gap-2"
            role="group"
            aria-labelledby={`${idTabla}-titulo`}
          >
            <p id={`${idTabla}-titulo`} className="sr-only">
              Tramos de la escala de vacaciones
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 text-xs text-muted-foreground">
              <span>Desde el año</span>
              <span>Días hábiles</span>
              <span className="w-9" aria-hidden />
            </div>

            {filas.map((fila) => {
              const ultima = filas.length <= 1;
              return (
                <div
                  key={fila.id}
                  data-tramo={fila.anios}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2"
                >
                  <Label className="sr-only" htmlFor={`${idTabla}-a-${fila.id}`}>
                    Años de antigüedad del tramo
                  </Label>
                  <Input
                    id={`${idTabla}-a-${fila.id}`}
                    type="number"
                    inputMode="numeric"
                    min={TRAMO_ANIOS_MIN}
                    max={TRAMO_ANIOS_MAX}
                    className="min-w-0"
                    // `|| undefined` y no el booleano a secas: así la casilla
                    // sana no lleva `aria-invalid="false"` y el selector de
                    // Tailwind (`[aria-invalid="true"]`) no depende de matices.
                    aria-invalid={analisis.culpables.has(`${fila.id}:anios`) || undefined}
                    value={fila.anios}
                    onChange={(e) => editar(fila.id, "anios", e.target.value)}
                  />
                  <Label className="sr-only" htmlFor={`${idTabla}-d-${fila.id}`}>
                    Días del tramo
                  </Label>
                  <Input
                    id={`${idTabla}-d-${fila.id}`}
                    type="number"
                    inputMode="numeric"
                    min={TRAMO_DIAS_MIN}
                    max={TRAMO_DIAS_MAX}
                    className="min-w-0"
                    aria-invalid={analisis.culpables.has(`${fila.id}:dias`) || undefined}
                    value={fila.dias}
                    onChange={(e) => editar(fila.id, "dias", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={ultima}
                    aria-label={
                      ultima
                        ? "No se puede quitar el único tramo que queda: la tabla no puede quedarse vacía"
                        : `Quitar el tramo del año ${fila.anios}`
                    }
                    onClick={() => quitar(fila.id)}
                  >
                    <X />
                  </Button>
                </div>
              );
            })}
          </div>

          <div>
            <Button type="button" variant="outline" size="sm" onClick={agregar}>
              <Plus />
              Añadir tramo
            </Button>
          </div>

          <VistaPrevia tramos={analisis.tramos} />

          {analisis.problema && (
            <div
              role="alert"
              data-aviso-escala="incoherente"
              className="grid min-w-0 gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3"
            >
              <p className="flex min-w-0 items-start gap-1.5 text-sm font-medium break-words text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{analisis.problema}</span>
              </p>
              {/* La frase que faltaba. Sin ella, la guarda de coherencia se lee
                  como un parte de daños. */}
              <p className="min-w-0 pl-[1.375rem] text-xs break-words text-muted-foreground">
                <strong>{NADA_CAMBIADO}</strong> Sigue en vigor la escala de{" "}
                {resumenVigente}. Corrige lo de arriba o pulsa «Descartar
                cambios» para volver a ella.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Los saldos no están guardados: se calculan con esta tabla cada vez
            que alguien los consulta, así que un cambio se aplica también a los
            periodos que ya corren. Lo ya disfrutado no se toca.
          </p>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button type="submit" disabled={guardando || !!analisis.problema || sinCambios}>
              {guardando ? "Guardando…" : "Guardar tabla"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={guardando || sinCambios}
              onClick={descartar}
            >
              <Undo2 />
              Descartar cambios
            </Button>
          </div>

          {/* Lo que hay en la base, siempre a la vista. Es la respuesta a la
              única pregunta que se hace quien acaba de ver un error rojo. */}
          <p
            data-escala-vigente={enVigor.length}
            className="min-w-0 text-xs break-words text-muted-foreground"
          >
            {sinCambios
              ? `Guardada y en vigor: ${resumenVigente}.`
              : `Tienes cambios sin guardar. En vigor sigue estando: ${resumenVigente}.`}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Qué le tocaría a alguien con N años, con la escala tal como está en pantalla.
 *
 * Es la misma regla que `app.dias_por_anio()`: sin esto, «6 → 22» y «11 → 24»
 * obligan a deducir a mano qué pasa a los 8 años, que es justo donde se cuela
 * un tramo mal puesto.
 */
function VistaPrevia({ tramos }: { tramos: TramoVacaciones[] }) {
  return (
    <div className="grid min-w-0 gap-1.5 rounded-md border p-3">
      <p className="text-xs font-medium">Con esta tabla</p>
      <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {MUESTRA.map((anios) => (
          <li key={anios} data-muestra={anios}>
            {anios} {anios === 1 ? "año" : "años"}:{" "}
            <strong className="text-foreground">
              {diasPorAnio(tramos, anios)}
            </strong>{" "}
            días
          </li>
        ))}
      </ul>
    </div>
  );
}
