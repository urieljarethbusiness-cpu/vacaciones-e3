/**
 * El patrón visual de las CUATRO pantallas de acceso, en un solo sitio.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. Durante un tiempo solo `/login` tuvo el
 * tratamiento nuevo y las otras tres se quedaron con los controles de la
 * librería. Se veían coherentes por fuera —heredan el marco del layout— y
 * desafinadas por dentro: 32 px de alto en vez de 52, sin encabezado, y el
 * botón con blanco sobre cian, que no pasa AA. Auditadas una por una, tres de
 * las cuatro puertas de la plataforma estaban peor que la principal.
 *
 * Copiar las clases a mano en cada archivo lo habría arreglado hoy y roto
 * dentro de tres meses, cuando alguien afine una y no las otras. Cada constante
 * de aquí lleva escrito el número que la justifica, porque el valor sin el
 * motivo es lo primero que alguien «simplifica».
 */

/**
 * EL ANILLO DE FOCO, en un solo sitio.
 *
 * Se extrae porque lo comparten las cuatro pantallas de acceso Y el portal
 * del cliente, y porque de las cuatro clases hay una que parece sobrar y no
 * sobra: **`focus-visible:outline-solid`**. En Tailwind v4 el `outline-none`
 * que traen de fábrica `input.tsx` y `button.tsx` fija
 * `--tw-outline-style: none`, y `outline-2` no escribe `outline-style: solid`
 * sino `outline-style: var(--tw-outline-style)`. Sin esa clase el contorno
 * resuelve a `none`: la regla existe en el CSS servido y en la pantalla no se
 * pinta nada. Copiada a mano en un quinto archivo, es exactamente la que
 * alguien recorta por «redundante».
 *
 * Y va con `outline` SEPARADO (`offset-2`) y no con un `ring` pegado al
 * borde: medido en píxeles entre el estado enfocado y el normal —que es lo
 * que exige WCAG 2.4.11— el anillo pegado daba 1,77:1 en Chromium y **1,44:1
 * en WebKit**; un contorno separado cae sobre la superficie y ahí sí hay
 * salto. Lo mide `scripts/verificar-foco-visible.mjs`, que cuenta píxeles y
 * no lee clases.
 */
export const FOCO =
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Los dos campos de texto.
 *
 * `solo-raton:text-base` ES LA CLASE MENOS EVIDENTE. `input.tsx` trae
 * `text-base solo-raton:text-sm`: 16 px con el dedo —obligatorio, si no Safari
 * de iOS amplía la página al enfocar y no la devuelve— y **14 px con ratón**.
 * Esos 14 px son el escritorio, que es por donde entra la mayor parte de la
 * gente de más de 50 años. Se sube a 16 en los dos casos. Tiene que llevar la
 * variante y NO ser un `text-base` suelto: `tailwind-merge` no considera en
 * conflicto una utilidad con variante y otra sin ella, así que un `text-base` a
 * secas convive con el `solo-raton:text-sm` de la primitiva y pierde. Lo mismo
 * con el `dark:` del relleno, porque la primitiva trae `dark:bg-input/30`.
 *
 * `h-[3.25rem]` (52 px): el suelo táctil son 44, pero un campo de 52 con 16 px
 * de texto deja 18 px de aire arriba y abajo, y esa holgura es la diferencia
 * entre un campo que se ve y un campo que hay que buscar. Mide lo mismo con
 * dedo y con ratón, así que no hay salto entre dispositivos.
 *
 * EL RELLENO ES UN GRIS SÓLIDO, no un blanco al 4 %. Con `bg-white/[0.04]` el
 * campo se distinguía de su superficie en **1,12:1**: para un ojo de 55 años un
 * campo que no se ve es peor que una letra pequeña, porque el fallo no es «no
 * leo» sino «no sé dónde hay que escribir». Se sube el RELLENO y no el borde:
 * un borde grueso es lo que convierte un formulario caro en uno de trámite.
 *
 * `border-white/50` da **5,26:1 contra la superficie** y **5,06:1 contra el
 * propio relleno**; WCAG 1.4.11 pide 3:1 para el contorno de un control.
 *
 * EL FOCO VA CON `outline` SEPARADO, NO CON UN `ring` PEGADO AL BORDE. Medido
 * comparando píxeles entre el estado enfocado y el normal —que es lo que exige
 * WCAG 2.4.11— el anillo pegado daba 1,77:1 en Chromium y **1,44:1 en WebKit**.
 * Un contorno separado 2 px cae sobre la superficie y ahí sí hay salto: 5,38:1.
 *
 * `focus-visible:outline-solid` NO SOBRA, y quitarlo apaga el foco entero sin
 * que nada se ponga rojo. En Tailwind v4 `outline-none` —que traen `input.tsx`
 * y `button.tsx` de fábrica— fija `--tw-outline-style: none`, y `outline-2` no
 * escribe `outline-style: solid` sino `outline-style: var(--tw-outline-style)`.
 * Sin esta clase el contorno resuelve a `none`: la regla existe en el CSS
 * servido y en la pantalla no se pinta nada. Lo caza
 * `scripts/verificar-foco-visible.mjs`, que cuenta píxeles y no lee clases.
 */
