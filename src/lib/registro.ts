/**
 * Lo que comparten las dos altas por autoservicio (empleado y cliente).
 *
 * Este archivo NO lleva `server-only`: lo importan también los formularios,
 * que son componentes cliente y necesitan avisar del dominio equivocado o de
 * la contraseña corta ANTES de enviar, no después. Por eso aquí no hay ni una
 * decisión: solo formas y medidas. Quien decide es Postgres (migración 0084).
 *
 * LO QUE NO ESTÁ AQUÍ, Y POR QUÉ. La lista de dominios de la casa. Vive en
 * `public.dominios_empleado` y viaja a la pantalla como prop, porque escrita
 * también aquí serían dos listas y llegaría el día en que se añade un dominio
 * en una y no en la otra: la pantalla aceptaría un correo que la base rechaza
 * y nadie sabría por qué.
 */

/**
 * Cuánto vive un enlace de activación.
 *
 * Siete días, los mismos que una invitación. No es una constante espejo de la
 * base por casualidad: `registrar_empleado` y `nueva_activacion` reciben los
 * días como parámetro precisamente para que este número esté en UN sitio y el
 * correo pueda decirlo («caduca en 7 días») sin arriesgarse a mentir.
 */
export const DIAS_VIGENCIA_ACTIVACION = 7;

/**
 * El suelo de la contraseña, el mismo que ya usan la invitación y el
 * restablecimiento (`aceptarInvitacion`, `restablecerContrasena`).
 *
 * No se sube aquí y solo aquí: tres pantallas distintas piden una contraseña y
 * subir el mínimo en una dejaría a las otras dos aceptando lo que esta
 * rechaza, o —peor— dejaría a alguien con una contraseña que su propia
 * pantalla de cambio considera inválida.
 */
export const MIN_CONTRASENA = 8;

/**
 * El chat ID que devuelve /start: SOLO dígitos.
 *
 * Espejo del `check` telegram_id_formato de la migración 0042. Está aquí y no
 * en `empleados.ts` porque ahora lo usan dos formularios: el de gestión y el
 * del propio empleado estrenando su vinculación.
 */
export const RE_TELEGRAM = /^[0-9]{5,32}$/;

/** El dominio de un correo, en minúsculas y sin la arroba. Cadena vacía si no lo tiene. */
export function dominioDeCorreo(correo: string): string {
  const limpio = correo.trim().toLowerCase();
  const arroba = limpio.lastIndexOf("@");
  return arroba === -1 ? "" : limpio.slice(arroba + 1);
}

/**
 * ¿Es un correo de la casa? `dominios` es la lista ACTIVA que llega de la
 * base; una lista vacía responde `false` para todo, que es lo correcto: sin
 * dominios configurados el alta interna está cerrada, no abierta.
 */
export function esCorreoDeLaCasa(correo: string, dominios: string[]): boolean {
  const dominio = dominioDeCorreo(correo);
  return dominio !== "" && dominios.includes(dominio);
}

/**
 * Cómo se le enseña la lista de dominios a una persona: «@grupo-e3.com o
 * @consultoriae3.com». Con la arroba delante, porque sin ella la gente escribe
 * el dominio en el campo del correo.
 */
export function listaDominios(dominios: string[]): string {
  const conArroba = dominios.map((d) => `@${d}`);
  if (conArroba.length === 0) return "";
  if (conArroba.length === 1) return conArroba[0];
  return `${conArroba.slice(0, -1).join(", ")} o ${conArroba[conArroba.length - 1]}`;
}

/**
 * Los motivos con los que `/activar` explica qué pasó.
 *
 * Son un tipo y no cadenas sueltas porque los escriben TRES sitios —el
 * manejador del enlace, el proxy y la propia pantalla— y un motivo con un
 * dedazo no da error: da la pantalla genérica, que es la que no ayuda a nadie.
 */
export const MOTIVOS_ACTIVACION = [
  /** El enlace ya se usó, o la cuenta se aprobó a mano: ya puede entrar. */
  "activa",
  /** El enlace caducó. Se le ofrece pedir otro. */
  "caducada",
  /** El enlace no existe (mal copiado, o de una cuenta ya borrada). */
  "invalida",
  /** Tiene contraseña correcta pero la cuenta sigue apagada: le falta el enlace. */
  "pendiente",
  /** Se activó, pero no se pudo abrir la sesión sola. Que entre a mano. */
  "entra",
] as const;

export type MotivoActivacion = (typeof MOTIVOS_ACTIVACION)[number];

export function esMotivoActivacion(valor: string): valor is MotivoActivacion {
  return (MOTIVOS_ACTIVACION as readonly string[]).includes(valor);
}
