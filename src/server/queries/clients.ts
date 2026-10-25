import "server-only";
import type { ClientStatus } from "@/generated/prisma/enums";
import { toDateOnlyString } from "@/lib/dates";
import { dec, sum } from "@/lib/money";
import { prisma } from "../db";
import { NotFoundError } from "../errors";
import { can, type Actor } from "../policies";
import { ACTIVE_VIDEO_STATUSES } from "../domain/video-workflow";
import { getInvoiceBalances } from "../services/billing";
import { agencyToday } from "../services/common";
import { getProjectsFinancials } from "../services/profitability";

export async function listClients(
  actor: Actor,
  filters: { q?: string; status?: string; tag?: string; owner?: string; page: number; pageSize: number },
) {
  const where = {
    ...(filters.status ? { status: filters.status as ClientStatus } : { status: { not: "ARCHIVED" as ClientStatus } }),
    ...(filters.owner ? { ownerId: filters.owner } : {}),
    ...(filters.tag ? { tags: { some: { tag: { name: filters.tag } } } } : {}),
    ...(filters.q
      ? {
          OR: [
            { displayName: { contains: filters.q, mode: "insensitive" as const } },
            { legalName: { contains: filters.q, mode: "insensitive" as const } },
            { email: { contains: filters.q, mode: "insensitive" as const } },
            { contacts: { some: { OR: [{ firstName: { contains: filters.q, mode: "insensitive" as const } }, { lastName: { contains: filters.q, mode: "insensitive" as const } }, { email: { contains: filters.q, mode: "insensitive" as const } }] } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: [{ displayName: "asc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true,
        displayName: true,
        kind: true,
        status: true,
        email: true,
        phone: true,
        country: true,
        nextFollowUpOn: true,
        owner: { select: { name: true } },
        contacts: { where: { isPrimary: true }, select: { firstName: true, lastName: true, email: true }, take: 1 },
        tags: { select: { tag: { select: { name: true } } } },
        _count: { select: { projects: { where: { status: { in: ["ACTIVE", "ON_HOLD", "DRAFT"] } } } } },
      },
    }),
    prisma.client.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      kind: c.kind,
      status: c.status,
      email: c.contacts[0]?.email ?? c.email,
      contact: [c.contacts[0]?.firstName, c.contacts[0]?.lastName].filter(Boolean).join(" ") || null,
      phone: c.phone,
      country: c.country,
      nextFollowUpOn: c.nextFollowUpOn ? toDateOnlyString(c.nextFollowUpOn) : null,
      owner: c.owner?.name ?? null,
      tags: c.tags.map((t) => t.tag.name),
      activeProjects: c._count.projects,
    })),
  };
}

export async function getClient(actor: Actor, id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      tags: { include: { tag: true } },
    },
  });
  if (!client) throw new NotFoundError();
  return client;
}

export async function getClientOverview(actor: Actor, clientId: string) {
  const today = await agencyToday();
  const [projects, videos, activities, opportunities, nextDeadlines] = await Promise.all([
    prisma.project.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, reference: true, title: true, status: true, priority: true, clientDeadline: true,
        _count: { select: { videos: true } },
        videos: { select: { status: true } },
      },
    }),
    prisma.video.findMany({
      where: { project: { clientId }, status: { in: ["DELIVERED", "ARCHIVED"] } },
      orderBy: { deliveredAt: "desc" },
      take: 5,
      select: { id: true, reference: true, title: true, deliveredAt: true, type: true },
    }),
    prisma.activity.findMany({ where: { clientId }, orderBy: { occurredAt: "desc" }, take: 8, include: { author: { select: { name: true } } } }),
    prisma.opportunity.findMany({ where: { clientId, stage: { notIn: ["WON", "LOST"] } }, orderBy: { followUpOn: "asc" } }),
    prisma.video.findMany({
      where: { project: { clientId }, status: { in: ACTIVE_VIDEO_STATUSES } },
      orderBy: [{ clientDeadline: "asc" }],
      take: 6,
      select: { id: true, reference: true, title: true, status: true, clientDeadline: true },
    }),
  ]);
  return {
    today,
    projects: projects.map((p) => ({
      id: p.id, reference: p.reference, title: p.title, status: p.status, priority: p.priority,
      clientDeadline: p.clientDeadline ? toDateOnlyString(p.clientDeadline) : null,
      videoCount: p._count.videos,
      deliveredCount: p.videos.filter((v) => v.status === "DELIVERED" || v.status === "ARCHIVED").length,
    })),
    lastDeliveries: videos,
    activities,
    opportunities,
    nextDeadlines,
  };
}

