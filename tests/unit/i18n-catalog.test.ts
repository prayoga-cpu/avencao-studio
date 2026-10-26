import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { makeT, translateMessage } from "@/lib/i18n/translate";

describe("catalogue anglais", () => {
  it("chaque texte d'interface français a une traduction anglaise", () => {
    // Le script liste les clés manquantes et sort en erreur s'il en manque.
    let output = "";
    try {
      output = execFileSync(process.execPath, ["scripts/i18n/extract.mjs", "--missing"], { encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      output = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(output.trim(), `Traductions manquantes :\n${output}`).toBe("");
  });

  it("traduit les textes exacts, les variables et les messages construits", () => {
    const en = makeT("en");
    expect(en("Tableau de bord")).toBe("Dashboard");
    expect(en("Compte : {0}", ["kai@avencao.test"])).toBe("Account: kai@avencao.test");
    expect(translateMessage("en", "Catégorie : champ obligatoire")).toBe("Category: required field");
    expect(translateMessage("en", "octobre 2026")).toBe("October 2026");
    expect(translateMessage("en", "Texte inconnu")).toBe("Texte inconnu");
  });

  it("le français reste inchangé (texte source)", () => {
    const fr = makeT("fr");
    expect(fr("Tableau de bord")).toBe("Tableau de bord");
    expect(fr("Compte : {0}", ["x"])).toBe("Compte : x");
    expect(fr(null)).toBeNull();
  });
});
