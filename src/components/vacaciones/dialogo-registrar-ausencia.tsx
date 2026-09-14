"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ShieldAlert } from "lucide-react";
import {
  consultarCiclosEmpleado,
  registrarAusenciaDeEmpleado,
} from "@/server/actions/vacaciones";
import {
  ESTADOS_ALTA_GESTOR,
  MENSAJE_EVIDENCIA_REQUERIDA,
  errorDeEvidencia,
  etiquetaEstado,
  formatearFechaCorta,
  type PoliticaAusencia,
} from "@/lib/ausencias";
import {
  cicloDeFecha,
  diaSiguienteISO,
  etiquetaCiclo,
  type CicloVacaciones,
} from "@/lib/vacaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoEvidencia } from "@/components/vacaciones/campo-evidencia";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EmpleadoAsignable = {
  id: string;
  nombre_completo: string;
  puesto: string | null;
};

/** Lo que se sabe de los periodos de la persona elegida. */
type EstadoCiclos =
  | { estado: "sin_persona" }
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; ciclos: CicloVacaciones[] };

/**
 * Alta manual de una ausencia a nombre de otra persona (RR. HH. y el dueño).
 *
 * PRIMERO SE ELIGE A LA PERSONA, y no es una preferencia de orden: el ciclo de
 * vacaciones es aniversario → aniversario, así que los periodos y los saldos
 * que hay que enseñar son los DE ELLA, no los de quien opera. Hasta que no hay
 * nombre no hay nada honesto que pintar, y por eso el resto del formulario
 * llega deshabilitado. Los periodos los sirve
 * `public.ciclos_vacaciones_empleado()` (0064), que exige `gestion.vacaciones`
 * para mirar los de otro.
 *
 * La política del tipo manda: si `requiere_evidencia`, el comprobante es
 * obligatorio y se avisa antes de mandar nada por la red — el mismo texto que
 * devolvería el trigger de la base, para que el usuario lea siempre lo mismo.
 *
 * Se manda `FormData` porque la acción acepta archivos; el patrón sigue siendo
 * el del repo (useState + llamada directa + sonner + router.refresh()).
 */
