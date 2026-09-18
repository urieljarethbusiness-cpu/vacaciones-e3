import { FormularioAcceso } from "@/components/auth/formulario-acceso";
import { AccesoRapidoDemo, type CuentaDemo } from "@/components/auth/acceso-rapido-demo";
import { modoDemoActivo } from "@/server/actions/acceso";
import { BLOQUE, COLUMNA } from "@/components/auth/estilos-acceso";

const CUENTAS: CuentaDemo[] = [
  {
    email: "superadmin@consultoriae3.com",
    nombre: "Uriel Jareth",
    descripcion: "Superadministrador · toda la configuración",
  },
  {
    email: "rrhh@grupo-e3.com",
    nombre: "Karla Montenegro",
    descripcion: "RR. HH. · aprueba y registra ausencias",
  },
  {
    email: "encargado@grupo-e3.com",
    nombre: "Diego Fuentes",
    descripcion: "Encargado de Área · Diseño",
  },
  {
    email: "ana@consultoriae3.com",
    nombre: "Ana Lozano",
    descripcion: "Empleado · con solicitudes y saldo usado",
  },
  {
    email: "fernanda@consultoriae3.com",
    nombre: "Fernanda Salas",
    descripcion: "Empleado · ciclo por reiniciar (aviso rojo)",
  },
  {
    email: "luis@grupo-e3.com",
    nombre: "Luis Ramírez",
    descripcion: "Empleado · primer año, aún sin días",
  },
];

/** La puerta del equipo, con magic login cuando corre en modo demo. */
export default async function PaginaLogin() {
  const demo = await modoDemoActivo();

  return (
    <main className={COLUMNA}>
      <div className={BLOQUE}>
        <FormularioAcceso />
        {demo && <AccesoRapidoDemo cuentas={CUENTAS} />}
      </div>
    </main>
  );
}
