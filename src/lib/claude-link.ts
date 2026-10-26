/**
 * Raccourci « Demander à Claude » : la question est posée dans le compte Claude de l'utilisateur
 * (claude.ai, Claude Desktop, Claude Code), qui lit le CRM via le serveur MCP. Le CRM n'appelle
 * aucune API d'IA et n'a besoin d'aucune clé.
 */
import type { T } from "@/lib/i18n/translate";

/** Longueur maximale de la question (l'adresse claude.ai/new?q=… doit rester raisonnable). */
export const MAX_CLAUDE_QUESTION = 1500;

export function buildClaudePrompt(tr: T, question: string, pageUrl?: string | null): string {
  const lines = [tr("Utilise le connecteur « Avencao CRM » (lecture seule) pour répondre.")];
  if (pageUrl) lines.push(tr("Page ouverte dans le CRM : {0}", [pageUrl]));
  lines.push("", question.trim().slice(0, MAX_CLAUDE_QUESTION));
  return lines.join("\n");
}

/** Nouvelle conversation claude.ai avec la question pré-remplie. */
export function claudeNewChatUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}