/** Synthèse financière d'un client : réservée aux droits financiers (jamais envoyée sinon). */
export async function getClientFinance(actor: Actor, clientId: string) {
  if (!can(actor, "invoices.read")) return null;
  const today = await agencyToday();
  const [orders, invoices, creditNotes, payments, projects, legacy] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { clientId },
      orderBy: { acceptedOn: "desc" },
      include: { lines: { select: { netAmount: true, cancelledAmount: true, netAmountEur: true, cancelledAmountEur: true } } },
    }),
    prisma.invoice.findMany({ where: { clientId, status: { not: "CANCELLED" } }, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }] }),
    prisma.creditNote.findMany({ where: { clientId, status: "ISSUED" } }),
    prisma.clientPayment.findMany({ where: { clientId }, orderBy: { receivedOn: "desc" } }),
    prisma.project.findMany({ where: { clientId }, select: { id: true, reference: true, title: true } }),
    prisma.legacyPayment.count({ where: { clientId, reconciliationStatus: "TO_RECONCILE" } }),
  ]);
  const balances = await getInvoiceBalances(prisma, invoices.map((i) => i.id), today);
  const projectFin = can(actor, "margins.project") ? await getProjectsFinancials(prisma, projects.map((p) => p.id)) : null;
  const issued = invoices.filter((i) => i.status === "ISSUED");
  const signed = sum(orders.flatMap((o) => o.lines.map((l) => dec(l.netAmountEur).minus(dec(l.cancelledAmountEur)))));
  const invoicedNet = sum(issued.map((i) => dec(i.totalNetEur))).minus(sum(creditNotes.map((c) => dec(c.totalNetEur))));
  const collected = sum(payments.filter((p) => p.status === "RECORDED").map((p) => dec(p.amountEur)));
  const openEur = sum(
    issued.map((i) => {
      const b = balances.get(i.id)!;
      return b.balance.gt(0) ? b.balance.div(dec(i.fxUnitsPerEur)) : dec(0);
    }),
  );
  return {
    signedEur: signed.toFixed(2),
    invoicedNetEur: invoicedNet.toFixed(2),
    collectedEur: collected.toFixed(2),
    openEur: openEur.toFixed(2),
    legacyToReconcile: legacy,
    orders: orders.map((o) => ({
      id: o.id, reference: o.reference, title: o.title, acceptedOn: toDateOnlyString(o.acceptedOn), status: o.status, currency: o.currency,
      net: sum(o.lines.map((l) => dec(l.netAmount).minus(dec(l.cancelledAmount)))).toFixed(2),
    })),
    invoices: invoices.map((i) => {
      const b = balances.get(i.id)!;
      return {
        id: i.id, number: i.number, kind: i.kind, status: i.status, currency: i.currency,
        issueDate: i.issueDate ? toDateOnlyString(i.issueDate) : null, dueDate: i.dueDate ? toDateOnlyString(i.dueDate) : null,
        totalGross: i.totalGross.toFixed(2), balance: b.balance.toFixed(2), state: b.state, overdue: b.overdue,
      };
    }),
    payments: payments.map((p) => ({ id: p.id, receivedOn: toDateOnlyString(p.receivedOn), amount: p.amount.toFixed(2), currency: p.currency, status: p.status, method: p.method })),
    projects: projectFin
      ? projects.map((p) => {
          const f = projectFin.get(p.id)!;
          return { ...p, soldEur: f.soldEur.toFixed(2), costsEur: f.costsEur.toFixed(2), marginEur: f.marginEur.toFixed(2), ratePct: f.ratePct?.toFixed(2) ?? null, status: f.status, missing: f.missingCostCount };
        })
      : null,
  };
}

export async function getNotes(actor: Actor, where: { clientId?: string; projectId?: string; videoId?: string; editorId?: string }) {
  if (!can(actor, "notes.internal")) return [];
  const notes = await prisma.note.findMany({
    where: { ...where, ...(can(actor, "notes.adminOnly") ? {} : { visibility: "INTERNAL" }) },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true } } },
  });
  return notes;
}

export async function getAttachments(ownerType: "CLIENT" | "PROJECT" | "VIDEO" | "EDITOR", ownerId: string) {
  return prisma.attachment.findMany({ where: { ownerType, ownerId }, orderBy: { createdAt: "desc" } });
}
