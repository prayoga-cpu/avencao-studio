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

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage(props: PageProps<"/clients">) {
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
        title="Clients"
        subtitle="Fiches clients, contacts, historique et relances. Les archivés sont masqués par défaut."
        actions={
          can(actor, "clients.write") ? (
            <>
              {can(actor, "clients.import") ? (
                <Button asChild variant="outline">
                  <Link href="/clients/import">
                    <Upload aria-hidden /> Import CSV
                  </Link>
                </Button>
              ) : null}
              <Button asChild>
                <Link href="/clients/nouveau">
                  <Plus aria-hidden /> Nouveau client
                </Link>
              </Button>
            </>
          ) : null
        }
      >
        <FilterBar
          searchPlaceholder="Nom, email, contact…"
          filters={[
            { name: "statut", label: "Statut", options: enumOptions(CLIENT_STATUS), allLabel: "Statut : actifs et prospects" },
            { name: "tag", label: "Étiquette", options: tags },
            { name: "responsable", label: "Responsable", options: owners },
          ]}
        />
      </PageHeader>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/clients/${r.id}`}
        caption="Liste des clients"
        empty={
          <EmptyState
            title={params.q || params.statut || params.tag ? "Aucun client ne correspond à ces filtres" : "Aucun client pour l'instant"}
            description="Créez votre premier client ou importez une liste CSV."
            action={can(actor, "clients.write") ? <Button asChild><Link href="/clients/nouveau">Nouveau client</Link></Button> : null}
          />
        }
        columns={[
          { key: "name", header: "Client", cell: (r) => r.displayName },
          { key: "status", header: "Statut", cell: (r) => <StatusBadge {...CLIENT_STATUS[r.status]} /> },
          { key: "contact", header: "Contact principal", cell: (r) => r.contact ?? "—" },
          { key: "email", header: "Email", cell: (r) => r.email ?? "—", hideOnCard: true },
          { key: "projects", header: "Projets en cours", cell: (r) => r.activeProjects, numeric: true },
          {
            key: "follow",
            header: "Prochaine relance",
            cell: (r) =>
              r.nextFollowUpOn ? (
                <span className={r.nextFollowUpOn <= today ? "font-semibold text-warning" : undefined}>
                  {formatDateOnly(r.nextFollowUpOn)}
                  {r.nextFollowUpOn <= today ? " · à relancer" : ""}
                </span>
              ) : (
                "—"
              ),
          },
          { key: "owner", header: "Responsable", cell: (r) => r.owner ?? "—", hideOnCard: true },
          {
            key: "tags",
            header: "Étiquettes",
            hideOnCard: true,
            cell: (r) => (r.tags.length ? <span className="flex flex-wrap gap-1">{r.tags.map((t) => <StatusBadge key={t} label={t} tone="muted" />)}</span> : "—"),
          },
        ]}
      />
      <Pagination page={page} total={total} basePath="/clients" searchParams={params} />
    </>
  );
}
