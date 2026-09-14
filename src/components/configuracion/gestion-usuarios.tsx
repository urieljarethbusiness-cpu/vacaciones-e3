"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, ShieldAlert, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";
import {
  cambiarRol,
  darDeBaja,
  reactivar,
} from "@/server/actions/usuarios";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type FilaUsuario = {
  id: string;
  nombre_completo: string;
  email: string;
  rol: string;
  activo: boolean;
  fecha_ingreso: string | null;
  puesto: string | null;
};

const ETIQUETAS_ROL: Record<string, string> = {
  empleado: "Empleado",
  manager: "Encargado de Área",
  admin: "Administrador",
  superadmin: "Superadministrador",
};

/** Selector de rol en línea. El superadmin solo se ofrece a otro superadmin. */
export function SelectorRol({
  usuario,
  esVisitanteSuperadmin,
}: {
  usuario: FilaUsuario;
  esVisitanteSuperadmin: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function cambiar(nuevo: string) {
    iniciar(async () => {
      const r = await cambiarRol({
        perfilId: usuario.id,
        rol: nuevo as FilaUsuario["rol"] as never,
      });
      if (r.ok) {
        toast.success(
          `${usuario.nombre_completo} ahora es ${ETIQUETAS_ROL[nuevo]}.`
        );
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const mostrarSuperadmin = esVisitanteSuperadmin || usuario.rol === "superadmin";

  return (
    <div className="flex items-center gap-2">
      <Select
        value={usuario.rol}
        onValueChange={cambiar}
        disabled={pendiente}
      >
        <SelectTrigger size="sm" className="w-44" aria-label={`Rol de ${usuario.nombre_completo}`}>
          {pendiente ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="empleado">Empleado</SelectItem>
          <SelectItem value="manager">Encargado de Área</SelectItem>
          <SelectItem value="admin">Administrador</SelectItem>
          {mostrarSuperadmin && (
            <SelectItem value="superadmin">Superadministrador</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Dar de baja (con confirmación) o reactivar una cuenta. */
export function AccionesUsuario({
  usuario,
  esPropio,
}: {
  usuario: FilaUsuario;
  esPropio: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function baja() {
    iniciar(async () => {
      const r = await darDeBaja(usuario.id);
      if (r.ok) {
        toast.success(`${usuario.nombre_completo} quedó dado de baja.`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function alta() {
    iniciar(async () => {
      const r = await reactivar(usuario.id);
      if (r.ok) {
        toast.success(`${usuario.nombre_completo} vuelve a estar activo.`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  if (esPropio) return <span className="text-xs text-muted-foreground">Tú</span>;

  if (usuario.activo) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pendiente} className="text-destructive hover:text-destructive">
            <UserX aria-hidden /> Dar de baja
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Das de baja a {usuario.nombre_completo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Perderá el acceso de inmediato y sus vacaciones quedan en pausa
              (sus solicitudes no se borran). La acción queda registrada en la
              bitácora con tu nombre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mejor no</AlertDialogCancel>
            <AlertDialogAction onClick={baja}>
              <ShieldAlert aria-hidden /> Sí, dar de baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Button variant="outline" size="sm" disabled={pendiente} onClick={alta}>
      <UserCheck aria-hidden /> Reactivar
    </Button>
  );
}
