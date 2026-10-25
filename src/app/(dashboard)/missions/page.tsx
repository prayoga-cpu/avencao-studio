import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDateOnly, toDateOnlyString } from "@/lib/dates";
import { ASSIGNMENT_ROLE_LABELS, ASSIGNMENT_STATUS, VIDEO_STATUS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { requireActor } from "@/server/auth/session";
import { can } from "@/server/policies";
import { listEditorMissions } from "@/server/queries/production";

export const metadata: Metadata = { title: "Mes missions" };

export default async function MissionsPage() {
  const actor = await requireActor();
  if (!can(actor, "missions.own")) redirect("/videos");
  const { today, rows } = await listEditorMissions(actor);
  const active = rows.filter((r) => !["APPROVED", "CANCELLED"].includes(r.status) && !["DELIVERED", "ARCHIVED", "CANCELLED"].includes(r.video.status));
  const done = rows.filter((r) => !active.includes(r));
  return (
    <>
      <PageHeader title="Mes missions" subtitle="Vos vidéos, briefs, liens et retours. Déposez vos versions depuis chaque mission." />
      {!actor.editorId ? (
        <EmptyState title="Compte non relié à une fiche prestataire" description="Demandez à l'administrateur de relier votre compte à votre fiche monteur." />
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-sm font-bold">En cours ({active.length})</h2>
            <DataTable
              rows={active}
              rowKey={(r) => r.id}
              rowHref={(r) => `/missions/${r.video.id}`}
              empty={<EmptyState title="Aucune mission en cours" />}
              columns={[
                { key: "v", header: "Vidéo", cell: (r) => <><span className="text-xs text-faint">{r.video.reference} · {VIDEO_TYPE_LABELS[r.video.type]}</span><span className="block">{r.video.title}</span></> },
                { key: "c", header: "Client", cell: (r) => r.video.project.client.displayName },
                { key: "r", header: "Rôle", cell: (r) => ASSIGNMENT_ROLE_LABELS[r.role] },
                { key: "s", header: "Étape", cell: (r) => <span className="flex flex-wrap gap-1"><StatusBadge {...VIDEO_STATUS[r.video.status]} />{r.video.isBlocked ? <StatusBadge label="Bloquée" tone="danger" /> : null}</span> },
                {
                  key: "d",
                  header: "Échéance",
                  cell: (r) => {
                    const due = r.dueOn ? toDateOnlyString(r.dueOn) : null;
                    return <span className={due && due < today ? "font-semibold text-danger" : undefined}>{formatDateOnly(due)}{due && due < today ? " · en retard" : ""}</span>;
                  },
                },
                { key: "h", header: "Heures prévues", numeric: true, cell: (r) => (r.estimatedHours ? `${r.estimatedHours.toFixed()} h` : "—") },
              ]}
            />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-bold">Terminées ou annulées ({done.length})</h2>
            <DataTable
              rows={done}
              rowKey={(r) => r.id}
              rowHref={(r) => `/missions/${r.video.id}`}
              empty={<p className="text-sm text-subtle">Rien pour l&apos;instant.</p>}
              columns={[
                { key: "v", header: "Vidéo", cell: (r) => `${r.video.reference} — ${r.video.title}` },
                { key: "c", header: "Client", cell: (r) => r.video.project.client.displayName },
                { key: "s", header: "Mission", cell: (r) => <StatusBadge {...ASSIGNMENT_STATUS[r.status]} /> },
                { key: "vs", header: "Vidéo", cell: (r) => <StatusBadge {...VIDEO_STATUS[r.video.status]} /> },
              ]}
            />
          </section>
        </div>
      )}
    </>
  );
}
