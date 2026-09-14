/**
 * Contrato de datos y catálogo del módulo de ausencias.
 *
 * Espejo en TypeScript del modelo que definen las migraciones 0027, 0030 y
 * 0031: enum `tipo_ausencia`, tabla `politica_ausencias`, columnas nuevas de
 * `solicitudes_vacaciones`, tabla `ausencia_adjuntos` y las RPC
 * `listar_solicitudes_vacaciones`, `saldos_equipo` y `resumen_ausencias`.
 *
 * Sin `server-only` a propósito: lo consumen tanto las páginas y server
 * actions como los componentes cliente. Todo lo que hay aquí es puro (sin
 * acceso a red ni a la sesión), así que es seguro en ambos lados.
 *
 * La ETIQUETA y el COLOR de cada tipo son configurables desde
 * `politica_ausencias` (un admin los edita sin migración). Los mapas de este
 * archivo son solo el respaldo para cuando no se cargó la política; siempre
 * que tengas la fila de `politica_ausencias` a mano, prefiere sus valores.
 */

// ---------------------------------------------------------------------------
// Tipos de ausencia
// ---------------------------------------------------------------------------

/**
 * Valores del enum `public.tipo_ausencia`, en el orden de la semilla.
 *
 * LA LISTA NO SE RECORTA CUANDO UN TIPO SE RETIRA. La 0064 desactivó
 * `permiso_personal`, `permiso_sin_goce` y `home_office`, y siguen aquí por
 * dos motivos: Postgres no sabe quitar un valor de un enum, y las ausencias ya
 * registradas con esos tipos tienen que poder leerse, editarse y cancelarse.
 * Quién es elegible lo dice `politica_ausencias.activo`, que se consulta en
 * vivo; esta lista solo describe lo que la columna puede contener.
 */
export const TIPOS_AUSENCIA = [
  "vacaciones",
  "permiso_salud",
  "permiso_personal",
  "permiso_sin_goce",
  "maternidad_paternidad",
  "duelo",
  "home_office",
] as const;

export type TipoAusencia = (typeof TIPOS_AUSENCIA)[number];

/** Valores del enum `public.estado_solicitud`. */
export const ESTADOS_AUSENCIA = [
  "pendiente",
  "aprobada",
  "rechazada",
  "cancelada",
] as const;

export type EstadoAusencia = (typeof ESTADOS_AUSENCIA)[number];

/** Estados que un gestor puede fijar al registrar una ausencia a nombre de otro. */
export const ESTADOS_ALTA_GESTOR = ["pendiente", "aprobada"] as const;

export type EstadoAltaGestor = (typeof ESTADOS_ALTA_GESTOR)[number];

// ---------------------------------------------------------------------------
// Política por tipo
// ---------------------------------------------------------------------------

/** Fila de `public.politica_ausencias`: la única fuente de verdad de las reglas. */
export type PoliticaAusencia = {
  tipo: TipoAusencia;
  etiqueta: string;
  descripcion: string | null;
  /** ¿Resta del saldo LFT del ciclo de vacaciones? */
  descuenta_vacaciones: boolean;
  /** ¿Obliga a adjuntar comprobante? */
  requiere_evidencia: boolean;
  /** ¿Permite `fecha_inicio` anterior a hoy? */
  permite_retroactivo: boolean;
  /** ¿Exige un año cumplido desde `fecha_ingreso`? */
  exige_antiguedad: boolean;
  /** ¿Aplica el ajuste `anticipacion_minima_dias`? */
  aplica_anticipacion: boolean;
  /** ¿Solo quien tiene `gestion.vacaciones` puede registrarlo? */
  solo_gestor: boolean;
  /** ¿La persona está fuera del trabajo mientras dura? (falso en trabajo remoto) */
  ausente_del_trabajo: boolean;
  /** ¿El nombre del tipo revela información reservada (salud, duelo, maternidad)? */
  motivo_sensible: boolean;
  color: string;
  orden: number;
  activo: boolean;
};

/** Columnas de `politica_ausencias` que consume la app. */
export const SELECT_POLITICA_AUSENCIA =
  "tipo, etiqueta, descripcion, descuenta_vacaciones, requiere_evidencia, " +
  "permite_retroactivo, exige_antiguedad, aplica_anticipacion, solo_gestor, " +
  "ausente_del_trabajo, motivo_sensible, color, orden, activo";

