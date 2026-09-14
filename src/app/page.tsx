import { redirect } from "next/navigation";
import { perfilActual } from "@/server/sesiones";

/**
 * La raíz reparte por ROL, no por URL: con sesión activa todo el mundo
 * interno cae en el Panel; sin sesión, el proxy ya mandó a /login.
 */
export default async function PaginaRaiz() {
  const perfil = await perfilActual();
  redirect(perfil ? "/panel" : "/login");
}
