import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  LayoutDashboard,
  PartyPopper,
  Settings,
  TreePalm,
} from "lucide-react";

/**
 * Entradas de menú — recorte de src/components/navegacion/elementos-nav.ts
 * del original a los módulos de esta recreación. Cada entrada exige una clave
 * de permiso (`permiso`) o rol base admin (`soloAdmin`); el armado del menú
 * las filtra. La sección de Configuración es UNA sola entrada: sus pestañas
 * (General, Automatizaciones, Notificaciones, Usuarios, Auditoría) viven
 * dentro de la propia sección.
 */
export type EntradaNav = {
  href: string;
  titulo: string;
  Icono: LucideIcon;
  permiso?: string;
  soloAdmin?: boolean;
};

export const ENTRADAS_PRINCIPALES: EntradaNav[] = [
  { href: "/panel", titulo: "Panel", Icono: LayoutDashboard },
  {
    href: "/vacaciones",
    titulo: "Mis vacaciones",
    Icono: TreePalm,
    permiso: "vacaciones",
  },
];

export const SECCION_GESTION: EntradaNav[] = [
  {
    href: "/gestion/vacaciones",
    titulo: "Ausencias del equipo",
    Icono: CalendarCheck,
    permiso: "gestion.vacaciones",
  },
  {
    href: "/gestion/festivos",
    titulo: "Días festivos",
    Icono: PartyPopper,
    permiso: "gestion.festivos",
  },
];

export const SECCION_CONFIGURACION: EntradaNav[] = [
  {
    href: "/configuracion/general",
    titulo: "Configuración",
    Icono: Settings,
    soloAdmin: true,
  },
];
