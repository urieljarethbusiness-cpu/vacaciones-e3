"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  ejecutarRecordatorioAhora,
  guardarAutomatizaciones,
} from "@/server/actions/automatizaciones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type AjustesVacaciones = {
  activo: boolean;
  horarios: string[];
  dias: number[];
  destinatarios_modo: "permiso" | "personalizado";
  destinatarios: string[];
};

export type AjustesVencimiento = {
  activo: boolean;
  horarios: string[];
  dias: number[];
  aviso_dias: number;
};

export type UsuarioInterno = {
  id: string;
  nombre: string;
  email: string;
  apruebaVacaciones: boolean;
};

const DIAS_SEMANA = [
  { valor: 1, etiqueta: "L", nombre: "lunes" },
  { valor: 2, etiqueta: "M", nombre: "martes" },
  { valor: 3, etiqueta: "X", nombre: "miércoles" },
  { valor: 4, etiqueta: "J", nombre: "jueves" },
  { valor: 5, etiqueta: "V", nombre: "viernes" },
  { valor: 6, etiqueta: "S", nombre: "sábado" },
  { valor: 7, etiqueta: "D", nombre: "domingo" },
];

/**
 * Recordatorios automáticos — mismos patrones de la pantalla del original
 * (interruptor por tarjeta, horarios múltiples, selector de días y
 * destinatarios automáticos o personalizados), para las dos automatizaciones
 * que aplican a este sistema: solicitudes pendientes y días por vencer.
 */
