"use client";

import { useState } from "react";
import { Loader2Icon, Zap } from "lucide-react";
import { toast } from "sonner";
import { iniciarSesionDemo } from "@/server/actions/acceso";

export type CuentaDemo = {
  email: string;
  nombre: string;
  descripcion: string;
};

/**
 * MAGIC LOGIN DE LA DEMO: un botón por cuenta sembrada, sin contraseña.
 * Solo se renderiza cuando la plataforma corre con PERMITIR_ACCESO_DEMO=1.
 */
export function AccesoRapidoDemo({ cuentas }: { cuentas: CuentaDemo[] }) {
  const [entrando, setEntrando] = useState<string | null>(null);

  async function entrar(email: string) {
    setEntrando(email);
    const r = await iniciarSesionDemo({ email });
    if (!r.ok) {
      toast.error(r.error);
      setEntrando(null);
      return;
    }
    window.location.replace("/");
  }

  return (
    <div className="mt-7 rounded-[14px] border border-primary/30 bg-primary/[0.06] p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-white/90">
        <Zap className="size-4 text-primary" aria-hidden />
        Acceso rápido de demostración
      </p>
      <p className="mt-1 text-xs leading-[1.6] text-white/60">
        Un clic entra con la cuenta, sin contraseña. Solo existe en esta demo
        de prueba.
      </p>
      <div className="mt-3 grid gap-1.5">
        {cuentas.map((c) => (
          <button
            key={c.email}
            type="button"
            onClick={() => entrar(c.email)}
            disabled={entrando !== null}
            className="flex min-h-11 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-left outline-none transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white/90">
                {c.nombre}
              </span>
              <span className="block truncate text-xs text-white/55">
                {c.descripcion}
              </span>
            </span>
            {entrando === c.email ? (
              <Loader2Icon
                className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                aria-hidden
              />
            ) : (
              <span className="shrink-0 text-xs font-medium text-primary">
                Entrar
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
