import type { Metadata } from "next";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Money, Percent } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { TabLinks } from "@/components/app/tab-links";
import { Button } from "@/components/ui/button";
import { cancelAssignmentAction, validateAssignmentAction } from "@/features/production/actions";
import { AssignDialog } from "@/features/production/assign-dialog";
import {
  ChangeRequestsPanel,
  Checklist,
  CostAmountDialog,
  FeedbackForm,
  FeedbackList,
  LinksPanel,
  SubmitVersionForm,
  TimeEntryForm,
  VersionsList,
} from "@/features/production/video-panels";
import { BlockToggle, WorkflowActions, type TransitionOption } from "@/features/production/workflow-actions";
import { AttachmentsPanel } from "@/features/shared/attachments-panel";
import { NotesPanel } from "@/features/shared/notes-panel";
import { formatDateOnly, formatDateTime, formatDurationSeconds, toDateOnlyString } from "@/lib/dates";
import { formatHours } from "@/lib/format";
import {
  ASSIGNMENT_ROLE_LABELS,
  ASSIGNMENT_STATUS,
  COST_KIND_LABELS,
  COST_STAGE,
  PRIORITY,
  RATE_MODE_LABELS,
  VIDEO_STATUS,
  VIDEO_TYPE_LABELS,
} from "@/lib/labels";
import { dec, sum, type CurrencyCode } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { VIDEO_TRANSITIONS, allowedTransitions } from "@/server/domain/video-workflow";
import { MARGIN_STATUS_LABELS } from "@/server/domain/profitability";
import { can } from "@/server/policies";
import { getNotes } from "@/server/queries/clients";
import { editorOptions } from "@/server/queries/options";
import { getVideoDetail } from "@/server/queries/production";
import { agencyToday } from "@/server/services/common";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Vidéo" };

const TABS = [
  { value: "production", label: "Production" },
  { value: "brief", label: "Brief" },
  { value: "versions", label: "Versions et retours" },
  { value: "qualite", label: "Checklist" },
  { value: "finances", label: "Finances" },
  { value: "historique", label: "Historique" },
];

