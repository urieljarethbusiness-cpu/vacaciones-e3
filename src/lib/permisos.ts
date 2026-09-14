/**
 * Catálogo de roles y permisos — recorte del de E3 Manager (src/lib/permisos.ts)
 * a los módulos que existen aquí: vacaciones propias, vacaciones del equipo y
 * días festivos. La jerarquía es la misma:
 *
 *   - **Empleado**: sus vacaciones (permiso `vacaciones`).
 *   - **Encargado de Área** (manager): las suyas Y las del equipo.
 *   - **Administrador** (admin): lo mismo que el encargado; es "un empleado
 *     más" con vacaciones propias (0063).
 *   - **Superadministrador**: TODO menos vacaciones propias (0063): es la
 *     cuenta dueña, gestiona las del equipo y no acumula las suyas. Además,
 *     sin ficha laboral, no hay saldo que calcular.
 */

export type RolBase = "empleado" | "manager" | "admin" | "superadmin";

export const ETIQUETAS_ROL_BASE: Record<RolBase, string> = {
  empleado: "Empleado",
  manager: "Encargado de Área",
  admin: "Administrador",
  superadmin: "Superadministrador",
};

/** Grupos del catálogo, tal y como los pinta la gestión de roles. */
export const GRUPOS_PERMISOS: {
  titulo: string;
  soloManager: boolean;
  permisos: { clave: string; etiqueta: string; descripcion: string }[];
}[] = [
  {
    titulo: "Área personal",
    soloManager: false,
    permisos: [
      {
        clave: "vacaciones",
        etiqueta: "Vacaciones",
        descripcion: "Solicitar y consultar sus propias vacaciones.",
      },
    ],
  },
  {
    titulo: "Gestión",
    soloManager: true,
    permisos: [
      {
        clave: "gestion.vacaciones",
        etiqueta: "Vacaciones del equipo",
        descripcion: "Aprobar, rechazar y registrar ausencias de cualquier persona.",
      },
      {
        clave: "gestion.festivos",
        etiqueta: "Días festivos",
        descripcion: "Administrar el calendario de días festivos de la empresa.",
      },
    ],
  },
];

export const TODAS_LAS_CLAVES = GRUPOS_PERMISOS.flatMap((g) =>
  g.permisos.map((p) => p.clave)
);

/** Espejo de `app.permisos_por_rol()` (0063): superadmin SIN `vacaciones`. */
export const PERMISOS_BASE: Record<RolBase, string[]> = {
  empleado: ["vacaciones"],
  manager: TODAS_LAS_CLAVES,
  admin: TODAS_LAS_CLAVES,
  superadmin: TODAS_LAS_CLAVES.filter((c) => c !== "vacaciones"),
};

export const ROLES_INTERNOS: RolBase[] = [
  "empleado",
  "manager",
  "admin",
  "superadmin",
];
export const ROLES_GESTOR: RolBase[] = ["manager", "admin", "superadmin"];
export const ROLES_ADMIN: RolBase[] = ["admin", "superadmin"];

export function esInterno(rol: string): boolean {
  return ROLES_INTERNOS.includes(rol as RolBase);
}
export function esGestor(rol: string): boolean {
  return ROLES_GESTOR.includes(rol as RolBase);
}
export function esAdmin(rol: string): boolean {
  return ROLES_ADMIN.includes(rol as RolBase);
}

/**
 * Permisos efectivos de un rol. Sin roles personalizados en esta
 * recreación, la base ES la tabla; la función queda por si se delega.
 */
export function permisosEfectivos(rol: RolBase): string[] {
  return PERMISOS_BASE[rol] ?? [];
}
