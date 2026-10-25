/**
 * Données de démonstration FICTIVES (aucune personne ni transaction réelle), marquées « (démo) ».
 * Créées via les services métier pour respecter les mêmes règles que l'application.
 * Idempotent : si le jeu de démonstration existe déjà, rien n'est recréé.
 */
import type { PrismaClient } from "../src/generated/prisma/client";
import { addDays, parseDateOnly, todayInTimezone } from "../src/lib/dates";
import type { Actor } from "../src/server/policies";
import { assignEditor, validateAssignment } from "../src/server/services/assignments";
import { createCreditNote, createInvoice, recordClientPayment, recordSupplierPayment } from "../src/server/services/billing";
import { createChangeRequest } from "../src/server/services/change-requests";
import { createDirectCost, createExpense } from "../src/server/services/costs";
import { createRetainer, generateRetainerPeriod } from "../src/server/services/retainers";
import { createSalesOrder } from "../src/server/services/sales";
import { transitionVideo } from "../src/server/services/videos";

const MARKER = "Studio Nova (démo)";

type Ctx = { managerId: string; editorUserId: string };

const noRate = { rateCardId: "", rateMode: "" as const, unitPrice: "", currency: "" as const, quantity: "", minuteRounding: "" as const, includedRevisions: "", manualFxRate: "" };

