import { NextResponse, type NextRequest } from "next/server";

/**
 * Guarda de rutas (equivalente de `src/proxy.ts` del original).
 *
 * SOLO mira la presencia de la cookie de sesión, no su validez: el runtime del
 * proxy no abre la base de datos, y la validación de verdad la hace el
 * servidor en `obtenerPerfilOredirigir()`. Aquí va lo barato: mandar al anónimo
 * a /login y sacar de /login a quien ya trae sesión.
 */

const RUTAS_PUBLICAS = ["/login", "/invitacion"];

function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(ruta + "/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const traeSesion = request.cookies.has("e3-vacaciones-sesion");

  if (!traeSesion && !esRutaPublica(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (traeSesion && esRutaPublica(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/panel";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico|api/health|marca/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
};
