"use client";

import { useEffect, useState } from "react";
import { RedAnimada } from "@/components/marca/red-animada";

/**
 * La red de las pantallas de acceso, con el desvanecido hecho DENTRO del
 * lienzo en vez de con una máscara CSS.
 *
 * POR QUÉ EXISTE ESTE ENVOLTORIO, que a primera vista sobra. El desvanecido se
 * hacía con `mask-image` (`red-fundida-movil` / `red-fundida-escritorio` en
 * globals.css), que era elegante y se elegía con una variante `lg:`. Medido:
 * en un monitor de 2560×1400 con dpr 2, la máscara costaba **22 fps con ella
 * frente a 58 sin ella** — y quitando el lienzo entero pero dejando la máscara,
 * 60. O sea que el fondo no era caro: lo caro era enmascararlo, porque el
 * navegador tiene que componer una capa del tamaño del viewport en cada
 * fotograma.
 *
 * El lienzo sabe hacer el mismo desvanecido por su cuenta con una raíz cuadrada
 * por nodo, que es coste cero comparado con eso. Pero el foco son PROPS, no
 * clases, así que no se pueden elegir con un punto de corte de Tailwind: hace
 * falta preguntar por el ancho en JavaScript. De ahí este componente.
 *
 * `matchMedia` y no `window.innerWidth` con un `resize`: el navegador ya sabe
 * responder a esa pregunta y avisa solo cuando la respuesta CAMBIA, así que no
 * hay que filtrar cientos de eventos por segundo al redimensionar.
 *
 * El estado inicial es `false` —móvil— a propósito. En el servidor no hay
 * ventana que consultar, y si el primer render fuera «escritorio», un teléfono
 * pintaría un fotograma con el foco a la derecha antes de corregirse. Al revés
 * el error es invisible: un escritorio pinta un fotograma con el foco arriba y
 * se coloca en el efecto, antes de que la red haya tenido tiempo de dibujar
 * nada reconocible.
 */
