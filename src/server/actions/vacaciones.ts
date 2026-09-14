"use server";

import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CAMPOS_AUSENCIA,
  ESTADOS_ALTA_GESTOR,
  ESTADOS_AUSENCIA,
  MENSAJE_EVIDENCIA_REQUERIDA,
  TIPOS_AUSENCIA,
  errorDeEvidencia,
  etiquetaTipo,
  type EstadoAusencia,
  type TipoAusencia,
} from "@/lib/ausencias";
import { CICLOS_VISIBLES, type CicloVacaciones } from "@/lib/vacaciones";
import {
  ajusteEntero,
  festivosSet,
  fichaDe,
  misCiclosVacaciones,
  ciclosVacacionesEmpleado,
  nombreDe,
  politicaDe,
  tieneVacaciones,
  tramosPolitica,
} from "@/lib/db/consultas";
import {
  diaSiguienteISO,
  hoyISO,
  validarSolicitud,
  type EntradaSolicitud,
} from "@/lib/db/reglas";
import { exigirPermiso, exigirSesion } from "@/server/autorizacion";
import { registrarAuditoria } from "@/server/auditoria";
import {
  correosDeGestores,
  notificar,
  telegramDe,
} from "@/server/notificador";

type Resultado = { ok: true } | { ok: false; error: string };
type ResultadoAlta = { ok: true; id: string } | { ok: false; error: string };

