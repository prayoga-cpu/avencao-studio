import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { sp } from "@/components/app/pagination";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { EDITOR_STATUS, SKILL_LABELS, VIDEO_TYPE_LABELS, enumOptions } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { listEditors } from "@/server/queries/editors";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Monteurs") };
}

export default async function EditorsPage(props: PageProps<"/monteurs">) {
  const tr = await getT();
  const actor = await requirePagePermission("editors.read");
  const params = await props.searchParams;
  const rows = await listEditors(actor, { q: sp(params.q), status: sp(params.statut), skill: sp(params.competence), format: sp(params.format) });
  const showDue = can(actor, "supplierPayments.read");
  return (
    <>
      <PageHeader
        title={tr("Monteurs et prestataires")}
        subtitle={tr("Charge sur 7 jours d'après les heures estimées des missions. Une mission sans estimation rend la charge incomplète.")}
        actions={
          can(actor, "editors.write") ? (
            <Button asChild>
              <Link href="/monteurs/nouveau"><Plus aria-hidden /> {" "}{tr("Nouveau prestataire")}</Link>
            </Button>
          ) : null
        }
      >
        <FilterBar
          searchPlaceholder={tr("Nom ou email…")}
          filters={[
            { name: "statut", label: tr("Statut"), options: enumOptions(EDITOR_STATUS), allLabel: tr("Statut : actifs et inactifs") },
            { name: "competence", label: tr("Compétence"), options: enumOptions(SKILL_LABELS) },
            { name: "format", label: tr("Format"), options: enumOptions(VIDEO_TYPE_LABELS) },
          ]}
        />
      </PageHeader>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/monteurs/${r.id}`}
        empty={<EmptyState title={tr("Aucun prestataire")} description={tr("Enregistrez un monteur sans lui créer d'accès : l'invitation peut venir plus tard.")} />}
        columns={[
          { key: "name", header: tr("Prestataire"), cell: (r) => r.displayName },
          { key: "status", header: tr("Statut"), cell: (r) => <StatusBadge {...EDITOR_STATUS[r.status]} /> },
          { key: "skills", header: tr("Compétences"), hideOnCard: true, cell: (r) => r.skills.map((s) => tr(SKILL_LABELS[s])).join(", ") || "—" },
          { key: "formats", header: tr("Formats"), cell: (r) => r.formats.map((f) => tr(VIDEO_TYPE_LABELS[f])).join(", ") || "—" },
          { key: "missions", header: tr("Missions actives"), cell: (r) => r.activeMissions, numeric: true },
          {
            key: "load",
            header: tr("Charge 7 j"),
            numeric: true,
            cell: (r) => (
              <span className={r.overloaded ? "font-semibold text-danger" : undefined}>
                {r.plannedHours7d} h{r.capacity ? ` / ${r.capacity} h` : tr(" (capacité ?)")}
                {r.overloaded ? tr(" · surcharge") : ""}
                {r.missingEstimates ? <span className="block text-xs text-warning">{r.missingEstimates} {" "}{tr("sans estimation")}</span> : null}
              </span>
            ),
          },
          { key: "account", header: tr("Accès"), cell: (r) => (r.hasAccount ? tr("Compte lié") : tr("Sans compte")), hideOnCard: true },
          ...(showDue ? [{ key: "due", header: tr("Reste dû (EUR)"), numeric: true, cell: (r: (typeof rows)[number]) => <Money value={r.dueEur} /> }] : []),
        ]}
      />
    </>
  );
}
