import { beforeEach, describe, expect, it } from "vitest";
import { addDays, parseDateOnly, todayInTimezone, toDateOnlyString } from "@/lib/dates";
import { getPlanning } from "@/server/queries/planning";
import { listEditorMissions } from "@/server/queries/production";
import { assignEditor, assignEditorBulk, previewBulkAssignment } from "@/server/services/assignments";
import { getEditorLoad } from "@/server/services/profitability";
import { createVideosBulk, moveVideoDeadline, updateProject } from "@/server/services/projects";
import { bulkUpdateVideos } from "@/server/services/videos";
import type { BulkAssignmentInput } from "@/features/production/schemas";
import { makeActor, makeClient, makeEditor, makeProject, makeVideos, prisma, resetDb } from "../support/db";
import { assignment } from "./helpers";

const today = () => todayInTimezone("Asia/Makassar");

const bulkAssign = (o: Partial<BulkAssignmentInput> & { videoIds: string[]; editorId: string }): BulkAssignmentInput => ({
  role: "EDIT",
  isPrimary: true,
  scope: "",
  rateCardId: "",
  rateMode: "PER_VIDEO",
  unitPrice: "40",
  currency: "EUR",
  quantity: "1",
  minuteRounding: "",
  includedRevisions: "",
  estimatedHours: "",
  startOn: "",
  dueMode: "VIDEO",
  dueOn: "",
  manualFxRate: "",
  ...o,
});

describe("changement d'étape et de priorité groupés", () => {
  beforeEach(resetDb);

  it("7 vidéos en montage : le passage autorisé réussit, l'interdit est refusé en un seul motif", async () => {
    const admin = await makeActor("ADMIN");
    const project = await makeProject((await makeClient()).id);
    const videos = await makeVideos(project.id, 7, { status: "EDITING" });
    const ids = videos.map((v) => v.id);

    const refused = await bulkUpdateVideos(admin, { ids, to: "DELIVERED", reason: "" });
    expect(refused.moved).toBe(0);
    expect(refused.refusals).toHaveLength(1);
    expect(refused.refusals[0].message).toBe("Transition non autorisée : En montage → Livrée.");
    expect(refused.refusals[0].refs).toHaveLength(7);

    const ok = await bulkUpdateVideos(admin, { ids, to: "INTERNAL_REVIEW", reason: "" });
    expect(ok).toMatchObject({ moved: 7, prioritized: 0, refusals: [] });
    expect(await prisma.video.count({ where: { id: { in: ids }, status: "INTERNAL_REVIEW" } })).toBe(7);
  });

  it("étape forcée : administrateur avec motif uniquement, tracée comme exception", async () => {
    const admin = await makeActor("ADMIN");
    const manager = await makeActor("PRODUCTION_MANAGER");
    const project = await makeProject((await makeClient()).id);
    const videos = await makeVideos(project.id, 2, { status: "EDITING" });
    const ids = videos.map((v) => v.id);

    await expect(bulkUpdateVideos(manager, { ids, to: "CLIENT_REVIEW", reason: "Validé", force: true })).rejects.toThrow(/administrateur/);
    await expect(bulkUpdateVideos(admin, { ids, to: "CLIENT_REVIEW", reason: "", force: true })).rejects.toThrow(/motif/);

    const r = await bulkUpdateVideos(admin, { ids, to: "CLIENT_REVIEW", reason: "Client a validé en direct", force: true });
    expect(r.moved).toBe(2);
    expect(await prisma.videoStatusEvent.count({ where: { videoId: { in: ids }, toStatus: "CLIENT_REVIEW", isOverride: true } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { entityId: { in: ids }, action: "video.force_status" } })).toBe(2);
  });

  it("priorité : comptée à part, tracée, jamais appliquée aux vidéos clôturées", async () => {
    const admin = await makeActor("ADMIN");
    const project = await makeProject((await makeClient()).id);
    const [a, b] = await makeVideos(project.id, 2, { status: "EDITING" });
    const [closed] = await makeVideos(project.id, 1, { status: "DELIVERED" });

    const r = await bulkUpdateVideos(admin, { ids: [a.id, b.id, closed.id], priority: "URGENT", to: "INTERNAL_REVIEW", reason: "" });
    expect(r.prioritized).toBe(2);
    expect(r.moved).toBe(2);
    expect(r.refusals.map((g) => g.message)).toContain("Vidéo clôturée : priorité inchangée.");
    expect((await prisma.video.findUniqueOrThrow({ where: { id: closed.id } })).priority).toBe("NORMAL");
    expect(await prisma.auditEvent.count({ where: { action: "video.priority" } })).toBe(2);
  });

  it("au-delà de 200 vidéos, le changement d'étape groupé est refusé clairement", async () => {
    const admin = await makeActor("ADMIN");
    const ids = Array.from({ length: 201 }, (_, i) => `id-${i}`);
    await expect(bulkUpdateVideos(admin, { ids, to: "EDITING", reason: "" })).rejects.toThrow(/200 vidéos maximum/);
  });
});

