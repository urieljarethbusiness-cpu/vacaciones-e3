import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sembrarCatalogos, sembrarCuentas } from "./semilla";

/**
 * Conexión SQLite de la aplicación (node:sqlite, sin dependencias nativas).
 *
 * La base vive en `datos/vacaciones-e3.db` dentro del proyecto y se crea con
 * su esquema y semillas la primera vez que se abre. El singleton viaja en
 * `globalThis` para que el recargador de desarrollo no abra una conexión por
 * recarga.
 */

function abrirBase(): DatabaseSync {
  const carpeta = join(process.cwd(), "datos");
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });
  const db = new DatabaseSync(join(carpeta, "vacaciones-e3.db"));
  db.exec("pragma journal_mode = wal;");
  db.exec("pragma foreign_keys = on;");
  // El esquema viaja con el proyecto (no con el bundle): se lee desde la
  // raíz, que es donde viven tanto `src/` como la carpeta `datos/`.
  const esquema = readFileSync(
    join(process.cwd(), "src", "lib", "db", "esquema.sql"),
    "utf8"
  );
  db.exec(esquema);
  migrar(db);
  sembrarCatalogos(db);
  sembrarCuentas(db);
  return db;
}

/**
 * Migraciones para bases creadas con un esquema anterior: `alter table`
 * idempotente (si la columna ya existe, el error se ignora).
 */
function migrar(db: DatabaseSync): void {
  const columnas = (
    db.prepare("pragma table_info(notificaciones_outbox)").all() as unknown as {
      name: string;
    }[]
  ).map((c) => c.name);
  if (!columnas.includes("canal")) {
    db.exec(
      "alter table notificaciones_outbox add column canal text not null default 'correo'"
    );
  }
  if (!columnas.includes("detalle_error")) {
    db.exec(
      "alter table notificaciones_outbox add column detalle_error text"
    );
  }
  // Estados nuevos del check anterior: SQLite no relaja el CHECK viejo sin
  // reconstruir la tabla; si la base vieja no admite 'sin_canal', se vuelve a
  // crear con los datos preservados.
  const check = (
    db
      .prepare(
        "select sql from sqlite_master where type = 'table' and name = 'notificaciones_outbox'"
      )
      .get() as { sql: string } | undefined
  )?.sql;
  if (check && !check.includes("'sin_canal'")) {
    db.exec("begin");
    try {
      db.exec(`alter table notificaciones_outbox rename to notificaciones_outbox_vieja`);
      db.exec(
        readFileSync(
          join(process.cwd(), "src", "lib", "db", "esquema.sql"),
          "utf8"
        )
      );
      db.exec(
        `insert into notificaciones_outbox
           (id, destinatario, plantilla, asunto, cuerpo, canal, estado, detalle_error, created_at)
         select id, destinatario, plantilla, asunto, cuerpo,
           'correo',
           case when estado = 'sin_smtp' then 'sin_canal' else estado end,
           null,
           created_at
         from notificaciones_outbox_vieja`
      );
      db.exec("drop table notificaciones_outbox_vieja");
      db.exec("commit");
    } catch (e) {
      db.exec("rollback");
      throw e;
    }
  }
}

const globalConBase = globalThis as unknown as {
  baseVacaciones?: DatabaseSync;
};

export function base(): DatabaseSync {
  if (!globalConBase.baseVacaciones) {
    globalConBase.baseVacaciones = abrirBase();
  }
  return globalConBase.baseVacaciones;
}
