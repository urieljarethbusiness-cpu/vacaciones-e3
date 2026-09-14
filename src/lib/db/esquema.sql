-- =============================================================================
-- Esquema de «Vacaciones E3» — espejo en SQLite del subsistema de vacaciones
-- de E3 Manager (migraciones 0001/0002/0006/0027/0030/0035/0041/0045/0054/
-- 0063/0064/0084/0085 de su Supabase), condensado a las últimas definiciones.
--
-- Las REGLAS DE NEGOCIO que en Postgres viven en triggers (validar saldo,
-- anticipación, traslapes, aniversario…) aquí viven en TypeScript
-- (src/lib/db/reglas.ts), que es quien decide de verdad; este archivo define
-- la forma de los datos y sus cotas duras (check).
-- =============================================================================

-- Perfiles + credencial local (en el original: auth.users + public.perfiles).
create table if not exists perfiles (
  id text primary key,
  email text not null unique,
  contrasena_hash text not null,
  nombre_completo text not null,
  telefono text,
  rol text not null check (rol in ('empleado', 'manager', 'admin', 'superadmin')),
  activo integer not null default 1,
  -- 0084/0085: alta autoservicio pendiente de activar
  activado_en text,
  alta_autoservicio integer not null default 0,
  created_at text not null default (datetime('now'))
);

-- Ficha laboral (public.empleados). Sin ficha no hay saldo LFT.
create table if not exists empleados (
  id text primary key references perfiles (id) on delete cascade,
  fecha_ingreso text not null,
  puesto text,
  area text,
  fecha_baja text,
  created_at text not null default (datetime('now'))
);

-- Escala del art. 76 LFT (public.politica_vacaciones, 0006+0045+0064).
-- Cada fila ABRE un tramo: a mayor antigüedad, el último tramo que aplique.
create table if not exists politica_vacaciones (
  anios integer primary key check (anios between 1 and 99),
  dias integer not null check (dias between 1 and 365)
);

-- Días festivos (public.dias_festivos). Cualquier fila descuenta hábiles.
create table if not exists dias_festivos (
  fecha text primary key,
  nombre text not null,
  oficial integer not null default 0
);

-- Política por tipo de ausencia (public.politica_ausencias, 0027+0064+0083):
-- la ÚNICA fuente de verdad de las reglas de cada tipo.
create table if not exists politica_ausencias (
  tipo text primary key check (tipo in (
    'vacaciones', 'permiso_salud', 'permiso_personal', 'permiso_sin_goce',
    'maternidad_paternidad', 'duelo', 'home_office'
  )),
  etiqueta text not null,
  descripcion text,
  descuenta_vacaciones integer not null default 0,
  requiere_evidencia integer not null default 0,
  permite_retroactivo integer not null default 0,
  exige_antiguedad integer not null default 0,
  aplica_anticipacion integer not null default 0,
  solo_gestor integer not null default 0,
  ausente_del_trabajo integer not null default 1,
  motivo_sensible integer not null default 1,
  color text not null default '#64748b',
  orden integer not null default 100,
  activo integer not null default 1
);

-- Solicitudes (public.solicitudes_vacaciones, 0006+0027).
create table if not exists solicitudes_vacaciones (
  id text primary key,
  empleado_id text not null references perfiles (id) on delete cascade,
  tipo text not null default 'vacaciones' references politica_ausencias (tipo),
  fecha_inicio text not null,
  fecha_fin text not null,
  dias_habiles integer not null,
  ciclo_inicio text not null,
  ciclo_fin text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  comentario_empleado text,
  comentario_manager text,
  motivo text,
  resuelta_por text,
  resuelta_en text,
  editada_por text,
  editada_en text,
  creada_por text,
  registrada_por_gestor integer not null default 0,
  created_at text not null default (datetime('now')),
  check (fecha_fin >= fecha_inicio)
);
create index if not exists solicitudes_estado_fecha_idx
  on solicitudes_vacaciones (estado, created_at desc);
create index if not exists solicitudes_empleado_fecha_idx
  on solicitudes_vacaciones (empleado_id, created_at desc);

-- Comprobantes (public.ausencia_adjuntos + bucket `ausencias`).
-- El archivo vive en disco bajo datos/evidencia/ con la MISMA ruta relativa.
create table if not exists ausencia_adjuntos (
  id text primary key,
  solicitud_id text not null references solicitudes_vacaciones (id) on delete cascade,
  subido_por text not null references perfiles (id),
  ruta text not null,
  nombre_archivo text not null,
  mime text,
  tamano integer,
  created_at text not null default (datetime('now'))
);

-- Ajustes (public.ajustes): anticipación, semáforos, avisos de ciclo.
create table if not exists ajustes (
  clave text primary key,
  valor text not null
);

-- Dominios de correo del personal (public.dominios_empleado, 0084).
create table if not exists dominios_empleado (
  dominio text primary key,
  activo integer not null default 1
);

-- Invitaciones de alta (public.invitaciones, 0002): el token en claro NUNCA
-- se guarda, solo su sha256.
create table if not exists invitaciones (
  id text primary key,
  email text not null,
  nombre_completo text not null,
  telefono text,
  rol text not null check (rol in ('empleado', 'manager', 'admin')),
  fecha_ingreso text,
  puesto text,
  area text,
  token_hash text not null unique,
  expira_en text not null,
  aceptada_en text,
  creada_por text not null references perfiles (id),
  created_at text not null default (datetime('now'))
);

-- Bitácora (equivalente de la auditoría del original): toda acción de gestor
-- sobre datos ajenos queda registrada.
create table if not exists auditoria (
  id integer primary key autoincrement,
  categoria text not null,
  accion text not null,
  entidad text,
  entidad_id text,
  entidad_etiqueta text,
  actor_id text,
  actor_email text,
  actor_nombre text,
  actor_rol text,
  antes text,
  despues text,
  metadatos text,
  created_at text not null default (datetime('now'))
);

-- Sesiones locales (en el original las lleva GoTrue): token en claro NUNCA
-- se guarda, solo su sha256.
create table if not exists sesiones (
  token_hash text primary key,
  perfil_id text not null references perfiles (id) on delete cascade,
  expira_en text not null,
  created_at text not null default (datetime('now'))
);

-- Cola y registro de avisos (public.notificaciones_outbox). Cada intento de
-- envío queda asentado: canal correo (SMTP) o telegram (Bot API).
create table if not exists notificaciones_outbox (
  id integer primary key autoincrement,
  destinatario text not null,
  plantilla text not null,
  asunto text not null,
  cuerpo text not null,
  canal text not null default 'correo' check (canal in ('correo', 'telegram')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error', 'sin_canal')),
  detalle_error text,
  created_at text not null default (datetime('now'))
);
