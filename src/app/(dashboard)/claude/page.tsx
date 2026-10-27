import type { Metadata } from "next";
import Link from "next/link";
import { Bot, History, Monitor, PenLine, Sparkles, Terminal } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { CopyField, CreateTokenForm, RevokeGrantButton, RevokeTokenButton, WriteAccessToggle } from "@/features/claude/claude-forms";
import { formatDateTime } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { toolsFor } from "@/server/ai/tools";
import { requirePagePermission } from "@/server/auth/session";
import { listClaudeActivity } from "@/server/mcp/activity";
import { listConnections, mcpResourceUrl } from "@/server/mcp/oauth";
import { can } from "@/server/policies";
import { agencyTimezone } from "@/server/services/common";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Claude & MCP") };
}

/** Exemples de demandes à Claude une fois l'écriture autorisée (texte français, traduit). */
const WRITE_EXAMPLE_LABELS = [
  "« Enregistre cette facture » avec le PDF d'une facture client : brouillon créé, PDF joint par le lien de dépôt.",
  "« Nouvelle mission pour Atelier Nord : 3 reels à 450 € chacun, livraison le 15/11, monteur Kai à 120 € la vidéo » : projet, vidéos, prix et missions en une fois.",
  "« Voici la facture de Kai pour octobre » : Claude retrouve ses missions et complète les montants à renseigner.",
  "« Ajoute ce reçu Adobe » : charge de structure enregistrée dans la bonne catégorie.",
];

/**
 * Connexion de Claude au CRM (serveur MCP) : instructions par application, applications
 * connectées (OAuth) et jetons personnels avec leur accès (lecture seule ou lecture + écriture),
 * outils disponibles pour ce rôle et dernières écritures faites par Claude.
 */
