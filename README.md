# Vacaciones E3

Recreación del **sistema de vacaciones de empleados de E3 Manager**
(`H:\MegaSync\Proyectos\E3 Manager`) como aplicación autocontenida: mismo
diseño, mismas reglas de negocio, mismos textos y mismas limitaciones, pero
sin depender de servicios externos (usa la SQLite integrada de Node).

## Qué incluye

- **Login de pantalla dividida** idéntico al original: marca a la izquierda
  («Aquí siempre sabes *en qué va lo tuyo*»), formulario a la derecha, red
  animada de fondo y tema oscuro.
- **Panel del empleado** (`/vacaciones`): días disponibles, usados y
  restantes del año de vacaciones en curso y del próximo, fecha del próximo
  reinicio (aniversario), formulario de solicitud con las reglas por tipo,
  historial con cancelación, resumen anual por tipo y banda de aviso
  naranja/rojo cuando el ciclo está por reiniciarse.
- **Panel de gestión** (`/gestion/vacaciones`): vacaciones aprobadas y por
  aprobar (tabla con filtros), aprobar/rechazar/editar/eliminar con
  comentario, **registrar ausencias a nombre de un usuario** (con cualquier
  fecha, incluso pasada, y nacer ya aprobada) y pestaña de **saldos del
  equipo**.
- **Días festivos** (`/gestion/festivos`): alta/baja y generación de los
  festivos oficiales LFT de un año (alimentan el cálculo de días hábiles).
- **Configuración** (`/configuracion`, sección con pestañas; preparada para
  añadir más):
  - **General**: escala LFT editable (art. 76).
  - **Automatizaciones**: los dos recordatorios configurables — solicitudes
    pendientes (al grupo que aprueba, automático o personalizado) y días por
    vencer (a cada empleado, con margen configurable). Activar/desactivar,
    horarios múltiples, días de la semana, destinatarios y botón
    **«Enviar ahora»**. Para que corran solos, programa
    `npm run recordatorios` (cron / Programador de tareas).
  - **Notificaciones** (**exclusiva del Superadministrador**): correo SMTP
    (servidor, puerto, TLS, usuario, contraseña y remitente) y bot de
    Telegram (token y chats), pruebas reales de ambos canales, cola de
    avisos con el resultado de cada intento y reintento de pendientes.
  - **Usuarios**: alta por invitación **solo con correos de los dominios
    `consultoriae3.com` o `grupo-e3.com`**, cambio de roles, baja/reactivar.
  - **Auditoría**: bitácora de acciones de RR. HH. y de seguridad.
- **Escala LFT editable**: los saldos se calculan con la tabla del art. 76
  (12, 14, 16… días por antigüedad, con quinquenios). Los saldos no se
  guardan: se recalculan; dar «más días» a alguien se hace aprobando o
  registrando ausencias, igual que en el sistema original.

## Reglas de vacaciones (idénticas al original)

| Regla | Valor |
|---|---|
| Ciclo | **Aniversario → aniversario** (no año calendario) |
| Anticipación | Vacaciones: **14 días** (2 semanas) de aviso mínimo |
| Emergencia | Salud/maternidad/duelo: cualquier fecha, **incluso pasada** |
| Días contables | Días hábiles: lunes a viernes **menos festivos** |
| Saldo | Los pendientes reservan saldo; nunca queda saldo negativo |
| Antigüedad | Vacaciones exigen 1 año cumplido (permisos, no) |
| Traslapes | No se montan solicitudes activas del mismo tipo |
| Aniversario | Una solicitud no cruza el aniversario (se pide en dos partes) |
| Ventana | Ciclo en curso + el siguiente |
| Autoaprobación | Nadie resuelve lo suyo; RR. HH. queda exento de cupos |
| Superadministrador | Gestiona las del equipo y **no acumula las suyas** |
| Avisos de ciclo | Naranja a <60 días del reinicio, rojo a <30 |

## Notificaciones por correo y Telegram