describe("affectation groupée d'un prestataire", () => {
  beforeEach(resetDb);

  it("une mission par vidéo, échéance de la vidéo, vidéos clôturées ignorées, une seule notification", async () => {
    const admin = await makeActor("ADMIN");
    const editor = await makeEditor("Ugo");
    const editorUser = await makeActor("EDITOR", { editorId: editor.id });
    const project = await makeProject((await makeClient()).id);
    const [withInternal] = await makeVideos(project.id, 1, { internalDeadline: parseDateOnly("2026-11-10"), clientDeadline: parseDateOnly("2026-11-15") });
    const [clientOnly] = await makeVideos(project.id, 1, { clientDeadline: parseDateOnly("2026-11-15") });
    const [closed] = await makeVideos(project.id, 1, { status: "DELIVERED" });

    const r = await assignEditorBulk(admin, bulkAssign({ videoIds: [withInternal.id, clientOnly.id, closed.id], editorId: editor.id }));
    expect(r.created).toBe(2);
    expect(r.refusals).toEqual([{ message: "Vidéo clôturée : affectation impossible.", refs: [closed.reference] }]);

    const missions = await prisma.assignment.findMany({ where: { editorId: editor.id }, include: { directCosts: true } });
    const due = Object.fromEntries(missions.map((m) => [m.videoId, m.dueOn ? toDateOnlyString(m.dueOn) : null]));
    expect(due[withInternal.id]).toBe("2026-11-10");
    // Sans deadline interne : la deadline client donne l'échéance (visible au planning du monteur).
    expect(due[clientOnly.id]).toBe("2026-11-15");
    expect(missions.every((m) => m.directCosts[0]?.amount?.toFixed(2) === "40.00")).toBe(true);
    expect(await prisma.video.count({ where: { id: { in: [withInternal.id, clientOnly.id] }, status: "ASSIGNED" } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: editorUser.id, type: "ASSIGNMENT_CREATED" } })).toBe(1);

    // Rejouer l'affectation ne crée aucun doublon (ni mission, ni coût).
    const again = await assignEditorBulk(admin, bulkAssign({ videoIds: [withInternal.id, clientOnly.id], editorId: editor.id }));
    expect(again.created).toBe(0);
    expect(again.refusals[0].refs).toHaveLength(2);
    expect(again.refusals[0].message).toMatch(/a déjà une mission « Montage » sur cette vidéo/);
    expect(await prisma.directCost.count({ where: { editorId: editor.id } })).toBe(2);
  });

  it("double clic sur « Affecter » : une seule mission", async () => {
    const admin = await makeActor("ADMIN");
    const editor = await makeEditor();
    const project = await makeProject((await makeClient()).id);
    const [video] = await makeVideos(project.id, 1);
    const results = await Promise.allSettled([
      assignEditor(admin, assignment({ videoId: video.id, editorId: editor.id, unitPrice: "50" })),
      assignEditor(admin, assignment({ videoId: video.id, editorId: editor.id, unitPrice: "50" })),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.assignment.count({ where: { videoId: video.id } })).toBe(1);
    expect(await prisma.directCost.count({ where: { videoId: video.id } })).toBe(1);
  });

  it("aperçu : coût total, vidéos ignorées et charge", async () => {
    const admin = await makeActor("ADMIN");
    const editor = await makeEditor();
    const project = await makeProject((await makeClient()).id);
    const videos = await makeVideos(project.id, 3, { estimatedHours: "2", clientDeadline: parseDateOnly(today()) });
    const [closed] = await makeVideos(project.id, 1, { status: "CANCELLED" });
    const p = await previewBulkAssignment(admin, bulkAssign({ videoIds: [...videos.map((v) => v.id), closed.id], editorId: editor.id }));
    expect(p.eligible).toBe(3);
    expect(p.skipped[0].refs).toEqual([closed.reference]);
    expect(p.cost).toMatchObject({ amount: "120.00", currency: "EUR", amountEur: "120.00", missing: 0 });
    expect(p.load.addedHours).toBe("6.0");
  });
});

