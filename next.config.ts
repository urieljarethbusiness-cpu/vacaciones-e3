import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy sin nonce, misma receta de E3 Manager:
 * `'unsafe-inline'` en `script-src` cubre el único script crudo del proyecto
 * (el tema inicial del layout raíz); todo lo demás lo pinta React.
 * `'unsafe-eval'` solo en desarrollo (trazas de React).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  `connect-src 'self'${esDesarrollo ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'self'",
].join("; ");

const cabecerasSeguridad = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(esDesarrollo
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad }];
  },

  allowedDevOrigins: ["127.0.0.1", "localhost"],

  experimental: {
    serverActions: {
      // Los comprobantes de ausencias aceptan hasta 10 MB por archivo y
      // 24 MB por lote (LIMITE_TOTAL_EVIDENCIA_BYTES); 26 MB deja margen para
      // el resto del multipart y el rechazo llega como mensaje en español,
      // no como un 413 del framework. Espejo de LIMITE_CUERPO_ACCION_BYTES.
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
