import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";
import { buildClaudePrompt, claudeNewChatUrl } from "@/lib/claude-link";
import { makeT } from "@/lib/i18n/translate";
import { v } from "@/server/ai/tool-kit";
import { hasWriteScope, isAllowedRedirectUri, pkceChallenge, redirectUriMatches, scopeFor, verifyPkce } from "@/server/mcp/oauth";

describe("adresses de retour OAuth", () => {
  it("accepte Claude (claude.ai, claude.com) et les adresses locales, refuse le reste", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback", {})).toBe(true);
    expect(isAllowedRedirectUri("https://claude.com/api/mcp/auth_callback", {})).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:53682/callback", {})).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:8080/cb", {})).toBe(true);
    expect(isAllowedRedirectUri("https://evil.example/callback", {})).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai.evil.example/cb", {})).toBe(false);
    expect(isAllowedRedirectUri("http://claude.ai/api/mcp/auth_callback", {})).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/cb#frag", {})).toBe(false);
    expect(isAllowedRedirectUri("https://user:pw@claude.ai/cb", {})).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)", {})).toBe(false);
  });

  it("hôtes supplémentaires configurables", () => {
    expect(isAllowedRedirectUri("https://inspector.example/cb", { MCP_OAUTH_REDIRECT_HOSTS: "inspector.example" })).toBe(true);
  });

  it("correspondance exacte, port libre uniquement en local", () => {
    expect(redirectUriMatches("https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriMatches("https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/other")).toBe(false);
    expect(redirectUriMatches("http://localhost:1111/callback", "http://localhost:2222/callback")).toBe(true);
    expect(redirectUriMatches("http://localhost:1111/callback", "http://localhost:2222/other")).toBe(false);
    expect(redirectUriMatches("http://localhost:1111/callback", "http://127.0.0.1:1111/callback")).toBe(false);
  });
});

describe("PKCE S256", () => {
  it("valide le vérificateur correspondant, refuse les autres", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = pkceChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"); // exemple RFC 7636
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(`${verifier}x`, challenge)).toBe(false);
    expect(verifyPkce("court", pkceChallenge("court"))).toBe(false);
    expect(verifyPkce(null, challenge)).toBe(false);
  });
});

describe("retour après connexion (?suite=)", () => {
  it("n'accepte que des chemins internes", () => {
    expect(safeNextPath("/oauth/autoriser?client_id=a&state=b")).toBe("/oauth/autoriser?client_id=a&state=b");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example/x")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath("/connexion")).toBe("/dashboard");
    expect(safeNextPath("/api/assistant")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});

describe("bouton « Demander à Claude » (sans API côté CRM)", () => {
  it("construit la question pour le connecteur, avec la page ouverte en option, en FR et en EN", () => {
    const fr = buildClaudePrompt(makeT("fr"), "  Qu'est-ce qui est en retard ?  ", "https://www.avencao.io/videos/abc");
    expect(fr).toBe("Utilise le connecteur « Avencao CRM » pour répondre.\nPage ouverte dans le CRM : https://www.avencao.io/videos/abc\n\nQu'est-ce qui est en retard ?");
    const en = buildClaudePrompt(makeT("en"), "What is overdue?", null);
    expect(en).toBe("Use the “Avencao CRM” connector to answer.\n\nWhat is overdue?");
    expect(buildClaudePrompt(makeT("fr"), "x".repeat(5000)).length).toBeLessThan(1600);
  });

  it("ouvre une nouvelle conversation claude.ai avec la question encodée", () => {
    const url = new URL(claudeNewChatUrl("Bonjour & merci ?\nLigne 2"));
    expect(url.origin + url.pathname).toBe("https://claude.ai/new");
    expect(url.searchParams.get("q")).toBe("Bonjour & merci ?\nLigne 2");
  });
});

describe("portées et entrées des outils d'écriture", () => {
  it("l'écriture n'est accordée que par la portée crm:write explicite", () => {
    expect(scopeFor(false)).toBe("crm:read");
    expect(scopeFor(true)).toBe("crm:read crm:write");
    expect(hasWriteScope("crm:read crm:write")).toBe(true);
    expect(hasWriteScope("crm:read")).toBe(false);
    expect(hasWriteScope("crm:writer")).toBe(false);
    expect(hasWriteScope(null)).toBe(false);
  });

  it("valeurs facultatives transmises aux services : chaîne vide si absente, texte sinon", () => {
    expect(v(undefined)).toBe("");
    expect(v(null)).toBe("");
    expect(v(450)).toBe("450");
    expect(v(" 1 250,50 ")).toBe("1 250,50");
  });
});
