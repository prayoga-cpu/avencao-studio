import "server-only";
/**
 * Import de l'historique Rails (MySQL) vers PostgreSQL.
 *
 * Principes (cahier des charges § P) :
 * - L'application Rails n'est jamais modifiée ; la source est lue en lecture seule.
 * - Simulation par défaut : tout est exécuté dans une transaction annulée à la fin
 *   (contraintes réellement vérifiées) ; seul le journal ImportRun/ImportIssue est conservé.
 * - Relançable sans doublon : correspondance (source, table, ancien ID) → nouvel ID dans
 *   LegacyIdMap ; jamais d'hypothèse d'égalité des IDs entre bases.
 * - Enums entiers Rails mappés explicitement.
 * - Utilisateurs : aucun mot de passe ni session importés ; comptes en « À revoir », rôle
 *   suggéré à confirmer ; aucun accès financier implicite ; aucun email envoyé.
 * - « paiements » : historique « À rapprocher », exclu de tous les totaux ; le champ devis
 *   ne prouve ni facture ni encaissement.
 * - Pièces jointes : copiées seulement si le fichier existe dans le stockage fourni, avec
 *   contrôle taille + checksum MD5 (Active Storage). Sinon : signalé, aucun faux lien.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Role } from "@/generated/prisma/enums";
import { prisma, type Tx } from "../db";
import { sniffType, storage, ALLOWED_TYPES } from "../storage";
import type { LegacySource, LegacyRow } from "./sources";

export const RAILS_ENUMS = {
  userRole: { 0: "visitor", 1: "manager", 2: "collabo", 3: "admin", 4: "rahona", 5: "designer" } as Record<number, string>,
  contactStatut: { 0: "client", 1: "perdu", 2: "prospect" } as Record<number, string>,
  contactOffre: { 0: "pub", 1: "reel", 2: "tournage", 3: "youtube", 4: "formation", 5: "siteweb" } as Record<number, string>,
  contactPosition: { 0: "directeur", 1: "manager", 2: "coach", 3: "consultant", 4: "prestataire", 5: "entrepreneur" } as Record<number, string>,
  paiementStatut: { 0: "en_cours", 1: "en_retard", 2: "finalise", 3: "impaye" } as Record<number, string>,
  suiviStatut: { 0: "en_cours", 1: "termine", 2: "abandonne" } as Record<number, string>,
};

/**
 * Rôle SUGGÉRÉ (jamais appliqué automatiquement). Les rôles nommés d'après une personne
 * (« rahona ») ou ambigus restent sans suggestion : revue humaine obligatoire.
 */
export const SUGGESTED_ROLE: Record<string, Role | null> = {
  admin: "ADMIN",
  manager: "PRODUCTION_MANAGER",
  collabo: "EDITOR",
  designer: "EDITOR",
  rahona: null,
  visitor: null,
};

const OFFRE_LABELS: Record<string, string> = { pub: "Publicité", reel: "Reels", tournage: "Tournage", youtube: "YouTube", formation: "Formation", siteweb: "Site web" };
const POSITION_LABELS: Record<string, string> = { directeur: "Directeur", manager: "Manager", coach: "Coach", consultant: "Consultant", prestataire: "Prestataire", entrepreneur: "Entrepreneur" };

export interface ImportOptions {
  sourceLabel: string;
  apply: boolean;
  storageDir?: string | null;
  /** Décision par suivi_client : "project" (défaut) ou "video". */
  suiviDecisions?: Record<string, "project" | "video">;
}

export interface ImportSummary {
  runId: string;
  mode: "DRY_RUN" | "APPLY";
  read: Record<string, number>;
  created: Record<string, number>;
  skippedExisting: Record<string, number>;
  issues: { level: "INFO" | "WARNING" | "ERROR"; table: string; legacyId?: string; message: string }[];
  reconciliation: Record<string, string | number>;
}

