import { beforeEach, describe, expect, it } from "vitest";
import { getProjectsFinancials, getVideosFinancials } from "@/server/services/profitability";
import { createVideo, createVideosBulk } from "@/server/services/projects";
import { createSalesOrder, reallocateLine, setProjectPrice } from "@/server/services/sales";
import { transitionVideo } from "@/server/services/videos";
import type { ProjectPriceInput } from "@/features/finance/schemas";
import { emptyVideo } from "@/features/production/schemas";
import { makeActor, makeClient, makeProject, makeVideos, prisma, resetDb } from "../support/db";
import { line, salesOrder } from "./helpers";

const price = (o: Partial<ProjectPriceInput> & { projectId: string; amount: string }): ProjectPriceInput => ({
  mode: "FLAT",
  acceptedOn: "2026-10-20",
  currency: "EUR",
  manualFxRate: "",
  title: "Prix du projet",
  includedRevisions: "",
  notes: "",
  ...o,
});

async function revenueOf(videoIds: string[]) {
  const fin = await getVideosFinancials(prisma, videoIds);
  return videoIds.map((id) => fin.get(id)!.revenueEur.toFixed(2));
}

const bulk = (projectId: string, count: string) => ({
  projectId, count, type: "REEL" as const, titlePattern: "{type} {n}", format: "", ratio: "", expectedDuration: "", internalDeadline: "", clientDeadline: "",
  estimatedHours: "", priority: "NORMAL" as const, rushesUrl: "", brief: "",
});

