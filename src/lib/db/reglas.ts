/**
 * Reglas puras del módulo de vacaciones.
 *
 * Espejo en TypeScript de los triggers de E3 Manager (`app.validar_solicitud_
 * vacaciones` de la migración 0035, `app.balance_vacaciones`, `app.ciclo_
 * actual`, `app.dias_por_anio`, `app.dias_habiles`). En el original quien
 * decide de verdad es Postgres; aquí estas funciones son quien decide, así
 * que las consume la acción de servidor, el formulario y los scripts de
 * verificación. TODO lo de aquí es puro: entra datos, sale datos, sin BD.
 *
 * EL CICLO ES ANIVERSARIO → ANIVERSARIO, no año calendario. Una solicitud se
 * cobra al ciclo que contiene su `fecha_inicio`.
 *
 * Las fechas viajan como ISO 'AAAA-MM-DD' y se comparan como texto (el orden
 * lexicográfico de ISO es el cronológico). Los cálculos de días pasan por
 * Date LOCAL — sumar 24 h sobre un Date en UTC se lleva un día en México.
 */

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

export function fechaDesdeISO(iso: string): Date {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(anio, (mes ?? 1) - 1, dia ?? 1);
}

export function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function isoDe(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Día siguiente a un ISO, en ISO (fecha LOCAL a propósito). */
export function diaSiguienteISO(iso: string): string {
  const d = fechaDesdeISO(iso);
  d.setDate(d.getDate() + 1);
  return isoDe(d);
}

// ---------------------------------------------------------------------------
// Ciclos y escala LFT
// ---------------------------------------------------------------------------

export type TramoVacaciones = { anios: number; dias: number };

export type Ciclo = {
  anios: number;
  ciclo_inicio: string;
  ciclo_fin: string;
};

/** Espejo de `app.ciclo_actual`: el ciclo de aniversario que vive `referencia`. */
export function cicloActual(
  fechaIngreso: string,
  referencia: string
): Ciclo | null {
  const ingreso = fechaDesdeISO(fechaIngreso);
  const ref = fechaDesdeISO(referencia);
  if (ref < ingreso) return null;
  // Años CUMPLIDOS a la fecha de referencia
  let anios = ref.getFullYear() - ingreso.getFullYear();
  const aniv = new Date(ingreso);
  aniv.setFullYear(ingreso.getFullYear() + anios);
  if (aniv > ref) {
    anios -= 1;
  }
  const inicio = new Date(ingreso);
  inicio.setFullYear(ingreso.getFullYear() + anios);
  const fin = new Date(ingreso);
  fin.setFullYear(ingreso.getFullYear() + anios + 1);
  fin.setDate(fin.getDate() - 1);
  return { anios, ciclo_inicio: isoDe(inicio), ciclo_fin: isoDe(fin) };
}

/**
 * Días que corresponden a `anios` cumplidos. Espejo de `app.dias_por_anio`:
 * el mayor tramo cuyo `anios` no supere la antigüedad; 0 si ninguno.
 */
export function diasPorAnio(tramos: TramoVacaciones[], anios: number): number {
  let dias = 0;
  for (const t of [...tramos].sort((a, b) => a.anios - b.anios)) {
    if (t.anios <= anios) dias = t.dias;
  }
  return dias;
}

// ---------------------------------------------------------------------------
// Días hábiles
// ---------------------------------------------------------------------------

/**
 * Espejo de `app.dias_habiles`: cuenta días del rango (INCLUSIVE) que no sean
 * sábado, domingo ni una fecha de `festivos`. Rango invertido → 0.
 */
export function diasHabiles(
  festivos: Set<string>,
  inicio: string,
  fin: string
): number {
  if (!inicio || !fin || fin < inicio) return 0;
  let n = 0;
  const d = fechaDesdeISO(inicio);
  const hasta = fechaDesdeISO(fin);
  while (d <= hasta) {
    const iso = isoDe(d);
    const diaSemana = d.getDay(); // 0 domingo … 6 sábado
    if (diaSemana !== 0 && diaSemana !== 6 && !festivos.has(iso)) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Balance de un ciclo
// ---------------------------------------------------------------------------

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
 * Balance del ciclo que vive `referencia`.
 *
 * `usados` suma dias_habiles de solicitudes PENDIENTES y APROBADAS que
 * descuentan y cuya fecha_inicio cae dentro del ciclo (los pendientes
 * reservan saldo, igual que en el original). `dias_para_expirar` SIEMPRE se
 * mide contra hoy.
 */
export function balanceDeCiclo(params: {
  fechaIngreso: string;
  referencia: string;
  hoy: string;
  tramos: TramoVacaciones[];
  usados: number;
}): Balance | null {
  const ciclo = cicloActual(params.fechaIngreso, params.referencia);
  if (!ciclo) return null;
  const correspondientes =
    ciclo.anios < 1 ? 0 : diasPorAnio(params.tramos, ciclo.anios);
  const restantes = Math.max(correspondientes - params.usados, 0);
  return {
    anios: ciclo.anios,
    ciclo_inicio: ciclo.ciclo_inicio,
    ciclo_fin: ciclo.ciclo_fin,
    dias_correspondientes: correspondientes,
    dias_usados: params.usados,
    dias_restantes: restantes,
    dias_para_expirar:
      (fechaDesdeISO(ciclo.ciclo_fin).getTime() -
        fechaDesdeISO(params.hoy).getTime()) /
      86_400_000,
  };
}

// ---------------------------------------------------------------------------
// Validación de una solicitud (espejo del trigger final, migración 0035)
// ---------------------------------------------------------------------------

export type PoliticaAusenciaReglas = {
  tipo: string;
  etiqueta: string;
  descuenta_vacaciones: boolean;
  requiere_evidencia: boolean;
  permite_retroactivo: boolean;
  exige_antiguedad: boolean;
  aplica_anticipacion: boolean;
  solo_gestor: boolean;
  activo: boolean;
};

export type ContextoValidacion = {
  hoy: string;
  /** Escala LFT vigente. */
  tramos: TramoVacaciones[];
  /** Festivos en ISO. */
  festivos: Set<string>;
  /** Política del tipo que se registra. */
  politica: PoliticaAusenciaReglas;
  /** ¿Quien opera tiene `gestion.vacaciones`? (RR. HH. queda exento de cupos) */
  esGestor: boolean;
  /** Antigüedad del empleado o null si no tiene ficha activa. */
  fechaIngreso: string | null;
  /** ¿El empleado conserva el permiso `vacaciones`? */
  tieneVacaciones: boolean;
  /** Ajuste `anticipacion_minima_dias` (14 por defecto). */
  anticipacionDias: number;
  /**
   * Solicitudes ACTIVAS (pendiente/aprobada) de la persona, para traslapes y
   * saldo: `[{id, tipo, descuenta, fecha_inicio, fecha_fin, dias_habiles}]`.
   */
  activas: {
    id: string;
    tipo: string;
    descuenta: boolean;
    fecha_inicio: string;
    fecha_fin: string;
    dias_habiles: number;
  }[];
  /** En UPDATE: la fila tal como estaba (null en INSERT). */
  anterior?: {
    id: string;
    empleado_id: string;
    tipo: string;
    estado: string;
    fecha_inicio: string;
    fecha_fin: string;
    dias_habiles: number;
  } | null;
};

export type EntradaSolicitud = {
  operadorId: string;
  empleadoId: string;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: "pendiente" | "aprobada";
};

export type ResultadoValidacion =
  | {
      ok: true;
      dias_habiles: number;
      ciclo_inicio: string;
      ciclo_fin: string;
    }
  | { ok: false; error: string };

export const MENSAJE_EVIDENCIA_REQUERIDA =
  "Este tipo de ausencia requiere que adjuntes un comprobante.";

/**
 * Valida una solicitud con el ORDEN EXACTO del trigger de la 0035, y devuelve
 * los mismos mensajes en español que devolvía Postgres. Las ramas de
 * cancelación del dueño y de trazabilidad viven en la acción de servidor
 * (aquí solo va la validación de una alta o de una edición de gestor).
 */
export function validarSolicitud(
  entrada: EntradaSolicitud,
  ctx: ContextoValidacion
): ResultadoValidacion {
  const pol = ctx.politica;
  const esGestor = ctx.esGestor;

  if (!pol.activo) return { ok: false, error: "Ese tipo de ausencia no está disponible." };
  if (ctx.fechaIngreso === null) {
    return { ok: false, error: "El empleado no está activo" };
  }
  if (pol.solo_gestor && !esGestor) {
    return {
      ok: false,
      error: "Solo Recursos Humanos puede registrar este tipo de ausencia.",
    };
  }
  if (entrada.empleadoId !== entrada.operadorId && !esGestor) {
    return { ok: false, error: "No puedes registrar ausencias de otra persona." };
  }
  if (esGestor && entrada.empleadoId === entrada.operadorId && entrada.estado !== "pendiente") {
    return {
      ok: false,
      error:
        "Tu propia ausencia la tiene que resolver otra persona con permiso de Vacaciones: regístrala como pendiente.",
    };
  }
  if (!ctx.tieneVacaciones) {
    return {
      ok: false,
      error:
        "Ese perfil no tiene vacaciones asignadas (Dirección y Superadministrador gestionan las del equipo y no acumulan las suyas).",
    };
  }
  if (entrada.fecha_fin < entrada.fecha_inicio) {
    return { ok: false, error: "La fecha de fin no puede ser anterior a la de inicio." };
  }

  // Antigüedad (solo tipos que la exigen)
  if (pol.exige_antiguedad) {
    const dias = Math.round(
      (fechaDesdeISO(ctx.hoy).getTime() - fechaDesdeISO(ctx.fechaIngreso).getTime()) /
        86_400_000
    );
    if (dias < 365) {
      return {
        ok: false,
        error: "Se requiere al menos un año de antigüedad para solicitar vacaciones",
      };
    }
  }

  // Anticipación mínima: solo INSERT, solo tipos que la aplican, RR. HH. exento.
  // ES LA REGLA DE LAS 2 SEMANAS: `vacaciones` se pide con 14 días de aviso;
  // los tipos de emergencia (salud, maternidad, duelo) ni la aplican.
  const esAlta = !ctx.anterior;
  if (esAlta && pol.aplica_anticipacion && !esGestor) {
    // Como en Postgres: error si `fecha_inicio < current_date + anticipacion`,
    // así que el primer día elegible es hoy + N.
    const limite = diaSiguienteN(ctx.hoy, ctx.anticipacionDias);
    if (entrada.fecha_inicio < limite) {
      return {
        ok: false,
        error: `${pol.etiqueta} se solicita con al menos ${ctx.anticipacionDias} días de anticipación`,
      };
    }
  }

  // Retroactivo (emergencias: cualquier día, incluso ya pasado)
  if (!pol.permite_retroactivo && !esGestor && entrada.fecha_inicio < ctx.hoy) {
    return {
      ok: false,
      error: "Ese tipo de ausencia no se puede registrar con fecha pasada.",
    };
  }

  // Ciclo al que se cobra + tope de ventana
  let ciclo: Ciclo | null = null;
  if (pol.descuenta_vacaciones) {
    ciclo = cicloActual(ctx.fechaIngreso, entrada.fecha_inicio);
    if (!ciclo || ciclo.anios < 1) {
      return {
        ok: false,
        error: "La fecha de inicio cae antes de cumplir el primer año",
      };
    }
    if (entrada.fecha_fin > ciclo.ciclo_fin) {
      return {
        ok: false,
        error: `La solicitud no puede cruzar tu aniversario (${diaSiguienteISO(
          ciclo.ciclo_fin
        )}); pídela en dos partes`,
      };
    }
    // Ventana 0041: ciclo en curso + el siguiente, solo para quien no gestiona.
    if (!esGestor) {
      const ref = cicloActual(ctx.fechaIngreso, ctx.hoy);
      if (ref) {
        const siguiente = cicloActual(ctx.fechaIngreso, diaSiguienteISO(ref.ciclo_fin));
        const tope = siguiente?.ciclo_fin ?? ref.ciclo_fin;
        if (entrada.fecha_inicio > tope) {
          return {
            ok: false,
            error: `Solo puedes solicitar vacaciones de tu ciclo en curso o del siguiente (hasta el ${tope}).`,
          };
        }
      }
    }
  }

  const habiles = diasHabiles(ctx.festivos, entrada.fecha_inicio, entrada.fecha_fin);
  if (habiles === 0) {
    return { ok: false, error: "El rango seleccionado no contiene días hábiles" };
  }

  // Saldo (solo tipos que descuentan; el consumo anterior se devuelve solo si
  // el tipo viejo también descontaba)
  if (pol.descuenta_vacaciones && ciclo) {
    let usados = 0;
    for (const s of ctx.activas) {
      const esLaFila = ctx.anterior && s.id === ctx.anterior.id;
      if (esLaFila) continue;
      if (s.descuenta && s.fecha_inicio >= ciclo.ciclo_inicio && s.fecha_inicio <= ciclo.ciclo_fin) {
        usados += s.dias_habiles;
      }
    }
    const restantes = Math.max(diasPorAnio(ctx.tramos, ciclo.anios) - usados, 0);
    if (entrada.estado === "pendiente" || entrada.estado === "aprobada") {
      if (habiles > restantes) {
        return {
          ok: false,
          error: `Saldo insuficiente: solicitas ${habiles} días y te quedan ${restantes}`,
        };
      }
    }
  }

  // Traslapes contra activas del mismo tipo o entre tipos que descuentan
  let traslapes = 0;
  for (const s of ctx.activas) {
    if (ctx.anterior && s.id === ctx.anterior.id) continue;
    const seMontan = s.fecha_inicio <= entrada.fecha_fin && s.fecha_fin >= entrada.fecha_inicio;
    const cuentan =
      s.tipo === entrada.tipo || (s.descuenta && pol.descuenta_vacaciones);
    if (seMontan && cuentan) traslapes += 1;
  }
  if (traslapes > 0 && (entrada.estado === "pendiente" || entrada.estado === "aprobada")) {
    return { ok: false, error: "El rango se traslapa con otra solicitud activa" };
  }

  return {
    ok: true,
    dias_habiles: habiles,
    ciclo_inicio: ciclo ? ciclo.ciclo_inicio : isoDe(fechaDesdeISO(entrada.fecha_inicio)),
    ciclo_fin: ciclo
      ? ciclo.ciclo_fin
      : isoDe(
          new Date(fechaDesdeISO(entrada.fecha_inicio).getFullYear(), 11, 31)
        ),
  };
}

/** `hoy + n` días, en ISO (fecha LOCAL). */
export function diaSiguienteN(iso: string, n: number): string {
  const d = fechaDesdeISO(iso);
  d.setDate(d.getDate() + n);
  return isoDe(d);
}
