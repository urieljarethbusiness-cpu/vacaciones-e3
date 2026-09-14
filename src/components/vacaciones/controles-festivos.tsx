"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  agregarFestivo,
  eliminarFestivo,
  generarFestivosAnio,
} from "@/server/actions/vacaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

/** Sin props: barra de acciones (agregar + generar año). Con fechaEliminar: botón de borrado. */
export function ControlesFestivos({ fechaEliminar }: { fechaEliminar?: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  // --- Modo botón eliminar ---
  if (fechaEliminar) {
    async function eliminar() {
      setOcupado(true);
      const r = await eliminarFestivo(fechaEliminar!);
      setOcupado(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Festivo eliminado");
      router.refresh();
    }
    return (
      /*
       * Con confirmación, como el borrado de una ausencia.
       *
       * Estaba a un solo toque, sin preguntar nada, en una lista de cuarenta
       * filas por la que se pasa el pulgar haciendo scroll. Y un festivo no es
       * un dato menor: entra en el cálculo de días hábiles de toda la empresa.
       * La incoherencia era llamativa — «Eliminar ausencia», que afecta a una
       * persona, sí avisaba de que no se puede deshacer.
       */
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={ocupado}>
            Eliminar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este día festivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Dejará de contar como día de descanso y volverá a considerarse
              hábil en el cálculo de vacaciones de todo el equipo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // --- Modo barra de acciones ---
  return (
    <div className="flex flex-wrap gap-2">
      <DialogoAgregarFestivo />
      <BotonGenerarAnio />
    </div>
  );
}

function DialogoAgregarFestivo() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const r = await agregarFestivo({ fecha, nombre });
    setGuardando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Festivo agregado");
    setAbierto(false);
    setFecha("");
    setNombre("");
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button>Agregar festivo E3</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo día festivo</DialogTitle>
        </DialogHeader>
        <form onSubmit={guardar} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fest-fecha">Fecha</Label>
            <Input
              id="fest-fecha"
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fest-nombre">Nombre</Label>
            <Input
              id="fest-nombre"
              required
              placeholder="Aniversario de E3"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Agregar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BotonGenerarAnio() {
  const router = useRouter();
  const [anio, setAnio] = useState(String(new Date().getFullYear() + 1));
  const [generando, setGenerando] = useState(false);

  async function generar() {
    setGenerando(true);
    const r = await generarFestivosAnio(Number(anio));
    setGenerando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      r.insertados === 0
        ? `Los festivos oficiales de ${anio} ya existían`
        : `${r.insertados} festivos oficiales de ${anio} generados`
    );
    router.refresh();
  }

  return (
    /* El botón lleva `whitespace-nowrap` de serie, así que su ancho mínimo es
       el del texto completo: unos 210 px. Con el año en 112 px fijos y sin
       `flex-wrap` ni `min-w-0`, el bloque pedía ~330 px y desbordaba la
       página entera por debajo de ~368 px de ventana. Ahora el año se queda
       en un ancho corto y fijo, el botón puede partir el texto en dos líneas
       y, si aun así no cabe, la fila envuelve. */
    <div className="flex min-w-0 flex-wrap gap-2">
      <Input
        type="number"
        className="w-24 shrink-0"
        aria-label="Año"
        value={anio}
        onChange={(e) => setAnio(e.target.value)}
      />
      <Button
        variant="outline"
        className="h-auto min-w-0 py-1.5 text-left whitespace-normal"
        disabled={generando}
        onClick={generar}
      >
        {generando ? "Generando…" : "Generar festivos LFT del año"}
      </Button>
    </div>
  );
}
