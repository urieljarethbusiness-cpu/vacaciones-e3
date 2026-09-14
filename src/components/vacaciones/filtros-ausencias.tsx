"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTADOS_AUSENCIA, etiquetaEstado } from "@/lib/ausencias";

/**
 * Radix Select no admite un item con valor "": el vacío es el hueco que deja
 * el placeholder. Se usa un centinela para la opción «todos» y se traduce a
 * «borrar el parámetro» al escribir la URL.
 */
const TODOS = "todos";

export type OpcionTipo = { tipo: string; etiqueta: string };
export type OpcionEmpleado = { id: string; nombre_completo: string };

/**
 * Filtros de la tabla de ausencias. Viven en la URL (igual que los de la
 * bitácora) para que el server component reconsulte y para que el enlace sea
 * compartible; `tab` se preserva siempre, porque la pestaña también va en la
 * URL y un filtro no debe devolverte a la pestaña de solicitudes.
 */
export function FiltrosAusencias({
  tipos,
  empleados,
  tipo,
  estado,
  empleado,
  desde,
  hasta,
}: {
  tipos: OpcionTipo[];
  empleados: OpcionEmpleado[];
  tipo: string | null;
  estado: string | null;
  empleado: string | null;
  desde: string | null;
  hasta: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hayFiltros = Boolean(tipo || estado || empleado || desde || hasta);

  function aplicar(cambios: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) sp.set(clave, valor);
      else sp.delete(clave);
    }
    const query = sp.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="filtro-tipo">Tipo</Label>
        <Select
          value={tipo ?? TODOS}
          onValueChange={(v) => aplicar({ tipo: v === TODOS ? null : v })}
        >
          <SelectTrigger id="filtro-tipo" className="w-full min-w-0">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los tipos</SelectItem>
            {tipos.map((t) => (
              <SelectItem key={t.tipo} value={t.tipo}>
                {t.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="filtro-estado">Estado</Label>
        <Select
          value={estado ?? TODOS}
          onValueChange={(v) => aplicar({ estado: v === TODOS ? null : v })}
        >
          <SelectTrigger id="filtro-estado" className="w-full min-w-0">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {ESTADOS_AUSENCIA.map((e) => (
              <SelectItem key={e} value={e}>
                {etiquetaEstado(e)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="filtro-empleado">Persona</Label>
        <Select
          value={empleado ?? TODOS}
          onValueChange={(v) => aplicar({ empleado: v === TODOS ? null : v })}
        >
          <SelectTrigger id="filtro-empleado" className="w-full min-w-0">
            <SelectValue placeholder="Todo el equipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo el equipo</SelectItem>
            {empleados.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nombre_completo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="filtro-desde">Rango de fechas</Label>
        {/* Dos columnas iguales en vez de flex con separador: a 390 px el
            «—» le robaba ancho a los campos y el marcador de fecha salía
            recortado. Y apiladas por debajo de `sm`: el control de fecha de
            WebKit tiene sus propios anchos mínimos internos para `dd/mm/aaaa`,
            que además crecieron al subir la fuente a los 16 px que evitan el
            zoom de iOS. Con 123 px por columna a 320 px, el valor se cortaba. */}
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            id="filtro-desde"
            type="date"
            aria-label="Desde"
            className="min-w-0"
            value={desde ?? ""}
            onChange={(e) => aplicar({ desde: e.target.value || null })}
          />
          <Input
            type="date"
            aria-label="Hasta"
            className="min-w-0"
            value={hasta ?? ""}
            onChange={(e) => aplicar({ hasta: e.target.value || null })}
          />
        </div>
      </div>

      {hayFiltros && (
        <div className="sm:col-span-2 xl:col-span-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              aplicar({
                tipo: null,
                estado: null,
                empleado: null,
                desde: null,
                hasta: null,
              })
            }
          >
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
