import { LogoE3Horizontal } from "@/components/marca/logo-e3-horizontal";
import { RedDeAcceso } from "@/components/marca/red-de-acceso";

/**
 * Armazón de las cuatro pantallas de acceso.
 *
 * DEJA DE SER «UNA TARJETA SOBRE UNA ESCENA» Y PASA A SER DOS PLANOS. La marca
 * ocupa la columna izquierda y el formulario se apoya en una SUPERFICIE OPACA a
 * sangre que llega a los cuatro bordes de su columna. No es la tarjeta de antes
 * hecha grande: es la única manera de quitar el marco sin quedarse sin fondo
 * bajo el texto.
 *
 * POR QUÉ SIGUE HABIENDO UNA SUPERFICIE OPACA, aunque la referencia de diseño
 * «no tenga tarjeta». Medido leyendo el propio `<canvas>` con `getImageData` a
 * lo largo de 14 fotogramas: la red es negra de media (L=0,0023) pero su píxel
 * más brillante llega a **L=0,295**, y ahí el blanco se queda en **2,92:1**. O
 * sea que poner las etiquetas y la nota de invitación directamente sobre la red
 * es jugarse el contraste a que un núcleo de nodo no caiga bajo una letra —y
 * cuando cae, falla durante segundo y medio y se arregla solo, que es la peor
 * forma de fallar porque nadie la reproduce—. Con la superficie opaca el número
 * es fijo: 16,01:1, y no depende del fotograma.
 *
 * LA COSTURA ES CRUDA Y ESO ES DELIBERADO. El comentario que había aquí antes
 * rechazaba «partir la pantalla con un `border-l`», y tenía razón: una LÍNEA de
 * 1 px anuncia dos cosas pegadas. Un plano opaco a sangre no es una línea, es
 * profundidad. Se resuelve con material —filamento interior encendido y derrame
 * de luz cian hacia la izquierda—, no con un degradado difuminado: un degradado
 * traslúcido ahí estaría compuesto sobre un lienzo que se repinta, que es justo
 * lo que no se puede hacer.
 *
 * SIEMPRE EN TEMA OSCURO. La clase `dark` redeclara los tokens para todo el
 * subárbol y `[color-scheme:dark]` se hereda hasta la barra de desplazamiento
 * del `<main>` y el contraste del autorrelleno. (Ojo: las variantes `dark:` de
 * ESTE mismo div no se aplican; el selector es `.dark *`, o sea descendientes.)
 *
 * EL FORMULARIO VA PRIMERO EN EL DOM Y LA MARCA DESPUÉS. En móvil
 * `flex-col-reverse` sube la marca y en escritorio `flex-row-reverse` la manda a
 * la izquierda, sin tocar el marcado: el orden de lectura y de tabulación sigue
 * empezando por el campo de correo. Con `order-*` se vería igual y un lector de
 * pantalla recitaría primero la decoración.
 */
