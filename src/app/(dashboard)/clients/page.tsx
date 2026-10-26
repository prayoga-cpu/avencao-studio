import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { PAGE_SIZE, Pagination, pageFrom, sp } from "@/components/app/pagination";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/dates";
import { CLIENT_STATUS, enumOptions } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { listClients } from "@/server/queries/clients";
import { staffOptions, tagOptions } from "@/server/queries/options";
import { agencyToday } from "@/server/services/common";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Clients") };
}

export default async function ClientsPage(props: PageProps<"/clients">) {
  const tr = await getT();
  const actor = await requirePagePermission("clients.read");
  const params = await props.searchParams;
  const page = pageFrom(params);
  const [{ rows, total }, tags, owners, today] = await Promise.all([
    listClients(actor, { q: sp(params.q), status: sp(params.statut), tag: sp(params.tag), owner: sp(params.responsable), page, pageSize: PAGE_SIZE }),
    tagOptions(),
    staffOptions(),
    agencyToday(),
  ]);
  return (
    <>
      <PageHeader
        title={tr("Clients")}
        subtitle={tr("Fiches clients, contacts, historique et relances. Les archivés sont masqués par défaut.")}
        actions={
          can(actor, "clients.write") ? (
            <>
              {can(actor, "clients.import") ? (
                <Button asChild variant="outline">
                  <Link href="/clients/import">
                    <Upload aria-hidden /> {" "}{tr("Import CSV")}</Link>
                </Button>
              ) : null}
              <Button asChild>
                <Link href="/clients/nouveau">
                  <Plus aria-hidden /> {" "}{tr("Nouveau client")}</Link>
              </Button>
            </>
          ) : null
        }
      >
        <FilterBar
          searchPlaceholder={tr("Nom, email, contact…")}
          filters={[
            { name: "statut", label: tr("Statut"), options: enumOptions(CLIENT_STATUS), allLabel: tr("Statut : actifs et prospects") },
            { name: "tag", label: tr("Étiquette"), options: tags },
            { name: "responsable", label: tr("Responsable"), options: owners },
          ]}
        />
      </PageHeader>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/clients/${r.id}`}
        caption={tr("Liste des clients")}
        empty={
          <EmptyState
            title={params.q || params.statut || params.tag ? tr("Aucun client ne correspond à ces filtres") : tr("Aucun client pour l'instant")}
            description={tr("Créez votre premier client ou importez une liste CSV.")}
            action={can(actor, "clients.write") ? <Button asChild><Link href="/clients/nouveau">{tr("Nouveau client")}</Link></Button> : null}
          />
        }
        columns={[
          { key: "name", header: tr("Client"), cell: (r) => r.displayName },
          { key: "status", header: tr("Statut"), cell: (r) => <StatusBadge {...CLIENT_STATUS[r.status]} /> },
          { key: "contact", header: tr("Contact principal"), cell: (r) => r.contact ?? "—" },
          { key: "email", header: tr("Email"), cell: (r) => r.email ?? "—", hideOnCard: true },
          { key: "projects", header: tr("Projets en cours"), cell: (r) => r.activeProjects, numeric: true },
          {
            key: "follow",
            header: tr("Prochaine relance"),
            cell: (r) =>
              r.nextFollowUpOn ? (
                <span className={r.nextFollowUpOn <= today ? "font-semibold text-warning" : undefined}>
                  {formatDateOnly(r.nextFollowUpOn)}
                  {r.nextFollowUpOn <= today ? tr(" · à relancer") : ""}
                </span>
              ) : (
                "—"
              ),
          },
          { key: "owner", header: tr("Responsable"), cell: (r) => r.owner ?? "—", hideOnCard: true },
          {
            key: "tags",
            header: tr("Étiquettes"),
            hideOnCard: true,
            cell: (r) => (r.tags.length ? <span className="flex flex-wrap gap-1">{r.tags.map((t) => <StatusBadge key={t} label={t} tone="muted" />)}</span> : "—"),
          },
        ]}
      />
      <Pagination page={page} total={total} basePath="/clients" searchParams={params} />
    </>
  );
}