/** Convierte un fallo de validación en el mensaje legible (ya viene en español). */
function mensajeDeError(error: unknown, porDefecto: string): string {
  const m = error instanceof Error ? error.message : String(error ?? "");
  if (m) return m;
  return porDefecto;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Carpeta física de los comprobantes (equivalente del bucket `ausencias`). */
function carpetaEvidencia(): string {
  return join(process.cwd(), "datos", "evidencia");
}

// ---------------------------------------------------------------------------
// Utilidades de FormData y de evidencia
// ---------------------------------------------------------------------------

function texto(entrada: FormData, clave: string): string | undefined {
  const valor = entrada.get(clave);
  if (typeof valor !== "string") return undefined;
  const limpio = valor.trim();
  return limpio === "" ? undefined : limpio;
}

/** Descarta las partes SIN nombre: un input file intacto viaja vacío. */
function leerArchivos(entrada: FormData): File[] {
  return entrada
    .getAll(CAMPOS_AUSENCIA.evidencia)
    .filter((a): a is File => a instanceof File)
    .filter((a) => a.name !== "" || a.size > 0);
}

/** Nombre apto para una ruta de disco; el original se conserva en la fila. */
function sanearNombre(nombre: string): string {
  const limpio = Array.from(nombre)
    .map((c) => {
      if (c === "/" || c === "\\") return "-";
      return (c.codePointAt(0) ?? 0) < 32 ? "" : c;
    })
    .join("")
    .trim();
  return (limpio || "comprobante").slice(0, 120);
}

/** Borra archivos ya subidos si la transacción falla (no dejar basura). */
function limpiarArchivos(rutas: string[]): void {
  for (const ruta of rutas) {
    try {
      unlinkSync(join(carpetaEvidencia(), ruta));
    } catch {
      // Si ya no existe, no hay nada que limpiar.
    }
  }
}

// ---------------------------------------------------------------------------
// Alta de ausencia (compartida por el empleado y por RR. HH.)
// ---------------------------------------------------------------------------

const esquemaAusencia = z.object({
  tipo: z.enum(TIPOS_AUSENCIA, {
    error: "Elige un tipo de ausencia válido.",
  }),
  fecha_inicio: z
    .string({ error: "Indica la fecha de inicio." })
    .regex(FECHA, { error: "Fecha de inicio inválida." }),
  fecha_fin: z
    .string({ error: "Indica la fecha de fin." })
    .regex(FECHA, { error: "Fecha de fin inválida." }),
  comentario: z
    .string({ error: "El comentario no es válido." })
    .max(1000, { error: "El comentario no puede pasar de 1000 caracteres." })
    .optional(),
  motivo: z
    .string({ error: "El motivo no es válido." })
    .max(500, { error: "El motivo no puede pasar de 500 caracteres." })
    .optional(),
});

/**
 * Guarda los comprobantes en disco y registra la ausencia con sus adjuntos.
 * El orden replica al original: primero los archivos (como el bucket antes de
 * la fila), luego la fila; si la fila falla, los archivos se borran.
 */
async function altaDeAusencia(
  db: ReturnType<typeof import("@/lib/db").base>,
  datos: {
    tipo: TipoAusencia;
    fecha_inicio: string;
    fecha_fin: string;
    comentario?: string;
    motivo?: string;
    empleado_id: string;
    estado: "pendiente" | "aprobada";
  },
  archivos: File[],
  porDefecto: string
): Promise<ResultadoAlta> {
  const politica = politicaDe(db, datos.tipo);
  if (!politica) return { ok: false, error: "Ese tipo de ausencia no está disponible." };

  if (politica.requiere_evidencia && archivos.length === 0) {
    return { ok: false, error: MENSAJE_EVIDENCIA_REQUERIDA };
  }
  const errorArchivos = errorDeEvidencia(archivos);
  if (errorArchivos) return { ok: false, error: errorArchivos };

  // Quien decide de verdad es la capa de reglas (el trigger del original).
  const operador = await exigirSesion();
  const validacion = validarConContexto(db, operador.perfil, datos, null);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const solicitudId = randomUUID();
  const subidos: string[] = [];
  const adjuntos: {
    ruta: string;
    nombre_archivo: string;
    mime: string | null;
    tamano: number;
  }[] = [];

  for (const archivo of archivos) {
    const nombreLimpio = sanearNombre(archivo.name);
    const ruta = `${solicitudId}/${randomUUID()}-${nombreLimpio}`;
    try {
      const destino = join(carpetaEvidencia(), ruta);
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, Buffer.from(await archivo.arrayBuffer()));
    } catch {
      limpiarArchivos(subidos);
      return { ok: false, error: `No se pudo subir "${archivo.name}".` };
    }
    subidos.push(ruta);
    adjuntos.push({
      ruta,
      nombre_archivo: archivo.name,
      mime: archivo.type || null,
      tamano: archivo.size,
    });
  }

  try {
    db.prepare(
      `insert into solicitudes_vacaciones
        (id, empleado_id, tipo, fecha_inicio, fecha_fin, dias_habiles,
         ciclo_inicio, ciclo_fin, estado, comentario_empleado, motivo,
         resuelta_por, resuelta_en, creada_por, registrada_por_gestor)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      solicitudId,
      datos.empleado_id,
      datos.tipo,
      datos.fecha_inicio,
      datos.fecha_fin,
      validacion.dias_habiles,
      validacion.ciclo_inicio,
      validacion.ciclo_fin,
      datos.estado,
      datos.comentario ?? null,
      datos.motivo ?? null,
      datos.estado === "aprobada" ? operador.perfil.id : null,
      datos.estado === "aprobada" ? new Date().toISOString() : null,
      operador.perfil.id,
      operador.perfil.id !== datos.empleado_id &&
        operador.perfil.permisos.includes("gestion.vacaciones")
        ? 1
        : 0
    );

    const insertarAdjunto = db.prepare(
      `insert into ausencia_adjuntos
        (id, solicitud_id, subido_por, ruta, nombre_archivo, mime, tamano)
       values (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const a of adjuntos) {
      insertarAdjunto.run(
        randomUUID(),
        solicitudId,
        operador.perfil.id,
        a.ruta,
        a.nombre_archivo,
        a.mime,
        a.tamano
      );
    }
  } catch (error) {
    limpiarArchivos(subidos);
    return {
      ok: false,
      error: mensajeDeError(error, porDefecto),
    };
  }

  // Aviso al afectado cuando el alta la dio Recursos Humanos (multicanal).
  const afectado = db
    .prepare("select email from perfiles where id = ?")
    .get(datos.empleado_id) as { email: string } | undefined;
  if (afectado && operador.perfil.id !== datos.empleado_id) {
    const asunto = "Registraron una ausencia a tu nombre — Plataforma E3";
    const cuerpo = `Recursos Humanos registró ${etiquetaTipo(datos.tipo, politica.etiqueta)} del ${datos.fecha_inicio} al ${datos.fecha_fin} a tu nombre.`;
    await notificar(db, {
      correos: [afectado.email],
      telegram: telegramDe(asunto, `${cuerpo} La registró ${operador.perfil.nombre_completo}.`),
      plantilla: "ausencia_registrada",
      asunto,
      cuerpo,
    });
  }

  return { ok: true, id: solicitudId };
}

/** Arma el contexto de validación (el "entorno" que veía el trigger). */
function validarConContexto(
  db: ReturnType<typeof import("@/lib/db").base>,
  perfil: { id: string; permisos: string[] },
  datos: {
    tipo: string;
    fecha_inicio: string;
    fecha_fin: string;
    empleado_id: string;
    estado: "pendiente" | "aprobada";
  },
  anterior: {
    id: string;
    empleado_id: string;
    tipo: string;
    estado: string;
    fecha_inicio: string;
    fecha_fin: string;
    dias_habiles: number;
  } | null
) {
  const politica = politicaDe(db, datos.tipo);
  if (!politica) throw new Error("Ese tipo de ausencia no está disponible.");
  const ficha = fichaDe(db, datos.empleado_id);

  const activas = db
    .prepare(
      `select s.id, s.tipo, coalesce(pa.descuenta_vacaciones, 0) as descuenta,
              s.fecha_inicio, s.fecha_fin, s.dias_habiles
       from solicitudes_vacaciones s
       left join politica_ausencias pa on pa.tipo = s.tipo
       where s.empleado_id = ? and s.estado in ('pendiente', 'aprobada')`
    )
    .all(datos.empleado_id)
    .map((f) => {
      const r = f as Record<string, unknown>;
      return {
        id: r.id as string,
        tipo: r.tipo as string,
        descuenta: !!r.descuenta,
        fecha_inicio: r.fecha_inicio as string,
        fecha_fin: r.fecha_fin as string,
        dias_habiles: r.dias_habiles as number,
      };
    });

  return validarSolicitud(
    {
      operadorId: perfil.id,
      empleadoId: datos.empleado_id,
      tipo: datos.tipo,
      fecha_inicio: datos.fecha_inicio,
      fecha_fin: datos.fecha_fin,
      estado: datos.estado,
    },
    {
      hoy: hoyISO(),
      tramos: tramosPolitica(db),
      festivos: festivosSet(db),
      politica: {
        tipo: politica.tipo,
        etiqueta: politica.etiqueta,
        descuenta_vacaciones: politica.descuenta_vacaciones,
        requiere_evidencia: politica.requiere_evidencia,
        permite_retroactivo: politica.permite_retroactivo,
        exige_antiguedad: politica.exige_antiguedad,
        aplica_anticipacion: politica.aplica_anticipacion,
        solo_gestor: politica.solo_gestor,
        activo: politica.activo,
      },
      esGestor: perfil.permisos.includes("gestion.vacaciones"),
      fechaIngreso: ficha?.fecha_ingreso ?? null,
      tieneVacaciones: tieneVacaciones(db, datos.empleado_id),
      anticipacionDias: ajusteEntero(db, "anticipacion_minima_dias", 14),
      activas,
      anterior,
    }
  );
}

// ---------------------------------------------------------------------------
// 1. El empleado registra su propia ausencia
// ---------------------------------------------------------------------------

export async function solicitarAusencia(
  entrada: FormData
): Promise<ResultadoAlta> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirPermiso("vacaciones"));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parseo = esquemaAusencia.safeParse({
    tipo: texto(entrada, "tipo"),
    fecha_inicio: texto(entrada, "fecha_inicio"),
    fecha_fin: texto(entrada, "fecha_fin"),
    comentario: texto(entrada, "comentario"),
    motivo: texto(entrada, "motivo"),
  });
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }
  const d = parseo.data;

  const politica = politicaDe(db, d.tipo);
  if (!politica || !politica.activo) {
    return { ok: false, error: "Ese tipo de ausencia no está disponible." };
  }
  if (politica.solo_gestor && !perfil.permisos.includes("gestion.vacaciones")) {
    return {
      ok: false,
      error: "Solo Recursos Humanos puede registrar este tipo de ausencia.",
    };
  }

  const resultado = await altaDeAusencia(
    db,
    {
      ...d,
      empleado_id: perfil.id,
      // La regla lo exige: quien registra lo suyo va siempre pendiente.
      estado: "pendiente",
    },
    leerArchivos(entrada),
    "No se pudo registrar la solicitud."
  );
  if (!resultado.ok) return resultado;

  // Confirmación a quien pide + aviso al grupo que resuelve (RR. HH.),
  // por correo y Telegram cuando los canales están activos.
  const asuntoSolicitud = "Registramos tu solicitud de ausencia — Plataforma E3";
  const cuerpoSolicitud = `Tu solicitud de ${etiquetaTipo(d.tipo, politica.etiqueta)} del ${d.fecha_inicio} al ${d.fecha_fin} quedó pendiente de revisión.`;
  const gestores = correosDeGestores(db).filter((c) => c !== perfil.email);
  const asuntoEquipo = "Nueva solicitud de ausencia por revisar — Plataforma E3";
  const cuerpoEquipo = `${perfil.nombre_completo} pidió ${etiquetaTipo(d.tipo, politica.etiqueta)} del ${d.fecha_inicio} al ${d.fecha_fin}. Revisa «Ausencias del equipo».`;
  await notificar(db, {
    correos: [perfil.email],
    telegram: telegramDe(asuntoSolicitud, cuerpoSolicitud),
    plantilla: "vacaciones_solicitada",
    asunto: asuntoSolicitud,
    cuerpo: cuerpoSolicitud,
  });
  if (gestores.length > 0) {
    await notificar(db, {
      correos: gestores,
      telegram: telegramDe(asuntoEquipo, cuerpoEquipo),
      plantilla: "vacaciones_solicitada",
      asunto: asuntoEquipo,
      cuerpo: cuerpoEquipo,
    });
  }

  revalidatePath("/vacaciones");
  revalidatePath("/gestion/vacaciones");
  return resultado;
}

