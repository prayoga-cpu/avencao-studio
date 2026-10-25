import { describe, expect, it } from "vitest";
import { publicAppUrl, trustedOrigins } from "@/server/app-url";
import { pgConnectionConfig } from "@/server/pg-config";

describe("connexion PostgreSQL", () => {
  it("base locale : aucun TLS, URL inchangée", () => {
    const c = pgConnectionConfig("postgresql://u:p@localhost:5432/avencao_dev", {});
    expect(c).toEqual({ connectionString: "postgresql://u:p@localhost:5432/avencao_dev", ssl: false });
  });

  it("sslmode=require : chiffré sans vérification (sémantique libpq), paramètre retiré", () => {
    const c = pgConnectionConfig("postgresql://postgres.ref:s%40cret@aws-0-eu.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true", {});
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.connectionString).toBe("postgresql://postgres.ref:s%40cret@aws-0-eu.pooler.supabase.com:6543/postgres?pgbouncer=true");
  });

  it("autorité fournie : vérification du certificat", () => {
    const c = pgConnectionConfig("postgresql://u:p@h:5432/db?sslmode=require", { DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----" });
    expect(c.ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----", rejectUnauthorized: true });
  });

  it("verify-full : autorités système, et taille de pool configurable", () => {
    const c = pgConnectionConfig("postgresql://u:p@h/db?sslmode=verify-full", { DATABASE_POOL_MAX: "4" });
    expect(c).toEqual({ connectionString: "postgresql://u:p@h/db", ssl: { rejectUnauthorized: true }, max: 4 });
  });
});

describe("URL publique", () => {
  it("priorité à APP_URL, sans barre finale", () => {
    expect(publicAppUrl({ APP_URL: "https://crm.avencao.fr/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://crm.avencao.fr");
  });
  it("à défaut, domaine de production Vercel", () => {
    expect(publicAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: "avencao.vercel.app" })).toBe("https://avencao.vercel.app");
  });
  it("origines de confiance : URL publique + déploiements Vercel, sans doublon", () => {
    expect(trustedOrigins({ APP_URL: "https://avencao.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "avencao.vercel.app", VERCEL_URL: "avencao-abc.vercel.app" })).toEqual([
      "https://avencao.vercel.app",
      "https://avencao-abc.vercel.app",
    ]);
  });
});
