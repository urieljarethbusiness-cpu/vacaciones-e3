"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { base } from "@/lib/db";
import { hashContrasena } from "@/lib/db/semilla";
import { esAdmin, type RolBase } from "@/lib/permisos";
import { exigirAdmin } from "@/server/autorizacion";
import { destruirSesionesDe } from "@/server/sesiones-admin";
import { registrarAuditoria } from "@/server/auditoria";
import { notificar } from "@/server/notificador";

type Resultado = { ok: true } | { ok: false; error: string };

const DIAS_VIGENCIA_INVITACION = 7;
const MIN_CONTRASENA = 8;

function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

/** Origen absoluto para el enlace de invitación (env o cabecera Host). */
async function origenApp(): Promise<string> {
  const deEntorno = process.env.NEXT_PUBLIC_APP_URL;
  if (deEntorno) return deEntorno.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3100";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

/** Dominio de un correo, en minúsculas. */
function dominioDeCorreo(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase().trim();
}

async function dominiosActivos(): Promise<string[]> {
  return (
    base()
      .prepare("select dominio from dominios_empleado where activo = 1 order by dominio")
      .all() as unknown as { dominio: string }[]
  ).map((f) => f.dominio);
}

// ---------------------------------------------------------------------------
// Invitar a una persona del equipo (admins)
// ---------------------------------------------------------------------------

const esquemaInvitacion = z.object({
  nombre_completo: z
    .string({ error: "Escribe el nombre completo." })
    .min(3, { error: "Nombre demasiado corto" })
    .max(120, { error: "El nombre no puede pasar de 120 caracteres." }),
  email: z.email({ error: "Ese correo no es válido." }),
  rol: z.enum(["empleado", "manager", "admin"], {
    error: "Elige un rol válido.",
  }),
  telefono: z.string().max(40).optional(),
  fecha_ingreso: z
    .string({ error: "Indica la fecha de ingreso." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Fecha de ingreso inválida." }),
  puesto: z.string().max(120).optional(),
  area: z.string().max(120).optional(),
});

export async function invitarUsuario(
  entrada: z.input<typeof esquemaInvitacion>
): Promise<{ ok: true; enlace: string } | { ok: false; error: string }> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirAdmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parseo = esquemaInvitacion.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }
  const d = parseo.data;
  const email = d.email.toLowerCase().trim();

  // Guarda de rol: solo un admin invita managers; el superadmin NUNCA se invita.
  if ((d.rol === "manager" || d.rol === "admin") && !esAdmin(perfil.rol)) {
    return {
      ok: false,
      error: "Solo un administrador puede invitar encargados de área o administradores.",
    };
  }

  // El dominio del correo tiene que ser de la casa. La lista vive en la base
  // (dominios_empleado), como en el original: falla cerrado si está vacía.
  const permitidos = await dominiosActivos();
  if (permitidos.length === 0) {
    return {
      ok: false,
      error:
        "El alta de personal no está disponible ahora mismo. Pide a tu contacto en E3 que te dé de alta.",
    };
  }
  if (!permitidos.includes(dominioDeCorreo(email))) {
    return {
      ok: false,
      error: `Ese correo no es de la empresa. Usa tu cuenta ${permitidos
        .map((x) => `@${x}`)
        .join(" o ")}.`,
    };
  }

  const duplicado = db
    .prepare("select 1 from perfiles where lower(email) = ?")
    .get(email);
  if (duplicado) {
    return { ok: false, error: "Ese correo ya tiene una cuenta." };
  }

  // Borra invitaciones previas no aceptadas del mismo correo.
  db.prepare("delete from invitaciones where lower(email) = ? and aceptada_en is null").run(email);

  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DIAS_VIGENCIA_INVITACION * 86_400_000).toISOString();
  db.prepare(
    `insert into invitaciones
      (id, email, nombre_completo, telefono, rol, fecha_ingreso, puesto, area,
       token_hash, expira_en, creada_por)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    email,
    d.nombre_completo,
    d.telefono ?? null,
    d.rol,
    d.fecha_ingreso,
    d.puesto ?? null,
    d.area ?? null,
    sha256(token),
    expira,
    perfil.id
  );

  registrarAuditoria(db, {
    categoria: "seguridad",
    accion: "invitacion.creada",
    entidad: "invitaciones",
    entidad_etiqueta: `${d.nombre_completo} · ${email}`,
    actor: perfil,
    despues: { email, rol: d.rol, fecha_ingreso: d.fecha_ingreso },
  });

  const enlace = `${await origenApp()}/invitacion/${token}`;
  await notificar(db, {
    correos: [email],
    plantilla: "invitacion",
    asunto: "Te damos la bienvenida a Plataforma E3",
    cuerpo: `${d.nombre_completo}: tu cuenta está lista. Actívala con este enlace (caduca en ${DIAS_VIGENCIA_INVITACION} días): ${enlace}`,
  });

  revalidatePath("/configuracion/usuarios");
  return { ok: true, enlace };
}

// ---------------------------------------------------------------------------
// Aceptar la invitación: definir contraseña y activar la cuenta
// ---------------------------------------------------------------------------

const esquemaAceptar = z.object({
  token: z.string().min(10),
  contrasena: z
    .string({ error: "Escribe una contraseña." })
    .min(MIN_CONTRASENA, {
      error: `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres`,
    })
    .max(72),
  confirmacion: z.string(),
});

export async function aceptarInvitacion(
  entrada: z.input<typeof esquemaAceptar>
): Promise<Resultado> {
  const parseo = esquemaAceptar.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }
  const { token, contrasena, confirmacion } = parseo.data;
  if (contrasena !== confirmacion) {
    return { ok: false, error: "Las contraseñas no coinciden." };
  }

  const db = base();
  const inv = db
    .prepare("select * from invitaciones where token_hash = ?")
    .get(sha256(token)) as
    | {
        id: string;
        email: string;
        nombre_completo: string;
        telefono: string | null;
        rol: RolBase;
        fecha_ingreso: string | null;
        puesto: string | null;
        area: string | null;
        expira_en: string;
        aceptada_en: string | null;
      }
    | undefined;
  if (!inv) return { ok: false, error: "Invitación no encontrada." };
  if (inv.aceptada_en) {
    return { ok: false, error: "Esta invitación ya fue utilizada." };
  }
  if (new Date(inv.expira_en).getTime() < Date.now()) {
    return { ok: false, error: "Esta invitación ha expirado." };
  }

  const ahora = new Date().toISOString();
  const id = randomUUID();
  try {
    db.prepare(
      `insert into perfiles (id, email, contrasena_hash, nombre_completo, telefono, rol, activo, activado_en)
       values (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      inv.email,
      hashContrasena(contrasena),
      inv.nombre_completo,
      inv.telefono,
      inv.rol,
      ahora
    );
    if (inv.fecha_ingreso) {
      db.prepare(
        "insert into empleados (id, fecha_ingreso, puesto, area) values (?, ?, ?, ?)"
      ).run(id, inv.fecha_ingreso, inv.puesto, inv.area);
    }
    db.prepare("update invitaciones set aceptada_en = ? where id = ?").run(ahora, inv.id);
  } catch {
    // Rollback manual: no dejar un perfil a medias.
    db.prepare("delete from empleados where id = ?").run(id);
    db.prepare("delete from perfiles where id = ?").run(id);
    return { ok: false, error: "No se pudo activar la cuenta. Inténtalo de nuevo." };
  }

  registrarAuditoria(db, {
    categoria: "seguridad",
    accion: "invitacion.aceptada",
    entidad: "perfiles",
    entidad_id: id,
    entidad_etiqueta: `${inv.nombre_completo} · ${inv.email}`,
    actor: {
      id,
      email: inv.email,
      nombre_completo: inv.nombre_completo,
      rol: inv.rol,
    },
    despues: { rol: inv.rol },
  });

  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cambio de rol, baja y reactivación
// ---------------------------------------------------------------------------

export async function cambiarRol(entrada: {
  perfilId: string;
  rol: RolBase;
}): Promise<Resultado> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirAdmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (entrada.perfilId === perfil.id) {
    return { ok: false, error: "No puedes cambiar tu propio rol." };
  }
  if (!["empleado", "manager", "admin", "superadmin"].includes(entrada.rol)) {
    return { ok: false, error: "Rol inválido." };
  }
  // Solo otro superadmin concede o retira el rol dueño.
  if (entrada.rol === "superadmin" && perfil.rol !== "superadmin") {
    return {
      ok: false,
      error: "Solo un Superadministrador puede otorgar ese rol.",
    };
  }
  const objetivo = db
    .prepare("select id, rol, nombre_completo, email from perfiles where id = ?")
    .get(entrada.perfilId) as
    | { id: string; rol: string; nombre_completo: string; email: string }
    | undefined;
  if (!objetivo) return { ok: false, error: "Esa persona no existe." };
  if (objetivo.rol === "superadmin" && perfil.rol !== "superadmin") {
    return {
      ok: false,
      error: "Solo un Superadministrador puede modificar la cuenta de otro superadministrador.",
    };
  }

  db.prepare("update perfiles set rol = ? where id = ?").run(entrada.rol, entrada.perfilId);
  // El rol cambia lo que la persona puede ver: sus sesiones se renuevan.
  await destruirSesionesDe(db, entrada.perfilId);

  registrarAuditoria(db, {
    categoria: "seguridad",
    accion: "rol.cambiado",
    entidad: "perfiles",
    entidad_id: entrada.perfilId,
    entidad_etiqueta: `${objetivo.nombre_completo} · ${objetivo.email}`,
    actor: perfil,
    antes: { rol: objetivo.rol },
    despues: { rol: entrada.rol },
  });

  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}