// ---------------------------------------------------------------------------
// 1 bis. Los periodos de la persona que RR. HH. acaba de elegir
// ---------------------------------------------------------------------------

export async function consultarCiclosEmpleado(
  empleadoId: string
): Promise<
  { ok: true; ciclos: CicloVacaciones[] } | { ok: false; error: string }
> {
  let db;
  try {
    ({ db } = await exigirPermiso("gestion.vacaciones"));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (!/^[0-9a-f-]{36}$/i.test(empleadoId)) {
    return { ok: false, error: "Selecciona a la persona." };
  }

  const ciclos = ciclosVacacionesEmpleado(db, empleadoId, CICLOS_VISIBLES);
  return { ok: true, ciclos };
}

// ---------------------------------------------------------------------------
// 2. RR. HH. registra la ausencia de otra persona
// ---------------------------------------------------------------------------

const esquemaAltaGestor = esquemaAusencia.extend({
  empleado_id: z
    .string({ error: "Selecciona a la persona." })
    .uuid({ error: "Selecciona a la persona." }),
  estado: z
    .enum(ESTADOS_ALTA_GESTOR, {
      error: "El estado solo puede ser pendiente o aprobada.",
    })
    .default("aprobada"),
});

export async function registrarAusenciaDeEmpleado(
  entrada: FormData
): Promise<ResultadoAlta> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirPermiso("gestion.vacaciones"));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parseo = esquemaAltaGestor.safeParse({
    tipo: texto(entrada, "tipo"),
    fecha_inicio: texto(entrada, "fecha_inicio"),
    fecha_fin: texto(entrada, "fecha_fin"),
    comentario: texto(entrada, "comentario"),
    motivo: texto(entrada, "motivo"),
    empleado_id: texto(entrada, "empleado_id"),
    estado: texto(entrada, "estado"),
  });
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }
  const d = parseo.data;

  const politica = politicaDe(db, d.tipo);
  if (!politica || !politica.activo) {
    return { ok: false, error: "Ese tipo de ausencia no está disponible." };
  }

  const resultado = await altaDeAusencia(
    db,
    {
      tipo: d.tipo,
      fecha_inicio: d.fecha_inicio,
      fecha_fin: d.fecha_fin,
      comentario: d.comentario,
      motivo: d.motivo,
      empleado_id: d.empleado_id,
      estado: d.estado,
    },
    leerArchivos(entrada),
    "No se pudo registrar la ausencia."
  );
  if (!resultado.ok) return resultado;

  const nombre = nombreDe(db, d.empleado_id);
  registrarAuditoria(db, {
    categoria: "rrhh",
    accion: "ausencia.creada",
    entidad: "solicitudes_vacaciones",
    entidad_id: resultado.id,
    entidad_etiqueta: `${nombre} · ${etiquetaTipo(d.tipo, politica.etiqueta)} ${d.fecha_inicio}→${d.fecha_fin}`,
    actor: perfil,
    despues: {
      empleado_id: d.empleado_id,
      tipo: d.tipo,
      estado: d.estado,
      fecha_inicio: d.fecha_inicio,
      fecha_fin: d.fecha_fin,
      motivo: d.motivo ?? null,
    },
    metadatos: { comprobantes: leerArchivos(entrada).length },
  });

  revalidatePath("/vacaciones");
  revalidatePath("/gestion/vacaciones");
  return resultado;
}

