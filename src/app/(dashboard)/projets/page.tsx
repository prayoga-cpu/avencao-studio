import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { Money, Percent } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PAGE_SIZE, Pagination, pageFrom, sp } from "@/components/app/pagination";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/dates";
import { PRIORITY, PROJECT_STATUS, enumOptions } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { clientOptions, staffOptions } from "@/server/queries/options";
import { listProjects } from "@/server/queries/production";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Projets") };
}

export default async function ProjectsPage(props: PageProps<"/projets">) {
  const tr = await getT();
  const actor = await requirePagePermission("projects.read");
  const params = await props.searchParams;
  const page = pageFrom(params);
  const [{ rows, total }, clients, owners] = await Promise.all([
    listProjects(actor, { q: sp(params.q), status: sp(params.statut), client: sp(params.client), owner: sp(params.responsable), page, pageSize: PAGE_SIZE }),
    clientOptions(),
    staffOptions(),
  ]);
  const showFinance = can(actor, "margins.project");
  return (
    <>
      <PageHeader
        title={tr("Projets")}
        subtitle={tr("Commandes, campagnes ou périodes de collaboration — chacune contient un ou plusieurs livrables vidéo.")}
        actions={can(actor, "projects.write") ? <Button asChild><Link href="/projets/nouveau"><Plus aria-hidden /> {" "}{tr("Nouveau projet")}</Link></Button> : null}
      >
        <FilterBar
          searchPlaceholder={tr("Titre, référence, client…")}
          filters={[
            { name: "statut", label: tr("Statut"), options: enumOptions(PROJECT_STATUS), allLabel: tr("Statut : en cours") },
            { name: "client", label: tr("Client"), options: clients },
            { name: "responsable", label: tr("Responsable"), options: owners },
          ]}
        />
      </PageHeader>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/projets/${r.id}`}
        empty={<EmptyState title={tr("Aucun projet")} description={tr("Créez un projet depuis un client, une opportunité gagnée ou ici.")} />}
        columns={[
          { key: "t", header: tr("Projet"), cell: (r) => <><span className="text-xs text-faint">{r.reference}</span><span className="block">{r.title}</span></> },
          { key: "c", header: tr("Client"), cell: (r) => r.client.displayName },
          { key: "s", header: tr("Statut"), cell: (r) => <StatusBadge {...PROJECT_STATUS[r.status]} /> },
          { key: "p", header: tr("Priorité"), cell: (r) => <StatusBadge {...PRIORITY[r.priority]} />, hideOnCard: true },
          { key: "v", header: tr("Livrées"), cell: (r) => `${r.deliveredCount} / ${r.videoCount}`, numeric: true },
          { key: "d", header: tr("Deadline client"), cell: (r) => formatDateOnly(r.clientDeadline) },
          { key: "o", header: tr("Responsable"), cell: (r) => r.owner ?? "—", hideOnCard: true },
          ...(showFinance
            ? [
                { key: "sold", header: tr("Vendu HT"), numeric: true, cell: (r: (typeof rows)[number]) => <Money value={r.finance?.soldEur} /> },
                {
                  key: "m",
                  header: tr("Marge"),
                  numeric: true,
                  cell: (r: (typeof rows)[number]) =>
                    r.finance ? (
                      <span className="flex flex-col items-end">
                        <Money value={r.finance.marginEur} colorize />
                        <span className={r.finance.missing ? "text-xs text-warning" : "text-xs text-subtle"}>
                          {r.finance.missing ? tr("provisoire · {0} coût(s) manquant(s)", [r.finance.missing]) : <Percent value={r.finance.ratePct} />}
                        </span>
                      </span>
                    ) : null,
                },
              ]
            : []),
        ]}
      />
      <Pagination page={page} total={total} basePath="/projets" searchParams={params} />
    </>
  );
}
