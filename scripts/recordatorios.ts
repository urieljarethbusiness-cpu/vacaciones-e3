/**
 * Recordatorios programados — el equivalente del worker del original.
 *
 * Se ejecuta de forma periódica (cron, Programador de tareas de Windows…);
 * él solo decide si toca enviar según la agenda configurada en
 * Configuración › Automatizaciones: día de la semana, horarios y marcador
 * de lo ya enviado hoy. Cada automation mantiene sus propios horarios.
 *
 *   crontab:  *\/15 8-18 * * 1-5  node scripts/recordatorios.ts
 *   Windows:  schtasks /sc minute /mo 15 …  node scripts\recordatorios.ts
 *
 * Salida: una línea por automatización con el resultado del intento.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

// Resuelve los alias "@/..." para ejecutar el código de la app directo.
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(spec, contexto, siguiente) {
    if (spec.startsWith("@/")) {
      const destino = join(raiz, "src", spec.slice(2));
      const candidatos = [
        `${destino}.ts`,
        `${destino}.tsx`,
        join(destino, "index.ts"),
      ];
      for (const c of candidatos) {
        if (existsSync(c)) return siguiente(pathToFileURL(c).href, contexto);
      }
    }
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[a-z]+$/i.test(spec)) {
      for (const sufijo of [".ts", ".tsx", "/index.ts"]) {
        try {
          return siguiente(spec + sufijo, contexto);
        } catch {
          // probar el siguiente candidato
        }
      }
    }
    return siguiente(spec, contexto);
  },
});

const { base } = await import("@/lib/db");
const { ejecutarRecordatorio } = await import("@/server/recordatorios");

const db = base();
let fallas = 0;

for (const clave of ["vacaciones", "vencimiento"] as const) {
  const r = await ejecutarRecordatorio(db, clave, null, false);
  if (r.ok) {
    console.log(`[${clave}] ${r.detalle}`);
  } else {
    // "Hoy no toca envío" no es un fallo: es el caso normal entre horarios.
    if (r.error.includes("no toca envío") || r.error.includes("desactivado")) {
      console.log(`[${clave}] ${r.error}`);
    } else {
      fallas += 1;
      console.error(`[${clave}] ${r.error}`);
    }
  }
}
process.exit(fallas === 0 ? 0 : 1);