// ---------------------------------------------------------------------------
// 3. El empleado cancela su solicitud (RR. HH. puede cancelar la de cualquiera)
// ---------------------------------------------------------------------------

const esquemaId = z
  .string({ error: "Identificador inválido." })
  .uuid({ error: "Identificador inválido." });

export async function cancelarSolicitud(id: string): Promise<Resultado> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirSesion());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (!esquemaId.safeParse(id).success) {
    return { ok: false, error: "Solicitud inválida." };
  }

  const antes = db
    .prepare(
      `select id, empleado_id, tipo, estado, fecha_inicio, fecha_fin, dias_habiles, motivo
       from solicitudes_vacaciones where id = ?`
    )
    .get(id) as
    | {
        id: string;
        empleado_id: string;
        tipo: string;
        estado: EstadoAusencia;
        fecha_inicio: string;
        fecha_fin: string;
        dias_habiles: number;
        motivo: string | null;
      }
    | undefined;
  if (!antes) return { ok: false, error: "La solicitud ya no existe." };

  const esGestor = perfil.permisos.includes("gestion.vacaciones");
  // Espejo del trigger: el dueño SOLO puede pendiente → cancelada; el gestor
  // puede cancelar cualquiera (e incluso una ya aprobada).
  if (antes.empleado_id === perfil.id && !esGestor && antes.estado !== "pendiente") {
    return { ok: false, error: "Solo puedes cancelar una solicitud pendiente" };
  }

  const ahora = new Date().toISOString();
  const resultado = db
    .prepare(
      `update solicitudes_vacaciones
       set estado = 'cancelada', resuelta_por = ?, resuelta_en = ?,
           editada_por = case when ? <> empleado_id then ? else editada_por end,
           editada_en = case when ? <> empleado_id then ? else editada_en end
       where id = ?`
    )
    .run(perfil.id, ahora, perfil.id, perfil.id, perfil.id, perfil.id, id);
  if (resultado.changes === 0) {
    return { ok: false, error: "No se pudo cancelar la solicitud." };
  }

  if (antes.empleado_id !== perfil.id) {
    const politica = politicaDe(db, antes.tipo);
    const nombre = nombreDe(db, antes.empleado_id);
    registrarAuditoria(db, {
      categoria: "rrhh",
      accion: "ausencia.resuelta",
      entidad: "solicitudes_vacaciones",
      entidad_id: id,
      entidad_etiqueta: `${nombre} · ${etiquetaTipo(antes.tipo, politica?.etiqueta)} ${antes.fecha_inicio}→${antes.fecha_fin}`,
      actor: perfil,
      antes,
      despues: { ...antes, estado: "cancelada" },
      metadatos: { cancelada_por_gestor: true },
    });
  }

  revalidatePath("/vacaciones");
  revalidatePath("/gestion/vacaciones");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 4. RR. HH. edita o resuelve una ausencia
