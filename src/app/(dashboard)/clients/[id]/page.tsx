import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FolderPlus, Pencil, Target } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { Money, Percent } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { TabLinks } from "@/components/app/tab-links";
import { Button } from "@/components/ui/button";
import { AttachmentsPanel } from "@/features/shared/attachments-panel";
import { NotesPanel } from "@/features/shared/notes-panel";
import { formatDateOnly, formatDateTime, toDateOnlyString } from "@/lib/dates";
import {
  ACTIVITY_TYPE_LABELS,
  CLIENT_KIND_LABELS,
  CLIENT_STATUS,
  INVOICE_PAYMENT_STATE,
  OPPORTUNITY_STAGE,
  PROJECT_STATUS,
  VIDEO_STATUS,
  VIDEO_TYPE_LABELS,
} from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { MARGIN_STATUS_LABELS } from "@/server/domain/profitability";
import { can } from "@/server/policies";
import { getAttachments, getClient, getClientFinance, getClientOverview, getNotes } from "@/server/queries/clients";
import { getSettings } from "@/server/settings";
import { ContactsPanel } from "./contacts-panel";

export const metadata: Metadata = { title: "Fiche client" };

const TABS = [
  { value: "apercu", label: "Vue d'ensemble" },
  { value: "projets", label: "Projets" },
  { value: "videos", label: "Vidéos" },
  { value: "finances", label: "Finances" },
  { value: "notes", label: "Notes" },
  { value: "documents", label: "Documents" },
];

