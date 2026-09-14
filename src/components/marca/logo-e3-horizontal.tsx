import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logotipo horizontal completo de Consultoría E3: el símbolo E3 junto al
 * descriptor «Estrategias Empresariales en eBusiness».
 *
 * ES OTRO COMPONENTE Y NO UN TAMAÑO DE `LogoE3`, por dos motivos que no son
 * de estilo:
 *
 * 1. **El texto alternativo tiene que ser distinto.** `LogoE3` va con
 *    `alt=""` —correctamente— porque en los tres sitios donde se usa hay texto
 *    adyacente que ya nombra la marca, y con alt un lector de pantalla la
 *    anunciaría dos veces. Aquí NO vale ese razonamiento: esta imagen contiene
 *    texto legible —el descriptor— que no está escrito en ningún otro sitio de
 *    la pantalla. Con `alt=""` ese texto sencillamente no existiría para quien
 *    usa un lector. Por eso nace con su `alt` puesto y no se puede vaciar
 *    desde fuera.
 * 2. **Tiene un ancho mínimo real.** Por debajo de unos 224 px la altura de
 *    mayúscula del descriptor baja de ~13 px y el ® se vuelve un punto sucio:
 *    sería poner el descriptor sin que se pueda leer, que es peor que no
 *    ponerlo. Ese suelo está en el valor por defecto de `className`, y por eso
 *    esto no se usa ni en la barra lateral (que colapsa a 64 px) ni en la
 *    tarjeta del formulario. Para esos sitios está `LogoE3`.
 *
 * `unoptimized`, igual que en `LogoE3`: pesa 27 KB, se pinta siempre al mismo
 * tamaño y ya sale comprimido del generador. Además, medido en WebKit, la
 * petición a `/_next/image` se quedaba colgada hasta agotar el tiempo de
 * espera y la marca salía como imagen rota.
 *
 * Lo produce `scripts/generar-iconos-marca.mjs` desde
 * `assets/logos/logo_horizontal_blanco.png`, teñido desde su canal alfa — así
 * que pedirlo en otro color es cambiar un argumento, no añadir un archivo.
 */
export function LogoE3Horizontal({ className }: { className?: string }) {
  return (
    <Image
      src="/marca/logo-e3-horizontal-blanco.png"
      // Coma y no raya: la raya es una pausa que el ojo suple y el oído no.
      // VoiceOver la lee como «guion» con verbosidad alta, y con la normal la
      // convierte en un silencio raro en mitad del nombre de la marca.
      alt="Consultoría E3, Estrategias Empresariales en eBusiness"
      width={640}
      height={194}
      unoptimized
      priority
      className={cn("h-auto w-56 xl:w-64", className)}
    />
  );
}
