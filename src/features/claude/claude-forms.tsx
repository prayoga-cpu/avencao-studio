"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { useT } from "#i18n";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field, NativeSelect } from "@/components/app/field";
import { Notice } from "@/components/app/notice";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPersonalTokenAction, revokeGrantAction, revokePersonalTokenAction, setGrantWriteAccessAction, setTokenWriteAccessAction } from "./actions";

/** Valeur à copier (URL, commande, jeton) avec bouton « Copier ». */
export function CopyField({ value, label, multiline = false }: { value: string; label: string; multiline?: boolean }) {
  const tr = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <code
        aria-label={tr(label)}
        className={`min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs ${multiline ? "whitespace-pre-wrap break-all" : "truncate"}`}
      >
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
        aria-label={tr("Copier : {0}", [tr(label)])}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? tr("Copié") : tr("Copier")}
      </Button>
    </div>
  );
}

/** Création d'un jeton personnel : le jeton complet n'est montré qu'une fois. */
export function CreateTokenForm({ mcpUrl }: { mcpUrl: string }) {
  const tr = useT();
  const { pending, run } = useAction();
  const [name, setName] = useState("Claude Code");
  const [days, setDays] = useState("90");
  const [write, setWrite] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  if (token) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="warning" title={tr("Copiez ce jeton maintenant")}>
          {tr("Il ne sera plus affiché. Traitez-le comme un mot de passe : il donne accès au CRM avec vos droits.")}
        </Notice>
        <CopyField value={token} label="Jeton personnel" />
        <p className="text-xs text-subtle">{tr("Commande Claude Code prête à l'emploi :")}</p>
        <CopyField multiline value={`claude mcp add --transport http avencao ${mcpUrl} --header "Authorization: Bearer ${token}"`} label="Commande Claude Code" />
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setToken(null)}>
          {tr("J'ai copié le jeton")}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createPersonalTokenAction({ name, days: Number(days), write }), { onSuccess: (data) => setToken(data.token) });
      }}
    >
      <Field label={tr("Nom du jeton")} htmlFor="token-name" required>
        <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </Field>
      <Field label={tr("Validité")} htmlFor="token-days">
        <NativeSelect id="token-days" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="30">{tr("30 jours")}</option>
          <option value="90">{tr("90 jours")}</option>
          <option value="365">{tr("1 an")}</option>
        </NativeSelect>
      </Field>
      <Button type="submit" disabled={pending || name.trim().length < 2}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
        {tr("Créer un jeton")}
      </Button>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="accent-[var(--av-accent)]" />
        {tr("Autoriser aussi la création et la modification (chaque écriture vous est soumise dans Claude)")}
      </label>
    </form>
  );
}

export function RevokeTokenButton({ id, name }: { id: string; name: string }) {
  const tr = useT();
  return (
    <ConfirmAction
      trigger={<Button size="xs" variant="outline">{tr("Révoquer")}</Button>}
      title="Révoquer ce jeton ?"
      description={tr("« {0} » ne pourra plus accéder au CRM. Action immédiate et définitive.", [name])}
      confirmLabel="Révoquer"
      destructive
      action={() => revokePersonalTokenAction(id)}
    />
  );
}

export function RevokeGrantButton({ grantId, client }: { grantId: string; client: string }) {
  const tr = useT();
  return (
    <ConfirmAction
      trigger={<Button size="xs" variant="outline">{tr("Déconnecter")}</Button>}
      title="Déconnecter cette application ?"
      description={tr("{0} perdra immédiatement l'accès au CRM. Vous pourrez la reconnecter plus tard.", [client])}
      confirmLabel="Déconnecter"
      destructive
      action={() => revokeGrantAction(grantId)}
    />
  );
}

/**
 * Bascule lecture seule ↔ lecture + écriture d'une connexion de Claude (application OAuth ou
 * jeton personnel) : effet dès le prochain appel, sans reconnexion.
 */
export function WriteAccessToggle({ kind, id, name, write }: { kind: "grant" | "token"; id: string; name: string; write: boolean }) {
  const tr = useT();
  const action = () => (kind === "grant" ? setGrantWriteAccessAction(id, !write) : setTokenWriteAccessAction(id, !write));
  return write ? (
    <ConfirmAction
      trigger={<Button size="xs" variant="outline">{tr("Passer en lecture seule")}</Button>}
      title="Retirer l'écriture ?"
      description={tr("{0} pourra seulement consulter le CRM. Vous pourrez réactiver l'écriture à tout moment.", [name])}
      confirmLabel="Lecture seule"
      action={action}
    />
  ) : (
    <ConfirmAction
      trigger={<Button size="xs" variant="outline">{tr("Autoriser l'écriture")}</Button>}
      title="Autoriser Claude à enregistrer des données ?"
      description={tr("{0} pourra créer et modifier factures, encaissements, coûts, charges, clients, projets et vidéos avec vos droits. Chaque écriture vous est soumise dans Claude ; les factures restent en brouillon, les coûts ne sont jamais validés et rien n'est supprimé. Ouvrez une nouvelle conversation pour que Claude voie les nouveaux outils.", [name])}
      confirmLabel="Autoriser"
      action={action}
    />
  );
}
