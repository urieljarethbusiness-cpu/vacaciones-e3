import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // `solo-raton:text-sm` y NO `md:text-sm`. Safari de iOS amplía la
        // página al enfocar un campo cuya fuente mide menos de 16 px, y no
        // vuelve a reducirla al salir: el usuario se queda con todo ampliado y
        // desplazado. Los 16 px de `text-base` lo evitan. Con el criterio de
        // ANCHO, un iPhone en horizontal (852 px, por encima de `md`) volvía a
        // caer en los 14 px y el zoom regresaba justo al girar el teléfono.
        // El criterio correcto es el PUNTERO: con ratón se ven 14 px, y
        // cualquier pantalla táctil mantiene 16 px sea cual sea su tamaño.
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 solo-raton:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
