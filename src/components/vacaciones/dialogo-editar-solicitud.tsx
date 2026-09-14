"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, Trash2 } from "lucide-react";
import {
  actualizarSolicitud,
  descargarEvidencia,
  eliminarAusencia,
} from "@/server/actions/vacaciones";
import {
  ESTADOS_AUSENCIA,
  etiquetaEstado,
  formatearRango,
  formatearTamano,
  type AdjuntoAusencia,
  type EstadoAusencia,
  type TipoAusencia,
} from "@/lib/ausencias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SolicitudEditable = {
  id: string;
  empleado_nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_habiles: number;
  estado: string;
  tipo?: string | null;
  motivo?: string | null;
  comentario_manager: string | null;
  /** ¿Ya tiene comprobante subido? Decide si se puede reclasificar a un tipo que lo exija. */
  tiene_adjuntos?: boolean;
};

/**
 * Edición total por RR. HH.: tipo, motivo, estado (incluida `cancelada`),
 * rango de fechas y comentario, más el borrado definitivo.
 *
 * `tipo` y `motivo` solo se mandan desde el formulario largo; los botones de
 * resolución rápida los omiten a propósito, porque `actualizarSolicitud` solo
 * escribe esos campos si vienen y así no borran lo ya registrado.
 * Cada cambio se notifica por correo al empleado y queda en la bitácora.
 */
