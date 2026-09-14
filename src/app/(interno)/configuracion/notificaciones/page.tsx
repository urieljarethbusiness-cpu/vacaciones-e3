import { exigirSuperadminPagina } from "@/lib/perfil";
import { base } from "@/lib/db";
import { leerSmtp, leerTelegram } from "@/server/notificador";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormularioNotificaciones } from "@/components/configuracion/formulario-notificaciones";

/**
 * Notificaciones — sección EXCLUSIVA del Superadministrador: credenciales
 * del correo (SMTP) y del bot de Telegram, pruebas de envío y la cola de
 * avisos con el resultado de cada intento.
 */
export default async function PaginaNotificaciones() {
  await exigirSuperadminPagina();
  const db = base();

  const smtp = leerSmtp(db);
  const telegram = leerTelegram(db);

  const cola = db
    .prepare(
      `select id, destinatario, plantilla, asunto, canal, estado, detalle_error, created_at
       from notificaciones_outbox order by id desc limit 30`
    )
    .all() as unknown as {
      id: number;
      destinatario: string;
      plantilla: string;
      asunto: string;
      canal: string;
      estado: string;
      detalle_error: string | null;
      created_at: string;
    }[];

  const CLASE_ESTADO: Record<string, string> = {
    enviado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    pendiente: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    error: "bg-red-500/15 text-red-700 dark:text-red-300",
    sin_canal: "bg-muted text-muted-foreground",
  };
  const ETIQUETA_ESTADO: Record<string, string> = {
    enviado: "Enviado",
    pendiente: "Pendiente",
    error: "Error",
    sin_canal: "Sin canal",
  };
  const ETIQUETA_PLANTILLA: Record<string, string> = {
    vacaciones_solicitada: "Solicitud registrada",
    vacaciones_resuelta: "Solicitud resuelta",
    vacaciones_editada: "Solicitud editada",
    ausencia_registrada: "Alta por RR. HH.",
    invitacion: "Invitación",
    prueba_canal: "Prueba de canal",
  };

  return (
    <div className="space-y-6">
      <p className="-mt-2 max-w-3xl text-sm text-muted-foreground">
        Canales de aviso por correo y Telegram. Esta pestaña solo la ve el
        Superadministrador.
      </p>

      <FormularioNotificaciones
        smtp={{
          activo: smtp.activo,
          host: smtp.host,
          puerto: smtp.puerto,
          seguro: smtp.seguro,
          usuario: smtp.usuario,
          remitente: smtp.remitente,
          tieneContrasena: smtp.contrasena !== "",
        }}
        telegram={{
          activo: telegram.activo,
          tieneToken: telegram.token !== "",
          chats: telegram.chats,
        }}
      />

      <div className="min-w-0">
        <h2 className="mb-3 text-lg font-semibold">Cola de avisos (últimos 30)</h2>
        <div className="hidden min-w-0 lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Aviso</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cola.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="whitespace-nowrap">{f.created_at} UTC</TableCell>
                  <TableCell>{f.canal === "telegram" ? "Telegram" : "Correo"}</TableCell>
                  <TableCell className="max-w-56 truncate" title={f.destinatario}>
                    {f.destinatario}
                  </TableCell>
                  <TableCell className="max-w-64 truncate" title={`${f.asunto}${f.detalle_error ? ` — ${f.detalle_error}` : ""}`}>
                    {ETIQUETA_PLANTILLA[f.plantilla] ?? f.plantilla}
                    {f.detalle_error && (
                      <span className="block truncate text-xs text-destructive">
                        {f.detalle_error}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={CLASE_ESTADO[f.estado] ?? ""}
                    >
                      {ETIQUETA_ESTADO[f.estado] ?? f.estado}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {cola.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="p-6 text-center text-sm text-muted-foreground"
                  >
                    Todavía no hay avisos: se registran al solicitar, resolver o
                    invitar.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <ul className="grid gap-3 lg:hidden">
          {cola.map((f) => (
            <li key={f.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {ETIQUETA_PLANTILLA[f.plantilla] ?? f.plantilla}
                </p>
                <Badge variant="secondary" className={CLASE_ESTADO[f.estado] ?? ""}>
                  {ETIQUETA_ESTADO[f.estado] ?? f.estado}
                </Badge>
              </div>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {f.canal === "telegram" ? "Telegram" : "Correo"} · {f.destinatario}
              </p>
              {f.detalle_error && (
                <p className="mt-1 break-words text-xs text-destructive">
                  {f.detalle_error}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{f.created_at} UTC</p>
            </li>
          ))}
          {cola.length === 0 && (
            <li className="rounded-lg border p-3 text-sm text-muted-foreground">
              Todavía no hay avisos: se registran al solicitar, resolver o
              invitar.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
