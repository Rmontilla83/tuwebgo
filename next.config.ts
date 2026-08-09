import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad del portal.
 *
 * La auditoría del 2026-08-09 encontró que la landing sí las traía (vía
 * netlify.toml) pero el portal solo tenía HSTS — y el portal es el panel con
 * los datos de los clientes, las conversaciones y los pagos. Al revés de lo
 * que uno querría.
 *
 * La que más importa acá es frame-ancestors: sin ella, cualquiera puede meter
 * portal.tuwebgo.net dentro de un iframe invisible sobre su propia página y
 * hacer que Rafael, ya logueado, toque "Sí entró" o "Marcar revisado" creyendo
 * que toca otra cosa. Se llama clickjacking y contra un panel de una sola
 * persona es barato de intentar.
 */
const cabecerasSeguridad = [
  // Nadie puede embeber el portal. frame-ancestors es el reemplazo moderno de
  // X-Frame-Options; se mandan las dos por navegadores viejos.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // Que el navegador no adivine el tipo de un archivo servido: un .txt que
  // "parece" HTML deja de poder ejecutarse como HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No filtrar a terceros la URL completa (que lleva tokens: ?conv=, ?t=).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // El portal no usa cámara, micrófono ni ubicación. Cerrarlos es gratis.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad }];
  },
};

export default nextConfig;