Se configuran en **Configuración › Notificaciones** (solo superadmin):

- **Correo**: SMTP con nodemailer. La contraseña se guarda y nunca vuelve al
  navegador; el campo vacío la conserva.
- **Telegram**: token del bot (@BotFather) e IDs de chat separados por coma.
- **Eventos que avisan**: nueva solicitud (al empleado y al grupo que
  resuelve), aprobación/rechazo, ediciones de RR. HH., altas a nombre de otro
  (multicanal) e invitaciones (solo correo).
- **Cola y entrega**: cada intento queda registrado (enviado / error con su
  detalle / sin canal). Un fallo de envío nunca tira la acción de negocio, y
  «Reintentar pendientes» vuelve a intentar lo que no pudo salir. Las pruebas
  de canal también quedan asentadas.

## Recordatorios automáticos

Se configuran en **Configuración › Automatizaciones** (admins):

- **Solicitudes pendientes**: resumen de lo que espera revisión, para el
  grupo que aprueba (automático por permiso, o una lista personalizada).
- **Días por vencer**: avisa a quien todavía tiene días cuando su año se
  reinicia dentro del margen configurado (por defecto 30 días).
- Cada uno tiene interruptor, horarios múltiples (HH:MM, hasta 6) y días de
  la semana. **«Enviar ahora»** dispara el envío sin esperar la agenda.
- Para la ejecución automática, programa `npm run recordatorios` (p. ej.
  cada 15 minutos en horario laboral); el script respeta la agenda y el
  marcador de lo ya enviado, así que no duplica avisos.

## Cómo correr

```bash
npm install
npm run dev        # http://localhost:3100
```

La base `datos/vacaciones-e3.db` se crea sola en el primer arranque con su
esquema y semillas (escala LFT, festivos 2025–2031, tipos de ausencia,
dominios de la casa y cuentas de prueba).

### Cuentas de prueba

| Correo | Contraseña | Rol |
|---|---|---|
| `superadmin@consultoriae3.com` | `E3-Super2026` | Superadministrador (sin vacaciones propias) |
| `rrhh@grupo-e3.com` | `E3-Rrhh2026` | Administrador / RR. HH. |
| `encargado@grupo-e3.com` | `E3-Enc2026` | Encargado de Área |
| `ana@consultoriae3.com` | `E3-Ana2026` | Empleado (con antigüedad) |
| `luis@grupo-e3.com` | `E3-Luis2026` | Empleado (primer año, sin días) |

Cambia estas contraseñas antes de cualquier uso real (o borra
`datos/vacaciones-e3.db` y siembra otras cuentas).

### Verificación

```bash
npm run verificar  # 50 pruebas de las reglas de negocio
npm run build      # compilación de producción
```

## Arquitectura

- **Next.js 16 + React 19 + Tailwind v4** (mismas versiones del original),
  con las mismas primitivas de UI y componentes de vacaciones copiados.
- **`node:sqlite`** (sin dependencias nativas) en `src/lib/db`:
  - `esquema.sql` — espejo del modelo Postgres del original.
  - `reglas.ts` — el trigger `validar_solicitud_vacaciones` convertido en
    funciones puras (mismos mensajes de error en español).
  - `consultas.ts` — equivalencias de las RPC (`mis_ciclos_vacaciones`,
    `saldos_equipo`, `resumen_ausencias`, `listar_solicitudes_vacaciones`…).
  - `semilla.ts` — catálogos y cuentas iniciales.
- **Sesiones locales** con cookie httpOnly + `scrypt` (sustituyen a GoTrue);
  el token solo se guarda hasheado (sha256), igual que los enlaces de
  invitación.
- Los **comprobantes** de ausencias viven en `datos/evidencia/` y se sirven
  por `/api/evidencia/[id]` con control de permiso (el sustituto local de la
  URL firmada del bucket privado).
- Los avisos por correo se encolan en `notificaciones_outbox` (sin SMTP
  configurado quedan como registro).
