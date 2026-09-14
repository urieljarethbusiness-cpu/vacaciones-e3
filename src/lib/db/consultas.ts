import type { DatabaseSync } from "node:sqlite";
import type {
  Ausencia,
  EstadoAusencia,
  PoliticaAusencia,
  ResumenAusencia,
  SaldoEquipo,
  TipoAusencia,
} from "@/lib/ausencias";
import type { CicloVacaciones } from "@/lib/vacaciones";
import { PERMISOS_BASE, type RolBase } from "@/lib/permisos";
import {
  balanceDeCiclo,
  cicloActual,
  diaSiguienteISO,
  hoyISO,
  type Balance,
  type PoliticaAusenciaReglas,
  type TramoVacaciones,
} from "./reglas";

/**
 * Equivalencias de las RPC de Postgres del original, escritas contra SQLite.
 * Mismas firmas conceptuales: `mis_ciclos_vacaciones`, `ciclos_vacaciones_
 * empleado`, `balance_vacaciones`, `listar_solicitudes_vacaciones`,
 * `saldos_equipo`, `resumen_ausencias`, `empleados_asignables`.
 */

// ---------------------------------------------------------------------------
// Lecturas de apoyo
// ---------------------------------------------------------------------------

export function tramosPolitica(db: DatabaseSync): TramoVacaciones[] {
  return db
    .prepare("select anios, dias from politica_vacaciones order by anios")
    .all() as unknown as TramoVacaciones[];
}

export function festivosSet(db: DatabaseSync): Set<string> {
  const filas = db.prepare("select fecha from dias_festivos").all() as {
    fecha: string;
  }[];
  return new Set(filas.map((f) => f.fecha));
}

export function ajusteEntero(
  db: DatabaseSync,
  clave: string,
  defecto: number
): number {
  const fila = db
    .prepare("select valor from ajustes where clave = ?")
    .get(clave) as { valor: string } | undefined;
  const n = fila ? Number(JSON.parse(fila.valor)) : NaN;
  return Number.isInteger(n) ? n : defecto;
}

export function politicaDe(
  db: DatabaseSync,
  tipo: string
): PoliticaAusencia | null {
  const fila = db
    .prepare(
      `select tipo, etiqueta, descripcion, descuenta_vacaciones, requiere_evidencia,
              permite_retroactivo, exige_antiguedad, aplica_anticipacion, solo_gestor,
              ausente_del_trabajo, motivo_sensible, color, orden, activo
       from politica_ausencias where tipo = ?`
    )
    .get(tipo);
  if (!fila) return null;
  const p = fila as Record<string, unknown>;
  // SQLite entrega los enteros 0/1; la app espera booleanos.
  return {
    tipo: p.tipo as TipoAusencia,
    etiqueta: p.etiqueta as string,
    descripcion: (p.descripcion as string) ?? null,
    descuenta_vacaciones: !!p.descuenta_vacaciones,
    requiere_evidencia: !!p.requiere_evidencia,
    permite_retroactivo: !!p.permite_retroactivo,
    exige_antiguedad: !!p.exige_antiguedad,
    aplica_anticipacion: !!p.aplica_anticipacion,
    solo_gestor: !!p.solo_gestor,
    ausente_del_trabajo: !!p.ausente_del_trabajo,
    motivo_sensible: !!p.motivo_sensible,
    color: p.color as string,
    orden: p.orden as number,
    activo: !!p.activo,
  } as PoliticaAusencia;
}

export function politicasActivas(db: DatabaseSync): PoliticaAusencia[] {
  const filas = db
    .prepare(
      `select tipo from politica_ausencias where activo = 1 order by orden`
    )
    .all() as unknown as { tipo: string }[];
  return filas
    .map((f) => politicaDe(db, f.tipo))
    .filter((p): p is PoliticaAusencia => p !== null);
}

/** TODAS las políticas, activas o no (los tipos retirados conservan histórico). */
export function politicasTodas(db: DatabaseSync): PoliticaAusencia[] {
  const filas = db
    .prepare(`select tipo from politica_ausencias order by orden`)
    .all() as unknown as { tipo: string }[];
  return filas
    .map((f) => politicaDe(db, f.tipo))
    .filter((p): p is PoliticaAusencia => p !== null);
}

