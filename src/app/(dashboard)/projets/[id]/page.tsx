import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Pencil, Receipt, ShoppingCart } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money, Percent } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { ProjectPriceDialog } from "@/features/finance/project-price-dialog";
import { BulkVideosDialog } from "@/features/production/bulk-videos-dialog";
import { ProjectVideos, type ProjectVideoRow } from "@/features/production/project-videos";
import { AttachmentsPanel } from "@/features/shared/attachments-panel";
import { NotesPanel } from "@/features/shared/notes-panel";
import { formatDateOnly, formatDateTime, toDateOnlyString } from "@/lib/dates";
import { PRIORITY, PROJECT_STATUS } from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { MARGIN_STATUS_LABELS } from "@/server/domain/profitability";
import { ACTIVE_VIDEO_STATUSES } from "@/server/domain/video-workflow";
import { can } from "@/server/policies";
import { getAttachments, getNotes } from "@/server/queries/clients";
import { getEditorChoices } from "@/server/queries/editors";
import { getProjectDetail } from "@/server/queries/production";
import { agencyToday } from "@/server/services/common";
import { getSettings } from "@/server/settings";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Projet") };
}

export default async function ProjectPage(props: PageProps<"/projets/[id]">) {
  const tr = await getT();
  const actor = await requirePagePermission("projects.read");
  const { id } = await props.params;
  const canAssign = can(actor, "assignments.write");
  const [d, settings, today, editorChoices] = await Promise.all([
    getProjectDetail(actor, id),
    getSettings(),
    agencyToday(),
    canAssign ? getEditorChoices(actor) : Promise.resolve([]),
  ]);
  const p = d.project;
  const rows: ProjectVideoRow[] = p.videos.map((v) => {
    const deadline = v.clientDeadline ? toDateOnlyString(v.clientDeadline) : null;
    const f = d.videoFinance?.[v.id];
    return {
      id: v.id,
      reference: v.reference,
      title: v.title,
      type: v.type,
      status: v.status,
      isBlocked: v.isBlocked,
      editors: v.assignments.map((a) => a.editor.displayName),
      clientDeadline: deadline,
      overdue: deadline !== null && deadline < today && ACTIVE_VIDEO_STATUSES.includes(v.status) && v.status !== "APPROVED",
      finance: f ? { revenueEur: f.revenueEur, marginEur: f.marginEur, ratePct: f.ratePct, missing: f.missing } : null,
    };
  });
  const activeVideos = p.videos.filter((v) => v.status !== "CANCELLED").length;
  const inProduction = p.videos.filter((v) => ACTIVE_VIDEO_STATUSES.includes(v.status)).length;
  const priceButton = (variant: "default" | "outline") =>
    can(actor, "sales.write") ? (
      <ProjectPriceDialog projectId={p.id} projectTitle={p.title} today={today} activeVideos={activeVideos} existingSales={d.orders?.length ?? 0} variant={variant} />
    ) : null;
  return (
    <>
      <PageHeader
        title={<><span className="mr-2 text-base font-semibold text-subtle">{p.reference}</span>{p.title}</>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...PROJECT_STATUS[p.status]} />
            <StatusBadge {...PRIORITY[p.priority]} />
            <Link href={`/clients/${p.client.id}`} className="hover:text-brand">{p.client.displayName}</Link>
            {p.clientDeadline ? <span>{tr("· Deadline client")}{" "}{formatDateOnly(p.clientDeadline)}</span> : null}
            {p.owner ? <span>· {p.owner.name}</span> : null}
          </span>
        }
        actions={
          <>
            {p.driveUrl ? <Button asChild variant="outline" size="sm"><a href={p.driveUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> {" "}{tr("Dossier")}</a></Button> : null}
            {can(actor, "sales.write") ? <Button asChild variant="outline" size="sm"><Link href={`/finances/ventes/nouvelle?projet=${p.id}`}><ShoppingCart aria-hidden /> {" "}{tr("Vente")}</Link></Button> : null}
            {can(actor, "invoices.write") ? <Button asChild variant="outline" size="sm"><Link href={`/finances/factures/nouvelle?projet=${p.id}`}><Receipt aria-hidden /> {" "}{tr("Facture")}</Link></Button> : null}
            {can(actor, "projects.write") ? <Button asChild size="sm"><Link href={`/projets/${p.id}/modifier`}><Pencil aria-hidden /> {" "}{tr("Modifier")}</Link></Button> : null}
          </>
        }
      />
      {(p.status === "COMPLETED" || p.status === "ARCHIVED") && inProduction > 0 ? (
        <Notice tone="warning" title={tr("Statut du projet incohérent")} className="mb-5">
          {tr("Le projet est « {0} » alors que {1} vidéo(s) sont encore en production. Livrez-les ou annulez-les, ou repassez le projet « En cours ».", [tr(PROJECT_STATUS[p.status].label), inProduction])}
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
          {d.finance && d.finance.unallocatedEur !== "0.00" ? (
            <Notice tone="info" title={tr("Vente non entièrement répartie")}>
              <Money value={d.finance.unallocatedEur} /> {" "}{tr("de ventes ne sont pas alloués aux vidéos : le CA de gestion livré ne les comptera pas tant que la répartition n'est pas faite (fiche de la vente).")}</Notice>
          ) : null}
          <Section
            title={tr("Vidéos ({0})", [p.videos.length])}
            actions={
              can(actor, "videos.write") ? (
                <>
                  <Button asChild size="sm" variant="outline"><Link href={`/videos/nouvelle?projet=${p.id}`}>{tr("Vidéo seule")}</Link></Button>
                  <BulkVideosDialog projectId={p.id} clientDeadline={p.clientDeadline ? toDateOnlyString(p.clientDeadline) : ""} />
                </>
              ) : null
            }
          >
            <ProjectVideos
              rows={rows}
              showFinance={!!d.videoFinance}
              canBulk={can(actor, "videos.write")}
              canForce={actor.role === "ADMIN"}
              assign={canAssign ? { editors: editorChoices, canSetPrice: can(actor, "costs.write") } : null}
              empty={<EmptyState title={tr("Aucune vidéo")} description={tr("Ajoutez les livrables (ex. 6 Reels) avec leurs délais.")} />}
            />
          </Section>
          {can(actor, "notes.internal") ? (
            <Section title={tr("Notes")}>
              <NotesPanel notes={await getNotes(actor, { projectId: p.id })} target={{ projectId: p.id }} canAdminOnly={can(actor, "notes.adminOnly")} currentUserId={actor.id} isAdmin={actor.role === "ADMIN"} timezone={settings.timezone} />
            </Section>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          {d.finance ? (
            <Section title={tr("Rentabilité du projet")} description={tr("Revenu contractuel (ventes acceptées) − coûts directs. Indépendant de la facturation.")}>
              <DefinitionList
                className="sm:grid-cols-1"
                items={[
                  { label: tr("Vendu HT (net des annulations)"), value: <Money value={d.finance.soldEur} /> },
                  { label: tr("Coûts estimés / engagés / validés"), value: <span className="num"><Money value={d.finance.estimatedCostsEur} /> · <Money value={d.finance.committedCostsEur} /> · <Money value={d.finance.validatedCostsEur} /></span> },
                  { label: tr("Coûts directs retenus"), value: <Money value={d.finance.costsEur} /> },
                  { label: tr(MARGIN_STATUS_LABELS[d.finance.status]), value: <span className="text-lg font-bold"><Money value={d.finance.marginEur} colorize /> · <Percent value={d.finance.ratePct} /></span> },
                  ...(d.finance.missing ? [{ label: tr("Complétude"), value: <span className="text-warning">{d.finance.missing} {" "}{tr("coût(s) à renseigner")}</span> }] : []),
                ]}
              />
            </Section>
          ) : null}
          {d.orders ? (
            <Section title={tr("Ventes du projet")} actions={d.orders.length ? priceButton("outline") : null}>
              {d.orders.length === 0 ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-subtle">{tr("Aucune vente enregistrée : le revenu et la marge des vidéos restent à 0 tant que le projet n'a pas de prix.")}</p>
                  {priceButton("default")}
                </div>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {d.orders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                      <Link href={`/finances/ventes/${o.id}`} className="min-w-0 hover:text-brand">
                        <span className="num whitespace-nowrap text-xs text-faint">{o.reference}</span>
                        <span className="block">{o.title}</span>
                      </Link>
                      <span className="flex flex-col items-end gap-1">
                        <Money value={o.net} currency={o.currency as CurrencyCode} />
                        {o.status === "CANCELLED" ? <StatusBadge label={tr("Annulée")} tone="danger" /> : o.autoAllocate ? <StatusBadge label={tr("Forfait réparti automatiquement")} tone="info" /> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}
          <Section title={tr("Informations")}>
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: tr("Début"), value: formatDateOnly(p.startOn) },
                { label: tr("Modèle"), value: p.template?.name ?? "—" },
                { label: tr("Opportunité d'origine"), value: p.opportunity ? <Link className="hover:text-brand" href={`/prospection/${p.opportunity.id}`}>{p.opportunity.title}</Link> : "—" },
                { label: tr("Allers-retours inclus"), value: p.includedRevisionRounds ?? "—" },
                { label: tr("Définition d'un aller-retour"), value: p.revisionRoundDefinition ?? "—" },
                { label: tr("Erreurs de production"), value: p.productionErrorPolicy ?? "—" },
                { label: tr("Description"), value: p.description ? <span className="whitespace-pre-wrap">{p.description}</span> : "—" },
                { label: tr("Autres liens"), value: p.otherLinks ? <span className="whitespace-pre-wrap break-all">{p.otherLinks}</span> : "—" },
              ]}
            />
          </Section>
          <Section title={tr("Documents")}>
            <AttachmentsPanel items={await getAttachments("PROJECT", p.id)} ownerType="PROJECT" ownerId={p.id} canUpload={can(actor, "projects.write")} timezone={settings.timezone} />
          </Section>
          {d.deadlineChanges.length ? (
            <Section title={tr("Échéances déplacées")}>
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
