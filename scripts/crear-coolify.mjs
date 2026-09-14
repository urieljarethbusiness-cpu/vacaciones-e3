/**
 * Genera el Dockerfile que Coolify construye y crea la aplicación vía API.
 *
 * El build pack `dockerfile` de Coolify no recibe contexto de archivos, así
 * que la base de datos de PRUEBA viaja incrustada en BASE64 dentro del
 * propio Dockerfile (135 KB → ~180 KB) y se decodifica en /app/semilla.
 * El entrypoint la copia al volumen /app/datos en el primer arranque.
 *
 * Uso:  node scripts/crear-coolify.mjs <URL_Coolify> <TOKEN> <project_uuid> <server_uuid>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , url, token, projectUuid, serverUuid] = process.argv;
if (!url || !token || !projectUuid || !serverUuid) {
  console.error("Faltan argumentos: <URL> <TOKEN> <project_uuid> <server_uuid>");
  process.exit(1);
}

const DOMINIO = "https://demo-vacacionese3.urieljareth.org";
// La semilla viaja COMPRIMIDA (10 KB): el comando de Coolify incluye todo el
// Dockerfile en un heredoc de ssh y Linux rechaza argumentos de más de
// 128 KB (MAX_ARG_STRLEN) — con la base sin comprimir el deploy muere con
// ProcessStartFailedException antes de llegar al build.
const semilla = readFileSync("datos/vacaciones-e3.db.gz").toString("base64");
// Chunks de 48000 para que cada línea del RUN quepa sin problemas.
const chunks = semilla.match(/.{1,48000}/gs) ?? [];

const decodificador =
  chunks
    .map((chunk) => `RUN echo '${chunk}' >> /tmp/semilla.b64`)
    .join("\n") +
  "\nRUN base64 -d /tmp/semilla.b64 > /app/semilla/vacaciones-e3.db.gz && rm /tmp/semilla.b64";

const dockerfile = `# Vacaciones E3 — generado para Coolify (scripts/crear-coolify.mjs).
# Igual que el Dockerfile del repo, pero sin contexto de archivos: la base
# de prueba viaja en base64 y se decodifica a /app/semilla.
FROM node:26-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
RUN mkdir -p src/app src/lib/db src/components src/server src/proxy.ts
COPY src ./src
COPY public ./public
COPY package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs ./
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/lib/db/esquema.sql ./src/lib/db/esquema.sql
RUN mkdir -p /app/semilla
${decodificador}
COPY --from=build /app/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/datos && chown -R node:node /app/datos /app/semilla
VOLUME /app/datos
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
`;

// El entrypoint no puede ir COPY desde build (no hay contexto): se escribe aquí.
const dockerfileFinal = dockerfile.replace(
  /COPY --from=build \/app\/docker-entrypoint\.sh \/usr\/local\/bin\/docker-entrypoint\.sh/,
  `RUN printf '#!/bin/sh\\nset -e\\nmkdir -p /app/datos\\nif [ ! -f /app/datos/vacaciones-e3.db ]; then\\n  echo "[vacaciones-e3] Sembrando base de datos de prueba..."\\n  gunzip -c /app/semilla/vacaciones-e3.db.gz > /app/datos/vacaciones-e3.db\\nfi\\nexec "$@"\\n' > /usr/local/bin/docker-entrypoint.sh`
);

const payload = {
  project_uuid: projectUuid,
  server_uuid: serverUuid,
  environment_name: "production",
  name: "vacaciones-e3",
  // Coolify pide el campo dockerfile en base64.
  dockerfile: Buffer.from(dockerfileFinal, "utf8").toString("base64"),
  domains: DOMINIO,
  instant_deploy: true,
};

writeFileSync("datos/coolify-dockerfile.txt", dockerfileFinal);
writeFileSync("datos/coolify-payload.json", JSON.stringify(payload));
console.log(
  `Payload listo: ${dockerfileFinal.length} caracteres de Dockerfile, ${chunks.length} tramo(s) de semilla.`
);
console.log("POST a", `${url}/api/v1/applications/dockerfile`);
