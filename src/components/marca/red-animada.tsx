"use client";

import { useEffect, useRef } from "react";

/**
 * Red de mando: nodos repartidos en planos de profundidad que se enlazan al
 * acercarse, con señales que viajan por los enlaces y unos pocos nodos maestros
 * con instrumental propio. Es el fondo de marca de las pantallas de acceso,
 * tanto en la columna de escritorio como a sangre detrás de la hoja del
 * formulario en móvil.
 *
 * NO HAY BARRIDO. Hubo una banda que recorría el lienzo cada ~20 s, tipo
 * escáner. Se quitó por petición expresa: en un fondo que por lo demás no tiene
 * ritmo, un acontecimiento periódico obliga al ojo a mirar cada vez que pasa, y
 * lo que se pide de este fondo es justo lo contrario. Quitarlo se llevó por
 * delante el único degradado del archivo, el único `fillRect` de área grande por
 * fotograma y dos sumandos de brillo que hacían impredecible el peor píxel — o
 * sea que también era el enemigo del contraste (ver EL CONTRATO DE CONTRASTE).
 *
 * DE DÓNDE SALE EL COLOR. No está escrito aquí: el `<canvas>` lleva la clase
 * `text-primary`, y el color real se lee con `getComputedStyle`. Escribir
 * `#029bca` en este archivo habría creado una segunda copia del color de marca
 * que se queda atrás el día que cambie `--primary` en `globals.css`, sin que
 * nada se ponga rojo. Se lee una vez por montaje y se cachea.
 *
 * LA TRANSPARENCIA SE HACE CON `globalAlpha`, NO COMPONIENDO UN `rgba(…)`.
 * Es lo que permite que lo anterior sea verdad y no un buen propósito.
 * `--primary` está declarado en `oklch()`, y cada navegador devuelve ese valor
 * computado en la notación que le apetece: WebKit lo entrega como
 * `lab(58.6283 -23.771099 -32.445301)` (comprobado, no de oídas). La primera
 * versión de esto extraía los componentes con una expresión regular de
 * `rgb(…)`, así que en Safari fallaba el análisis y caía SIEMPRE al color de
 * respaldo — el token quedaba de adorno y nadie se enteraba, porque el respaldo
 * es del mismo color. Con `globalAlpha` basta con que el canvas sepa dibujar la
 * cadena, sea cual sea su notación, y no hay que interpretarla.
 *
 * La regla se hereda entera en lo nuevo, y desde que no hay barrido este archivo
 * **no construye ni un solo degradado**: no queda ningún sitio donde se pudiera
 * colar un `addColorStop`. El único efecto que parecía necesitar un segundo
 * color —el halo de los nodos— no lo necesita: se pre-renderiza en un lienzo
 * aparte apilando círculos concéntricos con `globalAlpha` y composición
 * `lighter`. Un degradado radial habría sido más corto, pero `addColorStop`
 * exige el color CON su alfa dentro de la cadena, y eso es componer un
 * `rgba(…)`.
 *
 * El respaldo se queda para el único caso que importa: que el contexto no
 * acepte la cadena. Se PRUEBA asignándola y comprobando que el contexto la
 * conservó, para que el fondo no se quede invisible por un color que el
 * navegador no supo leer.
 *
 * ---------------------------------------------------------------------------
 * SE ADAPTA AL LIENZO, PORQUE YA NO ES SOLO UN PANEL DE ESCRITORIO
 * ---------------------------------------------------------------------------
 *
 * Durante un tiempo este componente pudo dar por sentado que si no se veía no
 * costaba: el panel era `hidden lg:flex` y en un teléfono el lienzo medía 0×0.
 * Eso dejó de ser cierto en cuanto la red pasó a verse también en móvil, que es
 * justo el aparato con menos CPU y con batería. Ahora nada se decide "para
 * escritorio": todo sale del tamaño real del lienzo.
 *
 *  - **El número de nodos va por ÁREA**, con techo y suelo. Un recuento fijo
 *    deja vacío un monitor y ahoga un teléfono.
 *  - **LA SIEMBRA SIGUE AL FOCO.** Es la regla que más cambia el resultado: los
 *    nodos no se reparten por el lienzo, se reparten por dónde se van a VER
 *    (ver `pesoSiembra`). Sin ella, la composición de escritorio actual —foco
 *    corto arriba a la izquierda, que cubre ~0,22 del lienzo— dejaba 29 nodos
 *    de 130 donde se miran, y el fondo se leía como negro con cuatro puntos.
 *  - **Un fondo VERTICAL Y ESTRECHO siembra casi el doble de denso**, porque
 *    ahí la superficie opaca del formulario tapa la mayor parte del lienzo
 *    (ver AREA_POR_NODO_VERTICAL).
 *  - **EL FOCO ES UN MODULADOR, NO UN INTERRUPTOR** (ver `focoPiso`). Fuera de
 *    la elipse la red no se apaga: baja a una fracción y sigue teniendo trama.
 *    Antes de esto, el 58 % inferior de la columna de marca era negro liso —
 *    medido: peor píxel del lienzo L=0,0027 en la banda del titular—, y la
 *    pieza se leía como «un manchón arriba a la izquierda».
 *  - **LO QUE NO SE VE NO SE SIEMBRA** (ver `zonaAncho`). Es lo que paga lo
 *    anterior: en escritorio, la columna del formulario es una plancha opaca
 *    sobre el 45 % derecho del lienzo. Con el foco corto daba igual porque allí
 *    no se dibujaba nada; con suelo, ese 45 % se habría sembrado, enlazado y
 *    pintado para nadie.
 *  - **La distancia de enlace se DESPEJA del área efectiva y de los nodos que
 *    de verdad se sembraron**, no es una constante. Es lo que mantiene la trama
 *    igual de tejida cuando el techo de nodos entra en juego o cuando la
 *    siembra se concentra (ver VECINOS_OBJETIVO).
 *  - **Las distancias van por `escala`** (atada al lado corto del lienzo) y los
 *    TAMAÑOS por una versión suavizada de ella: encoger un radio de 0,55 px
 *    otro 30 % lo mete por debajo del píxel, y un teléfono se mira más de
 *    cerca, no más lejos.
 *  - **Los nodos maestros se eligen también por dónde caen**, para que el
 *    carácter de la pieza no acabe detrás de la tarjeta.
 *  - **La resolución del búfer tiene presupuesto** (ver PRESUPUESTO_PX): en un
 *    lienzo enorme lo que hunde el fotograma es el área a rellenar, no la red.
 *  - **En un aparato SOLO táctil el dibujo se limita a 30 fps.**
 *
 * ---------------------------------------------------------------------------
 * EL CONTRATO DE CONTRASTE
 * ---------------------------------------------------------------------------
 *
 * La columna de marca lleva texto ENCIMA del lienzo: el titular, su apoyo y el
 * pie. Ese texto tiene que tener un contraste que sea un NÚMERO, no una lotería
 * por fotograma; un fondo que falla segundo y medio y se arregla solo es la
 * peor forma de fallar, porque nadie la reproduce.
 *
 * Antes el número salía gratis porque debajo del 42 % del alto no se dibujaba
 * nada. Al extender la red a todo el bloque hay que ganárselo, y se gana con
 * TRES reglas que se sostienen entre sí:
 *
 *  1. **Un techo por franja** (`bandaDesde`/`bandaHasta`/`bandaTecho`), aplicado
 *     con `min`: en la banda del texto ninguna atenuación pasa del techo, venga
 *     de donde venga el foco.
 *  2. **Ninguna primitiva se dibuja con más alfa que la atenuación de su
 *     sitio.** Suena obvio y no lo era: el realce del puntero se sumaba DESPUÉS
 *     de atenuar y se recortaba a 0,8 absoluto, así que podía saltarse el techo.
 *  3. **Los enlaces no llegan al centro del nodo.** El techo acota el alfa de
 *     cada trazo, pero `source-over` de n trazos acumula 1 − (1 − a)ⁿ, y con
 *     `lineCap: round` los ~5 enlaces de un nodo terminaban en el mismo píxel,
 *     encima del núcleo. Ese cubo era el peor píxel y crecía con la densidad.
 *  4. **El techo se consulta por el ALCANCE de la figura, no por su centro**
 *     (ver `techoTramo`). Un nodo no pinta un punto: la onda de un maestro
 *     llega a ~56 px. Uno situado justo por encima de la banda cobraba
 *     atenuación de periferia y metía su anillo dentro del texto sin pasar por
 *     el techo. Se veía en los datos antes de entenderse: el peor alfa se
 *     quedaba clavado en ~0,26 tanto con techo 0,175 como con 0,19.
 *
 * Y tres afinados que salen de la misma idea —**cuanto más concentrada es la
 * luz de un elemento, más deprisa se apaga fuera del corazón del foco**—: el
 * núcleo se apaga con `foco·(0,6+0,4·foco)`; el instrumental del maestro, que
 * son cuatro trazos concéntricos que se cruzan entre sí, con `foco²`; y el
 * halo, que además SUMA en vez de tapar, con `foco³`.
 *
 * ESAS CUATRO REGLAS SON LO QUE VALE EL TECHO. No son higiene: cada una se
 * pagó en brillo antes de existir. A igualdad de todo lo demás y midiendo con
 * las mismas siembras, el peor alfa de la banda a 1440×900 con techo 0,20 era
 * **0,357** con el instrumental sin atenuar y **0,176** con él atenuado; y con
 * techo 0,175, **0,263** consultando el techo por el centro y **0,220**
 * consultándolo por el alcance. Cada agujero tapado se convirtió directamente
 * en techo que se pudo subir: de 0,115 a **0,18**, un 57 % más de red visible
 * detrás del texto con el mismo listón de contraste.
 *
 * MEDIDO, no razonado. Playwright sobre el lienzo real: `getImageData` de la
 * banda del texto, 40 fotogramas × 4–6 cargas (la siembra es aleatoria y un solo
 * arranque no es un número). Cada píxel de la red se compone sobre el píxel que
 * le toca del telón estático —fondo #070707 más los halos CSS del layout,
 * capturado aparte con el lienzo oculto— y eso da la columna REAL. La columna
 * COTA lo compone sobre el punto MÁS BRILLANTE de ese telón: el caso en que al
 * peor nodo le toque pasar justo por encima del núcleo del halo, que en 240
 * fotogramas no salió pero que con el tiempo sale.
 *
 * CADA COLOR SE MIDE DONDE ESE COLOR EXISTE. El blanco, sobre la unión de los
 * tres párrafos de marca; el cian —`oklch(0.80 0.13 226)`, el del resalte—
 * SOLO sobre el titular, que es el único que lo lleva. Medirlo sobre la unión
 * daba 6,04:1 a 2560×1400, y ese número era falso: salía del rincón inferior
 * izquierdo, donde está el núcleo del halo CSS y donde el texto es blanco. La
 * conversión del `oklch()` a sRGB la hace el propio navegador durante la
 * medición, no una tabla escrita a mano.
 *
 * Con `bandaTecho` a 0,18, quedándose con el PEOR resultado de todas las tandas
 * corridas (6–8 siembras cada una):
 *
 *  | Lienzo    | Blanco (todo el texto) | Cian (solo el titular) |
 *  |-----------|------------------------|------------------------|
 *  |           |  real  /  cota         |  real  /  cota         |
 *  | 2560×1400 | 14,64  / 14,22         | 7,62   / **7,55**      |
 *  | 1440×900  | 13,98  / 12,95         | 7,58   / **7,29**      |
 *  | 1280×800  | 13,40  / 12,47         | 7,45   / **7,37**      |
 *  | 1024×768  | 16,94  / 16,34         | 9,74   / **9,58**      |
 *  | 768×1024  | 14,12  / 13,71         | 9,17   / **9,09**      |
 *  | 390×844   | 16,55  / 16,53         | 9,17   / **9,16**      |
 *  | 320×800   | 16,51  / 16,35         | 7,94   / **7,86**      |
 *
 * El cian es el que manda: con el blanco en 12,5–16,5:1 el cian va en 7,3–9,6:1,
 * así que el listón de 7:1 lo decide él, y el peor de todo el barrido es
 * **7,29:1**.
 *
 * DÓNDE PARAR AL SUBIR EL TECHO, que es la pregunta difícil. El peor píxel es un
 * VALOR EXTREMO, no una media: depende de que a dos figuras les toque cruzarse
 * en el mismo píxel, y eso sale o no sale según la siembra. Medido a 1440×900,
 * la razón entre el peor alfa y el techo declarado va de 0,88 a **1,42** entre
 * tandas con el mismo techo. Por eso el número no se elige resolviendo una
 * ecuación en el borde: 0,225 medía 7,45:1 y 0,21 llegó a medir 6,98:1 en un
 * monitor grande, los dos «por encima o cerca de 7» según la tirada. 0,18 es el
 * último valor cuyo PEOR resultado en siete tamaños y varias tandas se quedó
 * cómodamente arriba, y ahí se paró.
 *
 * EL TELÓN CSS NO ES NEUTRO, Y ANTES CRECÍA CON LA PANTALLA. El telón SOLO
 * —fondo más halos, sin lienzo— vale hoy L≈0,0034–0,0061 en toda la gama, o sea
 * prácticamente constante. No siempre fue así: con los halos anteriores medía
 * L=0,0104 a 1440×900 y **L=0,0200 a 2560×1400**, porque su diámetro iba en
 * porcentaje del viewport y su radio de desenfoque en píxeles fijos, así que
 * cuanto mayor la pantalla más opaco el núcleo — en un monitor grande el halo se
 * comía dos tercios del presupuesto de luminancia de la banda antes de que la
 * red pintara nada. Se arregló en el layout de `(auth)` bajando la opacidad a
 * la mitad, retirando el halo inferior y atando el desenfoque al tamaño
 * (`2xl:blur-[180px]`). **De ahí sale la mitad de la subida de techo**: no toda
 * es mérito de este archivo.
 *
 * EN MÓVIL ESTO NO ERA UNA PRECAUCIÓN, ERA UN DEFECTO VIVO. Con la red anterior
 * el descriptor de 16 px caía sobre la red a plena luz y medía **5,97:1 en
 * blanco y 3,28:1 en cian** — por debajo del 4,5:1 que pide la norma para texto
 * normal. Nadie lo había visto porque solo falla cuando a un nodo le toca pasar
 * por debajo de una letra.
 *
 * Y EL BARRIDO TAMBIÉN MENTÍA. Se decía que el titular caía «sobre negro
 * exacto» porque el foco valía 0 por debajo del 42 %; pero la banda del barrido
 * era un rectángulo de alto COMPLETO y su alfa solo miraba el foco a la altura
 * del centro de la elipse, así que cada pasada lavaba de cian toda la columna,
 * texto incluido, hasta alfa 0,07 (medido: peor píxel L=0,0027 en una zona que
 * se suponía vacía). Quitarlo no fue solo estético.
 *
 * ---------------------------------------------------------------------------
 * COSTE POR FOTOGRAMA
 * ---------------------------------------------------------------------------
 *
 * Contando las llamadas reales al contexto 2D entre dos `clearRect`
 * (instrumentado en el navegador, no estimado). Con el foco convertido en
 * modulador ya casi no hay nodos apagados, así que sembrados y dibujados
 * prácticamente coinciden y la columna «dibujados» ES el coste.
 *
 *  | Lienzo (a sangre)   | Núcleos | Trazos | Halos | fps          |
 *  |---------------------|---------|--------|-------|--------------|
 *  | 2560×1400 (monitor) | 507     | 685    | 64    | 60 / 60 ¹ ²  |
 *  | 1440×900 (portátil) | 414     | 495    | 67    | 60 / 60 ¹    |
 *  | 1280×800 (portátil) | 328     | 443    | 30    | 60           |
 *  | 1024×768 (portátil) | 255     | 308    | 30    | 60 / 60 ¹    |
 *  | 768×1024 (tableta)  | 148     | 242    | 15    | 30 (tope)    |
 *  | 390×844 (teléfono)  |  62     |  88    |  6    | 30 (tope)    |
 *  | 320×800 (teléfono)  |  50     |  87    |  3    | 30 (tope)    |
 *
 * ¹ sin freno / con la CPU frenada a un cuarto para imitar un portátil modesto.
 *   La tableta y los dos teléfonos mantienen sus 30 fps también frenados. La
 *   columna «Bandas» ha desaparecido con el barrido: ya no hay ningún relleno
 *   de área grande por fotograma.
 * ² el monitor grande aguanta igual que el portátil aunque dibuje un 25 % más de
 *   figuras, y no es casualidad: los dos llegan al tope de PRESUPUESTO_PX y
 *   rellenan 4,0 Mpx, uno a ratio 1,06 y el otro a 1,76. Lo que manda sigue
 *   siendo el área, no la red.
 *
 * LO QUE COSTÓ Y LO QUE VALIÓ, en escritorio a 1440×900. Antes: 180 sembrados,
 * 110 dibujados, 204 trazos, y la mitad inferior del bloque en negro. Ahora:
 * 432 sembrados, ~414 dibujados, 495 trazos — 3,8 veces más nodos pintados y
 * 2,4 veces más enlaces, sin perder un fotograma ni con la CPU a un cuarto. Lo
 * que lo paga es `zonaAncho`: casi la mitad del lienzo dejó de sembrarse, así
 * que la subida de densidad se gasta entera donde se mira. Y los dos cortes por
 * alfa —el del halo y el del instrumental— devuelven gratis lo que la banda no
 * llega a enseñar.
 *
 * **El enlazado NO es O(n²).** Con 130 nodos se comparan ~900 parejas por
 * fotograma; todos contra todos serían 8 385, y ese recuento crece al
 * CUADRADO. El coste real es O(n·k), con k el número medio de nodos en la
 * media vecindad de una celda; k no depende del tamaño del lienzo ni de lo
 * concentrada que esté la siembra, porque la distancia de enlace se despeja
 * justo para que no dependa. En la práctica el enlazado es LINEAL con el
 * número de nodos y no hay ningún tamaño de pantalla en el que se dispare.
 *
 * NO SE CREA NI UN OBJETO DENTRO DEL BUCLE. Los nodos, los pulsos y los dos
 * arrays de la rejilla se reservan al sembrar y a partir de ahí solo se mutan;
 * el sprite del halo se construye una vez por montaje. La basura acumulada por
 * fotograma no se ve en un perfil de CPU pero
 * sí en pantalla: el recolector produce tirones a intervalos, que es justo el
 * defecto más visible en una animación de fondo continua.
 *
 * Lo que NO hace, y es a propósito:
 *
 *  - **No anima si el sistema pide menos movimiento** (`prefers-reduced-motion`).
 *    Pinta un fotograma quieto y para. Un fondo decorativo no es motivo para
 *    ignorar esa preferencia. El fotograma quieto sale compuesto porque el
 *    parpadeo, el giro y la onda de cada nodo arrancan de un desfase propio:
 *    con el reloj a cero la red ya se ve viva, solo que detenida.
 *  - **No anima si el lienzo mide 0×0.** Un lienzo sin caja no tiene nada que
 *    pintar, y la guarda sigue haciendo falta aunque el panel ya no se esconda:
 *    el `ResizeObserver` dispara antes de que el diseño tenga medidas.
 *  - **No anima con la pestaña en segundo plano** (`visibilitychange`), porque
 *    `requestAnimationFrame` ya se frena solo pero el navegador no siempre lo
 *    garantiza al volver.
 *  - **No reacciona al dedo.** El brillo bajo el puntero solo se activa con
 *    ratón (`any-pointer: fine`): en una pantalla táctil el "cursor" se queda
 *    clavado donde se tocó por última vez y deja un halo fijo y raro.
 *  - **No adivina la capacidad del aparato.** `navigator.hardwareConcurrency` y
 *    `deviceMemory` son pistas que mienten (un teléfono de gama baja declara
 *    ocho núcleos), y una degradación automática que quita nodos a mitad de
 *    animación se ve como un parpadeo raro. Las dos palancas que sí son
 *    fiables son el tamaño del lienzo, que se conoce exacto, y el tope de
 *    refresco en aparatos con batería.
 *  - **No cuenta fotogramas, cuenta tiempo.** Todo lo que se mueve se multiplica
 *    por un delta normalizado a 60 Hz. Con incrementos fijos por fotograma la
 *    misma animación va al DOBLE de velocidad en una pantalla de 120 Hz, que es
 *    hoy cualquier teléfono decente.
 */

