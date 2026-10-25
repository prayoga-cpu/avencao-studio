import "server-only";
import type { CostKind, CostStage, MovementStatus } from "@/generated/prisma/enums";
import { toDateOnlyString } from "@/lib/dates";
import { dec, sum } from "@/lib/money";
import { prisma } from "../db";
import { NotFoundError } from "../errors";
import { assertCan, type Actor } from "../policies";
import { getCostPaidAmounts, getInvoiceBalances, getPaymentAvailability } from "../services/billing";
import { agencyToday } from "../services/common";

const d = (x: Date | null | undefined) => (x ? toDateOnlyString(x) : null);

export async function listSalesOrders(actor: Actor, f: { client?: string; q?: string }) {
  assertCan(actor, "sales.read");
  const orders = await prisma.salesOrder.findMany({
    where: {
      ...(f.client ? { clientId: f.client } : {}),
      ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { reference: { contains: f.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { acceptedOn: "desc" },
    take: 300,
    include: {
      client: { select: { id: true, displayName: true } },
      project: { select: { id: true, reference: true } },
      lines: { select: { netAmount: true, cancelledAmount: true, netAmountEur: true, cancelledAmountEur: true, allocations: { select: { amount: true } } } },
    },
  });
  return orders.map((o) => {
    const net = sum(o.lines.map((l) => dec(l.netAmount).minus(dec(l.cancelledAmount))));
    const allocated = sum(o.lines.flatMap((l) => l.allocations.map((a) => dec(a.amount))));
    return {
      id: o.id, reference: o.reference, title: o.title, client: o.client, project: o.project, status: o.status, currency: o.currency,
      acceptedOn: d(o.acceptedOn), net: net.toFixed(2), netEur: sum(o.lines.map((l) => dec(l.netAmountEur).minus(dec(l.cancelledAmountEur)))).toFixed(2),
      unallocated: net.minus(allocated).toFixed(2),
    };
  });
}

export async function getSalesOrder(actor: Actor, id: string) {
  assertCan(actor, "sales.read");
  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, displayName: true } },
      project: { select: { id: true, reference: true, title: true } },
      lines: {
        orderBy: { position: "asc" },
        include: {
          allocations: { include: { video: { select: { id: true, reference: true, title: true, status: true } } } },
          invoiceLines: { include: { invoice: { select: { id: true, number: true, status: true } } } },
        },
      },
      retainerPeriod: { select: { retainerId: true, periodStart: true } },
    },
  });
  if (!order) throw new NotFoundError();
  const videos = await prisma.video.findMany({
    where: order.projectId ? { projectId: order.projectId } : { project: { clientId: order.clientId } },
    orderBy: [{ projectId: "asc" }, { position: "asc" }],
    select: { id: true, reference: true, title: true, status: true },
  });
  return { order, videos };
}

