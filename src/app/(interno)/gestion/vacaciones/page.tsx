import Link from "next/link";
import { exigirPermisoPagina } from "@/lib/perfil";
import { base } from "@/lib/db";
import {
  ajusteEntero,
  adjuntosDeSolicitudes,
  empleadosAsignables,
  listarSolicitudes,
  politicasTodas,
  saldosEquipo,
} from "@/lib/db/consultas";
import {
  estiloTipo,
  etiquetaTipo,
  formatearRango,
  type AdjuntoAusencia,
  type Ausencia,
  type PoliticaAusencia,
} from "@/lib/ausencias";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BotonEvidencia,
  DialogoEditarSolicitud,
} from "@/components/vacaciones/dialogo-editar-solicitud";
import { DialogoRegistrarAusencia } from "@/components/vacaciones/dialogo-registrar-ausencia";
import { SelectorEstado } from "@/components/vacaciones/selector-estado";
import { FiltrosAusencias } from "@/components/vacaciones/filtros-ausencias";
import {
  TablaSaldosEquipo,
  type FilaSaldo,
} from "@/components/vacaciones/tabla-saldos-equipo";

/** Un solo valor de `searchParams` (nunca el array de valores repetidos). */
function uno(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v && v.trim() !== "" ? v : null;
}

/**
 * «Ausencias del equipo» — la vista del GESTOR (RR. HH., admin, superadmin).
 * Misma estructura que el original: pestañas Solicitudes / Saldos del equipo
 * con estado en la URL, filtros, tabla con revisión y alta a nombre de otro.
 */