/** Respaldo si el navegador no sabe leer el `oklch()` de --primary. */
const COLOR_RESPALDO = "rgb(2, 155, 202)";

const TAU = Math.PI * 2;

/**
 * Vecinos que se busca tener por nodo dentro del radio de enlace. De aquí SALE
 * la distancia de enlace, en vez de ser una constante: se despeja del área y
 * del número de nodos que realmente se han sembrado.
 *
 * Importa justo cuando el techo de nodos entra en juego. El lienzo va a sangre
 * en todos los anchos, así que en un monitor de 2560×1400 el área pediría 512
 * nodos y solo se ponen 130; con una distancia fija de 126 px la red se
 * deshace en polvo inconexo —1,8 vecinos por nodo— y deja de ser una red. Al
 * despejarla, el radio sube solo a ~220 px y la trama se ve igual de tejida en
 * un teléfono, en un portátil y en un monitor grande.
 */
const VECINOS_OBJETIVO = 4.8;

/** Banda en la que se acota la distancia de enlace despejada (px CSS). */
const MIN_DISTANCIA_ENLACE = 52;
const MAX_DISTANCIA_ENLACE = 240;

/**
 * Lado de la rejilla con la que se integra el peso de siembra (32 × 32 = 1 024
 * muestras). Corre una vez por siembra, no por fotograma. No baja de 32 porque
 * el núcleo del foco de móvil mide ~135 px de alto sobre 844 y con una rejilla
 * gruesa se resuelve mal, y el área efectiva salida de ahí es la que fija la
 * distancia de enlace.
 */
const LADO_INTEGRACION = 32;

