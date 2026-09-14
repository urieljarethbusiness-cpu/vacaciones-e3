"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { base } from "@/lib/db";
import { exigirSesion } from "@/server/autorizacion";
import {
  auditarCanal,
  enviarCorreo,
  enviarTelegram,
  leerSmtp,
  leerTelegram,
  chatsDe,
  registrarIntento,
  type ConfigSmtp,
  type ConfigTelegram,
} from "@/server/notificador";

type Resultado = { ok: true } | { ok: false; error: string };
type ResultadoPrueba = { ok: true; detalle: string } | { ok: false; error: string };

/**
 * Configuración de los canales de notificación — SECCIÓN EXCLUSIVA DEL
 * SUPERADMINISTRADOR. El administrador regular aprueba vacaciones, pero no
 * toca las credenciales de correo ni del bot (igual que en el original, donde
 * Configuración no se delega).
 */

async function exigirSuperadmin() {
  const sesion = await exigirSesion();
  if (sesion.perfil.rol !== "superadmin") {
    throw new Error("Solo el Superadministrador puede configurar las notificaciones.");
  }
  return sesion;
}

// ---------------------------------------------------------------------------
// Correo (SMTP)
// ---------------------------------------------------------------------------

const esquemaSmtp = z.object({
  activo: z.boolean(),
  host: z.string().min(1, { error: "Escribe el servidor SMTP." }).max(200),
  puerto: z
    .number({ error: "El puerto debe ser un número." })
    .int()
    .min(1)
    .max(65535),
  seguro: z.boolean(),
  usuario: z.string().max(200).optional(),
  /** Vacío = conservar la contraseña ya guardada. */
  contrasena: z.string().max(200).optional(),
  remitente: z
    .string({ error: "Escribe el remitente." })
    .min(3, { error: "Escribe el remitente (Correo <remitente@dominio>)." })
    .max(200),
});

export async function guardarSmtp(
  entrada: z.input<typeof esquemaSmtp>
): Promise<Resultado> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirSuperadmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parseo = esquemaSmtp.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }
  const d = parseo.data;

  // Conserva la contraseña previa si el campo viene vacío.
  const previa = leerSmtp(db).contrasena;
  const config: ConfigSmtp = {
    activo: d.activo,
    host: d.host.trim(),
    puerto: d.puerto,
    seguro: d.seguro,
    usuario: (d.usuario ?? "").trim(),
    contrasena: (d.contrasena ?? "").trim() || previa,
    remitente: d.remitente.trim(),
  };

  db.prepare(
    `insert into ajustes (clave, valor) values ('smtp', ?)
     on conflict (clave) do update set valor = excluded.valor`
  ).run(JSON.stringify(config));

  // Nunca se registran credenciales; solo host/puerto/remitente.
  auditarCanal(db, perfil, "smtp.actualizado", {
    host: config.host,
    puerto: config.puerto,
    seguro: config.seguro,
    remitente: config.remitente,
    activo: config.activo,
  });

  revalidatePath("/configuracion/notificaciones");
  return { ok: true };
}

const esquemaPruebaCorreo = z.object({
  para: z.email({ error: "Escribe un correo de destino válido." }),
});