export default async function VideoPage(props: PageProps<"/videos/[id]">) {
  const actor = await requirePagePermission("videos.readAll");
  const { id } = await props.params;
  const params = await props.searchParams;
  const [{ video: v, names, rounds, finance, otherCosts, allocations, finalDocs }, settings, today] = await Promise.all([
    getVideoDetail(actor, id),
    getSettings(),
    agencyToday(),
  ]);
  const tabs = TABS.filter((t) => t.value !== "finances" || can(actor, "costs.read") || can(actor, "margins.project"));
  const tab = tabs.some((t) => t.value === params.onglet) ? (params.onglet as string) : "production";
  const canWrite = can(actor, "videos.write");
  const hasFinal = v.links.some((l) => l.kind === "FINAL_EXPORT") || finalDocs.length > 0;
  const hasApproval = v.versions.some((x) => x.status === "APPROVED_CLIENT") || !!v.approvedAt;
  const transitions: TransitionOption[] = allowedTransitions(v.status, "manager").map((to) => {
    const rule = VIDEO_TRANSITIONS[v.status].find((r) => r.to === to)!;
    const deliveryException = to === "DELIVERED" && (!hasFinal || !hasApproval);
    return {
      to,
      requiresReason: !!rule.requiresReason || deliveryException,
      hint: deliveryException
        ? `Livraison sans ${[!hasFinal ? "lien/document final" : null, !hasApproval ? "validation enregistrée" : null].filter(Boolean).join(" ni ")} : exception du responsable, motif obligatoire.`
        : rule.isReopen
          ? "Réouverture après validation/livraison : tracée dans l'historique."
          : undefined,
    };
  });
  const clientDeadline = v.clientDeadline ? toDateOnlyString(v.clientDeadline) : null;
  const overdue = clientDeadline !== null && clientDeadline < today && !["DELIVERED", "ARCHIVED", "CANCELLED", "APPROVED"].includes(v.status);
  const includedRounds = v.includedRevisionRounds ?? v.project.includedRevisionRounds;

  return (
    <>
      <PageHeader
        title={<><span className="mr-2 text-base font-semibold text-subtle">{v.reference}</span>{v.title}</>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...VIDEO_STATUS[v.status]} />
            {v.isBlocked ? <StatusBadge label={`Bloquée : ${v.blockedReason ?? ""}`} tone="danger" /> : null}
            <StatusBadge {...PRIORITY[v.priority]} />
            <span>{VIDEO_TYPE_LABELS[v.type]}</span>
            <span>·</span>
            <Link href={`/clients/${v.project.client.id}`} className="hover:text-brand">{v.project.client.displayName}</Link>
            <span>·</span>
            <Link href={`/projets/${v.project.id}`} className="hover:text-brand">{v.project.reference}</Link>
            <span className={overdue ? "font-semibold text-danger" : undefined}>· Deadline client {formatDateOnly(v.clientDeadline)}{overdue ? " (en retard)" : ""}</span>
          </span>
        }
        actions={
          canWrite ? (
            <>
              <BlockToggle videoId={v.id} isBlocked={v.isBlocked} reason={v.blockedReason} />
              <Button asChild size="sm" variant="outline"><Link href={`/videos/${v.id}/modifier`}><Pencil aria-hidden /> Modifier</Link></Button>
            </>
          ) : null
        }
      >
        {canWrite ? (
          <div className="rounded-xl border border-brand-border bg-black/30 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Faire avancer la vidéo</p>
            <WorkflowActions videoId={v.id} options={transitions} hasRevenue={(allocations?.length ?? 0) > 0} />
          </div>
        ) : null}
      </PageHeader>
      <TabLinks tabs={tabs} active={tab} basePath={`/videos/${v.id}`} />

      {tab === "production" ? await ProductionTab() : null}
      {tab === "brief" ? BriefTab() : null}
      {tab === "versions" ? VersionsTab() : null}
      {tab === "qualite" ? (
        <Section title="Checklist qualité" description="Respect du brief, orthographe, sous-titres, son, cadrage, format, export…">
          <Checklist canCheck={canWrite} items={v.checklist.map((c) => ({ id: c.id, label: c.label, checked: c.checked, checkedBy: c.checkedById ? (names[c.checkedById] ?? null) : null }))} />
        </Section>
      ) : null}
      {tab === "finances" ? FinanceTab() : null}
      {tab === "historique" ? await HistoryTab() : null}
    </>
  );

  async function ProductionTab() {
    const editors = canWrite
      ? await prisma.editorProfile.findMany({
          where: { status: "ACTIVE" },
          orderBy: { displayName: "asc" },
          select: {
            id: true, displayName: true, skills: true, formats: true, payCurrency: true,
            rateCards: { where: { active: true }, select: { id: true, label: true, mode: true, unitPrice: true, currency: true, videoType: true } },
          },
        })
      : [];
    const showRates = can(actor, "rates.read");
    const editorChoices = editors.map((e) => ({
      id: e.id,
      name: e.displayName,
      skills: e.skills,
      formats: e.formats,
      payCurrency: e.payCurrency,
      rateCards: e.rateCards
        .filter((r) => !r.videoType || r.videoType === v.type)
        .map((r) => ({ id: r.id, label: r.label, mode: r.mode, unitPrice: showRates ? r.unitPrice.toFixed(2) : null, currency: r.currency, videoType: r.videoType })),
    }));
    const showCosts = can(actor, "costs.read");
    const totalHours = sum(v.timeEntries.map((t) => dec(t.minutes))).div(60);
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Section
            title="Missions"
            description="Plusieurs prestataires peuvent contribuer (dérushage, montage, motion…). Chaque mission porte son tarif figé."
            actions={canWrite ? <AssignDialog videoId={v.id} internalDeadline={v.internalDeadline ? toDateOnlyString(v.internalDeadline) : ""} estimatedHours={v.estimatedHours?.toFixed() ?? ""} editors={editorChoices} canSetPrice={can(actor, "costs.write")} /> : null}
          >
            {v.assignments.length === 0 ? (
              <p className="text-sm text-subtle">Aucun prestataire affecté.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {v.assignments.map((a) => {
                  const cost = a.directCosts?.find((c) => c.kind === "ASSIGNMENT");
                  const paid = cost ? sum(cost.paymentAllocations.map((p) => dec(p.amount))) : dec(0);
                  return (
                    <li key={a.id} className={`rounded-xl border border-border p-3 ${a.status === "CANCELLED" ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            <Link href={`/monteurs/${a.editor.id}`} className="hover:text-brand">{a.editor.displayName}</Link>
                            <span className="ml-2 text-sm font-normal text-subtle">{ASSIGNMENT_ROLE_LABELS[a.role]}{a.isPrimary ? " · principale" : ""}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-subtle">
                            Échéance {formatDateOnly(a.dueOn)} · {formatHours(a.estimatedHours?.toFixed() ?? null)}
                            {a.scope ? ` · ${a.scope}` : ""}
                          </p>
                          {showCosts ? (
                            <p className="mt-0.5 text-xs text-subtle">
                              Tarif figé : {a.rateMode ? `${RATE_MODE_LABELS[a.rateMode]} · ${a.unitPrice?.toFixed(2) ?? "?"} ${a.currency ?? ""} × ${a.quantity.toFixed()}` : "aucun"}
                            </p>
                          ) : null}
                        </div>
                        <StatusBadge {...ASSIGNMENT_STATUS[a.status]} />
                      </div>
                      {showCosts && cost ? (
                        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-surface-2/60 px-2.5 py-2 text-sm">
                          <span>Coût : <Money value={cost.amount?.toFixed(2) ?? null} currency={cost.currency as CurrencyCode} /></span>
                          <StatusBadge {...COST_STAGE[cost.stage]} />
                          {cost.currency !== "EUR" && cost.amountEur ? <span className="text-xs text-subtle">≈ <Money value={cost.amountEur.toFixed(2)} /> (taux {cost.fxUnitsPerEur?.toFixed()} {cost.fxSource === "MANUAL" ? "manuel" : ""})</span> : null}
                          <span className="text-xs text-subtle">Payé : <Money value={paid.toFixed(2)} currency={cost.currency as CurrencyCode} /></span>
                          {can(actor, "costs.write") && cost.stage !== "CANCELLED" && paid.isZero() ? (
                            <CostAmountDialog costId={cost.id} currency={cost.currency} current={cost.amount?.toFixed(2) ?? null} label={cost.label} validated={cost.stage === "VALIDATED"} />
                          ) : null}
                        </div>
                      ) : a.rateMode === "MONTHLY_ENVELOPE" ? (
                        <p className="mt-2 text-xs text-subtle">Couverte par l&apos;enveloppe mensuelle du prestataire (allocation analytique dans Finances › Coûts).</p>
                      ) : null}
                      {canWrite && a.status !== "CANCELLED" && a.status !== "APPROVED" ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {can(actor, "videos.validate") ? (
                            <ActionButton size="xs" action={validateAssignmentAction.bind(null, a.id)}>Valider la mission</ActionButton>
                          ) : null}
                          <ConfirmAction
                            trigger={<Button size="xs" variant="ghost">Annuler la mission</Button>}
                            title="Annuler la mission"
                            description="Un coût déjà engagé ou validé reste dû au prestataire. Seul un coût encore estimé est annulé."
                            reason="required"
                            destructive
                            confirmLabel="Annuler la mission"
                            action={cancelAssignmentAction.bind(null, a.id)}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
          <Section title="Liens" description="Rushs, documents, review Frame.io, export final.">
            <LinksPanel videoId={v.id} links={v.links} canManage={canWrite} />
          </Section>
          <Section title="Demandes hors périmètre">
            <ChangeRequestsPanel
              videoId={v.id}
              canCreate={canWrite}
              canAccept={can(actor, "sales.write") && can(actor, "costs.write")}
              showAmounts={can(actor, "costs.read")}
              editors={await editorOptions()}
              items={v.changeRequests.map((c) => ({
                id: c.id, title: c.title, description: c.description, status: c.status,
                clientPrice: c.clientPrice?.toFixed(2) ?? null, clientCurrency: c.clientCurrency, editorCost: c.editorCost?.toFixed(2) ?? null,
                editorCurrency: c.editorCurrency, editorName: c.editor?.displayName ?? null, acceptanceNote: c.acceptanceNote,
              }))}
            />
          </Section>
        </div>
        <div className="flex flex-col gap-5">
          <Section title="Repères">
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: "Début prévu", value: formatDateOnly(v.plannedStartOn) },
                { label: "Deadline interne", value: formatDateOnly(v.internalDeadline) },
                { label: "Deadline client", value: formatDateOnly(v.clientDeadline) },
                { label: "Durées (rushs / attendue / réelle)", value: `${formatDurationSeconds(v.rushDurationSec)} / ${formatDurationSeconds(v.expectedDurationSec)} / ${formatDurationSeconds(v.finalDurationSec)}` },
                { label: "Heures estimées", value: formatHours(v.estimatedHours?.toFixed() ?? null) },
                { label: "Heures saisies", value: `${totalHours.toFixed(1)} h` },
                { label: "Allers-retours client", value: `${rounds.included} utilisé(s) sur ${includedRounds ?? "?"} inclus${rounds.internalErrors ? ` · ${rounds.internalErrors} erreur(s) interne(s)` : ""}${rounds.outOfScope ? ` · ${rounds.outOfScope} hors périmètre` : ""}` },
              ]}
            />
            {includedRounds !== null && rounds.included > includedRounds ? (
              <Notice tone="warning" className="mt-3">Allers-retours inclus dépassés : proposez un supplément (demande hors périmètre).</Notice>
            ) : null}
          </Section>
          {can(actor, "time.log") ? (
            <Section title="Temps de travail" description="Distinct des durées médias.">
              <TimeEntryForm videoId={v.id} today={today} canOwnerTime={actor.role === "ADMIN"} assignments={v.assignments.filter((a) => a.status !== "CANCELLED").map((a) => ({ id: a.id, label: `${a.editor.displayName} — ${ASSIGNMENT_ROLE_LABELS[a.role]}` }))} />
              <ul className="mt-3 flex flex-col gap-1 text-xs text-subtle">
                {v.timeEntries.map((t) => (
                  <li key={t.id}>{formatDateOnly(t.workedOn)} · {(t.minutes / 60).toFixed(2)} h · {t.user?.name ?? "—"}{t.isOwnerTime ? " (dirigeant)" : ""}{t.note ? ` — ${t.note}` : ""}</li>
                ))}
              </ul>
            </Section>
          ) : null}
          <Section title="Documents finaux" description="Petits fichiers uniquement ; les masters restent dans vos outils.">
            <AttachmentsPanel items={finalDocs} ownerType="VIDEO" ownerId={v.id} canUpload={canWrite} timezone={settings.timezone} />
          </Section>
        </div>
      </div>
    );
  }

  function BriefTab() {
    return (
      <Section title="Brief">
        <DefinitionList
          items={[
            { label: "Format / ratio", value: [v.format, v.ratio].filter(Boolean).join(" · ") || "—" },
            { label: "Langue", value: v.language ?? "—" },
            { label: "Brief", value: v.brief ? <span className="whitespace-pre-wrap">{v.brief}</span> : "—" },
            { label: "Objectifs", value: v.objectives ? <span className="whitespace-pre-wrap">{v.objectives}</span> : "—" },
            { label: "Audience", value: v.audience ?? "—" },
            { label: "Références", value: v.references ? <span className="whitespace-pre-wrap break-words">{v.references}</span> : "—" },
            { label: "Sous-titrage", value: v.subtitleStyle ?? "—" },
            { label: "Contraintes de marque", value: v.brandConstraints ? <span className="whitespace-pre-wrap">{v.brandConstraints}</span> : "—" },
            { label: "Instructions d'export", value: v.exportInstructions ? <span className="whitespace-pre-wrap">{v.exportInstructions}</span> : "—" },
            { label: "Règle des allers-retours", value: v.project.revisionRoundDefinition ?? "—" },
            { label: "Erreurs de production", value: v.project.productionErrorPolicy ?? "—" },
          ]}
        />
      </Section>
    );
  }

  function VersionsTab() {
    const versionNumbers = Object.fromEntries(v.versions.map((x) => [x.id, x.number]));
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Versions" description="V1, V2, V3… Les versions précédentes sont conservées. Lecteur et annotations : dans Frame.io.">
          {canWrite && !["DELIVERED", "ARCHIVED", "CANCELLED"].includes(v.status) ? (
            <div className="mb-4"><SubmitVersionForm videoId={v.id} nextNumber={(v.versions[0]?.number ?? 0) + 1} /></div>
          ) : null}
          <VersionsList
            canReview={can(actor, "videos.validate")}
            videoStatus={v.status}
            timezone={settings.timezone}
            versions={v.versions.map((x) => ({ id: x.id, number: x.number, url: x.url, description: x.description, status: x.status, createdAt: x.createdAt, decisionNote: x.decisionNote, author: x.authorId ? names[x.authorId] : null }))}
          />
        </Section>
        <Section title="Retours" description="Visibilité interne ou monteur ; nature : inclus, erreur interne ou hors périmètre.">
          {can(actor, "videos.validate") ? <div className="mb-4"><FeedbackForm videoId={v.id} versions={v.versions.map((x) => ({ id: x.id, number: x.number }))} /></div> : null}
          <FeedbackList
            canResolve={canWrite}
            canReject={canWrite}
            timezone={settings.timezone}
            items={v.feedback.map((f) => ({ id: f.id, body: f.body, timecode: f.timecode, status: f.status, source: f.source, category: f.category, createdAt: f.createdAt, versionNumber: f.versionId ? versionNumbers[f.versionId] : null, visibleToEditor: f.visibleToEditor, author: f.authorId ? names[f.authorId] : null }))}
          />
        </Section>
      </div>
    );
  }

  function FinanceTab() {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {finance ? (
          <Section title="Marge directe de la vidéo" className="xl:col-span-1">
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: "Revenu alloué (analytique)", value: <Money value={finance.revenueEur.toFixed(2)} /> },
                { label: "Coûts directs", value: <Money value={finance.costsEur.toFixed(2)} /> },
                { label: MARGIN_STATUS_LABELS[finance.status], value: <span className="text-lg font-bold"><Money value={finance.marginEur.toFixed(2)} colorize /> · <Percent value={finance.ratePct?.toFixed(2) ?? null} /></span> },
                ...(finance.missingCostCount ? [{ label: "Complétude", value: <span className="text-warning">{finance.missingCostCount} coût(s) à renseigner — marge provisoire</span> }] : []),
              ]}
            />
            <p className="mt-3 text-xs text-faint">Un encaissement ne modifie pas cette marge contractuelle ; il change le reçu et le restant dû de la facture.</p>
          </Section>
        ) : null}
        <div className="flex flex-col gap-5 xl:col-span-2">
          {allocations ? (
            <Section title="Revenu alloué" description="Répartition interne des ventes entre livrables. Jamais additionnée au prix du pack.">
              {allocations.length === 0 ? (
                <p className="text-sm text-subtle">Aucune vente allouée à cette vidéo.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {allocations.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <Link href={`/finances/ventes/${a.salesOrderLine.salesOrder.id}`} className="hover:text-brand">{a.salesOrderLine.salesOrder.reference} — {a.salesOrderLine.description}</Link>
                      <Money value={a.amount.toFixed(2)} currency={a.salesOrderLine.salesOrder.currency as CurrencyCode} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}
          {otherCosts ? (
            <Section title="Autres coûts directs" description="Achats, suppléments, coûts additionnels rattachés à cette vidéo." actions={can(actor, "costs.write") ? <Button asChild size="sm" variant="outline"><Link href={`/finances/couts/nouveau?video=${v.id}`}>Ajouter un coût</Link></Button> : null}>
              {otherCosts.length === 0 ? (
                <p className="text-sm text-subtle">Aucun autre coût.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {otherCosts.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{c.label} <span className="text-xs text-subtle">({COST_KIND_LABELS[c.kind]})</span></span>
                      <span className="flex items-center gap-2"><StatusBadge {...COST_STAGE[c.stage]} /><Money value={c.amount?.toFixed(2) ?? null} currency={c.currency as CurrencyCode} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}
        </div>
      </div>
    );
  }

  async function HistoryTab() {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Étapes">
          <ol className="flex flex-col gap-2 text-sm">
            {v.statusEvents.map((e) => (
              <li key={e.id}>
                <span className="text-xs text-faint">{formatDateTime(e.createdAt, settings.timezone)} · {e.actorId ? names[e.actorId] ?? "—" : "Système"}</span>
                <p>
                  {e.fromStatus ? VIDEO_STATUS[e.fromStatus].label : "Création"} → <strong>{VIDEO_STATUS[e.toStatus].label}</strong>
                  {e.isOverride ? <StatusBadge className="ml-2" label="Exception" tone="warning" /> : null}
                </p>
                {e.reason ? <p className="text-xs text-subtle">Motif : {e.reason}</p> : null}
              </li>
            ))}
            {v.statusEvents.length === 0 ? <li className="text-subtle">Aucun changement d&apos;étape.</li> : null}
          </ol>
        </Section>
        <div className="flex flex-col gap-5">
          <Section title="Échéances déplacées">
            <ul className="flex flex-col gap-1.5 text-sm">
              {v.deadlineChanges.map((c) => (
                <li key={c.id}>
                  <span className="text-xs text-faint">{formatDateTime(c.createdAt, settings.timezone)} · {c.actorId ? names[c.actorId] ?? "—" : "—"}</span>
                  <p>{c.field === "VIDEO_CLIENT" ? "Client" : c.field === "VIDEO_INTERNAL" ? "Interne" : "Mission"} : {formatDateOnly(c.oldDate)} → {formatDateOnly(c.newDate)}{c.reason ? ` — ${c.reason}` : ""}</p>
                </li>
              ))}
              {v.deadlineChanges.length === 0 ? <li className="text-subtle">Aucun déplacement.</li> : null}
            </ul>
          </Section>
          {can(actor, "notes.internal") ? (
            <Section title="Notes internes">
              <NotesPanel notes={await getNotes(actor, { videoId: v.id })} target={{ videoId: v.id }} canAdminOnly={can(actor, "notes.adminOnly")} currentUserId={actor.id} isAdmin={actor.role === "ADMIN"} timezone={settings.timezone} />
            </Section>
          ) : null}
        </div>
      </div>
    );
  }
}
