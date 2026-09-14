"use client";

import { useState } from "react";
import Link from "next/link";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { iniciarSesion } from "@/server/actions/acceso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvisoError } from "@/components/auth/aviso-error";
import {
  BOTON,
  CAMPO,
  ENLACE,
  ENTRADILLA,
  ETIQUETA,
  TITULO,
} from "@/components/auth/estilos-acceso";

/**
 * EL formulario de inicio de sesión — mismo comportamiento que el original:
 * error EN LÍNEA (nunca toast), dos mensajes según el fallo, y navegación
 * completa con `window.location.replace` para que la redirección por rol no
 * rompa el fetch RSC.
 */
export function FormularioAcceso({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [verContrasena, setVerContrasena] = useState(false);
  const [fallo, setFallo] = useState<{ texto: string; pendiente: boolean } | null>(
    null
  );
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setFallo(null);
    setCargando(true);

    const resultado = await iniciarSesion({ email, contrasena });

    if (!resultado.ok) {
      setFallo({
        texto: resultado.error,
        pendiente: resultado.pendiente ?? false,
      });
      setCargando(false);
      return;
    }

    window.location.replace("/");
  }

  return (
    <>
      <h1 className={TITULO}>Sistema de Vacaciones E3</h1>
      <p className={ENTRADILLA}>
        Entra con tu correo de Consultoría E3 y mira tus días.
      </p>

      <form onSubmit={enviar} className="mt-8 grid gap-[1.375rem]">
        <div className="grid gap-2">
          <Label htmlFor="email" className={ETIQUETA}>
            Correo electrónico
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="tu.nombre@consultoriae3.com"
            required
            aria-invalid={fallo ? true : undefined}
            aria-describedby={fallo ? "error-acceso" : undefined}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fallo) setFallo(null);
            }}
            className={CAMPO}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="contrasena" className={ETIQUETA}>
            Contraseña
          </Label>
          <div className="relative">
            <Input
              id="contrasena"
              name="contrasena"
              type={verContrasena ? "text" : "password"}
              autoComplete="current-password"
              enterKeyHint="go"
              placeholder="Tu contraseña"
              required
              aria-invalid={fallo ? true : undefined}
              aria-describedby={fallo ? "error-acceso" : undefined}
              value={contrasena}
              onChange={(e) => {
                setContrasena(e.target.value);
                if (fallo) setFallo(null);
              }}
              className={`${CAMPO} pr-14`}
            />
            <button
              type="button"
              onClick={() => setVerContrasena((v) => !v)}
              aria-pressed={verContrasena}
              aria-label={
                verContrasena ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              className="absolute inset-y-0 right-0 flex w-[3.25rem] items-center justify-center rounded-r-[14px] text-white/70 transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              {verContrasena ? (
                <EyeOffIcon className="size-5" aria-hidden="true" />
              ) : (
                <EyeIcon className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {fallo && (
          <AvisoError id="error-acceso">
            {fallo.texto}
            {fallo.pendiente && (
              <>
                {" "}
                <Link
                  href="/login"
                  className="font-medium underline underline-offset-4"
                >
                  Volver a intentar
                </Link>
                .
              </>
            )}
          </AvisoError>
        )}

        <Button
          type="submit"
          disabled={cargando}
          aria-busy={cargando}
          className={BOTON}
        >
          {cargando ? (
            <>
              <Loader2Icon
                className="size-[1.125rem] animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Entrando…
            </>
          ) : (
            "Iniciar sesión"
          )}
        </Button>
      </form>

      <div className="mt-4 flex justify-center">
        <span className="text-sm text-white/50">
          Si no tienes cuenta, Recursos Humanos te envió una invitación por
          correo.
        </span>
      </div>

      {children}
    </>
  );
}