/** Envía un correo de prueba con la configuración guardada. */
export async function probarCorreo(
  entrada: z.input<typeof esquemaPruebaCorreo>
): Promise<ResultadoPrueba> {
  let db;
  try {
    ({ db } = await exigirSuperadmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parseo = esquemaPruebaCorreo.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }

  const smtp = leerSmtp(db);
  if (!smtp.activo || !smtp.host) {
    return {
      ok: false,
      error: "Primero guarda el SMTP activo con su servidor.",
    };
  }

  const error = await enviarCorreo(
    smtp,
    parseo.data.para,
    "Correo de prueba — Vacaciones E3",
    "Si lees esto, el correo de la plataforma quedó bien configurado."
  );
  registrarIntento(db, {
    destinatario: parseo.data.para,
    canal: "correo",
    asunto: "Correo de prueba — Vacaciones E3",
    cuerpo: "Intento de prueba desde la sección de Notificaciones.",
    error,
  });
  revalidatePath("/configuracion/notificaciones");
  if (error) return { ok: false, error: `El servidor rechazó el envío: ${error}` };
  return { ok: true, detalle: `Enviado a ${parseo.data.para}.` };
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

const esquemaTelegram = z.object({
  activo: z.boolean(),
  token: z
    .string()
    .max(200, { error: "El token no puede pasar de 200 caracteres." })
    .optional(),
  chats: z.string().max(500).optional(),
});

export async function guardarTelegram(
  entrada: z.input<typeof esquemaTelegram>
): Promise<Resultado> {
  let db, perfil;
  try {
    ({ db, perfil } = await exigirSuperadmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parseo = esquemaTelegram.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0].message };
  }
  const d = parseo.data;

  const previa = leerTelegram(db);
  const config: ConfigTelegram = {
    activo: d.activo,
    token: (d.token ?? "").trim() || previa.token,
    chats: (d.chats ?? "").trim() || previa.chats,
  };

  db.prepare(
    `insert into ajustes (clave, valor) values ('telegram', ?)
     on conflict (clave) do update set valor = excluded.valor`
  ).run(JSON.stringify(config));

  auditarCanal(db, perfil, "telegram.actualizado", {
    activo: config.activo,
    chats: config.chats,
    token_cambiado: !!d.token,
  });

  revalidatePath("/configuracion/notificaciones");
  return { ok: true };
}

/** Manda el mensaje de prueba a todos los chats configurados. */
export async function probarTelegram(): Promise<ResultadoPrueba> {
  let db;
  try {
    ({ db } = await exigirSuperadmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const telegram = leerTelegram(db);
  if (!telegram.activo || !telegram.token) {
    return { ok: false, error: "Primero guarda el bot de Telegram activo con su token." };
  }
  const chats = chatsDe(telegram);
  if (chats.length === 0) {
    return { ok: false, error: "Agrega al menos un ID de chat de destino." };
  }

  const resultados: string[] = [];
  let enviados = 0;
  for (const chat of chats) {
    const error = await enviarTelegram(
      telegram,
      chat,
      "✅ Prueba de Vacaciones E3: las notificaciones de Telegram funcionan."
    );
    registrarIntento(db, {
      destinatario: `chat ${chat}`,
      canal: "telegram",
      asunto: "Prueba de Telegram",
      cuerpo: "Intento de prueba desde la sección de Notificaciones.",
      error,
    });
    if (error) resultados.push(`chat ${chat}: ${error}`);
    else enviados += 1;
  }

  revalidatePath("/configuracion/notificaciones");
  if (enviados === 0) {
    return { ok: false, error: `Ningún chat aceptó el mensaje. ${resultados.join(" · ")}` };
  }
  return {
    ok: true,
    detalle:
      resultados.length === 0
        ? `Enviado a ${enviados} chat(s).`
        : `Enviado a ${enviados} chat(s); fallaron: ${resultados.join(" · ")}`,
  };
}

// ---------------------------------------------------------------------------
// Reintentar la cola
// ---------------------------------------------------------------------------

/** Reintenta los avisos que quedaron sin canal o con error. */
export async function reintentarPendientes(): Promise<ResultadoPrueba> {
  let db;
  try {
    ({ db } = await exigirSuperadmin());
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const smtp = leerSmtp(db);
  const telegram = leerTelegram(db);
  const smtpActivo = smtp.activo && smtp.host !== "";
  const chats = telegram.activo && telegram.token ? chatsDe(telegram) : [];

  const filas = db
    .prepare(
      `select id, destinatario, plantilla, asunto, cuerpo, canal
       from notificaciones_outbox
       where estado in ('pendiente', 'sin_canal', 'error')
       order by id limit 100`
    )
    .all() as unknown as {
      id: number;
      destinatario: string;
      plantilla: string;
      asunto: string;
      cuerpo: string;
      canal: string;
    }[];

  const actualizar = db.prepare(
    "update notificaciones_outbox set estado = ?, detalle_error = ? where id = ?"
  );
  let enviados = 0;
  let fallidos = 0;

  for (const f of filas) {
    if (f.canal === "correo") {
      if (!smtpActivo) {
        fallidos += 1;
        continue;
      }
      const error = await enviarCorreo(smtp, f.destinatario, f.asunto, f.cuerpo);
      actualizar.run(error ? "error" : "enviado", error, f.id);
      error ? (fallidos += 1) : (enviados += 1);
    } else {
      const chat = f.destinatario.startsWith("chat ")
        ? f.destinatario.slice(5)
        : f.destinatario;
      if (chats.length === 0) {
        fallidos += 1;
        continue;
      }
      if (!chats.includes(chat)) continue;
      const error = await enviarTelegram(telegram, chat, f.cuerpo);
      actualizar.run(error ? "error" : "enviado", error, f.id);
      error ? (fallidos += 1) : (enviados += 1);
    }
  }

  if (filas.length === 0) return { ok: true, detalle: "No había avisos pendientes." };
  revalidatePath("/configuracion/notificaciones");
  return {
    ok: true,
    detalle: `${enviados} enviado(s), ${fallidos} sin poder entregar.`,
  };
}
