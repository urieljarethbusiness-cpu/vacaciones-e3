import { exigirAdminPagina } from "@/lib/perfil";
import { base } from "@/lib/db";
import type { TramoVacaciones } from "@/lib/vacaciones";
import { TablaPoliticaVacaciones } from "@/components/configuracion/tabla-politica-vacaciones";

/**
 * Ajustes generales — la escala del art. 76 LFT, editable por un admin.
 * Cambiarla re-precia TODOS los saldos (no están guardados), y la acción lo
 * deja asentado en la bitácora con el número de personas sobregiradas.
 */
export default async function PaginaAjustesGenerales() {
  await exigirAdminPagina();
  const db = base();
  // node:sqlite entrega filas con prototipo nulo: se convierten a objetos
  // planos para poder enviarlas al componente cliente.
  const filas = db
    .prepare("select anios, dias from politica_vacaciones order by anios")
    .all() as unknown as { anios: number; dias: number }[];
  const escala: TramoVacaciones[] = filas.map((f) => ({
    anios: Number(f.anios),
    dias: Number(f.dias),
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <p className="-mt-2 text-sm text-muted-foreground">
        La escala de días del art. 76 LFT. Cambiarla re-precia todos los
        saldos: los saldos no están guardados, se recalculan al leerlos.
      </p>
      <TablaPoliticaVacaciones inicial={escala} />
    </div>
  );
}