export async function seedDemo(prisma: PrismaClient, ctx: Ctx): Promise<void> {
  if (await prisma.client.findFirst({ where: { displayName: MARKER } })) {
    console.log("Jeu de démonstration déjà présent : rien à faire.");
    return;
  }
  const settings = await prisma.agencySettings.findUniqueOrThrow({ where: { id: 1 } });
  await prisma.agencySettings.update({ where: { id: 1 }, data: { ownerHourlyRate: "60" } });
  const today = todayInTimezone(settings.timezone);
  const d = (offset: number) => addDays(today, offset);
  const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  const admin: Actor = { id: adminUser.id, name: adminUser.name, email: adminUser.email, image: null, role: "ADMIN", financeAccess: true, editorId: null };

  // Taux de référence (démonstration) : 18 000 IDR et 1,08 USD pour 1 €.
  for (const [currency, unitsPerEur] of [["IDR", "18000"], ["USD", "1.08"]] as const) {
    await prisma.exchangeRate.upsert({
      where: { date_currency: { date: parseDateOnly(d(-120)), currency } },
      update: {},
      create: { date: parseDateOnly(d(-120)), currency, unitsPerEur, source: "MANUAL", note: "Taux de démonstration" },
    });
  }

  // ── Clients ──
  const nova = await prisma.client.create({ data: { displayName: MARKER, kind: "COMPANY", status: "ACTIVE", email: "contact@nova.demo", country: "France", currency: "EUR", paymentTermsDays: 30, ownerId: admin.id, acquisitionSource: "Recommandation", instagram: "@studionova.demo", creativePreferences: "Rythme rapide, sous-titres jaunes, pas de transitions flashy.", contacts: { create: { firstName: "Camille", lastName: "Durand (démo)", email: "camille@nova.demo", isPrimary: true, jobTitle: "Responsable marketing" } } } });
  const lea = await prisma.client.create({ data: { displayName: "Coach Léa Martin (démo)", kind: "INDIVIDUAL", status: "ACTIVE", email: "lea@coach.demo", country: "Belgique", currency: "EUR", paymentTermsDays: 15, ownerId: ctx.managerId, acquisitionSource: "Instagram", nextFollowUpOn: parseDateOnly(d(-2)), contacts: { create: { firstName: "Léa", lastName: "Martin (démo)", email: "lea@coach.demo", isPrimary: true } } } });
  const azur = await prisma.client.create({ data: { displayName: "Maison Azur (démo)", kind: "COMPANY", status: "ACTIVE", email: "studio@azur.demo", country: "France", currency: "EUR", paymentTermsDays: 30, ownerId: admin.id, vatNumber: "FR00DEMO000", contacts: { create: { firstName: "Hugo", lastName: "Petit (démo)", email: "hugo@azur.demo", isPrimary: true, jobTitle: "Directeur artistique" } } } });
  const fitlab = await prisma.client.create({ data: { displayName: "FitLab Bali (démo)", kind: "COMPANY", status: "ACTIVE", email: "hello@fitlab.demo", country: "Indonésie", currency: "EUR", paymentTermsDays: 7, ownerId: ctx.managerId, contacts: { create: { firstName: "Putu", lastName: "Ayu (démo)", email: "putu@fitlab.demo", isPrimary: true } } } });
  const horizon = await prisma.client.create({ data: { displayName: "Podcast Horizon (démo)", kind: "COMPANY", status: "PROSPECT", email: "team@horizon.demo", country: "Suisse", currency: "EUR", nextFollowUpOn: parseDateOnly(d(3)), contacts: { create: { firstName: "Noah", lastName: "Keller (démo)", email: "noah@horizon.demo", isPrimary: true } } } });
  const tagged: [string, string[]][] = [[nova.id, ["Reels", "Récurrent"]], [lea.id, ["VSL", "Coaching"]], [azur.id, ["Publicité"]], [fitlab.id, ["Forfait"]]];
  for (const [clientId, names] of tagged) {
    for (const name of names) {
      const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
      await prisma.clientTag.create({ data: { clientId, tagId: tag.id } });
    }
  }

  // ── Prestataires ──
  const kai = await prisma.editorProfile.create({ data: { displayName: "Kai (démo)", userId: ctx.editorUserId, email: "monteur@avencao.test", country: "France", timezone: "Europe/Paris", languages: ["fr", "en"], skills: ["PREMIERE_PRO", "AFTER_EFFECTS", "SUBTITLING"], formats: ["REEL", "SHORT", "VSL", "YOUTUBE"], level: "SENIOR", payCurrency: "EUR", weeklyCapacityHours: "30", paymentTerms: "Wise, fin de mois" } });
  const made = await prisma.editorProfile.create({ data: { displayName: "Made Wirawan (démo)", email: "made@editor.demo", country: "Indonésie", timezone: "Asia/Makassar", languages: ["id", "en"], skills: ["PREMIERE_PRO", "CAPCUT", "RUSH_PREP"], formats: ["REEL", "SHORT", "VLOG"], level: "INTERMEDIATE", payCurrency: "IDR", weeklyCapacityHours: "40" } });
  const sofia = await prisma.editorProfile.create({ data: { displayName: "Sofia R. (démo)", email: "sofia@motion.demo", country: "Portugal", languages: ["pt", "fr", "en"], skills: ["AFTER_EFFECTS", "MOTION_DESIGN", "COLOR_GRADING"], formats: ["AD", "INTRO", "MOTION_DESIGN", "VSL"], level: "EXPERT", payCurrency: "EUR", weeklyCapacityHours: "20" } });
  const tom = await prisma.editorProfile.create({ data: { displayName: "Tom B. (démo)", email: "tom@subs.demo", country: "Canada", languages: ["en", "fr"], skills: ["SUBTITLING", "RUSH_PREP", "THUMBNAIL"], formats: ["PODCAST", "YOUTUBE", "SHORT"], level: "JUNIOR", payCurrency: "USD" } });
  const validFrom = parseDateOnly(d(-200));
  const kaiReel = await prisma.rateCard.create({ data: { editorId: kai.id, validFrom, label: "Montage Reel (30–60 s)", videoType: "REEL", productionRole: "EDIT", mode: "PER_VIDEO", unitPrice: "30", currency: "EUR", includedRevisions: 2 } });
  const kaiVsl = await prisma.rateCard.create({ data: { editorId: kai.id, validFrom, label: "VSL à la minute finale", videoType: "VSL", productionRole: "EDIT", mode: "PER_FINAL_MINUTE", unitPrice: "12", currency: "EUR", minuteRounding: "CEIL_MINUTE" } });
  const madeReel = await prisma.rateCard.create({ data: { editorId: made.id, validFrom, label: "Montage Reel", videoType: "REEL", productionRole: "EDIT", mode: "PER_VIDEO", unitPrice: "540000", currency: "IDR" } });
  const sofiaMotion = await prisma.rateCard.create({ data: { editorId: sofia.id, validFrom, label: "Motion design (forfait)", productionRole: "MOTION", mode: "PER_VIDEO", unitPrice: "150", currency: "EUR" } });
  await prisma.rateCard.create({ data: { editorId: sofia.id, validFrom, label: "Journée motion", productionRole: "MOTION", mode: "DAILY", unitPrice: "320", currency: "EUR" } });
  await prisma.rateCard.create({ data: { editorId: tom.id, validFrom, label: "Sous-titrage à l'heure", productionRole: "SUBTITLES", mode: "HOURLY", unitPrice: "22", currency: "USD" } });

  const advance = async (videoId: string, status: string, extra: Record<string, unknown> = {}) => {
    const before = await prisma.video.findUniqueOrThrow({ where: { id: videoId }, select: { status: true } });
    await prisma.video.update({ where: { id: videoId }, data: { status: status as never, ...extra } });
    await prisma.videoStatusEvent.create({ data: { videoId, fromStatus: before.status, toStatus: status as never, actorId: admin.id, reason: "Jeu de démonstration" } });
  };

  // ── Projet 1 : Pack Reels (12 vidéos) ──
  const tpl = await prisma.projectTemplate.findUniqueOrThrow({ where: { name: "Pack Reels" } });
  const p1 = await prisma.project.create({ data: { reference: "PRJ-DEMO-001", title: "Pack Reels novembre", clientId: nova.id, ownerId: admin.id, status: "ACTIVE", priority: "HIGH", startOn: parseDateOnly(d(-25)), clientDeadline: parseDateOnly(d(10)), includedRevisionRounds: 2, templateId: tpl.id, driveUrl: "https://drive.google.com/drive/folders/demo-nova" } });
  const checklist = await prisma.checklistTemplateItem.findMany({ orderBy: { position: "asc" } });
  const reels = [];
  for (let i = 1; i <= 12; i++) {
    reels.push(
      await prisma.video.create({
        data: {
          reference: `AV-DEMO-${String(i).padStart(4, "0")}`, projectId: p1.id, title: `Reel ${String(i).padStart(2, "0")} — Nova`, type: "REEL", ratio: "9:16", format: "1080x1920",
          expectedDurationSec: 45, estimatedHours: "2", includedRevisionRounds: 2, internalDeadline: parseDateOnly(d(-12 + i * 2)), clientDeadline: parseDateOnly(d(-10 + i * 2)),
          status: "TO_ASSIGN", position: i, brief: "Extraits d'interview, accroche dans les 2 premières secondes, sous-titres dynamiques.",
          links: { create: { kind: "RUSHES", url: "https://drive.google.com/drive/folders/demo-rushs-nova", label: "Rushs tournage" } },
          checklist: { create: checklist.map((c) => ({ label: c.label, position: c.position })) },
        },
      }),
    );
  }
  await createSalesOrder(admin, {
    clientId: nova.id, projectId: p1.id, opportunityId: "", title: "Pack 12 Reels novembre", acceptedOn: d(-28), currency: "EUR", manualFxRate: "", notes: "",
    lines: [{ description: "Pack 12 Reels (montage + sous-titres)", videoType: "REEL", catalogItemId: "", quantity: "1", unitPrice: "1200", discount: "", includedRevisions: "2", allocationMethod: "EQUAL", allocations: reels.map((r) => ({ videoId: r.id, value: "" })) }],
  });
  const p1Assign: string[] = [];
  for (const [i, r] of reels.entries()) {
    if (i >= 10) continue; // 2 Reels restent « À attribuer »
    const res = await assignEditor(admin, {
      ...noRate, videoId: r.id, editorId: i < 7 ? kai.id : made.id, rateCardId: i < 7 ? kaiReel.id : madeReel.id,
      role: "EDIT", isPrimary: true, scope: "Montage + sous-titres", estimatedHours: "2", startOn: "", dueOn: d(-12 + (i + 1) * 2),
    });
    p1Assign.push(res.id);
  }
  for (let i = 0; i < 3; i++) {
    await prisma.videoVersion.create({ data: { videoId: reels[i].id, number: 1, url: `https://app.frame.io/reviews/demo-v1-${i}`, status: "APPROVED_CLIENT", editorId: kai.id, authorId: ctx.editorUserId, decidedById: admin.id, decidedAt: new Date() } });
    await prisma.videoLink.create({ data: { videoId: reels[i].id, kind: "FINAL_EXPORT", url: `https://drive.google.com/file/d/demo-export-${i}`, label: "Export final 1080x1920" } });
    await advance(reels[i].id, "DELIVERED", { approvedAt: new Date(Date.now() - (5 - i) * 86_400_000), deliveredAt: new Date(Date.now() - (4 - i) * 86_400_000), finalDurationSec: 44 });
    await prisma.assignment.update({ where: { id: p1Assign[i] }, data: { submittedAt: new Date(Date.now() - (6 - i) * 86_400_000) } });
    await validateAssignment(admin, p1Assign[i]);
  }
  for (const i of [3, 4]) {
    await prisma.videoVersion.create({ data: { videoId: reels[i].id, number: 1, url: `https://app.frame.io/reviews/demo-v1-${i}`, status: "APPROVED_INTERNAL", sharedWithClient: true, editorId: kai.id, authorId: ctx.editorUserId } });
    await advance(reels[i].id, "CLIENT_REVIEW");
  }
  await prisma.videoVersion.create({ data: { videoId: reels[5].id, number: 1, url: "https://app.frame.io/reviews/demo-v1-5", status: "CHANGES_REQUESTED", changesSource: "CLIENT", changesCategory: "INCLUDED", editorId: kai.id, authorId: ctx.editorUserId, decidedById: admin.id, decidedAt: new Date(), decisionNote: "Raccourcir l'intro, changer la musique." } });
  await prisma.feedback.create({ data: { videoId: reels[5].id, source: "CLIENT", body: "Raccourcir l'intro et changer la musique (trop calme).", timecode: "00:03", category: "INCLUDED", authorId: admin.id } });
  await advance(reels[5].id, "CLIENT_CHANGES");
  await advance(reels[6].id, "EDITING");
  await prisma.assignment.update({ where: { id: p1Assign[6] }, data: { status: "IN_PROGRESS" } });
  await advance(reels[7].id, "EDITING", { isBlocked: true, blockedReason: "Rushs audio manquants", blockedAt: new Date() });
  const deposit = await createInvoice(admin, {
    clientId: nova.id, projectId: p1.id, salesOrderId: "", kind: "DEPOSIT", status: "ISSUED", number: "FA-DEMO-0101", externalRef: "", issueDate: d(-27), dueDate: d(-20),
    currency: "EUR", manualFxRate: "", notes: "Acompte 50 % — facture émise dans l'outil de facturation.",
    lines: [{ description: "Acompte 50 % Pack Reels novembre", quantity: "1", unitPrice: "600", vatRate: "20", salesOrderLineId: "", deductsInvoiceId: "" }],
  });
  await recordClientPayment(admin, { clientId: nova.id, receivedOn: d(-22), amount: "720", currency: "EUR", manualFxRate: "", fees: "", method: "BANK_TRANSFER", reference: "VIR-DEMO-01", notes: "", allocations: [{ invoiceId: deposit.id, amount: "720" }] });
  const kaiCosts = await prisma.directCost.findMany({ where: { assignmentId: { in: p1Assign.slice(0, 3) } } });
  await recordSupplierPayment(admin, { editorId: kai.id, paidOn: d(-1), currency: "EUR", manualFxRate: "", fees: "1.20", method: "WISE", reference: "WISE-DEMO-1", notes: "3 Reels livrés", allocations: kaiCosts.map((c) => ({ directCostId: c.id, amount: "30" })) });

  // ── Projet 2 : VSL (Léa) — facture partiellement réglée ──
  const p2 = await prisma.project.create({ data: { reference: "PRJ-DEMO-002", title: "VSL lancement programme", clientId: lea.id, ownerId: ctx.managerId, status: "ACTIVE", priority: "URGENT", clientDeadline: parseDateOnly(d(5)), includedRevisionRounds: 3 } });
  const vsl = await prisma.video.create({ data: { reference: "AV-DEMO-0101", projectId: p2.id, title: "VSL — Programme Équilibre", type: "VSL", ratio: "16:9", format: "1920x1080", expectedDurationSec: 600, estimatedHours: "12", internalDeadline: parseDateOnly(d(3)), clientDeadline: parseDateOnly(d(5)), status: "TO_ASSIGN", brief: "Script fourni, b-roll lifestyle, ton chaleureux, CTA final à 9:30.", links: { create: [{ kind: "RUSHES", url: "https://www.dropbox.com/sh/demo-vsl", label: "Rushs + script" }, { kind: "DOCUMENT", url: "https://docs.google.com/document/d/demo-script", label: "Script" }] }, checklist: { create: checklist.map((c) => ({ label: c.label, position: c.position })) } } });
  await createSalesOrder(admin, { clientId: lea.id, projectId: p2.id, opportunityId: "", title: "VSL lancement", acceptedOn: d(-15), currency: "EUR", manualFxRate: "", notes: "", lines: [{ description: "VSL 10 min + motion", videoType: "VSL", catalogItemId: "", quantity: "1", unitPrice: "900", discount: "", includedRevisions: "3", allocationMethod: "EQUAL", allocations: [{ videoId: vsl.id, value: "" }] }] });
  await assignEditor(admin, { ...noRate, videoId: vsl.id, editorId: kai.id, rateCardId: kaiVsl.id, role: "EDIT", isPrimary: true, scope: "Montage complet", estimatedHours: "12", startOn: d(-3), dueOn: d(3) });
  await assignEditor(admin, { ...noRate, videoId: vsl.id, editorId: sofia.id, rateCardId: sofiaMotion.id, role: "MOTION", isPrimary: false, scope: "Titres animés et CTA", estimatedHours: "6", startOn: "", dueOn: d(2) });
  await advance(vsl.id, "EDITING");
  await createDirectCost(admin, { kind: "PURCHASE", label: "Licence musique (démo)", editorId: "", supplierName: "Banque musicale", projectId: "", videoId: vsl.id, amount: "10", currency: "EUR", manualFxRate: "", incurredOn: d(-4), stage: "VALIDATED", periodMonth: "", nonRecoverableVat: "", notes: "" });
  const leaInv = await createInvoice(admin, { clientId: lea.id, projectId: p2.id, salesOrderId: "", kind: "STANDARD", status: "ISSUED", number: "FA-DEMO-0102", externalRef: "", issueDate: d(-14), dueDate: d(-7), currency: "EUR", manualFxRate: "", notes: "", lines: [{ description: "VSL lancement programme", quantity: "1", unitPrice: "900", vatRate: "20", salesOrderLineId: "", deductsInvoiceId: "" }] });
  await recordClientPayment(admin, { clientId: lea.id, receivedOn: d(-9), amount: "450", currency: "EUR", manualFxRate: "", fees: "13.35", method: "PAYPAL", reference: "PP-DEMO-7781", notes: "Acompte PayPal", allocations: [{ invoiceId: leaInv.id, amount: "450" }] });

  // ── Projet 3 : Publicité + variantes (Azur) — répartition pondérée, une vidéo annulée ──
  const p3 = await prisma.project.create({ data: { reference: "PRJ-DEMO-003", title: "Campagne Azur — publicités", clientId: azur.id, ownerId: admin.id, status: "ACTIVE", clientDeadline: parseDateOnly(d(-5)) } });
  const ads = [];
  for (const [i, t] of ["Pub 30 s — principale", "Variante 15 s", "Variante 6 s"].entries()) {
    ads.push(await prisma.video.create({ data: { reference: `AV-DEMO-02${i}1`, projectId: p3.id, title: t, type: "AD", ratio: "9:16", status: "TO_ASSIGN", internalDeadline: parseDateOnly(d(-8 + i)), clientDeadline: parseDateOnly(d(-5 + i)), estimatedHours: "4" } }));
  }
  await createSalesOrder(admin, {
    clientId: azur.id, projectId: p3.id, opportunityId: "", title: "Campagne publicitaire automne", acceptedOn: d(-50), currency: "EUR", manualFxRate: "", notes: "",
    lines: [{ description: "Publicité + 2 variantes", videoType: "AD", catalogItemId: "", quantity: "1", unitPrice: "1500", discount: "", includedRevisions: "2", allocationMethod: "WEIGHTED", allocations: [{ videoId: ads[0].id, value: "2" }, { videoId: ads[1].id, value: "1" }, { videoId: ads[2].id, value: "1" }] }],
  });
  for (const [i, ad] of ads.entries()) {
    const a = await assignEditor(admin, { ...noRate, videoId: ad.id, editorId: sofia.id, role: "EDIT", isPrimary: true, scope: "", rateMode: "PER_VIDEO", unitPrice: i === 0 ? "220" : "40", currency: "EUR", quantity: "1", estimatedHours: "4", startOn: "", dueOn: d(-8 + i) });
    await validateAssignment(admin, a.id);
    if (i < 2) {
      await prisma.videoVersion.create({ data: { videoId: ad.id, number: 1, url: `https://app.frame.io/reviews/demo-azur-${i}`, status: "APPROVED_CLIENT", editorId: sofia.id } });
      await prisma.videoLink.create({ data: { videoId: ad.id, kind: "FINAL_EXPORT", url: `https://drive.google.com/file/d/demo-azur-${i}` } });
      await advance(ad.id, "DELIVERED", { approvedAt: new Date(Date.now() - 12 * 86_400_000), deliveredAt: new Date(Date.now() - (11 - i) * 86_400_000) });
    } else {
      // Annulation via le workflow : le revenu alloué est annulé, les 40 € engagés restent dus.
      await transitionVideo(admin, { videoId: ad.id, to: "CANCELLED", reason: "Variante abandonnée par le client — 40 € restent dus à la monteuse", revenueTreatment: "CANCEL" });
    }
  }
  const azurInv = await createInvoice(admin, { clientId: azur.id, projectId: p3.id, salesOrderId: "", kind: "STANDARD", status: "ISSUED", number: "FA-DEMO-0090", externalRef: "", issueDate: d(-45), dueDate: d(-15), currency: "EUR", manualFxRate: "", notes: "", lines: [{ description: "Campagne publicitaire automne", quantity: "1", unitPrice: "1500", vatRate: "20", salesOrderLineId: "", deductsInvoiceId: "" }] });
  await createCreditNote(admin, { invoiceId: azurInv.id, number: "AV-DEMO-0001", issueDate: d(-3), net: "100", vatRate: "20", reason: "Geste commercial sur la variante abandonnée", manualFxRate: "" });
  await createChangeRequest(admin, { videoId: ads[0].id, title: "Version 16:9 pour YouTube", description: "Recadrage et adaptation des titres.", clientPrice: "180", clientCurrency: "EUR", editorCost: "60", editorCurrency: "EUR", editorId: sofia.id });

  // ── Projet 4 : FitLab — forfait mensuel + vlog au coût inconnu ──
  const retainer = await createRetainer(admin, { clientId: fitlab.id, title: "Forfait contenus FitLab", startsOn: d(-90), endsOn: "", amount: "1500", currency: "EUR", carryOver: "NEXT_PERIOD", createDraftInvoice: true, vatRate: "0", notes: "10 Reels + 1 vlog par mois", quotas: [{ videoType: "REEL", quantity: "10" }, { videoType: "VLOG", quantity: "1" }] });
  await generateRetainerPeriod(retainer.id, today, admin.id);
  const p4 = await prisma.project.create({ data: { reference: "PRJ-DEMO-004", title: "Vlog YouTube — ce mois-ci", clientId: fitlab.id, ownerId: ctx.managerId, status: "ACTIVE", clientDeadline: parseDateOnly(d(12)) } });
  const vlog = await prisma.video.create({ data: { reference: "AV-DEMO-0301", projectId: p4.id, title: "Vlog — Retraite yoga Ubud", type: "VLOG", ratio: "16:9", expectedDurationSec: 900, rushDurationSec: 7200, status: "TO_ASSIGN", internalDeadline: parseDateOnly(d(9)), clientDeadline: parseDateOnly(d(12)) } });
  await assignEditor(admin, { ...noRate, videoId: vlog.id, editorId: made.id, role: "EDIT", isPrimary: true, scope: "Tarif à négocier", estimatedHours: "", startOn: "", dueOn: d(9) });
  const shorts = await prisma.video.create({ data: { reference: "AV-DEMO-0302", projectId: p4.id, title: "Shorts sous-titrés (x3)", type: "SHORT", status: "WAITING_RUSHES", clientDeadline: parseDateOnly(d(14)), estimatedHours: "3" } });
  await assignEditor(admin, { ...noRate, videoId: shorts.id, editorId: tom.id, role: "SUBTITLES", isPrimary: true, scope: "", rateMode: "HOURLY", unitPrice: "22", currency: "USD", quantity: "3", estimatedHours: "3", startOn: "", dueOn: d(13) });

  // ── Prospection (pipeline distinct du statut client) ──
  const opps = [
    { clientId: horizon.id, title: "Podcast vidéo + 20 extraits / mois", stage: "PROPOSAL_SENT", amount: "2400", prob: "60", follow: d(2), services: ["PODCAST", "SHORT"] },
    { clientId: horizon.id, title: "Teaser saison 2", stage: "QUALIFIED", amount: "600", prob: "40", follow: d(6), services: ["INTRO"] },
    { clientId: nova.id, title: "Pack Reels décembre", stage: "NEGOTIATION", amount: "1200", prob: "80", follow: d(-1), services: ["REEL"] },
    { clientId: lea.id, title: "Série YouTube coaching", stage: "CONTACTED", amount: "1800", prob: "25", follow: d(8), services: ["YOUTUBE"] },
    { clientId: azur.id, title: "Spot TV régional", stage: "LOST", amount: "3000", prob: "0", follow: "", services: ["AD"], lost: "Budget réaffecté à l'affichage" },
  ];
  for (const [i, o] of opps.entries()) {
    const opp = await prisma.opportunity.create({
      data: {
        clientId: o.clientId, title: o.title, stage: o.stage as never, estimatedAmount: o.amount, probability: o.prob, currency: "EUR",
        followUpOn: o.follow ? parseDateOnly(o.follow) : null, expectedCloseOn: parseDateOnly(d(10 + i * 5)), services: o.services as never,
        nextAction: o.stage === "LOST" ? null : "Relancer par WhatsApp", lostReason: o.lost ?? null, lostAt: o.stage === "LOST" ? new Date() : null, ownerId: admin.id, position: i,
      },
    });
    await prisma.activity.create({ data: { clientId: o.clientId, opportunityId: opp.id, type: "CALL", subject: "Appel de découverte", body: "Besoins et volumes discutés (démo).", authorId: admin.id, occurredAt: new Date(Date.now() - (10 - i) * 86_400_000) } });
  }

  // ── Charges de structure ──
  const cat = async (name: string) => (await prisma.expenseCategory.findUniqueOrThrow({ where: { name } })).id;
  const month = today.slice(0, 7);
  const prevMonth = addDays(`${month}-01`, -1).slice(0, 7);
  for (const m of [prevMonth, month]) {
    await createExpense(admin, { categoryId: await cat("Abonnements logiciels"), label: "Adobe Creative Cloud (démo)", supplier: "Adobe", expenseDate: `${m}-03`, periodMonth: m, amountNet: "59.99", vatAmount: "12.00", vatRecoverable: true, currency: "EUR", manualFxRate: "", recurrence: "MONTHLY", isPaid: true, paidOn: `${m}-03`, notes: "" });
    await createExpense(admin, { categoryId: await cat("Abonnements logiciels"), label: "Frame.io (démo)", supplier: "Frame.io", expenseDate: `${m}-05`, periodMonth: m, amountNet: "15", vatAmount: "0", vatRecoverable: true, currency: "USD", manualFxRate: "", recurrence: "MONTHLY", isPaid: true, paidOn: `${m}-05`, notes: "" });
    await createExpense(admin, { categoryId: await cat("Musique et licences"), label: "Abonnement musique (démo)", supplier: "Banque musicale", expenseDate: `${m}-08`, periodMonth: m, amountNet: "13", vatAmount: "2.60", vatRecoverable: false, currency: "EUR", manualFxRate: "", recurrence: "MONTHLY", isPaid: m !== month, paidOn: m !== month ? `${m}-08` : "", notes: "TVA non récupérable : intégrée au coût" });
  }
  await createExpense(admin, { categoryId: await cat("Stockage"), label: "Espace de stockage (démo)", supplier: "Google", expenseDate: `${month}-01`, periodMonth: month, amountNet: "180000", vatAmount: "0", vatRecoverable: true, currency: "IDR", manualFxRate: "", recurrence: "MONTHLY", isPaid: true, paidOn: `${month}-01`, notes: "" });

  // ── Temps du dirigeant (valorisation séparée) et notes ──
  await prisma.timeEntry.create({ data: { userId: admin.id, videoId: vsl.id, workedOn: parseDateOnly(d(-2)), minutes: 180, isOwnerTime: true, valuationRate: "60", note: "Relecture script et direction artistique" } });
  await prisma.note.create({ data: { clientId: nova.id, body: "Client très réactif sur WhatsApp. Préférer les livraisons le mardi.", authorId: admin.id } });
  await prisma.note.create({ data: { clientId: azur.id, body: "Négociation tarifaire sensible : ne pas descendre sous 1 400 € HT pour une campagne.", authorId: admin.id, visibility: "ADMIN_ONLY" } });
}
