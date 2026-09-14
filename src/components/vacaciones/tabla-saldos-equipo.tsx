"use client";

import { ArrowDownUp } from "lucide-react";
import { useOrden, ThOrdenable } from "@/components/analiticas/use-orden";
import { formatearFechaCorta, type SaldoEquipo } from "@/lib/ausencias";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * `saldos_equipo` hace `left join lateral app.balance_vacaciones(...) on true`,
 * y esa función devuelve CERO filas cuando el empleado no tiene
 * `fecha_ingreso`. Resultado: todas las columnas del balance llegan en `null`
 * para esas personas. El tipo compartido las declara `number`, así que aquí se
 * ensancha a nullable: es lo que de verdad llega por la red.
 */
export type FilaSaldo = Omit<
  SaldoEquipo,
  | "fecha_ingreso"
  | "anios"
  | "ciclo_inicio"
  | "ciclo_fin"
  | "dias_correspondientes"
  | "dias_usados"
  | "dias_restantes"
  | "dias_para_expirar"
> & {
  fecha_ingreso: string | null;
  anios: number | null;
  ciclo_inicio: string | null;
  ciclo_fin: string | null;
  dias_correspondientes: number | null;
  dias_usados: number | null;
  dias_restantes: number | null;
  dias_para_expirar: number | null;
};

/** Columnas ordenables, en el orden en que se pintan. */
const COLUMNAS: { campo: keyof FilaSaldo; etiqueta: string; corta: string }[] = [
  { campo: "nombre_completo", etiqueta: "Empleado", corta: "Empleado" },
  { campo: "area", etiqueta: "Área", corta: "Área" },
  { campo: "fecha_ingreso", etiqueta: "Ingreso", corta: "Ingreso" },
  { campo: "anios", etiqueta: "Antigüedad", corta: "Antigüedad" },
  { campo: "dias_correspondientes", etiqueta: "Días del ciclo", corta: "Días del ciclo" },
  { campo: "dias_usados", etiqueta: "Usados", corta: "Usados" },
  { campo: "dias_restantes", etiqueta: "Disponibles", corta: "Disponibles" },
  { campo: "dias_para_expirar", etiqueta: "Vence en", corta: "Vence en" },
  { campo: "pendientes", etiqueta: "Pendientes", corta: "Pendientes" },
  { campo: "dias_salud", etiqueta: "Días por salud", corta: "Días por salud" },
  { campo: "dias_otros", etiqueta: "Otros permisos", corta: "Otros permisos" },
];

const SIN_DATO = "—";

function numero(v: number | null): string {
  return v == null ? SIN_DATO : String(v);
}

function antiguedad(anios: number | null): string {
  if (anios == null) return SIN_DATO;
  if (anios < 1) return "Primer año";
  return `${anios} ${anios === 1 ? "año" : "años"}`;
}

function venceEn(dias: number | null): string {
  if (dias == null) return SIN_DATO;
  if (dias < 0) return "Ciclo vencido";
  if (dias === 0) return "Hoy";
  return `${dias} ${dias === 1 ? "día" : "días"}`;
}

/**
 * Semáforo de expiración con los MISMOS umbrales que `TarjetaBalance`
 * (`semaforo_naranja` / `semaforo_rojo` de `ajustes_publicos`): solo alerta si
 * de verdad quedan días sin usar en un ciclo con derecho.
 */
function claseSemaforo(
  f: FilaSaldo,
  umbralNaranja: number,
  umbralRojo: number
): string {
  if (f.dias_restantes == null || f.dias_para_expirar == null) return "";
  if (f.dias_restantes <= 0 || (f.dias_correspondientes ?? 0) <= 0) return "";
  if (f.dias_para_expirar <= umbralRojo) {
    return "font-semibold text-red-600 dark:text-red-400";
  }
  if (f.dias_para_expirar <= umbralNaranja) {
    return "font-semibold text-orange-600 dark:text-orange-400";
  }
  return "font-semibold text-emerald-600 dark:text-emerald-400";
}

