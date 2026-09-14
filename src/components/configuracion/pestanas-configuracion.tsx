"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type Pestana = { href: string; titulo: string };

/**
 * Pestañas de la sección Configuración, con estado en la URL: cada pestaña es
 * una ruta, así que recargar o compartir el enlace conserva la vista, y añadir
 * una pestaña nueva es añadir una entrada a la lista.
 */
export function PestanasConfiguracion({ pestanas }: { pestanas: Pestana[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones de configuración"
      className="flex w-full gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1"
    >
      {pestanas.map((p) => {
        const activa = pathname === p.href || pathname.startsWith(p.href + "/");
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "flex min-h-9 shrink-0 items-center rounded-md px-3 text-sm outline-none transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-background/60",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
              activa &&
                "bg-background font-medium text-foreground shadow-sm hover:text-foreground"
            )}
          >
            {p.titulo}
          </Link>
        );
      })}
    </nav>
  );
}
