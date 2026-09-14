"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Bot,
  Loader2Icon,
  Mail,
  RotateCcw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  guardarSmtp,
  guardarTelegram,
  probarCorreo,
  probarTelegram,
  reintentarPendientes,
} from "@/server/actions/notificaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  smtp: {
    activo: boolean;
    host: string;
    puerto: number;
    seguro: boolean;
    usuario: string;
    remitente: string;
    /** Nunca viaja la contraseña: solo si hay una guardada. */
    tieneContrasena: boolean;
  };
  telegram: {
    activo: boolean;
    /** Nunca viaja el token: solo si hay uno guardado. */
    tieneToken: boolean;
    chats: string;
  };
};

const TARJETA =
  "grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300";

/**
 * Configuración de los canales de aviso — SOLO superadministrador.
 * Las credenciales (contraseña SMTP, token del bot) nunca se devuelven al
 * navegador: el campo vacío conserva la guardada.
 */
export function FormularioNotificaciones({ smtp, telegram }: Props) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();

  // SMTP
  const [smtpActivo, setSmtpActivo] = useState(smtp.activo);
  const [smtpSeguro, setSmtpSeguro] = useState(smtp.seguro);
  const [smtpHost, setSmtpHost] = useState(smtp.host);
  const [smtpPuerto, setSmtpPuerto] = useState(String(smtp.puerto));
  const [smtpUsuario, setSmtpUsuario] = useState(smtp.usuario);
  const [smtpContrasena, setSmtpContrasena] = useState("");
  const [smtpRemitente, setSmtpRemitente] = useState(smtp.remitente);
  const [destinoPrueba, setDestinoPrueba] = useState("");

  // Telegram
  const [tgActivo, setTgActivo] = useState(telegram.activo);
  const [tgToken, setTgToken] = useState("");
  const [tgChats, setTgChats] = useState(telegram.chats);

  function guardarCorreo() {
    iniciar(async () => {
      const r = await guardarSmtp({
        activo: smtpActivo,
        host: smtpHost,
        puerto: Number(smtpPuerto),
        seguro: smtpSeguro,
        usuario: smtpUsuario,
        contrasena: smtpContrasena,
        remitente: smtpRemitente,
      });
      if (r.ok) {
        toast.success("Configuración de correo guardada.");
        setSmtpContrasena("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function probar() {
    iniciar(async () => {
      const r = await probarCorreo({ para: destinoPrueba });
      if (r.ok) {
        toast.success(r.detalle);
      } else {
        toast.error(r.error);
      }
    });
  }

  function guardarBot() {
    iniciar(async () => {
      const r = await guardarTelegram({
        activo: tgActivo,
        token: tgToken,
        chats: tgChats,
      });
      if (r.ok) {
        toast.success("Configuración de Telegram guardada.");
        setTgToken("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function probarBot() {
    iniciar(async () => {
      const r = await probarTelegram();
      if (r.ok) toast.success(r.detalle);
      else toast.error(r.error);
    });
  }

  function reintentar() {
    iniciar(async () => {
      const r = await reintentarPendientes();
      if (r.ok) {
        toast.success(r.detalle);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* ------------------------------ CORREO ------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5 text-primary" aria-hidden />
            Correo (SMTP)
            <span className="ml-auto">
              <Switch
                checked={smtpActivo}
                onCheckedChange={setSmtpActivo}
                aria-label="Activar el correo"
              />
            </span>
          </CardTitle>
          <CardDescription>
            Servidor por donde salen los avisos: solicitudes, aprobaciones,
            ausencias registradas por RR. HH. e invitaciones.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="grid gap-2">
              <Label htmlFor="smtp-host">Servidor</Label>
              <Input
                id="smtp-host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.consultoriae3.com"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="smtp-puerto">Puerto</Label>
              <Input
                id="smtp-puerto"
                type="number"
                value={smtpPuerto}
                onChange={(e) => setSmtpPuerto(e.target.value)}
                placeholder="587"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="grid">
              <p className="text-sm font-medium">Conexión segura (TLS)</p>
              <p className="text-xs text-muted-foreground">
                Actívalo para el puerto 465; el 587 suele ir sin él (STARTTLS).
              </p>
            </div>
            <Switch
              checked={smtpSeguro}
              onCheckedChange={setSmtpSeguro}
              aria-label="Conexión segura"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="smtp-usuario">Usuario</Label>
            <Input
              id="smtp-usuario"
              value={smtpUsuario}
              onChange={(e) => setSmtpUsuario(e.target.value)}
              placeholder="notificaciones@consultoriae3.com"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="smtp-contrasena">Contraseña</Label>
            <Input
              id="smtp-contrasena"
              type="password"
              value={smtpContrasena}
              onChange={(e) => setSmtpContrasena(e.target.value)}
              placeholder={
                smtp.tieneContrasena
                  ? "Guardada — déjalo vacío para conservarla"
                  : "La contraseña del servidor"
              }
              autoComplete="new-password"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="smtp-remitente">Remitente</Label>
            <Input
              id="smtp-remitente"
              value={smtpRemitente}
              onChange={(e) => setSmtpRemitente(e.target.value)}
              placeholder="Vacaciones E3 <no-reply@consultoriae3.com>"
            />
          </div>

          <Button onClick={guardarCorreo} disabled={enviando}>
            {enviando && (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            )}
            Guardar correo
          </Button>

          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
            <Label htmlFor="smtp-prueba" className="text-sm font-medium">
              Probar el envío
            </Label>
            <div className="flex gap-2">
              <Input
                id="smtp-prueba"
                type="email"
                value={destinoPrueba}
                onChange={(e) => setDestinoPrueba(e.target.value)}
                placeholder="tu.correo@consultoriae3.com"
              />
              <Button
                variant="outline"
                onClick={probar}
                disabled={enviando || !destinoPrueba}
              >
                <Send aria-hidden /> Probar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------- TELEGRAM ---------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" aria-hidden />
            Telegram (bot)
            <span className="ml-auto">
              <Switch
                checked={tgActivo}
                onCheckedChange={setTgActivo}
                aria-label="Activar Telegram"
              />
            </span>
          </CardTitle>
          <CardDescription>
            Los mismos avisos, en corto, a los chats que elijas. Crea el bot
            con @BotFather, pega su token y agrégalo al chat de destino.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tg-token">Token del bot</Label>
            <Input
              id="tg-token"
              type="password"
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              placeholder={
                telegram.tieneToken
                  ? "Guardado — déjalo vacío para conservarlo"
                  : "123456:ABC-DEF…"
              }
              autoComplete="new-password"
              spellCheck={false}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tg-chats">Chats de destino</Label>
            <Input
              id="tg-chats"
              value={tgChats}
              onChange={(e) => setTgChats(e.target.value)}
              placeholder="-1001234567890, 987654321"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              IDs separados por coma. Para averiguar el ID, escribe al bot y
              abre{" "}
              <code className="rounded bg-muted px-1">
                api.telegram.org/bot&lt;token&gt;/getUpdates
              </code>
              .
            </p>
          </div>

          <Button onClick={guardarBot} disabled={enviando}>
            {enviando && (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            )}
            Guardar Telegram
          </Button>

          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">Probar el bot</p>
            <Button variant="outline" onClick={probarBot} disabled={enviando}>
              <Send aria-hidden /> Enviar mensaje de prueba
            </Button>
          </div>

          <div className={TARJETA}>
            <p className="flex items-center gap-1.5 font-medium">
              <BellRing className="size-4" aria-hidden /> Qué se avisa
            </p>
            <p>
              Nueva solicitud (al empleado y a Recursos Humanos), aprobación o
              rechazo, ediciones de RR. HH., altas a nombre de otro e
              invitaciones (solo correo).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Reintentar la cola de avisos que quedaron sin canal o con error */}
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            Entrega
          </CardTitle>
          <CardDescription>
            Todo intento queda registrado en la cola de abajo. Si un canal
            estuvo apagado, los avisos quedan guardados y se reintentan aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={reintentar} disabled={enviando}>
            <RotateCcw aria-hidden /> Reintentar pendientes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