/** ¿Este perfil conserva el permiso `vacaciones`? (rol base; 0054/0063) */
export function tieneVacaciones(db: DatabaseSync, perfilId: string): boolean {
  const fila = db
    .prepare("select rol from perfiles where id = ? and activo = 1")
    .get(perfilId) as { rol: string } | undefined;
  if (!fila) return false;
  return (PERMISOS_BASE[fila.rol as RolBase] ?? []).includes("vacaciones");
}

function paraReglas(p: PoliticaAusencia): PoliticaAusenciaReglas {
  return {
    tipo: p.tipo,
    etiqueta: p.etiqueta,
    descuenta_vacaciones: p.descuenta_vacaciones,
    requiere_evidencia: p.requiere_evidencia,
    permite_retroactivo: p.permite_retroactivo,
    exige_antiguedad: p.exige_antiguedad,
    aplica_anticipacion: p.aplica_anticipacion,
    solo_gestor: p.solo_gestor,
    activo: p.activo,
  };
}

/** Ficha laboral activa del perfil, o null (baja o sin ficha). */
export function fichaDe(
  db: DatabaseSync,
  perfilId: string
): { fecha_ingreso: string; puesto: string | null; area: string | null; fecha_baja: string | null } | null {
  const fila = db
    .prepare(
      `select fecha_ingreso, puesto, area, fecha_baja
       from empleados where id = ? and fecha_baja is null`
    )
    .get(perfilId) as
    | { fecha_ingreso: string; puesto: string | null; area: string | null; fecha_baja: string | null }
    | undefined;
  return fila ?? null;
}

/** Solicitudes activas (pendiente/aprobada) de una persona, con su política. */
function activasDe(
  db: DatabaseSync,
  empleadoId: string
): {
  id: string;
  tipo: string;
  estado: EstadoAusencia;
  descuenta: boolean;
  ausente: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  dias_habiles: number;
}[] {
  return db
    .prepare(
      `select s.id, s.tipo, s.estado,
              coalesce(pa.descuenta_vacaciones, 0) as descuenta,
              coalesce(pa.ausente_del_trabajo, 1) as ausente,
              s.fecha_inicio, s.fecha_fin, s.dias_habiles
       from solicitudes_vacaciones s
       left join politica_ausencias pa on pa.tipo = s.tipo
       where s.empleado_id = ? and s.estado in ('pendiente', 'aprobada')`
    )
    .all(empleadoId)
    .map((f) => {
      const r = f as Record<string, unknown>;
      return {
        id: r.id as string,
        tipo: r.tipo as string,
        estado: r.estado as EstadoAusencia,
        descuenta: !!r.descuenta,
        ausente: !!r.ausente,
        fecha_inicio: r.fecha_inicio as string,
        fecha_fin: r.fecha_fin as string,
        dias_habiles: r.dias_habiles as number,
      };
    });
}

// ---------------------------------------------------------------------------
// Balance y ciclos (app.balance_vacaciones / mis_ciclos_vacaciones)
// ---------------------------------------------------------------------------

/** Espejo de `app.balance_vacaciones(p_empleado, p_referencia)`. */
export function balanceVacaciones(
  db: DatabaseSync,
  empleadoId: string,
  referencia: string = hoyISO()
): Balance | null {
  const ficha = fichaDe(db, empleadoId);
  if (!ficha) return null;
  if (!tieneVacaciones(db, empleadoId)) return null;
  const ciclo = cicloActual(ficha.fecha_ingreso, referencia);
  if (!ciclo) return null;
  // Solo tipos que descuentan y están pendientes/aprobadas reservan saldo.
  const usados = activasDe(db, empleadoId)
    .filter(
      (s) =>
        s.descuenta &&
        s.fecha_inicio >= ciclo.ciclo_inicio &&
        s.fecha_inicio <= ciclo.ciclo_fin
    )
    .reduce((n, s) => n + s.dias_habiles, 0);
  return balanceDeCiclo({
    fechaIngreso: ficha.fecha_ingreso,
    referencia,
    hoy: hoyISO(),
    tramos: tramosPolitica(db),
    usados,
  });
}