class DryRunRollback extends Error {}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const s = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
const d = (v: unknown) => (v === null || v === undefined || v === "" ? null : new Date(v as string));
const dateOnly = (v: unknown) => {
  const x = d(v);
  return x && !Number.isNaN(x.getTime()) ? new Date(`${x.toISOString().slice(0, 10)}T00:00:00.000Z`) : null;
};
const safeUrl = (v: unknown) => {
  const t = s(v);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? t : null;
  } catch {
    return null;
  }
};

export async function runLegacyImport(source: LegacySource, opts: ImportOptions): Promise<ImportSummary> {
  const run = await prisma.importRun.create({ data: { source: opts.sourceLabel, mode: opts.apply ? "APPLY" : "DRY_RUN" } });
  const summary: ImportSummary = { runId: run.id, mode: opts.apply ? "APPLY" : "DRY_RUN", read: {}, created: {}, skippedExisting: {}, issues: [], reconciliation: {} };
  const issue = (level: "INFO" | "WARNING" | "ERROR", table: string, message: string, legacyId?: string) => summary.issues.push({ level, table, message, legacyId });
  const inc = (bag: Record<string, number>, k: string) => (bag[k] = (bag[k] ?? 0) + 1);

  const tables = ["users", "contacts", "notes", "paiements", "suivi_clients", "suivis", "reglages", "active_storage_attachments", "active_storage_blobs"] as const;
  const data: Record<string, LegacyRow[]> = {};
  for (const t of tables) {
    data[t] = await source.read(t).catch((e) => {
      issue("ERROR", t, `Lecture impossible : ${(e as Error).message}`);
      return [];
    });
    summary.read[t] = data[t].length;
  }
  const blobs = new Map(data.active_storage_blobs.map((b) => [String(b.id), b]));
  const attachmentsFor = (recordType: string, recordId: unknown, name: string) =>
    data.active_storage_attachments.filter((a) => a.record_type === recordType && String(a.record_id) === String(recordId) && a.name === name).map((a) => blobs.get(String(a.blob_id))).filter(Boolean) as LegacyRow[];

  const copiedKeys: string[] = [];
  // Préfixe de référence propre à chaque instance Rails (production, axel, bobby…) pour éviter les collisions.
  const srcTag = opts.sourceLabel.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "RAILS";

  try {
    await prisma.$transaction(
      async (tx) => {
        const mapped = async (table: string, legacyId: unknown) =>
          tx.legacyIdMap.findUnique({ where: { source_legacyTable_legacyId: { source: opts.sourceLabel, legacyTable: table, legacyId: String(legacyId) } } });
        const remember = (table: string, legacyId: unknown, entityType: string, entityId: string) =>
          tx.legacyIdMap.create({ data: { source: opts.sourceLabel, legacyTable: table, legacyId: String(legacyId), entityType, entityId, importRunId: run.id } });

        // ── Utilisateurs ──
        const userMap = new Map<string, string>();
        for (const u of data.users) {
          const existing = await mapped("users", u.id);
          if (existing) {
            userMap.set(String(u.id), existing.entityId);
            inc(summary.skippedExisting, "users");
            continue;
          }
          const email = s(u.email)?.toLowerCase();
          if (!email) {
            issue("ERROR", "users", "Utilisateur sans email : ignoré", String(u.id));
            continue;
          }
          const legacyRole = RAILS_ENUMS.userRole[n(u.role) ?? 0] ?? `inconnu(${u.role})`;
          const sameEmail = await tx.user.findUnique({ where: { email } });
          if (sameEmail) {
            // Compte déjà présent : rattachement sans modifier son rôle ni ses accès.
            userMap.set(String(u.id), sameEmail.id);
            await remember("users", u.id, "User", sameEmail.id);
            issue("INFO", "users", `Email déjà présent (${email}) : rattaché sans modifier ses droits`, String(u.id));
            continue;
          }
          const name = [s(u.prenom), s(u.nom)].filter(Boolean).join(" ") || email;
          const created = await tx.user.create({
            data: {
              email,
              name,
              firstName: s(u.prenom),
              lastName: s(u.nom),
              role: "VISITOR",
              status: "PENDING_REVIEW",
              financeAccess: false,
              legacyRole,
              suggestedRole: SUGGESTED_ROLE[legacyRole] ?? null,
              createdAt: d(u.created_at) ?? undefined,
            },
          });
          userMap.set(String(u.id), created.id);
          await remember("users", u.id, "User", created.id);
          inc(summary.created, "users");
          if (SUGGESTED_ROLE[legacyRole] === null && legacyRole !== "visitor") {
            issue("WARNING", "users", `Rôle « ${legacyRole} » sans équivalent présumé : revue obligatoire avant tout accès`, String(u.id));
          }
          for (const blob of attachmentsFor("User", u.id, "avatar")) {
            await copyBlob(tx, blob, { type: "USER", id: created.id }, "avatar");
          }
        }

        // ── Contacts → clients ──
        const clientMap = new Map<string, string>();
        for (const c of data.contacts) {
          const existing = await mapped("contacts", c.id);
          if (existing) {
            clientMap.set(String(c.id), existing.entityId);
            inc(summary.skippedExisting, "contacts");
            continue;
          }
          const statut = RAILS_ENUMS.contactStatut[n(c.statut) ?? -1];
          const status = statut === "client" ? "ACTIVE" : statut === "perdu" ? "LOST" : statut === "prospect" ? "PROSPECT" : "PROSPECT";
          if (!statut) issue("WARNING", "contacts", `Statut inconnu (${c.statut}) : importé en prospect`, String(c.id));
          const person = [s(c.prenom), s(c.nom)].filter(Boolean).join(" ");
          const displayName = s(c.societe) ?? (person || `Contact Rails #${c.id}`);
          const drive = safeUrl(c.lien_google_drive);
          if (s(c.lien_google_drive) && !drive) issue("WARNING", "contacts", "Lien Drive invalide : non repris (conservé dans les notes)", String(c.id));
          const email = s(c.email)?.toLowerCase();
          if (email) {
            // Même client possible dans une autre instance Rails : signalé, jamais fusionné automatiquement.
            const twin = await tx.client.findFirst({ where: { email }, select: { id: true, displayName: true } });
            if (twin) issue("WARNING", "contacts", `Doublon possible avec « ${twin.displayName} » (même email) : à fusionner manuellement si besoin`, String(c.id));
          }
          const client = await tx.client.create({
            data: {
              displayName,
              kind: s(c.societe) ? "COMPANY" : "INDIVIDUAL",
              status,
              email: s(c.email)?.toLowerCase() ?? null,
              phone: s(c.mobile),
              otherSocial: s(c.social),
              billingAddress: s(c.adresse),
              driveUrl: drive,
              internalNotes: drive || !s(c.lien_google_drive) ? null : `Lien Drive d'origine : ${s(c.lien_google_drive)}`,
              createdAt: d(c.created_at) ?? undefined,
              contacts:
                person || s(c.email) || s(c.mobile)
                  ? {
                      create: {
                        firstName: s(c.prenom),
                        lastName: s(c.nom),
                        email: s(c.email)?.toLowerCase() ?? null,
                        phone: s(c.mobile),
                        jobTitle: POSITION_LABELS[RAILS_ENUMS.contactPosition[n(c.position) ?? -1] ?? ""] ?? null,
                        isPrimary: true,
                      },
                    }
                  : undefined,
            },
          });
          const offre = RAILS_ENUMS.contactOffre[n(c.offre) ?? -1];
          if (offre) {
            // L'ancien champ « offre » (une seule valeur) devient une étiquette : il ne limite plus les prestations.
            const tag = await tx.tag.upsert({ where: { name: `Intérêt : ${OFFRE_LABELS[offre]}` }, update: {}, create: { name: `Intérêt : ${OFFRE_LABELS[offre]}` } });
            await tx.clientTag.create({ data: { clientId: client.id, tagId: tag.id } });
          }
          clientMap.set(String(c.id), client.id);
          await remember("contacts", c.id, "Client", client.id);
          inc(summary.created, "contacts");
        }

        // ── Notes ──
        for (const note of data.notes) {
          if (await mapped("notes", note.id)) {
            inc(summary.skippedExisting, "notes");
            continue;
          }
          const clientId = clientMap.get(String(note.contact_id));
          if (!clientId) {
            issue("ERROR", "notes", `Contact ${note.contact_id} introuvable : note non importée`, String(note.id));
            continue;
          }
          const created = await tx.note.create({
            data: { clientId, body: s(note.content) ?? "(note vide)", authorId: userMap.get(String(note.user_id)) ?? null, legacySource: "rails:notes", createdAt: d(note.created_at) ?? undefined },
          });
          await remember("notes", note.id, "Note", created.id);
          inc(summary.created, "notes");
        }

        // ── Suivis clients → projets (défaut) ou vidéos, blocs → notes ──
        const suiviProject = new Map<string, string>();
        const suiviVideo = new Map<string, string>();
        const containerProject = new Map<string, string>();
        for (const sc of data.suivi_clients) {
          const existing = await mapped("suivi_clients", sc.id);
          if (existing) {
            if (existing.entityType === "Project") suiviProject.set(String(sc.id), existing.entityId);
            else suiviVideo.set(String(sc.id), existing.entityId);
            inc(summary.skippedExisting, "suivi_clients");
            continue;
          }
          const clientId = clientMap.get(String(sc.contact_id));
          if (!clientId) {
            issue("ERROR", "suivi_clients", `Contact ${sc.contact_id} introuvable : suivi non importé`, String(sc.id));
            continue;
          }
          const statut = RAILS_ENUMS.suiviStatut[n(sc.statut) ?? 0] ?? "en_cours";
          const collaborator = data.users.find((u) => String(u.id) === String(sc.collaborateur_id));
          const collabText = collaborator ? `Collaborateur Rails : ${[s(collaborator.prenom), s(collaborator.nom)].filter(Boolean).join(" ") || s(collaborator.email)}` : null;
          const mode = opts.suiviDecisions?.[String(sc.id)] ?? "project";
          if (mode === "project") {
            const project = await tx.project.create({
              data: {
                reference: `LEG-${srcTag}-${String(sc.id).padStart(4, "0")}`,
                title: s(sc.titre) ?? `Suivi Rails #${sc.id}`,
                clientId,
                ownerId: userMap.get(String(sc.user_id)) ?? null,
                clientDeadline: dateOnly(sc.deadline),
                status: statut === "termine" ? "COMPLETED" : statut === "abandonne" ? "CANCELLED" : "ACTIVE",
                description: ["Importé de l'ancien CRM (fiche « Suivi client »).", collabText].filter(Boolean).join("\n"),
                createdAt: d(sc.created_at) ?? undefined,
              },
            });
            suiviProject.set(String(sc.id), project.id);
            await remember("suivi_clients", sc.id, "Project", project.id);
            inc(summary.created, "suivi_clients→projets");
          } else {
            let containerId = containerProject.get(clientId) ?? (await mapped("containers", sc.contact_id))?.entityId;
            if (!containerId) {
              const container = await tx.project.create({
                data: { reference: `LEG-${srcTag}-C${String(sc.contact_id).padStart(4, "0")}`, title: "Historique ancien CRM", clientId, status: "ARCHIVED", description: "Conteneur des suivis Rails convertis en vidéos." },
              });
              containerId = container.id;
              await remember("containers", sc.contact_id, "Project", containerId);
            }
            containerProject.set(clientId, containerId);
            const video = await tx.video.create({
              data: {
                reference: `AV-LEG-${srcTag}-${String(sc.id).padStart(4, "0")}`,
                projectId: containerId,
                title: s(sc.titre) ?? `Suivi Rails #${sc.id}`,
                type: "OTHER",
                clientDeadline: dateOnly(sc.deadline),
                status: statut === "termine" ? "DELIVERED" : statut === "abandonne" ? "CANCELLED" : "TO_PREPARE",
                // Pas de date de livraison : l'historique sans montant ne doit pas entrer dans les marges d'une période.
                brief: ["Importé de l'ancien CRM (fiche « Suivi client »).", collabText].filter(Boolean).join("\n"),
                createdAt: d(sc.created_at) ?? undefined,
              },
            });
            suiviVideo.set(String(sc.id), video.id);
            await remember("suivi_clients", sc.id, "Video", video.id);
            inc(summary.created, "suivi_clients→vidéos");
          }
        }
        for (const bloc of data.suivis) {
          if (await mapped("suivis", bloc.id)) {
            inc(summary.skippedExisting, "suivis");
            continue;
          }
          const projectId = suiviProject.get(String(bloc.suivi_client_id));
          const videoId = suiviVideo.get(String(bloc.suivi_client_id));
          if (!projectId && !videoId) {
            issue("ERROR", "suivis", `Suivi ${bloc.suivi_client_id} introuvable : bloc non importé`, String(bloc.id));
            continue;
          }
          const created = await tx.note.create({
            data: { projectId: projectId ?? null, videoId: videoId ?? null, body: s(bloc.contenu) ?? "(bloc vide)", authorId: userMap.get(String(bloc.user_id)) ?? null, legacySource: "rails:suivis", createdAt: d(bloc.created_at) ?? undefined },
          });
          await remember("suivis", bloc.id, "Note", created.id);
          inc(summary.created, "suivis");
        }

        // ── Paiements → historique à rapprocher ──
        let devisSum = 0;
        for (const p of data.paiements) {
          devisSum += n(p.devis) ?? 0;
          if (await mapped("paiements", p.id)) {
            inc(summary.skippedExisting, "paiements");
            continue;
          }
          const clientId = clientMap.get(String(p.contact_id));
          if (!clientId) {
            issue("ERROR", "paiements", `Contact ${p.contact_id} introuvable : paiement non importé`, String(p.id));
            continue;
          }
          const legacy = await tx.legacyPayment.create({
            data: {
              source: opts.sourceLabel,
              clientId,
              legacyStatus: RAILS_ENUMS.paiementStatut[n(p.statut) ?? 0] ?? `inconnu(${p.statut})`,
              quoteAmountRaw: n(p.devis),
              nextPaymentOn: dateOnly(p.prochain_paiement),
              comment: s(p.commentaire),
              originalData: JSON.parse(JSON.stringify(p)),
              legacyCreatedAt: d(p.created_at),
            },
          });
          for (const blob of attachmentsFor("Paiement", p.id, "facture")) {
            await copyBlob(tx, blob, { type: "LEGACY_PAYMENT", id: legacy.id }, "facture");
          }
          await remember("paiements", p.id, "LegacyPayment", legacy.id);
          inc(summary.created, "paiements");
        }
        summary.reconciliation["Somme brute des « devis » Rails"] = devisSum;
        summary.reconciliation["Somme reprise en historique à rapprocher"] = (await tx.legacyPayment.aggregate({ where: { source: opts.sourceLabel }, _sum: { quoteAmountRaw: true } }))._sum.quoteAmountRaw ?? 0;
        summary.reconciliation["Encaissements créés par l'import"] = 0;
        summary.reconciliation["Factures créées par l'import"] = 0;

        // ── Réglages ──
        const reglage = data.reglages[0];
        if (reglage && !(await mapped("reglages", reglage.id))) {
          if (s(reglage.name)) {
            await tx.agencySettings.upsert({ where: { id: 1 }, update: { name: s(reglage.name)! }, create: { id: 1, name: s(reglage.name)! } });
          }
          for (const blob of attachmentsFor("Reglage", reglage.id, "image")) {
            const id = await copyBlob(tx, blob, { type: "SETTINGS", id: "1" }, "logo");
            if (id) await tx.agencySettings.update({ where: { id: 1 }, data: { logoAttachmentId: id } });
          }
          await remember("reglages", reglage.id, "AgencySettings", "1");
          inc(summary.created, "reglages");
        }

        for (const [table, count] of Object.entries(summary.read)) {
          if (table.startsWith("active_storage")) continue;
          const mappedCount = await tx.legacyIdMap.count({ where: { source: opts.sourceLabel, legacyTable: table } });
          summary.reconciliation[`${table} : lus / reliés`] = `${count} / ${mappedCount}`;
        }
        if (!opts.apply) throw new DryRunRollback();
      },
      { timeout: 10 * 60_000, maxWait: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof DryRunRollback)) {
      issue("ERROR", "import", `Import interrompu, rien n'a été enregistré : ${(e as Error).message}`);
      await finish("FAILED");
      return summary;
    }
  }
  // En simulation, aucun fichier n'est écrit : seuls la présence, la taille et le checksum sont vérifiés.
  if (!opts.apply && copiedKeys.length) issue("INFO", "active_storage", `Simulation : ${copiedKeys.length} fichier(s) vérifié(s) (taille + checksum), rien n'a été copié`);
  await finish("SUCCEEDED");
  return summary;

  async function finish(status: "SUCCEEDED" | "FAILED") {
    await prisma.importRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), summary: { read: summary.read, created: summary.created, skippedExisting: summary.skippedExisting, reconciliation: summary.reconciliation } } });
    if (summary.issues.length) {
      await prisma.importIssue.createMany({ data: summary.issues.map((i) => ({ runId: run.id, level: i.level, table: i.table, legacyId: i.legacyId ?? null, message: i.message })) });
    }
  }

  /** Copie d'un blob Active Storage (service Disk) avec contrôle taille + MD5. */
  async function copyBlob(tx: Tx, blob: LegacyRow, owner: { type: "USER" | "SETTINGS" | "LEGACY_PAYMENT"; id: string }, label: string): Promise<string | null> {
    const key = s(blob.key)!;
    if (!opts.storageDir) {
      issue("WARNING", "active_storage", `Fichier « ${s(blob.filename)} » (${label}) non copié : aucun dossier de stockage fourni`, String(blob.id));
      return null;
    }
    const file = path.join(opts.storageDir, key.slice(0, 2), key.slice(2, 4), key);
    try {
      const st = await stat(file);
      if (st.size !== n(blob.byte_size)) {
        issue("ERROR", "active_storage", `Taille différente pour « ${s(blob.filename)} » (${st.size} ≠ ${blob.byte_size})`, String(blob.id));
        return null;
      }
      const data = await readFile(file);
      const md5 = createHash("md5").update(data).digest("base64");
      if (s(blob.checksum) && md5 !== s(blob.checksum)) {
        issue("ERROR", "active_storage", `Checksum invalide pour « ${s(blob.filename)} »`, String(blob.id));
        return null;
      }
      const type = sniffType(data);
      if (!type) {
        issue("WARNING", "active_storage", `Type non pris en charge pour « ${s(blob.filename)} » : non copié`, String(blob.id));
        return null;
      }
      const storageKey = `legacy/${owner.type.toLowerCase()}/${randomUUID()}.${ALLOWED_TYPES[type]}`;
      if (opts.apply) await storage().put(storageKey, data, type);
      else copiedKeys.push(storageKey);
      const att = await tx.attachment.create({
        data: { storageKey, filename: s(blob.filename) ?? "fichier", contentType: type, byteSize: data.length, sha256: createHash("sha256").update(data).digest("hex"), ownerType: owner.type, ownerId: owner.id, legacySource: `rails:blob:${blob.id}` },
      });
      inc(summary.created, "pièces jointes");
      return att.id;
    } catch {
      issue("WARNING", "active_storage", `Fichier manquant « ${s(blob.filename)} » (${label}) : signalé, aucun lien créé`, String(blob.id));
      return null;
    }
  }
}