/**
 * Un nodo por cada tantos px² de lienzo, cuando el lienzo se ve entero.
 *
 * Bajó de 7000 a 3000 al pedir «más red y en todo el bloque». Duplicar la
 * densidad no es gratis y no se hizo a ciegas: lo permite `zonaAncho`, que quitó
 * de la cuenta el 45 % del lienzo que tapa la columna del formulario, y se
 * comprobó con la CPU frenada a un cuarto (1440×900 se queda en 55 fps).
 */
const AREA_POR_NODO = 3000;

/**
 * Lo mismo para un lienzo VERTICAL Y ESTRECHO, o sea un fondo a sangre detrás
 * de contenido apilado. Sube la densidad, y no es un capricho: ahí la mayor
 * parte del lienzo está TAPADA por la superficie opaca del formulario. Medido:
 * la hoja arranca al 16,9 % del alto en 768×1024, al 20,2 % en 390×844 y al
 * 24,4 % en 320×800. Repartir por área un lienzo que se ve entero y otro del que
 * se ve un quinto es tratar igual dos cosas distintas.
 *
 * Va JUNTO con la siembra por foco, no en su lugar: esta constante decide
 * CUÁNTOS nodos hay y `pesoSiembra` decide DÓNDE caen. Sin la primera, el
 * teléfono tendría bien repartidos unos pocos; sin la segunda, tendría muchos
 * mal repartidos.
 */
const AREA_POR_NODO_VERTICAL = 3600;

/**
 * Franja del alto que tapa la superficie del formulario cuando NO hay foco
 * declarado, y peso que se le da al sembrar. Con foco manda el foco y estos dos
 * primeros números no se usan; son el reparto de reserva.
 *
 * `TAPADO_HASTA` vale más de 1 a propósito, y es lo que convierte una parábola
 * simétrica en un tapado de UN SOLO LADO sin tocar la función: con 1,60 el peso
 * vale 1 por encima del 20 % del alto y baja hasta 0,118 en el borde inferior,
 * que es lo que describe una hoja de formulario que llega hasta abajo. Con 1,0
 * el peso volvería a 1 justo en el borde y se sembraría a ciegas por debajo de
 * la hoja.
 *
 * El peso mínimo no es 0 a propósito. Con 0, el campo termina en el borde exacto
 * de la zona viva y se ve el corte: lo que queda deja de parecer el trozo
 * visible de una red grande y pasa a parecer una guirnalda recortada. Con un
 * 10 % sigue habiendo nodos alrededor —invisibles, porque el alfa sí los apaga
 * del todo— cuyos enlaces entran en la zona viva y le dan orilla.
 */
const TAPADO_DESDE = 0.2;
const TAPADO_HASTA = 1.6;
const PESO_TAPADO = 0.1;

/**
 * Suelo y techo del recuento de nodos SEMBRADOS, ya con la prop `densidad`
 * aplicada.
 *
 * El techo ha subido dos veces. De 130 a 180 cuando la siembra pasó a seguir al
 * foco (con siembra uniforme, 130 nodos dejaban 29 donde se miran y el resto se
 * pagaba entero para nada). Y de 180 a 520 cuando el foco pasó de interruptor a
 * MODULADOR.
 *
 * OJO CON ESE SEGUNDO SALTO, porque cambia lo que significa el número. Antes,
 * «sembrados» era mucho más que «dibujados» y el techo era solo la cota de
 * arriba del coste; ahora no se apaga nada del todo, casi todo lo sembrado se
 * pinta, y el techo ES el coste. A 1440×900 se siembran 432 y se dibujan ~395.
 * Lo que lo paga es `zonaAncho`, que quita de la ecuación el 45 % del lienzo que
 * tapa la columna opaca del formulario — ese 45 % se habría sembrado y enlazado
 * para nadie.
 */
const MIN_NODOS = 24;
const MAX_NODOS = 520;

/**
 * Presupuesto de píxeles del búfer, por encima del cual se baja el ratio de
 * pantalla (nunca por debajo de 1, y nunca por encima del tope de 2).
 *
 * El coste de este fondo NO lo manda el número de nodos, lo manda el área que
 * hay que rellenar. Medido en un panel de 1279×1400 con la CPU frenada a un
 * cuarto, cambiando SOLO el ratio y dejando el dibujo idéntico:
 *
 *   ratio 1 → 1,79 Mpx → 47 fps · ratio 1,5 → 4,03 Mpx → 27 fps ·
 *   ratio 2 → 7,16 Mpx → 15 fps
 *
 * Es decir, un caudal casi constante de ~110 Mpx/s: el fotograma se va en
 * pintar píxeles, no en decidir qué pintar. Por eso lo que se recorta aquí es
 * la resolución y no la red — lo que se pierde es nitidez en un campo de luces
 * desenfocadas, que es justo donde no se nota, mientras que quitar nodos se ve.
 *
 * Con 4 Mpx, el panel de referencia (719×900 a ratio 2 = 2,59 Mpx) y el fondo
 * de móvil (390×844 a ratio 2 = 1,32 Mpx) se quedan intactos; solo entra en
 * juego en pantallas grandes de mucha densidad.
 */
const PRESUPUESTO_PX = 4_000_000;

/** Radio de influencia del puntero (px CSS). Solo existe si hay ratón. */
const RADIO_PUNTERO = 200;

/**
 * Diferencia de profundidad por encima de la cual dos nodos ya no se enlazan.
 * Sin este corte los planos se cosen entre sí y la profundidad se pierde: la
 * red vuelve a leerse como una sola capa de puntos.
 */
const SALTO_PLANO = 0.42;

/** Margen (px CSS) en el que la red se apaga contra el borde, antes de escalar. */
const MARGEN_DESVANECIDO = 52;

/**
 * Fracción del ANCHO en la que `zonaAncho` se apaga desde 1 hasta 0. No es un
 * desvanecido estético: la rampa entera cae DEBAJO de la superficie opaca, así
 * que no se ve. Existe para que los nodos que quedan justo al otro lado del
 * borde visible sigan estando ahí y sus enlaces entren en campo — sin eso, la
 * red se destejería contra la costura y se leería como un corte.
 */
const MARGEN_ZONA = 0.08;

/**
 * Fracción del ALTO en la que se entra y se sale del techo de la banda
 * protegida. Con un escalón, el cambio de intensidad se lee como una línea
 * horizontal aunque no se dibuje ninguna (el mismo defecto que documenta
 * `pesoVertical`). Con `smoothstep` sobre esta rampa, lo que se ve es una red
 * que se retira hacia el fondo, que es exactamente lo que se quiere contar.
 */
const RAMPA_BANDA = 0.075;

/**
 * Fracción del radio del foco dentro de la cual no se atenúa nada. Es el
 * equivalente al primer tope opaco de un `radial-gradient` de máscara; sin una
 * meseta, el centro del foco ya empieza a apagarse y la red se ve mustia justo
 * donde tiene que estar más viva.
 */
const NUCLEO_FOCO = 0.38;

/**
 * Media vecindad de la rejilla, en pares (dx, dy): la propia celda y las cuatro
 * que cierran el 3×3 sin repetir pareja. Recorrer las nueve contaría cada
 * enlace dos veces y lo pintaría dos veces, que además se nota (la línea sale
 * más opaca de lo pedido).
 */
const VECINOS = [0, 0, 1, 0, -1, 1, 0, 1, 1, 1];

/**
 * Milisegundos mínimos entre dos fotogramas PINTADOS en un aparato solo táctil.
 *
 * Son 30 fps y no 24 porque 30 divide exacto a 60: en un panel de 60 Hz sale
 * una cadencia regular, mientras que 24 fps cae entre dos vsync (60/24 = 2,5) y
 * produce un tirón cada dos fotogramas que en una animación lenta se ve como un
 * defecto. Para un fondo sin texto ni movimiento rápido, 30 y 60 son
 * indistinguibles a ojo y el trabajo de dibujo se reduce a la mitad.
 *
 * El margen de 5 ms no es adorno: con un umbral de 1000/30 = 33,33 ms exactos,
 * un fotograma que llega a los 33,30 se queda JUSTO por debajo y se descarta,
 * con lo que hay que esperar al siguiente y la cadencia se desploma a 20 fps.
 *
 * Y el criterio es «solo táctil», no «táctil»: un portátil con pantalla táctil
 * declara `any-pointer: coarse` y también `fine`, y no tiene sentido penalizar
 * ahí el panel de escritorio. Es la misma trampa que documenta
 * `docs/RESPONSIVIDAD.md` sobre `pointer` frente a `any-pointer`.
 */
const MS_ENTRE_FOTOGRAMAS_TACTIL = 1000 / 30 - 5;

type Nodo = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radio del núcleo en px CSS. */
  r: number;
  /** Profundidad: 0 = fondo lejano, 1 = primer plano. */
  z: number;
  maestro: boolean;
  /** Desfase propio del parpadeo, del giro y de la onda. */
  fase: number;
  /** Velocidad del parpadeo. */
  ritmo: number;
  /** Brillo del fotograma en curso. Vive en el nodo para no reservar un array
   *  por fotograma ni recalcularlo en cada una de las tres pasadas de dibujo. */
  alfa: number;
  /** Atenuación del sitio (zona × foco, acotada por la banda) del fotograma en
   *  curso. Se guarda aparte de `alfa` porque el halo la vuelve a usar ELEVADA
   *  AL CUADRADO: el resplandor se queda en el corazón del foco y no acompaña a
   *  la red por toda la periferia. Ver EL CONTRATO DE CONTRASTE. */
  foco: number;
  /** Radio (px CSS) de lo MÁS LEJOS que este nodo llega a pintar: su onda si es
   *  maestro, su halo si no. Fijo desde la siembra. Ver `techoTramo`. */
  alcance: number;
};

type Pulso = {
  /** Índices de los nodos de origen y destino. */
  a: number;
  b: number;
  /** Avance por el enlace, de 0 a 1. */
  t: number;
  /** Avance por fotograma de 60 Hz. */
  v: number;
  vivo: boolean;
  x: number;
  y: number;
  alfa: number;
  /** Igual que en `Nodo`: atenuación del sitio, para poder apagar el halo más
   *  deprisa que el punto. */
  foco: number;
};