export function FormularioAutomatizaciones({
  inicial,
  usuarios,
}: {
  inicial: { vacaciones: AjustesVacaciones; vencimiento: AjustesVencimiento };
  usuarios: UsuarioInterno[];
}) {
  const router = useRouter();
  const [vac, setVac] = useState(inicial.vacaciones);
  const [ven, setVen] = useState(inicial.vencimiento);
  const [enviando, iniciar] = useTransition();

  const aprobadores = usuarios.filter((u) => u.apruebaVacaciones);

  function guardar() {
    iniciar(async () => {
      const r = await guardarAutomatizaciones({ vacaciones: vac, vencimiento: ven });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Automatizaciones guardadas");
      router.refresh();
    });
  }

  function enviarAhora(clave: "vacaciones" | "vencimiento") {
    iniciar(async () => {
      const r = await ejecutarRecordatorioAhora(clave);
      if (r.ok) {
        toast.success(r.detalle);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ---------- Solicitudes pendientes ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recordatorio de solicitudes pendientes
          </CardTitle>
          <CardDescription>
            Resumen de las solicitudes que esperan revisión, enviado al grupo
            encargado de aprobarlas. Solo se envía si hay pendientes.
          </CardDescription>
          <CardAction>
            <Interruptor
              activo={vac.activo}
              onChange={(activo) => setVac({ ...vac, activo })}
            />
          </CardAction>
        </CardHeader>
        <CardContent
          className={`space-y-5 ${vac.activo ? "" : "pointer-events-none opacity-50"}`}
        >
          <div className="grid gap-1.5">
            <Label>Horarios de envío</Label>
            <Horarios
              horarios={vac.horarios}
              onChange={(horarios) => setVac({ ...vac, horarios })}
            />
            <p className="text-xs text-muted-foreground">
              Hora de Ciudad de México.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Días de envío</Label>
            <SelectorDias
              valor={vac.dias}
              onChange={(dias) => setVac({ ...vac, dias })}
            />
          </div>

          <div className="grid gap-2">
            <Label>Destinatarios</Label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="destinatarios_modo"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={vac.destinatarios_modo === "permiso"}
                onChange={() =>
                  setVac({ ...vac, destinatarios_modo: "permiso" })
                }
              />
              <span>
                Todos los que pueden aprobar vacaciones{" "}
                <span className="text-muted-foreground">
                  (automático: hoy son{" "}
                  {aprobadores.map((a) => a.nombre).join(", ") || "ninguno"})
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="destinatarios_modo"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={vac.destinatarios_modo === "personalizado"}
                onChange={() =>
                  setVac({ ...vac, destinatarios_modo: "personalizado" })
                }
              />
              <span>Solo usuarios específicos</span>
            </label>
            {vac.destinatarios_modo === "personalizado" && (
              <ListaUsuarios
                usuarios={usuarios}
                seleccion={vac.destinatarios}
                onChange={(destinatarios) => setVac({ ...vac, destinatarios })}
              />
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => enviarAhora("vacaciones")}
            disabled={enviando}
          >
            <Send aria-hidden /> Enviar ahora
          </Button>
        </CardContent>
      </Card>

      {/* ---------- Días por vencer ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recordatorio de días por vencer
          </CardTitle>
          <CardDescription>
            Avisa a cada persona que todavía tiene días sin usar cuando su año
            de vacaciones está por reiniciarse, para que no los pierda.
          </CardDescription>
          <CardAction>
            <Interruptor
              activo={ven.activo}
              onChange={(activo) => setVen({ ...ven, activo })}
            />
          </CardAction>
        </CardHeader>
        <CardContent
          className={`space-y-5 ${ven.activo ? "" : "pointer-events-none opacity-50"}`}
        >
          <div className="grid gap-1.5">
            <Label>Horarios de envío</Label>
            <Horarios
              horarios={ven.horarios}
              onChange={(horarios) => setVen({ ...ven, horarios })}
            />
            <p className="text-xs text-muted-foreground">
              Hora de Ciudad de México.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Días de envío</Label>
            <SelectorDias
              valor={ven.dias}
              onChange={(dias) => setVen({ ...ven, dias })}
            />
          </div>

          <div className="grid max-w-xs gap-1.5">
            <Label htmlFor="aviso-dias">Avisar cuando falten (días)</Label>
            <Input
              id="aviso-dias"
              type="number"
              min={0}
              max={365}
              required
              value={ven.aviso_dias}
              onChange={(e) =>
                setVen({ ...ven, aviso_dias: Number(e.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Se avisa a quien le quedan días y su ciclo se reinicia dentro de
              este margen. 0 avisa solo el día del reinicio.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => enviarAhora("vencimiento")}
            disabled={enviando}
          >
            <Send aria-hidden /> Enviar ahora
          </Button>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <Button onClick={guardar} disabled={enviando} className="w-full sm:w-auto">
          {enviando ? "Guardando…" : "Guardar automatizaciones"}
        </Button>
      </div>
    </div>
  );
}

function Horarios({
  horarios,
  onChange,
}: {
  horarios: string[];
  onChange: (h: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {horarios.map((h, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            type="time"
            required
            value={h}
            onChange={(e) => {
              const siguientes = [...horarios];
              siguientes[i] = e.target.value;
              onChange(siguientes);
            }}
            className="w-28"
          />
          {horarios.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Quitar horario"
              onClick={() =>
                onChange(horarios.filter((_, j) => j !== i))
              }
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {horarios.length < 6 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...horarios, "12:00"])}
        >
          <Plus className="size-4" /> Agregar horario
        </Button>
      )}
    </div>
  );
}

function Interruptor({
  activo,
  onChange,
}: {
  activo: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={activo ? "Desactivar automatización" : "Activar automatización"}
      onClick={() => onChange(!activo)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
        activo ? "bg-primary border-primary" : "bg-muted border-border"
      }`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-background shadow transition-transform ${
          activo ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function SelectorDias({
  valor,
  onChange,
}: {
  valor: number[];
  onChange: (dias: number[]) => void;
}) {
  function alternar(dia: number) {
    onChange(
      valor.includes(dia)
        ? valor.filter((d) => d !== dia)
        : [...valor, dia].sort((a, b) => a - b)
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {DIAS_SEMANA.map((d) => {
        const activo = valor.includes(d.valor);
        return (
          <button
            key={d.valor}
            type="button"
            aria-pressed={activo}
            aria-label={d.nombre}
            title={d.nombre}
            onClick={() => alternar(d.valor)}
            className={`size-11 shrink-0 rounded-full border text-sm font-medium transition-colors solo-raton:size-9 ${
              activo
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
            }`}
          >
            {d.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

function ListaUsuarios({
  usuarios,
  seleccion,
  onChange,
}: {
  usuarios: UsuarioInterno[];
  seleccion: string[];
  onChange: (ids: string[]) => void;
}) {
  function alternar(id: string, marcado: boolean) {
    onChange(marcado ? [...seleccion, id] : seleccion.filter((s) => s !== id));
  }
  return (
    <div className="grid min-w-0 gap-x-8 gap-y-1 rounded-md border p-3 sm:grid-cols-2">
      {usuarios.map((u) => (
        <label
          key={u.id}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
        >
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-primary"
            checked={seleccion.includes(u.id)}
            onChange={(e) => alternar(u.id, e.target.checked)}
          />
          <span className="truncate">{u.nombre}</span>
          {u.apruebaVacaciones && (
            <Badge variant="outline" className="shrink-0 text-[10px] whitespace-normal">
              aprueba vacaciones
            </Badge>
          )}
        </label>
      ))}
      {usuarios.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay usuarios internos activos.
        </p>
      )}
    </div>
  );
}
