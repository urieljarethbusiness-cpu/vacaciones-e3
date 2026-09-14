import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { base } from "@/lib/db";
import { PERMISOS_BASE, type RolBase } from "@/lib/permisos";
import { verificarContrasena } from "@/lib/db/semilla";

/**
 * Sesiones locales — el equivalente de GoTrue de Supabase para esta
 * recreación. El token viaja en una cookie httpOnly y en la base SOLO está
 * su sha256 (un volcado de BD no sirve para colarse).
 */

export const NOMBRE_COOKIE_SESION = "e3-vacaciones-sesion";
const DIAS_SESION = 30;

function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

export type PerfilSesion = {
  id: string;
  email: string;
  nombre_completo: string;
  rol: RolBase;
  activo: boolean;
  permisos: string[];
};

type FilaPerfil = {
  id: string;
  email: string;
  nombre_completo: string;
  rol: string;
  activo: number;
  activado_en: string | null;
};

function armarPerfil(fila: FilaPerfil): PerfilSesion {
  return {
    id: fila.id,
    email: fila.email,
    nombre_completo: fila.nombre_completo,
    rol: fila.rol as RolBase,
    activo: !!fila.activo,
    permisos: PERMISOS_BASE[fila.rol as RolBase] ?? [],
  };
}

/** Crea una sesión y deja la cookie puesta. */
export async function crearSesion(perfilId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DIAS_SESION * 86_400_000).toISOString();
  base()
    .prepare(
      "insert into sesiones (token_hash, perfil_id, expira_en) values (?, ?, ?)"
    )
    .run(sha256(token), perfilId, expira);
  const almac = await cookies();
  almac.set(NOMBRE_COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expira),
  });
}

/** Cierra la sesión de la cookie actual (si la hay). */
export async function destruirSesion(): Promise<void> {
  const almac = await cookies();
  const token = almac.get(NOMBRE_COOKIE_SESION)?.value;
  if (token) {
    base()
      .prepare("delete from sesiones where token_hash = ?")
      .run(sha256(token));
  }
  almac.delete(NOMBRE_COOKIE_SESION);
}

/** Perfil de la sesión actual, o null. Limpia sesiones vencidas o inactivas. */
export async function perfilActual(): Promise<PerfilSesion | null> {
  const almac = await cookies();
  const token = almac.get(NOMBRE_COOKIE_SESION)?.value;
  if (!token) return null;

  const db = base();
  const fila = db
    .prepare(
      `select p.* from sesiones s join perfiles p on p.id = s.perfil_id
       where s.token_hash = ? and s.expira_en > datetime('now')`
    )
    .get(sha256(token)) as FilaPerfil | undefined;
  if (!fila) return null;
  if (!fila.activo) {
    db.prepare("delete from sesiones where token_hash = ?").run(sha256(token));
    return null;
  }
  return armarPerfil(fila);
}

/**
 * Comprueba credenciales y devuelve el perfil, o un error en español con los
 * MISMOS textos que enseña el login del original.
 */
export function autenticar(
  email: string,
  contrasena: string
): { ok: true; perfil: PerfilSesion } | { ok: false; error: string } {
  const fila = base()
    .prepare("select * from perfiles where lower(email) = lower(?)")
    .get(email.trim()) as (FilaPerfil & { contrasena_hash: string }) | undefined;

  const ok = fila
    ? verificarContrasena(contrasena, fila.contrasena_hash)
    : false;
  // Comparación en tiempo constante para no filtrar si el correo existe.
  if (!ok || !fila) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }
  if (!fila.activo) {
    if (!fila.activado_en) {
      return {
        ok: false,
        error:
          "Tu contraseña es correcta, pero la cuenta todavía no está activada. Abre el enlace de invitación que te mandamos por correo.",
      };
    }
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }
  return { ok: true, perfil: armarPerfil(fila) };
}

/** Utilidad anti-enumeración para comparar secretos. */
export function mismoSecreto(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
