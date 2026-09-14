"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2Icon, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { invitarUsuario } from "@/server/actions/usuarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Rótulo «@grupo-e3.com o @consultoriae3.com» a partir de la lista viva. */
function listaDominios(dominios: string[]): string {
  return dominios.map((d) => `@${d}`).join(" o ");
}

type Props = {
  dominios: string[];
  puedeInvitarManagers: boolean;
};

/**
 * Alta de una persona del equipo por invitación. El correo TIENE que ser de
 * los dominios de la casa (los mismos que valida el servidor y la base).
 */
export function DialogoInvitar({ dominios, puedeInvitarManagers }: Props) {
  const router = useRouter();
  const [abierto, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const rotulo = listaDominios(dominios);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const datos = new FormData(e.currentTarget);

    const resultado = await invitarUsuario({
      nombre_completo: String(datos.get("nombre_completo") ?? ""),
      email: String(datos.get("email") ?? ""),
      rol: String(datos.get("rol") ?? "empleado") as
        | "empleado"
        | "manager"
        | "admin",
      telefono: String(datos.get("telefono") ?? "") || undefined,
      fecha_ingreso: String(datos.get("fecha_ingreso") ?? ""),
      puesto: String(datos.get("puesto") ?? "") || undefined,
      area: String(datos.get("area") ?? "") || undefined,
    });

    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setEnlace(resultado.enlace);
    toast.success("Invitación creada. Compártele el enlace o avísale por correo.");
    router.refresh();
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setEnlace(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> Invitar persona
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        {enlace ? (
          <>
            <DialogHeader>
              <DialogTitle>Invitación lista</DialogTitle>
              <DialogDescription>
                Se generará un enlace de invitación válido por 7 días. La
                persona lo abre, elige su contraseña y su cuenta queda activa.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <code className="block max-h-24 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs break-all">
                {enlace}
              </code>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(enlace);
                    setCopiado(true);
                  } catch {
                    toast.error("No se pudo copiar: selecciona el enlace a mano.");
                  }
                }}
              >
                <Copy aria-hidden /> {copiado ? "Copiado" : "Copiar enlace"}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                Listo
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invitar al equipo</DialogTitle>
              <DialogDescription>
                Solo se aceptan correos de la empresa: {rotulo}. La persona
                recibe un enlace válido por 7 días para activar su cuenta.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={enviar} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="inv-nombre">Nombre completo</Label>
                <Input
                  id="inv-nombre"
                  name="nombre_completo"
                  required
                  minLength={3}
                  placeholder="Nombre y apellidos"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-email">Correo electrónico</Label>
                <Input
                  id="inv-email"
                  name="email"
                  type="email"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={`tu.nombre@${dominios[0] ?? "consultoriae3.com"}`}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="inv-rol">Rol</Label>
                  <Select name="rol" defaultValue="empleado">
                    <SelectTrigger id="inv-rol" className="w-full">
                      <SelectValue placeholder="Elige un rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empleado">Empleado</SelectItem>
                      {puedeInvitarManagers && (
                        <>
                          <SelectItem value="manager">
                            Encargado de Área
                          </SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inv-ingreso">Fecha de ingreso</Label>
                  <Input
                    id="inv-ingreso"
                    name="fecha_ingreso"
                    type="date"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="inv-puesto">Puesto (opcional)</Label>
                  <Input id="inv-puesto" name="puesto" placeholder="Diseñador…" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inv-area">Área (opcional)</Label>
                  <Input id="inv-area" name="area" placeholder="Diseño…" />
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="flex min-w-0 items-start gap-1.5 text-sm font-medium break-words text-destructive"
                >
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">{error}</span>
                </p>
              )}

              <DialogFooter>
                <Button type="submit" disabled={enviando}>
                  {enviando && (
                    <Loader2Icon
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                  )}
                  {enviando ? "Creando…" : "Crear invitación"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
