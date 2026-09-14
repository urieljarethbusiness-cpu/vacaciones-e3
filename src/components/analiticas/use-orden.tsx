"use client";

import { useMemo, useState } from "react";

export type Orden<T> = { campo: keyof T; dir: "asc" | "desc" };

function comparar(a: unknown, b: unknown): number {
  // Nulos siempre al final, sin importar la dirección
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es");
}

/** Ordenamiento client-side por columna con toggle asc/desc. */
export function useOrden<T>(filas: T[], inicial: Orden<T>) {
  const [orden, setOrden] = useState<Orden<T>>(inicial);

  const filasOrdenadas = useMemo(() => {
    const factor = orden.dir === "asc" ? 1 : -1;
    return [...filas].sort((a, b) => {
      const c = comparar(a[orden.campo], b[orden.campo]);
      // El comparador deja los nulos al final; no invertirlos con el factor
      if (a[orden.campo] == null || b[orden.campo] == null) return c;
      return c * factor;
    });
  }, [filas, orden]);

  function alternar(campo: keyof T) {
    setOrden((o) =>
      o.campo === campo
        ? { campo, dir: o.dir === "asc" ? "desc" : "asc" }
        : { campo, dir: "desc" }
    );
  }

  return { filasOrdenadas, orden, alternar };
}

/** Encabezado de tabla clickeable con indicador de dirección. */
export function ThOrdenable<T>({
  campo,
  orden,
  alternar,
  children,
  className = "",
}: {
  campo: keyof T;
  orden: Orden<T>;
  alternar: (campo: keyof T) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const activo = orden.campo === campo;
  return (
    <button
      type="button"
      onClick={() => alternar(campo)}
      className={`inline-flex items-center gap-1 font-medium hover:text-foreground ${
        activo ? "text-foreground" : ""
      } ${className}`}
    >
      {children}
      <span className="text-xs">
        {activo ? (orden.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}