// ---------------------------------------------------------------------------

const esquemaResolucion = z.object({
  id: z
    .string({ error: "Solicitud inválida." })
    .uuid({ error: "Solicitud inválida." }),
  estado: z.enum(ESTADOS_AUSENCIA, { error: "Estado inválido." }),
  fecha_inicio: z
    .string({ error: "Indica la fecha de inicio." })
    .regex(FECHA, { error: "Fecha de inicio inválida." }),
  fecha_fin: z
    .string({ error: "Indica la fecha de fin." })
    .regex(FECHA, { error: "Fecha de fin inválida." }),
  comentario_manager: z
    .string({ error: "El comentario no es válido." })
    .max(1000, { error: "El comentario no puede pasar de 1000 caracteres." })
    .optional(),
  tipo: z
    .enum(TIPOS_AUSENCIA, { error: "Elige un tipo de ausencia válido." })
    .optional(),
  motivo: z
    .string({ error: "El motivo no es válido." })
    .max(500, { error: "El motivo no puede pasar de 500 caracteres." })
    .optional(),
});

export async function actualizarSolicitud(
  entrada: z.input<typeof esquemaResolucion>
): Promise<Resultado> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirPermiso("gestion.vacaciones"));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parseo = esquemaResolucion.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }
  const d = parseo.data;

  const antes = db
    .prepare(
      `select id, empleado_id, tipo, estado, fecha_inicio, fecha_fin,
              dias_habiles, comentario_manager, motivo
       from solicitudes_vacaciones where id = ?`
    )
    .get(d.id) as
    | {
        id: string;
        empleado_id: string;
        tipo: TipoAusencia;
        estado: EstadoAusencia;
        fecha_inicio: string;
        fecha_fin: string;
        dias_habiles: number;
        comentario_manager: string | null;
        motivo: string | null;
      }
    | undefined;
  if (!antes) return { ok: false, error: "La solicitud ya no existe." };

  // Nadie resuelve lo suyo: aprobar/rechazar la propia queda bloqueado.
  if (
    antes.empleado_id === perfil.id &&
    d.estado !== antes.estado &&
    (d.estado === "aprobada" || d.estado === "rechazada")
  ) {
    return {
      ok: false,
      error: "Tu propia ausencia la tiene que resolver otra persona con permiso de Vacaciones.",
    };
  }

  const tipoFinal = d.tipo ?? antes.tipo;
  const cambiaronFechas =
    antes.fecha_inicio !== d.fecha_inicio || antes.fecha_fin !== d.fecha_fin;
  const esCancelacionSimple =
    (d.estado === "cancelada" || d.estado === "rechazada") && !cambiaronFechas;

  let dias_habiles = antes.dias_habiles;
  let ciclo_inicio = "";
  let ciclo_fin = "";

  if (!esCancelacionSimple) {
    // Revalida saldo, traslapes, aniversario… con el consumo anterior devuelto.
    try {
      const politica = politicaDe(db, tipoFinal);
      if (!politica) {
        return { ok: false, error: "Ese tipo de ausencia no está disponible." };
      }
      if (
        politica.requiere_evidencia &&
        !tieneAdjuntos(db, d.id)
      ) {
        return {
          ok: false,
          error: `«${politica.etiqueta}» exige comprobante y esta ausencia no tiene ninguno. Elimínala y vuelve a darla de alta con «Registrar ausencia».`,
        };
      }
      const validacion = validarConContexto(
        db,
        perfil,
        {
          tipo: tipoFinal,
          fecha_inicio: d.fecha_inicio,
          fecha_fin: d.fecha_fin,
          empleado_id: antes.empleado_id,
          estado: (d.estado === "aprobada"
            ? "aprobada"
            : "pendiente") as "aprobada" | "pendiente",
        },
        {
          id: antes.id,
          empleado_id: antes.empleado_id,
          tipo: antes.tipo,
          estado: antes.estado,
          fecha_inicio: antes.fecha_inicio,
          fecha_fin: antes.fecha_fin,
          dias_habiles: antes.dias_habiles,
        }
      );
      if (!validacion.ok) return { ok: false, error: validacion.error };
      dias_habiles = validacion.dias_habiles;
      ciclo_inicio = validacion.ciclo_inicio;
      ciclo_fin = validacion.ciclo_fin;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  const ahora = new Date().toISOString();
  const conCiclo = ciclo_inicio
    ? { ciclo_inicio, ciclo_fin }
    : {};
  const resultado = db
    .prepare(
      `update solicitudes_vacaciones
       set estado = ?, fecha_inicio = ?, fecha_fin = ?, tipo = ?,
           motivo = ?, comentario_manager = ?, dias_habiles = ?,
           ciclo_inicio = coalesce(?, ciclo_inicio),
           ciclo_fin = coalesce(?, ciclo_fin),
           resuelta_por = case
             when ? = 'pendiente' then null
             when ? in ('aprobada','rechazada','cancelada') and estado <> ? then ?
             else resuelta_por end,
           resuelta_en = case
             when ? = 'pendiente' then null
             when ? in ('aprobada','rechazada','cancelada') and estado <> ? then ?
             else resuelta_en end,
           editada_por = ?, editada_en = ?
       where id = ?`
    )
    .run(
      d.estado,
      d.fecha_inicio,
      d.fecha_fin,
      tipoFinal,
      d.motivo !== undefined ? d.motivo || null : antes.motivo,
      d.comentario_manager || null,
      dias_habiles,
      conCiclo.ciclo_inicio ?? null,
      conCiclo.ciclo_fin ?? null,
      d.estado,
      d.estado,
      d.estado,
      perfil.id,
      d.estado,
      d.estado,
      d.estado,
      perfil.id,
      perfil.id,
      ahora,
      d.id
    );

  if (resultado.changes === 0) {
    return { ok: false, error: "No se pudo actualizar la solicitud." };
  }

  // Resolvió (solo cambió el estado) vs. editó — para la bitácora.
  const soloResolvio =
    antes.estado !== d.estado &&
    (d.estado === "aprobada" || d.estado === "rechazada") &&
    antes.fecha_inicio === d.fecha_inicio &&
    antes.fecha_fin === d.fecha_fin &&
    (d.tipo === undefined || d.tipo === antes.tipo) &&
    (d.motivo === undefined || (d.motivo || null) === antes.motivo);

  const politicaFinal = politicaDe(db, tipoFinal);
  const nombre = nombreDe(db, antes.empleado_id);
  registrarAuditoria(db, {
    categoria: "rrhh",
    accion: soloResolvio ? "ausencia.resuelta" : "ausencia.editada",
    entidad: "solicitudes_vacaciones",
    entidad_id: d.id,
    entidad_etiqueta: `${nombre} · ${etiquetaTipo(tipoFinal, politicaFinal?.etiqueta)} ${d.fecha_inicio}→${d.fecha_fin}`,
    actor: perfil,
    antes,
    despues: { ...antes, estado: d.estado, fecha_inicio: d.fecha_inicio, fecha_fin: d.fecha_fin, tipo: tipoFinal },
  });

  // Aviso al afectado (multicanal): resuelta o editada por RR. HH.
  const afectado = db
    .prepare("select email from perfiles where id = ?")
    .get(antes.empleado_id) as { email: string } | undefined;
  if (afectado && soloResolvio) {
    const asunto =
      d.estado === "aprobada"
        ? "Aprobaron tu solicitud — Plataforma E3"
        : "Revisaron tu solicitud — Plataforma E3";
    const cuerpo = `Tu solicitud ${antes.fecha_inicio} → ${antes.fecha_fin} quedó ${d.estado}.${d.comentario_manager ? ` Comentario: ${d.comentario_manager}` : ""}`;
    await notificar(db, {
      correos: [afectado.email],
      telegram: telegramDe(asunto, cuerpo),
      plantilla: "vacaciones_resuelta",
      asunto,
      cuerpo,
    });
  } else if (afectado && antes.empleado_id !== perfil.id) {
    const asunto = "Editaron tu solicitud — Plataforma E3";
    const cuerpo = `Recursos Humanos ajustó tu ausencia: ahora es ${etiquetaTipo(tipoFinal, politicaFinal?.etiqueta)} del ${d.fecha_inicio} al ${d.fecha_fin}, en estado ${d.estado}.`;
    await notificar(db, {
      correos: [afectado.email],
      telegram: telegramDe(asunto, cuerpo),
      plantilla: "vacaciones_editada",
      asunto,
      cuerpo,
    });
  }

  revalidatePath("/vacaciones");
  revalidatePath("/gestion/vacaciones");
  return { ok: true };
}

function tieneAdjuntos(
  db: ReturnType<typeof import("@/lib/db").base>,
  solicitudId: string
): boolean {
  const fila = db
    .prepare("select count(*) as n from ausencia_adjuntos where solicitud_id = ?")
    .get(solicitudId) as { n: number };
  return Number(fila.n) > 0;
}

// ---------------------------------------------------------------------------
// 5. RR. HH. elimina una ausencia
// ---------------------------------------------------------------------------

export async function eliminarAusencia(id: string): Promise<Resultado> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirPermiso("gestion.vacaciones"));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (!esquemaId.safeParse(id).success) {
    return { ok: false, error: "Ausencia inválida." };
  }

  const fila = db
    .prepare(
      `select id, empleado_id, tipo, estado, fecha_inicio, fecha_fin, dias_habiles, motivo
       from solicitudes_vacaciones where id = ?`
    )
    .get(id) as
    | {
        id: string;
        empleado_id: string;
        tipo: string;
        estado: string;
        fecha_inicio: string;
        fecha_fin: string;
        dias_habiles: number;
        motivo: string | null;
      }
    | undefined;
  if (!fila) return { ok: false, error: "La ausencia ya no existe." };

  // Los archivos se borran ANTES que la fila (misma razón que el original:
  // si la fila desaparece primero, nadie ve la carpeta para barrerla).
  const objetos = db
    .prepare("select ruta from ausencia_adjuntos where solicitud_id = ?")
    .all(id) as { ruta: string }[];
  let comprobantesBorrados = 0;
  try {
    for (const o of objetos) {
      unlinkSync(join(carpetaEvidencia(), o.ruta));
      comprobantesBorrados += 1;
    }
  } catch {
    return {
      ok: false,
      error:
        "No se pudieron borrar los comprobantes de la ausencia, así que no se eliminó. Inténtalo de nuevo.",
    };
  }

  const resultado = db
    .prepare("delete from solicitudes_vacaciones where id = ?")
    .run(id);
  if (resultado.changes === 0) {
    return { ok: false, error: "No se pudo eliminar la ausencia." };
  }

  const nombre = nombreDe(db, fila.empleado_id);
  registrarAuditoria(db, {
    categoria: "rrhh",
    accion: "ausencia.eliminada",
    entidad: "solicitudes_vacaciones",
    entidad_id: id,
    entidad_etiqueta: `${nombre} · ${etiquetaTipo(fila.tipo)} ${fila.fecha_inicio}→${fila.fecha_fin}`,
    actor: perfil,
    antes: fila,
    metadatos: { comprobantes_borrados: comprobantesBorrados },
  });

  revalidatePath("/vacaciones");
  revalidatePath("/gestion/vacaciones");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 6. Descarga de evidencia
