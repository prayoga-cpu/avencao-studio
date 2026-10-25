import type { NextConfig } from "next";

/**
 * Cache Components + Partial Prefetching sont activés (défauts Next 16.4).
 * Règle du projet : aucune donnée privée (clients, finances, missions) n'est mise
 * dans un cache partagé (`use cache`). Les pages authentifiées lisent la session
 * à chaque requête derrière une frontière <Suspense>/loading.tsx.
 * Voir docs/cache-et-revalidation.md.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pg-boss", "mysql2", "nodemailer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
    // Toutes les pages connectées dépendent de la session (données privées, rendues à la
    // requête derrière loading.tsx) : la validation « instant » ne s'applique qu'aux
    // segments qui l'activent explicitement.
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
