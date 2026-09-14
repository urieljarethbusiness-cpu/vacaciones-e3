import { FormularioAcceso } from "@/components/auth/formulario-acceso";
import { BLOQUE, COLUMNA } from "@/components/auth/estilos-acceso";

/**
 * La puerta del equipo. Es pública por proxy (`RUTAS_PUBLICAS` compara por
 * segmento) y la plataforma reparte por ROL una vez dentro.
 */
export default function PaginaLogin() {
  return (
    <main className={COLUMNA}>
      <div className={BLOQUE}>
        <FormularioAcceso />
      </div>
    </main>
  );
}
