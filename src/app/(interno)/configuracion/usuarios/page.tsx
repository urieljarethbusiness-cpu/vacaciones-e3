import { exigirAdminPagina } from "@/lib/perfil";
import { base } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AccionesUsuario,
  SelectorRol,
  type FilaUsuario,
} from "@/components/configuracion/gestion-usuarios";
import { DialogoInvitar } from "@/components/configuracion/dialogo-invitar";

/** Usuarios — alta por invitación con dominio de la casa y cambio de roles. */
export default async function PaginaUsuarios() {
  const perfil = await exigirAdminPagina();
  const db = base();

  const filas = db
    .prepare(
      `select p.id, p.nombre_completo, p.email, p.rol, p.activo,
              e.fecha_ingreso, e.puesto
       from perfiles p
       left join empleados e on e.id = p.id
       order by p.activo desc, p.nombre_completo`
    )
    .all() as unknown as {
      id: string;
      nombre_completo: string;
      email: string;
      rol: string;
      activo: number;
      fecha_ingreso: string | null;
      puesto: string | null;
    }[];

  const usuarios: FilaUsuario[] = filas.map((f) => ({
    id: f.id,
    nombre_completo: f.nombre_completo,
    email: f.email,
    rol: f.rol,
    activo: !!f.activo,
    fecha_ingreso: f.fecha_ingreso,
    puesto: f.puesto,
  }));

  const invitaciones = db
    .prepare(
      `select email, nombre_completo, rol, expira_en, aceptada_en
       from invitaciones where aceptada_en is null order by created_at desc`
    )
    .all() as unknown as {
      email: string;
      nombre_completo: string;
      rol: string;
      expira_en: string;
      aceptada_en: string | null;
    }[];

  const dominios = (
    db
      .prepare("select dominio from dominios_empleado where activo = 1 order by dominio")
      .all() as unknown as { dominio: string }[]
  ).map((d) => d.dominio);

  const esVisitanteSuperadmin = perfil.rol === "superadmin";
  const ETIQUETAS_ROL: Record<string, string> = {
    empleado: "Empleado",
    manager: "Encargado de Área",
    admin: "Administrador",
    superadmin: "Superadministrador",
  };

  return (
    <div className="space-y-6">
      <div className="-mt-2 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Personas del equipo con acceso. El alta es por invitación, con
          correo {dominios.map((d) => `@${d}`).join(" o ")}.
        </p>
        <DialogoInvitar
          dominios={dominios}
          puedeInvitarManagers={esVisitanteSuperadmin || perfil.rol === "admin"}
        />
      </div>

      {invitaciones.length > 0 && (
        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">Invitaciones pendientes</p>
          <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
            {invitaciones.map((i) => {
              const expira = new Date(i.expira_en).getTime() > Date.now();
              return (
                <li key={i.email} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {i.nombre_completo}
                  </span>
                  <span className="break-all">{i.email}</span>
                  <Badge variant="secondary">{ETIQUETAS_ROL[i.rol] ?? i.rol}</Badge>
                  <Badge variant={expira ? "outline" : "destructive"}>
                    {expira ? "Vigente" : "Expirada"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="hidden min-w-0 lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Ingreso</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.nombre_completo}
                  {u.puesto && (
                    <span className="block text-xs text-muted-foreground">
                      {u.puesto}
                    </span>
                  )}
                </TableCell>
                <TableCell className="break-all">{u.email}</TableCell>
                <TableCell>{u.fecha_ingreso ?? "—"}</TableCell>
                <TableCell>
                  <SelectorRol
                    usuario={u}
                    esVisitanteSuperadmin={esVisitanteSuperadmin}
                  />
                </TableCell>
                <TableCell>
                  {u.activo ? (
                    <Badge variant="secondary">Activo</Badge>
                  ) : (
                    <Badge variant="destructive">De baja</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <AccionesUsuario usuario={u} esPropio={u.id === perfil.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="grid gap-3 lg:hidden">
        {usuarios.map((u) => (
          <li key={u.id} className="grid gap-2 rounded-lg border p-3">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.nombre_completo}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {u.email}
                </p>
              </div>
              {u.activo ? (
                <Badge variant="secondary">Activo</Badge>
              ) : (
                <Badge variant="destructive">De baja</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SelectorRol
                usuario={u}
                esVisitanteSuperadmin={esVisitanteSuperadmin}
              />
              <AccionesUsuario usuario={u} esPropio={u.id === perfil.id} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
