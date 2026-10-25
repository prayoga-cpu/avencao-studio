import { NextResponse, type NextRequest } from "next/server";
import { isIsoDate, resolvePeriod } from "@/lib/dates";
import { getActor } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import { can } from "@/server/policies";
import { listExpenses, listInvoices } from "@/server/queries/finance";
import { agencyToday } from "@/server/services/common";
import { buildReport, toCsv, type ReportTable } from "@/server/services/reports";
import { recordAudit } from "@/server/audit";
import { prisma } from "@/server/db";

/**
 * Exports CSV : mêmes contrôles que l'écran (session + permission du rapport). Aucun champ
 * financier n'est exporté pour un utilisateur qui ne peut pas le consulter.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/exports/[report]">) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const { report } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  const today = await agencyToday();
  const du = sp.get("du");
  const au = sp.get("au");
  const period = du && au && isIsoDate(du) && isIsoDate(au) ? resolvePeriod("custom", today, { from: du, to: au }) : resolvePeriod("month", today);
  try {
    let table: ReportTable;
    if (report === "factures") {
      if (!can(actor, "invoices.read")) throw new ForbiddenError();
      const rows = await listInvoices(actor, { client: sp.get("client") ?? undefined });
      table = {
        key: "factures", title: "Factures", dateBasis: "Date d'émission ; solde au jour de l'export",
        columns: [{ key: "number", label: "Numéro" }, { key: "client", label: "Client" }, { key: "issueDate", label: "Émission" }, { key: "dueDate", label: "Échéance" }, { key: "state", label: "État" }, { key: "currency", label: "Devise" }, { key: "totalNet", label: "HT", kind: "money" }, { key: "totalGross", label: "TTC", kind: "money" }, { key: "balance", label: "Solde", kind: "money" }],
        rows: rows.map((r) => ({ number: r.number, client: r.client.displayName, issueDate: r.issueDate, dueDate: r.dueDate, state: r.overdue ? `${r.state} (en retard)` : r.state, currency: r.currency, totalNet: r.totalNet, totalGross: r.totalGross, balance: r.balance })),
      };
    } else if (report === "charges") {
      if (!can(actor, "expenses.read")) throw new ForbiddenError();
      const rows = await listExpenses(actor, { from: period.from, to: period.to });
      table = {
        key: "charges", title: `Charges de structure — ${period.label}`, dateBasis: "Mois de rattachement",
        columns: [{ key: "periodMonth", label: "Rattachement" }, { key: "label", label: "Charge" }, { key: "category", label: "Catégorie" }, { key: "supplier", label: "Fournisseur" }, { key: "currency", label: "Devise" }, { key: "amountNet", label: "HT (devise)", kind: "money" }, { key: "costEur", label: "Coût EUR", kind: "money" }, { key: "paid", label: "Payée" }],
        rows: rows
          .filter((r) => r.status === "RECORDED")
          .map((r) => ({ periodMonth: r.periodMonth, label: r.label, category: r.category, supplier: r.supplier, currency: r.currency, amountNet: r.amountNet, costEur: r.costEur, paid: r.isPaid ? (r.paidOn ?? "oui") : "non" })),
      };
    } else {
      table = await buildReport(actor, report, period);
    }
    await recordAudit(prisma, { actorId: actor.id, action: "export.csv", entityType: "Report", entityId: report, after: { from: period.from, to: period.to, rows: table.rows.length } });
    return new NextResponse(toCsv(table), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="avencao-${report}-${period.from}_${period.to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    console.error("[export] échec", (e as Error).message);
    return NextResponse.json({ error: "Export impossible." }, { status: 500 });
  }
}
