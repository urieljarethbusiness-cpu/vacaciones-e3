import { perfilActual, type PerfilSesion } from "./sesiones";

/**
 * Guardas de las server actions — espejo de src/server/autorizacion.ts del
 * original. Para acciones LANZAN Error (el contrato {ok:false,error} lo
 * traduce cada acción); las páginas tienen sus variantes en src/lib/perfil.ts.
 */

type Sesion = { db: ReturnType<typeof import("@/lib/db").base>; perfil: PerfilSesion };

export async function exigirSesion(): Promise<Sesion> {
  const perfil = await perfilActual();
  if (!perfil) throw new Error("No has iniciado sesión.");
  const { base } = await import("@/lib/db");
  return { db: base(), perfil };
}

export async function exigirPermiso(clave: string): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (!sesion.perfil.permisos.includes(clave)) {
    throw new Error("No tienes permiso para realizar esta acción.");
  }
  return sesion;
}

export async function exigirAdmin(): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (sesion.perfil.rol !== "admin" && sesion.perfil.rol !== "superadmin") {
    throw new Error("Requiere permisos de administrador.");
  }
  return sesion;
}
