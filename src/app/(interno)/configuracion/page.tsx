import { redirect } from "next/navigation";

/** La sección abre siempre en General. */
export default function IndiceConfiguracion() {
  redirect("/configuracion/general");
}
