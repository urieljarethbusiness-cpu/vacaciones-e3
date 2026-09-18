/**
 * Datos de demostración — llena la plataforma para poder recorrerla.
 *
 * Añade PERSONAS con antigüedades variadas y SOLICITUDES en todos los
 * estados (pendientes, aprobadas, rechazada, cancelada), respetando las
 * REGLAS DEL SISTEMA: ciclo aniversario, días hábiles sin festivos, saldo
 * por persona y sin traslapes. Idempotente: si ya existe la persona (por
 * email) o la solicitud (por rango+persona), no la duplica.
 *
 * Uso:  node scripts/datos-demo.ts [ruta_db]
 * (por defecto datos/vacaciones-e3.db)
 */
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

// Resuelve los alias "@/..." para ejecutar el código de la app directo.
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(spec, contexto, siguiente) {
    if (spec.startsWith("@/")) {
      const destino = join(raiz, "src", spec.slice(2));
      for (const c of [`${destino}.ts`, `${destino}.tsx`, join(destino, "index.ts")]) {
        if (existsSync(c)) return siguiente(pathToFileURL(c).href, contexto);
      }
    }
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[a-z]+$/i.test(spec)) {
      for (const sufijo of [".ts", ".tsx", "/index.ts"]) {
        try {
          return siguiente(spec + sufijo, contexto);
        } catch {
          /* siguiente candidato */
        }
      }
    }
    return siguiente(spec, contexto);
  },
});

const { DatabaseSync } = await import("node:sqlite");
const { hashContrasena, festivosOficialesDeAnio } = await import("@/lib/db/semilla");
const { cicloActual, diasHabiles, diasPorAnio, hoyISO } = await import("@/lib/db/reglas");
const { randomUUID } = await import("node:crypto");

const ruta = process.argv[2] ?? join(raiz, "datos", "vacaciones-e3.db");
const db = new DatabaseSync(ruta);
db.exec("pragma foreign_keys = on;");

let insertados = { personas: 0, solicitudes: 0 };

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

const PERSONAS: {
  email: string;
  nombre: string;
  rol: "empleado" | "manager" | "admin" | "superadmin";
  contrasena: string;
  ficha?: { ingreso: string; puesto: string; area: string };
}[] = [
  // Ciclo que TERMINA EN ~3 SEMANAS: alimenta la banda de aviso rojo y el
  // recordatorio de días por vencer.
  {
    email: "fernanda@consultoriae3.com",
    nombre: "Fernanda Salas",
    rol: "empleado",
    contrasena: "E3-Fer2026",
    ficha: { ingreso: "2021-10-04", puesto: "Diseñadora Senior", area: "Diseño" },
  },
  {
    email: "ricardo@grupo-e3.com",
    nombre: "Ricardo Méndez",
    rol: "manager",
    contrasena: "E3-Ric2026",
    ficha: { ingreso: "2020-05-11", puesto: "Encargado de Web", area: "Webmaster" },
  },
  {
    email: "paola@grupo-e3.com",
    nombre: "Paola Gómez",
    rol: "empleado",
    contrasena: "E3-Pao2026",
    ficha: { ingreso: "2023-11-20", puesto: "Trafficker", area: "Trafficker" },
  },
  {
    email: "sofia@consultoriae3.com",
    nombre: "Sofía Herrera",
    rol: "empleado",
    contrasena: "E3-Sof2026",
    ficha: { ingreso: "2025-01-06", puesto: "Community Manager Jr", area: "Community Manager" },
  },
];

const yaHay = undefined; void yaHay;

