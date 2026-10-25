import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { TabLinks } from "@/components/app/tab-links";
import { Button } from "@/components/ui/button";
import { ExchangeRateDialog } from "@/features/finance/finance-dialogs";
import { toggleChecklistItemAction, toggleExpenseCategoryAction } from "@/features/settings/actions";
import { AgencySettingsForm, CatalogItemDialog, InviteForm, SimpleAddForm, TemplateDialog, UserAccessEditor } from "@/features/settings/settings-forms";
import { AttachmentsPanel } from "@/features/shared/attachments-panel";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { ROLE_LABELS, USER_STATUS_LABELS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import { requireActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { can, type Permission } from "@/server/policies";
import { agencyToday } from "@/server/services/common";
import { getSettings } from "@/server/settings";
import { smtpConfigured } from "@/server/env";

export const metadata: Metadata = { title: "Réglages" };

const TABS: { value: string; label: string; perm: Permission }[] = [
  { value: "agence", label: "Agence", perm: "settings.manage" },
  { value: "utilisateurs", label: "Utilisateurs et accès", perm: "users.manage" },
  { value: "catalogue", label: "Catalogue de prestations", perm: "settings.manage" },
  { value: "modeles", label: "Modèles de projets", perm: "settings.manage" },
  { value: "checklist", label: "Checklist qualité", perm: "settings.manage" },
  { value: "taux", label: "Taux de change", perm: "settings.manage" },
  { value: "categories", label: "Catégories de charges", perm: "settings.manage" },
  { value: "import", label: "Import et historique", perm: "imports.run" },
];

export default async function SettingsPage(props: PageProps<"/reglages">) {
  const actor = await requireActor();
  const params = await props.searchParams;
  const tabs = TABS.filter((t) => can(actor, t.perm));
  if (tabs.length === 0) redirect("/acces-refuse");
  const tab = tabs.find((t) => t.value === params.onglet)?.value ?? tabs[0].value;
  const [settings, today] = await Promise.all([getSettings(), agencyToday()]);
  return (
    <>
      <PageHeader title="Réglages" subtitle="Paramétrage de l'agence et administration des accès (réservé aux administrateurs)." />
      <TabLinks tabs={tabs} active={tab} basePath="/reglages" />
      {tab === "agence" ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <AgencySettingsForm
              defaults={{
                name: settings.name, timezone: settings.timezone, marginThresholdPct: settings.marginThresholdPct.toFixed(), ownerHourlyRate: settings.ownerHourlyRate?.toFixed(2) ?? "",
                ownerTimeIncludedInCosts: settings.ownerTimeIncludedInCosts, defaultIncludedRevisions: String(settings.defaultIncludedRevisions), revisionRoundDefinition: settings.revisionRoundDefinition,
                productionErrorPolicy: settings.productionErrorPolicy, defaultMinuteRounding: settings.defaultMinuteRounding, nonRecoverableVatInCost: settings.nonRecoverableVatInCost,
                overheadMethod: settings.overheadMethod, defaultPaymentTermsDays: String(settings.defaultPaymentTermsDays), videoRefPrefix: settings.videoRefPrefix,
                deadlineSoonDays: String(settings.deadlineSoonDays), maxUploadMb: String(settings.maxUploadMb), version: settings.version,
              }}
            />
          </div>
          <Section title="Logo" description="Le logo Avencao fourni est utilisé par défaut.">
            <AttachmentsPanel items={settings.logoAttachmentId ? await prisma.attachment.findMany({ where: { id: settings.logoAttachmentId } }) : []} ownerType="SETTINGS" ownerId="1" canUpload timezone={settings.timezone} hint="PNG ou WebP avec transparence recommandé." />
          </Section>
        </div>
      ) : null}
      {tab === "utilisateurs" ? await Users() : null}
      {tab === "catalogue" ? await Catalog() : null}
      {tab === "modeles" ? await Templates() : null}
      {tab === "checklist" ? await ChecklistTab() : null}
      {tab === "taux" ? await Rates() : null}
      {tab === "categories" ? await Categories() : null}
      {tab === "import" ? await ImportTab() : null}
    </>
  );

  async function Users() {
    const [users, editors] = await Promise.all([
      prisma.user.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }], include: { editorProfile: { select: { displayName: true } }, accounts: { select: { providerId: true } } } }),
      prisma.editorProfile.findMany({ where: { userId: null, status: { not: "ARCHIVED" } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, email: true } }),
    ]);
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DataTable
            rows={users}
            rowKey={(u) => u.id}
            columns={[
              { key: "n", header: "Utilisateur", cell: (u) => <>{u.name}<span className="block text-xs text-subtle">{u.email}{u.editorProfile ? ` · fiche ${u.editorProfile.displayName}` : ""}</span></> },
              { key: "r", header: "Rôle actuel", cell: (u) => <span className="flex flex-wrap gap-1"><StatusBadge label={ROLE_LABELS[u.role]} tone={u.role === "ADMIN" ? "brand" : "neutral"} />{u.financeAccess && u.role === "PRODUCTION_MANAGER" ? <StatusBadge label="Finance" tone="info" /> : null}</span> },
              { key: "s", header: "Statut", cell: (u) => <span className="flex flex-col gap-0.5"><StatusBadge label={USER_STATUS_LABELS[u.status]} tone={u.status === "ACTIVE" ? "success" : "warning"} />{u.accounts.some((a) => a.providerId === "credential") ? null : <span className="text-xs text-warning">mot de passe non défini</span>}</span> },
              { key: "l", header: "Dernière connexion", cell: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt, settings.timezone) : "—"), hideOnCard: true },
              { key: "a", header: "Accès", cell: (u) => <UserAccessEditor isSelf={u.id === actor.id} user={{ id: u.id, role: u.role, financeAccess: u.financeAccess, status: u.status, legacyRole: u.legacyRole, suggestedRole: u.suggestedRole }} /> },
            ]}
          />
          <p className="mt-2 text-xs text-faint">Désactiver un compte ou changer son rôle révoque immédiatement ses sessions. Les liens Drive ou Frame.io gardent leurs propres règles de partage : retirer un accès CRM ne les révoque pas.</p>
        </div>
        <Section title="Inviter une personne" description="Aucune inscription publique : seuls les administrateurs créent des accès.">
          {!smtpConfigured() ? <Notice tone="info" className="mb-3">Aucun canal email configuré : le lien d&apos;invitation s&apos;affichera ici pour que vous le transmettiez.</Notice> : null}
          <InviteForm editors={editors.map((e) => ({ value: e.id, label: e.displayName, email: e.email }))} defaultEditorId={typeof params.inviter === "string" ? params.inviter : undefined} />
        </Section>
      </div>
    );
  }

  async function Catalog() {
    const items = await prisma.serviceCatalogItem.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
    return (
      <Section title="Prestations" actions={<CatalogItemDialog trigger={<Button size="sm"><Plus aria-hidden /> Prestation</Button>} />}>
        <DataTable
          rows={items}
          rowKey={(i) => i.id}
          empty={<p className="text-sm text-subtle">Catalogue vide. Les prix restent négociables sur chaque vente.</p>}
          columns={[
            { key: "n", header: "Prestation", cell: (i) => <>{i.name}{i.active ? null : <StatusBadge className="ml-2" label="Inactive" tone="muted" />}<span className="block text-xs text-subtle">{i.description}</span></> },
            { key: "t", header: "Type", cell: (i) => (i.videoType ? VIDEO_TYPE_LABELS[i.videoType] : "—") },
            { key: "p", header: "Prix HT", numeric: true, cell: (i) => <><Money value={i.unitPrice.toFixed(2)} currency={i.currency as CurrencyCode} /> / {i.unit}</> },
            { key: "r", header: "Retouches", cell: (i) => i.includedRevisions ?? "—" },
            { key: "d", header: "Délai", cell: (i) => (i.turnaroundDays ? `${i.turnaroundDays} j` : "—") },
            { key: "c", header: "Coût cible", numeric: true, cell: (i) => <Money value={i.targetCost?.toFixed(2) ?? null} currency={i.currency as CurrencyCode} empty="—" /> },
            {
              key: "e", header: "", cell: (i) => (
                <CatalogItemDialog
                  trigger={<Button size="icon-sm" variant="ghost" aria-label="Modifier"><Pencil aria-hidden /></Button>}
                  item={{ id: i.id, name: i.name, description: i.description ?? "", videoType: i.videoType ?? "", unit: i.unit, unitPrice: i.unitPrice.toFixed(2), currency: i.currency, includedRevisions: i.includedRevisions?.toString() ?? "", turnaroundDays: i.turnaroundDays?.toString() ?? "", targetCost: i.targetCost?.toFixed(2) ?? "", active: i.active }}
                />
              ),
            },
          ]}
        />
      </Section>
    );
  }

  async function Templates() {
    const templates = await prisma.projectTemplate.findMany({ orderBy: { name: "asc" } });
    return (
      <Section title="Modèles de projets" description="Pack Reels, vlog YouTube, VSL, podcast avec extraits, publicité avec variantes…" actions={<TemplateDialog trigger={<Button size="sm"><Plus aria-hidden /> Modèle</Button>} />}>
        <DataTable
          rows={templates}
          rowKey={(t) => t.id}
          columns={[
            { key: "n", header: "Modèle", cell: (t) => <>{t.name}{t.active ? null : <StatusBadge className="ml-2" label="Inactif" tone="muted" />}</> },
            { key: "t", header: "Type", cell: (t) => VIDEO_TYPE_LABELS[t.videoType] },
            { key: "c", header: "Vidéos", numeric: true, cell: (t) => t.defaultVideoCount },
            { key: "f", header: "Format", cell: (t) => [t.defaultRatio, t.defaultFormat].filter(Boolean).join(" · ") || "—" },
            { key: "h", header: "Heures / vidéo", numeric: true, cell: (t) => t.defaultEstimatedHours?.toFixed() ?? "—" },
            {
              key: "e", header: "", cell: (t) => (
                <TemplateDialog
                  trigger={<Button size="icon-sm" variant="ghost" aria-label="Modifier"><Pencil aria-hidden /></Button>}
                  item={{ id: t.id, name: t.name, description: t.description ?? "", videoType: t.videoType, defaultVideoCount: String(t.defaultVideoCount), defaultRatio: t.defaultRatio ?? "", defaultFormat: t.defaultFormat ?? "", defaultExpectedSec: t.defaultExpectedSec?.toString() ?? "", defaultIncludedRevisions: t.defaultIncludedRevisions?.toString() ?? "", defaultEstimatedHours: t.defaultEstimatedHours?.toFixed() ?? "", titlePattern: t.titlePattern, active: t.active }}
                />
              ),
            },
          ]}
        />
      </Section>
    );
  }

  async function ChecklistTab() {
    const items = await prisma.checklistTemplateItem.findMany({ orderBy: { position: "asc" } });
    return (
      <Section title="Checklist qualité" description="Copiée sur chaque nouvelle vidéo. Ce sont des validations humaines (aucun contrôle automatisé).">
        <SimpleAddForm kind="checklist" label="Nouveau point de contrôle" placeholder="Ex. Logo client en fin de vidéo" />
        <ul className="mt-4 flex flex-col gap-1.5">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className={i.active ? undefined : "text-subtle line-through"}>{i.label}</span>
              <ActionButton size="xs" variant="ghost" action={toggleChecklistItemAction.bind(null, i.id, !i.active)}>{i.active ? "Désactiver" : "Réactiver"}</ActionButton>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  async function Rates() {
    const rates = await prisma.exchangeRate.findMany({ orderBy: [{ date: "desc" }, { currency: "asc" }], take: 100 });
    return (
      <Section title="Taux de change de référence" description="Unités de devise pour 1 €. Chaque opération fige son taux ; un nouveau taux ne recalcule jamais le passé." actions={<ExchangeRateDialog today={today} />}>
        <DataTable
          rows={rates}
          rowKey={(r) => r.id}
          empty={<p className="text-sm text-subtle">Aucun taux : les opérations en IDR/USD exigent alors un taux manuel.</p>}
          columns={[
            { key: "d", header: "À partir du", cell: (r) => formatDateOnly(r.date) },
            { key: "c", header: "Devise", cell: (r) => r.currency },
            { key: "r", header: "Unités pour 1 €", numeric: true, cell: (r) => r.unitsPerEur.toFixed() },
            { key: "s", header: "Source", cell: (r) => (r.source === "MANUAL" ? "Saisie manuelle" : r.source) },
            { key: "n", header: "Note", cell: (r) => r.note ?? "—" },
          ]}
        />
      </Section>
    );
  }

  async function Categories() {
    const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { expenses: true } } } });
    return (
      <Section title="Catégories de charges de structure">
        <SimpleAddForm kind="category" label="Nouvelle catégorie" placeholder="Ex. Matériel" />
        <ul className="mt-4 flex flex-col gap-1.5">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className={c.active ? undefined : "text-subtle line-through"}>{c.name} <span className="text-xs text-faint">({c._count.expenses})</span></span>
              <ActionButton size="xs" variant="ghost" action={toggleExpenseCategoryAction.bind(null, c.id, !c.active)}>{c.active ? "Désactiver" : "Réactiver"}</ActionButton>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  async function ImportTab() {
    const runs = await prisma.importRun.findMany({ orderBy: { startedAt: "desc" }, take: 20, include: { _count: { select: { issues: true } } } });
    const latestIssues = runs[0]
      ? await prisma.importIssue.findMany({ where: { runId: runs[0].id }, orderBy: [{ level: "asc" }, { table: "asc" }], take: 200 })
      : [];
    const LEVEL = { ERROR: { label: "Erreur", tone: "danger" }, WARNING: { label: "À vérifier", tone: "warning" }, INFO: { label: "Info", tone: "info" } } as const;
    return (
      <div className="flex flex-col gap-5">
        <Notice tone="info" title="Import de l'historique Rails (MySQL)">
          L&apos;import s&apos;exécute en ligne de commande, en simulation par défaut : <code className="rounded bg-surface-3 px-1">pnpm import:legacy --source production --mysql …</code>, puis <code className="rounded bg-surface-3 px-1">--apply --backup-confirmed</code> après sauvegarde. Voir <code>docs/migration-rails.md</code> (rapprochement des totaux, retour arrière). Aucun mot de passe n&apos;est importé ; les comptes arrivent « À revoir », sans accès, avec un rôle suggéré à confirmer.
        </Notice>
        <Section title="Exécutions" description="Journal des imports : conversions, erreurs et éléments à reprendre.">
          <DataTable
            rows={runs}
            rowKey={(r) => r.id}
            empty={<p className="text-sm text-subtle">Aucun import exécuté.</p>}
            columns={[
              { key: "d", header: "Date", cell: (r) => formatDateTime(r.startedAt, settings.timezone) },
              { key: "s", header: "Source", cell: (r) => r.source },
              { key: "m", header: "Mode", cell: (r) => <StatusBadge label={r.mode === "DRY_RUN" ? "Simulation" : "Réel"} tone={r.mode === "DRY_RUN" ? "info" : "brand"} /> },
              { key: "st", header: "Résultat", cell: (r) => <StatusBadge label={r.status === "SUCCEEDED" ? "Terminé" : r.status === "FAILED" ? "Échec" : "En cours"} tone={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "danger" : "warning"} /> },
              { key: "i", header: "Signalements", numeric: true, cell: (r) => r._count.issues },
              { key: "x", header: "Résumé", cell: (r) => <code className="text-xs text-subtle">{JSON.stringify(r.summary)}</code>, hideOnCard: true },
            ]}
          />
        </Section>
        {runs[0] ? (
          <Section title="Signalements de la dernière exécution" description={`${runs[0].source} · ${formatDateTime(runs[0].startedAt, settings.timezone)}${latestIssues.length === 200 ? " · 200 premiers" : ""}`}>
            <DataTable
              rows={latestIssues}
              rowKey={(i) => i.id}
              empty={<p className="text-sm text-subtle">Aucun signalement.</p>}
              columns={[
                { key: "l", header: "Niveau", cell: (i) => <StatusBadge label={LEVEL[i.level].label} tone={LEVEL[i.level].tone} /> },
                { key: "t", header: "Table", cell: (i) => <>{i.table}{i.legacyId ? <span className="text-subtle"> #{i.legacyId}</span> : null}</> },
                { key: "m", header: "Message", cell: (i) => i.message },
              ]}
            />
          </Section>
        ) : null}
      </div>
    );
  }
}
