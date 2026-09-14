import { redirect } from "next/navigation";
import { perfilActual, type PerfilSesion } from "@/server/sesiones";

/**
 * Guardas de páginas — espejo de src/lib/perfil.ts del original:
 * `obtenerPerfilOredirigir` para pantallas internas y `exigirPermisoPagina`
 * para las que necesitan una clave concreta.
 */

export async function obtenerPerfilOredirigir(): Promise<PerfilSesion> {
  const perfil = await perfilActual();
  if (!perfil) redirect("/login");
  return perfil;
}

export async function exigirPermisoPagina(clave: string): Promise<PerfilSesion> {
  const perfil = await obtenerPerfilOredirigir();
  if (!perfil.permisos.includes(clave)) redirect("/panel");
  return perfil;
}

/** Las pantallas de Configuración no se delegan: solo rol base admin. */
export async function exigirAdminPagina(): Promise<PerfilSesion> {
  const perfil = await obtenerPerfilOredirigir();
  if (perfil.rol !== "admin" && perfil.rol !== "superadmin") redirect("/panel");
  return perfil;
}

/** Exclusivo del Superadministrador (credenciales de canales de aviso). */
export async function exigirSuperadminPagina(): Promise<PerfilSesion> {
  const perfil = await obtenerPerfilOredirigir();
  if (perfil.rol !== "superadmin") redirect("/panel");
  return perfil;
}
