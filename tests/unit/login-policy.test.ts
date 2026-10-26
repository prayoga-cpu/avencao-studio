import { describe, expect, it } from "vitest";
import { isLoginEmailAllowed, loginAllowlist, passwordLoginEnabled } from "@/server/auth/login-policy";

const env = { LOGIN_EMAILS: " Founder@Prionation.io , cro@prionation.io,consult@prionation.io,pas-une-adresse " };

describe("politique de connexion", () => {
  it("liste autorisée : adresses valides, en minuscules, sans doublon", () => {
    expect(loginAllowlist(env)).toEqual(["founder@prionation.io", "cro@prionation.io", "consult@prionation.io"]);
    expect(loginAllowlist({})).toBeNull();
  });

  it("seules les adresses de la liste sont acceptées (casse indifférente)", () => {
    expect(isLoginEmailAllowed("FOUNDER@prionation.io", env)).toBe(true);
    expect(isLoginEmailAllowed("admin@avencao.test", env)).toBe(false);
    expect(isLoginEmailAllowed("founder@prionation.io.evil.com", env)).toBe(false);
    // Sans liste (développement) : pas de restriction par adresse.
    expect(isLoginEmailAllowed("admin@avencao.test", {})).toBe(true);
  });

  it("mot de passe actif (comptes créés par un administrateur), sauf désactivation explicite", () => {
    expect(passwordLoginEnabled(env)).toBe(true);
    expect(passwordLoginEnabled({})).toBe(true);
    expect(passwordLoginEnabled({ ...env, PASSWORD_LOGIN: "false" })).toBe(false);
  });
});

describe("administrateurs principaux", () => {
  const env = { MASTER_ADMIN_EMAILS: "MrCaoEvan@gmail.com, prayogadevelopment@gmail.com,invalide" };
  it("liste issue de la configuration serveur, casse indifférente", async () => {
    const { isMasterAdmin, masterAdminEmails } = await import("@/server/auth/login-policy");
    expect(masterAdminEmails(env)).toEqual(["mrcaoevan@gmail.com", "prayogadevelopment@gmail.com"]);
    expect(isMasterAdmin("MRCAOEVAN@gmail.com", env)).toBe(true);
    expect(isMasterAdmin("founder@prionation.io", env)).toBe(false);
    expect(isMasterAdmin("mrcaoevan@gmail.com", {})).toBe(false);
  });
});