export async function listInvoices(actor: Actor, f: { client?: string; state?: string; q?: string }) {
  assertCan(actor, "invoices.read");
  const today = await agencyToday();
  const invoices = await prisma.invoice.findMany({
    where: {
      ...(f.client ? { clientId: f.client } : {}),
      ...(f.q ? { OR: [{ number: { contains: f.q, mode: "insensitive" } }, { client: { displayName: { contains: f.q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: [{ issueDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: 300,
    include: { client: { select: { id: true, displayName: true } } },
  });
  const balances = await getInvoiceBalances(prisma, invoices.map((i) => i.id), today);
  const rows = invoices.map((i) => {
    const b = balances.get(i.id)!;
    return {
      id: i.id, number: i.number, kind: i.kind, status: i.status, client: i.client, currency: i.currency,
      issueDate: d(i.issueDate), dueDate: d(i.dueDate), totalNet: i.totalNet.toFixed(2), totalGross: i.totalGross.toFixed(2),
      balance: b.balance.toFixed(2), state: b.state, overdue: b.overdue, daysOverdue: b.daysOverdue, hasPdf: !!i.pdfAttachmentId,
    };
  });
  return f.state === "overdue" ? rows.filter((r) => r.overdue) : f.state ? rows.filter((r) => r.state === f.state) : rows;
}

export async function getInvoice(actor: Actor, id: string) {
  assertCan(actor, "invoices.read");
  const today = await agencyToday();
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, displayName: true } },
      project: { select: { id: true, reference: true, title: true } },
      salesOrder: { select: { id: true, reference: true } },
      lines: { orderBy: { position: "asc" }, include: { deductsInvoice: { select: { id: true, number: true } } } },
      allocations: { orderBy: { createdAt: "asc" }, include: { payment: { select: { id: true, receivedOn: true, method: true, reference: true, status: true } } } },
      creditNotes: { orderBy: { issueDate: "asc" }, include: { refunds: { where: { status: "RECORDED" } } } },
      deductedBy: { include: { invoice: { select: { id: true, number: true, status: true } } } },
    },
  });
  if (!invoice) throw new NotFoundError();
  const balance = (await getInvoiceBalances(prisma, [id], today)).get(id)!;
  const openPayments = await prisma.clientPayment.findMany({ where: { clientId: invoice.clientId, status: "RECORDED", currency: invoice.currency }, orderBy: { receivedOn: "desc" } });
  const availability = await Promise.all(openPayments.map(async (p) => ({ p, a: await getPaymentAvailability(prisma, p.id) })));
  const pdf = invoice.pdfAttachmentId ? await prisma.attachment.findUnique({ where: { id: invoice.pdfAttachmentId } }) : null;
  return {
    invoice,
    balance,
    pdf,
    unallocatedPayments: availability
      .filter(({ a }) => a.available.gt(0))
      .map(({ p, a }) => ({ id: p.id, receivedOn: d(p.receivedOn)!, available: a.available.toFixed(2), reference: p.reference })),
  };
}

export async function listClientPayments(actor: Actor, f: { client?: string; status?: string }) {
  assertCan(actor, "payments.read");
  const payments = await prisma.clientPayment.findMany({
    where: { ...(f.client ? { clientId: f.client } : {}), ...(f.status ? { status: f.status as MovementStatus } : {}) },
    orderBy: { receivedOn: "desc" },
    take: 300,
    include: {
      client: { select: { id: true, displayName: true } },
      allocations: { where: { reversedAt: null }, include: { invoice: { select: { id: true, number: true } } } },
      refunds: { where: { status: "RECORDED" }, select: { amount: true } },
    },
  });
  return payments.map((p) => {
    const allocated = sum(p.allocations.map((a) => dec(a.amount)));
    const refunded = sum(p.refunds.map((r) => dec(r.amount)));
    return {
      id: p.id, client: p.client, receivedOn: d(p.receivedOn), amount: p.amount.toFixed(2), currency: p.currency, amountEur: p.amountEur.toFixed(2),
      fees: p.fees.toFixed(2), method: p.method, reference: p.reference, status: p.status, voidReason: p.voidReason,
      invoices: p.allocations.map((a) => ({ id: a.invoice.id, number: a.invoice.number, amount: a.amount.toFixed(2), allocationId: a.id })),
      available: dec(p.amount).minus(allocated).minus(refunded).toFixed(2), fxSource: p.fxSource,
    };
  });
}

/** Factures ouvertes (solde > 0) par client, pour l'affectation d'un encaissement. */
export async function openInvoicesByClient(actor: Actor) {
  assertCan(actor, "payments.write");
  const today = await agencyToday();
  const invoices = await prisma.invoice.findMany({ where: { status: "ISSUED" }, orderBy: { dueDate: "asc" }, select: { id: true, number: true, clientId: true, currency: true, dueDate: true, totalGross: true } });
  const balances = await getInvoiceBalances(prisma, invoices.map((i) => i.id), today);
  return invoices
    .map((i) => ({ id: i.id, number: i.number ?? "?", clientId: i.clientId, currency: i.currency, dueDate: d(i.dueDate), balance: balances.get(i.id)!.balance }))
    .filter((i) => i.balance.gt(0))
    .map((i) => ({ ...i, balance: i.balance.toFixed(2) }));
}

export async function listDirectCosts(actor: Actor, f: { stage?: string; kind?: string; editor?: string; missing?: boolean }) {
  assertCan(actor, "costs.read");
  const costs = await prisma.directCost.findMany({
    where: {
      ...(f.stage ? { stage: f.stage as CostStage } : {}),
      ...(f.kind ? { kind: f.kind as CostKind } : {}),
      ...(f.editor ? { editorId: f.editor } : {}),
      ...(f.missing ? { amount: null, stage: { not: "CANCELLED" } } : {}),
    },
    orderBy: [{ incurredOn: "desc" }, { createdAt: "desc" }],
    take: 400,
    include: {
      editor: { select: { id: true, displayName: true } },
      video: { select: { id: true, reference: true, title: true } },
      project: { select: { id: true, reference: true } },
      allocations: { select: { amount: true } },
    },
  });
  const paid = await getCostPaidAmounts(prisma, costs.map((c) => c.id));
  return costs.map((c) => {
    const p = paid.get(c.id) ?? dec(0);
    const allocated = sum(c.allocations.map((a) => dec(a.amount)));
    return {
      id: c.id, kind: c.kind, stage: c.stage, label: c.label, editor: c.editor, supplierName: c.supplierName, video: c.video, project: c.project,
      amount: c.amount?.toFixed(2) ?? null, currency: c.currency, amountEur: c.amountEur?.toFixed(2) ?? null, fxSource: c.fxSource,
      incurredOn: d(c.incurredOn), paid: p.toFixed(2), remaining: c.amount ? dec(c.amount).minus(p).toFixed(2) : null,
      allocated: allocated.toFixed(2), unallocated: c.amount && (c.kind === "ENVELOPE" || (!c.videoId && c.allocations.length)) ? dec(c.amount).minus(allocated).toFixed(2) : null,
      periodStart: d(c.periodStart),
    };
  });
}

export async function getDirectCost(actor: Actor, id: string) {
  assertCan(actor, "costs.read");
  const cost = await prisma.directCost.findUnique({
    where: { id },
    include: {
      editor: { select: { id: true, displayName: true } },
      video: { select: { id: true, reference: true, title: true } },
      project: { select: { id: true, reference: true, title: true } },
      allocations: { include: { video: { select: { id: true, reference: true, title: true } } } },
      paymentAllocations: { include: { payment: { select: { id: true, paidOn: true, status: true, reference: true } } } },
    },
  });
  if (!cost) throw new NotFoundError();
  const videos = cost.projectId
    ? await prisma.video.findMany({ where: { projectId: cost.projectId }, orderBy: { position: "asc" }, select: { id: true, reference: true, title: true } })
    : cost.editorId
      ? await prisma.video.findMany({
          where: { assignments: { some: { editorId: cost.editorId, status: { not: "CANCELLED" } } } },
          orderBy: { reference: "asc" },
          select: { id: true, reference: true, title: true },
        })
      : [];
  return { cost, videos };
}

/** Coûts validés restant dus, par prestataire et devise (sélection d'un règlement). */
export async function payableCosts(actor: Actor) {
  assertCan(actor, "supplierPayments.write");
  const costs = await prisma.directCost.findMany({
    where: { stage: "VALIDATED", editorId: { not: null }, amount: { not: null } },
    orderBy: { incurredOn: "asc" },
    select: { id: true, label: true, editorId: true, currency: true, amount: true, incurredOn: true, video: { select: { reference: true } } },
  });
  const paid = await getCostPaidAmounts(prisma, costs.map((c) => c.id));
  return costs
    .map((c) => ({ id: c.id, label: c.label, editorId: c.editorId!, currency: c.currency, reference: c.video?.reference ?? null, incurredOn: d(c.incurredOn)!, remaining: dec(c.amount).minus(paid.get(c.id) ?? dec(0)) }))
    .filter((c) => c.remaining.gt(0))
    .map((c) => ({ ...c, remaining: c.remaining.toFixed(2) }));
}

export async function listSupplierPayments(actor: Actor, f: { editor?: string }) {
  assertCan(actor, "supplierPayments.read");
  const rows = await prisma.supplierPayment.findMany({
    where: f.editor ? { editorId: f.editor } : {},
    orderBy: { paidOn: "desc" },
    take: 300,
    include: { editor: { select: { id: true, displayName: true } }, allocations: { where: { reversedAt: null }, select: { amount: true, fxDifferenceEur: true, directCost: { select: { label: true } } } } },
  });
  return rows.map((p) => ({
    id: p.id, editor: p.editor, supplierName: p.supplierName, paidOn: d(p.paidOn), amount: p.amount.toFixed(2), currency: p.currency, amountEur: p.amountEur.toFixed(2),
    fees: p.fees.toFixed(2), method: p.method, reference: p.reference, status: p.status, voidReason: p.voidReason, proofAttachmentId: p.proofAttachmentId,
    costs: p.allocations.map((a) => a.directCost.label), fxDifferenceEur: sum(p.allocations.map((a) => dec(a.fxDifferenceEur))).toFixed(2),
  }));
}

export async function listExpenses(actor: Actor, f: { from?: string; to?: string; category?: string; unpaid?: boolean }) {
  assertCan(actor, "expenses.read");
  const rows = await prisma.expense.findMany({
    where: {
      ...(f.from && f.to ? { periodMonth: { gte: new Date(`${f.from.slice(0, 7)}-01T00:00:00Z`), lte: new Date(`${f.to}T00:00:00Z`) } } : {}),
      ...(f.category ? { categoryId: f.category } : {}),
      ...(f.unpaid ? { isPaid: false, status: "RECORDED" } : {}),
    },
    orderBy: [{ periodMonth: "desc" }, { expenseDate: "desc" }],
    take: 400,
    include: { category: { select: { name: true } } },
  });
  return rows.map((e) => ({
    id: e.id, label: e.label, supplier: e.supplier, category: e.category.name, expenseDate: d(e.expenseDate), periodMonth: d(e.periodMonth)!.slice(0, 7),
    amountNet: e.amountNet.toFixed(2), vatAmount: e.vatAmount.toFixed(2), vatRecoverable: e.vatRecoverable, currency: e.currency, costEur: e.costEur.toFixed(2),
    recurrence: e.recurrence, isPaid: e.isPaid, paidOn: d(e.paidOn), status: e.status, voidReason: e.voidReason, attachmentId: e.attachmentId, fxSource: e.fxSource,
  }));
}

export async function listRetainers(actor: Actor) {
  assertCan(actor, "retainers.read");
  return prisma.retainer.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, displayName: true } }, quotas: true, periods: { orderBy: { periodStart: "desc" }, take: 1 } },
  });
}

export async function getRetainer(actor: Actor, id: string) {
  assertCan(actor, "retainers.read");
  const r = await prisma.retainer.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, displayName: true } },
      quotas: true,
      periods: {
        orderBy: { periodStart: "desc" },
        include: {
          uses: { include: { video: { select: { id: true, reference: true, title: true } } } },
          salesOrder: { select: { id: true, reference: true } },
          invoice: { select: { id: true, number: true, status: true } },
        },
      },
    },
  });
  if (!r) throw new NotFoundError();
  const videos = await prisma.video.findMany({
    where: { project: { clientId: r.clientId }, retainerCreditUse: null, status: { not: "CANCELLED" } },
    orderBy: { reference: "desc" },
    take: 100,
    select: { id: true, reference: true, title: true, type: true },
  });
  return { retainer: r, videos };
}

export async function listLegacyPayments(actor: Actor) {
  assertCan(actor, "legacy.reconcile");
  return prisma.legacyPayment.findMany({
    orderBy: [{ reconciliationStatus: "asc" }, { legacyCreatedAt: "desc" }],
    include: { client: { select: { id: true, displayName: true } }, linkedInvoice: { select: { id: true, number: true } }, linkedPayment: { select: { id: true, reference: true } } },
  });
}
