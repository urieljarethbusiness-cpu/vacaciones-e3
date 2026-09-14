import Link from "next/link";
import { consultarInvitacion } from "@/server/consultas-invitacion";
import { FormularioAceptarInvitacion } from "@/components/auth/formulario-aceptar-invitacion";
import {
  BLOQUE,
  COLUMNA,
  ENLACE,
  ENTRADILLA,
  TITULO,
} from "@/components/auth/estilos-acceso";

export default async function PaginaInvitacion({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitacion = consultarInvitacion(token);

  return (
    <main className={COLUMNA}>
      <div className={BLOQUE}>
        {invitacion.estado === "valida" ? (
          <>
            <h1 className={TITULO}>Te damos la bienvenida a Plataforma E3</h1>
            <p className={ENTRADILLA}>
              Hola {invitacion.nombre}. Define una contraseña para activar tu
              cuenta y entrar a trabajar con Consultoría E3.
            </p>
            <p className="mt-2 text-[0.9375rem]/[1.5] break-words text-white/[0.72]">
              {invitacion.email}
            </p>

            <FormularioAceptarInvitacion token={token} />
          </>
        ) : (
          <>
            <h1 className={TITULO}>Invitación no válida</h1>
            <p className={ENTRADILLA}>
              {invitacion.motivo} Pide a tu contacto en Consultoría E3 que
              genere una nueva.
            </p>
            <div className="mt-7 flex justify-center">
              <Link href="/login" tabIndex={0} className={ENLACE}>
                Ir al inicio de sesión
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
