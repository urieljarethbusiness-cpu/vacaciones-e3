import { exigirPermisoPagina } from "@/lib/perfil";
import { base } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ControlesFestivos } from "@/components/vacaciones/controles-festivos";

/** Días festivos — el calendario que alimenta el cálculo de días hábiles. */
export default async function PaginaFestivos() {
  await exigirPermisoPagina("gestion.festivos");
  const db = base();
  const festivos = db
    .prepare(
      `select fecha, nombre, oficial from dias_festivos
       where fecha >= ? order by fecha`
    )
    .all(`${new Date().getFullYear()}-01-01`) as unknown as {
    fecha: string;
    nombre: string;
    oficial: number;
  }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Días festivos</h1>
        <p className="text-muted-foreground">
          Días de descanso obligatorio. No cuentan como días hábiles en las
          vacaciones.
        </p>
      </div>

      <ControlesFestivos />

      <ul className="grid min-w-0 gap-3 lg:hidden">
        {festivos.map((f) => (
          <li
            key={f.fecha}
            className="flex min-w-0 items-start justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="font-medium break-words">{f.nombre}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{f.fecha}</p>
              <div className="mt-2">
                {f.oficial ? (
                  <Badge variant="secondary">Oficial (LFT)</Badge>
                ) : (
                  <Badge>E3</Badge>
                )}
              </div>
            </div>
            <div className="shrink-0">
              <ControlesFestivos fechaEliminar={f.fecha} />
            </div>
          </li>
        ))}
        {festivos.length === 0 && (
          <li className="rounded-lg border p-3 text-sm text-muted-foreground">
            No hay festivos registrados para este año.
          </li>
        )}
      </ul>

      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {festivos.map((f) => (
              <TableRow key={f.fecha}>
                <TableCell>{f.fecha}</TableCell>
                <TableCell className="font-medium">{f.nombre}</TableCell>
                <TableCell>
                  {f.oficial ? (
                    <Badge variant="secondary">Oficial (LFT)</Badge>
                  ) : (
                    <Badge>E3</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <ControlesFestivos fechaEliminar={f.fecha} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
