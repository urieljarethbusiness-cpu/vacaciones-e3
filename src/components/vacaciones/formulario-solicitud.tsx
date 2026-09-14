"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DateRange, Matcher } from "react-day-picker";
import { es as esDateFns } from "date-fns/locale";
import { TriangleAlert } from "lucide-react";
import { solicitarAusencia } from "@/server/actions/vacaciones";
import {
  MENSAJE_EVIDENCIA_REQUERIDA,
  construirFormDataAusencia,
  fechaDesdeISO,
  formatearFechaCorta,
  type PoliticaAusencia,
  type TipoAusencia,
} from "@/lib/ausencias";
import {
  cicloDeFecha,
  diaSiguienteISO,
  etiquetaCiclo,
  nombreCiclo,
  topeSolicitud,
  type CicloVacaciones,
} from "@/lib/vacaciones";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoEvidencia } from "@/components/vacaciones/campo-evidencia";
import { SelectorTipo } from "@/components/vacaciones/selector-tipo";

function aISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function hoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Primer día seleccionable según la política del tipo.
 *
 * Espeja `app.validar_solicitud_vacaciones`:
 *  - `aplica_anticipacion` → hoy + `anticipacion_minima_dias`
 *  - `permite_retroactivo` → sin mínimo
 *  - en otro caso → hoy
 */
function minimoDe(
  politica: PoliticaAusencia | undefined,
  anticipacionDias: number
): Date | undefined {
  if (!politica) return undefined;
  if (politica.aplica_anticipacion) {
    const d = hoy();
    d.setDate(d.getDate() + anticipacionDias);
    return d;
  }
  if (politica.permite_retroactivo) return undefined;
  return hoy();
}

/**
 * Alta de una ausencia propia.
 *
 * El formulario se reconfigura en vivo con la política del tipo elegido: el
 * calendario abre o cierra las fechas pasadas, el aviso de saldo aparece solo
 * si el tipo descuenta, y el comprobante pasa a ser obligatorio cuando toca.
 * Ninguna de esas reglas se decide aquí: todas salen de `politica_ausencias`,
 * que es lo que también valida el trigger de la base.
 *
 * EL CICLO NO SE ELIGE: se deduce de la fecha de inicio, igual que en
 * `app.validar_solicitud_vacaciones`. Unos días de octubre de 2026 se cargan
 * al ciclo 2026-2027 aunque se pidan en enero, y el saldo contra el que se
 * comprueban es el de ESE ciclo. Antes el formulario solo conocía el saldo del
 * ciclo en curso, así que enseñaba «excede tu saldo» para solicitudes que la
 * base habría aceptado sin problema.
 */
