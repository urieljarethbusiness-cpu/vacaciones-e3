import { createHash } from "node:crypto";
import { base } from "@/lib/db";
import type { RolBase } from "@/lib/permisos";

/**
 * Consulta del estado de una invitación, para pintar la pantalla antes de
 * aceptar. Vive FUERA del módulo de acciones ("use server") porque una
 * exportación sincrona no puede viajar por el canal de acciones.
 */

function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

export type EstadoInvitacion =
  | { estado: "valida"; nombre: string; email: string; rol: RolBase }
  | { estado: "error"; motivo: string };

export function consultarInvitacion(token: string): EstadoInvitacion {
  if (!token) return { estado: "error", motivo: "Invitación no encontrada." };
  const inv = base()
    .prepare("select * from invitaciones where token_hash = ?")
    .get(sha256(token)) as
    | {
        nombre_completo: string;
        email: string;
        rol: string;
        expira_en: string;
        aceptada_en: string | null;
      }
    | undefined;
  if (!inv) return { estado: "error", motivo: "Invitación no encontrada." };
  if (inv.aceptada_en) {
    return { estado: "error", motivo: "Esta invitación ya fue utilizada." };
  }
  if (new Date(inv.expira_en).getTime() < Date.now()) {
    return { estado: "error", motivo: "Esta invitación ha expirado." };
  }
  return {
    estado: "valida",
    nombre: inv.nombre_completo,
    email: inv.email,
    rol: inv.rol as RolBase,
  };
}
