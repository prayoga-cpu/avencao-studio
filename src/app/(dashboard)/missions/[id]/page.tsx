import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { Checklist, FeedbackList, LinksPanel, SubmitVersionForm, TimeEntryForm, VersionsList } from "@/features/production/video-panels";
import { WorkflowActions } from "@/features/production/workflow-actions";
import { formatDateOnly, formatDurationSeconds } from "@/lib/dates";
import { ASSIGNMENT_ROLE_LABELS, ASSIGNMENT_STATUS, COST_STAGE, PRIORITY, RATE_MODE_LABELS, VIDEO_STATUS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import { requireActor } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { can } from "@/server/policies";
import { getEditorMission } from "@/server/queries/production";
import { agencyToday } from "@/server/services/common";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Mission" };

export default async function MissionPage(props: PageProps<"/missions/[id]">) {
  const actor = await requireActor();
  const { id } = await props.params;
  if (!can(actor, "missions.own")) redirect(`/videos/${id}`);
  const data = await getEditorMission(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [settings, today] = await Promise.all([getSettings(), agencyToday()]);
  const { video: v, assignments } = data;
  const canWork = !["DELIVERED", "ARCHIVED", "CANCELLED"].includes(v.status);
  return (
    <>
      <PageHeader
        title={<><span className="mr-2 text-base font-semibold text-subtle">{v.reference}</span>{v.title}</>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...VIDEO_STATUS[v.status]} />
            <StatusBadge {...PRIORITY[v.priority]} />
            <span>{VIDEO_TYPE_LABELS[v.type]} · {v.project.client.displayName} · {v.project.title}</span>
          </span>
        }
      >
        {data.allowed.length ? (
          <div className="rounded-xl border border-brand-border bg-black/30 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Avancer</p>
            <WorkflowActions videoId={v.id} options={data.allowed.map((to) => ({ to, requiresReason: false, hint: to === "INTERNAL_REVIEW" ? "Déposez d'abord votre version ci-dessous." : undefined }))} hasRevenue={false} />
          </div>
        ) : null}
      </PageHeader>
      {v.isBlocked ? <Notice tone="danger" title="Vidéo bloquée" className="mb-4">{v.blockedReason}</Notice> : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Section title="Brief">
            <DefinitionList
              items={[
                { label: "Format / ratio", value: [v.format, v.ratio].filter(Boolean).join(" · ") || "—" },
                { label: "Langue", value: v.language ?? "—" },
                { label: "Durées (rushs / attendue)", value: `${formatDurationSeconds(v.rushDurationSec)} / ${formatDurationSeconds(v.expectedDurationSec)}` },
                { label: "Deadline interne", value: formatDateOnly(v.internalDeadline) },
                { label: "Brief", value: v.brief ? <span className="whitespace-pre-wrap">{v.brief}</span> : "—" },
                { label: "Objectifs", value: v.objectives ?? "—" },
                { label: "Audience", value: v.audience ?? "—" },
                { label: "Références", value: v.references ? <span className="whitespace-pre-wrap break-words">{v.references}</span> : "—" },
                { label: "Sous-titrage", value: v.subtitleStyle ?? "—" },
                { label: "Contraintes de marque", value: v.brandConstraints ?? "—" },
                { label: "Instructions d'export", value: v.exportInstructions ?? "—" },
                { label: "Allers-retours inclus", value: v.includedRevisionRounds ?? "—" },
              ]}
            />
          </Section>
          <Section title="Versions" description="Déposez le lien de review (Frame.io, Drive…). La vidéo passe en validation interne.">
            {canWork ? <div className="mb-4"><SubmitVersionForm videoId={v.id} nextNumber={(v.versions[0]?.number ?? 0) + 1} /></div> : null}
            <VersionsList canReview={false} videoStatus={v.status} timezone={settings.timezone} versions={v.versions.map((x) => ({ id: x.id, number: x.number, url: x.url, description: x.description, status: x.status, createdAt: x.createdAt, decisionNote: x.decisionNote }))} />
          </Section>
          <Section title="Retours à traiter">
            <FeedbackList
              canResolve={canWork}
              canReject={false}
              timezone={settings.timezone}
              items={v.feedback.map((f) => ({ id: f.id, body: f.body, timecode: f.timecode, status: f.status, source: f.source, category: f.category, createdAt: f.createdAt, versionNumber: v.versions.find((x) => x.id === f.versionId)?.number ?? null }))}
            />
          </Section>
        </div>
        <div className="flex flex-col gap-5">
          <Section title="Ma mission">
            <ul className="flex flex-col gap-3">
              {assignments.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="flex items-center justify-between gap-2 font-semibold">
                    {ASSIGNMENT_ROLE_LABELS[a.role]} <StatusBadge {...ASSIGNMENT_STATUS[a.status]} />
                  </p>
                  <p className="text-xs text-subtle">Échéance {formatDateOnly(a.dueOn)} · {a.estimatedHours ? `${a.estimatedHours} h prévues` : "heures non estimées"}{a.scope ? ` · ${a.scope}` : ""}</p>
                  <p className="mt-1 text-xs text-subtle">
                    Tarif : {a.rateMode ? `${RATE_MODE_LABELS[a.rateMode]} — ${a.unitPrice ?? "?"} ${a.currency ?? ""}${a.rateMode !== "PER_FINAL_MINUTE" ? ` × ${a.quantity}` : ""}` : "à convenir avec l'agence"}
                  </p>
                  {a.directCosts.map((c) => (
                    <p key={c.id} className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span>Rémunération : <Money value={c.amount} currency={c.currency as CurrencyCode} empty="à renseigner par l'agence" /></span>
                      <StatusBadge {...COST_STAGE[c.stage]} />
                      <span className="text-subtle">payé <Money value={c.paid} currency={c.currency as CurrencyCode} /></span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            <Link href="/mes-reglements" className="mt-3 inline-block text-xs text-brand hover:underline">Voir tous mes règlements</Link>
          </Section>
          <Section title="Liens utiles">
            <LinksPanel videoId={v.id} links={v.links} canManage={canWork} editorMode />
          </Section>
          <Section title="Checklist avant envoi">
            <Checklist items={v.checklist} canCheck={canWork} />
          </Section>
          <Section title="Temps passé" description="Facultatif ; sert à la planification.">
            <TimeEntryForm videoId={v.id} today={today} canOwnerTime={false} assignments={assignments.map((a) => ({ id: a.id, label: ASSIGNMENT_ROLE_LABELS[a.role] }))} />
          </Section>
        </div>
      </div>
    </>
  );
}