export const CAMPO =
  "h-[3.25rem] rounded-[14px] border-white/50 bg-[oklch(0.304_0_0)] px-4 text-foreground transition-[color,background-color,border-color,box-shadow] duration-150 placeholder:text-white/60 hover:border-white/65 hover:bg-[oklch(0.335_0_0)] focus-visible:border-primary focus-visible:bg-[oklch(0.335_0_0)] focus-visible:ring-0 " +
  FOCO +
  " solo-raton:text-base dark:bg-[oklch(0.304_0_0)]";

/**
 * Etiqueta de campo: 16 px, no 14. Una etiqueta más pequeña que su campo se lee
 * como pie de foto y no como el nombre de lo que hay que rellenar — y 14 px es
 * justo el tamaño en el que la gente empieza a acercarse a la pantalla.
 * `leading-[1.35]` porque `label.tsx` trae `leading-none`, que a 16 px corta la
 * tilde y la eñe de «Contraseña» en algunos motores. 16,21:1.
 */
export const ETIQUETA = "text-base leading-[1.35] text-white/95";

/**
 * La acción principal.
 *
 * TINTA OSCURA SOBRE EL CIAN. `text-primary-foreground` (#fafafa) sobre
 * `--primary` da **3,13:1**: no pasa AA para texto normal, y el texto de un
 * botón no es texto grande por mucho semibold que lleve. `text-background`
 * sobre el mismo cian da **6,17:1**. Se arregla aquí y no en el token porque
 * cambiar `--primary-foreground` repintaría la aplicación entera —y en tema
 * claro la respuesta sería la contraria—; el resto merece su propia revisión.
 *
 * EL CIAN SUBE UN ESCALÓN, y el motivo es fisiológico. Modelado un cristalino
 * de ~60 años (transmitancia R 0,95 · G 0,83 · B 0,45), el cian de RELLENO con
 * tinta oscura cae de 6,17:1 a **4,08:1** — la mayor pérdida de la pantalla, un
 * 34 %, porque el cristalino amarillea y filtra el azul. El cian de TEXTO del
 * titular apenas sufre (11,08 → 7,09), así que el problema es del relleno. Se
 * sube derivándolo del token con `color-mix` y NO escribiendo un hex nuevo: un
 * segundo cian de marca a mano se queda atrás el día que cambie `--primary` y
 * nadie se entera.
 *
 * 17 px: es la única acción de la pantalla, y el tamaño compensa lo que el
 * color no puede dar.
 *
 * HOVER QUE ACLARA, NO QUE ATENÚA: `hover:bg-primary/80` sobre fondo oscuro
 * compone HACIA el fondo y apaga el botón justo al pasar por encima.
 *
 * EN CARGA NO SE ATENÚA: el `disabled:opacity-50` de la base lo dejaría en
 * 3,35:1 justo mientras alguien lo mira esperando. Se oscurece en su lugar.
 */
export const BOTON =
  "mt-1.5 h-[3.25rem] w-full gap-2 rounded-[14px] bg-[color-mix(in_oklch,var(--primary),white_10%)] text-[1.0625rem] font-semibold tracking-[-0.005em] text-background shadow-[0_16px_38px_-18px_var(--primary)] transition-[background-color,box-shadow] duration-150 hover:bg-[color-mix(in_oklch,var(--primary),white_24%)] hover:shadow-[0_20px_48px_-18px_var(--primary)] focus-visible:ring-0 " +
  FOCO +
  " disabled:bg-[color-mix(in_oklch,var(--primary),black_16%)] disabled:opacity-100";

