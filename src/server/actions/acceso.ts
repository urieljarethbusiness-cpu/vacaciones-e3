"use server";

import { redirect } from "next/navigation";
import { base } from "@/lib/db";
import { autenticar, crearSesion, destruirSesion } from "@/server/sesiones";

type Resultado = { ok: true } | { ok: false; error: string; pendiente?: boolean };

/**
 * Inicia sesión con credenciales locales. El formulario cliente redirige con
 * `window.location.replace("/")` al recibir `ok`, igual que el original:
 * una navegación completa evita que la redirección por rol rompa el fetch RSC.
 */
export async function iniciarSesion(entrada: {
  email: string;
  contrasena: string;
}): Promise<Resultado> {
  const email = typeof entrada.email === "string" ? entrada.email : "";
  const contrasena =
    typeof entrada.contrasena === "string" ? entrada.contrasena : "";
  if (!email.trim() || !contrasena) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }

  const resultado = autenticar(email, contrasena);
  if (!resultado.ok) {
    return {
      ok: false,
      error: resultado.error,
      pendiente: resultado.error.includes("todavía no está activada"),
    };
  }

  await crearSesion(resultado.perfil.id);
  return { ok: true };
}

export async function cerrarSesion(): Promise<void> {
  await destruirSesion();
  redirect("/login");
}

/**
 * MAGIC LOGIN DE DEMOSTRACIÓN — entra con un clic, sin contraseña.
 *
 * SOLO funciona cuando la plataforma corre en modo demo
 * (`PERMITIR_ACCESO_DEMO=1`) y SOLO para las cuentas sembradas de prueba:
 * en producción la acción se niega siempre, aunque alguien descubra la ruta.
 */
const CUENTAS_DEMO = new Set([
  "superadmin@consultoriae3.com",
  "rrhh@grupo-e3.com",
  "encargado@grupo-e3.com",
  "ana@consultoriae3.com",
  "luis@grupo-e3.com",
  "fernanda@consultoriae3.com",
  "ricardo@grupo-e3.com",
  "paola@grupo-e3.com",
  "sofia@consultoriae3.com",
]);

export async function iniciarSesionDemo(entrada: {
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.PERMITIR_ACCESO_DEMO !== "1") {
    return { ok: false, error: "El acceso rápido de demostración está apagado." };
  }
  const email =
    typeof entrada?.email === "string" ? entrada.email.toLowerCase().trim() : "";
  if (!CUENTAS_DEMO.has(email)) {
    return { ok: false, error: "Esa cuenta no es de la demostración." };
  }

  const fila = base()
    .prepare("select id, activo from perfiles where lower(email) = ?")
    .get(email) as { id: string; activo: number } | undefined;
  if (!fila || !fila.activo) {
    return { ok: false, error: "Esa cuenta de demostración no está disponible." };
  }

  await crearSesion(fila.id);
  return { ok: true };
}

/** ¿La plataforma corre en modo demo? (pinta los botones de acceso rápido) */
export async function modoDemoActivo(): Promise<boolean> {
  return process.env.PERMITIR_ACCESO_DEMO === "1";
}