export default async function PaginaGestionVacaciones({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  await exigirPermisoPagina("gestion.vacaciones");
  const params = await searchParams;

  const pestana = uno(params.tab) === "saldos" ? "saldos" : "solicitudes";
  const fTipo = uno(params.tipo);
  const fEstado = uno(params.estado);
  const fEmpleado = uno(params.empleado);
  const fDesde = uno(params.desde);
  const fHasta = uno(params.hasta);

  const db = base();
  const solicitudes = listarSolicitudes(db, {
    id: "",
    permisos: ["gestion.vacaciones"],
  });
  const politicas = politicasTodas(db);
  const politicasActivas = politicas.filter((p) => p.activo);
  const empleados = empleadosAsignables(db).filter((e) => e.tiene_vacaciones);

  const adjuntos = adjuntosDeSolicitudes(
    db,
    solicitudes.map((s) => s.id)
  ) as AdjuntoAusencia[];

  const adjuntosPorSolicitud = new Map<string, AdjuntoAusencia[]>();
  for (const a of adjuntos) {
    const lista = adjuntosPorSolicitud.get(a.solicitud_id) ?? [];
    lista.push(a);
    adjuntosPorSolicitud.set(a.solicitud_id, lista);
  }

  // El rango filtra por SOLAPE con la ausencia, no por su fecha de inicio.
  const filtradas = solicitudes.filter(
    (s) =>
      (!fTipo || s.tipo === fTipo) &&
      (!fEstado || s.estado === fEstado) &&
      (!fEmpleado || s.empleado_id === fEmpleado) &&
      (!fDesde || s.fecha_fin >= fDesde) &&
      (!fHasta || s.fecha_inicio <= fHasta)
  );

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").length;

  let saldos: FilaSaldo[] = [];
  let umbralNaranja = ajusteEntero(db, "semaforo_naranja", 30);
  let umbralRojo = ajusteEntero(db, "semaforo_rojo", 15);
  if (pestana === "saldos") {
    saldos = saldosEquipo(db) as unknown as FilaSaldo[];
  }

  const opcionesTipo = politicasActivas.map((p) => ({
    tipo: p.tipo,
    etiqueta: p.etiqueta,
    requiere_evidencia: p.requiere_evidencia,
  }));

  const tiposConDatos = new Set(solicitudes.map((s) => s.tipo));
  const opcionesFiltroTipo = politicas
    .filter((p) => p.activo || tiposConDatos.has(p.tipo))
    .map((p) => ({
      tipo: p.tipo,
      etiqueta: p.activo ? p.etiqueta : `${p.etiqueta} (retirado)`,
    }));

  const otrosParams = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    const v = uno(valor);
    if (v && clave !== "tab") otrosParams.set(clave, v);
  }
  const href = (tab: string) => {
    const sp = new URLSearchParams(otrosParams);
    sp.set("tab", tab);
    return `/gestion/vacaciones?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Ausencias del equipo</h1>
          <p className="text-muted-foreground">
            {pendientes === 0
              ? "Sin ausencias pendientes de revisión"
              : `${pendientes} ${pendientes === 1 ? "ausencia pendiente" : "ausencias pendientes"} de revisión`}
          </p>
        </div>
        <DialogoRegistrarAusencia
          empleados={empleados}
          politicas={politicasActivas}
        />
      </div>

      <Tabs value={pestana}>
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="solicitudes" asChild>
            <Link href={href("solicitudes")}>Solicitudes</Link>
          </TabsTrigger>
          <TabsTrigger value="saldos" asChild>
            <Link href={href("saldos")}>Saldos del equipo</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="solicitudes" className="min-w-0 space-y-4">
          <FiltrosAusencias
            tipos={opcionesFiltroTipo}
            empleados={empleados}
            tipo={fTipo}
            estado={fEstado}
            empleado={fEmpleado}
            desde={fDesde}
            hasta={fHasta}
          />

          {filtradas.length === 0 ? (
            <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              {solicitudes.length === 0
                ? "Sin ausencias registradas."
                : "Ninguna ausencia coincide con los filtros."}
            </p>
          ) : (
            <>
              <ul className="grid gap-3 lg:hidden">
                {filtradas.map((s) => (
                  <li key={s.id} className="rounded-lg border p-3">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {s.empleado_nombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatearRango(s.fecha_inicio, s.fecha_fin)} ·{" "}
                          {s.dias_habiles}{" "}
                          {s.dias_habiles === 1 ? "día hábil" : "días hábiles"}
                        </p>
                      </div>
                      <SelectorEstado
                        solicitudId={s.id}
                        estado={s.estado}
                        fechaInicio={s.fecha_inicio}
                        fechaFin={s.fecha_fin}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <EtiquetaTipo ausencia={s} />
                      <span className="text-xs text-muted-foreground">
                        Registrada por{" "}
                        {s.registrada_por_gestor ? "RR. HH." : "el empleado"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <SelectorEstado
                        solicitudId={s.id}
                        estado={s.estado}
                        fechaInicio={s.fecha_inicio}
                        fechaFin={s.fecha_fin}
                      />
                      <BotonEvidencia
                        adjuntos={adjuntosPorSolicitud.get(s.id) ?? []}
                      />
                      <DialogoEditarSolicitud
                        solicitud={s}
                        politicas={opcionesTipo}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden min-w-0 lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fechas</TableHead>
                      <TableHead className="text-right">Días</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Evidencia</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="max-w-48 truncate font-medium">
                          {s.empleado_nombre}
                        </TableCell>
                        <TableCell>
                          <EtiquetaTipo ausencia={s} />
                        </TableCell>
                        <TableCell>
                          {formatearRango(s.fecha_inicio, s.fecha_fin)}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.dias_habiles}
                        </TableCell>
                        <TableCell>
                          <SelectorEstado
                            solicitudId={s.id}
                            estado={s.estado}
                            fechaInicio={s.fecha_inicio}
                            fechaFin={s.fecha_fin}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.registrada_por_gestor ? "RR. HH." : "Empleado"}
                        </TableCell>
                        <TableCell
                          className="max-w-52 truncate text-muted-foreground"
                          title={s.motivo ?? s.comentario_empleado ?? undefined}
                        >
                          {s.motivo || s.comentario_empleado || "—"}
                        </TableCell>
                        <TableCell>
                          <BotonEvidencia
                            adjuntos={adjuntosPorSolicitud.get(s.id) ?? []}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <DialogoEditarSolicitud
                            solicitud={s}
                            politicas={opcionesTipo}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="saldos" className="min-w-0 space-y-4">
          <p className="text-sm text-muted-foreground">
            Saldo LFT del ciclo vigente de cada persona y días consumidos en
            otros permisos durante el año en curso.
          </p>
          <TablaSaldosEquipo
            saldos={saldos}
            umbralNaranja={umbralNaranja}
            umbralRojo={umbralRojo}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EtiquetaTipo({ ausencia }: { ausencia: Ausencia }) {
  return (
    <span
      className="inline-block rounded-full border px-2 py-0.5 text-xs font-medium"
      style={estiloTipo(ausencia.tipo_color)}
    >
      {etiquetaTipo(ausencia.tipo, ausencia.tipo_etiqueta)}
    </span>
  );
}