export default async function ClaudePage() {
  const tr = await getT();
  const actor = await requirePagePermission("assistant.use");
  const [connections, timezone, activity] = await Promise.all([listConnections(actor), agencyTimezone(), listClaudeActivity(actor)]);
  const mcpUrl = mcpResourceUrl();
  const all = toolsFor(actor, { write: true });
  const readTools = all.filter((t) => t.kind === "read");
  const writeTools = all.filter((t) => t.kind === "write");
  const finance = can(actor, "invoices.read");
  const access = (write: boolean) => (write ? <StatusBadge label="Lecture + écriture" tone="warning" /> : <StatusBadge label="Lecture seule" tone="neutral" />);

  return (
    <>
      <PageHeader
        title="Claude & MCP"
        subtitle={tr("Connectez Claude au CRM : il consulte vos données et, si vous l'autorisez, enregistre factures, coûts, missions… à partir de vos documents ou de vos messages, avec exactement les droits de votre compte.")}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title={tr("Adresse du serveur MCP")} description={tr("À coller dans Claude lors de l'ajout du connecteur.")} className="xl:col-span-2">
          <CopyField value={mcpUrl} label="Adresse du serveur MCP" />
          <p className="mt-2 text-xs text-subtle">
            {finance
              ? tr("Claude verra les clients, la prospection, les projets, les vidéos, les monteurs, le planning et les finances autorisées pour votre rôle.")
              : tr("Claude verra les clients, la prospection, les projets, les vidéos, les monteurs et le planning. Aucune donnée financière : votre rôle n'y a pas accès.")}
          </p>
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><Monitor className="size-4 text-brand" aria-hidden />{tr("claude.ai et Claude Desktop")}</span>}>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>{tr("Dans Claude, ouvrez Paramètres › Connecteurs, puis « Ajouter un connecteur personnalisé ».")}</li>
            <li>{tr("Nom : « Avencao CRM ». URL : l'adresse du serveur MCP ci-dessus. Laissez les options OAuth avancées vides.")}</li>
            <li>{tr("Cliquez sur « Se connecter » : une page Avencao s'ouvre, connectez-vous, cochez « création et modification » si Claude doit enregistrer des données, puis cliquez sur « Autoriser ».")}</li>
            <li>{tr("Dans une conversation, activez le connecteur « Avencao CRM » puis posez votre question ou déposez votre document.")}</li>
          </ol>
          <p className="mt-3 text-xs text-faint">{tr("Les connecteurs personnalisés dépendent de votre offre Claude ; sur une offre Team ou Enterprise, un propriétaire de l'organisation les ajoute.")}</p>
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><Terminal className="size-4 text-brand" aria-hidden />{tr("Claude Code")}</span>}>
          <p className="mb-2 text-sm">{tr("Ajoutez le serveur, puis lancez /mcp dans Claude Code pour vous connecter (page d'autorisation Avencao) :")}</p>
          <CopyField multiline value={`claude mcp add --transport http avencao ${mcpUrl}`} label="Commande Claude Code" />
          <p className="mt-3 text-xs text-subtle">{tr("Sans navigateur (serveur, script) : créez un jeton personnel ci-dessous, la commande complète vous sera proposée.")}</p>
        </Section>

        <Section title={tr("Applications connectées")} description={tr("Applications Claude autorisées avec votre compte (OAuth). Accès renouvelé automatiquement, révocable à tout moment.")} className="xl:col-span-2">
          {connections.grants.length === 0 ? (
            <p className="text-sm text-subtle">{tr("Aucune application connectée pour le moment.")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {connections.grants.map((g) => (
                <li key={g.grantId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold">{g.client}{access(g.write)}</p>
                    <p className="text-xs text-subtle">
                      {tr("Accès renouvelé le {0}", [formatDateTime(g.refreshedAt, timezone)])}
                      {g.lastUsedAt ? ` · ${tr("dernière utilisation {0}", [formatDateTime(g.lastUsedAt, timezone)])}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <WriteAccessToggle kind="grant" id={g.grantId} name={g.client} write={g.write} />
                    <RevokeGrantButton grantId={g.grantId} client={g.client} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={tr("Jetons personnels")} description={tr("Pour Claude Code ou un script, sans passer par la page d'autorisation. Avec vos droits ; écriture seulement si vous la cochez.")} className="xl:col-span-2">
          <CreateTokenForm mcpUrl={mcpUrl} />
          {connections.personal.length ? (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {connections.personal.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {t.name}
                      <StatusBadge label={t.active ? "Actif" : t.revokedAt ? "Révoqué" : "Expiré"} tone={t.active ? "success" : "neutral"} />
                      {t.active ? access(t.write) : null}
                    </p>
                    <p className="text-xs text-subtle">
                      <code>{t.prefix}…</code> · {tr("créé le {0}", [formatDateTime(t.createdAt, timezone)])} · {tr("expire le {0}", [formatDateTime(t.expiresAt, timezone)])}
                      {t.lastUsedAt ? ` · ${tr("dernière utilisation {0}", [formatDateTime(t.lastUsedAt, timezone)])}` : ""}
                    </p>
                  </div>
                  {t.active ? (
                    <div className="flex flex-wrap gap-2">
                      <WriteAccessToggle kind="token" id={t.id} name={t.name ?? ""} write={t.write} />
                      <RevokeTokenButton id={t.id} name={t.name ?? ""} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><PenLine className="size-4 text-brand" aria-hidden />{tr("Enregistrer avec Claude")}</span>} description={tr("Avec l'écriture autorisée, déposez un document ou décrivez la situation : Claude vous montre ce qu'il a compris et attend votre accord avant d'enregistrer.")} className="xl:col-span-2">
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {WRITE_EXAMPLE_LABELS.map((e) => <li key={e}>{tr(e)}</li>)}
          </ul>
          <p className="mt-3 text-xs text-subtle">{tr("Garde-fous : les factures sont créées en brouillon (à marquer émises dans le CRM), les coûts ne sont jamais validés, rien n'est supprimé ni annulé, et chaque écriture est journalisée « via Claude ».")}</p>
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><Bot className="size-4 text-brand" aria-hidden />{tr("Ce que Claude peut consulter")}</span>} description={tr("Outils en lecture seule proposés à Claude pour votre rôle.")}>
          <ul className="flex flex-wrap gap-1.5">
            {readTools.map((t) => (
              <li key={t.name} className="rounded-full border border-border px-2.5 py-1 text-xs" title={t.about}>
                {tr(t.label)}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><PenLine className="size-4 text-brand" aria-hidden />{tr("Ce que Claude peut enregistrer")}</span>} description={tr("Outils d'écriture proposés à Claude pour votre rôle, seulement si la connexion autorise l'écriture.")}>
          {writeTools.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {writeTools.map((t) => (
                <li key={t.name} className="rounded-full border border-border px-2.5 py-1 text-xs" title={t.about}>
                  {tr(t.label)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">{tr("Aucun outil d'écriture pour votre rôle.")}</p>
          )}
        </Section>

        <Section
          title={<span className="inline-flex items-center gap-2"><History className="size-4 text-brand" aria-hidden />{tr("Activité de Claude")}</span>}
          description={actor.role === "ADMIN" ? tr("Dernières écritures faites par Claude, pour tous les utilisateurs.") : tr("Dernières écritures faites par Claude avec votre compte.")}
          className="xl:col-span-2"
        >
          {activity.length === 0 ? (
            <p className="text-sm text-subtle">{tr("Aucune écriture par Claude pour le moment.")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-start sm:gap-4">
                  <span className="shrink-0 text-xs text-subtle sm:w-40">{formatDateTime(a.at, timezone)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {tr(a.tool)}
                      {a.partial ? <StatusBadge label="Partiel" tone="warning" /> : null}
                      {a.user ? <span className="text-xs font-normal text-subtle">{a.user}</span> : null}
                    </p>
                    <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      {a.records.map((r, i) => (
                        <li key={i}>
                          <Link href={r.href} className="text-brand hover:underline">{r.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-brand" aria-hidden />{tr("Bouton « Demander à Claude »")}</span>} description={tr("En bas à droite de chaque page.")}>
          <p className="text-sm">{tr("Écrivez votre question : elle s'ouvre dans Claude avec votre propre compte (et la page ouverte si vous le souhaitez). Le CRM n'utilise aucune clé d'API ni abonnement d'IA : chaque personne utilise son compte Claude.")}</p>
        </Section>
      </div>
    </>
  );
}
