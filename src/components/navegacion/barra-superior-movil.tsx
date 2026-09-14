"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ContenidoNavegacion } from "./barra-lateral";

/** Cabecera móvil con el menú en hoja lateral, como el original. */
export function BarraSuperiorMovil(props: {
  permisos: string[];
  esAdminRol: boolean;
  esSuperadminRol: boolean;
  nombre: string;
  rolEtiqueta: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="flex items-center gap-2 border-b bg-sidebar px-3 py-2 text-sidebar-foreground md:pantalla-alta:hidden">
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir menú"
          aria-expanded={abierto}
          onClick={() => setAbierto(true)}
          className="text-sidebar-foreground"
        >
          <Menu className="size-5" aria-hidden />
        </Button>
        <SheetContent side="left" className="w-64 bg-sidebar p-3">
          <SheetHeader className="sr-only">
            <SheetTitle>Menú</SheetTitle>
          </SheetHeader>
          <ContenidoNavegacion
            {...props}
          />
        </SheetContent>
      </Sheet>
      <p className="text-sm font-semibold">Vacaciones E3</p>
    </div>
  );
}