function ciclosEncadenados(
  db: DatabaseSync,
  empleadoId: string,
  n: number
): CicloVacaciones[] {
  const out: CicloVacaciones[] = [];
  if (!tieneVacaciones(db, empleadoId)) return out;
  const ficha = fichaDe(db, empleadoId);
  if (!ficha) return out;
  const tramos = tramosPolitica(db);
  let ref = hoyISO();
  const hoy = hoyISO();
  for (let i = 0; i < n; i++) {
    const ciclo = cicloActual(ficha.fecha_ingreso, ref);
    if (!ciclo) break;
    const usados = activasDe(db, empleadoId)
      .filter(
        (s) =>
          s.descuenta &&
          s.fecha_inicio >= ciclo.ciclo_inicio &&
          s.fecha_inicio <= ciclo.ciclo_fin
      )
      .reduce((sum, s) => sum + s.dias_habiles, 0);
    const b = balanceDeCiclo({
      fechaIngreso: ficha.fecha_ingreso,
      referencia: ref,
      hoy,
      tramos,
      usados,
    });
    if (!b) break;
    out.push({
      indice: i,
      anios: b.anios,
      ciclo_inicio: b.ciclo_inicio,
      ciclo_fin: b.ciclo_fin,
      dias_correspondientes: b.dias_correspondientes,
      dias_usados: b.dias_usados,
      dias_restantes: b.dias_restantes,
      dias_para_expirar: Math.round(b.dias_para_expirar),
    });
    ref = diaSiguienteISO(ciclo.ciclo_fin);
  }
  return out;
}

/** Espejo de `public.mis_ciclos_vacaciones(p_ciclos)`. */
export function misCiclosVacaciones(
  db: DatabaseSync,
  perfilId: string,
  n = 2
): CicloVacaciones[] {
  return ciclosEncadenados(db, perfilId, n);
}

/** Espejo de `public.ciclos_vacaciones_empleado(p_empleado, p_ciclos)`. */
export function ciclosVacacionesEmpleado(
  db: DatabaseSync,
  empleadoId: string,
  n = 2
): CicloVacaciones[] {
  return ciclosEncadenados(db, empleadoId, n);
}

// ---------------------------------------------------------------------------
// Listados
// ---------------------------------------------------------------------------

const SELECT_LISTADO = `
  select s.id, s.empleado_id, p.nombre_completo as empleado_nombre,
         p.email as empleado_email,
         s.fecha_inicio, s.fecha_fin, s.dias_habiles, s.estado,
         s.comentario_empleado, s.comentario_manager, s.created_at,
         s.tipo, pa.etiqueta as tipo_etiqueta, pa.color as tipo_color,
         s.motivo, s.registrada_por_gestor,
         (select count(*) from ausencia_adjuntos a where a.solicitud_id = s.id)
           as tiene_adjuntos
  from solicitudes_vacaciones s
  join perfiles p on p.id = s.empleado_id
  left join politica_ausencias pa on pa.tipo = s.tipo`;

function aAusencia(f: Record<string, unknown>): Ausencia {
  return {
    id: f.id as string,
    empleado_id: f.empleado_id as string,
    empleado_nombre: f.empleado_nombre as string,
    fecha_inicio: f.fecha_inicio as string,
    fecha_fin: f.fecha_fin as string,
    dias_habiles: f.dias_habiles as number,
    estado: f.estado as EstadoAusencia,
    comentario_empleado: (f.comentario_empleado as string) ?? null,
    comentario_manager: (f.comentario_manager as string) ?? null,
    created_at: f.created_at as string,
    tipo: f.tipo as TipoAusencia,
    tipo_etiqueta: (f.tipo_etiqueta as string) ?? null,
    tipo_color: (f.tipo_color as string) ?? null,
    motivo: (f.motivo as string) ?? null,
    registrada_por_gestor: !!f.registrada_por_gestor,
    tiene_adjuntos: Number(f.tiene_adjuntos) > 0,
    empleado_email: (f.empleado_email as string) ?? null,
  };
}

/**
 * Espejo de `public.listar_solicitudes_vacaciones`: quien no tiene
 * `gestion.vacaciones` ve SOLO las suyas (lo que en el original hacía la RLS).
 */