// ---------------------------------------------------------------------------
// Filas de las RPC
// ---------------------------------------------------------------------------

/** Fila de `public.listar_solicitudes_vacaciones()`. */
export type Ausencia = {
  id: string;
  empleado_id: string;
  empleado_nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_habiles: number;
  estado: EstadoAusencia;
  comentario_empleado: string | null;
  comentario_manager: string | null;
  created_at: string;
  tipo: TipoAusencia;
  /** Etiqueta viva de `politica_ausencias`; null si el tipo perdió su fila. */
  tipo_etiqueta: string | null;
  tipo_color: string | null;
  motivo: string | null;
  /** true si la registró RR. HH. a nombre de esta persona. */
  registrada_por_gestor: boolean;
  tiene_adjuntos: boolean;
  empleado_email: string | null;
};

/**
 * Una ausencia pendiente tal como la enseña el bloque del Panel.
 *
 * Es un SUBCONJUNTO de `Ausencia`, no un tipo paralelo: la RPC
 * `ausencias_pendientes_panel` (0066) sale de `listar_solicitudes_vacaciones`
 * y deja fuera dos cosas a propósito. `estado` sobra —todas son pendientes— y
 * el MOTIVO no viaja: hay tipos marcados como `motivo_sensible` (salud,
 * duelo, maternidad) y el Panel se abre delante de quien pase por detrás. El
 * detalle está a un clic, en «Ausencias del equipo».
 */
export type AusenciaPendientePanel = {
  id: string;
  empleado_id: string;
  empleado_nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_habiles: number;
  tipo: TipoAusencia;
  tipo_etiqueta: string | null;
  tipo_color: string | null;
  created_at: string;
};

/**
 * Lo que devuelve `public.ausencias_pendientes_panel(p_limite)`.
 *
 * `total` y `items` no son redundantes: los items vienen recortados y el total
 * es el número real de pendientes, que es el que tiene que coincidir con el
 * encabezado de /gestion/vacaciones.
 */
export type PanelAusenciasPendientes = {
  total: number;
  items: AusenciaPendientePanel[];
};

/** Cuántas ausencias pendientes se enseñan en el Panel antes de remitir a la lista. */
export const MUESTRA_AUSENCIAS_PANEL = 5;

/** Fila de `public.saldos_equipo(p_anio)`. */
export type SaldoEquipo = {
  empleado_id: string;
  nombre_completo: string;
  email: string;
  puesto: string | null;
  area: string | null;
  fecha_ingreso: string;
  anios: number;
  ciclo_inicio: string;
  ciclo_fin: string;
  dias_correspondientes: number;
  dias_usados: number;
  dias_restantes: number;
  dias_para_expirar: number;
  /** Solicitudes pendientes de resolver del año consultado. */
  pendientes: number;
  /** Días aprobados de `permiso_salud` en el año. */
  dias_salud: number;
  /** Días aprobados del resto de permisos que sacan del trabajo (sin salud). */
  dias_otros: number;
};

/** Fila de `public.resumen_ausencias(p_empleado, p_anio)`. */
export type ResumenAusencia = {
  tipo: TipoAusencia;
  etiqueta: string;
  color: string;
  descuenta_vacaciones: boolean;
  dias_aprobados: number;
  dias_pendientes: number;
  solicitudes: number;
};

/**
 * Fila de `public.ausencia_adjuntos` tal como la ve la UI.
 *
 * `ruta` se omite a propósito: nunca viaja al cliente. Para descargar se
 * llama a `descargarEvidencia(id)`, que devuelve una URL firmada de 60 s.
 */
export type AdjuntoAusencia = {
  id: string;
  solicitud_id: string;
  nombre_archivo: string;
  mime: string | null;
  tamano: number | null;
  created_at: string;
};

/** Columnas de `ausencia_adjuntos` seguras de mandar al cliente. */
export const SELECT_ADJUNTO_AUSENCIA =
  "id, solicitud_id, nombre_archivo, mime, tamano, created_at";

// ---------------------------------------------------------------------------
// Evidencia adjunta: límites compartidos por la UI y la server action
// ---------------------------------------------------------------------------

