import { exigirAdminPagina } from "@/lib/perfil";
import { PestanasConfiguracion, type Pestana } from "@/components/configuracion/pestanas-configuracion";

/**
 * Armazón de la sección Configuración: encabezado fijo + pestañas por ruta.
 * La lista es el ÚNICO punto donde se añade una pestaña nueva; el filtrado
 * por rol evita enseñar llaves que la persona no puede usar.
 */
export default async function LayoutConfiguracion({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const perfil = await exigirAdminPagina();
  const esSuperadmin = perfil.rol === "superadmin";

  const TODAS: (Pestana & { soloSuperAdmin?: boolean })[] = [
    { href: "/configuracion/general", titulo: "General" },
    { href: "/configuracion/automatizaciones", titulo: "Automatizaciones" },
    { href: "/configuracion/notificaciones", titulo: "Notificaciones", soloSuperAdmin: true },
    { href: "/configuracion/usuarios", titulo: "Usuarios" },
    { href: "/configuracion/auditoria", titulo: "Auditoría" },
  ];
  const pestanas: Pestana[] = TODAS.filter((p) => !p.soloSuperAdmin || esSuperadmin);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-muted-foreground">
          Ajustes de la plataforma. Cada pestaña guarda su propia URL.
        </p>
      </div>

      <PestanasConfiguracion pestanas={pestanas} />

      {children}
    </div>
  );
}
