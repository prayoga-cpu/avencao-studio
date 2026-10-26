import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ExpenseForm } from "@/features/finance/movement-forms";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { agencyToday } from "@/server/services/common";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Nouvelle charge") };
}

export default async function NewExpensePage() {
  const tr = await getT();
  await requirePagePermission("expenses.write");
  const [categories, today] = await Promise.all([prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }), agencyToday()]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Nouvelle charge de structure")} subtitle={tr("Une dépense de production se saisit comme coût direct, jamais ici.")} />
      <ExpenseForm
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        defaults={{ categoryId: "", label: "", supplier: "", expenseDate: today, periodMonth: today.slice(0, 7), amountNet: "", vatAmount: "", vatRecoverable: true, currency: "EUR", manualFxRate: "", recurrence: "NONE", isPaid: true, paidOn: today, notes: "" }}
      />
    </div>
  );
}
