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

export const metadata: Metadata = { title: "Fiche prestataire" };

export default async function EditorPage(props: PageProps<"/monteurs/[id]">) {
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
            {e.level ? <span>{EDITOR_LEVEL_LABELS[e.level]}</span> : null}
            {e.country ? <span>· {e.country}</span> : null}
            <span>· {e.user ? `Compte lié (${e.user.email})` : "Sans accès au CRM"}</span>
          </span>
        }
        actions={
          <>
            {e.portfolioUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={e.portfolioUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> Portfolio</a>
              </Button>
            ) : null}
            {!e.user && can(actor, "users.manage") ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/reglages?onglet=utilisateurs&inviter=${e.id}`}>Inviter sur le CRM</Link>
              </Button>
            ) : null}
            {can(actor, "editors.write") ? (
              <Button asChild size="sm">
                <Link href={`/monteurs/${e.id}/modifier`}><Pencil aria-hidden /> Modifier</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Section title="Missions en cours" description={`${d.current.length} mission(s) actives`}>
            <DataTable
              rows={d.current}
              rowKey={(a) => a.id}
              rowHref={(a) => `/videos/${a.video.id}`}
              empty={<EmptyState title="Aucune mission en cours" />}
              columns={[
                { key: "v", header: "Vidéo", cell: (a) => `${a.video.reference} — ${a.video.title}` },
                { key: "c", header: "Client", cell: (a) => a.video.project.client.displayName },
                { key: "r", header: "Rôle", cell: (a) => ASSIGNMENT_ROLE_LABELS[a.role] },
                { key: "s", header: "Mission", cell: (a) => <StatusBadge {...ASSIGNMENT_STATUS[a.status]} /> },
                { key: "vs", header: "Vidéo", cell: (a) => <StatusBadge {...VIDEO_STATUS[a.video.status]} />, hideOnCard: true },
                { key: "d", header: "Échéance", cell: (a) => <span className={a.dueOn && a.dueOn.toISOString().slice(0, 10) < today ? "font-semibold text-danger" : undefined}>{formatDateOnly(a.dueOn)}</span> },
                { key: "h", header: "Heures prévues", cell: (a) => (a.estimatedHours ? `${a.estimatedHours.toFixed()} h` : <span className="text-warning">à estimer</span>), numeric: true },
                ...(d.showCosts
                  ? [{
                      key: "cost",
                      header: "Coût",
                      numeric: true,
                      cell: (a: (typeof d.current)[number]) => {
                        const c = a.directCosts?.[0];
                        if (!a.directCosts || a.directCosts.length === 0) return a.rateMode === "MONTHLY_ENVELOPE" ? "Enveloppe" : "—";
                        return <span className="flex flex-col items-end"><Money value={c?.amount?.toFixed(2) ?? null} currency={c?.currency as CurrencyCode} /><span className="text-xs text-subtle">{c ? COST_STAGE[c.stage].label : ""}</span></span>;
                      },
                    }]
                  : []),
              ]}
            />
          </Section>
          <Section title="Missions livrées et validées" description="Indicateurs calculés à partir des dates enregistrées (aucune note automatique).">
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Missions validées" value={String(d.stats.deliveredCount)} />
              <Stat
                label="Rendus à l'heure"
                value={d.stats.punctuality ? `${d.stats.punctuality.onTime} / ${d.stats.punctuality.total}` : "Pas assez de données"}
              />
              <Stat label="Retouches pour erreur interne" value={`${d.stats.internalErrors} sur ${d.stats.versions} version(s)`} />
            </div>
            <DataTable
              rows={d.delivered}
              rowKey={(a) => a.id}
              rowHref={(a) => `/videos/${a.video.id}`}
              empty={<p className="text-sm text-subtle">Aucune mission validée.</p>}
              columns={[
                { key: "v", header: "Vidéo", cell: (a) => `${a.video.reference} — ${a.video.title}` },
                { key: "r", header: "Rôle", cell: (a) => ASSIGNMENT_ROLE_LABELS[a.role] },
                { key: "due", header: "Échéance", cell: (a) => formatDateOnly(a.dueOn) },
                { key: "sub", header: "Rendu le", cell: (a) => formatDateOnly(a.submittedAt) },
              ]}
            />
          </Section>
          {d.balances ? (
            <Section
              title="Rémunération"
              description="Engagé = dû après validation ; validé = payable ; payé = règlements enregistrés. Ce sont les étapes d'un même coût, pas des montants à additionner."
              actions={can(actor, "supplierPayments.write") ? <Button asChild size="sm"><Link href={`/finances/reglements/nouveau?monteur=${e.id}`}>Enregistrer un règlement</Link></Button> : null}
            >
              {d.balances.length === 0 ? (
                <p className="text-sm text-subtle">Aucun coût engagé.</p>
              ) : (
                <DataTable
                  rows={d.balances}
                  rowKey={(b) => b.currency}
                  columns={[
                    { key: "c", header: "Devise", cell: (b) => b.currency },
                    { key: "e", header: "Engagé (à valider)", cell: (b) => <Money value={b.committed} currency={b.currency as CurrencyCode} />, numeric: true },
                    { key: "v", header: "Validé", cell: (b) => <Money value={b.validated} currency={b.currency as CurrencyCode} />, numeric: true },
                    { key: "p", header: "Payé", cell: (b) => <Money value={b.paid} currency={b.currency as CurrencyCode} />, numeric: true },
                    { key: "d", header: "Reste dû", cell: (b) => <Money value={b.due} currency={b.currency as CurrencyCode} />, numeric: true },
                    { key: "pay", header: "Dont payable", cell: (b) => <Money value={b.payable} currency={b.currency as CurrencyCode} />, numeric: true },
                  ]}
                />
              )}
            </Section>
          ) : null}
          {can(actor, "notes.internal") ? (
            <Section title="Notes internes">
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
          <Section title="Profil">
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: "Email", value: e.email ?? "—" },
                { label: "WhatsApp", value: e.whatsapp ?? "—" },
                { label: "Fuseau horaire", value: e.timezone ?? "—" },
                { label: "Langues", value: e.languages.join(", ") || "—" },
                { label: "Compétences", value: e.skills.map((s) => SKILL_LABELS[s]).join(", ") || "—" },
                { label: "Formats", value: e.formats.map((f) => VIDEO_TYPE_LABELS[f]).join(", ") || "—" },
                { label: "Capacité hebdomadaire", value: e.weeklyCapacityHours ? `${e.weeklyCapacityHours.toFixed()} h` : "Non renseignée" },
                { label: "Disponibilité", value: e.availabilityNote ?? "—" },
                { label: "Rémunération", value: `${e.payCurrency}${e.paymentTerms ? ` · ${e.paymentTerms}` : ""}` },
                { label: "Notes internes", value: e.internalNotes ? <span className="whitespace-pre-wrap">{e.internalNotes}</span> : "—" },
                ...(e.privateAppraisal !== null ? [{ label: "Appréciation privée", value: <span className="whitespace-pre-wrap">{e.privateAppraisal || "—"}</span> }] : []),
              ]}
            />
          </Section>
          {e.rateCards ? (
            <Section title="Tarifs négociés" actions={can(actor, "rates.write") ? <RateCardDialog editorId={e.id} today={today} defaults={{ currency: e.payCurrency }} /> : null}>
              {e.rateCards.length === 0 ? (
                <p className="text-sm text-subtle">Aucun tarif. Sans tarif, le coût d&apos;une mission reste « à renseigner ».</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {e.rateCards.map((r) => (
                    <li key={r.id} className={`rounded-lg border border-border p-2.5 text-sm ${r.active ? "" : "opacity-50"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{r.label}</p>
                          <p className="text-xs text-subtle">
                            {RATE_MODE_LABELS[r.mode]}
                            {r.videoType ? ` · ${VIDEO_TYPE_LABELS[r.videoType]}` : ""}
                            {r.minuteRounding ? ` · ${MINUTE_ROUNDING_LABELS[r.minuteRounding]}` : ""}
                            {r.includedRevisions !== null ? ` · ${r.includedRevisions} retouche(s) incluse(s)` : ""}
                          </p>
                          <p className="text-xs text-faint">
                            Du {formatDateOnly(r.validFrom)}{r.validTo ? ` au ${formatDateOnly(r.validTo)}` : ""}{r.active ? "" : " · inactif"}
                          </p>
                        </div>
                        <Money value={r.unitPrice.toFixed(2)} currency={r.currency as CurrencyCode} className="font-semibold" />
                      </div>
                      {r.active && can(actor, "rates.write") ? (
                        <div className="mt-2 flex gap-2">
                          <ActionButton size="xs" variant="ghost" action={deactivateRateCardAction.bind(null, r.id)}>Désactiver</ActionButton>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}
          <Section title="Indisponibilités">
            {can(actor, "editors.write") ? <UnavailabilityForm editorId={e.id} /> : null}
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {e.unavailabilities.length === 0 ? <li className="text-subtle">Aucune indisponibilité déclarée.</li> : null}
              {e.unavailabilities.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2">
                  <span>{formatDateOnly(u.startsOn)} → {formatDateOnly(u.endsOn)}{u.reason ? ` · ${u.reason}` : ""}</span>
                  {can(actor, "editors.write") ? (
                    <ActionButton size="icon-sm" variant="ghost" ariaLabel="Supprimer" action={removeUnavailabilityAction.bind(null, u.id)}>
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