export function RedDeAcceso() {
  const [esEscritorio, setEsEscritorio] = useState(false);

  useEffect(() => {
    // Mismo umbral que `lg` en Tailwind. Está escrito aquí y no importado
    // porque es la única forma de preguntarlo desde JavaScript; si algún día
    // cambia el punto de corte del layout, esta línea va con él.
    const consulta = window.matchMedia("(min-width: 64rem)");
    const aplicar = () => setEsEscritorio(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return (
    <RedAnimada
      // `pointer-events-none` en el LIENZO, nunca en su contenedor: el brillo
      // que sigue al cursor lo escucha el componente sobre `parentElement`.
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      // ESCRITORIO. El foco ya no es un interruptor que apaga la red por
      // debajo del 42 %: ahora es el CORAZÓN de una red que existe en todo el
      // bloque. La elipse se ha ensanchado y bajado un poco (0,26 / 0,12, con
      // radios 0,44 × 0,34) para que su meseta cubra casi todo el ancho de la
      // columna de marca en el tercio superior, en vez de un manchón en la
      // esquina; fuera de ella `focoPiso` mantiene la trama viva.
      //
      // MÓVIL: anclado arriba, detrás del logotipo, con la elipse más ancha que
      // el lienzo (1.65) para que no se note el borde lateral. `focoAlto` baja
      // de 0,42 a 0,30: medido, la hoja del formulario arranca al 16,9 % del
      // alto en 768×1024, al 20,2 % en 390×844 y al 24,4 % en 320×800, así que
      // de 0,42 la mitad de abajo se estaba sembrando y enlazando debajo de una
      // plancha opaca.
      focoX={esEscritorio ? 0.26 : 0.5}
      focoY={esEscritorio ? 0.12 : 0}
      focoAncho={esEscritorio ? 0.44 : 1.65}
      focoAlto={esEscritorio ? 0.34 : 0.3}
      // EL FOCO COMO MODULADOR, NO COMO INTERRUPTOR. Es lo que pone red en todo
      // el bloque sin renunciar a que haya un sitio donde la pieza esté viva:
      // fuera de la elipse la red sigue ahí al 75 %, con la misma cantidad de
      // tejido y algo menos de luz. Solo en escritorio; en móvil lo que queda
      // fuera de la elipse está DEBAJO de la hoja del formulario y dibujarlo
      // sería pagar por nada.
      //
      // 0,75 y no 0,42, que fue el primer intento: con un suelo bajo la mitad
      // inferior del bloque quedaba con red pero sin tejido —los enlaces se
      // caían por debajo del corte de alfa y solo sobrevivían los cruces
      // brillantes, que es lo que se lee como suciedad y no como trama—. El
      // suelo alto no compromete el texto porque encima del texto no manda él,
      // manda `bandaTecho`; lo que hace es repartir NODOS, y eso es justo lo que
      // le faltaba a la banda.
      focoPiso={esEscritorio ? 0.75 : 0}
      // Fracción del ancho que se ve. La columna del formulario es opaca y
      // ocupa desde el 53 % (a 1024) o el 55 % (de 1280 en adelante) hasta el
      // borde derecho: sin esto, subir la densidad habría sembrado media red
      // detrás de una plancha. En móvil no aplica —allí lo que tapa está
      // debajo, y de eso se encarga `focoAlto`—.
      zonaAncho={esEscritorio ? 0.56 : 1}
      // ---------------------------------------------------------------------
      // LA BANDA PROTEGIDA: donde vive el texto de marca.
      // ---------------------------------------------------------------------
      // Antes el contraste del titular era fijo porque debajo del 42 % NO SE
      // DIBUJABA NADA. Ahora sí se dibuja, así que la garantía tiene que venir
      // de otro sitio: de un TECHO de intensidad que no depende del foco, ni de
      // la densidad, ni del fotograma.
      //
      // DE DÓNDE SALEN ESTOS TRES NÚMEROS. Los dos primeros, de medir dónde cae
      // el texto en los siete tamaños que se comprueban:
      //
      //   escritorio · el titular arranca al 42,3 % del alto a 1280×800, al
      //   42,5 % a 1024×768 y al 44,3 % a 1440×900; el pie termina al 95,4 %.
      //   La banda va de 0,40 al borde inferior, con la rampa de entrada
      //   acabada 2,3 puntos por encima del caso más alto.
      //
      //   móvil · el descriptor ocupa del 11,7 % al 14,1 % a 768×1024, del
      //   14,0 % al 16,9 % a 390×844 y del 14,7 % al 20,9 % a 320×800. La banda
      //   va de 0,105 a 0,24, y por debajo empieza la hoja opaca (16,9 %,
      //   20,2 % y 24,4 % respectivamente).
      //
      // El tercero, `bandaTecho`, se subió hasta donde aguantó la medición y
      // ahí se paró. **0,18**: el peor caso de los siete tamaños es 7,29:1
      // (1440×900) y el mejor 9,58:1. Por encima empieza a fallar según la
      // tirada —0,21 midió 6,98:1 en un monitor grande y 0,26 se cayó a 6,72:1
      // en un portátil—, y el peor píxel es un valor extremo, así que el número
      // no se elige resolviendo la ecuación en el borde: se elige donde el PEOR
      // resultado de varias tandas sigue arriba.
      //
      // Estuvo en 0,115 y subió a 0,18 —un 57 % más de red visible detrás del
      // texto— por dos cosas a la vez, y conviene no confundirlas: el layout
      // rebajó los halos CSS (el telón de la banda pasó de L=0,0104 a L=0,0053
      // a 1440×900, y de 0,0200 a 0,0057 a 2560×1400) y el lienzo tapó dos
      // fugas que hacían que el techo no significara lo que decía —el techo se
      // consultaba en el CENTRO del nodo cuando la onda de un maestro llega
      // 56 px más allá, y el instrumental del maestro se apilaba consigo mismo—.
      // La tabla completa, el método y los números del blanco están en la
      // cabecera de `red-animada.tsx`, en EL CONTRATO DE CONTRASTE.
      //
      // EN MÓVIL ESTO NO ES UNA PRECAUCIÓN, ES UN ARREGLO. Antes de la banda el
      // descriptor de 16 px caía sobre la red a plena luz y medía 5,97:1 en
      // blanco y 3,28:1 en cian — por debajo del 4,5:1 que pide la norma para
      // texto normal, y fallando solo cuando a un nodo le tocaba pasar por
      // debajo de una letra, que es la forma de fallar que nadie reproduce.
      bandaDesde={esEscritorio ? 0.4 : 0.105}
      bandaHasta={esEscritorio ? 1 : 0.24}
      bandaTecho={0.18}
      // En móvil la red convive con el formulario en menos sitio, así que va un
      // punto por debajo. Se hace con `intensidad` y no con `opacity-70` en la
      // clase: el resultado es el mismo y se ahorra una capa compuesta.
      intensidad={esEscritorio ? 1 : 0.9}
    />
  );
}
