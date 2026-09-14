/**
 * Ciclos de vacaciones: contrato y reglas puras.
 *
 * Espejo en TypeScript de `public.mis_ciclos_vacaciones()` (migración 0041).
 * Sin `server-only` a propósito, igual que `src/lib/ausencias.ts`: lo usan la
 * página, la banda del header y el formulario cliente. Todo lo de aquí es
 * puro; quien decide de verdad es Postgres.
 *
 * EL CICLO ES ANIVERSARIO → ANIVERSARIO, no año calendario. Quien entró el 26
 * de agosto de 2024 corre, el 9 de agosto de 2026, el ciclo
 * 26-ago-2025 → 25-ago-2026, y su ciclo SIGUIENTE es 26-ago-2026 → 25-ago-2027.
 * Una solicitud se cobra al ciclo que contiene su `fecha_inicio`, así que unos
 * días en octubre de 2026 salen del ciclo siguiente aunque se pidan en enero.
 */

import { fechaDesdeISO, formatearFechaCorta } from "@/lib/ausencias";

/**
 * Fila de `public.mis_ciclos_vacaciones(p_ciclos)`.
 *
 * `indice` 0 es el ciclo en curso, 1 el siguiente. `dias_para_expirar` se mide
 * SIEMPRE contra hoy (la RPC lo recalcula), no contra el inicio del ciclo: por
 * eso el del ciclo siguiente es mayor que 365 y no un 364 fijo.
 */
export type CicloVacaciones = {
  indice: number;
  anios: number;
  ciclo_inicio: string;
  ciclo_fin: string;
  dias_correspondientes: number;
  dias_usados: number;
  dias_restantes: number;
  dias_para_expirar: number;
};

/** Cuántos ciclos pide la app. La RPC lo topa en 3; el negocio usa 2. */
export const CICLOS_VISIBLES = 2;

// ---------------------------------------------------------------------------
// La escala del art. 76 LFT (tabla `public.politica_vacaciones`)
// ---------------------------------------------------------------------------

/**
 * Un tramo de la escala: «a partir de `anios` cumplidos, `dias` hábiles».
 *
 * `app.dias_por_anio()` toma la mayor `anios` que no supere la antigüedad, así
 * que cada fila ABRE un tramo y el anterior deja de aplicarse desde ahí.
 */
export type TramoVacaciones = {
  anios: number;
  dias: number;
};

/** Cotas de una fila suelta. Espejo de los `check` de la migración 0064. */
export const TRAMO_ANIOS_MIN = 1;
export const TRAMO_ANIOS_MAX = 99;
export const TRAMO_DIAS_MIN = 1;
export const TRAMO_DIAS_MAX = 365;

/**
 * Por qué esta escala no se puede guardar, o null si está bien.
 *
 * Es el espejo en TypeScript de `app.validar_politica_vacaciones()`: existe
 * para que el error se vea antes de mandar nada, no para decidir. Quien decide
 * es el trigger, que corre aunque alguien escriba por la API.
 */
export function errorDeEscalaVacaciones(
  tramos: TramoVacaciones[]
): string | null {
  if (tramos.length === 0) {
    return "La tabla no puede quedarse vacía: sin tramos nadie acumula un solo día.";
  }
  for (const t of tramos) {
    if (!Number.isInteger(t.anios) || !Number.isInteger(t.dias)) {
      return "Cada tramo necesita un año y unos días, los dos en números enteros.";
    }
    if (t.anios < TRAMO_ANIOS_MIN || t.anios > TRAMO_ANIOS_MAX) {
      return `El año de antigüedad tiene que estar entre ${TRAMO_ANIOS_MIN} y ${TRAMO_ANIOS_MAX} (hay uno con ${t.anios}).`;
    }
    if (t.dias < TRAMO_DIAS_MIN || t.dias > TRAMO_DIAS_MAX) {
      return `Los días tienen que estar entre ${TRAMO_DIAS_MIN} y ${TRAMO_DIAS_MAX} (hay un tramo con ${t.dias}).`;
    }
  }

  const ordenados = [...tramos].sort((a, b) => a.anios - b.anios);

  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].anios === ordenados[i - 1].anios) {
      return `El año ${ordenados[i].anios} está repetido. Cada tramo empieza en un año distinto.`;
    }
  }

  if (ordenados[0].anios !== 1) {
    return `Falta el tramo del año 1 (el primero es el año ${ordenados[0].anios}). Sin él, quien cumple su primer año se queda con 0 días.`;
  }

  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].dias < ordenados[i - 1].dias) {
      return `La escala no puede decrecer: al año ${ordenados[i].anios} le pones ${ordenados[i].dias} días y el tramo anterior daba ${ordenados[i - 1].dias}.`;
    }
  }

  return null;
}

