import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/**
 * Semilla de la base — los mismos datos que siembran las migraciones de
 * E3 Manager (0006, 0027+0030+0064+0083, 0006/0021/0041, 0084) y sus datos
 * de prueba. Idempotente: se aplica con `insert or ignore` / `or replace`
 * solo cuando toca.
 */

/** Hash de contraseña con scrypt (el mismo algoritmo de GoTrue, sin BD). */
export function hashContrasena(contrasena: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(contrasena, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verificarContrasena(
  contrasena: string,
  guardado: string
): boolean {
  const [esquema, salt, hash] = guardado.split(":");
  if (esquema !== "scrypt" || !salt || !hash) return false;
  const calculado = scryptSync(contrasena, salt, 64);
  const guardadoBuf = Buffer.from(hash, "hex");
  return calculado.length === guardadoBuf.length && calculado.equals(guardadoBuf);
}

/** Escala del art. 76 LFT con quinquenios (0006 + 0045), sin techo. */
export const ESCALA_LFT: [number, number][] = [
  [1, 12], [2, 14], [3, 16], [4, 18], [5, 20],
  [6, 22], [11, 24], [16, 26], [21, 28], [26, 30], [31, 32],
  [36, 34], [41, 36], [46, 38], [51, 40], [56, 42],
];

/** Filas finales de `politica_ausencias` (0027 + 0030 + 0064 + 0083). */
const POLITICA_AUSENCIAS: (
  [string, string, string, 0 | 1, 0 | 1, 0 | 1, 0 | 1, 0 | 1, 0 | 1, 0 | 1, 0 | 1, string, number, 0 | 1]
)[] = [
  // tipo, etiqueta, descripcion, descuenta, evidencia, retroactivo, antigüedad,
  // anticipación, solo_gestor, ausente, sensible, color, orden, activo
  ["vacaciones", "Vacaciones", "Días de descanso de la Ley Federal del Trabajo.", 1, 0, 0, 1, 1, 0, 1, 0, "#0ea5e9", 10, 1],
  ["permiso_salud", "Permiso por salud", "Incapacidad, consulta médica o convalecencia. Requiere comprobante.", 0, 1, 1, 0, 0, 0, 1, 1, "#f97316", 20, 1],
  ["permiso_personal", "Permiso personal", "Asunto personal autorizado por Recursos Humanos.", 0, 0, 0, 0, 1, 0, 1, 1, "#a855f7", 30, 0],
  ["permiso_sin_goce", "Permiso sin goce de sueldo", "Ausencia autorizada sin pago de salario.", 0, 0, 0, 0, 1, 0, 1, 1, "#f59e0b", 40, 0],
  ["maternidad_paternidad", "Maternidad / paternidad", "Licencia por nacimiento o adopción. Requiere comprobante.", 0, 1, 1, 0, 0, 0, 1, 1, "#ec4899", 50, 1],
  ["duelo", "Permiso por duelo", "Fallecimiento de un familiar directo.", 0, 0, 1, 0, 0, 0, 1, 1, "#94a3b8", 60, 1],
  ["home_office", "Trabajo remoto", "Jornada laboral desde casa; no es una ausencia con descuento.", 0, 0, 0, 0, 0, 0, 0, 0, "#22c55e", 70, 0],
];

/** Ajustes sembrados (0006, 0031/0035, 0041, 0021). */
const AJUSTES: [string, string][] = [
  ["anticipacion_minima_dias", "14"],
  ["semaforo_naranja", "30"],
  ["semaforo_rojo", "15"],
  ["aviso_ciclo_naranja", "60"],
  ["aviso_ciclo_rojo", "30"],
  // Automatizaciones (0021): recordatorio de solicitudes pendientes a quienes
  // aprueban, y aviso de días por vencer a cada empleado.
  [
    "automatizacion_vacaciones",
    JSON.stringify({
      activo: true,
      horarios: ["09:00", "16:00"],
      dias: [1, 2, 3, 4, 5],
      destinatarios_modo: "permiso",
      destinatarios: [],
    }),
  ],
  [
    "automatizacion_vencimiento",
    JSON.stringify({
      activo: true,
      horarios: ["09:00"],
      dias: [1, 2, 3, 4, 5],
      aviso_dias: 30,
    }),
  ],
  ["automatizacion_estado", JSON.stringify({})],
];

/**
 * Festivos oficiales LFT de un año (app.generar_festivos_oficiales):
 * los obligatorios del art. 74 y, en año sexenal, la Transmisión del Poder
 * Ejecutivo. Devuelve [fecha, nombre].
 */
export function festivosOficialesDeAnio(anio: number): [string, string][] {
  const nesimoLunes = (mes: number, n: number): string => {
    const d = new Date(anio, mes, 1);
    let cuent = 0;
    while (true) {
      if (d.getDay() === 1) {
        cuent += 1;
        if (cuent === n) break;
      }
      d.setDate(d.getDate() + 1);
    }
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${dia}`;
  };
  const iso = (mes: number, dia: number): string =>
    `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

  const lista: [string, string][] = [
    [iso(1, 1), "Año Nuevo"],
    [nesimoLunes(1, 3), "Día de la Constitución"],
    [nesimoLunes(2, 3), "Natalicio de Benito Juárez"],
    [iso(5, 1), "Día del Trabajo"],
    [iso(9, 16), "Día de la Independencia"],
    [nesimoLunes(10, 3), "Revolución Mexicana"],
    [iso(12, 25), "Navidad"],
  ];
  if ((anio - 2024) % 6 === 0) {
    lista.push([iso(10, 1), "Transmisión del Poder Ejecutivo Federal"]);
  }
  return lista;
}

/** Semillas del módulo: se aplican SIEMPRE con `or ignore` (no pisan edits). */
export function sembrarCatalogos(db: DatabaseSync): void {
  const escala = db.prepare(
    "insert or ignore into politica_vacaciones (anios, dias) values (?, ?)"
  );
  for (const [anios, dias] of ESCALA_LFT) escala.run(anios, dias);

  const politica = db.prepare(
    `insert or ignore into politica_ausencias
      (tipo, etiqueta, descripcion, descuenta_vacaciones, requiere_evidencia,
       permite_retroactivo, exige_antiguedad, aplica_anticipacion, solo_gestor,
       ausente_del_trabajo, motivo_sensible, color, orden, activo)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const fila of POLITICA_AUSENCIAS) politica.run(...fila);

  const ajuste = db.prepare("insert or ignore into ajustes (clave, valor) values (?, ?)");
  for (const [clave, valor] of AJUSTES) ajuste.run(clave, valor);

  const dominio = db.prepare("insert or ignore into dominios_empleado (dominio) values (?)");
  dominio.run("consultoriae3.com");
  dominio.run("grupo-e3.com");

  const festivo = db.prepare(
    "insert or ignore into dias_festivos (fecha, nombre, oficial) values (?, ?, 1)"
  );
  for (let anio = 2025; anio <= 2031; anio++) {
    for (const [fecha, nombre] of festivosOficialesDeAnio(anio)) {
      festivo.run(fecha, nombre);
    }
  }
}

/**
 * Cuentas de prueba. Las contraseñas de demostración están documentadas en
 * el README y solo siembran cuando la tabla está vacía.
 *
 * Superadministrador: SIN ficha y SIN permiso `vacaciones` — gestiona las del
 * equipo y no acumula las suyas, igual que en el original.
 */
export function sembrarCuentas(db: DatabaseSync): void {
  const hay = db.prepare("select count(*) as n from perfiles").get() as { n: number };
  if (hay.n > 0) return;

  const perfil = db.prepare(
    `insert into perfiles (id, email, contrasena_hash, nombre_completo, rol, activo, activado_en)
     values (?, ?, ?, ?, ?, 1, datetime('now'))`
  );
  const ficha = db.prepare(
    "insert into empleados (id, fecha_ingreso, puesto, area) values (?, ?, ?, ?)"
  );

  const cuentas: {
    email: string;
    contrasena: string;
    nombre: string;
    rol: "superadmin" | "admin" | "manager" | "empleado";
    ficha?: { ingreso: string; puesto: string; area: string };
  }[] = [
    {
      email: "superadmin@consultoriae3.com",
      contrasena: "E3-Super2026",
      nombre: "Uriel Jareth",
      rol: "superadmin",
    },
    {
      email: "rrhh@grupo-e3.com",
      contrasena: "E3-Rrhh2026",
      nombre: "Karla Montenegro",
      rol: "admin",
      ficha: { ingreso: "2021-03-15", puesto: "Recursos Humanos", area: "Administración" },
    },
    {
      email: "encargado@grupo-e3.com",
      contrasena: "E3-Enc2026",
      nombre: "Diego Fuentes",
      rol: "manager",
      ficha: { ingreso: "2022-08-01", puesto: "Encargado de Diseño", area: "Diseño" },
    },
    {
      email: "ana@consultoriae3.com",
      contrasena: "E3-Ana2026",
      nombre: "Ana Lozano",
      rol: "empleado",
      // Ejemplo del propio módulo: quien entró el 26-ago-2024 cumple años el
      // 26-ago-2026 y su ciclo corre 26-ago-2025 → 25-ago-2026.
      ficha: { ingreso: "2024-08-26", puesto: "Community Manager", area: "Community Manager" },
    },
    {
      email: "luis@grupo-e3.com",
      contrasena: "E3-Luis2026",
      nombre: "Luis Ramírez",
      rol: "empleado",
      // Primer año: todavía no acumula días.
      ficha: { ingreso: "2026-06-01", puesto: "Auxiliar", area: "Webmaster" },
    },
  ];

  for (const c of cuentas) {
    const id = randomUUID();
    perfil.run(id, c.email, hashContrasena(c.contrasena), c.nombre, c.rol);
    if (c.ficha) ficha.run(id, c.ficha.ingreso, c.ficha.puesto, c.ficha.area);
  }
}
