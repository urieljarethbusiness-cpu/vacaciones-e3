import type { DatabaseSync } from "node:sqlite";
import { ciclosVacacionesEmpleado } from "@/lib/db/consultas";
import { hoyISO } from "@/lib/db/reglas";
import { formatearFechaCorta, etiquetaTipo } from "@/lib/ausencias";
import { correosDeGestores, notificar, telegramDe } from "@/server/notificador";
import { registrarAuditoria } from "@/server/auditoria";
import { PERMISOS_BASE, type RolBase } from "@/lib/permisos";

/**
 * Motor de recordatorios — el equivalente local del worker del original
 * (worker/index.mjs + automatizacion_vacaciones de la migración 0021). Dos
 * automatizaciones:
 *
 *   1. `vacaciones`    — resumen de solicitudes PENDIENTES para el grupo que
 *                        aprueba. Solo se envía si hay algo pendiente.
 *   2. `vencimiento`   — aviso a cada empleado con días sin usar cuyo año se
 *                        reinicia pronto (dentro de `aviso_dias`).
 *
 * La ejecución programada vive en `scripts/recordatorios.ts` (para cron o el
 * programador de tareas); desde la pantalla de Automatizaciones también se
 * puede disparar cada recordatorio a mano. El marcador de última ejecución
 * (`automatizacion_estado`) guarda fecha y horarios ya enviados de cada
 * automatización para no duplicar envíos cuando corre por agenda.
 */

export type AjustesVacaciones = {
  activo: boolean;
  horarios: string[];
  dias: number[];
  destinatarios_modo: "permiso" | "personalizado";
  destinatarios: string[];
};

export type AjustesVencimiento = {
  activo: boolean;
  horarios: string[];
  dias: number[];
  /** Avisar cuando al ciclo le quedan N días o menos (0 = solo el día final). */
  aviso_dias: number;
};

export const VACACIONES_DEFECTO: AjustesVacaciones = {
  activo: true,
  horarios: ["09:00", "16:00"],
  dias: [1, 2, 3, 4, 5],
  destinatarios_modo: "permiso",
  destinatarios: [],
};

export const VENCIMIENTO_DEFECTO: AjustesVencimiento = {
  activo: true,
  horarios: ["09:00"],
  dias: [1, 2, 3, 4, 5],
  aviso_dias: 30,
};

export function leerAutomatizacion<T>(db: DatabaseSync, clave: string, defecto: T): T {
  const fila = db.prepare("select valor from ajustes where clave = ?").get(clave) as
    | { valor: string }
    | undefined;
  if (!fila) return defecto;
  return { ...defecto, ...(JSON.parse(fila.valor) as Partial<T>) };
}

export function guardarAutomatizacion<T>(
  db: DatabaseSync,
  clave: string,
  valor: T
): void {
  db.prepare(
    `insert into ajustes (clave, valor) values (?, ?)
     on conflict (clave) do update set valor = excluded.valor`
  ).run(clave, JSON.stringify(valor));
}

type EstadoEnvios = Record<string, { fecha: string; enviados: string[] }>;

function leerEstado(db: DatabaseSync): EstadoEnvios {
  const fila = db
    .prepare("select valor from ajustes where clave = 'automatizacion_estado'")
    .get() as { valor: string } | undefined;
  return fila ? (JSON.parse(fila.valor) as EstadoEnvios) : {};
}

function marcarEstado(
  db: DatabaseSync,
  clave: string,
  hoy: string,
  horarios: string[]
): void {
  const estado = leerEstado(db);
  const previo = estado[clave]?.fecha === hoy ? estado[clave].enviados : [];
  estado[clave] = {
    fecha: hoy,
    enviados: [...new Set([...previo, ...horarios])],
  };
  db.prepare(
    `insert into ajustes (clave, valor) values ('automatizacion_estado', ?)
     on conflict (clave) do update set valor = excluded.valor`
  ).run(JSON.stringify(estado));
}

/**
 * Horarios de HOY que ya vencieron y no se han enviado. Con `forzar` (botón
 * «Enviar ahora») se devuelven TODOS los horarios: el envío manual siempre
 * dispara, sin mirar el marcador del día.
 */
