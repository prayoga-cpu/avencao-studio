import type { Metadata } from "next";
import { Bot, Monitor, Sparkles, Terminal } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { CopyField, CreateTokenForm, RevokeGrantButton, RevokeTokenButton } from "@/features/claude/claude-forms";
import { formatDateTime } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { toolsFor } from "@/server/ai/tools";
import { requirePagePermission } from "@/server/auth/session";
import { listConnections, mcpResourceUrl } from "@/server/mcp/oauth";
import { can } from "@/server/policies";
import { agencyTimezone } from "@/server/services/common";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Claude & MCP") };
}

/**
 * Connexion de Claude au CRM (serveur MCP, lecture seule) : instructions par application,
 * applications connectées (OAuth), jetons personnels et outils disponibles pour ce rôle.
 */
export default async function ClaudePage() {
  const tr = await getT();
  const actor = await requirePagePermission("assistant.use");
  const [connections, timezone] = await Promise.all([listConnections(actor), agencyTimezone()]);
  const mcpUrl = mcpResourceUrl();
  const tools = toolsFor(actor);
  const finance = can(actor, "invoices.read");

  return (
    <>
      <PageHeader
        title="Claude & MCP"
        subtitle={tr("Connectez Claude au CRM : il consulte vos données en lecture seule, avec exactement les droits de votre compte.")}
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
            <li>{tr("Cliquez sur « Se connecter » : une page Avencao s'ouvre, connectez-vous puis cliquez sur « Autoriser ».")}</li>
            <li>{tr("Dans une conversation, activez le connecteur « Avencao CRM » puis posez votre question.")}</li>
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
                    <p className="font-semibold">{g.client}</p>
                    <p className="text-xs text-subtle">
                      {tr("Accès renouvelé le {0}", [formatDateTime(g.refreshedAt, timezone)])}
                      {g.lastUsedAt ? ` · ${tr("dernière utilisation {0}", [formatDateTime(g.lastUsedAt, timezone)])}` : ""}
                    </p>
                  </div>
                  <RevokeGrantButton grantId={g.grantId} client={g.client} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={tr("Jetons personnels")} description={tr("Pour Claude Code ou un script, sans passer par la page d'autorisation. Lecture seule, avec vos droits.")} className="xl:col-span-2">
          <CreateTokenForm mcpUrl={mcpUrl} />
          {connections.personal.length ? (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {connections.personal.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      {t.name}
                      <StatusBadge label={t.active ? "Actif" : t.revokedAt ? "Révoqué" : "Expiré"} tone={t.active ? "success" : "neutral"} />
                    </p>
                    <p className="text-xs text-subtle">
                      <code>{t.prefix}…</code> · {tr("créé le {0}", [formatDateTime(t.createdAt, timezone)])} · {tr("expire le {0}", [formatDateTime(t.expiresAt, timezone)])}
                      {t.lastUsedAt ? ` · ${tr("dernière utilisation {0}", [formatDateTime(t.lastUsedAt, timezone)])}` : ""}
                    </p>
                  </div>
                  {t.active ? <RevokeTokenButton id={t.id} name={t.name ?? ""} /> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><Bot className="size-4 text-brand" aria-hidden />{tr("Ce que Claude peut consulter")}</span>} description={tr("Outils en lecture seule proposés à Claude pour votre rôle.")}>
          <ul className="flex flex-wrap gap-1.5">
            {tools.map((t) => (
              <li key={t.name} className="rounded-full border border-border px-2.5 py-1 text-xs" title={t.about}>
                {tr(t.label)}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-brand" aria-hidden />{tr("Bouton « Demander à Claude »")}</span>} description={tr("En bas à droite de chaque page.")}>
          <p className="text-sm">{tr("Écrivez votre question : elle s'ouvre dans Claude avec votre propre compte (et la page ouverte si vous le souhaitez). Le CRM n'utilise aucune clé d'API ni abonnement d'IA : chaque personne utilise son compte Claude.")}</p>
        </Section>
      </div>
    </>
  );
}
