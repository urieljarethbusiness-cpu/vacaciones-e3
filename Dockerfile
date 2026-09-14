# syntax=docker/dockerfile:1
# =============================================================
# Vacaciones E3 — imagen de producción (Next.js 16 + SQLite)
#
# La app es autocontenida: `node:sqlite` (builtin, sin dependencias
# nativas) guarda la base en /app/datos y los comprobantes en
# /app/datos/evidencia. Al primer arranque, el entrypoint siembra el
# volumen con la base de PRUEBA incluida en la imagen
# (/app/semilla), de modo que la demo siempre arranca poblada:
#   - Superadmin:    superadmin@consultoriae3.com / E3-Super2026
#   - RR. HH.:       rrhh@grupo-e3.com          / E3-Rrhh2026
#   - Encargado:     encargado@grupo-e3.com     / E3-Enc2026
#   - Empleados:     ana@consultoriae3.com / E3-Ana2026
#                    luis@grupo-e3.com     / E3-Luis2026
# En Coolify, monta un volumen persistente en /app/datos para que los
# datos sobrevivan a los redespliegues.
# =============================================================

FROM node:26-alpine AS base
WORKDIR /app
# Next.js pide libc6-compat en Alpine (resolución DNS y sharp de side).
RUN apk add --no-cache libc6-compat

# ---------- Dependencias de BUILD (con devDependencies) ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN npm run build

# ---------- Runner ----------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
# La app abre la base leyendo src/lib/db/esquema.sql desde cwd: ese
# archivo viaja con la imagen (no lo traza Next).
COPY --from=build /app/src/lib/db/esquema.sql ./src/lib/db/esquema.sql
# Semilla de datos de prueba (comprimida): se siembra al primer arranque.
COPY datos/vacaciones-e3.db.gz /app/semilla/vacaciones-e3.db.gz
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/datos \
    && chown -R node:node /app/datos /app/semilla
VOLUME /app/datos
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
