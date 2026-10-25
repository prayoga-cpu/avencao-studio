import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runLegacyImport } from "@/server/legacy-import/importer";
import { rollbackImportRun } from "@/server/legacy-import/rollback";
import { jsonDirSource } from "@/server/legacy-import/sources";
import { prisma, resetDb } from "../support/db";

/** Mini-export Rails : 3 utilisateurs, 2 contacts, notes, 2 suivis, 3 paiements dont 2 avec facture PDF. */
let dir: string;
let storageDir: string;
const pdf = Buffer.from("%PDF-1.4\n% facture test\n%%EOF\n");
const md5 = (b: Buffer) => createHash("md5").update(b).digest("base64");

async function writeBlob(key: string, data: Buffer) {
  const folder = path.join(storageDir, key.slice(0, 2), key.slice(2, 4));
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, key), data);
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "rails-export-"));
  storageDir = await mkdtemp(path.join(tmpdir(), "rails-storage-"));
  const t = "2024-03-01 10:00:00";
  const tables: Record<string, unknown[]> = {
    users: [
      { id: 1, email: "Evan@Avencao.fr", nom: "Dupont", prenom: "Evan", role: 3, encrypted_password: "$2a$12$ne-doit-jamais-sortir", created_at: t },
      { id: 2, email: "rahona@example.com", nom: null, prenom: "Rahona", role: 4, created_at: t },
      { id: 3, email: "monteur@example.com", nom: "Ali", prenom: "Kai", role: 2, created_at: t },
    ],
    contacts: [
      { id: 10, statut: 0, nom: "Martin", prenom: "Léa", societe: "Studio Léa", offre: 1, email: "lea@studio.fr", mobile: "+33600000000", social: "@lea", adresse: "1 rue A", lien_google_drive: "https://drive.google.com/x", position: 5, created_at: t },
      { id: 11, statut: 1, nom: "Perdu", prenom: "Paul", societe: null, offre: null, email: null, mobile: null, social: null, adresse: null, lien_google_drive: "javascript:alert(1)", position: 0, created_at: t },
    ],
    notes: [
      { id: 100, contact_id: 10, user_id: 1, content: "Appel découverte", created_at: t },
      { id: 101, contact_id: 999, user_id: 1, content: "Orpheline", created_at: t },
    ],
    suivi_clients: [
      { id: 50, contact_id: 10, user_id: 1, collaborateur_id: 3, titre: "Pack reels mars", deadline: "2024-03-30", statut: 1, created_at: t, updated_at: t },
      { id: 51, contact_id: 10, user_id: 1, collaborateur_id: null, titre: "VSL", deadline: null, statut: 0, created_at: t, updated_at: t },
    ],
    suivis: [{ id: 500, suivi_client_id: 50, user_id: 1, contenu: "Rushs reçus", created_at: t }],
    paiements: [
      { id: 70, contact_id: 10, devis: 1200, statut: 2, prochain_paiement: null, commentaire: "Soldé", created_at: t },
      { id: 71, contact_id: 10, devis: 300, statut: 1, prochain_paiement: "2024-04-15", commentaire: null, created_at: t },
      { id: 72, contact_id: 11, devis: 80, statut: 3, prochain_paiement: null, commentaire: null, created_at: t },
    ],
    reglages: [{ id: 1, name: "Avencao Studio", created_at: t }],
    active_storage_blobs: [
      { id: 1, key: "abcd1234okfile", filename: "facture-70.pdf", byte_size: pdf.length, checksum: md5(pdf), service_name: "local" },
      { id: 2, key: "efgh5678badsum", filename: "facture-71.pdf", byte_size: pdf.length, checksum: "AAAAAAAAAAAAAAAAAAAAAA==", service_name: "local" },
      { id: 3, key: "ijkl9012missing", filename: "facture-72.pdf", byte_size: 10, checksum: null, service_name: "local" },
    ],
    active_storage_attachments: [
      { id: 1, name: "facture", record_type: "Paiement", record_id: 70, blob_id: 1 },
      { id: 2, name: "facture", record_type: "Paiement", record_id: 71, blob_id: 2 },
      { id: 3, name: "facture", record_type: "Paiement", record_id: 72, blob_id: 3 },
    ],
  };
  for (const [name, rows] of Object.entries(tables)) await writeFile(path.join(dir, `${name}.json`), JSON.stringify(rows));
  await writeBlob("abcd1234okfile", pdf);
  await writeBlob("efgh5678badsum", pdf);
});