/**
 * El enlace secundario (volver, recuperar).
 *
 * `inline-flex` con altura declarada y NO un `<a>` suelto: la regla global de
 * `globals.css` da 44 px de alto a todo `a[href]` con dedo, pero `min-height`
 * es INERTE sobre una caja de línea. Medido en `/recuperar-contrasena`, el
 * enlace de volver medía **171 × 20 px incluso en táctil**, en seis anchos
 * distintos. Es la trampa que documenta `docs/RESPONSIVIDAD.md` y que solo se
 * evita blockificándolo.
 *
 * 16 px y no 14: en `/login` este enlace es el único camino a la recuperación,
 * y en las demás es el único camino de vuelta. Es la salida de quien más se
 * atasca.
 *
 * `tabIndex={0}` hay que ponerlo en el JSX, no aquí, y NO es redundante: macOS
 * e iOS traen apagada de origen la navegación por teclado completa, y con esa
 * preferencia Safari no tabula a los `<a>`. Medido: el orden en WebKit saltaba
 * el enlace y salía de la página.
 */
export const ENLACE =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-base text-white/[0.78] underline-offset-4 transition-colors outline-none hover:text-foreground hover:underline " +
  FOCO +
  " solo-raton:min-h-9";

/**
 * El envoltorio de la columna del formulario.
 *
 * Se centra con `m-auto` y NO con `items-center`: cuando el contenido es más
 * alto que el hueco, `items-center` reparte el sobrante arriba y abajo y el de
 * arriba cae en coordenadas negativas del scroller — no hay manera de llegar a
 * él. Pasa de verdad a 320×256, que es lo que queda de un monitor de 1280 al
 * ampliar al 400 %.
 *
 * RELLENO INFERIOR MAYOR QUE EL SUPERIOR (`lg:pb-[12dvh]`): es lo que levanta
 * ópticamente el bloque sin renunciar a `m-auto`, porque un bloque centrado
 * geométricamente se percibe bajo. `dvh` y no `vh`, por la barra de direcciones
 * de Safari.
 */
export const COLUMNA =
  "flex min-h-0 w-full flex-1 justify-center overflow-y-auto overscroll-contain px-6 pt-8 pb-10 sm:px-10 lg:px-14 lg:pt-10 lg:pb-[12dvh] xl:px-20";

/** El bloque de contenido dentro de la columna. */
export const BLOQUE = "m-auto w-full max-w-[25rem]";

/**
 * El encabezado de la pantalla. `h1` de verdad y no un `CardTitle` —que
 * renderiza un `div`—: tres de las cuatro pantallas de acceso no tenían un solo
 * encabezado, así que un lector de pantalla no tenía ningún punto de
 * referencia. 16,01:1.
 */
export const TITULO =
  "text-[1.75rem]/[1.14] font-medium tracking-[-0.035em] text-foreground lg:text-[2.125rem]/[1.12]";

/**
 * La frase de orientación bajo el título. 17 px y no 14: es la primera frase
 * que lee alguien que no sabe dónde ha entrado; a 14 px y en
 * `text-muted-foreground` era la letra pequeña de su propia bienvenida.
 * 11,69:1.
 */
export const ENTRADILLA = "mt-2.5 text-pretty text-[1.0625rem]/[1.6] text-white/80";

/**
 * El bloque de abajo: cómo se consigue una cuenta.
 *
 * Se saca aquí porque desde el alta por autoservicio lo llevan TRES pantallas
 * —la general, la del equipo y la de clientes— y cada una dice algo distinto en
 * el mismo hueco. Copiado tres veces, el filete de separación y el interlineado
 * se separan a la primera.
 *
 * 15 px y no 13: el tema claro de esta aplicación está escrito pensando en
 * lectura cómoda para clientes de más de 50 años, y esa decisión no debe
 * evaporarse en el tema oscuro. `white/72` da 9,65:1.
 *
 * SE QUEDA EN LA COLUMNA DEL FORMULARIO y no sube al bloque de marca: ese
 * bloque desaparece por debajo de 600 px de alto y en móvil es una franja de una
 * línea, así que ahí este texto no existiría justo para quien más lo necesita.
 */
export const PIE =
  "mt-6 border-t border-white/[0.09] pt-5 text-center text-[0.9375rem]/[1.55] text-white/[0.72]";

/**
 * El enlace DENTRO de ese bloque: el camino al alta.
 *
 * No usa `ENLACE`, y la diferencia es deliberada. `ENLACE` es un control
 * blockificado con 44 px de alto propios, pensado para ir solo en su fila;
 * dentro de un párrafo eso partiría la línea en tres alturas distintas. Aquí es
 * texto en línea, así que el objetivo táctil lo da el interlineado del párrafo
 * (1,55 sobre 15 px) y lo que hace falta es que se DISTINGA del texto que lo
 * rodea: va subrayado siempre y en el cian de la marca, no solo en hover, porque
 * un enlace que solo se ve al pasar por encima no existe en una pantalla táctil.
 */
export const ENLACE_EN_TEXTO =
  "rounded-sm font-medium text-primary underline underline-offset-4 outline-none hover:text-foreground " +
  FOCO;