/**
 * Tope de cuerpo de una Server Action. **Espejo de
 * `experimental.serverActions.bodySizeLimit` en `next.config.ts`**: si
 * cambia allí, cambia aquí.
 *
 * Importa porque Next corta la petición ANTES de invocar la acción y
 * responde un 413 crudo: si el formulario manda más que esto, el contrato
 * `{ok:false, error}` no llega a existir y el usuario no ve ningún mensaje
 * en español. Por eso los límites de evidencia se dimensionan por debajo.
 */
export const LIMITE_CUERPO_ACCION_BYTES = 26 * 1024 * 1024;

/** Límite por archivo. Coincide con `file_size_limit` del bucket `ausencias`. */
export const LIMITE_EVIDENCIA_BYTES = 10 * 1024 * 1024;

export const MAX_ARCHIVOS_EVIDENCIA = 5;

/**
 * Tope de la SUMA de los comprobantes de una misma solicitud.
 *
 * No es redundante con el límite por archivo: 5 × 10 MB son 50 MB, muy por
 * encima de lo que Next deja pasar. Se reservan ~2 MB para el resto del
 * formulario y el sobrecoste del multipart, de modo que cualquier lote que
 * la UI acepte quepa de verdad en la petición y el rechazo llegue como
 * mensaje en español, no como un 413 del framework.
 */
export const LIMITE_TOTAL_EVIDENCIA_BYTES = 24 * 1024 * 1024;

export const MIMES_EVIDENCIA = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

/** Valor del atributo `accept` del input de archivos. */
export const ACEPTA_EVIDENCIA = MIMES_EVIDENCIA.join(",");

/**
 * Mensaje exacto que devuelve la server action cuando falta el comprobante.
 * Es el mismo texto del trigger `app.exigir_evidencia_ausencia` (migración
 * 0027), para que el usuario lea lo mismo venga de donde venga el rechazo.
 */
export const MENSAJE_EVIDENCIA_REQUERIDA =
  "Este tipo de ausencia requiere que adjuntes un comprobante.";

/** Lo mínimo que necesitamos de un archivo; sirve para `File` en cliente y servidor. */
type ArchivoEvidencia = { name: string; size: number; type: string };

/**
 * Valida el lote de comprobantes. Devuelve el mensaje de error o null.
 *
 * La usan la server action y el formulario, para que el usuario vea el fallo
 * antes de mandar los archivos por la red y para que el servidor no confíe
 * en que el formulario lo hizo.
 *
 * OJO con el MIME: `type` es lo que **declara el cliente**, no lo que el
 * archivo es. Aquí no se hace sniffing de contenido, así que esta lista
 * filtra descuidos, no ataques; lo que sí es un hecho comprobable es el
 * tamaño. El riesgo queda acotado porque la lista no admite `text/html` ni
 * `image/svg+xml` (los formatos que ejecutarían algo al abrirse) y porque el
 * bucket es privado y se sirve con URL firmada de 60 s, nunca en línea desde
 * el dominio de la app.
 */
