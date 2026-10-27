import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Check, Eye, PenLine, ShieldCheck } from "lucide-react";
import { AuthCard } from "../../auth-card";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";
import { ROLE_LABELS } from "@/lib/labels";
import { getActor } from "@/server/auth/session";
import { checkAuthorizeRequest, type AuthorizeParams } from "@/server/mcp/oauth";
import { can } from "@/server/policies";
import { decideAuthorization } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Autoriser Claude") };
}

const KEYS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

/**
 * Écran d'accord OAuth : une application Claude demande l'accès au CRM au nom de l'utilisateur
 * connecté. Lecture par défaut ; l'écriture (crm:write) n'est accordée que si la case est cochée.
 * Rien n'est délivré sans clic explicite sur « Autoriser ».
 */
export default async function AuthorizePage(props: PageProps<"/oauth/autoriser">) {
  await connection();
  const tr = await getT();
  const sp = await props.searchParams;
  const params: AuthorizeParams = {};
  for (const k of KEYS) if (typeof sp[k] === "string") params[k] = sp[k] as string;

  const check = await checkAuthorizeRequest(params);
  if (!check.ok && !check.fatal) redirect(check.redirectTo);
  if (!check.ok) {
    return (
      <AuthCard title={tr("Connexion de Claude impossible")}>
        <Notice tone="danger">{tr(check.message)}</Notice>
      </AuthCard>
    );
  }
  const actor = await getActor();
  if (!actor) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/connexion?suite=${encodeURIComponent(`/oauth/autoriser?${query}`)}`);
  }
  const host = new URL(check.redirectUri).host;
  const allowed = can(actor, "assistant.use");
  const finance = can(actor, "invoices.read");
  const hidden = KEYS.map((k) => (params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null));

  return (
    <AuthCard title={tr("Autoriser {0} ?", [check.client.name])} subtitle={tr("Une application Claude demande l'accès à Avencao CRM.")}>
      <div className="flex flex-col gap-4 text-sm">
        <div className="rounded-lg border border-border p-3">
          <p className="text-subtle">{tr("Compte")}</p>
          <p className="font-semibold">{actor.name} · {actor.email}</p>
          <p className="text-xs text-subtle">{tr(ROLE_LABELS[actor.role])}</p>
        </div>
        {allowed ? (
          <ul className="flex flex-col gap-2">
            <li className="flex gap-2"><Eye className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />{tr("Lecture : clients, prospection, projets, vidéos, monteurs et planning.")}</li>
            <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />{finance ? tr("Finances : factures, créances et rapports selon vos droits.") : tr("Aucune donnée financière : votre rôle n'y a pas accès.")}</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />{tr("Révocable à tout moment dans « Claude & MCP ».")}</li>
          </ul>
        ) : (
          <Notice tone="warning">{tr("Votre rôle ne permet pas de connecter Claude au CRM.")}</Notice>
        )}
        <p className="text-xs text-faint">{tr("Retour vers : {0}", [host])}</p>
        <form action={decideAuthorization} className="flex flex-col gap-4">
          {hidden}
          {allowed ? (
            <label className="flex gap-3 rounded-lg border border-border p-3">
              <input type="checkbox" name="write" value="1" defaultChecked={check.requestsWrite} className="mt-1 accent-[var(--av-accent)]" />
              <span>
                <span className="flex items-center gap-2 font-semibold"><PenLine className="size-4 text-brand" aria-hidden />{tr("Autoriser aussi la création et la modification")}</span>
                <span className="mt-1 block text-xs text-subtle">
                  {tr("Claude pourra enregistrer factures, encaissements, coûts, charges, clients, projets et vidéos à partir de vos documents ou de vos messages, avec vos droits. Chaque écriture vous est soumise dans Claude ; les factures restent en brouillon, les coûts ne sont jamais validés et rien n'est supprimé.")}
                </span>
              </span>
            </label>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">{tr("Refuser")}</Button>
            {allowed ? <Button type="submit" name="decision" value="approve" className="flex-1">{tr("Autoriser")}</Button> : null}
          </div>
        </form>
      </div>
    </AuthCard>
  );
}
