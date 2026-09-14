import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { base } from "@/lib/db";
import { perfilActual } from "@/server/sesiones";

/**
 * Descarga de comprobantes — el sustituto local de la URL firmada del bucket
 * `ausencias`. Valida sesión y permiso ANTES de leer el disco: solo ve el
 * archivo su dueño o quien tenga `gestion.vacaciones`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const perfil = await perfilActual();
  if (!perfil) {
    return NextResponse.json({ error: "No has iniciado sesión." }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Comprobante inválido." }, { status: 400 });
  }

  const db = base();
  const fila = db
    .prepare(
      `select a.ruta, a.nombre_archivo, a.mime, a.solicitud_id, s.empleado_id
       from ausencia_adjuntos a
       join solicitudes_vacaciones s on s.id = a.solicitud_id
       where a.id = ?`
    )
    .get(id) as
    | {
        ruta: string;
        nombre_archivo: string;
        mime: string | null;
        solicitud_id: string;
        empleado_id: string;
      }
    | undefined;

  if (!fila) {
    return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });
  }

  const puedeVer =
    fila.empleado_id === perfil.id ||
    perfil.permisos.includes("gestion.vacaciones");
  if (!puedeVer) {
    return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });
  }

  // La ruta registrada SIEMPRE cuelga de la carpeta de su solicitud.
  if (!fila.ruta.startsWith(`${fila.solicitud_id}/`)) {
    return NextResponse.json({ error: "Comprobante inválido." }, { status: 400 });
  }

  const absoluto = join(process.cwd(), "datos", "evidencia", fila.ruta);
  if (!existsSync(absoluto)) {
    return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });
  }

  const cuerpo = readFileSync(absoluto);
  return new NextResponse(new Uint8Array(cuerpo), {
    headers: {
      "Content-Type": fila.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(fila.nombre_archivo)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