export function RedAnimada({
  className,
  intensidad = 1,
  densidad = 1,
  focoX = 0.5,
  focoY = 0.5,
  focoAncho = 0,
  focoAlto = 0,
  focoPiso = 0,
  zonaAncho = 1,
  bandaDesde = 0,
  bandaHasta = 0,
  bandaTecho = 1,
}: {
  className?: string;
  /**
   * Multiplica el brillo de TODO lo que se dibuja (0 = apagado, 1 = a plena
   * luz, hasta 1.4 para insistir). Existe porque la legibilidad manda sobre el
   * efecto y quien monta la composición es el único que sabe qué hay delante.
   * El componente no lo decide solo a propósito: no puede saber qué se le pone
   * encima.
   *
   * NO ES LA HERRAMIENTA PARA PROTEGER UN TEXTO. Es un mando global, y bajarlo
   * hasta que el peor píxel deje de estorbar una línea de texto apaga también
   * los tres cuartos del lienzo donde no hay nada que leer. Para eso están
   * `bandaDesde`/`bandaHasta`/`bandaTecho`, que cortan solo donde hace falta y
   * dan un número comprobable. `intensidad` es para decisiones de conjunto.
   */
  intensidad?: number;
  /**
   * Multiplica el número de nodos que sale del área (0.2 – 2). El valor 1 es la
   * densidad de referencia; por debajo la red se vuelve una constelación suelta,
   * que es lo que suele querer una composición móvil de gama alta.
   *
   * Ojo: `intensidad` y `densidad` son decisiones de COMPOSICIÓN y se pasan
   * constantes. Cambiarlas vuelve a sembrar el campo, y eso se ve.
   */
  densidad?: number;
  /**
   * FOCO: apaga la red fuera de una elipse, para que se concentre donde tiene
   * que verse y desaparezca donde hay que leer. Centro en `focoX`/`focoY` y
   * radios en `focoAncho`/`focoAlto`, todos en fracción del lienzo (0…1), igual
   * que los porcentajes de un `radial-gradient`. Con `focoAncho` o `focoAlto`
   * a 0 —lo de serie— no hay foco y la red ocupa todo el lienzo.
   *
   * EXISTE POR UNA MEDICIÓN, no por gusto. Lo mismo se puede conseguir con una
   * `mask-image` de CSS sobre el lienzo, y sale MUCHO más caro: una máscara
   * sobre una capa que se repinta 60 veces por segundo se recompone entera en
   * cada fotograma, y ese coste crece con el área de la ventana. Medido en
   * Chromium sobre esta misma pantalla, con el lienzo a sangre:
   *
   *   1440×900 → 57,6 fps con máscara · 60,4 sin ella (da igual)
   *   2560×1400 → **22,4 fps con máscara · 58,4 sin ella**
   *
   * En la misma ventana de 2560×1400, quitar el lienzo entero y dejar la
   * máscara sube solo a 60,4: o sea que casi todo lo que se pierde es la
   * máscara, no la red. Hacer el desvanecido aquí cuesta una raíz cuadrada por
   * nodo y por enlace —unas 300 al fotograma, nada— y deja la composición
   * idéntica.
   */
  focoX?: number;
  focoY?: number;
  focoAncho?: number;
  focoAlto?: number;
  /**
   * SUELO del foco: con 0 el foco es un INTERRUPTOR (fuera de la elipse no se
   * dibuja nada, que era lo de antes); con un valor mayor pasa a ser un
   * MODULADOR y fuera de la elipse la red sigue existiendo a esa fracción de
   * intensidad.
   *
   * Es la pieza que permite tener red en todo el bloque sin renunciar a un
   * corazón. Con el interruptor, la red era un manchón en una esquina y negro
   * en el resto —medido: en la banda del titular a 1440×900 el peor píxel del
   * lienzo era L=0,0027, o sea nada—. Con el suelo, la periferia tiene trama y
   * la elipse sigue siendo el sitio donde la pieza está viva.
   *
   * NO es un sustituto de `banda*`: el suelo reparte intensidad, la banda pone
   * un techo. Donde hay texto manda la banda.
   */
  focoPiso?: number;
  /**
   * Fracción del ancho que de verdad SE VE, contada desde la izquierda. Con 1
   * —lo de serie— se ve el lienzo entero. Con menos, la red se apaga a partir
   * de ahí (rampa de MARGEN_ZONA) y, sobre todo, DEJA DE SEMBRARSE.
   *
   * Existe por lo mismo que la siembra ponderada, que es la lección más cara de
   * este archivo: en las pantallas de acceso de escritorio, la columna del
   * formulario es una superficie OPACA que ocupa el 45–47 % derecho del lienzo.
   * Mientras el foco era un interruptor corto eso daba igual, porque allí no se
   * dibujaba nada. Al poner suelo al foco, esa mitad pasaría a sembrarse,
   * enlazarse y pintarse entera detrás de una plancha opaca. Con `zonaAncho` el
   * presupuesto se gasta donde se mira: es lo que paga la subida de densidad.
   *
   * En móvil vale 1 y no estorba: allí lo que tapa está DEBAJO, y de eso ya se
   * encarga el foco corto en vertical.
   */
  zonaAncho?: number;
  /**
   * BANDA PROTEGIDA: franja horizontal (fracciones del alto) donde la
   * atenuación no puede pasar de `bandaTecho`, pase lo que pase con el foco.
   *
   * Es un TECHO (`min`), no un factor: por eso el número resultante no depende
   * de dónde caiga la elipse ni de cuántos nodos se hayan sembrado, y por eso
   * se puede razonar sobre él. Ver EL CONTRATO DE CONTRASTE en la cabecera:
   * aquí es donde vive el texto de marca, y su contraste no puede ser una
   * lotería por fotograma.
   *
   * Con `bandaDesde === bandaHasta` no hay banda.
   */
  bandaDesde?: number;
  bandaHasta?: number;
  bandaTecho?: number;
}) {
  const refCanvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const lienzo = refCanvas.current;
    if (!lienzo) return;
    const contexto = lienzo.getContext("2d");
    if (!contexto) return;
    // Alias ya sin `null` en el tipo: evita salpicar de `!` un archivo que
    // llama al contexto un par de centenares de veces.
    const canvas = lienzo;
    const ctx = contexto;

    const intens = Math.min(1.4, Math.max(0, intensidad));
    const dens = Math.min(2, Math.max(0.2, densidad));
    const piso = Math.min(1, Math.max(0, focoPiso));
    const zona = Math.min(1, Math.max(0, zonaAncho));
    // La banda se normaliza aquí y no en el bucle: un `bandaHasta` menor que
    // `bandaDesde` invertiría la rampa y dejaría el techo justo donde NO hay que
    // ponerlo, que es el único fallo de este archivo capaz de romper una norma
    // de accesibilidad sin que se vea nada raro en pantalla.
    const bandaY0 = Math.min(bandaDesde, bandaHasta);
    const bandaY1 = Math.max(bandaDesde, bandaHasta);
    const techo = Math.min(1, Math.max(0, bandaTecho));
    const hayBanda = bandaY1 > bandaY0 && techo < 1;

    // ---------- color ----------
    // `color` computado del propio canvas: viene de `text-primary`.
    const leido = getComputedStyle(canvas).color;
    let color = COLOR_RESPALDO;
    if (leido) {
      // Si el contexto no entiende la notación, deja el valor anterior; ese
      // "no cambió" es justo la señal de que no la aceptó.
      const antes = ctx.strokeStyle;
      ctx.strokeStyle = leido;
      if (ctx.strokeStyle !== antes) color = leido;
      ctx.strokeStyle = antes;
    }

    /** Grosor de trazo vigente, para no reasignar `lineWidth` en cada figura. */
    let grosorActual = 1;

    // Un solo color para todo el dibujo; lo que varía por nodo y por línea es
    // `globalAlpha` (ver el bloque de arriba).
    //
    // Se aplica desde una función y no una sola vez, porque **asignar
    // `canvas.width` reinicia el estado ENTERO del contexto 2D**: color,
    // grosor, alfa, modo de composición, remate de línea y transformación. Como
    // `medir()` lo hace en cada cambio de tamaño, un color puesto solo al
    // montar se perdería en el primer redimensionado y la red pasaría a
    // dibujarse en negro sobre negro, o sea a desaparecer, y solo al cambiar el
    // tamaño de la ventana.
    function aplicarEstilo() {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      grosorActual = 1;
    }

    function grosor(v: number) {
      if (grosorActual !== v) {
        ctx.lineWidth = v;
        grosorActual = v;
      }
    }

    /**
     * Halo pre-renderizado, una vez por montaje.
     *
     * El resplandor "de libro" se haría con `shadowBlur`, que cuesta un
     * desenfoque gaussiano POR FIGURA: con treinta halos por fotograma hunde el
     * ritmo en un portátil modesto, y en un teléfono lo entierra. Aquí el
     * trabajo caro se hace una sola vez y cada halo pasa a ser un `drawImage`,
     * que es una copia escalada.
     *
     * La caída se aproxima apilando círculos concéntricos con `lighter`. Un
     * degradado radial habría necesitado un tope de color con alfa dentro de la
     * cadena, y este archivo no compone cadenas de color (ver la cabecera).
     *
     * EL EXPONENTE SUBIÓ DE 1,6 A 2,8 (alfa acumulada ≈ (1 − t)^3,8 en vez de
     * ≈ (1 − t)^2,6) Y LOS RADIOS DE DIBUJO SE HAN RECORTADO A LA MITAD. Es la
     * mitad del encargo «quitar el desenfoque» que sí vivía aquí dentro: el
     * halo anterior se pintaba a 9× el radio del nodo maestro y a 5,5× el del
     * resto, con una caída tan lenta que a media distancia todavía valía la
     * cuarta parte de su máximo. Sumados con `lighter`, treinta de esos halos no
     * se leían como treinta luces sino como una neblina cian continua por encima
     * de la trama — o sea, tapaban justo lo que había que hacer más notorio.
     * Con la caída rápida el halo vuelve a ser el borde encendido de un punto y
     * las líneas se ven a través de él.
     *
     * Y hay un segundo motivo, menos evidente: el halo es lo que ESTALLA. Se
     * suma en vez de taparse, así que es el único efecto capaz de llevar un
     * píxel al máximo y hacer impredecible el peor caso. Un halo estrecho es
     * también un peor caso más pequeño (ver EL CONTRATO DE CONTRASTE).
     */
    function construirDestello(): HTMLCanvasElement | null {
      const lado = 128;
      const fuera = document.createElement("canvas");
      fuera.width = lado;
      fuera.height = lado;
      const octx = fuera.getContext("2d");
      if (!octx) return null;
      const centro = lado / 2;
      const pasos = 22;
      octx.fillStyle = color;
      octx.globalCompositeOperation = "lighter";
      for (let k = pasos; k >= 1; k--) {
        const t = k / pasos;
        octx.globalAlpha = (2.6 * Math.pow(1 - t, 2.8)) / pasos;
        octx.beginPath();
        octx.arc(centro, centro, centro * t, 0, TAU);
        octx.fill();
      }
      return fuera;
    }

    const destello = construirDestello();

    // ---------- preferencias del sistema ----------
    const menosMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const hayRaton = window.matchMedia("(any-pointer: fine)");
    const soloDedo = window.matchMedia(
      "(any-pointer: coarse) and (not (any-pointer: fine))"
    );

    let nodos: Nodo[] = [];
    let pulsos: Pulso[] = [];
    let pulsosVivos = 0;
    // Rejilla espacial por listas enlazadas sobre enteros: `cabezas[c]` es el
    // primer nodo de la celda c y `siguiente[i]` el que va detrás del nodo i.
    // Se usan `Int32Array` y no arrays de arrays para poder vaciar la rejilla
    // con un `fill(-1)` —que no reserva nada— en vez de crear una lista por
    // celda y por fotograma.
    let cabezas = new Int32Array(0);
    let siguiente = new Int32Array(0);
    let columnas = 1;
    let filas = 1;

    let ancho = 0;
    let alto = 0;
    /** Escala del lienzo: 1 de `lg` para arriba, 0,7 en un móvil. */
    let escala = 1;
    /** La misma, suavizada, para lo que tiene tamaño propio (radios, halos). */
    let escalaTamano = 1;
    /** ¿Fondo a sangre detrás de contenido apilado? Lo fija `sembrar()`. */
    let vertical = false;
    // Los dos los fija `sembrar()` a partir del tamaño real del lienzo.
    let distanciaEnlace = MIN_DISTANCIA_ENLACE;
    let margenBorde = MARGEN_DESVANECIDO;
    // Foco en píxeles, precalculado: dentro del bucle solo quedan dos restas,
    // dos divisiones y una raíz.
    const hayFoco = focoAncho > 0 && focoAlto > 0;
    let focoCx = 0;
    let focoCy = 0;
    let focoRx = 1;
    let focoRy = 1;
    // Zona visible y banda protegida, también en píxeles y también precalculadas.
    let zonaX1 = 0;
    let zonaX2 = 0;
    let bandaPx0 = 0;
    let bandaPx1 = 0;
    let rampaPx = 1;

    let animacion = 0;
    let anterior = 0;
    let msEntreFotogramas = 0;
    let reloj = 0;
    let puntero: { x: number; y: number } | null = null;

    function medir() {
      const caja = canvas.getBoundingClientRect();
      ancho = Math.round(caja.width);
      alto = Math.round(caja.height);
      if (ancho === 0 || alto === 0) return false;

      // Tope de 2 en el ratio: por encima el búfer crece al cuadrado y no se
      // distingue a simple vista, pero sí se nota en un portátil modesto — y en
      // un teléfono, donde el ratio real llega a 3, se nota el triple.
      //
      // Y un segundo tope, más fino, por presupuesto de píxeles (ver
      // PRESUPUESTO_PX). El suelo de 1 es innegociable: por debajo del tamaño
      // CSS el lienzo se ve borroso de verdad, y eso sí se nota.
      const ratio = Math.max(
        1,
        Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(PRESUPUESTO_PX / (ancho * alto))
        )
      );
      canvas.width = Math.round(ancho * ratio);
      canvas.height = Math.round(alto * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      aplicarEstilo(); // el estado se acaba de perder con la línea de arriba
      return true;
    }

    /**
     * Reparto de reserva cuando NO hay foco: cuánto vale sembrar a la altura
     * `v` (0 arriba, 1 abajo). Cae hasta PESO_TAPADO donde la hoja del
     * formulario tapa, con una parábola para que no haya un escalón: un corte
     * recto en la densidad se lee como una línea horizontal aunque no se dibuje
     * ninguna.
     */
    function pesoVertical(v: number) {
      if (!vertical) return 1;
      const centro = (TAPADO_DESDE + TAPADO_HASTA) / 2;
      const semi = (TAPADO_HASTA - TAPADO_DESDE) / 2;
      const d = Math.abs(v - centro) / semi;
      if (d >= 1) return 1;
      return PESO_TAPADO + (1 - PESO_TAPADO) * d * d;
    }

    /**
     * CUÁNTO VALE SEMBRAR EN (x, y). Es la pieza que hace que la red siga a la
     * composición en vez de repartirse a ciegas.
     *
     * Cuando hay foco, el peso ES el foco. El motivo es puramente aritmético:
     * el alfa de todo lo que se dibuja ya se multiplica por la atenuación, así
     * que sembrar donde la atenuación es baja rinde poco por nodo. Cuando el
     * foco era un interruptor esto era una cuestión de vida o muerte —con la
     * elipse corta cubriendo ~0,22 del lienzo, de 130 nodos repartidos por área
     * solo 29 caían donde se ven y el fondo se leía como negro con cuatro
     * puntos—; con el foco convertido en modulador ya no se apaga nada del
     * todo, y lo que hace el peso es REPARTIR: corazón denso, periferia con
     * trama. Quien evita ahora el gasto inútil es `atenuacionZona`, que devuelve
     * 0 —y aquí corta en seco— detrás de la superficie opaca.
     *
     * El suelo de PESO_TAPADO es lo que le da ORILLA a la zona viva: nodos
     * apenas visibles cuyos enlaces sí entran en campo y evitan que la red
     * termine en un corte limpio con forma de elipse, que es justo lo que
     * delataría el truco. Con un suelo de foco declarado casi nunca manda, pero
     * sigue siendo la red de seguridad de las composiciones sin él.
     *
     * LA BANDA PROTEGIDA NO ENTRA AQUÍ, Y ES DELIBERADO. El techo de la banda
     * baja el BRILLO, no la cantidad: si además redujera la siembra, detrás del
     * titular quedaría una red tenue Y ADEMÁS rala, o sea cuatro rayas sueltas
     * que se leen como suciedad. Lo que se quiere ahí es una trama tenue y
     * UNIFORME, con la misma cantidad de tejido que el resto y menos luz. Por
     * eso el peso mira la zona y el foco, y el techo se aplica solo al dibujar.
     */
    function pesoSiembra(x: number, y: number) {
      const z = atenuacionZona(x);
      if (z <= 0) return 0;
      if (hayFoco) {
        const a = atenuacionFoco(x, y);
        return z * (a > PESO_TAPADO ? a : PESO_TAPADO);
      }
      return z * pesoVertical(y / alto);
    }

    /** Sitio del último nodo sembrado. Dos variables sueltas para no devolver
     *  —y tirar— un objeto por nodo. */
    let sembradoX = 0;
    let sembradoY = 0;

    /**
     * Elige sitio para un nodo por muestreo con rechazo de `pesoSiembra`. Solo
     * corre al sembrar, nunca en el bucle. Si tras muchos intentos no ha
     * aceptado ninguno —imposible con el suelo de PESO_TAPADO, pero un bucle
     * sin salida en una pantalla de acceso no es negociable— se queda con el
     * mejor candidato visto, que es mejor salvavidas que un sitio al azar.
     */
    function sitioSembrado() {
      let mejorX = 0;
      let mejorY = 0;
      let mejorPeso = -1;
      for (let intento = 0; intento < 120; intento++) {
        const x = Math.random() * ancho;
        const y = Math.random() * alto;
        const p = pesoSiembra(x, y);
        if (Math.random() <= p) {
          sembradoX = x;
          sembradoY = y;
          return;
        }
        if (p > mejorPeso) {
          mejorPeso = p;
          mejorX = x;
          mejorY = y;
        }
      }
      sembradoX = mejorX;
      sembradoY = mejorY;
    }

    function sembrar() {
      // Escala atada al LADO CORTO. Es el que manda: un lienzo de 390×844 es
      // pequeño aunque sea alto, y lo que hay que encoger es la distancia entre
      // cosas, no repartirla por el alto. El suelo de 0,7 evita que en un
      // lienzo muy estrecho la red se convierta en polvo invisible.
      escala = Math.min(1, Math.max(0.7, Math.min(ancho, alto) / 700));
      // Los TAMAÑOS se encogen menos que las distancias. El plano de fondo ya
      // tiene 0,55 px de radio: encogerlo otro 30 % lo deja por debajo del
      // píxel y el antialias lo convierte en una mancha gris que no se ve.
      // Un teléfono se mira más de cerca, no más lejos.
      escalaTamano = 0.6 + 0.4 * escala;
      margenBorde = MARGEN_DESVANECIDO * escala;

      focoCx = focoX * ancho;
      focoCy = focoY * alto;
      // El suelo de 1 px evita una división por cero si llega un radio absurdo.
      focoRx = Math.max(1, focoAncho * ancho);
      focoRy = Math.max(1, focoAlto * alto);

      // Zona visible y banda protegida, en píxeles. Con `zona` a 1, `zonaX2`
      // queda a 0 y `atenuacionZona` sale por su primera línea sin tocar nada.
      zonaX1 = zona >= 1 ? 0 : zona * ancho;
      zonaX2 = zona >= 1 ? 0 : Math.min(ancho, (zona + MARGEN_ZONA) * ancho);
      bandaPx0 = bandaY0 * alto;
      bandaPx1 = bandaY1 * alto;
      rampaPx = Math.max(1, RAMPA_BANDA * alto);

      // ¿Es este lienzo un fondo a sangre detrás de contenido apilado? Alto y
      // estrecho a la vez. Las DOS condiciones hacen falta: por proporción sola,
      // un iPad en vertical (1024×1366) también sale «alto», y ahí la pantalla
      // de acceso ya está en dos columnas y la tarjeta no tapa el centro.
      vertical = alto >= ancho * 1.2 && ancho < 900;

      // Del peso de siembra salen DOS cosas: dónde caen los nodos y cuánta
      // área cuenta de verdad. Se integra numéricamente y en 2D —el foco es una
      // elipse, no una franja— para que cambiar el foco o los números del
      // tapado no obligue a rehacer ninguna cuenta a mano.
      let sumaPeso = 0;
      let sumaPeso2 = 0;
      for (let iy = 0; iy < LADO_INTEGRACION; iy++) {
        const y = ((iy + 0.5) / LADO_INTEGRACION) * alto;
        for (let ix = 0; ix < LADO_INTEGRACION; ix++) {
          const p = pesoSiembra(((ix + 0.5) / LADO_INTEGRACION) * ancho, y);
          sumaPeso += p;
          sumaPeso2 += p * p;
        }
      }
      // Razón de participación: (media del peso)² / (media del peso²). Es el
      // factor por el que hay que multiplicar el área para obtener el área que
      // los nodos ocupan DE VERDAD. Vale 1 con siembra uniforme, y ~0,3 con el
      // foco corto de escritorio. Sin él, `distanciaEnlace` saldría de un área
      // tres veces mayor que la que los nodos ocupan y la zona viva se
      // apelmazaría en una mancha en vez de leerse como una trama.
      const muestras = LADO_INTEGRACION * LADO_INTEGRACION;
      const factorZona = (sumaPeso * sumaPeso) / (muestras * sumaPeso2);
      const areaEfectiva = ancho * alto * factorZona;

      // Recuento por ÁREA, no un número fijo: el mismo recuento que se ve bien
      // en un lienzo de 700×900 queda vacío en uno de 2560×1400. El techo es lo
      // que acota el coste en un monitor grande (ver la tabla de la cabecera);
      // el suelo evita que un lienzo diminuto se quede en cuatro puntos sin un
      // solo enlace.
      const cuantos = Math.round(
        Math.min(
          MAX_NODOS,
          Math.max(
            MIN_NODOS,
            ((ancho * alto) /
              (vertical ? AREA_POR_NODO_VERTICAL : AREA_POR_NODO)) *
              dens
          )
        )
      );

      // Distancia despejada del ÁREA EFECTIVA y de los nodos que de verdad se
      // han sembrado, para que cada nodo tenga ~VECINOS_OBJETIVO vecinos en
      // cualquier pantalla. Usar el área a secas sobre una siembra concentrada
      // daría un radio demasiado largo y la franja visible del teléfono saldría
      // apelmazada; usar una constante daría lo contrario en un monitor.
      distanciaEnlace = Math.min(
        MAX_DISTANCIA_ENLACE,
        Math.max(
          MIN_DISTANCIA_ENLACE,
          Math.sqrt((VECINOS_OBJETIVO * areaEfectiva) / (Math.PI * cuantos))
        )
      );

      nodos = new Array(cuantos);
      for (let i = 0; i < cuantos; i++) {
        // El exponente empuja el reparto hacia el fondo: muchos nodos lejanos y
        // pocos delante. Con un reparto plano la red se ve como una sopa de
        // puntos del mismo tamaño y la profundidad no llega a leerse.
        const z = Math.random() ** 1.7;
        sitioSembrado();
        const x = sembradoX;
        const y = sembradoY;
        // Los maestros se eligen TAMBIÉN por dónde han caído. Son los que
        // llevan el halo, los arcos y la onda, o sea el carácter de la pieza, y
        // repartidos a ciegas la mayoría acababa fuera de la zona viva: se
        // pagaban enteros y no se veía ninguno. Ponderándolos por el mismo peso
        // que la siembra, prácticamente todos caen donde se ven — más carácter
        // y menos trabajo a la vez.
        // La probabilidad bajó de 0,34 a 0,20 al subir el techo de nodos. El
        // maestro no es un nodo más caro, son CUATRO trazos más: manteniendo
        // 0,34 sobre los 432 nodos que se siembran hoy a 1440×900 saldrían
        // ~70 maestros y 280 trazos solo de instrumental, más que todos los
        // enlaces juntos de la versión anterior. Y además dejarían de ser
        // especiales, que es lo único que justifica que existan.
        const maestro = z > 0.55 && Math.random() < 0.2 * pesoSiembra(x, y);
        // Núcleos un punto más grandes que antes (0,55 + 1,5·z). Es la otra
        // mitad de «menos desenfoque, más red»: lo que se le quita al halo hay
        // que devolvérselo al punto, o los nodos se quedan en polvo.
        const r = (0.62 + z * 1.62) * (maestro ? 1.9 : 1) * escalaTamano;
        nodos[i] = {
          x,
          y,
          // Los cercanos van más rápido: ese desajuste ES el paralaje, y es lo
          // que hace que el fondo tenga varios planos y no uno. Lento en
          // cualquier caso: es un fondo, no un protagonista.
          vx: (Math.random() - 0.5) * (0.08 + z * 0.26) * escala,
          vy: (Math.random() - 0.5) * (0.08 + z * 0.26) * escala,
          r,
          z,
          maestro,
          fase: Math.random() * TAU,
          ritmo: 0.018 + Math.random() * 0.045,
          alfa: 0,
          foco: 0,
          // Lo más lejos que este nodo llega a pintar. Los dos números salen
          // literalmente de las pasadas de dibujo de más abajo —la onda del
          // maestro (`r·2,4 + t·46`) y el halo (`r·4,6` o `r·2,9`)—, y si
          // alguna vez se toca uno hay que tocar el otro: es lo que mantiene
          // honesto el techo de la banda.
          alcance: maestro ? r * 2.4 + 46 * escalaTamano : r * 2.9,
        };
      }

      // Ordenados por profundidad UNA vez, no en cada fotograma: a partir de
      // aquí las pasadas de dibujo recorren el array en orden y pintan de lejos
      // a cerca gratis.
      nodos.sort((a, b) => a.z - b.z);

      // El grupo de pulsos se dimensiona con el campo: 24 señales sobre los ~50
      // enlaces de un lienzo de móvil serían un enjambre, no una red.
      const cuantosPulsos = Math.min(24, Math.max(5, Math.round(cuantos / 4)));
      pulsos = new Array(cuantosPulsos);
      for (let k = 0; k < cuantosPulsos; k++) {
        pulsos[k] = {
          a: 0,
          b: 0,
          t: 0,
          v: 0,
          vivo: false,
          x: 0,
          y: 0,
          alfa: 0,
          foco: 0,
        };
      }
      pulsosVivos = 0;

      // El lado de la celda es EXACTAMENTE la distancia de enlace, y esa
      // igualdad no es casual: con celdas de ese lado, todo vecino posible cae
      // en el 3×3 que rodea a la celda del nodo, que es lo que hace correcta la
      // media vecindad de VECINOS. Si algún día se tocan por separado, la red
      // empieza a perder enlaces sin que nada falle de forma visible.
      columnas = Math.max(1, Math.ceil(ancho / distanciaEnlace));
      filas = Math.max(1, Math.ceil(alto / distanciaEnlace));
      cabezas = new Int32Array(columnas * filas);
      siguiente = new Int32Array(cuantos);

      reloj = 0;
    }

    function influenciaPuntero(x: number, y: number) {
      if (!puntero) return 0;
      const dx = x - puntero.x;
      const dy = y - puntero.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > RADIO_PUNTERO * RADIO_PUNTERO) return 0;
      return 1 - Math.sqrt(d2) / RADIO_PUNTERO;
    }

    /**
     * La red se apaga contra los cuatro bordes. No es un adorno: sin esto el
     * campo termina en un rectángulo recortado —se ve que hay un lienzo— y
     * además el rebote de los nodos en el borde ocurre a plena luz. Con el
     * desvanecido, el rebote pasa donde ya no se ve y el campo parece seguir
     * más allá del lienzo, que es lo que hace que a sangre en un móvil no
     * parezca una caja pegada detrás del formulario.
     */
    function desvanecerBorde(x: number, y: number) {
      const f = Math.min(x, y, ancho - x, alto - y) / margenBorde;
      return f >= 1 ? 1 : f <= 0 ? 0 : f;
    }

    /**
     * Atenuación por foco: 1 dentro del núcleo, `piso` fuera de la elipse y una
     * rampa lineal entre medias. Es el mismo desvanecido que haría una
     * `mask-image`, hecho aquí porque una máscara de CSS sobre un lienzo que se
     * repinta cuesta una recomposición de toda la capa por fotograma (ver la
     * documentación de las props `foco*`).
     *
     * El `piso` es lo que convierte el interruptor en modulador. Con `piso` a 0
     * el comportamiento es exactamente el de antes.
     */
    function atenuacionFoco(x: number, y: number) {
      if (!hayFoco) return 1;
      const dx = (x - focoCx) / focoRx;
      const dy = (y - focoCy) / focoRy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= NUCLEO_FOCO) return 1;
      if (d >= 1) return piso;
      const a = 1 - (d - NUCLEO_FOCO) / (1 - NUCLEO_FOCO);
      return a > piso ? a : piso;
    }

    /**
     * Recorte por la derecha: 1 dentro de la parte del lienzo que se ve, 0 a
     * partir de MARGEN_ZONA más allá. La rampa cae bajo la superficie opaca, o
     * sea que no se ve; está para no destejer la red contra la costura.
     */
    function atenuacionZona(x: number) {
      if (zonaX2 <= 0) return 1;
      if (x <= zonaX1) return 1;
      if (x >= zonaX2) return 0;
      return 1 - (x - zonaX1) / (zonaX2 - zonaX1);
    }

    /**
     * TECHO de la banda protegida: 1 fuera, `techo` dentro y un `smoothstep` en
     * los bordes. Se aplica con `min`, así que es una COTA sobre todo lo que se
     * dibuja en esa franja, independiente del foco, de la densidad y del
     * fotograma. Ahí está la mitad del contrato de contraste; la otra mitad es
     * que ninguna primitiva se dibuja con alfa mayor que su atenuación.
     */
    function techoBanda(y: number) {
      if (!hayBanda) return 1;
      if (y <= bandaPx0 - rampaPx || y >= bandaPx1 + rampaPx) return 1;
      if (y >= bandaPx0 && y <= bandaPx1) return techo;
      const t =
        y < bandaPx0
          ? (y - (bandaPx0 - rampaPx)) / rampaPx
          : (bandaPx1 + rampaPx - y) / rampaPx;
      const s = t * t * (3 - 2 * t);
      return 1 + (techo - 1) * s;
    }

    /**
     * EL TECHO QUE LE TOCA A UNA FIGURA DE RADIO `alcance` CENTRADA EN `y`.
     *
     * Esto tapa un agujero que costó encontrar y que hacía que el techo de la
     * banda no significara lo que decía. `techoBanda` responde por UN PUNTO,
     * pero un nodo no pinta un punto: el halo llega a 4,6 radios y la onda de un
     * maestro a `2,4·r + 46` px, o sea hasta ~56 px. Un maestro situado unos
     * píxeles POR ENCIMA de la banda tiene su centro fuera, cobra atenuación de
     * periferia (0,75) y mete su anillo dentro del titular sin pasar por el
     * techo en ningún momento.
     *
     * Se veía en los datos antes de entenderse: el peor alfa de la banda se
     * quedaba clavado en ~0,26 tanto con techo 0,175 como con 0,19, cuando
     * debería haber escalado con él. No escalaba porque el culpable no estaba
     * gobernado por el techo.
     *
     * El mínimo sobre el tramo es exacto y no hay que muestrearlo: `techoBanda`
     * es un pozo (1 fuera, `techo` dentro, rampas a los lados), así que si el
     * tramo toca el fondo del pozo el mínimo ES `techo`, y si no, está en uno de
     * los dos extremos.
     */
    function techoTramo(y: number, alcance: number) {
      if (!hayBanda) return 1;
      if (alcance <= 0) return techoBanda(y);
      const y0 = y - alcance;
      const y1 = y + alcance;
      if (y1 >= bandaPx0 && y0 <= bandaPx1) return techo;
      const a = techoBanda(y0);
      const b = techoBanda(y1);
      return a < b ? a : b;
    }

    /**
     * La atenuación que consume el dibujo: zona × foco, acotada por la banda.
     * Todo lo que se pinta pasa por aquí, y nada se pinta con más alfa que el
     * valor que devuelve. `alcance` es el radio de lo que se va a pintar; con 0
     * se comporta como una consulta puntual, que es lo que quieren los enlaces.
     */
    function atenuacion(x: number, y: number, alcance = 0) {
      const a = atenuacionZona(x) * atenuacionFoco(x, y);
      if (!hayBanda) return a;
      const t = techoTramo(y, alcance);
      return a < t ? a : t;
    }

    /** `dt` en fotogramas de 60 Hz. Con 0 sale un fotograma quieto. */
    function pintar(dt: number) {
      reloj += dt;
      ctx.clearRect(0, 0, ancho, alto);

      // ---------- nodos: mover y calcular su brillo ----------
      // Una sola pasada para las dos cosas, y siempre (aunque `dt` sea 0): el
      // brillo lo consumen después tres pasadas de dibujo, y recalcularlo en
      // cada una serían tres senos por nodo en vez de dos.
      for (let i = 0; i < nodos.length; i++) {
        const n = nodos[i];
        if (dt > 0) {
          n.x += n.vx * dt;
          n.y += n.vy * dt;
          // Rebote en los bordes en vez de reaparecer por el otro lado: el
          // salto se ve, y en un fondo quieto llama la atención justo lo que
          // no debe.
          if (n.x <= 0 || n.x >= ancho) n.vx *= -1;
          if (n.y <= 0 || n.y >= alto) n.vy *= -1;
          n.x = Math.max(0, Math.min(ancho, n.x));
          n.y = Math.max(0, Math.min(alto, n.y));
        }

        // Dos senos de periodos inconmensurables. Con uno solo cada nodo late
        // como un metrónomo y el conjunto se lee como una animación en bucle;
        // con dos, el ciclo aparente es tan largo que parece que no lo hay.
        const brillo =
          0.74 +
          0.18 * Math.sin(reloj * n.ritmo + n.fase) +
          0.08 * Math.sin(reloj * n.ritmo * 2.7 + n.fase * 3.1);

        let a = (0.26 + 0.74 * n.z) * brillo;
        a += influenciaPuntero(n.x, n.y) * 0.5;
        // La atenuación se guarda además de aplicarse: el halo la vuelve a
        // usar al cuadrado, y calcularla dos veces por nodo y por fotograma
        // sería pagar dos raíces cuadradas para llegar al mismo número.
        //
        // Va con el ALCANCE del nodo, no con su centro: un maestro justo por
        // encima de la banda protegida pinta su onda 56 px más abajo, o sea
        // dentro del texto (ver `techoTramo`).
        n.foco = atenuacion(n.x, n.y, n.alcance);
        n.alfa =
          Math.min(1, a) * desvanecerBorde(n.x, n.y) * n.foco * intens;
      }

      // ---------- rejilla espacial ----------
      cabezas.fill(-1);
      for (let i = 0; i < nodos.length; i++) {
        const n = nodos[i];
        let cx = (n.x / distanciaEnlace) | 0;
        let cy = (n.y / distanciaEnlace) | 0;
        if (cx < 0) cx = 0;
        else if (cx >= columnas) cx = columnas - 1;
        if (cy < 0) cy = 0;
        else if (cy >= filas) cy = filas - 1;
        const c = cy * columnas + cx;
        siguiente[i] = cabezas[c];
        cabezas[c] = i;
      }

      // ---------- enlaces ----------
      const limite = distanciaEnlace * distanciaEnlace;
      for (let cy = 0; cy < filas; cy++) {
        for (let cx = 0; cx < columnas; cx++) {
          const propia = cy * columnas + cx;
          if (cabezas[propia] === -1) continue; // celda vacía: ni se mira
          for (let v = 0; v < VECINOS.length; v += 2) {
            const vx = cx + VECINOS[v];
            const vy = cy + VECINOS[v + 1];
            if (vx < 0 || vx >= columnas || vy >= filas) continue;
            const misma = v === 0;
            const otra = vy * columnas + vx;

            for (let i = cabezas[propia]; i !== -1; i = siguiente[i]) {
              const a = nodos[i];
              for (let j = cabezas[otra]; j !== -1; j = siguiente[j]) {
                // Dentro de la misma celda cada pareja saldría dos veces; la
                // lista va en índice decreciente, así que quedarse con j < i la
                // deja una sola.
                if (misma && j >= i) continue;
                const b = nodos[j];

                // El corte por profundidad va PRIMERO porque descarta casi la
                // mitad de las parejas con dos restas.
                const dz = a.z - b.z;
                if (dz > SALTO_PLANO || dz < -SALTO_PLANO) continue;

                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > limite) continue;

                const d = Math.sqrt(d2);
                const cercania = 1 - d / distanciaEnlace;
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;

                // Cuadrática y no lineal: así el enlace aparece de verdad al
                // final del acercamiento en vez de estar medio encendido todo
                // el rato, y la red respira en lugar de vibrar.
                let alfa =
                  cercania *
                  cercania *
                  0.62 *
                  (0.35 + 0.65 * (a.z > b.z ? a.z : b.z));

                // El brillo del puntero mira al punto MEDIO del enlace: si
                // mirara a un extremo, la línea se encendería con el cursor aún
                // lejos de ella.
                alfa += influenciaPuntero(mx, my) * 0.45;
                // TOPE ANTES DE ATENUAR, y este orden es el contrato. El brillo
                // del puntero puede empujar el alfa por encima de 1, y si el
                // recorte se hiciera después de multiplicar por la atenuación
                // —como se hacía— una línea podría salir con más alfa que la
                // atenuación de su sitio y saltarse el techo de la banda. Con
                // el tope aquí, NINGUNA primitiva de este archivo se dibuja por
                // encima de su atenuación, que es la mitad del contrato de
                // contraste.
                if (alfa > 0.85) alfa = 0.85;
                const ate = atenuacion(mx, my);
                alfa *= desvanecerBorde(mx, my) * ate * intens;
                // EL CORTE BAJÓ DE 0,012 A 0,0035, y no es una micro-optimización
                // al revés: es lo que hace que la banda protegida tenga red.
                // Bajo el techo de la banda un enlace corriente sale a menos
                // de 0,01 de alfa, o sea POR DEBAJO del corte antiguo. Medido:
                // con 0,012 la banda del titular quedaba al 0,79 % de cobertura
                // —lo único que sobrevivía eran los cruces más brillantes, que
                // es justo lo contrario de una trama tenue y uniforme— y con
                // 0,0035 sube a más del triple sin tocar el pico, porque lo que
                // se añade son líneas flojas repartidas, no núcleos.
                if (alfa <= 0.0035) continue;

                // El grosor NO se escala con el lienzo: es nitidez, no medida.
                // Un trazo de 0,8 px multiplicado por 0,7 se queda en un pelo
                // que el antialias convierte en nada.
                //
                // Y TAMPOCO ENGORDA DONDE LA RED VA TENUE, aunque parezca la
                // jugada evidente: bajo un techo de ALFA, más superficie de
                // trazo debería dar más presencia gratis. Se probó (1,15 px en
                // la banda en vez de 0,8) y salió justo al revés — el peor
                // píxel de la banda saltó de **0,173 a 0,302 de alfa** con la
                // misma red y el mismo techo, y se llevó por delante casi punto
                // y medio de contraste.
                //
                // El motivo es que POR DEBAJO DE UN PÍXEL EL ANTIALIAS ES PARTE
                // DEL ALFA. Un trazo de 0,8 px nunca cubre un píxel entero, así
                // que ningún píxel recibe el alfa nominal; al pasar de 1 px el
                // centro de la línea sí lo recibe, y además dos líneas anchas se
                // cruzan mucho más a menudo. O sea que el grosor no es solo
                // nitidez: por debajo del píxel es también un atenuador, y uno
                // que no aparece en ninguna cuenta.
                grosor(a.maestro || b.maestro ? 1.3 : 0.8);
                ctx.globalAlpha = alfa;
                // LOS ENLACES NO LLEGAN AL CENTRO DEL NODO, y esto no es un
                // detalle de estilo: es lo que hace que el techo de la banda
                // signifique algo.
                //
                // El alfa de cada primitiva está acotado por la atenuación del
                // sitio, pero el ALFA DEL PÍXEL no: `source-over` de n trazos
                // del mismo color acumula 1 − (1 − a)ⁿ, y con `lineCap: round`
                // los ~5 enlaces de un nodo terminaban todos EN EL MISMO PÍXEL,
                // encima del núcleo. Ese cubo era el peor píxel de la banda y
                // crecía con la densidad, así que cada vez que se subían nodos
                // el contraste se caía y había que volver a bajar el techo.
                // Medido a 1440×900 con la misma red, la misma siembra y el
                // mismo techo: pico de alfa **0,298 con los enlaces llegando al
                // centro y 0,146 con el hueco**. La mitad del peor píxel de la
                // banda era esto.
                //
                // Y encima se ve mejor: los nodos dejan de ser el nudo de una
                // maraña y se leen como piezas conectadas.
                let ga = a.r + 1.5 * escalaTamano;
                let gb = b.r + 1.5 * escalaTamano;
                // Sin este recorte, dos nodos casi pegados —que son los del
                // enlace MÁS brillante— darían un segmento invertido, o sea una
                // línea que crece hacia fuera cuando deberían fundirse. Se deja
                // siempre un 40 % de la distancia dibujado.
                const hueco = ga + gb;
                if (hueco > d * 0.6) {
                  const k = (d * 0.6) / hueco;
                  ga *= k;
                  gb *= k;
                }
                const ux = dx / d;
                const uy = dy / d;
                ctx.beginPath();
                ctx.moveTo(a.x - ux * ga, a.y - uy * ga);
                ctx.lineTo(b.x + ux * gb, b.y + uy * gb);
                ctx.stroke();

                // Alta de señales. Se hace AQUÍ, aprovechando que ya se sabe
                // que el enlace existe: mantener aparte una lista de enlaces
                // vivos costaría un array por fotograma para no ganar nada.
                if (
                  dt > 0 &&
                  pulsosVivos < pulsos.length &&
                  cercania > 0.3
                ) {
                  // Sesgo hacia los nodos maestros: sin él el tráfico se ve
                  // aleatorio y la red no parece tener centros.
                  const sesgo = a.maestro || b.maestro ? 7 : 1;
                  if (Math.random() * 6000 < sesgo * dt) {
                    encender(i, j, a.maestro, b.maestro);
                  }
                }
              }
            }
          }
        }
      }

      // ---------- pulsos: avanzar y trazar la estela ----------
      grosor(1.6);
      for (let k = 0; k < pulsos.length; k++) {
        const p = pulsos[k];
        if (!p.vivo) continue;
        p.t += p.v * dt;
        if (p.t >= 1) {
          p.vivo = false;
          pulsosVivos--;
          continue;
        }

        const a = nodos[p.a];
        const b = nodos[p.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const cercania = 1 - Math.sqrt(dx * dx + dy * dy) / distanciaEnlace;
        // El enlace se rompió mientras la señal viajaba (los nodos se han
        // separado). Se apaga con la cercanía en vez de desaparecer de golpe:
        // un punto brillante que se esfuma sin más se lee como un fallo.
        if (cercania <= 0) {
          p.vivo = false;
          pulsosVivos--;
          continue;
        }

        p.x = a.x + dx * p.t;
        p.y = a.y + dy * p.t;
        // El pulso también pinta un halo alrededor, así que también va por
        // tramo y no por punto. Es pequeño, pero la regla no admite excepciones
        // «pequeñas»: en cuanto una figura se sale del techo de su centro, el
        // techo deja de ser una garantía y pasa a ser una tendencia.
        p.foco = atenuacion(p.x, p.y, 5.5 * escalaTamano);
        // Campana de entrada y salida, por el mismo motivo.
        p.alfa = Math.sin(p.t * Math.PI) * cercania * 0.95 * p.foco * intens;

        const t0 = p.t > 0.26 ? p.t - 0.26 : 0;
        ctx.globalAlpha = p.alfa * 0.55;
        ctx.beginPath();
        ctx.moveTo(a.x + dx * t0, a.y + dy * t0);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      // ---------- capa aditiva: todos los halos de una vez ----------
      // `lighter` SUMA los canales en vez de taparlos, que es lo que convierte
      // dos halos superpuestos en un núcleo más brillante y no en una mancha
      // plana. El modo se cambia dos veces por fotograma y no una vez por
      // figura: alternarlo obliga al motor a cerrar el lote de dibujo, y hacerlo
      // treinta veces cuesta más que los treinta dibujos.
      if (destello) {
        ctx.globalCompositeOperation = "lighter";

        // El resplandor bajo el cursor era una nube de 170 px de radio: la
        // pieza de desenfoque más grande del lienzo y la que más se notaba,
        // porque además seguía al ratón. Se queda en un realce corto y flojo;
        // lo que de verdad hace legible el gesto es que los nodos y los enlaces
        // suben de brillo alrededor (`influenciaPuntero`), y eso no ha cambiado.
        if (puntero) {
          const rp = RADIO_PUNTERO * 0.34;
          ctx.globalAlpha = 0.055 * intens;
          ctx.drawImage(destello, puntero.x - rp, puntero.y - rp, rp * 2, rp * 2);
        }

        for (let i = 0; i < nodos.length; i++) {
          const n = nodos[i];
          // Los del fondo no tienen halo: si todo brilla, nada destaca, y la
          // jerarquía entre planos se pierde.
          if (!n.maestro && n.z < 0.6) continue;
          if (n.alfa <= 0.02) continue;
          // EL HALO SE APAGA AL CUADRADO DE LA ATENUACIÓN, el punto no. Es lo
          // que deja tener red en todo el bloque sin llenar el bloque de
          // neblina: el resplandor se queda donde el foco vale ~1 y la
          // periferia se dibuja con trama limpia. Con el suelo de foco en
          // 0,75 el halo de la periferia vale 0,56 del que tendría en el
          // corazón, y en la banda protegida (techo 0,18) se queda en 0,032:
          // el único efecto capaz de sumar sin límite deja de existir justo
          // donde hay que leer.
          const a = n.alfa * (n.maestro ? 0.42 : 0.24) * n.foco * n.foco;
          // Un halo por debajo de este alfa no pinta un píxel distinguible pero
          // sí cuesta un `drawImage`. Con el apagado al cubo hay muchos en la
          // banda: quitarlos ahorró 31 halos por fotograma a 1440×900.
          if (a <= 0.008) continue;
          const rh = n.r * (n.maestro ? 4.6 : 2.9);
          ctx.globalAlpha = a;
          ctx.drawImage(destello, n.x - rh, n.y - rh, rh * 2, rh * 2);
        }

        const rp = 5.5 * escalaTamano;
        for (let k = 0; k < pulsos.length; k++) {
          const p = pulsos[k];
          if (!p.vivo) continue;
          ctx.globalAlpha = p.alfa * 0.6 * p.foco * p.foco;
          ctx.drawImage(destello, p.x - rp, p.y - rp, rp * 2, rp * 2);
        }

        ctx.globalCompositeOperation = "source-over";
      }

      // ---------- núcleos ----------
      // TRES VELOCIDADES DE APAGADO, y la regla es una sola: **cuanto más
      // concentrada es la luz de un elemento, más deprisa se apaga fuera del
      // corazón del foco.** El enlace, que es luz repartida a lo largo de
      // decenas de píxeles, se apaga con `foco`. El núcleo, que mete el mismo
      // alfa en cuatro píxeles, se apaga con `foco·(0,6+0,4·foco)`. El halo,
      // que además SUMA en vez de tapar, con `foco³`.
      //
      // No es estética, es lo que hace que el techo de la banda se cumpla. El
      // alfa de cada primitiva está acotado por la atenuación, pero el del
      // PÍXEL no: dos núcleos que se cruzan dan 1 − (1 − a)². Medido a
      // 1440×900, con la misma red y el mismo techo: el pico de alfa de la
      // banda baja de 0,227 a 0,166 con este factor. Lo que se pierde a cambio
      // es brillo en los puntos de la banda, que son cuatro píxeles; la trama,
      // que es lo que se ve, la ponen los enlaces y no se toca.
      for (let i = 0; i < nodos.length; i++) {
        const n = nodos[i];
        if (n.alfa <= 0.02) continue;
        ctx.globalAlpha = n.alfa * (0.6 + 0.4 * n.foco);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, TAU);
        ctx.fill();
      }

      for (let k = 0; k < pulsos.length; k++) {
        const p = pulsos[k];
        if (!p.vivo) continue;
        ctx.globalAlpha = p.alfa;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.7 * escalaTamano, 0, TAU);
        ctx.fill();
      }

      // ---------- instrumental de los nodos maestros ----------
      // Es lo que separa "un punto más gordo" de "un instrumento": el ojo lee
      // movimiento propio, distinto del de la deriva del campo.
      grosor(0.9);
      for (let i = 0; i < nodos.length; i++) {
        const n = nodos[i];
        if (!n.maestro || n.alfa <= 0.03) continue;

        // EL INSTRUMENTAL TAMBIÉN SE APAGA MÁS DEPRISA QUE EL ENLACE, y por el
        // mismo motivo que el halo: son CUATRO trazos concéntricos sobre el
        // mismo nodo, y la onda, al expandirse, cruza a los otros tres. Es luz
        // concentrada, y la regla de la casa es que la luz concentrada se apaga
        // con una potencia más de `foco`.
        //
        // Medido a 1440×900 con techo 0,20: sin este factor el peor alfa de la
        // banda llegaba a 0,357 —cian 5,98:1, INCUMPLE— porque los anillos se
        // apilaban entre ellos. Con él baja a 0,24. En el corazón del foco
        // (`foco` = 1) no cambia absolutamente nada, que es donde el
        // instrumental es el carácter de la pieza.
        const inst = n.alfa * n.foco;
        if (inst <= 0.006) continue;

        // Carcasa.
        ctx.globalAlpha = inst * 0.4;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 2.4, 0, TAU);
        ctx.stroke();

        // Dos arcos que giran en sentidos opuestos y a radios distintos. Con el
        // mismo sentido se leen como un único aro y el efecto desaparece.
        const giro = reloj * 0.011 + n.fase;
        ctx.globalAlpha = inst * 0.55;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 4.1, giro, giro + 1.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 5.6, -giro * 0.7, -giro * 0.7 + 0.62);
        ctx.stroke();

        // Onda: nace en la carcasa y se apaga al alejarse. `(1 − t)²` para que
        // se desvanezca bastante antes del final y no quede un aro suelto
        // flotando lejos del nodo que lo emitió.
        const t = (reloj * 0.0055 + n.fase) % 1;
        ctx.globalAlpha = inst * (1 - t) * (1 - t) * 0.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 2.4 + t * 46 * escalaTamano, 0, TAU);
        ctx.stroke();
      }

      // Devolver la opacidad a 1: el contexto es un objeto con estado, y
      // dejarlo a media asta hace que el siguiente `clearRect` no borre del
      // todo y la red vaya dejando estela.
      ctx.globalAlpha = 1;
    }

    /** Reutiliza la primera ranura libre del grupo de pulsos. Nunca reserva. */
    function encender(
      i: number,
      j: number,
      iMaestro: boolean,
      jMaestro: boolean
    ) {
      let libre = -1;
      for (let k = 0; k < pulsos.length; k++) {
        if (!pulsos[k].vivo) {
          libre = k;
          break;
        }
      }
      if (libre === -1) return;
      const p = pulsos[libre];
      // La señal SALE del nodo maestro cuando hay uno solo: eso es lo que hace
      // que la red parezca tener emisores y no tráfico en todas direcciones.
      const desdeI = iMaestro === jMaestro ? Math.random() < 0.5 : iMaestro;
      p.a = desdeI ? i : j;
      p.b = desdeI ? j : i;
      p.t = 0;
      p.v = 0.01 + Math.random() * 0.01;
      p.x = nodos[p.a].x;
      p.y = nodos[p.a].y;
      p.alfa = 0;
      p.vivo = true;
      pulsosVivos++;
    }

    function bucle(ahora: number) {
      // La petición del siguiente fotograma va ANTES del posible retorno: si se
      // dejara al final, el fotograma descartado por el tope de refresco
      // rompería la cadena y la animación se pararía en seco.
      animacion = requestAnimationFrame(bucle);

      // Tope de refresco. `requestAnimationFrame` se sigue pidiendo a cada
      // vsync —no hay manera de pedirle al navegador una cadencia menor—, pero
      // lo que gasta es el DIBUJO, y así se hace la mitad de veces.
      if (ahora - anterior < msEntreFotogramas) return;

      // `dt` en múltiplos de un fotograma de 60 Hz, medido contra el último
      // fotograma PINTADO (no contra el último vsync), que es lo que mantiene
      // la velocidad igual con y sin tope. El techo de 3 es para el regreso de
      // una pestaña en segundo plano: sin él, el primer `dt` vale cientos de
      // fotogramas y los nodos aparecen teletransportados al otro lado.
      const dt = anterior ? Math.min((ahora - anterior) / 16.6667, 3) : 1;
      anterior = ahora;
      pintar(dt);
    }

    function arrancar() {
      detener();
      if (!medir()) return; // 0×0: aún sin caja, no hay nada que pintar
      sembrar();
      if (menosMovimiento.matches || document.hidden) {
        pintar(0); // un fotograma quieto, para que el lienzo no salga vacío
        return;
      }
      msEntreFotogramas = soloDedo.matches ? MS_ENTRE_FOTOGRAMAS_TACTIL : 0;
      animacion = requestAnimationFrame(bucle);
    }

    function detener() {
      if (animacion) cancelAnimationFrame(animacion);
      animacion = 0;
      anterior = 0; // si no, el primer `dt` al volver mide toda la pausa
    }

    // El lienzo puede pasar de 0×0 a tamaño real al cruzar un punto de corte, y
    // ResizeObserver es lo único que se entera de eso (no hay evento de resize
    // si la ventana no cambia, por ejemplo al girar un iPad).
    const observador = new ResizeObserver(() => arrancar());
    observador.observe(canvas);

    const alCambiarVisibilidad = () => (document.hidden ? detener() : arrancar());
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    menosMovimiento.addEventListener("change", arrancar);

    const alMover = (e: PointerEvent) => {
      if (!hayRaton.matches) return;
      const caja = canvas.getBoundingClientRect();
      puntero = { x: e.clientX - caja.left, y: e.clientY - caja.top };
    };
    const alSalir = () => (puntero = null);
    const padre = canvas.parentElement ?? canvas;
    padre.addEventListener("pointermove", alMover);
    padre.addEventListener("pointerleave", alSalir);

    arrancar();

    return () => {
      detener();
      observador.disconnect();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      menosMovimiento.removeEventListener("change", arrancar);
      padre.removeEventListener("pointermove", alMover);
      padre.removeEventListener("pointerleave", alSalir);
    };
    // Cambiar cualquiera de ellas vuelve a sembrar el campo. Son decisiones de
    // composición que se toman una vez, no valores que se animen desde fuera;
    // si algún día hiciera falta modularlas en vivo, habría que pasarlas por
    // una `ref` para no reiniciar la red en cada fotograma. Y por eso son
    // números sueltos y no un objeto `foco={{…}}`: un objeto escrito en línea
    // es nuevo en cada render y volvería a sembrar la red en cada uno.
  }, [
    intensidad,
    densidad,
    focoX,
    focoY,
    focoAncho,
    focoAlto,
    focoPiso,
    zonaAncho,
    bandaDesde,
    bandaHasta,
    bandaTecho,
  ]);

  return (
    <canvas
      ref={refCanvas}
      // `text-primary` es de dónde sale el color; ver el bloque de arriba.
      // `aria-hidden` porque no comunica nada: es decoración.
      className={`text-primary ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