export function FormularioSolicitud({
  politicas,
  festivos,
  anticipacionDias,
  ciclos,
  bloqueos,
}: {
  /** Tipos activos que esta persona puede registrar, ordenados por `orden`. */
  politicas: PoliticaAusencia[];
  festivos: string[];
  anticipacionDias: number;
  /**
   * Ciclos que se pueden solicitar, del actual en adelante
   * (`mis_ciclos_vacaciones`). Vacío si la persona aún no tiene derecho.
   */
  ciclos: CicloVacaciones[];
  /** Motivo por el que un tipo no está disponible, indexado por tipo. */
  bloqueos?: Partial<Record<TipoAusencia, string>>;
}) {
  const router = useRouter();
  const idMotivo = useId();
  const idComentario = useId();

  const disponibles = useMemo(
    () => politicas.filter((p) => !bloqueos?.[p.tipo]),
    [politicas, bloqueos]
  );

  /**
   * Tipo preseleccionado: el primero disponible que NO revele nada reservado.
   *
   * Antes era `disponibles[0]` a secas, y eso tenía una consecuencia fea: a
   * quien no ha cumplido el año se le bloquea `vacaciones` (orden 10), así que
   * el primero pasaba a ser `permiso_salud` (orden 20). Al recién llegado se
   * le abría el formulario con «Permiso por salud» marcado, su insignia roja
   * de comprobante obligatorio y el botón de envío inhabilitado. `motivo_sensible`
   * es justo la bandera que distingue esos tipos (salud, duelo, maternidad),
   * así que se salta hasta el primero neutro.
   */
  const [tipo, setTipo] = useState<TipoAusencia | null>(
    () =>
      (disponibles.find((p) => !p.motivo_sensible) ?? disponibles[0])?.tipo ??
      null
  );
  const [rango, setRango] = useState<DateRange | undefined>();
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);

  const politica = useMemo(
    () => politicas.find((p) => p.tipo === tipo),
    [politicas, tipo]
  );

  const descuenta = politica?.descuenta_vacaciones ?? false;

  const festivosSet = useMemo(() => new Set(festivos), [festivos]);
  const fechaMinima = useMemo(
    () => minimoDe(politica, anticipacionDias),
    [politica, anticipacionDias]
  );

  /**
   * Último día que la ventana de solicitud alcanza (fin del ciclo siguiente).
   * Espeja `trg_validar_solicitud_ventana`, y solo aplica a los tipos que
   * consumen el saldo LFT: los permisos se ubican en el año calendario y no
   * tienen ciclo aniversario que acotar.
   */
  const topeISO = descuenta ? topeSolicitud(ciclos) : "";
  const fechaMaxima = useMemo(
    () => (topeISO ? fechaDesdeISO(topeISO) : undefined),
    [topeISO]
  );

  const restricciones = useMemo<Matcher[]>(() => {
    const lista: Matcher[] = [
      { dayOfWeek: [0, 6] },
      (fecha: Date) => festivosSet.has(aISO(fecha)),
    ];
    if (fechaMinima) lista.unshift({ before: fechaMinima });
    if (fechaMaxima) lista.push({ after: fechaMaxima });
    return lista;
  }, [festivosSet, fechaMinima, fechaMaxima]);

  /**
   * Primer día que se puede TOCAR de verdad: hábil, no festivo y dentro de la
   * ventana. No es lo mismo que `fechaMinima`, y esa diferencia se notaba de
   * dos maneras feas:
   *
   *  - El texto decía «Puedes elegir del 29 ago en adelante» cuando el 29 era
   *    sábado y el primer día real era el 31. Quien intentaba tocar el 29
   *    concluía, con razón, que la pantalla fallaba.
   *  - El calendario abría en el mes de `fechaMinima`. Con 14 días de aviso,
   *    agosto salía con 5 celdas activas de 42 y todo lo demás gris: se leía
   *    como «no hay nada disponible», no como «avanza de mes».
   *
   * Se busca hasta un año por delante; si no aparece ninguno, se devuelve
   * `undefined` y todo vuelve al comportamiento anterior.
   */
  const primerDiaElegible = useMemo(() => {
    const d = fechaMinima ? new Date(fechaMinima) : hoy();
    d.setHours(0, 0, 0, 0);
    const tope = fechaMaxima ?? null;
    for (let i = 0; i < 366; i++) {
      if (tope && d > tope) return undefined;
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6 && !festivosSet.has(aISO(d))) return new Date(d);
      d.setDate(d.getDate() + 1);
    }
    return undefined;
  }, [fechaMinima, fechaMaxima, festivosSet]);

  // Mismo criterio que la BD (`app.dias_habiles`): lunes-viernes sin festivos
  const diasHabilesSeleccionados = useMemo(() => {
    if (!rango?.from) return 0;
    const fin = rango.to ?? rango.from;
    let cuenta = 0;
    const d = new Date(rango.from);
    while (d <= fin) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6 && !festivosSet.has(aISO(d))) cuenta++;
      d.setDate(d.getDate() + 1);
    }
    return cuenta;
  }, [rango, festivosSet]);

  // El ciclo lo fija la fecha de INICIO, no la de fin: es la misma regla que
  // aplica el trigger al guardar.
  const inicioISO = rango?.from ? aISO(rango.from) : null;
  const finISO = rango?.from ? aISO(rango.to ?? rango.from) : null;
  const cicloElegido = useMemo(
    () => (inicioISO ? cicloDeFecha(ciclos, inicioISO) : undefined),
    [ciclos, inicioISO]
  );

  // Fecha dentro de un tipo que descuenta pero fuera de todo ciclo conocido:
  // solo puede pasar si la ficha cambió con la página abierta.
  const fueraDeVentana = descuenta && !!inicioISO && !cicloElegido;
  // Un periodo no puede repartirse entre dos ciclos: el saldo del que sale
  // dejaría de cuadrar. La base lo rechaza; aquí se avisa antes de enviar.
  const cruzaAniversario =
    descuenta && !!cicloElegido && !!finISO && finISO > cicloElegido.ciclo_fin;

  const diasDelCiclo = cicloElegido?.dias_restantes ?? 0;
  const excedeSaldo =
    descuenta && !!cicloElegido && diasHabilesSeleccionados > diasDelCiclo;
  const faltaEvidencia =
    (politica?.requiere_evidencia ?? false) && archivos.length === 0;

  /**
   * Por qué no se puede enviar todavía, en una sola frase y en orden de lo que
   * toca resolver antes.
   *
   * Antes el botón se apagaba por seis condiciones distintas y solo una
   * imprimía su motivo al lado; las otras se explicaban dentro del párrafo del
   * contador, unos 300 px más arriba. Un botón muerto sin razón adyacente es
   * un callejón sin salida.
   */
  const motivoBloqueo: string | null = !politica
    ? "Elige el tipo de ausencia."
    : diasHabilesSeleccionados === 0
      ? "Selecciona en el calendario tu primer y último día."
      : cruzaAniversario && cicloElegido
        ? `El periodo cruza tu aniversario del ${formatearFechaCorta(
            diaSiguienteISO(cicloElegido.ciclo_fin)
          )}. Pídelo en dos partes: los días de antes por un lado y los de después por otro.`
        : fueraDeVentana
          ? "Esa fecha queda fuera de los años que puedes solicitar. Recarga la página."
          : excedeSaldo
            ? `Te pasas por ${diasHabilesSeleccionados - diasDelCiclo} ${
                diasHabilesSeleccionados - diasDelCiclo === 1 ? "día" : "días"
              }: tienes ${diasDelCiclo} disponibles y estás pidiendo ${diasHabilesSeleccionados}.`
            : faltaEvidencia
              ? MENSAJE_EVIDENCIA_REQUERIDA
              : null;

  function cambiarTipo(nuevo: TipoAusencia) {
    const politicaNueva = politicas.find((p) => p.tipo === nuevo);
    setTipo(nuevo);
    // El rango elegido puede dejar de ser válido al endurecerse el mínimo
    // (p. ej. de un permiso retroactivo a vacaciones con 14 días de aviso).
    const minimo = minimoDe(politicaNueva, anticipacionDias);
    if (minimo && rango?.from && rango.from < minimo) {
      setRango(undefined);
      // Antes las fechas desaparecían sin que nada lo dijera y el botón se
      // apagaba sin causa visible.
      toast.info(
        `Las fechas que tenías no valen para ${politicaNueva?.etiqueta?.toLocaleLowerCase(
          "es-MX"
        )}: elígelas de nuevo a partir del ${formatearFechaCorta(aISO(minimo))}.`
      );
    }
    // El bloque de comprobante desaparece con el tipo, así que los archivos
    // tienen que irse con él: si no, los que se adjuntaron para un permiso por
    // salud viajarían pegados a unas vacaciones sin que nadie los vea en
    // pantalla. El servidor no lo impide — solo comprueba que NO falten donde
    // hacen falta, no que sobren donde no pintan nada.
    if (!politicaNueva?.requiere_evidencia && archivos.length > 0) {
      setArchivos([]);
      toast.info(
        `${politicaNueva?.etiqueta ?? "Este tipo"} no lleva comprobante: quitamos los archivos que habías adjuntado.`
      );
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    // `motivoBloqueo` ya recoge, en orden, todo lo que impide enviar; el botón
    // está inhabilitado por lo mismo, así que esto solo cubre el envío por
    // teclado.
    if (motivoBloqueo) {
      toast.error(motivoBloqueo);
      return;
    }
    if (!politica || !rango?.from) return;

    // `construirFormDataAusencia` centraliza los nombres de campo que lee la
    // server action y repite `evidencia` una vez por archivo.
    const datos = construirFormDataAusencia({
      tipo: politica.tipo,
      fecha_inicio: aISO(rango.from),
      fecha_fin: aISO(rango.to ?? rango.from),
      motivo: motivo.trim() || undefined,
      comentario: comentario.trim() || undefined,
      evidencia: archivos,
    });

    setEnviando(true);
    const r = await solicitarAusencia(datos);
    setEnviando(false);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      `Listo, ya mandamos tu solicitud de ${politica.etiqueta.toLocaleLowerCase("es-MX")}. Te avisamos por correo en cuanto la revisen.`
    );
    setRango(undefined);
    setMotivo("");
    setComentario("");
    setArchivos([]);
    router.refresh();
  }

  if (politicas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay tipos de ausencia disponibles para tu cuenta. Avisa a Recursos
        Humanos.
      </p>
    );
  }

  return (
    // `<form>` y no `<div>`: así funciona Enter para enviar, el navegador
    // anuncia el conjunto como formulario y el envío deja de colgar de un
    // `onClick` suelto.
    <form className="@container grid min-w-0 gap-5" onSubmit={enviar} noValidate>
      <div className="grid min-w-0 gap-2">
        {/* No es un <label>: el grupo de tarjetas ya se anuncia con
            `aria-label` en su `role="radiogroup"`. */}
        <p className="text-sm leading-none font-medium">Tipo de ausencia</p>
        <SelectorTipo
          politicas={politicas}
          valor={tipo}
          onCambio={cambiarTipo}
          anticipacionDias={anticipacionDias}
          bloqueos={bloqueos}
          deshabilitado={enviando}
        />
        {politica?.descripcion && (
          <p className="text-xs text-muted-foreground">
            {politica.descripcion}
          </p>
        )}
      </div>

      {descuenta && ciclos.length > 0 && (
        <div className="grid min-w-0 gap-2">
          <p className="text-sm leading-none font-medium">
            Año al que se cargará
          </p>
          {/* Informativo, no un selector: el ciclo lo decide la fecha de
              inicio. Enseñar los dos con su saldo es lo que hace visible que
              se puede pedir por adelantado, y resaltar el que corresponde a la
              fecha elegida enseña la regla sin explicarla. */}
          <ul className="grid min-w-0 gap-1.5">
            {ciclos.map((c) => {
              const activo = cicloElegido?.indice === c.indice;
              return (
                <li
                  key={c.indice}
                  data-activo={activo}
                  className={`flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border px-3 py-2 text-xs ${
                    activo
                      ? "border-primary bg-primary/10"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="min-w-0 font-medium">
                    {c.indice === 0 ? "En curso" : "Próximo"} ·{" "}
                    {etiquetaCiclo(c)}
                  </span>
                  <span className="shrink-0">
                    {c.dias_restantes} de {c.dias_correspondientes} disponibles
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            No lo eliges tú: los días salen del año al que pertenece tu primer
            día del periodo. Si empiezas después de tu aniversario, salen del
            próximo.
          </p>
        </div>
      )}

      <div className="grid min-w-0 gap-2">
        <p className="text-sm leading-none font-medium">Fechas</p>
        {/* La cota que estorba es la de ABAJO, y era la única que no se decía.
            Con 14 días de anticipación, quien entra el 15 de agosto ve agosto
            entero en gris y tiene que deducir que hay que navegar de mes. */}
        <p className="text-xs text-muted-foreground">
          {fechaMinima
            ? `Puedes elegir del ${formatearFechaCorta(aISO(primerDiaElegible ?? fechaMinima))} en adelante`
            : "Puedes elegir días pasados: este tipo se registra después"}
          {descuenta && topeISO
            ? `, y hasta el ${formatearFechaCorta(topeISO)}.`
            : "."}{" "}
          Los días en gris no cuentan: fines de semana, festivos y los que caen
          dentro del plazo de aviso.
        </p>
        {/*
          En móvil el calendario se sale de los márgenes de la tarjeta.
          Motivo: hay que repartir el ancho entre SIETE columnas, y cada píxel
          de relleno se multiplica por siete al restarlo. Dentro de la tarjeta,
          a 320 px quedaban 256 px útiles y salían días de 36 px; recuperando
          los 16 px de cada lado se pasa a 288 y a celdas de 41. Es la
          diferencia entre acertar el día y darle al de al lado. Desde `sm` el
          ancho ya no aprieta y la tarjeta recupera su margen.
        */}
        <div className="-mx-(--card-spacing) sm:mx-0">
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={rango}
            onSelect={setRango}
            // Abre en el primer mes con días elegibles, no siempre en el actual.
            defaultMonth={primerDiaElegible ?? fechaMinima}
            // Sin esto, react-day-picker rotula los meses y los días en inglés
            locale={esDateFns}
            // Sin esto las flechas se anuncian en ingles («Go to the Next
            // Month»), que es el default de react-day-picker.
            labels={{
              labelPrevious: () => "Ir al mes anterior",
              labelNext: () => "Ir al mes siguiente",
            }}
            className="w-full p-0"
            // Mes único a lo ancho del bloque: celdas rectangulares de alto
            // fijo en lugar del aspect-square por defecto, que crecería sin
            // tope. El alto sale de `--cell-size` (44 px con el dedo, 32 con
            // ratón) en vez de un `h-10` que dejaba filas de 40 px SIEMPRE,
            // también en el móvil donde hay que acertar dos días concretos.
            classNames={{
              root: "w-full",
              day: "group/day relative h-(--cell-size) w-full rounded-(--cell-radius) p-0 text-center select-none [&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius) [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
              day_button: "aspect-auto h-full min-w-0",
            }}
            disabled={restricciones}
          />
        </div>
        {/* El contador cambia con cada clic en el calendario y es la única
            confirmación de lo que se está pidiendo: sin `aria-live` un lector
            de pantalla no se entera de nada. */}
        <p className="text-sm break-words" role="status" aria-live="polite">
          {diasHabilesSeleccionados > 0 ? (
            <>
              Registrarás{" "}
              <strong>
                {diasHabilesSeleccionados}{" "}
                {diasHabilesSeleccionados === 1 ? "día hábil" : "días hábiles"}
              </strong>{" "}
              de {politica?.etiqueta?.toLocaleLowerCase("es-MX")}.
              {descuenta ? (
                <>
                  {cicloElegido && (
                    <>
                      {" "}
                      Salen de {nombreCiclo(cicloElegido)} (
                      {etiquetaCiclo(cicloElegido)}), donde tienes{" "}
                      {cicloElegido.dias_restantes} días disponibles.
                    </>
                  )}
                  {/* `text-destructive` y no `text-red-600`: el tema oscuro
                      del área interna dejaba el rojo pelado en ~2.7:1, y era
                      el único indicador de error del formulario. */}
                  {excedeSaldo && (
                    <span className="ml-1 font-medium text-destructive">
                      Excede los días que te quedan.
                    </span>
                  )}
                  {cruzaAniversario && cicloElegido && (
                    <span className="ml-1 font-medium text-destructive">
                      El periodo cruza tu aniversario del{" "}
                      {formatearFechaCorta(
                        diaSiguienteISO(cicloElegido.ciclo_fin)
                      )}
                      : pídelo en dos partes.
                    </span>
                  )}
                  {fueraDeVentana && (
                    <span className="ml-1 font-medium text-destructive">
                      Esa fecha queda fuera de los años que puedes solicitar.
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {" "}
                  No descuenta de tu saldo de vacaciones.
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              Selecciona las fechas para ver los días hábiles.
            </span>
          )}
        </p>
      </div>

      {/* Solo los tipos que lo exigen enseñan el comprobante. En unas
          vacaciones no hay nada que justificar, y un campo de archivos ahí
          sobra: hace dudar de si falta algo por subir.

          Va JUSTO tras las fechas y por delante de los dos campos opcionales:
          es lo único que puede frenar el envío, y emparedado entre «Motivo
          (opcional)» y la nota quedaba a 1.250 px del inicio, fuera de la
          vista en una pantalla de 900. */}
      {politica?.requiere_evidencia && (
        <CampoEvidencia
          archivos={archivos}
          onCambio={setArchivos}
          etiquetaTipo={politica.etiqueta}
          deshabilitado={enviando}
        />
      )}

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={idMotivo}>Motivo (opcional)</Label>
        <Input
          id={idMotivo}
          maxLength={500}
          placeholder="Consulta médica, trámite familiar…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Una línea que explique la ausencia. Aparece en tu historial y en el
          de Recursos Humanos.
        </p>
      </div>

      <div className="grid min-w-0 gap-1.5">
        {/* Antes decía «para tu manager», pero el acuse dice que la revisa
            Recursos Humanos y el historial la sella como RR. HH.: tres nombres
            para el mismo destinatario. */}
        <Label htmlFor={idComentario}>
          Nota para Recursos Humanos (opcional)
        </Label>
        <Textarea
          id={idComentario}
          rows={2}
          maxLength={1000}
          placeholder="Ej.: dejo cerrado el pendiente de Acme antes de irme"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
      </div>

      <div className="grid min-w-0 gap-2">
        {/*
          El motivo del bloqueo va ENCIMA del botón y en rojo.

          Antes iba debajo, en gris de 12 px, y justo después de «Recursos
          Humanos te responde por correo», que es puramente decorativa: dos
          líneas idénticas en color y tamaño, y la que te desbloquea era la
          segunda. Se leía como un pie de página, no como la razón de que el
          botón no responda. Y mientras hay bloqueo, la frase decorativa se
          calla: solo compite por la atención.
        */}
        {motivoBloqueo && (
          <p
            role="alert"
            className="flex min-w-0 items-start gap-1.5 text-sm font-medium break-words text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">{motivoBloqueo}</span>
          </p>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {/* «Registrar» sonaba a hecho y consumado; lo que ocurre es que se
              manda a revisión, que es justo lo que dice el acuse. */}
          <Button type="submit" disabled={enviando || motivoBloqueo !== null}>
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </Button>
          {!motivoBloqueo && (
            <p className="min-w-0 text-xs break-words text-muted-foreground">
              Recursos Humanos te responde por correo.
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
