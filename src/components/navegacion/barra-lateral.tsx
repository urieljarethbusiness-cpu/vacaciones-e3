"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  ENTRADAS_PRINCIPALES,
  SECCION_CONFIGURACION,
  SECCION_GESTION,
  type EntradaNav,
} from "./elementos-nav";
import { BotonCerrarSesion } from "@/components/boton-cerrar-sesion";

/**
 * Barra lateral — versión fiel del armazón del original (fondo `sidebar`,
 * secciones filtradas por permiso, pie con cerrar sesión) para los módulos
 * de esta recreación.
 */
export function ContenidoNavegacion({
  permisos,
  esAdminRol,
  esSuperadminRol,
  nombre,
  rolEtiqueta,
}: {
  permisos: string[];
  esAdminRol: boolean;
  esSuperadminRol: boolean;
  nombre: string;
  rolEtiqueta: string;
}) {
  const pathname = usePathname();

  const visible = (e: EntradaNav) =>
    (e.permiso ? permisos.includes(e.permiso) : true) &&
    (!e.soloAdmin || esAdminRol);

  const Item = ({ e }: { e: EntradaNav }) => (
    <Link
      href={e.href}
      data-activo={pathname === e.href || pathname.startsWith(e.href + "/")}
      className={cn(
        "flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-foreground/80 outline-none transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        "data-[activo=true]:bg-sidebar-accent data-[activo=true]:font-medium data-[activo=true]:text-sidebar-foreground",
        "data-[activo=true]:text-primary dark:data-[activo=true]:text-primary"
      )}
    >
      <e.Icono className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{e.titulo}</span>
    </Link>
  );

  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto">
      <div className="flex items-center gap-2.5 px-2 pt-1 pb-3">
        <Image
          src="/marca/isologo-e3-blanco.png"
          alt=""
          width={64}
          height={64}
          unoptimized
          className="size-8 shrink-0"
        />
        <div className="grid min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            Vacaciones E3
          </p>
          <p className="truncate text-xs text-muted-foreground">{rolEtiqueta}</p>
        </div>
      </div>

      <nav aria-label="Principal" className="grid gap-0.5">
        {ENTRADAS_PRINCIPALES.filter(visible).map((e) => (
          <Item key={e.href} e={e} />
        ))}
      </nav>

      {SECCION_GESTION.some(visible) && (
        <>
          <p className="px-2.5 pt-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Gestión
          </p>
          <nav aria-label="Gestión" className="grid gap-0.5">
            {SECCION_GESTION.filter(visible).map((e) => (
              <Item key={e.href} e={e} />
            ))}
          </nav>
        </>
      )}

      {esAdminRol && (
        <>
          <p className="px-2.5 pt-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Configuración
          </p>
          <nav aria-label="Configuración" className="grid gap-0.5">
            {SECCION_CONFIGURACION.filter(visible).map((e) => (
              <Item key={e.href} e={e} />
            ))}
          </nav>
        </>
      )}

      <div className="min-h-6 flex-1" />

      <div className="grid gap-0.5 border-t border-sidebar-border pt-2 pb-1">
        <p className="truncate px-2.5 pb-1 text-sm font-medium">{nombre}</p>
        <BotonCerrarSesion />
      </div>
    </div>
  );
}

export function BarraLateral(props: {
  permisos: string[];
  esAdminRol: boolean;
  esSuperadminRol: boolean;
  nombre: string;
  rolEtiqueta: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground md:pantalla-alta:block">
      <ContenidoNavegacion {...props} />
    </aside>
  );
}
