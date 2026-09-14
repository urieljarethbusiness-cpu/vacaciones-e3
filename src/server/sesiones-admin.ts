import type { DatabaseSync } from "node:sqlite";

/** Cierra todas las sesiones activas de una persona (uso administrativo). */
export async function destruirSesionesDe(
  db: DatabaseSync,
  perfilId: string
): Promise<void> {
  db.prepare("delete from sesiones where perfil_id = ?").run(perfilId);
}