export function DialogoRegistrarAusencia({
  empleados,
  politicas,
}: {
  empleados: EmpleadoAsignable[];
  /** Tipos ACTIVOS. Los retirados no se ofrecen ni a Recursos Humanos. */
  politicas: PoliticaAusencia[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [empleadoId, setEmpleadoId] = useState("");
  const [tipo, setTipo] = useState<string>(politicas[0]?.tipo ?? "vacaciones");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [estado, setEstado] = useState<string>("aprobada");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [ciclos, setCiclos] = useState<EstadoCiclos>({ estado: "sin_persona" });

  const politica = useMemo(
    () => politicas.find((p) => p.tipo === tipo) ?? null,
    [politicas, tipo]
  );

  const nombreElegido = useMemo(
    () => empleados.find((e) => e.id === empleadoId)?.nombre_completo ?? "",
    [empleados, empleadoId]
  );

  const listaCiclos = ciclos.estado === "listo" ? ciclos.ciclos : [];

  // El ciclo lo decide la FECHA DE INICIO, igual que en
  // `app.validar_solicitud_vacaciones`: unos días de octubre salen del ciclo
  // que contiene ese 1 de octubre, aunque se registren en enero.
  const cicloElegido = useMemo(
    () => (fechaInicio ? cicloDeFecha(listaCiclos, fechaInicio) : undefined),
    [listaCiclos, fechaInicio]
  );

  /**
   * Los periodos se piden al elegir a la persona, no al abrir el diálogo: la
   * página no sabe de quién se va a registrar la ausencia.
   */
  async function cambiarEmpleado(nuevo: string) {
    setEmpleadoId(nuevo);
    if (!nuevo) {
      setCiclos({ estado: "sin_persona" });
      return;
    }
    setCiclos({ estado: "cargando" });
    const r = await consultarCiclosEmpleado(nuevo);
    // Si mientras tanto se cambió de persona, lo que llega ya no vale.
    setCiclos(
      r.ok
        ? { estado: "listo", ciclos: r.ciclos }
        : { estado: "error", mensaje: r.error }
    );
  }

  /**
   * Al cambiar de tipo se van los comprobantes con el bloque que los pedía:
   * de otro modo un justificante adjuntado para un permiso por salud acabaría
   * colgado de unas vacaciones, invisible en pantalla. La acción los acepta
   * —solo valida que no falten donde hacen falta—, así que hay que limpiarlos
   * aquí.
   */
  function cambiarTipo(nuevo: string) {
    setTipo(nuevo);
    const politicaNueva = politicas.find((p) => p.tipo === nuevo);
    if (!politicaNueva?.requiere_evidencia && archivos.length > 0) {
      setArchivos([]);
    }
  }

  function limpiar() {
    setEmpleadoId("");
    setTipo(politicas[0]?.tipo ?? "vacaciones");
    setFechaInicio("");
    setFechaFin("");
    setMotivo("");
    setEstado("aprobada");
    setArchivos([]);
    setCiclos({ estado: "sin_persona" });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!empleadoId) {
      toast.error("Selecciona a la persona.");
      return;
    }
    if (politica?.requiere_evidencia && archivos.length === 0) {
      toast.error(MENSAJE_EVIDENCIA_REQUERIDA);
      return;
    }
    const errorArchivos = errorDeEvidencia(archivos);
    if (errorArchivos) {
      toast.error(errorArchivos);
      return;
    }

    const datos = new FormData();
    datos.set("empleado_id", empleadoId);
    datos.set("tipo", tipo);
    datos.set("fecha_inicio", fechaInicio);
    datos.set("fecha_fin", fechaFin);
    datos.set("estado", estado);
    if (motivo.trim()) datos.set("motivo", motivo.trim());
    // El campo se repite: la acción lee `entrada.getAll("evidencia")`
    for (const archivo of archivos) datos.append("evidencia", archivo);

    setGuardando(true);
    const r = await registrarAusenciaDeEmpleado(datos);
    setGuardando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Ausencia registrada. La persona recibirá el aviso.");
    setAbierto(false);
    limpiar();
    router.refresh();
  }

  const sinPersona = empleadoId === "";

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) limpiar();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Registrar ausencia
        </Button>
      </DialogTrigger>
      {/* `max-h`/`overflow-y-auto`: con los periodos de la persona el diálogo
          pasa de 520 a ~760 px y no cabe en un móvil apaisado. */}
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar ausencia del equipo</DialogTitle>
          <DialogDescription>
            Das de alta la ausencia a nombre de otra persona, con la fecha que
            corresponda aunque ya haya pasado. Se le avisa por correo y queda
            registrada en la bitácora con tu nombre.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={guardar} className="grid gap-3">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="alta-empleado">1. Persona</Label>
            <Select value={empleadoId} onValueChange={cambiarEmpleado}>
              <SelectTrigger id="alta-empleado" className="w-full min-w-0">
                <SelectValue placeholder="Selecciona a la persona" />
              </SelectTrigger>
              <SelectContent>
                {empleados.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nombre_completo}
                    {e.puesto ? ` · ${e.puesto}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Va primero porque los periodos y el saldo que se enseñan abajo son
              los suyos, no los tuyos.
            </p>
          </div>

          <PeriodosEmpleado
            ciclos={ciclos}
            nombre={nombreElegido}
            cicloActivo={cicloElegido?.indice ?? null}
          />

          <fieldset
            disabled={sinPersona}
            className="grid min-w-0 gap-3 border-0 p-0 disabled:opacity-55"
          >
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="alta-tipo">2. Tipo de ausencia</Label>
              <Select value={tipo} onValueChange={cambiarTipo}>
                <SelectTrigger id="alta-tipo" className="w-full min-w-0">
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  {politicas.map((p) => (
                    <SelectItem key={p.tipo} value={p.tipo}>
                      {p.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {politica?.descripcion && (
                <p className="text-xs text-muted-foreground">
                  {politica.descripcion}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="alta-inicio">3. Del</Label>
                <Input
                  id="alta-inicio"
                  type="date"
                  required
                  className="min-w-0"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="alta-fin">Al</Label>
                <Input
                  id="alta-fin"
                  type="date"
                  required
                  className="min-w-0"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                />
              </div>
            </div>

            {/* Sin cota inferior: RR. HH. registra lo que ya ocurrió. Lo que sí
                conviene decir es a qué periodo se le va a cobrar, porque manda
                la fecha de inicio y no el día de hoy. */}
            {politica?.descuenta_vacaciones && fechaInicio && (
              <p className="min-w-0 text-xs break-words text-muted-foreground">
                {cicloElegido
                  ? `Estos días salen del periodo ${etiquetaCiclo(cicloElegido)}, donde le quedan ${cicloElegido.dias_restantes}.`
                  : `El ${formatearFechaCorta(fechaInicio)} cae fuera de los dos periodos de arriba. La base lo cobrará al periodo que contenga esa fecha; si no hay saldo, lo rechazará.`}
              </p>
            )}

            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="alta-motivo">Motivo</Label>
              <Textarea
                id="alta-motivo"
                rows={2}
                placeholder="Opcional. Contexto interno de por qué se registra."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>

            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="alta-estado">Estado inicial</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger id="alta-estado" className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_ALTA_GESTOR.map((e) => (
                    <SelectItem key={e} value={e}>
                      {etiquetaEstado(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                «Aprobada» la da por buena de inmediato; «Pendiente» la deja para
                que la resuelva otra persona.
              </p>
            </div>

            {/* Igual que en el alta propia: el comprobante solo se pide en los
                tipos que lo exigen. Se reutiliza `CampoEvidencia` para que RR. HH.
                vea exactamente el mismo bloque —y los mismos límites— que el
                empleado, en vez de un input de archivos suelto. */}
            {politica?.requiere_evidencia && (
              <CampoEvidencia
                archivos={archivos}
                onCambio={setArchivos}
                etiquetaTipo={politica.etiqueta}
                deshabilitado={guardando}
              />
            )}
          </fieldset>

          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Esta alta queda registrada en la bitácora de Recursos Humanos con
              tu nombre, la persona afectada y el rango de fechas.
            </span>
          </p>

          <Button type="submit" disabled={guardando || sinPersona}>
            {guardando ? "Registrando…" : "Registrar ausencia"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Los dos periodos de vacaciones de la persona elegida.
 *
 * Los cuatro estados se pintan distinto a propósito: «sin persona» explica lo
 * que falta, «cargando» reserva el hueco para que el diálogo no salte, «sin
 * periodos» distingue el perfil que no acumula (el dueño, Dirección) del que
 * aún no ha cumplido su primer año, y el error dice qué pasó en vez de
 * enseñar una lista vacía que se leería como «no tiene días».
 */
function PeriodosEmpleado({
  ciclos,
  nombre,
  cicloActivo,
}: {
  ciclos: EstadoCiclos;
  nombre: string;
  cicloActivo: number | null;
}) {
  if (ciclos.estado === "sin_persona") {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Elige a la persona y aquí saldrán sus dos periodos de vacaciones —el que
        corre y el siguiente— con el saldo de cada uno.
      </p>
    );
  }

  if (ciclos.estado === "cargando") {
    return (
      <p
        className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        Consultando sus periodos…
      </p>
    );
  }

  if (ciclos.estado === "error") {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs font-medium text-destructive"
      >
        {ciclos.mensaje}
      </p>
    );
  }

  if (ciclos.ciclos.length === 0) {
    return (
      <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        {nombre || "Esa persona"} no tiene periodos de vacaciones: o su perfil
        gestiona las del equipo sin acumular las suyas, o no tiene ficha laboral
        activa. Los permisos sí se le pueden registrar.
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="text-sm leading-none font-medium">
        Periodos de {nombre || "la persona"}
      </p>
      <ul className="grid min-w-0 gap-1.5">
        {ciclos.ciclos.map((c) => {
          const activo = cicloActivo === c.indice;
          return (
            <li
              key={c.indice}
              data-ciclo={c.indice}
              data-activo={activo}
              className={`flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border px-3 py-2 text-xs ${
                activo
                  ? "border-primary bg-primary/10"
                  : "border-border text-muted-foreground"
              }`}
            >
              <span className="min-w-0 font-medium">
                {c.indice === 0 ? "En curso" : "Próximo"} · {etiquetaCiclo(c)}
              </span>
              <span className="shrink-0">
                {c.dias_restantes} de {c.dias_correspondientes} disponibles
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Su aniversario es el{" "}
        {formatearFechaCorta(diaSiguienteISO(ciclos.ciclos[0].ciclo_fin))}. El
        periodo del que salen los días lo decide la fecha de inicio, no el día
        de hoy.
      </p>
    </div>
  );
}