export function listarSolicitudes(
  db: DatabaseSync,
  quien: { id: string; permisos: string[] }
): Ausencia[] {
  const esGestor = quien.permisos.includes("gestion.vacaciones");
  const filas = esGestor
    ? db.prepare(`${SELECT_LISTADO} order by s.created_at desc`).all()
    : db
        .prepare(`${SELECT_LISTADO} where s.empleado_id = ? order by s.created_at desc`)
        .all(quien.id);
  return (filas as Record<string, unknown>[]).map(aAusencia);
}

export function solicitudPorId(
  db: DatabaseSync,
  id: string
): (Ausencia & { ruta_adjuntos?: never }) | null {
  const fila = db.prepare(`${SELECT_LISTADO} where s.id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return fila ? aAusencia(fila) : null;
}

/** Espejo de `public.saldos_equipo(p_anio)` — solo personas con `vacaciones`. */
export function saldosEquipo(
  db: DatabaseSync,
  anio?: number
): SaldoEquipo[] {
  const hoy = hoyISO();
  // Referencia: 31-dic del año consultado si no es el año en curso.
  const referencia =
    anio && anio !== new Date().getFullYear() ? `${anio}-12-31` : hoy;
  const filas = db
    .prepare(
      `select p.id, p.nombre_completo, p.email, e.puesto, e.area, e.fecha_ingreso
       from perfiles p
       join empleados e on e.id = p.id and e.fecha_baja is null
       where p.activo = 1
       order by p.nombre_completo`
    )
    .all() as unknown as Record<string, string>[];

  const tramos = tramosPolitica(db);
  const anioRef = Number(referencia.slice(0, 4));
  const out: SaldoEquipo[] = [];

  for (const f of filas) {
    const rol = (db.prepare("select rol from perfiles where id = ?").get(f.id) as { rol: RolBase } | undefined)?.rol;
    if (!rol || !(PERMISOS_BASE[rol] ?? []).includes("vacaciones")) continue;
    const ciclo = cicloActual(f.fecha_ingreso, referencia);
    if (!ciclo) continue;
    const correspondientes =
      ciclo.anios < 1
        ? 0
        : ([...tramos].reverse().find((t) => t.anios <= ciclo.anios)?.dias ?? 0);

    const activas = activasDe(db, f.id);
    const usadosCiclo = activas
      .filter(
        (s) =>
          s.descuenta &&
          s.fecha_inicio >= ciclo.ciclo_inicio &&
          s.fecha_inicio <= ciclo.ciclo_fin
      )
      .reduce((n, s) => n + s.dias_habiles, 0);

    const enAnio = (iso: string) => iso.slice(0, 4) === String(anioRef);
    let pendientes = 0;
    let diasSalud = 0;
    let diasOtros = 0;
    for (const s of activas) {
      if (!enAnio(s.fecha_inicio)) continue;
      if (s.descuenta) {
        if (s.estado === "pendiente") pendientes += s.dias_habiles;
        continue;
      }
      if (s.estado === "aprobada" && s.ausente) {
        if (s.tipo === "permiso_salud") diasSalud += s.dias_habiles;
        else diasOtros += s.dias_habiles;
      }
    }

    const restantes = Math.max(correspondientes - usadosCiclo, 0);
    out.push({
      empleado_id: f.id,
      nombre_completo: f.nombre_completo,
      email: f.email,
      puesto: f.puesto || null,
      area: f.area || null,
      fecha_ingreso: f.fecha_ingreso,
      anios: ciclo.anios,
      ciclo_inicio: ciclo.ciclo_inicio,
      ciclo_fin: ciclo.ciclo_fin,
      dias_correspondientes: correspondientes,
      dias_usados: usadosCiclo,
      dias_restantes: restantes,
      dias_para_expirar: Math.round(
        (Date.parse(`${ciclo.ciclo_fin}T00:00:00`) - Date.parse(`${hoy}T00:00:00`)) /
          86_400_000
      ),
      pendientes,
      dias_salud: diasSalud,
      dias_otros: diasOtros,
    });
  }
  return out;
}

/** Espejo de `public.resumen_ausencias(p_empleado, p_anio)`. */
export function resumenAusencias(
  db: DatabaseSync,
  empleadoId: string,
  anio: number
): ResumenAusencia[] {
  const filas = db
    .prepare(
      `select s.tipo, pa.etiqueta, pa.color, pa.descuenta_vacaciones,
              sum(case when s.estado = 'aprobada' then s.dias_habiles else 0 end) as dias_aprobados,
              sum(case when s.estado = 'pendiente' then s.dias_habiles else 0 end) as dias_pendientes,
              count(*) as solicitudes
       from solicitudes_vacaciones s
       join politica_ausencias pa on pa.tipo = s.tipo
       where s.empleado_id = ? and substr(s.fecha_inicio, 1, 4) = ?
         and s.estado in ('aprobada', 'pendiente')
       group by s.tipo
       order by pa.orden`
    )
    .all(empleadoId, String(anio)) as unknown as Record<string, unknown>[];

  return filas.map((f) => ({
    tipo: f.tipo as TipoAusencia,
    etiqueta: f.etiqueta as string,
    color: f.color as string,
    descuenta_vacaciones: !!f.descuenta_vacaciones,
    dias_aprobados: Number(f.dias_aprobados) || 0,
    dias_pendientes: Number(f.dias_pendientes) || 0,
    solicitudes: Number(f.solicitudes) || 0,
  }));
}

/** Espejo de `public.empleados_asignables` — solo con permiso `vacaciones`. */
export function empleadosAsignables(db: DatabaseSync): {
  id: string;
  nombre_completo: string;
  puesto: string | null;
  de_vacaciones: boolean;
  tiene_vacaciones: boolean;
}[] {
  const filas = db
    .prepare(
      `select p.id, p.nombre_completo, e.puesto
       from perfiles p
       join empleados e on e.id = p.id and e.fecha_baja is null
       where p.activo = 1
       order by p.nombre_completo`
    )
    .all() as unknown as Record<string, string>[];

  const hoy = hoyISO();
  return filas
    .map((f) => {
      const tiene = tieneVacaciones(db, f.id);
      let deVacaciones = false;
      if (tiene) {
        const enCurso = db
          .prepare(
            `select 1 from solicitudes_vacaciones s
             join politica_ausencias pa on pa.tipo = s.tipo
             where s.empleado_id = ? and s.estado = 'aprobada'
               and pa.ausente_del_trabajo = 1
               and s.fecha_inicio <= ? and s.fecha_fin >= ? limit 1`
          )
          .get(f.id, hoy, hoy);
        deVacaciones = !!enCurso;
      }
      return {
        id: f.id,
        nombre_completo: f.nombre_completo,
        puesto: f.puesto || null,
        de_vacaciones: deVacaciones,
        tiene_vacaciones: tiene,
      };
    })
    .filter((f) => f.tiene_vacaciones);
}

/** Número de solicitudes en un estado (encabezado del panel del gestor). */
export function contarPorEstado(
  db: DatabaseSync,
  estado: EstadoAusencia
): number {
  const fila = db
    .prepare("select count(*) as n from solicitudes_vacaciones where estado = ?")
    .get(estado) as { n: number };
  return Number(fila.n);
}

/** Perfil por id (para la auditoría y los listados). */
export function nombreDe(
  db: DatabaseSync,
  perfilId: string
): string {
  const fila = db
    .prepare("select nombre_completo from perfiles where id = ?")
    .get(perfilId) as { nombre_completo: string } | undefined;
  return fila?.nombre_completo ?? perfilId;
}

/** Adjuntos (SIN la ruta: nunca viaja al cliente) de varias solicitudes. */
export function adjuntosDeSolicitudes(
  db: DatabaseSync,
  solicitudIds: string[]
): { id: string; solicitud_id: string; nombre_archivo: string; mime: string | null; tamano: number | null; created_at: string }[] {
  if (solicitudIds.length === 0) return [];
  const marcas = solicitudIds.map(() => "?").join(",");
  const filas = db
    .prepare(
      `select id, solicitud_id, nombre_archivo, mime, tamano, created_at
       from ausencia_adjuntos where solicitud_id in (${marcas})
       order by created_at`
    )
    .all(...solicitudIds) as Record<string, unknown>[];
  return filas.map((f) => ({
    id: f.id as string,
    solicitud_id: f.solicitud_id as string,
    nombre_archivo: f.nombre_archivo as string,
    mime: (f.mime as string) ?? null,
    tamano: (f.tamano as number) ?? null,
    created_at: f.created_at as string,
  }));
}