export default function LayoutAcceso({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="dark relative flex min-h-0 flex-1 flex-col-reverse overflow-hidden bg-background text-foreground [color-scheme:dark] lg:flex-row-reverse">
      <RedDeAcceso />

      {/* Halo principal. En móvil cae detrás del logotipo (arriba); desde `lg`
          se recoloca en la esquina SUPERIOR IZQUIERDA, que es donde ahora vive
          la marca y donde el lienzo tiene su núcleo. Va debajo del lienzo a
          propósito: encima lavaría los nodos. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[14%] -left-[20%] z-0 aspect-square w-[120%] rounded-full bg-primary/[0.10] blur-[110px] sm:w-[82%] lg:-top-[30%] lg:-left-[18%] lg:w-[54%] lg:bg-primary/[0.09] lg:blur-[120px] 2xl:blur-[180px]"
      />

      {/*
        AQUÍ HABÍA UN SEGUNDO HALO, abajo a la izquierda, y se retiró midiendo.

        Su justificación escrita era que «el lienzo se apaga por foco antes de
        llegar al titular, así que sin esto la mitad inferior de la columna de
        marca sería negro liso». Dejó de ser verdad en cuanto el foco pasó de
        interruptor a MODULADOR y la red se extendió por todo el bloque: ahí
        abajo ahora hay red, y el halo solo aportaba un telón que le robaba
        contraste al titular sin llenar ningún hueco.

        Medido: quitarlo baja la luminancia de fondo de la banda del texto un
        16 % a 1440×900, y ese margen es exactamente lo que permite subir la
        presencia de la red detrás del texto sin bajar del listón de 7:1.
      */}

      {/*
        SUPERFICIE DEL FORMULARIO.

        `oklch(0.205 0 0)` (#171717) y no `bg-card`. El fondo de la página es
        #070707 y `--card` es #131313: 1,08:1, con ΔL de 0,05 en OKLCH, por
        debajo del ΔL≈0,07 en el que el ojo empieza a separar dos superficies
        oscuras. #171717 sube el escalón a 0,075 y se lee como plano.

        `pantalla-alta:max-lg:rounded-t-[30px]` — el radio superior SOLO existe
        cuando hay algo por encima que redondear contra. Por debajo de 600 px de
        alto el bloque de marca desaparece y la hoja se queda con toda la
        pantalla: ahí un radio flotando contra el borde del navegador se ve como
        un fallo. Variante compuesta y no dos utilidades sueltas, para que no
        haya conflicto de cascada entre `lg:` y `pantalla-alta:`.
      */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 bg-[oklch(0.205_0_0)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09),0_-30px_70px_-40px_rgba(0,0,0,0.95)] pantalla-alta:max-lg:rounded-t-[30px] lg:w-[47%] lg:flex-none lg:shadow-[inset_1px_0_0_0_rgba(255,255,255,0.09),-60px_0_120px_-70px_var(--primary)] xl:w-[45%]">
        {children}
      </div>

      {/*
        BLOQUE DE MARCA.

        TRES PARADAS VERTICALES Y NO DOS. El `justify-between` de antes dejaba el
        logotipo arriba, el titular clavado abajo y 489 px de nada en medio —el
        54 % de la pantalla a 1440×900—, y eso es exactamente lo que se lee como
        «el texto se ha caído». Subirlo a secas no arregla nada: mueve el agujero
        abajo. Ahora hay logotipo, titular a media altura y un pie, con el hueco
        repartido 1,5:1 entre arriba y abajo por dos separadores de crecimiento
        desigual. Medido: el titular arranca al 44,1 % a 1440×900, al 42,1 % a
        1280×800 y al 42,6 % a 1024×768 — la proporción aguanta el alto de
        ventana, cosa que un `mt-[N]` fijo no hace.

        Y el hueco de arriba deja de estar vacío porque ahí es donde el foco del
        lienzo concentra la red: en la referencia el titular también está bajo,
        lo que lo salva es que encima hay algo.

        Ese 42 % no es solo composición: es el umbral por debajo del cual el foco
        del lienzo ya vale 0 y el contraste del titular deja de depender del
        fotograma (ver `red-de-acceso.tsx`).

        `shrink-0` y fuera del scroller: quien se desplaza es el `<main>` del
        formulario, así que en móvil la marca no se va al recorrer los campos.

        Y DESAPARECE CUANDO NO HAY ALTO (`pantalla-alta:`). No se toca: a
        320×256 —lo que queda de un monitor de 1280 al ampliar al 400 %— este
        bloque se comía el 69 % de la pantalla.
      */}
      <aside className="relative z-10 hidden min-w-0 shrink-0 flex-col items-center gap-3.5 px-5 pt-9 pb-7 text-center pantalla-alta:flex sm:gap-4 lg:grow lg:items-start lg:gap-0 lg:px-14 lg:py-14 lg:text-left xl:px-20 xl:py-16">
        {/* `drop-shadow` sobre el logotipo: en escritorio cae dentro del núcleo
            del foco, donde el peor píxel de la red mide L=0,295. El logotipo
            lleva texto legible de ~13 px de altura de mayúscula —el descriptor—
            y una sombra proyectada le garantiza un reborde oscuro pase lo que
            pase detrás. Es un filtro sobre un PNG estático: se compone una vez,
            no por fotograma. */}
        <LogoE3Horizontal className="drop-shadow-[0_2px_24px_rgba(0,0,0,0.85)]" />

        {/* Los dos separadores. `flex-[1.5]` arriba y `flex-1` abajo: el
            sobrante se reparte 60/40 y el titular queda por encima del centro
            del hueco, con algo debajo. Son `hidden` en móvil porque allí el
            bloque es una franja apilada, no una columna. */}
        <div aria-hidden="true" className="hidden lg:block lg:flex-[1.5]" />

        {/* El ancho máximo va en cada párrafo y NO aquí: la unidad `ch` se
            calcula con el tamaño de fuente DEL ELEMENTO que la usa, y en un
            contenedor sin `font-size` heredaba los 16 px del cuerpo. */}
        <div className="min-w-0">
          {/*
            UN SOLO NODO PARA LOS DOS REGÍMENES. En móvil es una línea de 16 px
            que hace de descriptor bajo el logotipo; desde `lg` es el titular de
            display.

            SUBE DE 15 A 16 PX EN MÓVIL Y DE white/70 A white/78. 15 px con un
            70 % de blanco es el tamaño que se pone porque «es solo una línea de
            apoyo»; para alguien de 55 años es la línea que decide si esta
            pantalla le parece amable o le parece un trámite. 12,09:1.

            `font-light` (300) a 46 px es la decisión tipográfica de fondo:
            Poppins es geométrica y a tamaño de display el 400 se pone gordo y
            comercial. En móvil vuelve a 400, porque a 16 px el 300 se rompe.
          */}
          <p className="text-pretty text-base/[1.55] text-white/[0.78] lg:max-w-[30rem] lg:text-[2.375rem]/[1.06] lg:font-light lg:tracking-[-0.03em] lg:text-white xl:max-w-[36rem] xl:text-[2.875rem]/[1.04]">
            Aquí siempre sabes{" "}
            <span className={RESALTE_TITULAR}>qué días te tocan</span>
          </p>

          {/* El apoyo, solo desde `lg`. Sube de 15 px / white-60 (7,34:1) a
              17 px / white-78 (12,09:1) con interlineado 1,7. Tres renglones de
              texto secundario a 15 px sobre negro son cómodos a los 30 y
              cansados a los 55; el interlineado largo importa aquí más que el
              cuerpo, porque lo que falla con la edad es volver al principio del
              renglón siguiente. */}
          <p className="mt-5 hidden max-w-[34ch] text-pretty text-[1.0625rem]/[1.7] text-white/[0.78] lg:block">
            Pide con dos semanas de aviso, sigue tu saldo y disfruta tu
            descanso. Sin llamar para preguntar, sin quedarte con la duda.
          </p>
        </div>

        <div aria-hidden="true" className="hidden lg:block lg:flex-1" />

        {/*
          LA TERCERA PARADA. Sin ella el titular vuelve a leerse como el final de
          la pantalla y da igual a qué altura esté. Dice algo verdadero y útil
          —lo que garantiza la RLS— en vez de un testimonio inventado, y no
          repite nada de la columna del formulario: la nota de invitación tiene
          que quedarse allí, porque este bloque desaparece por debajo de 600 px
          de alto y esa información es la única salida para quien llega sin
          cuenta.

          La regla cian es de 2 px y 40 de ancho: suficiente para leerse como
          remate deliberado, insuficiente para competir con el titular.
        */}
        <p className="hidden max-w-[36ch] text-[0.9375rem]/[1.6] text-white/70 lg:block">
          <span
            aria-hidden="true"
            className="mb-3.5 block h-0.5 w-10 bg-primary/85"
          />
          Acceso privado del Sistema de Vacaciones de Consultoría E3. Cada
          persona ve únicamente lo suyo.
        </p>
      </aside>
    </div>
  );
}

