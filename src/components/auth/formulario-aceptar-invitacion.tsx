"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { aceptarInvitacion } from "@/server/actions/usuarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvisoError } from "@/components/auth/aviso-error";
import { BOTON, CAMPO, ETIQUETA } from "@/components/auth/estilos-acceso";

/**
 * Activa la cuenta desde la invitación: contraseña con confirmación, un solo
 * ojo para ambos campos y error EN LÍNEA (salvo el éxito, que avisa con toast
 * y manda al login, igual que el original).
 */
export function FormularioAceptarInvitacion({ token }: { token: string }) {
  const router = useRouter();
  const [contrasena, setContrasena] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [ver, setVer] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setFallo(null);
    setCargando(true);

    const resultado = await aceptarInvitacion({ token, contrasena, confirmacion });

    if (!resultado.ok) {
      setFallo(resultado.error);
      setCargando(false);
      return;
    }

    toast.success("Cuenta activada. Ahora inicia sesión.");
    router.replace("/login");
  }

  return (
    <form onSubmit={enviar} className="mt-7 grid gap-[1.375rem]">
      <div className="grid gap-2">
        <Label htmlFor="contrasena" className={ETIQUETA}>
          Contraseña
        </Label>
        <div className="relative">
          <Input
            id="contrasena"
            type={ver ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            required
            aria-invalid={fallo ? true : undefined}
            value={contrasena}
            onChange={(e) => {
              setContrasena(e.target.value);
              if (fallo) setFallo(null);
            }}
            className={`${CAMPO} pr-14`}
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            aria-pressed={ver}
            aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex w-[3.25rem] items-center justify-center rounded-r-[14px] text-white/70 transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            {ver ? (
              <EyeOffIcon className="size-5" aria-hidden="true" />
            ) : (
              <EyeIcon className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirmacion" className={ETIQUETA}>
          Repite la contraseña
        </Label>
        <Input
          id="confirmacion"
          type={ver ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Repite la contraseña"
          required
          aria-invalid={fallo ? true : undefined}
          aria-describedby={fallo ? "error-invitacion" : undefined}
          value={confirmacion}
          onChange={(e) => {
            setConfirmacion(e.target.value);
            if (fallo) setFallo(null);
          }}
          className={CAMPO}
        />
      </div>

      {fallo && (
        <AvisoError id="error-invitacion">{fallo}</AvisoError>
      )}

      <Button type="submit" disabled={cargando} aria-busy={cargando} className={BOTON}>
        {cargando ? (
          <>
            <Loader2Icon
              className="size-[1.125rem] animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Activando…
          </>
        ) : (
          "Activar mi cuenta"
        )}
      </Button>
    </form>
  );
}
