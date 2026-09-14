import type { DatabaseSync } from "node:sqlite";
import { registrarAuditoria } from "@/server/auditoria";
import type { PerfilSesion } from "@/server/sesiones";

/**
 * Notificaciones multicanal — el equivalente local del sistema del original
 * (ajustes `smtp` + `telegram`, outbox, plantillas). Cada aviso se registra
 * en `notificaciones_outbox` y se INTENTA enviar en el momento:
 *
 *   - Correo: SMTP con nodemailer (si está activo y configurado).
 *   - Telegram: Bot API (`sendMessage`) a los chats configurados.
 *
 * Sin canal activo la fila queda `sin_canal`: el aviso existe, está a la
 * vista en la sección de Notificaciones y se puede reintentar cuando el
 * superadmin configure el canal. Un fallo de envío NUNCA tira la acción
 * de negocio: queda marcado `error` con su detalle.
 *
 * SIN `server-only` a propósito: también lo importa el script de
 * recordatorios programados (scripts/recordatorios.ts), igual que el worker
 * del original compartía la cola con la aplicación.
 */

export type ConfigSmtp = {
  activo: boolean;
  host: string;
  puerto: number;
  seguro: boolean;
  usuario: string;
  contrasena: string;
  remitente: string;
};

export type ConfigTelegram = {
  activo: boolean;
  token: string;
  /** IDs de chat separados por coma. */
  chats: string;
};

export function leerSmtp(db: DatabaseSync): ConfigSmtp {
  const fila = db.prepare("select valor from ajustes where clave = 'smtp'").get() as
    | { valor: string }
    | undefined;
  if (!fila) {
    return { activo: false, host: "", puerto: 587, seguro: true, usuario: "", contrasena: "", remitente: "" };
  }
  const v = JSON.parse(fila.valor) as Partial<ConfigSmtp>;
  return {
    activo: !!v.activo,
    host: v.host ?? "",
    puerto: Number(v.puerto) || 587,
    seguro: v.seguro ?? true,
    usuario: v.usuario ?? "",
    contrasena: v.contrasena ?? "",
    remitente: v.remitente ?? "",
  };
}

export function leerTelegram(db: DatabaseSync): ConfigTelegram {
  const fila = db
    .prepare("select valor from ajustes where clave = 'telegram'")
    .get() as { valor: string } | undefined;
  if (!fila) return { activo: false, token: "", chats: "" };
  const v = JSON.parse(fila.valor) as Partial<ConfigTelegram>;
  return {
    activo: !!v.activo,
    token: v.token ?? "",
    chats: v.chats ?? "",
  };
}

export function chatsDe(config: ConfigTelegram): string[] {
  return config.chats
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Envía un correo con la configuración guardada. Devuelve el error, si lo hay. */
export async function enviarCorreo(
  config: ConfigSmtp,
  para: string,
  asunto: string,
  cuerpo: string
): Promise<string | null> {
  const nodemailer = await import("nodemailer");
  try {
    const transporte = nodemailer.createTransport({
      host: config.host,
      port: config.puerto,
      secure: config.seguro,
      auth: config.usuario
        ? { user: config.usuario, pass: config.contrasena }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
    await transporte.sendMail({
      from: config.remitente || config.usuario,
      to: para,
      subject: asunto,
      text: cuerpo,
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Manda el mensaje de Telegram a un chat. Devuelve el error, si lo hay. */
export async function enviarTelegram(
  config: ConfigTelegram,
  chat: string,
  texto: string
): Promise<string | null> {
  try {
    const respuesta = await fetch(
      `https://api.telegram.org/bot${config.token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: texto }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!respuesta.ok) {
      const detalle = (await respuesta.json().catch(() => null)) as {
        description?: string;
      } | null;
      return detalle?.description ?? `HTTP ${respuesta.status}`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export type Aviso = {
  /** Destinatarios de correo. */
  correos: string[];
  /** Si viene, se manda por Telegram a los chats configurados. */
  telegram?: string;
  plantilla: string;
  asunto: string;
  cuerpo: string;
};

/**
 * Registra y entrega un aviso por los canales activos. Inserta UNA fila por
 * destinatario/canal con el resultado del intento.
 */
export async function notificar(db: DatabaseSync, aviso: Aviso): Promise<void> {
  const smtp = leerSmtp(db);
  const telegram = leerTelegram(db);

  const insertar = db.prepare(
    `insert into notificaciones_outbox
      (destinatario, plantilla, asunto, cuerpo, canal, estado, detalle_error)
     values (?, ?, ?, ?, ?, ?, ?)`
  );

  const smtpActivo = smtp.activo && smtp.host !== "";
  const telegramActivo = telegram.activo && telegram.token !== "" && chatsDe(telegram).length > 0;

  for (const para of aviso.correos) {
    if (!smtpActivo) {
      insertar.run(para, aviso.plantilla, aviso.asunto, aviso.cuerpo, "correo", "sin_canal", null);
      continue;
    }
    const error = await enviarCorreo(smtp, para, aviso.asunto, aviso.cuerpo);
    insertar.run(
      para,
      aviso.plantilla,
      aviso.asunto,
      aviso.cuerpo,
      "correo",
      error ? "error" : "enviado",
      error
    );
  }

  if (aviso.telegram && telegramActivo) {
    for (const chat of chatsDe(telegram)) {
      const error = await enviarTelegram(telegram, chat, aviso.telegram);
      insertar.run(
        `chat ${chat}`,
        aviso.plantilla,
        aviso.asunto,
        aviso.telegram,
        "telegram",
        error ? "error" : "enviado",
        error
      );
    }
  } else if (aviso.telegram) {
    insertar.run(
      "Telegram (equipo)",
      aviso.plantilla,
      aviso.asunto,
      aviso.telegram,
      "telegram",
      "sin_canal",
      null
    );
  }
}

/** Registra un intento suelto (pruebas de canal) en la cola. */
export function registrarIntento(
  db: DatabaseSync,
  datos: {
    destinatario: string;
    canal: "correo" | "telegram";
    asunto: string;
    cuerpo: string;
    error: string | null;
  }
): void {
  db.prepare(
    `insert into notificaciones_outbox
      (destinatario, plantilla, asunto, cuerpo, canal, estado, detalle_error)
     values (?, 'prueba_canal', ?, ?, ?, ?, ?)`
  ).run(
    datos.destinatario,
    datos.asunto,
    datos.cuerpo,
    datos.canal,
    datos.error ? "error" : "enviado",
    datos.error
  );
}

/** Correos de quienes pueden resolver vacaciones (el grupo de RR. HH.). */
export function correosDeGestores(db: DatabaseSync): string[] {
  return (
    db
      .prepare(
        `select email from perfiles
         where activo = 1 and rol in ('manager', 'admin', 'superadmin')`
      )
      .all() as unknown as { email: string }[]
  ).map((f) => f.email);
}

/** Texto corto de Telegram para los avisos de vacaciones. */
export function telegramDe(
  asunto: string,
  cuerpo: string,
  limite = 600
): string {
  const texto = `${asunto}\n${cuerpo}`;
  return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

/** Asiento de bitácora para cambios de configuración de canales. */
export function auditarCanal(
  db: DatabaseSync,
  actor: PerfilSesion,
  accion: string,
  despues: Record<string, unknown>
): void {
  registrarAuditoria(db, {
    categoria: "config",
    accion,
    entidad: "ajustes",
    actor,
    despues,
  });
}
