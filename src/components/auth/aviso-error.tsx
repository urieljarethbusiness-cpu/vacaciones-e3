/**
 * El bloque de error de las pantallas de acceso.
 *
 * POR QUÉ EXISTE. El mismo marcado estaba copiado en `/login`, en el
 * formulario de invitación y en el de restablecer, y a partir de esta entrega
 * habría cinco copias más. No es cosmética: dentro van tres decisiones que se
 * pierden en cuanto alguien reescribe una de las copias de memoria.
 *
 * EN LÍNEA Y NO EN UN TOAST. El emergente de `sonner` se va solo a los cuatro
 * segundos y deja a la persona sin poder releer qué falló, justo en las
 * pantallas que ve la PRIMERA vez que entra. Los toasts se quedan para lo que
 * salió bien.
 *
 * `role="alert"` para que un lector de pantalla lo anuncie sin que haya que
 * mover el foco, y el `id` para que el campo lo referencie con
 * `aria-describedby`: sin eso, quien navega por teclado oye «no válido» y no
 * oye el motivo.
 *
 * `motion-reduce:animate-none` va AQUÍ y no en quien lo usa. Es la misma lección
 * que `.e3-respira`: si la variante se escribe en cada sitio, respetar la
 * preferencia depende de acordarse, y eso se olvida una vez.
 */
import { TriangleAlertIcon } from "lucide-react";

export function AvisoError({
  id,
  children,
}: {
  /** El mismo que el `aria-describedby` de los campos que describe. */
  id: string;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-2.5 rounded-[14px] border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-[0.9375rem]/6 text-destructive duration-200 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
    >
      <TriangleAlertIcon
        className="mt-0.5 size-[1.125rem] shrink-0"
        aria-hidden="true"
      />
      {/* `min-w-0` en el hijo que debe encoger: sin él, un mensaje largo sin
          espacios —el correo de alguien, por ejemplo— empuja el icono fuera de
          la caja en lugar de partirse. */}
      <span className="min-w-0">{children}</span>
    </p>
  );
}