describe("échéances des missions et planning du monteur", () => {
  beforeEach(resetDb);

  it("une mission sans date apparaît au planning du monteur à l'échéance de la vidéo", async () => {
    const editor = await makeEditor("Ugo");
    const editorUser = await makeActor("EDITOR", { editorId: editor.id });
    const project = await makeProject((await makeClient()).id);
    const [video] = await makeVideos(project.id, 1, { status: "EDITING", clientDeadline: parseDateOnly("2026-10-15") });
    // Mission historique créée sans échéance (avant le correctif).
    await prisma.assignment.create({ data: { videoId: video.id, editorId: editor.id, role: "EDIT", status: "IN_PROGRESS", quantity: "1" } });

    const { events } = await getPlanning(editorUser, { from: "2026-09-28", to: "2026-11-08" }, {}, "2026-10-26");
    const mission = events.find((e) => e.kind === "mission");
    expect(mission).toMatchObject({ date: "2026-10-15", overdue: true });
    // La deadline client n'est jamais montrée comme telle au monteur.
    expect(events.some((e) => e.kind === "client")).toBe(false);

    const { rows } = await listEditorMissions(editorUser);
    expect(rows[0].dueOn && toDateOnlyString(rows[0].dueOn)).toBe("2026-10-15");
    expect(rows[0].video).not.toHaveProperty("clientDeadline");
  });

  it("déplacer l'échéance de la vidéo déplace les missions qui la suivaient", async () => {
    const admin = await makeActor("ADMIN");
    const editor = await makeEditor();
    const project = await makeProject((await makeClient()).id);
    const [video] = await makeVideos(project.id, 1, { clientDeadline: parseDateOnly("2026-11-20") });
    const { id } = await assignEditor(admin, assignment({ videoId: video.id, editorId: editor.id, unitPrice: "50" }));
    expect(toDateOnlyString((await prisma.assignment.findUniqueOrThrow({ where: { id } })).dueOn!)).toBe("2026-11-20");

    await moveVideoDeadline(admin, { videoId: video.id, field: "VIDEO_INTERNAL", newDate: "2026-11-12", reason: "" });
    expect(toDateOnlyString((await prisma.assignment.findUniqueOrThrow({ where: { id } })).dueOn!)).toBe("2026-11-12");
    expect(await prisma.deadlineChange.count({ where: { assignmentId: id, field: "ASSIGNMENT_DUE" } })).toBe(1);
  });

  it("charge du monteur : une mission en retard compte toujours", async () => {
    const editor = await makeEditor();
    await prisma.editorProfile.update({ where: { id: editor.id }, data: { weeklyCapacityHours: "10" } });
    const project = await makeProject((await makeClient()).id);
    const [video] = await makeVideos(project.id, 1);
    const t = today();
    await prisma.assignment.create({ data: { videoId: video.id, editorId: editor.id, role: "EDIT", status: "IN_PROGRESS", quantity: "1", estimatedHours: "12", dueOn: parseDateOnly(addDays(t, -5)) } });
    const load = await getEditorLoad(prisma, editor.id, t, addDays(t, 7));
    expect(load.plannedHours.toFixed(0)).toBe("12");
    expect(load.overloaded).toBe(true);
  });
});

describe("projet et vidéos", () => {
  beforeEach(resetDb);

  it("« Terminé » est refusé tant que des vidéos sont en production", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    await makeVideos(project.id, 2, { status: "EDITING" });
    const input = {
      clientId: client.id, title: project.title, description: "", ownerId: "", startOn: "", clientDeadline: "", status: "COMPLETED" as const,
      priority: "NORMAL" as const, driveUrl: "", otherLinks: "", includedRevisionRounds: "", revisionRoundDefinition: "", productionErrorPolicy: "", templateId: "", videoCount: "",
    };
    await expect(updateProject(admin, project.id, input)).rejects.toThrow(/2 vidéo\(s\) encore en production/);
    await prisma.video.updateMany({ where: { projectId: project.id }, data: { status: "DELIVERED" } });
    await expect(updateProject(admin, project.id, input)).resolves.toEqual({ id: project.id });
  });

  it("ajout groupé de 60 vidéos : références, checklist et lien de rushs en une transaction", async () => {
    const admin = await makeActor("ADMIN");
    const project = await makeProject((await makeClient()).id);
    await prisma.checklistTemplateItem.createMany({ data: [{ label: "Son", position: 1 }, { label: "Sous-titres", position: 2 }] });
    const started = Date.now();
    const { ids } = await createVideosBulk(admin, {
      projectId: project.id, count: "60", type: "REEL", titlePattern: "{type} {n}", format: "1080x1920", ratio: "9:16", expectedDuration: "0:45",
      internalDeadline: "", clientDeadline: "2026-11-30", estimatedHours: "2", priority: "NORMAL", rushesUrl: "https://drive.example.com/rushs", brief: "",
    });
    expect(ids).toHaveLength(60);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(new Set((await prisma.video.findMany({ where: { projectId: project.id }, select: { reference: true } })).map((v) => v.reference)).size).toBe(60);
    expect(await prisma.videoChecklistItem.count({ where: { videoId: { in: ids } } })).toBe(120);
    expect(await prisma.videoLink.count({ where: { videoId: { in: ids }, kind: "RUSHES" } })).toBe(60);
    expect(await prisma.video.count({ where: { id: { in: ids }, status: "TO_ASSIGN" } })).toBe(60);
  });
});
