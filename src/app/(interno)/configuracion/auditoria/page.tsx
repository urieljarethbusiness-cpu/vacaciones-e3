import { exigirAdminPagina } from "@/lib/perfil";
import { base } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Bitácora — las últimas 200 entradas de la auditoría: altas, resoluciones,
 * ediciones y eliminaciones de ausencias; invitaciones, roles y bajas.
 */
export default async function PaginaAuditoria() {
  await exigirAdminPagina();
  const db = base();

  const filas = db
    .prepare("select * from auditoria order by id desc limit 200")
    .all() as unknown as {
      id: number;
      categoria: string;
      accion: string;
      entidad_etiqueta: string | null;
      actor_nombre: string;
      created_at: string;
    }[];

  const ETIQUETA_ACCION: Record<string, string> = {
    "ausencia.creada": "Ausencia creada",
    "ausencia.resuelta": "Ausencia resuelta",
    "ausencia.editada": "Ausencia editada",
    "ausencia.eliminada": "Ausencia eliminada",
    "vacaciones_lft.actualizada": "Escala LFT actualizada",
    "invitacion.creada": "Invitación creada",
    "invitacion.aceptada": "Invitación aceptada",
    "rol.cambiado": "Rol cambiado",
    "usuario.baja": "Usuario dado de baja",
    "usuario.reactivado": "Usuario reactivado",
  };

  return (
    <div className="space-y-6">
      <p className="-mt-2 text-sm text-muted-foreground">
        Últimas 200 acciones con impacto en otras personas. Cada entrada lleva
        el nombre de quien la hizo.
      </p>

      <div className="hidden min-w-0 lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Hecha por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="whitespace-nowrap">
                  {f.created_at} UTC
                </TableCell>
                <TableCell className="font-medium">
                  {ETIQUETA_ACCION[f.accion] ?? f.accion}
                </TableCell>
                <TableCell className="max-w-72 truncate text-muted-foreground">
                  {f.entidad_etiqueta ?? "—"}
                </TableCell>
                <TableCell>{f.actor_nombre}</TableCell>
              </TableRow>
            ))}
            {filas.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="p-6 text-center text-sm text-muted-foreground"
                >
                  Todavía no hay acciones registradas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ul className="grid gap-3 lg:hidden">
        {filas.map((f) => (
          <li key={f.id} className="rounded-lg border p-3">
            <p className="font-medium">{ETIQUETA_ACCION[f.accion] ?? f.accion}</p>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">
              {f.entidad_etiqueta ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {f.actor_nombre} · {f.created_at} UTC
            </p>
          </li>
        ))}
        {filas.length === 0 && (
          <li className="rounded-lg border p-3 text-sm text-muted-foreground">
            Todavía no hay acciones registradas.
          </li>
        )}
      </ul>
    </div>
  );
}