export function errorDeEvidencia(archivos: ArchivoEvidencia[]): string | null {
  if (archivos.length > MAX_ARCHIVOS_EVIDENCIA) {
    return `Puedes adjuntar como máximo ${MAX_ARCHIVOS_EVIDENCIA} comprobantes.`;
  }
  let total = 0;
  for (const archivo of archivos) {
    if (archivo.size === 0) {
      return `"${archivo.name}" está vacío. Vuelve a adjuntarlo.`;
    }
    if (archivo.size > LIMITE_EVIDENCIA_BYTES) {
      return `"${archivo.name}" supera el límite de 10 MB.`;
    }
    if (!(MIMES_EVIDENCIA as readonly string[]).includes(archivo.type)) {
      return `"${archivo.name}" no es un formato admitido. Adjunta una imagen (JPG, PNG, WEBP o HEIC) o un PDF.`;
    }
    total += archivo.size;
  }
  if (total > LIMITE_TOTAL_EVIDENCIA_BYTES) {
    return `Los comprobantes suman ${formatearTamano(total)} y el máximo por solicitud es ${formatearTamano(
      LIMITE_TOTAL_EVIDENCIA_BYTES
    )}. Quita alguno o mándalos en dos solicitudes.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Contrato del FormData de las acciones de alta
// ---------------------------------------------------------------------------

/**
 * Nombres EXACTOS de los campos que leen `solicitarAusencia` y
 * `registrarAusenciaDeEmpleado`.
 *
 * Están aquí, y no solo en el cuerpo de la acción, porque un formulario que
 * escriba mal una clave no recibe «falta el campo X»: recibe el error de
 * validación genérico, que es mucho más difícil de diagnosticar. Usa
 * `construirFormDataAusencia` y no tendrás que teclearlos.
 */
export const CAMPOS_AUSENCIA = {
  tipo: "tipo",
  fechaInicio: "fecha_inicio",
  fechaFin: "fecha_fin",
  comentario: "comentario",
  motivo: "motivo",
  /** Se repite una vez por archivo; no es un array serializado. */
  evidencia: "evidencia",
  /** Solo lo lee `registrarAusenciaDeEmpleado`. */
  empleadoId: "empleado_id",
  /** Solo lo lee `registrarAusenciaDeEmpleado`; por defecto `aprobada`. */
  estado: "estado",
} as const;

/** Datos de alta de una ausencia, tal como los junta un formulario. */
export type EntradaAusencia = {
  tipo: TipoAusencia;
  fecha_inicio: string;
  fecha_fin: string;
  comentario?: string;
  motivo?: string;
  evidencia?: File[];
  /** Solo para el alta por RR. HH. */
  empleado_id?: string;
  /** Solo para el alta por RR. HH. Por defecto `aprobada`. */
  estado?: EstadoAltaGestor;
};

/**
 * Arma el `FormData` que esperan `solicitarAusencia` y
 * `registrarAusenciaDeEmpleado`.
 *
 * Es la forma recomendada de llamarlas: centraliza los nombres de campo, no
 * manda las claves vacías (la acción trata "" como ausente) y repite
 * `evidencia` una vez por archivo, que es como se leen con `getAll`.
 */
export function construirFormDataAusencia(entrada: EntradaAusencia): FormData {
  const datos = new FormData();
  datos.set(CAMPOS_AUSENCIA.tipo, entrada.tipo);
  datos.set(CAMPOS_AUSENCIA.fechaInicio, entrada.fecha_inicio);
  datos.set(CAMPOS_AUSENCIA.fechaFin, entrada.fecha_fin);
  if (entrada.comentario) datos.set(CAMPOS_AUSENCIA.comentario, entrada.comentario);
  if (entrada.motivo) datos.set(CAMPOS_AUSENCIA.motivo, entrada.motivo);
  if (entrada.empleado_id) datos.set(CAMPOS_AUSENCIA.empleadoId, entrada.empleado_id);
  if (entrada.estado) datos.set(CAMPOS_AUSENCIA.estado, entrada.estado);
  for (const archivo of entrada.evidencia ?? []) {
    datos.append(CAMPOS_AUSENCIA.evidencia, archivo);
  }
  return datos;
}

// ---------------------------------------------------------------------------
// Etiquetas y color
// ---------------------------------------------------------------------------

/**
 * Respaldo de etiquetas cuando no se cargó `politica_ausencias`.
 *
 * Incluye los tres tipos retirados en la 0064: una ausencia histórica sin
 * etiqueta se pintaría con la clave cruda (`permiso_sin_goce`).
 */
export const ETIQUETA_TIPO_AUSENCIA: Record<TipoAusencia, string> = {
  vacaciones: "Vacaciones",
  permiso_salud: "Permiso por salud",
  permiso_personal: "Permiso personal",
  permiso_sin_goce: "Permiso sin goce de sueldo",
  maternidad_paternidad: "Maternidad / paternidad",
  duelo: "Permiso por duelo",
  home_office: "Trabajo remoto",
};

/**
 * Etiqueta neutra del tipo enmascarado que devuelve `ausencias_mes` a quien
 * no tiene `gestion.vacaciones`: se ve QUE la persona falta, no POR QUÉ.
 */
export const ETIQUETA_TIPO_RESERVADO = "Ausente";

export const COLOR_TIPO_POR_DEFECTO = "#64748b";

export const ETIQUETA_ESTADO_AUSENCIA: Record<EstadoAusencia, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

/**
 * Clases de badge por estado (mismo criterio que el resto del portal).
 *
 * Con opacidad y no con el tono 100 sólido: el área interna se sirve en tema
 * oscuro y un `bg-amber-100 text-amber-800` es una pastilla casi blanca sobre
 * fondo negro. `color-500/15` + texto claro en oscuro es la convención que ya
 * usan la bitácora y el banner de suplantación.
 */
export const COLOR_ESTADO_AUSENCIA: Record<EstadoAusencia, string> = {
  pendiente: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  aprobada: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rechazada: "bg-red-500/15 text-red-700 dark:text-red-300",
  cancelada: "bg-muted text-muted-foreground",
};

/** Etiqueta legible de un tipo. Prefiere la de la política si viene. */
export function etiquetaTipo(
  tipo: string | null | undefined,
  etiquetaPolitica?: string | null
): string {
  if (etiquetaPolitica) return etiquetaPolitica;
  if (tipo && tipo in ETIQUETA_TIPO_AUSENCIA) {
    return ETIQUETA_TIPO_AUSENCIA[tipo as TipoAusencia];
  }
  // `ausencias_mes` devuelve 'ausencia' cuando enmascara un motivo reservado
  return tipo === "ausencia" ? ETIQUETA_TIPO_RESERVADO : (tipo ?? "Ausencia");
}

export function etiquetaEstado(estado: string): string {
  return ETIQUETA_ESTADO_AUSENCIA[estado as EstadoAusencia] ?? estado;
}

export function claseEstado(estado: string): string {
  return COLOR_ESTADO_AUSENCIA[estado as EstadoAusencia] ?? "";
}

/** Hex validado del tipo, o el gris por defecto si la política trae basura. */
export function colorTipo(color?: string | null): string {
  return /^#[0-9a-fA-F]{6}$/.test(color ?? "")
    ? (color as string)
    : COLOR_TIPO_POR_DEFECTO;
}

/**
 * Estilo en línea para el badge del tipo. El color vive en la BD
 * (`politica_ausencias.color`), así que no puede ser una clase de Tailwind:
 * se compone el hex con alfa de 8 dígitos.
 *
 * **Solo tiñe fondo y borde, nunca la letra.** El área interna se sirve en
 * tema oscuro (`TemaInicial tema="dark"` en el layout), y el hex crudo como
 * color de texto deja ilegibles los tipos oscuros: `duelo` (#475569) sobre la
 * tarjeta daba ~2.2:1, muy por debajo del 4.5:1 de WCAG AA. Es la misma
 * trampa que ya documentó `calendario-ausencias.tsx`: el color se lee de sobra
 * en el fondo y en el punto de la leyenda. Para esos usos, `colorTipo()`.
 */
export function estiloTipo(color?: string | null): {
  backgroundColor: string;
  borderColor: string;
} {
  const hex = colorTipo(color);
  return {
    backgroundColor: `${hex}1f`,
    borderColor: `${hex}59`,
  };
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/**
 * Convierte 'AAAA-MM-DD' en un Date LOCAL.
 *
 * `new Date('2026-06-12')` lo interpreta como medianoche UTC, que en México
 * es el día 11: las fechas de una ausencia son días de calendario, no
 * instantes, así que se arman a mano.
 */
export function fechaDesdeISO(iso: string): Date {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(anio, (mes ?? 1) - 1, dia ?? 1);
}

/** "12 de junio de 2026" */
export function formatearFecha(iso: string): string {
  if (!iso) return "";
  return fechaDesdeISO(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "12 jun 2026" */
export function formatearFechaCorta(iso: string): string {
  if (!iso) return "";
  return fechaDesdeISO(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Rango compacto de una ausencia:
 * "12 jun 2026" si es un solo día, "12 – 16 jun 2026" si comparten mes y año.
 */
export function formatearRango(inicio: string, fin: string): string {
  if (!inicio || !fin) return "";
  if (inicio === fin) return formatearFechaCorta(inicio);
  const a = fechaDesdeISO(inicio);
  const b = fechaDesdeISO(fin);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${formatearFechaCorta(fin)}`;
  }
  return `${formatearFechaCorta(inicio)} – ${formatearFechaCorta(fin)}`;
}

/** "1.4 MB", "820 KB". Para la lista de comprobantes. */
export function formatearTamano(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Días naturales (no hábiles) que abarca el rango, ambos extremos incluidos. */
export function diasNaturales(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0;
  const a = fechaDesdeISO(inicio).getTime();
  const b = fechaDesdeISO(fin).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}