describe("prix d'un projet entier", () => {
  beforeEach(resetDb);

  it("forfait global de 700 € sur 7 Reels : 100 € chacun, puis recalcul à l'ajout d'une vidéo", async () => {
    const admin = await makeActor("ADMIN");
    const project = await makeProject((await makeClient()).id);
    const videos = await makeVideos(project.id, 7);
    const { id } = await setProjectPrice(admin, price({ projectId: project.id, amount: "700" }));

    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(order.projectId).toBe(project.id);
    expect(order.lines[0]).toMatchObject({ autoAllocate: true, description: `Forfait projet — ${project.title}` });
    expect(await revenueOf(videos.map((v) => v.id))).toEqual(Array(7).fill("100.00"));

    // Une 8e vidéo ajoutée ensuite reçoit sa part : 700 / 8 = 87,50 €.
    const { ids } = await createVideosBulk(admin, bulk(project.id, "1"));
    expect(await revenueOf([...videos.map((v) => v.id), ...ids])).toEqual(Array(8).fill("87.50"));
    const pf = (await getProjectsFinancials(prisma, [project.id])).get(project.id)!;
    expect(pf.soldEur.toFixed(2)).toBe("700.00");
    expect(pf.unallocatedEur.toFixed(2)).toBe("0.00");
  });

  it("vidéo annulée : sa part revient aux vidéos actives (revenu maintenu) ou est annulée", async () => {
    const admin = await makeActor("ADMIN");
    const project = await makeProject((await makeClient()).id);
    const videos = await makeVideos(project.id, 4, { status: "TO_PREPARE" });
    await setProjectPrice(admin, price({ projectId: project.id, amount: "400" }));

    // Revenu maintenu : 400 € répartis sur les 3 vidéos actives (133,34 / 133,33 / 133,33).
    await transitionVideo(admin, { videoId: videos[0].id, to: "CANCELLED", reason: "Abandon client", revenueTreatment: "KEEP" });
    const kept = await revenueOf(videos.slice(1).map((v) => v.id));
    expect(kept.reduce((s, v) => s + Number(v), 0).toFixed(2)).toBe("400.00");
    expect((await revenueOf([videos[0].id]))[0]).toBe("0.00");

    // Revenu annulé (accord client) : la part est retirée de la vente, le reste réparti.
    await transitionVideo(admin, { videoId: videos[1].id, to: "CANCELLED", reason: "Retiré du devis", revenueTreatment: "CANCEL" });
    const pf = (await getProjectsFinancials(prisma, [project.id])).get(project.id)!;
    expect(pf.soldEur.toFixed(2)).toBe("266.66");
    expect(await revenueOf(videos.slice(2).map((v) => v.id))).toEqual(["133.33", "133.33"]);

    // Réouverture : la vidéo retrouve une part.
    await transitionVideo(admin, { videoId: videos[0].id, to: "TO_PREPARE", reason: "Finalement maintenue" });
    expect(await revenueOf([videos[0].id, videos[2].id, videos[3].id])).toEqual(["88.89", "88.89", "88.88"]);
  });

  it("prix par vidéo : quantité = vidéos actives, prix figé même si une vidéo est ajoutée", async () => {
    const admin = await makeActor("ADMIN");
    const project = await makeProject((await makeClient()).id);
    const videos = await makeVideos(project.id, 3);
    const { id } = await setProjectPrice(admin, price({ projectId: project.id, amount: "120", mode: "PER_VIDEO" }));
    const orderLine = await prisma.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: id } });
    expect(orderLine).toMatchObject({ autoAllocate: false });
    expect(orderLine.quantity.toFixed(0)).toBe("3");
    expect(orderLine.netAmount.toFixed(2)).toBe("360.00");
    expect(await revenueOf(videos.map((v) => v.id))).toEqual(["120.00", "120.00", "120.00"]);

    const extra = await createVideo(admin, { ...emptyVideo(project.id), title: "Bonus" });
    expect(await revenueOf([extra.id])).toEqual(["0.00"]);
    expect(await revenueOf(videos.map((v) => v.id))).toEqual(["120.00", "120.00", "120.00"]);
  });

  it("prix par vidéo sans vidéo : refus explicite", async () => {
    const admin = await makeActor("ADMIN");
    const project = await makeProject((await makeClient()).id);
    await expect(setProjectPrice(admin, price({ projectId: project.id, amount: "120", mode: "PER_VIDEO" }))).rejects.toThrow(/Ajoutez d'abord les vidéos/);
  });

  it("une répartition manuelle désactive l'automatique ; elle se réactive explicitement", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const [a, b] = await makeVideos(project.id, 2);
    const { id } = await setProjectPrice(admin, price({ projectId: project.id, amount: "300" }));
    const lineId = (await prisma.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: id } })).id;

    await reallocateLine(admin, { lineId, allocationMethod: "MANUAL", allocations: [{ videoId: a.id, value: "200" }, { videoId: b.id, value: "100" }] });
    expect((await prisma.salesOrderLine.findUniqueOrThrow({ where: { id: lineId } })).autoAllocate).toBe(false);
    const [c] = await makeVideos(project.id, 1);
    await createVideosBulk(admin, bulk(project.id, "1"));
    expect(await revenueOf([a.id, b.id, c.id])).toEqual(["200.00", "100.00", "0.00"]);

    await reallocateLine(admin, { lineId, allocationMethod: "EQUAL", allocations: [], autoAllocate: true });
    const all = await prisma.video.findMany({ where: { projectId: project.id }, select: { id: true } });
    expect(await revenueOf(all.map((v) => v.id))).toEqual(Array(4).fill("75.00"));
  });

  it("vente classique : la case « forfait » répartit sur tout le projet ; sans projet elle est refusée", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const videos = await makeVideos(project.id, 2);
    await createSalesOrder(admin, salesOrder({ clientId: client.id, projectId: project.id, lines: [line({ unitPrice: "500", allocationMethod: "EQUAL", autoAllocate: true })] }));
    expect(await revenueOf(videos.map((v) => v.id))).toEqual(["250.00", "250.00"]);
    await expect(
      createSalesOrder(admin, salesOrder({ clientId: client.id, lines: [line({ unitPrice: "500", allocationMethod: "EQUAL", autoAllocate: true })] })),
    ).rejects.toThrow(/nécessite une vente rattachée à un projet/);
  });
});