function horariosVencidos(
  clave: string,
  config: { horarios: string[]; dias: number[] },
  db: DatabaseSync,
  ahora: Date,
  forzar: boolean
): string[] {
  const diaSemana = ahora.getDay() === 0 ? 7 : ahora.getDay();
  if (!forzar && !config.dias.includes(diaSemana)) return [];
  if (forzar) return config.horarios;
  const hoy = hoyISO();
  const registro = leerEstado(db)[clave];
  const enviadosHoy = registro?.fecha === hoy ? registro.enviados : [];
  const hhmm = `${String(ahora.getHours()).padStart(2, "0")}:${String(
    ahora.getMinutes()
  ).padStart(2, "0")}`;
  return config.horarios.filter(
    (h) => h <= hhmm && !enviadosHoy.includes(h)
  );
}

// ---------------------------------------------------------------------------
// 1. Solicitudes pendientes → grupo que aprueba
// ---------------------------------------------------------------------------

function pendientesResumen(
  db: DatabaseSync
): { total: number; lineas: string[] } {
  const filas = db
    .prepare(
      `select s.id, s.empleado_id, p.nombre_completo, s.tipo, s.fecha_inicio,
              s.fecha_fin, s.dias_habiles, pa.etiqueta as tipo_etiqueta
       from solicitudes_vacaciones s
       join perfiles p on p.id = s.empleado_id
       left join politica_ausencias pa on pa.tipo = s.tipo
       where s.estado = 'pendiente'
       order by s.created_at asc`
    )
    .all() as unknown as {
      empleado_id: string;
      nombre_completo: string;
      tipo: string;
      tipo_etiqueta: string | null;
      fecha_inicio: string;
      fecha_fin: string;
      dias_habiles: number;
    }[];

  const lineas = filas.map((f) => {
    const tipo = etiquetaTipo(f.tipo, f.tipo_etiqueta);
    return `• ${f.nombre_completo}: ${tipo} ${formatearFechaCorta(f.fecha_inicio)} – ${formatearFechaCorta(f.fecha_fin)} (${f.dias_habiles} ${f.dias_habiles === 1 ? "día" : "días"} hábiles)`;
  });
  return { total: filas.length, lineas };
}

async function enviarPendientes(
  db: DatabaseSync,
  config: AjustesVacaciones
): Promise<{ enviados: number; total: number }> {
  const { total, lineas } = pendientesResumen(db);
  if (total === 0) return { enviados: 0, total: 0 };

  let correos: string[];
  if (config.destinatarios_modo === "permiso") {
    correos = correosDeGestores(db);
  } else {
    correos = config.destinatarios
      .map((id) => {
        const fila = db
          .prepare("select email from perfiles where id = ? and activo = 1")
          .get(id) as { email: string } | undefined;
        return fila?.email;
      })
      .filter((e): e is string => !!e);
  }
  if (correos.length === 0) return { enviados: 0, total };

  const asunto =
    total === 1
      ? "1 solicitud de ausencia espera revisión — Plataforma E3"
      : `${total} solicitudes de ausencia esperan revisión — Plataforma E3`;
  const cuerpo = `Hay ${total === 1 ? "una solicitud pendiente" : `${total} solicitudes pendientes`} de revisión:\n\n${lineas.join("\n")}\n\nRevísalas en «Ausencias del equipo».`;

  await notificar(db, {
    correos,
    telegram: telegramDe(asunto, cuerpo),
    plantilla: "vacaciones_recordatorio",
    asunto,
    cuerpo,
  });
  return { enviados: correos.length, total };
}

// ---------------------------------------------------------------------------
// 2. Días por vencer → cada empleado
// ---------------------------------------------------------------------------

