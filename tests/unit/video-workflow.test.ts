import { describe, expect, it } from "vitest";
import { allowedTransitions, checkTransition, isOverdue } from "@/server/domain/video-workflow";

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
