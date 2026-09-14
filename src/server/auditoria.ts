import type { DatabaseSync } from "node:sqlite";
import type { PerfilSesion } from "./sesiones";

/**
 * Bitácora — espejo del módulo de auditoría del original: toda acción de un
 * gestor sobre datos ajenos queda registrada con actor, antes y después.
 */

export type EntradaAuditoria = {
  categoria: string;
  accion: string;
  entidad?: string;
  entidad_id?: string;
  entidad_etiqueta?: string;
  actor: Pick<PerfilSesion, "id" | "email" | "nombre_completo" | "rol">;
  antes?: unknown;
  despues?: unknown;
  metadatos?: unknown;
};

export function registrarAuditoria(
  db: DatabaseSync,
  entrada: EntradaAuditoria
): void {
  db.prepare(
    `insert into auditoria
      (categoria, accion, entidad, entidad_id, entidad_etiqueta,
       actor_id, actor_email, actor_nombre, actor_rol, antes, despues, metadatos)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entrada.categoria,
    entrada.accion,
    entrada.entidad ?? null,
    entrada.entidad_id ?? null,
    entrada.entidad_etiqueta ?? null,
    entrada.actor.id,
    entrada.actor.email,
    entrada.actor.nombre_completo,
    entrada.actor.rol,
    entrada.antes ? JSON.stringify(entrada.antes) : null,
    entrada.despues ? JSON.stringify(entrada.despues) : null,
    entrada.metadatos ? JSON.stringify(entrada.metadatos) : null
  );
}