export default async function ClientPage(props: PageProps<"/clients/[id]">) {
  const actor = await requirePagePermission("clients.read");
  const { id } = await props.params;
  const params = await props.searchParams;
  const client = await getClient(actor, id);
  const settings = await getSettings();
  const tabs = TABS.filter((t) => t.value !== "finances" || can(actor, "invoices.read"));
  const tab = tabs.some((t) => t.value === params.onglet) ? (params.onglet as string) : "apercu";
  const canWrite = can(actor, "clients.write");

  return (
    <>
      <PageHeader
        title={client.displayName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...CLIENT_STATUS[client.status]} />
            <span>{CLIENT_KIND_LABELS[client.kind]}</span>
            {client.country ? <span>· {client.country}</span> : null}
            {client.owner ? <span>· Responsable : {client.owner.name}</span> : null}
            {client.tags.map((t) => (
              <StatusBadge key={t.tagId} label={t.tag.name} tone="muted" />
            ))}
          </span>
        }
        actions={
          <>
            {client.driveUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={client.driveUrl} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden /> Drive
                </a>
              </Button>
            ) : null}
            {can(actor, "prospection.write") ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/prospection/nouveau?client=${client.id}`}>
                  <Target aria-hidden /> Opportunité
                </Link>
              </Button>
            ) : null}
            {can(actor, "projects.write") ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/projets/nouveau?client=${client.id}`}>
                  <FolderPlus aria-hidden /> Projet
                </Link>
              </Button>
            ) : null}
            {canWrite ? (
              <Button asChild size="sm">
                <Link href={`/clients/${client.id}/modifier`}>
                  <Pencil aria-hidden /> Modifier
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <TabLinks tabs={tabs} active={tab} basePath={`/clients/${client.id}`} />

      {tab === "apercu" ? <Overview clientId={client.id} client={client} canWrite={canWrite} timezone={settings.timezone} /> : null}
      {tab === "projets" ? <ProjectsTab clientId={client.id} /> : null}
      {tab === "videos" ? <VideosTab clientId={client.id} /> : null}
      {tab === "finances" ? <FinanceTab clientId={client.id} /> : null}
      {tab === "notes" ? (
        <Section title="Notes internes">
          <NotesPanel
            notes={await getNotes(actor, { clientId: client.id })}
            target={{ clientId: client.id }}
            canAdminOnly={can(actor, "notes.adminOnly")}
            currentUserId={actor.id}
            isAdmin={actor.role === "ADMIN"}
            timezone={settings.timezone}
          />
        </Section>
      ) : null}
      {tab === "documents" ? (
        <Section title="Documents">
          <AttachmentsPanel items={await getAttachments("CLIENT", client.id)} ownerType="CLIENT" ownerId={client.id} canUpload={canWrite} timezone={settings.timezone} />
        </Section>
      ) : null}
    </>
  );

  async function Overview({
    clientId,
    client: c,
    canWrite: cw,
    timezone,
  }: {
    clientId: string;
    client: Awaited<ReturnType<typeof getClient>>;
    canWrite: boolean;
    timezone: string;
  }) {
    const o = await getClientOverview(actor, clientId);
    const followUpDue = c.nextFollowUpOn && toDateOnlyString(c.nextFollowUpOn) <= o.today;
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          {followUpDue ? (
            <Notice tone="warning" title="Relance à faire">
              Relance prévue le {formatDateOnly(c.nextFollowUpOn)}.
            </Notice>
          ) : null}
          <Section title="Échéances à venir" description="Vidéos en cours, par deadline client.">
            {o.nextDeadlines.length === 0 ? (
              <p className="text-sm text-subtle">Aucune vidéo en cours.</p>
            ) : (
              <ul className="divide-y divide-border">
                {o.nextDeadlines.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/videos/${v.id}`} className="hover:text-brand">
                      <span className="text-faint">{v.reference}</span> {v.title}
                    </Link>
                    <span className="flex items-center gap-2">
                      <StatusBadge {...VIDEO_STATUS[v.status]} />
                      <span className="num text-xs text-subtle">{formatDateOnly(v.clientDeadline)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Historique de la relation" description="Activités et changements d'étape commerciale.">
            {o.activities.length === 0 ? (
              <p className="text-sm text-subtle">Aucune activité enregistrée.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {o.activities.map((a) => (
                  <li key={a.id} className="text-sm">
                    <span className="text-xs text-faint">{formatDateTime(a.occurredAt, timezone)} · {ACTIVITY_TYPE_LABELS[a.type]}</span>
                    <p>
                      {a.subject}
                      {a.author ? <span className="text-subtle"> — {a.author.name}</span> : null}
                    </p>
                    {a.body ? <p className="whitespace-pre-wrap text-xs text-subtle">{a.body}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Section>
          <Section title="Dernières livraisons">
            {o.lastDeliveries.length === 0 ? (
              <p className="text-sm text-subtle">Aucune livraison pour l&apos;instant.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {o.lastDeliveries.map((v) => (
                  <li key={v.id} className="flex justify-between gap-2 py-2">
                    <Link href={`/videos/${v.id}`} className="hover:text-brand">
                      {v.reference} — {v.title} <span className="text-subtle">({VIDEO_TYPE_LABELS[v.type]})</span>
                    </Link>
                    <span className="text-xs text-subtle">{formatDateTime(v.deliveredAt, timezone)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <div className="flex flex-col gap-5">
          <Section title="Contacts">
            <ContactsPanel
              clientId={clientId}
              canEdit={cw}
              contacts={c.contacts.map((x) => ({ id: x.id, firstName: x.firstName, lastName: x.lastName, jobTitle: x.jobTitle, email: x.email, phone: x.phone, whatsapp: x.whatsapp, isPrimary: x.isPrimary }))}
            />
          </Section>
          <Section title="Informations">
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: "Email", value: c.email ? <a className="text-brand hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : "—" },
                { label: "Téléphone / WhatsApp", value: [c.phone, c.whatsapp].filter(Boolean).join(" · ") || "—" },
                { label: "Adresse de facturation", value: c.billingAddress ? <span className="whitespace-pre-wrap">{c.billingAddress}</span> : "—" },
                { label: "Identifiants", value: [c.vatNumber, c.companyRegistration].filter(Boolean).join(" · ") || "—" },
                { label: "Site et réseaux", value: [c.website, c.instagram, c.tiktok, c.youtube, c.linkedin, c.otherSocial].filter(Boolean).join(" · ") || "—" },
                { label: "Source d'acquisition", value: c.acquisitionSource ?? "—" },
                { label: "Devise / conditions", value: `${c.currency}${c.paymentTermsDays ? ` · ${c.paymentTermsDays} jours` : ""}` },
                { label: "Prochaine relance", value: formatDateOnly(c.nextFollowUpOn) },
                { label: "Préférences créatives", value: c.creativePreferences ? <span className="whitespace-pre-wrap">{c.creativePreferences}</span> : "—" },
                { label: "Références", value: c.references ? <span className="whitespace-pre-wrap">{c.references}</span> : "—" },
              ]}
            />
          </Section>
          <Section title="Opportunités ouvertes">
            {o.opportunities.length === 0 ? (
              <p className="text-sm text-subtle">Aucune opportunité ouverte.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {o.opportunities.map((op) => (
                  <li key={op.id}>
                    <Link href={`/prospection/${op.id}`} className="font-medium hover:text-brand">{op.title}</Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
                      <StatusBadge {...OPPORTUNITY_STAGE[op.stage]} />
                      {op.followUpOn ? `Relance ${formatDateOnly(op.followUpOn)}` : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    );
  }

  async function ProjectsTab({ clientId }: { clientId: string }) {
    const o = await getClientOverview(actor, clientId);
    return (
      <DataTable
        rows={o.projects}
        rowKey={(p) => p.id}
        rowHref={(p) => `/projets/${p.id}`}
        empty={<EmptyState title="Aucun projet" description="Un client peut avoir plusieurs projets en parallèle." />}
        columns={[
          { key: "title", header: "Projet", cell: (p) => `${p.reference} — ${p.title}` },
          { key: "status", header: "Statut", cell: (p) => <StatusBadge {...PROJECT_STATUS[p.status]} /> },
          { key: "videos", header: "Vidéos livrées", cell: (p) => `${p.deliveredCount} / ${p.videoCount}`, numeric: true },
          { key: "deadline", header: "Deadline client", cell: (p) => formatDateOnly(p.clientDeadline) },
        ]}
      />
    );
  }

  async function VideosTab({ clientId }: { clientId: string }) {
    const videos = await prisma.video.findMany({
      where: { project: { clientId } },
      orderBy: [{ clientDeadline: "asc" }, { reference: "asc" }],
      select: { id: true, reference: true, title: true, status: true, type: true, clientDeadline: true, project: { select: { title: true } } },
    });
    return (
      <DataTable
        rows={videos}
        rowKey={(v) => v.id}
        rowHref={(v) => `/videos/${v.id}`}
        empty={<EmptyState title="Aucune vidéo" />}
        columns={[
          { key: "title", header: "Vidéo", cell: (v) => `${v.reference} — ${v.title}` },
          { key: "type", header: "Type", cell: (v) => VIDEO_TYPE_LABELS[v.type] },
          { key: "project", header: "Projet", cell: (v) => v.project.title },
          { key: "status", header: "Étape", cell: (v) => <StatusBadge {...VIDEO_STATUS[v.status]} /> },
          { key: "deadline", header: "Deadline client", cell: (v) => formatDateOnly(v.clientDeadline) },
        ]}
      />
    );
  }

  async function FinanceTab({ clientId }: { clientId: string }) {
    const f = await getClientFinance(actor, clientId);
    if (!f) return null;
    return (
      <div className="flex flex-col gap-5">
        {f.legacyToReconcile > 0 ? (
          <Notice tone="warning" title={`${f.legacyToReconcile} paiement(s) historique(s) à rapprocher`}>
            Importés de l&apos;ancien CRM, ils sont exclus des totaux tant qu&apos;ils ne sont pas qualifiés (Réglages › Historique).
          </Notice>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Ventes signées HT" value={<Money value={f.signedEur} />} hint="Lignes acceptées − annulations" />
          <Stat label="CA facturé HT net" value={<Money value={f.invoicedNetEur} />} hint="Factures émises − avoirs" />
          <Stat label="Encaissé (TTC)" value={<Money value={f.collectedEur} />} hint="Mouvements reçus" />
          <Stat label="Reste à encaisser" value={<Money value={f.openEur} />} hint="Soldes des factures émises" />
        </div>
        {f.projects ? (
          <Section title="Marge par projet" description="Revenu contractuel (ventes) − coûts directs. Les factures n'entrent pas dans la marge.">
            <DataTable
              rows={f.projects}
              rowKey={(p) => p.id}
              rowHref={(p) => `/projets/${p.id}`}
              empty={<p className="text-sm text-subtle">Aucun projet.</p>}
              columns={[
                { key: "p", header: "Projet", cell: (p) => `${p.reference} — ${p.title}` },
                { key: "sold", header: "Vendu HT", cell: (p) => <Money value={p.soldEur} />, numeric: true },
                { key: "costs", header: "Coûts directs", cell: (p) => <Money value={p.costsEur} />, numeric: true },
                { key: "margin", header: "Marge", cell: (p) => <Money value={p.marginEur} colorize />, numeric: true },
                { key: "rate", header: "Taux", cell: (p) => <Percent value={p.ratePct} />, numeric: true },
                { key: "status", header: "Nature", cell: (p) => <span className={p.missing ? "text-warning" : "text-subtle"}>{MARGIN_STATUS_LABELS[p.status]}{p.missing ? ` (${p.missing} coût(s) manquant(s))` : ""}</span> },
              ]}
            />
          </Section>
        ) : null}
        <Section title="Factures" actions={can(actor, "invoices.write") ? <Button asChild size="sm" variant="outline"><Link href={`/finances/factures/nouvelle?client=${clientId}`}>Enregistrer une facture</Link></Button> : null}>
          <DataTable
            rows={f.invoices}
            rowKey={(i) => i.id}
            rowHref={(i) => `/finances/factures/${i.id}`}
            empty={<p className="text-sm text-subtle">Aucune facture.</p>}
            columns={[
              { key: "n", header: "Numéro", cell: (i) => i.number ?? "Brouillon" },
              { key: "d", header: "Émise le", cell: (i) => formatDateOnly(i.issueDate) },
              { key: "s", header: "État", cell: (i) => <span className="flex flex-wrap gap-1"><StatusBadge {...INVOICE_PAYMENT_STATE[i.state]} />{i.overdue ? <StatusBadge label="En retard" tone="danger" /> : null}</span> },
              { key: "t", header: "TTC", cell: (i) => <Money value={i.totalGross} currency={i.currency as CurrencyCode} />, numeric: true },
              { key: "b", header: "Solde", cell: (i) => <Money value={i.balance} currency={i.currency as CurrencyCode} />, numeric: true },
              { key: "due", header: "Échéance", cell: (i) => formatDateOnly(i.dueDate) },
            ]}
          />
        </Section>
        <Section title="Ventes acceptées">
          <DataTable
            rows={f.orders}
            rowKey={(o) => o.id}
            rowHref={(o) => `/finances/ventes/${o.id}`}
            empty={<p className="text-sm text-subtle">Aucune vente enregistrée.</p>}
            columns={[
              { key: "r", header: "Vente", cell: (o) => `${o.reference} — ${o.title}` },
              { key: "d", header: "Acceptée le", cell: (o) => formatDateOnly(o.acceptedOn) },
              { key: "n", header: "Net HT", cell: (o) => <Money value={o.net} currency={o.currency as CurrencyCode} />, numeric: true },
            ]}
          />
        </Section>
      </div>
    );
  }
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="rounded-xl border border-brand-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-faint">{hint}</p>
    </div>
  );
}