export async function darDeBaja(perfilId: string): Promise<Resultado> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirAdmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (perfilId === perfil.id) {
    return { ok: false, error: "No puedes darte de baja a ti mismo." };
  }
  const objetivo = db
    .prepare("select nombre_completo, email, rol from perfiles where id = ?")
    .get(perfilId) as
    | { nombre_completo: string; email: string; rol: string }
    | undefined;
  if (!objetivo) return { ok: false, error: "Esa persona no existe." };

  const hoy = new Date().toISOString().slice(0, 10);
  db.prepare("update perfiles set activo = 0 where id = ?").run(perfilId);
  db.prepare("update empleados set fecha_baja = ? where id = ?").run(hoy, perfilId);
  await destruirSesionesDe(db, perfilId);

  registrarAuditoria(db, {
    categoria: "seguridad",
    accion: "usuario.baja",
    entidad: "perfiles",
    entidad_id: perfilId,
    entidad_etiqueta: `${objetivo.nombre_completo} · ${objetivo.email}`,
    actor: perfil,
    despues: { activo: 0, fecha_baja: hoy },
  });

  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}

export async function reactivar(perfilId: string): Promise<Resultado> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirAdmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const objetivo = db
    .prepare("select nombre_completo, email from perfiles where id = ?")
    .get(perfilId) as { nombre_completo: string; email: string } | undefined;
  if (!objetivo) return { ok: false, error: "Esa persona no existe." };

  db.prepare("update perfiles set activo = 1 where id = ?").run(perfilId);
  db.prepare("update empleados set fecha_baja = null where id = ?").run(perfilId);

  registrarAuditoria(db, {
    categoria: "seguridad",
    accion: "usuario.reactivado",
    entidad: "perfiles",
    entidad_id: perfilId,
    entidad_etiqueta: `${objetivo.nombre_completo} · ${objetivo.email}`,
    actor: perfil,
    despues: { activo: 1 },
  });

  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}