async function enviarVencimientos(
  db: DatabaseSync,
  config: AjustesVencimiento
): Promise<{ enviados: number; avisados: number }> {
  const filas = db
    .prepare(
      `select p.id, p.email, p.nombre_completo, e.fecha_ingreso
       from perfiles p
       join empleados e on e.id = p.id and e.fecha_baja is null
       where p.activo = 1`
    )
    .all() as unknown as {
      id: string;
      email: string;
      nombre_completo: string;
      fecha_ingreso: string;
    }[];

  const hoy = hoyISO();
  let avisados = 0;
  let enviados = 0;

  for (const f of filas) {
    const rol = (
      db.prepare("select rol from perfiles where id = ?").get(f.id) as
        | { rol: RolBase }
        | undefined
    )?.rol;
    if (!rol || !PERMISOS_BASE[rol].includes("vacaciones")) continue;

    const ciclo = ciclosVacacionesEmpleado(db, f.id, 1)[0];
    if (!ciclo) continue;
    if (ciclo.dias_restantes <= 0) continue;
    if (ciclo.dias_para_expirar > config.aviso_dias) continue;

    avisados += 1;
    const asunto =
      ciclo.dias_para_expirar <= 0
        ? "Tu ciclo de vacaciones se reinicia hoy — Plataforma E3"
        : `Tienes ${ciclo.dias_restantes} ${ciclo.dias_restantes === 1 ? "día" : "días"} de vacaciones por usar — Plataforma E3`;
    const cuerpo =
      ciclo.dias_para_expirar <= 0
        ? `${f.nombre_completo}: tu año de vacaciones se reinicia HOY (${formatearFechaCorta(ciclo.ciclo_fin)}) y aún te quedan ${ciclo.dias_restantes} ${ciclo.dias_restantes === 1 ? "día" : "días"} sin usar.`
        : `${f.nombre_completo}: faltan ${ciclo.dias_para_expirar} ${ciclo.dias_para_expirar === 1 ? "día" : "días"} para que se reinicie tu año de vacaciones (${formatearFechaCorta(ciclo.ciclo_fin)}) y aún tienes ${ciclo.dias_restantes} ${ciclo.dias_restantes === 1 ? "día" : "días"} disponibles. Después del reinicio empiezas de cero.`;

    await notificar(db, {
      correos: [f.email],
      telegram: telegramDe(asunto, cuerpo),
      plantilla: "vacaciones_recordatorio",
      asunto,
      cuerpo,
    });
    enviados += 1;
  }
  return { enviados, avisados };
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

export type ResultadoEjecucion = {
  ok: true;
  detalle: string;
} | { ok: false; error: string };

/**
 * Corre un recordatorio por su clave (`vacaciones` | `vencimiento`).
 * `forzar` ignora el día y el horario (botón «Enviar ahora»); el modo
 * programado solo envía si hay horarios vencidos hoy sin enviar.
 */
export async function ejecutarRecordatorio(
  db: DatabaseSync,
  clave: "vacaciones" | "vencimiento",
  actor: Parameters<typeof registrarAuditoria>[1]["actor"] | null,
  forzar: boolean
): Promise<ResultadoEjecucion> {
  const ahora = new Date();
  const claveAjuste =
    clave === "vacaciones" ? "automatizacion_vacaciones" : "automatizacion_vencimiento";

  if (clave === "vacaciones") {
    const config = leerAutomatizacion(db, claveAjuste, VACACIONES_DEFECTO);
    if (!config.activo) return { ok: false, error: "El recordatorio está desactivado." };
    const vencidos = horariosVencidos(clave, config, db, ahora, forzar);
    if (vencidos.length === 0) {
      return {
        ok: false,
        error: "Hoy no toca envío (día o horario fuera de la agenda, o ya enviado).",
      };
    }
    const { enviados, total } = await enviarPendientes(db, config);
    marcarEstado(db, clave, hoyISO(), vencidos);
    if (actor) {
      registrarAuditoria(db, {
        categoria: "config",
        accion: "recordatorio.enviado",
        entidad: claveAjuste,
        entidad_etiqueta: `${total} pendiente(s), ${enviados} destinatario(s)`,
        actor,
      });
    }
    if (total === 0) return { ok: true, detalle: "No hay solicitudes pendientes: no se envió nada." };
    return { ok: true, detalle: `Resumen de ${total} pendiente(s) enviado a ${enviados} destinatario(s).` };
  }

  const config = leerAutomatizacion(db, claveAjuste, VENCIMIENTO_DEFECTO);
  if (!config.activo) return { ok: false, error: "El recordatorio está desactivado." };
  const vencidos = horariosVencidos(clave, config, db, ahora, forzar);
  if (vencidos.length === 0) {
    return {
      ok: false,
      error: "Hoy no toca envío (día o horario fuera de la agenda, o ya enviado).",
    };
  }
  const { enviados, avisados } = await enviarVencimientos(db, config);
  marcarEstado(db, clave, hoyISO(), vencidos);
  if (actor) {
    registrarAuditoria(db, {
      categoria: "config",
      accion: "recordatorio.enviado",
      entidad: claveAjuste,
      entidad_etiqueta: `${avisados} persona(s) con días por vencer`,
      actor,
    });
  }
  if (avisados === 0) {
    return { ok: true, detalle: `Nadie tiene días por vencer en los próximos ${config.aviso_dias} días.` };
  }
  return { ok: true, detalle: `Aviso enviado a ${enviados} persona(s) con días por vencer.` };
}
