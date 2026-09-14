import { base } from "@/lib/db";
import { ajusteEntero, misCiclosVacaciones } from "@/lib/db/consultas";
import { obtenerPerfilOredirigir } from "@/lib/perfil";
import { formatearFechaCorta } from "@/lib/ausencias";
import {
  AVISO_CICLO_NARANJA,
  AVISO_CICLO_ROJO,
  nivelAvisoCiclo,
} from "@/lib/vacaciones";
import { BandaAvisoCiclo } from "@/components/vacaciones/banda-aviso-ciclo";

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Decide si el header del área interna debe llevar la banda de aviso de
 * vacaciones, y con qué texto. Misma lógica que el original: sin ficha o sin
 * derecho (`dias_correspondientes = 0`), sin días restantes o fuera de
 * umbrales no se pinta nada. Los umbrales son ESTRICTOS (con exactamente el
 * umbral todavía no avisa).
 */
export async function AvisoCicloVacaciones() {
  const perfil = await obtenerPerfilOredirigir();
  const db = base();

  const ciclos = misCiclosVacaciones(db, perfil.id, 1);
  const balance = ciclos[0];
  if (!balance || balance.dias_correspondientes === 0) return null;
  if (balance.dias_restantes <= 0) return null;

  const nivel = nivelAvisoCiclo(
    balance.dias_para_expirar,
    ajusteEntero(db, "aviso_ciclo_naranja", AVISO_CICLO_NARANJA),
    ajusteEntero(db, "aviso_ciclo_rojo", AVISO_CICLO_ROJO)
  );
  if (!nivel) return null;

  const faltan = balance.dias_para_expirar;
  const sinUsar = plural(balance.dias_restantes, "día", "días");
  const reinicio = formatearFechaCorta(balance.ciclo_fin);

  const mensaje =
    faltan <= 0
      ? `Tu ciclo de vacaciones se reinicia hoy y te quedan ${sinUsar} sin usar.`
      : nivel === "rojo"
        ? `¡Últimos ${plural(faltan, "día", "días")}! Tu ciclo de vacaciones se reinicia el ${reinicio} y aún te quedan ${sinUsar} sin usar.`
        : `Faltan ${plural(faltan, "día", "días")} para que se reinicie tu ciclo de vacaciones (${reinicio}) y aún te quedan ${sinUsar} sin usar.`;

  return <BandaAvisoCiclo nivel={nivel} mensaje={mensaje} />;
}