// ---------------------------------------------------------------------------

/**
 * Ruta firmada equivalente: aquí devolvemos el enlace interno
 * `/api/evidencia/{id}`, que valida sesión y permiso ANTES de servir el
 * archivo (el sustituto local de la URL firmada de 60 s del original).
 */
export async function descargarEvidencia(
  adjuntoId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await exigirSesion();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (!esquemaId.safeParse(adjuntoId).success) {
    return { ok: false, error: "Comprobante inválido." };
  }

  const adjunto = (await import("@/lib/db"))
    .base()
    .prepare("select id from ausencia_adjuntos where id = ?")
    .get(adjuntoId);
  if (!adjunto) return { ok: false, error: "Comprobante no encontrado." };

  return { ok: true, url: `/api/evidencia/${adjuntoId}` };
}

// ---------------------------------------------------------------------------
// 7. Días festivos
// ---------------------------------------------------------------------------

const esquemaFestivo = z.object({
  fecha: z
    .string({ error: "Indica la fecha del festivo." })
    .regex(FECHA, { error: "Fecha inválida." }),
  nombre: z
    .string({ error: "Ponle nombre al festivo." })
    .min(3, { error: "Nombre demasiado corto" })
    .max(120, { error: "El nombre no puede pasar de 120 caracteres." }),
});