export function DialogoEditarSolicitud({
  solicitud,
  politicas,
}: {
  solicitud: SolicitudEditable;
  /** Catálogo vivo de `politica_ausencias` (solo los tipos activos). */
  politicas: { tipo: string; etiqueta: string; requiere_evidencia?: boolean }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [tipo, setTipo] = useState(solicitud.tipo ?? "vacaciones");
  const [estado, setEstado] = useState(solicitud.estado);
  const [fechaInicio, setFechaInicio] = useState(solicitud.fecha_inicio);
  const [fechaFin, setFechaFin] = useState(solicitud.fecha_fin);
  const [motivo, setMotivo] = useState(solicitud.motivo ?? "");
  const [comentario, setComentario] = useState(
    solicitud.comentario_manager ?? ""
  );

  /**
   * Al ABRIR se reconstruye el formulario desde la fila recién llegada del
   * servidor.
   *
   * Sin esto los `useState` de arriba solo se leían en el primer render, y
   * este diálogo vive dentro de una fila de la tabla que `router.refresh()`
   * **no desmonta**. La secuencia que lo rompía: «✓ Aprobar» manda el update y
   * cierra sin tocar el estado local; la fila ya dice «Aprobada»; al reabrir,
   * el selector seguía enseñando «Pendiente», y «Guardar cambios» devolvía la
   * ausencia a pendiente y disparaba otro aviso al empleado. Lo mismo pasaba
   * con el tipo, las fechas y el motivo si otra persona los había cambiado
   * entre medias: se pisaban en silencio con los valores viejos.
   */
  function alAbrirCerrar(abrir: boolean) {
    if (abrir) {
      setTipo(solicitud.tipo ?? "vacaciones");
      setEstado(solicitud.estado);
      setFechaInicio(solicitud.fecha_inicio);
      setFechaFin(solicitud.fecha_fin);
      setMotivo(solicitud.motivo ?? "");
      setComentario(solicitud.comentario_manager ?? "");
    }
    setAbierto(abrir);
  }

  /**
   * Reclasificar a un tipo que exige comprobante una ausencia que no lo tiene
   * es un callejón sin salida: el constraint trigger diferido
   * `trg_exigir_evidencia` aborta la transacción al COMMIT, y desde este
   * diálogo no hay forma de adjuntar nada. Mejor decirlo antes y señalar la
   * salida que dejar que reviente con un error que no explica qué hacer.
   *
   * La condición de estado espeja la del trigger: en `cancelada` y `rechazada`
   * no comprueba nada, así que ahí la reclasificación sí pasa.
   */
  const politicaElegida = politicas.find((p) => p.tipo === tipo);
  const faltaComprobante =
    (politicaElegida?.requiere_evidencia ?? false) &&
    !solicitud.tiene_adjuntos &&
    estado !== "cancelada" &&
    estado !== "rechazada";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (faltaComprobante) return;
    setGuardando(true);
    const r = await actualizarSolicitud({
      id: solicitud.id,
      estado: estado as EstadoAusencia,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      comentario_manager: comentario || undefined,
      tipo: tipo as TipoAusencia,
      motivo,
    });
    setGuardando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Ausencia actualizada. La persona recibirá el aviso.");
    setAbierto(false);
    router.refresh();
  }

  async function resolverRapido(nuevoEstado: "aprobada" | "rechazada") {
    setGuardando(true);
    const r = await actualizarSolicitud({
      id: solicitud.id,
      estado: nuevoEstado,
      fecha_inicio: solicitud.fecha_inicio,
      fecha_fin: solicitud.fecha_fin,
      comentario_manager: comentario || undefined,
    });
    setGuardando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      nuevoEstado === "aprobada" ? "Ausencia aprobada" : "Ausencia rechazada"
    );
    setAbierto(false);
    router.refresh();
  }

  async function eliminar() {
    setGuardando(true);
    const r = await eliminarAusencia(solicitud.id);
    setGuardando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Ausencia eliminada. Queda constancia en la bitácora.");
    setAbierto(false);
    router.refresh();
  }

  const rango = formatearRango(solicitud.fecha_inicio, solicitud.fecha_fin);

  return (
    <Dialog open={abierto} onOpenChange={alAbrirCerrar}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {solicitud.estado === "pendiente" ? "Revisar" : "Editar"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ausencia de {solicitud.empleado_nombre}</DialogTitle>
          <DialogDescription>
            {rango} · {solicitud.dias_habiles}{" "}
            {solicitud.dias_habiles === 1 ? "día hábil" : "días hábiles"}.
            Puedes cambiar el tipo, el rango, el estado o el motivo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="grid gap-3">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="sol-tipo">Tipo de ausencia</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger id="sol-tipo" className="w-full min-w-0">
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
            {faltaComprobante && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                «{politicaElegida?.etiqueta}» exige comprobante y esta ausencia
                no tiene ninguno. Desde aquí no se pueden adjuntar archivos: si
                hay que reclasificarla, pídele el justificante a la persona y
                vuelve a darla de alta con «Registrar ausencia».
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="sol-inicio">Del</Label>
              <Input
                id="sol-inicio"
                type="date"
                required
                className="min-w-0"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="sol-fin">Al</Label>
              <Input
                id="sol-fin"
                type="date"
                required
                className="min-w-0"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="sol-estado">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger id="sol-estado" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_AUSENCIA.map((e) => (
                  <SelectItem key={e} value={e}>
                    {etiquetaEstado(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="sol-motivo">Motivo</Label>
            <Input
              id="sol-motivo"
              className="min-w-0"
              placeholder="Contexto interno de la ausencia"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="sol-comentario">Comentario para el empleado</Label>
            <Textarea
              id="sol-comentario"
              rows={2}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={guardando || faltaComprobante}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
            {solicitud.estado === "pendiente" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={guardando}
                  onClick={() => resolverRapido("aprobada")}
                >
                  ✓ Aprobar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={guardando}
                  onClick={() => resolverRapido("rechazada")}
                >
                  ✗ Rechazar
                </Button>
              </>
            )}
          </div>
        </form>

        <div className="border-t pt-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={guardando}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 />
                Eliminar ausencia
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar esta ausencia?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vas a borrar definitivamente la ausencia de{" "}
                  <strong className="text-foreground">
                    {solicitud.empleado_nombre}
                  </strong>{" "}
                  del <strong className="text-foreground">{rango}</strong>, junto
                  con los comprobantes que tenga adjuntos. No se puede deshacer y
                  queda registrado en la bitácora de Recursos Humanos con tu
                  nombre.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={eliminar}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Sí, eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Descarga de los comprobantes de una ausencia.
 *
 * Vive aquí, junto al resto de acciones de la fila, para no multiplicar
 * archivos por un botón. La URL firmada dura 60 s y la genera el servidor:
 * la ruta del objeto nunca viaja al cliente.
 *
 * La ventana se abre ANTES del `await` y luego se le asigna la URL: si se
 * abriera después, el bloqueador de ventanas emergentes la mataría por no
 * venir de un gesto directo del usuario.
 */
export function BotonEvidencia({ adjuntos }: { adjuntos: AdjuntoAusencia[] }) {
  const [ocupado, setOcupado] = useState(false);

  async function abrir(adjuntoId: string) {
    const ventana = window.open("", "_blank");
    setOcupado(true);
    const r = await descargarEvidencia(adjuntoId);
    setOcupado(false);
    if (!r.ok) {
      ventana?.close();
      toast.error(r.error);
      return;
    }
    if (ventana) ventana.location.href = r.url;
    else window.location.assign(r.url);
  }

  if (adjuntos.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (adjuntos.length === 1) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={ocupado}
        onClick={() => abrir(adjuntos[0].id)}
        title={adjuntos[0].nombre_archivo}
      >
        <Paperclip />
        <span className="sr-only">
          Descargar comprobante {adjuntos[0].nombre_archivo}
        </span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={ocupado}>
          <Paperclip />
          {adjuntos.length}
          <span className="sr-only">Ver comprobantes</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-72">
        {adjuntos.map((a) => (
          <DropdownMenuItem key={a.id} onClick={() => abrir(a.id)}>
            <span className="truncate">{a.nombre_archivo}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {formatearTamano(a.tamano)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
