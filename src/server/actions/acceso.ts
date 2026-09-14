"use server";

import { redirect } from "next/navigation";
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