/** Días que corresponden a `anios` cumplidos. Espejo de `app.dias_por_anio()`. */
export function diasPorAnio(tramos: TramoVacaciones[], anios: number): number {
  let dias = 0;
  for (const t of [...tramos].sort((a, b) => a.anios - b.anios)) {
    if (t.anios <= anios) dias = t.dias;
  }
  return dias;
}

// ---------------------------------------------------------------------------
// Aviso de reinicio de ciclo
// ---------------------------------------------------------------------------

/** Valores por defecto de `aviso_ciclo_naranja` / `aviso_ciclo_rojo`. */
export const AVISO_CICLO_NARANJA = 60;
export const AVISO_CICLO_ROJO = 30;

export type NivelAviso = "naranja" | "rojo";

/**
 * Nivel de la banda de aviso, o null si aún no toca avisar.
 *
 * Los umbrales son ESTRICTOS ("faltan menos de 60 días"), así que con
 * exactamente 60 días todavía no se avisa. Un ciclo ya vencido
 * (`diasParaExpirar` negativo, que solo puede verse si la ficha cambió
 * mientras la página estaba abierta) cuenta como rojo, no como «sin aviso».
 */
export function nivelAvisoCiclo(
  diasParaExpirar: number,
  umbralNaranja: number = AVISO_CICLO_NARANJA,
  umbralRojo: number = AVISO_CICLO_ROJO
): NivelAviso | null {
  if (diasParaExpirar < umbralRojo) return "rojo";
  if (diasParaExpirar < umbralNaranja) return "naranja";
  return null;
}

// ---------------------------------------------------------------------------
// Ubicar una fecha en su ciclo
// ---------------------------------------------------------------------------

/**
 * Ciclo al que se cobraría una solicitud que EMPIEZA en `iso`.
 *
 * Mismo criterio que `app.validar_solicitud_vacaciones`: manda la fecha de
 * inicio, no la de fin. Devuelve undefined si la fecha cae fuera de los ciclos
 * cargados (antes del actual o más allá del último), que es justo lo que la UI
 * necesita distinguir para no prometer un saldo que no existe.
 */
export function cicloDeFecha(
  ciclos: CicloVacaciones[],
  iso: string
): CicloVacaciones | undefined {
  return ciclos.find((c) => iso >= c.ciclo_inicio && iso <= c.ciclo_fin);
}

/** Último día que la ventana de solicitud alcanza, o "" si no hay ciclos. */
export function topeSolicitud(ciclos: CicloVacaciones[]): string {
  return ciclos.length === 0 ? "" : ciclos[ciclos.length - 1].ciclo_fin;
}

/**
 * Día siguiente a un ISO, en ISO.
 *
 * Se usa para nombrar el aniversario: el ciclo termina la víspera, así que la
 * fecha que el empleado reconoce como «su aniversario» es `ciclo_fin + 1`.
 * Pasa por `fechaDesdeISO` a propósito (fecha LOCAL): sumar 24 h sobre un
 * `Date` construido en UTC se lleva un día de más en México.
 */
export function diaSiguienteISO(iso: string): string {
  const d = fechaDesdeISO(iso);
  d.setDate(d.getDate() + 1);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** "26 ago 2025 – 25 ago 2026" */
export function etiquetaCiclo(ciclo: CicloVacaciones): string {
  return `${formatearFechaCorta(ciclo.ciclo_inicio)} – ${formatearFechaCorta(
    ciclo.ciclo_fin
  )}`;
}

/**
 * "tu año en curso" / "tu próximo año" / "tu año 2028-2029".
 *
 * Sin la palabra «ciclo», que es vocabulario de RR. HH.: lo que la persona
 * entiende es su año de vacaciones, de aniversario a aniversario.
 */
export function nombreCiclo(ciclo: CicloVacaciones): string {
  if (ciclo.indice === 0) return "tu año en curso";
  if (ciclo.indice === 1) return "tu próximo año";
  return `tu año ${fechaDesdeISO(ciclo.ciclo_inicio).getFullYear()}-${fechaDesdeISO(
    ciclo.ciclo_fin
  ).getFullYear()}`;
}