export async function agregarFestivo(
  entrada: z.input<typeof esquemaFestivo>
): Promise<Resultado> {
  let db;
  try {
    ({ db } = await exigirPermiso("gestion.festivos"));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parseo = esquemaFestivo.safeParse(entrada);
  if (!parseo.success) return { ok: false, error: parseo.error.issues[0].message };

  try {
    db.prepare(
      "insert into dias_festivos (fecha, nombre, oficial) values (?, ?, 0)"
    ).run(parseo.data.fecha, parseo.data.nombre);
  } catch {
    return { ok: false, error: "No se pudo agregar (¿la fecha ya existe?)." };
  }

  revalidatePath("/gestion/festivos");
  return { ok: true };
}

export async function eliminarFestivo(fecha: string): Promise<Resultado> {
  let db;
  try {
    ({ db } = await exigirPermiso("gestion.festivos"));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (!FECHA.test(fecha)) return { ok: false, error: "Fecha inválida." };

  const resultado = db
    .prepare("delete from dias_festivos where fecha = ?")
    .run(fecha);
  if (resultado.changes === 0) {
    return { ok: false, error: "No se pudo eliminar el festivo." };
  }

  revalidatePath("/gestion/festivos");
  return { ok: true };
}

export async function generarFestivosAnio(
  anio: number
): Promise<{ ok: true; insertados: number } | { ok: false; error: string }> {
  let db;
  try {
    ({ db } = await exigirPermiso("gestion.festivos"));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (!Number.isInteger(anio) || anio < 2024 || anio > 2100) {
    return { ok: false, error: "Año inválido." };
  }

  const { festivosOficialesDeAnio } = await import("@/lib/db/semilla");
  const insertar = db.prepare(
    "insert or ignore into dias_festivos (fecha, nombre, oficial) values (?, ?, 1)"
  );
  let insertados = 0;
  for (const [fecha, nombre] of festivosOficialesDeAnio(anio)) {
    const r = insertar.run(fecha, nombre);
    insertados += Number(r.changes);
  }

  revalidatePath("/gestion/festivos");
  return { ok: true, insertados };
}

// Utilidad compartida: ciclos propios (la banda de aviso del layout la lee).
export async function ciclosPropios(): Promise<CicloVacaciones[]> {
  const { db, perfil } = await exigirSesion();
  return misCiclosVacaciones(db, perfil.id, CICLOS_VISIBLES);
}