export function TablaSaldosEquipo({
  saldos,
  umbralNaranja,
  umbralRojo,
}: {
  saldos: FilaSaldo[];
  umbralNaranja: number;
  umbralRojo: number;
}) {
  const { filasOrdenadas, orden, alternar } = useOrden<FilaSaldo>(saldos, {
    campo: "nombre_completo",
    dir: "asc",
  });

  if (saldos.length === 0) {
    return (
      <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        No hay empleados activos con ficha laboral.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Ordenación en pantallas sin encabezados de tabla */}
      <div className="flex min-w-0 flex-wrap items-end gap-2 lg:hidden">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor="orden-saldos">Ordenar por</Label>
          <Select
            value={String(orden.campo)}
            onValueChange={(v) => alternar(v as keyof FilaSaldo)}
          >
            <SelectTrigger id="orden-saldos" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLUMNAS.map((c) => (
                <SelectItem key={String(c.campo)} value={String(c.campo)}>
                  {c.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => alternar(orden.campo)}
          aria-label={
            orden.dir === "asc" ? "Orden ascendente" : "Orden descendente"
          }
        >
          <ArrowDownUp />
          {orden.dir === "asc" ? "Ascendente" : "Descendente"}
        </Button>
      </div>

      {/* Móvil y tablet: tarjetas apiladas, sin scroll horizontal */}
      <ul className="grid min-w-0 gap-3 lg:hidden">
        {filasOrdenadas.map((f) => (
          <li key={f.empleado_id} className="rounded-lg border p-3">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{f.nombre_completo}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {f.area ?? "Sin área"}
                  {f.puesto ? ` · ${f.puesto}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`text-2xl leading-none ${claseSemaforo(f, umbralNaranja, umbralRojo)}`}
                >
                  {numero(f.dias_restantes)}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Disponibles
                </p>
              </div>
            </div>

            {f.fecha_ingreso == null && (
              <p className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                Sin fecha de ingreso: no se puede calcular el saldo LFT.
              </p>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <Dato etiqueta="Ingreso">
                {f.fecha_ingreso ? formatearFechaCorta(f.fecha_ingreso) : SIN_DATO}
              </Dato>
              <Dato etiqueta="Antigüedad">{antiguedad(f.anios)}</Dato>
              <Dato etiqueta="Días del ciclo">
                {numero(f.dias_correspondientes)}
              </Dato>
              <Dato etiqueta="Usados">{numero(f.dias_usados)}</Dato>
              <Dato etiqueta="Vence en">
                <span className={claseSemaforo(f, umbralNaranja, umbralRojo)}>
                  {venceEn(f.dias_para_expirar)}
                </span>
              </Dato>
              <Dato etiqueta="Pendientes">{f.pendientes}</Dato>
              <Dato etiqueta="Días por salud">{f.dias_salud}</Dato>
              <Dato etiqueta="Otros permisos">{f.dias_otros}</Dato>
            </dl>
          </li>
        ))}
      </ul>

      {/* Escritorio: tabla ordenable por encabezado.
          `min-w-0` no es decorativo: sin él, el hijo de un grid conserva su
          `min-width:auto` (el ancho mínimo de sus 11 columnas), se ensancha y
          arrastra al `<main>` a desbordarse en vez de dejar que la tabla use
          su propia barra horizontal. */}
      <div className="hidden min-w-0 lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNAS.map((c) => (
                <TableHead
                  key={String(c.campo)}
                  className={c.campo === "nombre_completo" ? "" : "text-right"}
                >
                  <ThOrdenable<FilaSaldo>
                    campo={c.campo}
                    orden={orden}
                    alternar={alternar}
                  >
                    {c.corta}
                  </ThOrdenable>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filasOrdenadas.map((f) => (
              <TableRow key={f.empleado_id}>
                <TableCell className="max-w-56 truncate font-medium">
                  {f.nombre_completo}
                </TableCell>
                <TableCell className="text-right">
                  {f.area ?? SIN_DATO}
                </TableCell>
                <TableCell className="text-right">
                  {f.fecha_ingreso
                    ? formatearFechaCorta(f.fecha_ingreso)
                    : SIN_DATO}
                </TableCell>
                <TableCell className="text-right">
                  {antiguedad(f.anios)}
                </TableCell>
                <TableCell className="text-right">
                  {numero(f.dias_correspondientes)}
                </TableCell>
                <TableCell className="text-right">
                  {numero(f.dias_usados)}
                </TableCell>
                <TableCell
                  className={`text-right ${claseSemaforo(f, umbralNaranja, umbralRojo)}`}
                >
                  {numero(f.dias_restantes)}
                </TableCell>
                <TableCell
                  className={`text-right ${claseSemaforo(f, umbralNaranja, umbralRojo)}`}
                >
                  {venceEn(f.dias_para_expirar)}
                </TableCell>
                <TableCell className="text-right">{f.pendientes}</TableCell>
                <TableCell className="text-right">{f.dias_salud}</TableCell>
                <TableCell className="text-right">{f.dias_otros}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  );
}
