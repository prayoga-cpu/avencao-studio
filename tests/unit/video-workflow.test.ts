import { describe, expect, it } from "vitest";
import { missionDueDate } from "@/server/domain/schedule";
import { allowedTransitions, bulkTargetOptions, checkTransition, isOverdue, transitionNeedsReason } from "@/server/domain/video-workflow";

const base = { activeAssignments: 1, hasFinalDeliverable: true, hasRecordedApproval: true, editorIsAssigned: true, hasSubmittedVersion: true };

describe("workflow vidéo", () => {
  it("le monteur ne peut que démarrer le montage et soumettre", () => {
    expect(allowedTransitions("ASSIGNED", "editor")).toEqual(["EDITING"]);
    expect(allowedTransitions("EDITING", "editor")).toEqual(["INTERNAL_REVIEW"]);
    expect(allowedTransitions("CLIENT_REVIEW", "editor")).toEqual([]);
  });

  it("le monteur doit déposer une version avant validation interne", () => {
    const r = checkTransition("EDITING", "INTERNAL_REVIEW", "editor", { ...base, hasSubmittedVersion: false });
    expect(r.ok).toBe(false);
  });

  it("un monteur non affecté est refusé", () => {
    expect(checkTransition("ASSIGNED", "EDITING", "editor", { ...base, editorIsAssigned: false }).ok).toBe(false);
  });

  it("la livraison exige un lien final et une validation, sinon motif d'exception", () => {
    expect(checkTransition("APPROVED", "DELIVERED", "manager", base).ok).toBe(true);
    const noFinal = checkTransition("APPROVED", "DELIVERED", "manager", { ...base, hasFinalDeliverable: false });
    expect(noFinal.ok).toBe(false);
    const override = checkTransition("APPROVED", "DELIVERED", "manager", {
      ...base,
      hasFinalDeliverable: false,
      reason: "Client a validé par téléphone, lien envoyé par email",
    });
    expect(override.ok).toBe(true);
    expect(override.isOverride).toBe(true);
  });

  it("la réouverture après livraison exige un motif et est tracée", () => {
    expect(checkTransition("DELIVERED", "CLIENT_CHANGES", "manager", base).ok).toBe(false);
    const r = checkTransition("DELIVERED", "CLIENT_CHANGES", "manager", { ...base, reason: "Coquille repérée" });
    expect(r.ok).toBe(true);
    expect(r.isReopen).toBe(true);
  });

  it("annulation avec motif obligatoire ; transition hors workflow refusée", () => {
    expect(checkTransition("EDITING", "CANCELLED", "manager", base).ok).toBe(false);
    expect(checkTransition("EDITING", "CANCELLED", "manager", { ...base, reason: "Projet abandonné" }).ok).toBe(true);
    expect(checkTransition("TO_PREPARE", "DELIVERED", "manager", base).ok).toBe(false);
  });

  it("« Attribuée » exige une mission", () => {
    expect(checkTransition("TO_ASSIGN", "ASSIGNED", "manager", { ...base, activeAssignments: 0 }).ok).toBe(false);
  });

  it("retard : échéance dépassée et vidéo non livrée", () => {
    expect(isOverdue("EDITING", "2026-10-20", "2026-10-24")).toBe(true);
    expect(isOverdue("DELIVERED", "2026-10-20", "2026-10-24")).toBe(false);
    expect(isOverdue("EDITING", null, "2026-10-24")).toBe(false);
  });
});

describe("actions groupées et étape forcée", () => {
  const order = ["TO_PREPARE", "WAITING_RUSHES", "TO_ASSIGN", "ASSIGNED", "EDITING", "INTERNAL_REVIEW", "INTERNAL_CHANGES", "CLIENT_REVIEW", "CLIENT_CHANGES", "APPROVED", "DELIVERED", "ARCHIVED", "CANCELLED"] as const;

  it("ne propose que les étapes autorisées pour la sélection, avec leur couverture", () => {
    // Cas du terrain : 7 vidéos « En montage » → seules « Validation interne » et « Annulée » sont possibles.
    const opts = bulkTargetOptions(Array(7).fill("EDITING"), order);
    expect(opts.map((o) => o.to)).toEqual(["INTERNAL_REVIEW", "CANCELLED"]);
    expect(opts[0]).toMatchObject({ eligible: 7, total: 7, needsReason: false });
    expect(opts[1]).toMatchObject({ eligible: 7, needsReason: true });
  });

  it("sélection mixte : couverture partielle et vidéos déjà à l'étape", () => {
    const opts = bulkTargetOptions(["ASSIGNED", "EDITING", "EDITING"], order);
    const editing = opts.find((o) => o.to === "EDITING")!;
    expect(editing).toMatchObject({ eligible: 1, already: 2, total: 3 });
    expect(opts.find((o) => o.to === "INTERNAL_REVIEW")).toMatchObject({ eligible: 2 });
  });

  it("le refus nomme l'étape de départ et d'arrivée", () => {
    const r = checkTransition("EDITING", "DELIVERED", "manager", base);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Transition non autorisée : En montage → Livrée.");
  });

  it("forcer une étape : responsable uniquement, motif obligatoire, tracé comme exception", () => {
    expect(checkTransition("EDITING", "CLIENT_REVIEW", "manager", base, { force: true }).ok).toBe(false);
    const forced = checkTransition("EDITING", "CLIENT_REVIEW", "manager", { ...base, reason: "Validé par téléphone" }, { force: true });
    expect(forced).toMatchObject({ ok: true, isForced: true, isOverride: true });
    expect(checkTransition("EDITING", "CLIENT_REVIEW", "editor", { ...base, reason: "x" }, { force: true }).ok).toBe(false);
    // Une transition autorisée reste une transition normale même avec l'option.
    expect(checkTransition("EDITING", "INTERNAL_REVIEW", "manager", { ...base, reason: "x" }, { force: true }).isForced).toBeFalsy();
    // « Attribuée » exige toujours une mission, même forcée.
    expect(checkTransition("TO_PREPARE", "ASSIGNED", "manager", { ...base, activeAssignments: 0, reason: "x" }, { force: true }).ok).toBe(false);
  });

  it("motif exigé : règles du workflow et étapes forcées", () => {
    expect(transitionNeedsReason("EDITING", "INTERNAL_REVIEW")).toBe(false);
    expect(transitionNeedsReason("EDITING", "CANCELLED")).toBe(true);
    expect(transitionNeedsReason("DELIVERED", "CLIENT_CHANGES")).toBe(true);
    expect(transitionNeedsReason("EDITING", "DELIVERED")).toBe(false);
    expect(transitionNeedsReason("EDITING", "DELIVERED", true)).toBe(true);
  });
});

describe("échéance des missions", () => {
  it("mission sans date : deadline interne, sinon deadline client", () => {
    expect(missionDueDate("2026-10-12", { internalDeadline: "2026-10-10", clientDeadline: "2026-10-15" })).toBe("2026-10-12");
    expect(missionDueDate(null, { internalDeadline: "2026-10-10", clientDeadline: "2026-10-15" })).toBe("2026-10-10");
    expect(missionDueDate(null, { internalDeadline: null, clientDeadline: "2026-10-15" })).toBe("2026-10-15");
    expect(missionDueDate(null, { internalDeadline: null, clientDeadline: null })).toBeNull();
  });
});
