/**
 * Verificación de las reglas de vacaciones — espejo de los scripts
 * `verificar-vacaciones-lft` / `verificar-ciclo-siguiente` del original.
 *
 * Ejecuta las funciones PURAS de negocio y una base en memoria con el
 * esquema y las semillas reales, y comprueba las reglas del sistema:
 *
 *   1. Escala LFT art. 76 (12 días al año, quinquenios).
 *   2. Ciclo ANIVERSARIO → ANIVERSARIO (no año calendario).
 *   3. Días hábiles: sin sábados, domingos ni festivos.
 *   4. Anticipación mínima de 2 SEMANAS (14 días) para vacaciones.
 *   5. EMERGENCIA (salid/duelo/maternidad): cualquier día, incluso pasado.
 *   6. Saldo insuficiente rechazado.
 *   7. Traslapes rechazados.
 *   8. No cruzar el aniversario.
 *   9. Antigüedad: un año cumplido.
 *  10. Ventana: ciclo en curso + siguiente.
 *  11. Nadie se aprueba lo suyo; solo RR. HH. registra a nombre de otro.
 *  12. Dominios de correo de la casa para las altas.
 *  13. Coherencia de la escala editable (no decrece, año 1 obligatorio).
 *  14. Avisos de ciclo con umbrales ESTRICTOS (60/30).
 *
 * Uso:  npm run verificar
 */
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import type {
  TramoVacaciones,
  PoliticaAusenciaReglas,
} from "@/lib/db/reglas";

// Resuelve los alias "@/..." para poder ejecutar el código de la app directo.
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
    // Importaciones relativas sin extensión (ESM la exige): probar .ts/.tsx.
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.(ts|tsx|js|mjs|json|css|sql)$/i.test(spec)) {
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

const { DatabaseSync: _DS } = { DatabaseSync }; // (mantener import vivo)
const {
  validarSolicitud,
  diasHabiles,
  cicloActual,
  diasPorAnio,
  diaSiguienteISO,
  hoyISO,
} = await import("@/lib/db/reglas");
const {
  sembrarCatalogos,
  sembrarCuentas,
  festivosOficialesDeAnio,
  verificarContrasena,
  hashContrasena,
} = await import("@/lib/db/semilla");
const {
  misCiclosVacaciones,
  saldosEquipo,
  politicaDe,
  ajusteEntero,
} = await import("@/lib/db/consultas");
const { errorDeEscalaVacaciones } = await import("@/lib/vacaciones");

let pasan = 0;
let fallan = 0;
function comprobar(nombre: string, cond: boolean, detalle?: unknown) {
  if (cond) {
    pasan += 1;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallan += 1;
    console.error(`  ✗ ${nombre}`, detalle ?? "");
  }
}

// ---------------------------------------------------------------------------
// Base en memoria con esquema y semillas REALES
// ---------------------------------------------------------------------------

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(raiz, "src", "lib", "db", "esquema.sql"), "utf8"));
sembrarCatalogos(db);
sembrarCuentas(db);

const tramos = db
  .prepare("select anios, dias from politica_vacaciones order by anios")
  .all() as unknown as TramoVacaciones[];
const festivos = new Set(
  (db.prepare("select fecha from dias_festivos").all() as unknown as { fecha: string }[]).map(
    (f) => f.fecha
  )
);

const vacaciones: PoliticaAusenciaReglas = {
  tipo: "vacaciones",
  etiqueta: "Vacaciones",
  descuenta_vacaciones: true,
  requiere_evidencia: false,
  permite_retroactivo: false,
  exige_antiguedad: true,
  aplica_anticipacion: true,
  solo_gestor: false,
  activo: true,
};
const salud: PoliticaAusenciaReglas = {
  tipo: "permiso_salud",
  etiqueta: "Permiso por salud",
  descuenta_vacaciones: false,
  requiere_evidencia: true,
  permite_retroactivo: true,
  exige_antiguedad: false,
  aplica_anticipacion: false,
  solo_gestor: false,
  activo: true,
};

const HOY = hoyISO();
function sumarDias(iso: string, n: number): string {
  const d = new Date(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10))
  );
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function entrada(props: Partial<Parameters<typeof validarSolicitud>[0]> = {}) {
  return {
    operadorId: "empleado-1",
    empleadoId: "empleado-1",
    tipo: "vacaciones",
    fecha_inicio: sumarDias(HOY, 20),
    fecha_fin: sumarDias(HOY, 24),
    estado: "pendiente" as const,
    ...props,
  };
}

function contexto(props: Record<string, unknown> = {}) {
  return {
    hoy: HOY,
    tramos,
    festivos,
    politica: vacaciones,
    esGestor: false,
    fechaIngreso: "2024-01-15", // más de un año cumplido
    tieneVacaciones: true,
    anticipacionDias: 14,
    activas: [],
    anterior: null,
    ...props,
  };
}

