import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Pencil, Receipt, ShoppingCart } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { Money, Percent } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { BulkVideosDialog } from "@/features/production/bulk-videos-dialog";
import { AttachmentsPanel } from "@/features/shared/attachments-panel";
import { NotesPanel } from "@/features/shared/notes-panel";
import { formatDateOnly, formatDateTime, toDateOnlyString } from "@/lib/dates";
import { PRIORITY, PROJECT_STATUS, VIDEO_STATUS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { MARGIN_STATUS_LABELS } from "@/server/domain/profitability";
import { can } from "@/server/policies";
import { getAttachments, getNotes } from "@/server/queries/clients";
import { getProjectDetail } from "@/server/queries/production";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Projet" };

export default async function ProjectPage(props: PageProps<"/projets/[id]">) {
  const actor = await requirePagePermission("projects.read");
  const { id } = await props.params;
  const [d, settings] = await Promise.all([getProjectDetail(actor, id), getSettings()]);
  const p = d.project;
  return (
    <>
      <PageHeader
        title={<><span className="mr-2 text-base font-semibold text-subtle">{p.reference}</span>{p.title}</>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...PROJECT_STATUS[p.status]} />
            <StatusBadge {...PRIORITY[p.priority]} />
            <Link href={`/clients/${p.client.id}`} className="hover:text-brand">{p.client.displayName}</Link>
            {p.clientDeadline ? <span>· Deadline client {formatDateOnly(p.clientDeadline)}</span> : null}
            {p.owner ? <span>· {p.owner.name}</span> : null}
          </span>
        }
        actions={
          <>
            {p.driveUrl ? <Button asChild variant="outline" size="sm"><a href={p.driveUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> Dossier</a></Button> : null}
            {can(actor, "sales.write") ? <Button asChild variant="outline" size="sm"><Link href={`/finances/ventes/nouvelle?projet=${p.id}`}><ShoppingCart aria-hidden /> Vente</Link></Button> : null}
            {can(actor, "invoices.write") ? <Button asChild variant="outline" size="sm"><Link href={`/finances/factures/nouvelle?projet=${p.id}`}><Receipt aria-hidden /> Facture</Link></Button> : null}
            {can(actor, "projects.write") ? <Button asChild size="sm"><Link href={`/projets/${p.id}/modifier`}><Pencil aria-hidden /> Modifier</Link></Button> : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          {d.finance && d.finance.unallocatedEur !== "0.00" ? (
            <Notice tone="info" title="Vente non entièrement répartie">
              <Money value={d.finance.unallocatedEur} /> de ventes ne sont pas alloués aux vidéos : le CA de gestion livré ne les comptera pas tant que la répartition n&apos;est pas faite (fiche de la vente).
            </Notice>
          ) : null}
          <Section
            title={`Vidéos (${p.videos.length})`}
            actions={
              can(actor, "videos.write") ? (
                <>
                  <Button asChild size="sm" variant="outline"><Link href={`/videos/nouvelle?projet=${p.id}`}>Vidéo seule</Link></Button>
                  <BulkVideosDialog projectId={p.id} clientDeadline={p.clientDeadline ? toDateOnlyString(p.clientDeadline) : ""} />
                </>
              ) : null
            }
          >
            <DataTable
              rows={p.videos}
              rowKey={(v) => v.id}
              rowHref={(v) => `/videos/${v.id}`}
              empty={<EmptyState title="Aucune vidéo" description="Ajoutez les livrables (ex. 6 Reels) avec leurs délais." />}
              columns={[
                { key: "t", header: "Vidéo", cell: (v) => <><span className="text-xs text-faint">{v.reference}</span><span className="block">{v.title}</span></> },
                { key: "type", header: "Type", cell: (v) => VIDEO_TYPE_LABELS[v.type], hideOnCard: true },
                { key: "s", header: "Étape", cell: (v) => <span className="flex flex-wrap gap-1"><StatusBadge {...VIDEO_STATUS[v.status]} />{v.isBlocked ? <StatusBadge label="Bloquée" tone="danger" /> : null}</span> },
                { key: "e", header: "Prestataires", cell: (v) => v.assignments.map((a) => a.editor.displayName).join(", ") || <span className="text-warning">à attribuer</span> },
                { key: "d", header: "Deadline client", cell: (v) => formatDateOnly(v.clientDeadline) },
                ...(d.videoFinance
                  ? [
                      { key: "rev", header: "Revenu alloué", numeric: true, cell: (v: (typeof p.videos)[number]) => <Money value={d.videoFinance![v.id]?.revenueEur} /> },
                      { key: "m", header: "Marge", numeric: true, cell: (v: (typeof p.videos)[number]) => { const f = d.videoFinance![v.id]; return f ? <span className="flex flex-col items-end"><Money value={f.marginEur} colorize /><span className={f.missing ? "text-xs text-warning" : "text-xs text-subtle"}>{f.missing ? "coût manquant" : <Percent value={f.ratePct} />}</span></span> : null; } },
                    ]
                  : []),
              ]}
            />
          </Section>
          {can(actor, "notes.internal") ? (
            <Section title="Notes">
              <NotesPanel notes={await getNotes(actor, { projectId: p.id })} target={{ projectId: p.id }} canAdminOnly={can(actor, "notes.adminOnly")} currentUserId={actor.id} isAdmin={actor.role === "ADMIN"} timezone={settings.timezone} />
            </Section>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          {d.finance ? (
            <Section title="Rentabilité du projet" description="Revenu contractuel (ventes acceptées) − coûts directs. Indépendant de la facturation.">
              <DefinitionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Vendu HT (net des annulations)", value: <Money value={d.finance.soldEur} /> },
                  { label: "Coûts estimés / engagés / validés", value: <span className="num"><Money value={d.finance.estimatedCostsEur} /> · <Money value={d.finance.committedCostsEur} /> · <Money value={d.finance.validatedCostsEur} /></span> },
                  { label: "Coûts directs retenus", value: <Money value={d.finance.costsEur} /> },
                  { label: MARGIN_STATUS_LABELS[d.finance.status], value: <span className="text-lg font-bold"><Money value={d.finance.marginEur} colorize /> · <Percent value={d.finance.ratePct} /></span> },
                  ...(d.finance.missing ? [{ label: "Complétude", value: <span className="text-warning">{d.finance.missing} coût(s) à renseigner</span> }] : []),
                ]}
              />
            </Section>
          ) : null}
          {d.orders ? (
            <Section title="Ventes du projet">
              {d.orders.length === 0 ? (
                <p className="text-sm text-subtle">Aucune vente enregistrée.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {d.orders.map((o) => (
                    <li key={o.id} className="flex justify-between gap-2">
                      <Link href={`/finances/ventes/${o.id}`} className="hover:text-brand">{o.reference} — {o.title}</Link>
                      <Money value={o.net} currency={o.currency as CurrencyCode} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}
          <Section title="Informations">
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: "Début", value: formatDateOnly(p.startOn) },
                { label: "Modèle", value: p.template?.name ?? "—" },
                { label: "Opportunité d'origine", value: p.opportunity ? <Link className="hover:text-brand" href={`/prospection/${p.opportunity.id}`}>{p.opportunity.title}</Link> : "—" },
                { label: "Allers-retours inclus", value: p.includedRevisionRounds ?? "—" },
                { label: "Définition d'un aller-retour", value: p.revisionRoundDefinition ?? "—" },
                { label: "Erreurs de production", value: p.productionErrorPolicy ?? "—" },
                { label: "Description", value: p.description ? <span className="whitespace-pre-wrap">{p.description}</span> : "—" },
                { label: "Autres liens", value: p.otherLinks ? <span className="whitespace-pre-wrap break-all">{p.otherLinks}</span> : "—" },
              ]}
            />
          </Section>
          <Section title="Documents">
            <AttachmentsPanel items={await getAttachments("PROJECT", p.id)} ownerType="PROJECT" ownerId={p.id} canUpload={can(actor, "projects.write")} timezone={settings.timezone} />
          </Section>
          {d.deadlineChanges.length ? (
            <Section title="Échéances déplacées">
              <ul className="flex flex-col gap-1.5 text-xs text-subtle">
                {d.deadlineChanges.map((c) => (
                  <li key={c.id}>{formatDateTime(c.createdAt, settings.timezone)} : {formatDateOnly(c.oldDate)} → {formatDateOnly(c.newDate)}{c.reason ? ` — ${c.reason}` : ""}</li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}