for (const p of PERSONAS) {
  const existe = db
    .prepare("select id from perfiles where lower(email) = lower(?)")
    .get(p.email) as { id: string } | undefined;
  if (existe) continue;
  const id = randomUUID();
  db.prepare(
    `insert into perfiles (id, email, contrasena_hash, nombre_completo, rol, activo, activado_en)
     values (?, ?, ?, ?, ?, 1, datetime('now'))`
  ).run(id, p.email, hashContrasena(p.contrasena), p.nombre, p.rol);
  if (p.ficha) {
    db.prepare(
      "insert into empleados (id, fecha_ingreso, puesto, area) values (?, ?, ?, ?)"
    ).run(id, p.ficha.ingreso, p.ficha.puesto, p.ficha.area);
  }
  insertados.personas += 1;
}

// ---------------------------------------------------------------------------
// Festivos de años futuros (para calendarios largos)
// ---------------------------------------------------------------------------
const festivo = db.prepare(
  "insert or ignore into dias_festivos (fecha, nombre, oficial) values (?, ?, 1)"
);
for (let anio = 2032; anio <= 2036; anio++) {
  for (const [f, n] of festivosOficialesDeAnio(anio)) festivo.run(f, n);
}

// ---------------------------------------------------------------------------
// Solicitudes
// ---------------------------------------------------------------------------

type Nueva = {
  email: string;
  tipo: string;
  inicio: string;
  fin: string;
  estado: "pendiente" | "aprobada" | "rechazada" | "cancelada";
  motivo?: string;
  comentarioManager?: string;
  porGestor?: boolean;
};

const HOY = hoyISO();
const SOLICITUDES: Nueva[] = [
  // PENDIENTES: la cola de RR. HH. con variedad de personas y tipos
  { email: "paola@grupo-e3.com", tipo: "vacaciones", inicio: iso(+21), fin: iso(+25), estado: "pendiente", motivo: "Vacaciones de fin de año" },
  { email: "ricardo@grupo-e3.com", tipo: "vacaciones", inicio: iso(+30), fin: iso(+34), estado: "pendiente" },
  { email: "fernanda@consultoriae3.com", tipo: "vacaciones", inicio: iso(+40), fin: iso(+43), estado: "pendiente", motivo: "Descanso de ciclo que se reinicia pronto" },
  // APROBADAS: consumos reales de saldo en el ciclo vigente
  { email: "ricardo@grupo-e3.com", tipo: "vacaciones", inicio: iso(-25), fin: iso(-21), estado: "aprobada", porGestor: true, comentarioManager: "Aprobadas antes del cierre de proyecto." },
  { email: "sofia@consultoriae3.com", tipo: "vacaciones", inicio: iso(-12), fin: iso(-8), estado: "aprobada", motivo: "Vacaciones de cumpleaños" },
  { email: "fernanda@consultoriae3.com", tipo: "vacaciones", inicio: iso(-60), fin: iso(-55), estado: "aprobada" },
  // RECHAZADA: sin año cumplido todavía
  { email: "luis@grupo-e3.com", tipo: "vacaciones", inicio: iso(+20), fin: iso(+24), estado: "rechazada", comentarioManager: "Se requiere al menos un año de antigüedad para solicitar vacaciones." },
  // CANCELADA: la persona la retiró
  { email: "paola@grupo-e3.com", tipo: "vacaciones", inicio: iso(-90), fin: iso(-86), estado: "cancelada", motivo: "Plan cambiado" },
  // PERMISO POR SALUD aprobado (no descuenta saldo, sí comprobante lógico)
  { email: "diego@grupo-e3.com", tipo: "permiso_salud", inicio: iso(-3), fin: iso(-2), estado: "aprobada", motivo: "Consulta médica", porGestor: true },
];

