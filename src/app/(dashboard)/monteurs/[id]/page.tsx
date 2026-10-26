import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { deactivateRateCardAction, removeUnavailabilityAction } from "@/features/editors/actions";
import { RateCardDialog } from "@/features/editors/rate-card-dialog";
import { UnavailabilityForm } from "@/features/editors/unavailability-form";
import { NotesPanel } from "@/features/shared/notes-panel";
import { formatDateOnly } from "@/lib/dates";
import {
  ASSIGNMENT_ROLE_LABELS,
  ASSIGNMENT_STATUS,
  COST_STAGE,
  EDITOR_LEVEL_LABELS,
  EDITOR_STATUS,
  MINUTE_ROUNDING_LABELS,
  RATE_MODE_LABELS,
  SKILL_LABELS,
  VIDEO_STATUS,
  VIDEO_TYPE_LABELS,
} from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { getNotes } from "@/server/queries/clients";
import { getEditorDetail } from "@/server/queries/editors";
import { agencyToday } from "@/server/services/common";
import { getSettings } from "@/server/settings";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Fiche prestataire") };
}

export default async function EditorPage(props: PageProps<"/monteurs/[id]">) {
  const tr = await getT();
  const actor = await requirePagePermission("editors.read");
  const { id } = await props.params;
  const [d, today, settings] = await Promise.all([getEditorDetail(actor, id), agencyToday(), getSettings()]);
  const e = d.editor;
  return (
    <>
      <PageHeader
        title={e.displayName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...EDITOR_STATUS[e.status]} />
            {e.level ? <span>{tr(EDITOR_LEVEL_LABELS[e.level])}</span> : null}
            {e.country ? <span>· {e.country}</span> : null}
            <span>· {e.user ? tr("Compte lié ({0})", [e.user.email]) : tr("Sans accès au CRM")}</span>
          </span>
        }
        actions={
          <>
            {e.portfolioUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={e.portfolioUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> {" "}{tr("Portfolio")}</a>
              </Button>
            ) : null}
            {!e.user && can(actor, "users.manage") ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/reglages?onglet=utilisateurs&inviter=${e.id}`}>{tr("Inviter sur le CRM")}</Link>
              </Button>
            ) : null}
            {can(actor, "editors.write") ? (
              <Button asChild size="sm">
                <Link href={`/monteurs/${e.id}/modifier`}><Pencil aria-hidden /> {" "}{tr("Modifier")}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Section title={tr("Missions en cours")} description={tr("{0} mission(s) actives", [d.current.length])}>
            <DataTable
              rows={d.current}
              rowKey={(a) => a.id}
              rowHref={(a) => `/videos/${a.video.id}`}
              empty={<EmptyState title={tr("Aucune mission en cours")} />}
              columns={[
                { key: "v", header: tr("Vidéo"), cell: (a) => `${a.video.reference} — ${a.video.title}` },
                { key: "c", header: tr("Client"), cell: (a) => a.video.project.client.displayName },
                { key: "r", header: tr("Rôle"), cell: (a) => tr(ASSIGNMENT_ROLE_LABELS[a.role]) },
                { key: "s", header: tr("Mission"), cell: (a) => <StatusBadge {...ASSIGNMENT_STATUS[a.status]} /> },
                { key: "vs", header: tr("Vidéo"), cell: (a) => <StatusBadge {...VIDEO_STATUS[a.video.status]} />, hideOnCard: true },
                { key: "d", header: tr("Échéance"), cell: (a) => <span className={a.dueOn && a.dueOn.toISOString().slice(0, 10) < today ? "font-semibold text-danger" : undefined}>{formatDateOnly(a.dueOn)}</span> },
                { key: "h", header: tr("Heures prévues"), cell: (a) => (a.estimatedHours ? `${a.estimatedHours.toFixed()} h` : <span className="text-warning">{tr("à estimer")}</span>), numeric: true },
                ...(d.showCosts
                  ? [{
                      key: "cost",
                      header: tr("Coût"),
                      numeric: true,
                      cell: (a: (typeof d.current)[number]) => {
                        const c = a.directCosts?.[0];
                        if (!a.directCosts || a.directCosts.length === 0) return a.rateMode === "MONTHLY_ENVELOPE" ? "Enveloppe" : "—";
                        return <span className="flex flex-col items-end"><Money value={c?.amount?.toFixed(2) ?? null} currency={c?.currency as CurrencyCode} /><span className="text-xs text-subtle">{c ? tr(COST_STAGE[c.stage].label) : ""}</span></span>;
                      },
                    }]
                  : []),
              ]}
            />
          </Section>
          <Section title={tr("Missions livrées et validées")} description={tr("Indicateurs calculés à partir des dates enregistrées (aucune note automatique).")}>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label={tr("Missions validées")} value={String(d.stats.deliveredCount)} />
              <Stat
                label={tr("Rendus à l'heure")}
                value={d.stats.punctuality ? `${d.stats.punctuality.onTime} / ${d.stats.punctuality.total}` : "Pas assez de données"}
              />
              <Stat label={tr("Retouches pour erreur interne")} value={tr("{0} sur {1} version(s)", [d.stats.internalErrors, d.stats.versions])} />
            </div>
            <DataTable
              rows={d.delivered}
              rowKey={(a) => a.id}
              rowHref={(a) => `/videos/${a.video.id}`}
              empty={<p className="text-sm text-subtle">{tr("Aucune mission validée.")}</p>}
              columns={[
                { key: "v", header: tr("Vidéo"), cell: (a) => `${a.video.reference} — ${a.video.title}` },
                { key: "r", header: tr("Rôle"), cell: (a) => tr(ASSIGNMENT_ROLE_LABELS[a.role]) },
                { key: "due", header: tr("Échéance"), cell: (a) => formatDateOnly(a.dueOn) },
                { key: "sub", header: tr("Rendu le"), cell: (a) => formatDateOnly(a.submittedAt) },
              ]}
            />
          </Section>
          {d.balances ? (
            <Section
              title={tr("Rémunération")}
              description={tr("Engagé = dû après validation ; validé = payable ; payé = règlements enregistrés. Ce sont les étapes d'un même coût, pas des montants à additionner.")}
              actions={can(actor, "supplierPayments.write") ? <Button asChild size="sm"><Link href={`/finances/reglements/nouveau?monteur=${e.id}`}>{tr("Enregistrer un règlement")}</Link></Button> : null}
            >
              {d.balances.length === 0 ? (
                <p className="text-sm text-subtle">{tr("Aucun coût engagé.")}</p>
              ) : (
                <DataTable
                  rows={d.balances}
                  rowKey={(b) => b.currency}
                  columns={[
                    { key: "c", header: tr("Devise"), cell: (b) => b.currency },
                    { key: "e", header: tr("Engagé (à valider)"), cell: (b) => <Money value={b.committed} currency={b.currency as CurrencyCode} />, numeric: true },
                    { key: "v", header: tr("Validé"), cell: (b) => <Money value={b.validated} currency={b.currency as CurrencyCode} />, numeric: true },
                    { key: "p", header: tr("Payé"), cell: (b) => <Money value={b.paid} currency={b.currency as CurrencyCode} />, numeric: true },
                    { key: "d", header: tr("Reste dû"), cell: (b) => <Money value={b.due} currency={b.currency as CurrencyCode} />, numeric: true },
                    { key: "pay", header: tr("Dont payable"), cell: (b) => <Money value={b.payable} currency={b.currency as CurrencyCode} />, numeric: true },
                  ]}
                />
              )}
            </Section>
          ) : null}
          {can(actor, "notes.internal") ? (
            <Section title={tr("Notes internes")}>
              <NotesPanel
                notes={await getNotes(actor, { editorId: e.id })}
                target={{ editorId: e.id }}
                canAdminOnly={can(actor, "notes.adminOnly")}
                currentUserId={actor.id}
                isAdmin={actor.role === "ADMIN"}
                timezone={settings.timezone}
              />
            </Section>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          <Section title={tr("Profil")}>
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: tr("Email"), value: e.email ?? "—" },
                { label: tr("WhatsApp"), value: e.whatsapp ?? "—" },
                { label: tr("Fuseau horaire"), value: e.timezone ?? "—" },
                { label: tr("Langues"), value: e.languages.join(", ") || "—" },
                { label: tr("Compétences"), value: e.skills.map((s) => tr(SKILL_LABELS[s])).join(", ") || "—" },
                { label: tr("Formats"), value: e.formats.map((f) => tr(VIDEO_TYPE_LABELS[f])).join(", ") || "—" },
                { label: tr("Capacité hebdomadaire"), value: e.weeklyCapacityHours ? `${e.weeklyCapacityHours.toFixed()} h` : tr("Non renseignée") },
                { label: tr("Disponibilité"), value: e.availabilityNote ?? "—" },
                { label: tr("Rémunération"), value: `${e.payCurrency}${e.paymentTerms ? ` · ${e.paymentTerms}` : ""}` },
                { label: tr("Notes internes"), value: e.internalNotes ? <span className="whitespace-pre-wrap">{e.internalNotes}</span> : "—" },
                ...(e.privateAppraisal !== null ? [{ label: tr("Appréciation privée"), value: <span className="whitespace-pre-wrap">{e.privateAppraisal || "—"}</span> }] : []),
              ]}
            />
          </Section>
          {e.rateCards ? (
            <Section title={tr("Tarifs négociés")} actions={can(actor, "rates.write") ? <RateCardDialog editorId={e.id} today={today} defaults={{ currency: e.payCurrency }} /> : null}>
              {e.rateCards.length === 0 ? (
                <p className="text-sm text-subtle">{tr("Aucun tarif. Sans tarif, le coût d'une mission reste « à renseigner ».")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {e.rateCards.map((r) => (
                    <li key={r.id} className={`rounded-lg border border-border p-2.5 text-sm ${r.active ? "" : "opacity-50"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{tr(r.label)}</p>
                          <p className="text-xs text-subtle">
                            {tr(RATE_MODE_LABELS[r.mode])}
                            {r.videoType ? ` · ${tr(VIDEO_TYPE_LABELS[r.videoType])}` : ""}
                            {r.minuteRounding ? ` · ${tr(MINUTE_ROUNDING_LABELS[r.minuteRounding])}` : ""}
                            {r.includedRevisions !== null ? tr(" · {0} retouche(s) incluse(s)", [r.includedRevisions]) : ""}
                          </p>
                          <p className="text-xs text-faint">
                            {tr("Du")}{" "}{formatDateOnly(r.validFrom)}{r.validTo ? tr(" au {0}", [formatDateOnly(r.validTo)]) : ""}{r.active ? "" : tr(" · inactif")}
                          </p>
                        </div>
                        <Money value={r.unitPrice.toFixed(2)} currency={r.currency as CurrencyCode} className="font-semibold" />
                      </div>
                      {r.active && can(actor, "rates.write") ? (
                        <div className="mt-2 flex gap-2">
                          <ActionButton size="xs" variant="ghost" action={deactivateRateCardAction.bind(null, r.id)}>{tr("Désactiver")}</ActionButton>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}
          <Section title={tr("Indisponibilités")}>
            {can(actor, "editors.write") ? <UnavailabilityForm editorId={e.id} /> : null}
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {e.unavailabilities.length === 0 ? <li className="text-subtle">{tr("Aucune indisponibilité déclarée.")}</li> : null}
              {e.unavailabilities.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2">
                  <span>{formatDateOnly(u.startsOn)} → {formatDateOnly(u.endsOn)}{u.reason ? ` · ${u.reason}` : ""}</span>
                  {can(actor, "editors.write") ? (
                    <ActionButton size="icon-sm" variant="ghost" ariaLabel={tr("Supprimer")} action={removeUnavailabilityAction.bind(null, u.id)}>
                      <Trash2 aria-hidden />
                    </ActionButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}
