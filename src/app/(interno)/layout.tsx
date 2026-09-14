import { obtenerPerfilOredirigir } from "@/lib/perfil";
import { esAdmin, ETIQUETAS_ROL_BASE } from "@/lib/permisos";
import { AvisoCicloVacaciones } from "@/components/vacaciones/aviso-ciclo-vacaciones";
import { BarraLateral } from "@/components/navegacion/barra-lateral";
import { BarraSuperiorMovil } from "@/components/navegacion/barra-superior-movil";

/**
 * Armazón del área interna — misma estructura que el original: barra lateral
 * + columna con banda de aviso de ciclo (corre en TODA la navegación) y el
 * `<main>` como único scroller.
 */
export default async function LayoutInterno({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const perfil = await obtenerPerfilOredirigir();

  const navegacion = {
    permisos: perfil.permisos,
    esAdminRol: esAdmin(perfil.rol),
    esSuperadminRol: perfil.rol === "superadmin",
    nombre: perfil.nombre_completo,
    rolEtiqueta: ETIQUETAS_ROL_BASE[perfil.rol],
  };

  return (
    // `overflow-hidden`: el scroll de la aplicación vive SOLO en el <main>.
    // Así el documento nunca se desplaza y la barra lateral queda FIJA en
    // escritorio (con `sticky top-0` de respaldo) aunque una página traiga
    // contenido más alto que el viewport.
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <BarraLateral {...navegacion} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="z-40 shrink-0">
          <AvisoCicloVacaciones />
          <BarraSuperiorMovil {...navegacion} />
        </div>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