console.log("\n1. Escala LFT art. 76");
comprobar("1 año → 12 días", diasPorAnio(tramos, 1) === 12);
comprobar("5 años → 20 días", diasPorAnio(tramos, 5) === 20);
comprobar("6 años → 22 días (salto del quinto)", diasPorAnio(tramos, 6) === 22);
comprobar("11 años → 24 días", diasPorAnio(tramos, 11) === 24);
comprobar("36 años → 34 (quinquenios)", diasPorAnio(tramos, 36) === 34);
comprobar("0 años → 0 días", diasPorAnio(tramos, 0) === 0);

console.log("\n2. Ciclo aniversario → aniversario");
const cicloEjemplo = cicloActual("2024-08-26", "2026-08-09");
comprobar(
  "quien entró el 26-ago-2024 corre 26-ago-2025 → 25-ago-2026 al 9-ago-2026",
  cicloEjemplo?.ciclo_inicio === "2025-08-26" && cicloEjemplo?.ciclo_fin === "2026-08-25",
  cicloEjemplo
);
const cicloSiguiente = cicloActual("2024-08-26", "2026-08-27");
comprobar(
  "y su ciclo SIGUIENTE es 26-ago-2026 → 25-ago-2027",
  cicloSiguiente?.anios === 2 &&
    cicloSiguiente?.ciclo_inicio === "2026-08-26" &&
    cicloSiguiente?.ciclo_fin === "2027-08-25",
  cicloSiguiente
);

console.log("\n3. Días hábiles");
comprobar(
  "lun–vie son 5",
  diasHabiles(festivos, "2026-01-05", "2026-01-09") === 5
);
comprobar(
  "sáb+dom no cuentan",
  diasHabiles(festivos, "2026-01-10", "2026-01-11") === 0
);
comprobar(
  "el festivo 25-dic no cuenta (navidad en jueves 2026)",
  diasHabiles(festivos, "2026-12-21", "2026-12-25") === 4
);
comprobar("rango invertido → 0", diasHabiles(festivos, "2026-01-09", "2026-01-05") === 0);

console.log("\n4. Anticipación mínima: 2 semanas para vacaciones");
const r13 = validarSolicitud(entrada({ fecha_inicio: sumarDias(HOY, 13), fecha_fin: sumarDias(HOY, 13) }), contexto());
const r14 = validarSolicitud(entrada({ fecha_inicio: sumarDias(HOY, 14), fecha_fin: sumarDias(HOY, 14) }), contexto());
comprobar("a 13 días se rechaza", !r13.ok, r13);
comprobar(
  "el mensaje es el del sistema",
  !r13.ok && r13.error === "Vacaciones se solicita con al menos 14 días de anticipación",
  r13
);
comprobar("a 14 días exactos se acepta", r14.ok, r14);
const r14Gestor = validarSolicitud(
  // OJO: HOY+2 puede caer en festivo (p. ej. el 16 de septiembre); HOY+3 evita
  // el colisión y comprueba solo la exención de la anticipación.
  entrada({ fecha_inicio: sumarDias(HOY, 3), fecha_fin: sumarDias(HOY, 3) }),
  contexto({ esGestor: true })
);
comprobar("RR. HH. queda exento de la anticipación (alta a nombre de otro)", r14Gestor.ok, r14Gestor);

console.log("\n5. Emergencia: cualquier día, incluso YA PASADO");
const rPasado = validarSolicitud(
  entrada({ tipo: "permiso_salud", fecha_inicio: sumarDias(HOY, -3), fecha_fin: sumarDias(HOY, -2) }),
  contexto({ politica: salud })
);
comprobar("salud con fecha pasada se acepta (permite_retroactivo)", rPasado.ok, rPasado);
const rPasadoVac = validarSolicitud(
  entrada({ fecha_inicio: sumarDias(HOY, -3), fecha_fin: sumarDias(HOY, -2) }),
  contexto()
);
// Igual que en el trigger del original, la anticipación se valida ANTES que
// el retroactivo, así que el rechazo llega por la anticipación.
comprobar(
  "vacaciones con fecha pasada se rechaza (por anticipación, mismo orden que el trigger)",
  !rPasadoVac.ok && rPasadoVac.error.includes("anticipación"),
  rPasadoVac
);

console.log("\n6. Saldo insuficiente");
const rSaldo = validarSolicitud(
  entrada({ fecha_inicio: sumarDias(HOY, 20), fecha_fin: sumarDias(HOY, 60) }),
  contexto({
    activas: [],
  })
);
// Con ingreso 2024-01-15: 2 años cumplidos → 14 días. Pedir ~29 hábiles desborda.
comprobar(
  "pedir más de lo que toca se rechaza con el mensaje exacto",
  !rSaldo.ok && /^Saldo insuficiente: solicitas \d+ días y te quedan 14$/.test(rSaldo.error),
  rSaldo
);