function iso(deltaDias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + deltaDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const tramos = db
  .prepare("select anios, dias from politica_vacaciones order by anios")
  .all() as unknown as { anios: number; dias: number }[];
const festivos = new Set(
  (db.prepare("select fecha from dias_festivos").all() as unknown as { fecha: string }[]).map(
    (f) => f.fecha
  )
);
const karla = db
  .prepare("select id from perfiles where email = 'rrhh@grupo-e3.com'")
  .get() as { id: string } | undefined;

for (const s of SOLICITUDES) {
  const persona = db
    .prepare(
      `select p.id, p.email, e.fecha_ingreso from perfiles p
       join empleados e on e.id = p.id where lower(p.email) = lower(?)`
    )
    .get(s.email) as { id: string; email: string; fecha_ingreso: string } | undefined;
  if (!persona) continue;

  const duplicada = db
    .prepare(
      "select 1 from solicitudes_vacaciones where empleado_id = ? and fecha_inicio = ? and fecha_fin = ?"
    )
    .get(persona.id, s.inicio, s.fin);
  if (duplicada) continue;

  const politica = db
    .prepare("select * from politica_ausencias where tipo = ?")
    .get(s.tipo) as
    | { tipo: string; descuenta_vacaciones: number; exige_antiguedad: number }
    | undefined;
  if (!politica) continue;

  // Ciclo y hábiles con las MISMAS reglas del sistema
  let cicloInicio: string, cicloFin: string;
  if (politica.descuenta_vacaciones) {
    const c = cicloActual(persona.fecha_ingreso, s.inicio);
    if (!c || c.anios < 1) continue; // sin derecho aún: no inventar la fila
    cicloInicio = c.ciclo_inicio;
    cicloFin = c.ciclo_fin;
    if (s.fin > cicloFin) continue; // cruzaría el aniversario: omitir
  } else {
    cicloInicio = s.inicio.slice(0, 4) + "-01-01";
    cicloFin = s.inicio.slice(0, 4) + "-12-31";
  }
  const habiles = diasHabiles(festivos, s.inicio, s.fin);
  if (habiles === 0) continue;

  // Saldo disponible del ciclo (para no pasarme al insertar)
  if (politica.descuenta_vacaciones && (s.estado === "pendiente" || s.estado === "aprobada")) {
    const usados = (
      db
        .prepare(
          `select coalesce(sum(dias_habiles), 0) as n from solicitudes_vacaciones sol
           join politica_ausencias pa on pa.tipo = sol.tipo
           where sol.empleado_id = ? and pa.descuenta_vacaciones = 1
             and sol.estado in ('pendiente','aprobada')
             and sol.ciclo_inicio = ?`
        )
        .get(persona.id, cicloInicio) as { n: number }
    ).n;
    const corresponden = diasPorAnio(tramos, cAniosDelCiclo(persona.fecha_ingreso, cicloFin));
    if (habiles > Math.max(corresponden - usados, 0)) continue; // no cabe: omitir
  }

  const ahora = new Date().toISOString();
  db.prepare(
    `insert into solicitudes_vacaciones
      (id, empleado_id, tipo, fecha_inicio, fecha_fin, dias_habiles,
       ciclo_inicio, ciclo_fin, estado, comentario_manager, motivo,
       resuelta_por, resuelta_en, creada_por, registrada_por_gestor, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' days'))`
  ).run(
    randomUUID(),
    persona.id,
    s.tipo,
    s.inicio,
    s.fin,
    habiles,
    cicloInicio,
    cicloFin,
    s.estado,
    s.comentarioManager ?? null,
    s.motivo ?? null,
    s.estado === "pendiente" ? null : (karla?.id ?? null),
    s.estado === "pendiente" ? null : ahora,
    persona.id,
    s.porGestor ? 1 : 0,
    String(Math.floor(Math.random() * 40) + 1)
  );
  insertados.solicitudes += 1;
}

/** Antigüedad (años) del ciclo que termina en `cicloFin`. */
function cAniosDelCiclo(fechaIngreso: string, cicloFin: string): number {
  const c = cicloActual(fechaIngreso, cicloFin);
  return c?.anios ?? 0;
}

console.log(
  `Datos demo: ${insertados.personas} persona(s) nueva(s), ${insertados.solicitudes} solicitud(es) nueva(s).`
);
