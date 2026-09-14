"use client";

import { LogOut } from "lucide-react";
import { cerrarSesion } from "@/server/actions/acceso";
import { Button } from "@/components/ui/button";

export function BotonCerrarSesion() {
  return (
    <form action={cerrarSesion}>
      <Button
        type="submit"
        variant="ghost"
        className="w-full justify-start gap-2.5 px-2.5 text-sidebar-foreground/80 hover:text-sidebar-foreground dark:hover:text-sidebar-foreground"
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        Cerrar sesión
      </Button>
    </form>
  );
}