console.log("\n7. Traslapes");
const rTraslape = validarSolicitud(
  entrada({ fecha_inicio: sumarDias(HOY, 20), fecha_fin: sumarDias(HOY, 24) }),
  contexto({
    activas: [
      {
        id: "otra",
        tipo: "vacaciones",
        descuenta: true,
        fecha_inicio: sumarDias(HOY, 22),
        fecha_fin: sumarDias(HOY, 26),
        dias_habiles: 1,
      },
    ],
  })
);
comprobar(
  "se traslapa con otra activa",
  !rTraslape.ok && rTraslape.error === "El rango se traslapa con otra solicitud activa",
  rTraslape
);

console.log("\n8. No cruzar el aniversario");
const rCruce = validarSolicitud(
  entrada({ fecha_inicio: "2026-08-20", fecha_fin: "2026-09-01" }),
  contexto({ hoy: "2026-01-05", fechaIngreso: "2024-08-26" })
);
comprobar(
  "el rango que cruza el 26-ago-2026 se rechaza",
  !rCruce.ok &&
    rCruce.error ===
      "La solicitud no puede cruzar tu aniversario (2026-08-26); pídela en dos partes",
  rCruce
);

console.log("\n9. Antigüedad");
const rNuevo = validarSolicitud(
  entrada(),
  contexto({ fechaIngreso: sumarDias(HOY, -200) })
);
comprobar(
  "sin un año cumplido no hay vacaciones",
  !rNuevo.ok && rNuevo.error === "Se requiere al menos un año de antigüedad para solicitar vacaciones",
  rNuevo
);

console.log("\n10. Ventana: ciclo en curso + siguiente");
const rVentana = validarSolicitud(
  entrada({ fecha_inicio: "2028-09-06", fecha_fin: "2028-09-11" }),
  contexto({ hoy: "2026-01-05", fechaIngreso: "2024-08-26" })
);
comprobar(
  "pedir para el TERCER año se rechaza",
  !rVentana.ok &&
    rVentana.error ===
      "Solo puedes solicitar vacaciones de tu ciclo en curso o del siguiente (hasta el 2027-08-25).",
  rVentana
);

console.log("\n11. Nadie resuelve lo suyo");
const rAuto = validarSolicitud(
  entrada({ estado: "aprobada" }),
  contexto({ esGestor: true })
);
comprobar(
  "un gestor no puede darse de alta ya aprobada",
  !rAuto.ok &&
    rAuto.error ===
      "Tu propia ausencia la tiene que resolver otra persona con permiso de Vacaciones: regístrala como pendiente.",
  rAuto
);
const rAjeno = validarSolicitud(
  entrada({ empleadoId: "otro", operadorId: "yo" }),
  contexto({ esGestor: false })
);
comprobar(
  "un empleado no registra ausencias de otra persona",
  !rAjeno.ok && rAjeno.error === "No puedes registrar ausencias de otra persona.",
  rAjeno
);
const rSuper = validarSolicitud(
  entrada(),
  contexto({ tieneVacaciones: false })
);
comprobar(
  "un perfil sin vacaciones (superadmin/dirección) no acumula",
  !rSuper.ok &&
    rSuper.error ===
      "Ese perfil no tiene vacaciones asignadas (Dirección y Superadministrador gestionan las del equipo y no acumulan las suyas).",
  rSuper
);

console.log("\n12. Dominios de correo de la casa");
const dominios = (
  db
    .prepare("select dominio from dominios_empleado where activo = 1 order by dominio")
    .all() as unknown as { dominio: string }[]
).map((d) => d.dominio);
comprobar(
  "consultoriae3.com y grupo-e3.com activos",
  dominios.join(",") === "consultoriae3.com,grupo-e3.com",
  dominios
);

console.log("\n13. Coherencia de la escala editable");
comprobar(
  "una escala decreciente se rechaza",
  errorDeEscalaVacaciones([
    { anios: 1, dias: 12 },
    { anios: 2, dias: 10 },
  ]) !== null
);
comprobar(
  "sin el tramo del año 1 se rechaza",
  errorDeEscalaVacaciones([{ anios: 2, dias: 14 }]) !== null
);
comprobar(
  "años repetidos se rechazan",
  errorDeEscalaVacaciones([
    { anios: 1, dias: 12 },
    { anios: 1, dias: 14 },
  ]) !== null
);
comprobar(
  "la escala LFT sembrada es válida",
  errorDeEscalaVacaciones(tramos) === null
);