const run = (apply: boolean, extra: Partial<Parameters<typeof runLegacyImport>[1]> = {}) =>
  runLegacyImport(jsonDirSource(dir), { sourceLabel: "production", apply, storageDir, ...extra });

describe("import Rails", () => {
  beforeEach(resetDb);

  it("la simulation n'enregistre rien mais journalise l'exécution", async () => {
    const summary = await run(false);
    expect(summary.mode).toBe("DRY_RUN");
    expect(summary.created.contacts).toBe(2);
    expect(await prisma.client.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.legacyIdMap.count()).toBe(0);
    const logged = await prisma.importRun.findUniqueOrThrow({ where: { id: summary.runId }, include: { issues: true } });
    expect(logged.status).toBe("SUCCEEDED");
    expect(logged.issues.length).toBeGreaterThan(0);
  });

  it("applique les correspondances sans mot de passe, sans rôle implicite et sans impact financier", async () => {
    const summary = await run(true);

    const users = await prisma.user.findMany({ orderBy: { email: "asc" }, include: { accounts: true } });
    expect(users.map((u) => u.email)).toEqual(["evan@avencao.fr", "monteur@example.com", "rahona@example.com"]);
    for (const u of users) {
      expect(u.status).toBe("PENDING_REVIEW");
      expect(u.role).toBe("VISITOR");
      expect(u.financeAccess).toBe(false);
      expect(u.accounts).toHaveLength(0);
    }
    expect(users.find((u) => u.email === "evan@avencao.fr")).toMatchObject({ legacyRole: "admin", suggestedRole: "ADMIN" });
    expect(users.find((u) => u.email === "rahona@example.com")).toMatchObject({ legacyRole: "rahona", suggestedRole: null });
    expect(JSON.stringify(await prisma.user.findMany())).not.toContain("ne-doit-jamais-sortir");

    const lea = await prisma.client.findFirstOrThrow({ where: { displayName: "Studio Léa" }, include: { contacts: true, tags: { include: { tag: true } } } });
    expect(lea).toMatchObject({ status: "ACTIVE", kind: "COMPANY", driveUrl: "https://drive.google.com/x", otherSocial: "@lea" });
    expect(lea.contacts[0]).toMatchObject({ firstName: "Léa", jobTitle: "Entrepreneur", isPrimary: true });
    expect(lea.tags.map((t) => t.tag.name)).toEqual(["Intérêt : Reels"]);
    const paul = await prisma.client.findFirstOrThrow({ where: { displayName: "Paul Perdu" } });
    expect(paul).toMatchObject({ status: "LOST", kind: "INDIVIDUAL", driveUrl: null });

    expect(await prisma.note.count({ where: { legacySource: "rails:notes" } })).toBe(1);
    expect(summary.issues.some((i) => i.table === "notes" && i.legacyId === "101" && i.level === "ERROR")).toBe(true);

    const project = await prisma.project.findUniqueOrThrow({ where: { reference: "LEG-PRODUCTI-0050" }, include: { notes: true } });
    expect(project).toMatchObject({ status: "COMPLETED", clientId: lea.id });
    expect(project.description).toContain("Kai Ali");
    expect(project.notes.map((n) => n.body)).toEqual(["Rushs reçus"]);

    const legacy = await prisma.legacyPayment.findMany({ orderBy: { quoteAmountRaw: "desc" } });
    expect(legacy.map((p) => [p.legacyStatus, p.reconciliationStatus])).toEqual([
      ["finalise", "TO_RECONCILE"],
      ["en_retard", "TO_RECONCILE"],
      ["impaye", "TO_RECONCILE"],
    ]);
    // Seule la facture au bon checksum est copiée ; les autres sont signalées.
    const attachments = await prisma.attachment.findMany({ where: { ownerType: "LEGACY_PAYMENT" } });
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ ownerId: legacy[0].id, filename: "facture-70.pdf", contentType: "application/pdf" });
    expect(summary.issues.some((i) => i.message.startsWith("Checksum invalide"))).toBe(true);
    expect(summary.issues.some((i) => i.message.startsWith("Fichier manquant"))).toBe(true);

    // Aucun total financier : ni facture, ni encaissement, ni vente.
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.clientPayment.count()).toBe(0);
    expect(await prisma.salesOrder.count()).toBe(0);
    expect(summary.reconciliation["Somme brute des « devis » Rails"]).toBe(1580);
    expect((await prisma.agencySettings.findUniqueOrThrow({ where: { id: 1 } })).name).toBe("Avencao Studio");
  });

  it("relancer l'import ne crée aucun doublon", async () => {
    await run(true);
    const before = { clients: await prisma.client.count(), notes: await prisma.note.count(), legacy: await prisma.legacyPayment.count(), att: await prisma.attachment.count() };
    const second = await run(true);
    expect(second.created).toEqual({});
    expect(second.skippedExisting.contacts).toBe(2);
    expect({ clients: await prisma.client.count(), notes: await prisma.note.count(), legacy: await prisma.legacyPayment.count(), att: await prisma.attachment.count() }).toEqual(before);
  });

  it("un suivi peut être converti en vidéo sur décision explicite, sans entrer dans les marges", async () => {
    await run(true, { suiviDecisions: { "50": "video" } });
    const video = await prisma.video.findUniqueOrThrow({ where: { reference: "AV-LEG-PRODUCTI-0050" }, include: { project: true, notes: true } });
    expect(video).toMatchObject({ status: "DELIVERED", deliveredAt: null });
    expect(video.project.status).toBe("ARCHIVED");
    expect(video.notes).toHaveLength(1);
    await run(true, { suiviDecisions: { "50": "video" } });
    expect(await prisma.project.count({ where: { title: "Historique ancien CRM" } })).toBe(1);
  });

  it("une deuxième instance Rails ne réutilise pas les références et ne duplique pas les comptes", async () => {
    await run(true);
    const other = await runLegacyImport(jsonDirSource(dir), { sourceLabel: "axel", apply: true, storageDir });
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.project.findUnique({ where: { reference: "LEG-AXEL-0050" } })).not.toBeNull();
    expect(other.issues.some((i) => i.message.startsWith("Doublon possible"))).toBe(true);
    // Annuler la 2e instance ne supprime pas les comptes créés par la 1re.
    await rollbackImportRun(other.runId);
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.project.findUnique({ where: { reference: "LEG-AXEL-0050" } })).toBeNull();
    expect(await prisma.project.findUnique({ where: { reference: "LEG-PRODUCTI-0050" } })).not.toBeNull();
  });

  it("l'annulation retire l'import, et refuse si des données métier ont été ajoutées", async () => {
    const first = await run(true);
    const client = await prisma.client.findFirstOrThrow({ where: { displayName: "Studio Léa" } });
    await prisma.salesOrder.create({
      data: { reference: "VTE-T-1", title: "Nouvelle vente", clientId: client.id, acceptedOn: new Date("2024-05-01"), currency: "EUR", fxUnitsPerEur: "1", fxRateDate: new Date("2024-05-01"), fxSource: "IDENTITY" },
    });
    await expect(rollbackImportRun(first.runId)).rejects.toThrow(/refusée/);
    await prisma.salesOrder.deleteMany();
    const result = await rollbackImportRun(first.runId);
    expect(result.clients).toBe(2);
    expect(await prisma.client.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.legacyIdMap.count()).toBe(0);
  });
});
