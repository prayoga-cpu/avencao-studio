import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDateOnly } from "@/lib/dates";
import { COST_STAGE, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { dec, sum, type CurrencyCode } from "@/lib/money";
import { requireActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { can } from "@/server/policies";

export const metadata: Metadata = { title: "Mes règlements" };

/** Rémunération du monteur connecté uniquement : ses coûts, ses paiements, ses justificatifs. */
export default async function MyPaymentsPage() {
  const actor = await requireActor();
  if (!can(actor, "earnings.own")) redirect("/");
  if (!actor.editorId) {
    return <EmptyState title="Compte non relié à une fiche prestataire" />;
  }
  const [costs, payments] = await Promise.all([
    prisma.directCost.findMany({
      where: { editorId: actor.editorId, stage: { not: "CANCELLED" } },
      orderBy: { incurredOn: "desc" },
      select: {
        id: true, label: true, amount: true, currency: true, stage: true, incurredOn: true,
        video: { select: { reference: true, title: true } },
        paymentAllocations: { where: { reversedAt: null, payment: { status: "RECORDED" } }, select: { amount: true } },
      },
    }),
    prisma.supplierPayment.findMany({
      where: { editorId: actor.editorId, status: "RECORDED" },
      orderBy: { paidOn: "desc" },
      select: { id: true, paidOn: true, amount: true, currency: true, method: true, reference: true, proofAttachmentId: true, allocations: { where: { reversedAt: null }, select: { id: true } } },
    }),
  ]);
  const rows = costs.map((c) => {
    const paid = sum(c.paymentAllocations.map((p) => dec(p.amount)));
    return { ...c, paid: paid.toFixed(2), due: c.amount ? dec(c.amount).minus(paid).toFixed(2) : null };
  });
  const byCurrency = new Map<string, { validated: string; due: string }>();
  for (const cur of new Set(rows.map((r) => r.currency))) {
    const list = rows.filter((r) => r.currency === cur && r.amount);
    byCurrency.set(cur, {
      validated: sum(list.filter((r) => r.stage === "VALIDATED").map((r) => dec(r.amount))).toFixed(2),
      due: sum(list.filter((r) => r.stage !== "ESTIMATED").map((r) => dec(r.due))).toFixed(2),
    });
  }
  return (
    <>
      <PageHeader title="Mes règlements" subtitle="Montants engagés, validés et payés pour vos missions. Aucun virement n'est déclenché depuis le CRM." />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[...byCurrency.entries()].map(([cur, v]) => (
          <div key={cur} className="rounded-xl border border-brand-border bg-surface p-4">
            <p className="text-xs uppercase text-subtle">Reste dû ({cur})</p>
            <p className="mt-1 text-xl font-bold"><Money value={v.due} currency={cur as CurrencyCode} /></p>
            <p className="text-xs text-faint">dont validé : <Money value={v.validated} currency={cur as CurrencyCode} /></p>
          </div>
        ))}
      </div>
      <Section title="Missions et rémunération" className="mb-5">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="Aucune rémunération enregistrée" />}
          columns={[
            { key: "l", header: "Mission", cell: (r) => (r.video ? `${r.video.reference} — ${r.video.title}` : r.label) },
            { key: "d", header: "Date", cell: (r) => formatDateOnly(r.incurredOn) },
            { key: "s", header: "Étape", cell: (r) => <StatusBadge {...COST_STAGE[r.stage]} /> },
            { key: "a", header: "Montant", numeric: true, cell: (r) => <Money value={r.amount?.toFixed(2) ?? null} currency={r.currency as CurrencyCode} empty="à renseigner" /> },
            { key: "p", header: "Payé", numeric: true, cell: (r) => <Money value={r.paid} currency={r.currency as CurrencyCode} /> },
            { key: "r", header: "Reste", numeric: true, cell: (r) => <Money value={r.due} currency={r.currency as CurrencyCode} empty="—" /> },
          ]}
        />
      </Section>
      <Section title="Paiements reçus">
        <DataTable
          rows={payments}
          rowKey={(p) => p.id}
          empty={<p className="text-sm text-subtle">Aucun paiement enregistré.</p>}
          columns={[
            { key: "d", header: "Date", cell: (p) => formatDateOnly(p.paidOn) },
            { key: "m", header: "Moyen", cell: (p) => PAYMENT_METHOD_LABELS[p.method] },
            { key: "r", header: "Référence", cell: (p) => p.reference ?? "—" },
            { key: "n", header: "Missions couvertes", numeric: true, cell: (p) => p.allocations.length },
            { key: "a", header: "Montant", numeric: true, cell: (p) => <Money value={p.amount.toFixed(2)} currency={p.currency as CurrencyCode} /> },
            { key: "j", header: "Justificatif", cell: (p) => (p.proofAttachmentId ? <a className="text-brand hover:underline" href={`/api/files/${p.proofAttachmentId}`} target="_blank" rel="noreferrer">Ouvrir</a> : "—") },
          ]}
        />
      </Section>
    </>
  );
}
