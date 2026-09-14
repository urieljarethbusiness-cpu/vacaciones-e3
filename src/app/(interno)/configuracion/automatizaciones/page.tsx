import { exigirAdminPagina } from "@/lib/perfil";
import { base } from "@/lib/db";
import { PERMISOS_BASE, type RolBase } from "@/lib/permisos";
import {
  leerAutomatizacion,
  VENCIMIENTO_DEFECTO,
  type AjustesVacaciones,
} from "@/server/recordatorios";
import {
  FormularioAutomatizaciones,
  type UsuarioInterno,
} from "@/components/configuracion/formulario-automatizaciones";

const VACACIONES_DEFECTO: AjustesVacaciones = {
  activo: true,
  horarios: ["09:00", "16:00"],
  dias: [1, 2, 3, 4, 5],
  destinatarios_modo: "permiso",
  destinatarios: [],
};

/** Automatizaciones: los dos recordatorios configurables del sistema. */
export default async function PaginaAutomatizaciones() {
  await exigirAdminPagina();
  const db = base();

  const filas = db
    .prepare(
      `select id, nombre_completo, rol from perfiles
       where activo = 1 order by nombre_completo`
    )
    .all() as unknown as { id: string; nombre_completo: string; rol: string }[];

  const usuarios: UsuarioInterno[] = filas.map((p) => ({
    id: p.id,
    nombre: p.nombre_completo,
    email: "",
    apruebaVacaciones: PERMISOS_BASE[p.rol as RolBase].includes(
      "gestion.vacaciones"
    ),
  }));

  const vacaciones = leerAutomatizacion(
    db,
    "automatizacion_vacaciones",
    VACACIONES_DEFECTO
  );
  const vencimiento = leerAutomatizacion(
    db,
    "automatizacion_vencimiento",
    VENCIMIENTO_DEFECTO
  );

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Recordatorios automáticos que viajan por correo y Telegram cuando sus
        canales están activos en Notificaciones. «Enviar ahora» los dispara sin
        esperar su horario; para que corran solos, programa
        <code className="mx-1 rounded bg-muted px-1">npm run recordatorios</code>
        con el programador de tareas.
      </p>

      <FormularioAutomatizaciones
        inicial={{ vacaciones, vencimiento }}
        usuarios={usuarios}
      />
    </div>
  );
}