/**
 * Resalte cian del titular.
 *
 * EL CIAN DE TEXTO NO ES EL CIAN DE RELLENO. `--primary` (#009ac5) sobre negro
 * da 6,09:1 y CUMPLE, pero el blanco del titular está en 20,14:1: el trozo
 * «resaltado» quedaba tres veces más apagado que el resto de la frase y el
 * énfasis trabajaba al revés. `oklch(0.80 0.13 226)` sube a **11,08:1 sobre el
 * fondo** y a **10,22:1 en el peor punto del halo bajo**, y deja las dos mitades
 * del titular en el mismo rango de brillo.
 *
 * QUÉ SE RESALTA Y POR QUÉ: el cian cae sobre «en qué va lo tuyo», que es el
 * beneficio entero. Nadie entra aquí buscando una herramienta, entra buscando
 * dejar de no saber. Pintar «siempre» habría sido resaltar un adverbio.
 *
 * DOS EJES EN DIRECCIONES OPUESTAS: la línea blanca en 300 y la cian en 400,
 * más brillante pero más ligera. Y medio escalón menos de tracking, porque el
 * color saturado sangra ópticamente hacia sus contraformas.
 *
 * `lg:block` — el resalte ocupa su propia línea en escritorio, así que el corte
 * entre las dos mitades es estructural y no solo cromático. `whitespace-nowrap`
 * se queda para móvil: un fragmento de color que empieza al final de un renglón
 * y termina al principio del siguiente se lee como un error de maquetación.
 */
const RESALTE_TITULAR =
  "text-[oklch(0.80_0.13_226)] whitespace-nowrap lg:block lg:font-normal lg:tracking-[-0.015em]";