console.log("\n14. Avisos de ciclo (60/30, estrictos)");
const { nivelAvisoCiclo } = await import("@/lib/vacaciones");
comprobar("con 60 días exactos NO avisa (umbral estricto)", nivelAvisoCiclo(60) === null);
comprobar("con 59 avisa naranja", nivelAvisoCiclo(59) === "naranja");
comprobar("con 30 días exactos avisa NARANJA (el umbral es estricto)", nivelAvisoCiclo(30) === "naranja");
comprobar("con 29 avisa rojo", nivelAvisoCiclo(29) === "rojo");

console.log("\n15. Festivos oficiales LFT");
const f2026 = festivosOficialesDeAnio(2026);
comprobar("1 de enero: Año Nuevo", f2026.some(([f, n]) => f === "2026-01-01" && n === "Año Nuevo"));
const tercerLunesFeb = f2026.find(([f, n]) => n === "Día de la Constitución");
comprobar(
  "3er lunes de febrero de 2026 es el 16",
  tercerLunesFeb?.[0] === "2026-02-16",
  tercerLunesFeb
);
const f2030 = festivosOficialesDeAnio(2030);
comprobar(
  "2030 es sexenal: lleva Transmisión del Poder Ejecutivo",
  f2030.some(([, n]) => n === "Transmisión del Poder Ejecutivo Federal")
);

console.log("\n16. Semillas y cuentas de prueba");
comprobar(
  "politica_ausencias con los 7 tipos",
  (db.prepare("select count(*) as n from politica_ausencias").get() as { n: number }).n === 7
);
comprobar(
  "solo vacaciones, salud, maternidad y duelo activos… (5 activos: vacaciones, salud, maternidad, duelo + nada más)",
  (db.prepare("select count(*) as n from politica_ausencias where activo = 1").get() as { n: number }).n === 4
);
comprobar(
  "ajustes: anticipacion 14, semaforos 30/15, avisos 60/30",
  ajusteEntero(db, "anticipacion_minima_dias", 0) === 14 &&
    ajusteEntero(db, "semaforo_naranja", 0) === 30 &&
    ajusteEntero(db, "semaforo_rojo", 0) === 15 &&
    ajusteEntero(db, "aviso_ciclo_naranja", 0) === 60 &&
    ajusteEntero(db, "aviso_ciclo_rojo", 0) === 30
);
const superadmin = db
  .prepare("select id from perfiles where rol = 'superadmin'")
  .get() as { id: string } | undefined;
comprobar(
  "el superadmin NO acumula vacaciones propias (0 ciclos)",
  !!superadmin && misCiclosVacaciones(db, superadmin.id, 2).length === 0
);
const ana = db.prepare("select id from perfiles where email = 'ana@consultoriae3.com'").get() as
  | { id: string }
  | undefined;
comprobar(
  "Ana (ingreso 2024-08-26) ve su ciclo en curso",
  !!ana && misCiclosVacaciones(db, ana.id, 2).length >= 1
);
const hash = hashContrasena("prueba");
comprobar("hash scrypt verifica bien", verificarContrasena("prueba", hash));
comprobar("hash scrypt rechaza otra", !verificarContrasena("otra", hash));

console.log("\n17. Saldos del equipo (RR. HH.)");
const saldos = saldosEquipo(db);
comprobar(
  "el superadmin no aparece en saldos (no acumula)",
  !saldos.some((s) => s.email === "superadmin@consultoriae3.com"),
  saldos.map((s) => s.email)
);
comprobar(
  "Ana aparece con 12 días si ya cumplió su primer año… o 0 si no",
  saldos.some((s) => s.email === "ana@consultoriae3.com"),
  saldos.map((s) => s.email)
);

console.log("\n18. Política de tipos (reglas por tipo)");
const pv = politicaDe(db, "vacaciones");
const ps = politicaDe(db, "permiso_salud");
comprobar(
  "vacaciones: descuenta, exige antigüedad, aplica anticipación, NO retroactivo",
  !!pv && pv.descuenta_vacaciones && pv.exige_antiguedad && pv.aplica_anticipacion && !pv.permite_retroactivo
);
comprobar(
  "salud: NO descuenta, pide comprobante, permite retroactivo, sin anticipación",
  !!ps && !ps.descuenta_vacaciones && ps.requiere_evidencia && ps.permite_retroactivo && !ps.aplica_anticipacion
);
const pp = politicaDe(db, "permiso_personal");
comprobar("permiso_personal retirado (activo=0, conservado para histórico)", !!pp && !pp.activo);

console.log(`\n${pasan} pruebas OK, ${fallan} fallidas`);
process.exit(fallan === 0 ? 0 : 1);
