"use client";

import { useState } from "react";
import { Loader2, Lock, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { EmptyState } from "@/components/app/empty-state";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addNoteAction, deleteNoteAction } from "@/features/clients/actions";
import { formatDateTime } from "@/lib/dates";

export interface NoteItem {
  id: string;
  body: string;
  createdAt: Date;
  visibility: "INTERNAL" | "ADMIN_ONLY";
  legacySource: string | null;
  author: { id: string; name: string } | null;
}

/** Notes internes historisées (client, projet, vidéo, monteur). Jamais visibles des monteurs. */
export function NotesPanel({
  notes,
  target,
  canAdminOnly,
  currentUserId,
  isAdmin,
  timezone,
}: {
  notes: NoteItem[];
  target: { clientId?: string; projectId?: string; videoId?: string; editorId?: string };
  canAdminOnly: boolean;
  currentUserId: string;
  isAdmin: boolean;
  timezone: string;
}) {
  const [body, setBody] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);
  const { pending, run } = useAction();
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              addNoteAction({
                body,
                clientId: target.clientId ?? "",
                projectId: target.projectId ?? "",
                videoId: target.videoId ?? "",
                editorId: target.editorId ?? "",
                adminOnly,
              }),
            { onSuccess: () => setBody("") },
          );
        }}
      >
        <Label htmlFor="note-body" className="text-xs font-semibold text-subtle">
          Nouvelle note interne
        </Label>
        <Textarea id="note-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Échange, décision, information utile…" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {canAdminOnly ? (
            <div className="flex items-center gap-2">
              <Checkbox id="note-admin" checked={adminOnly} onCheckedChange={(v) => setAdminOnly(v === true)} />
              <Label htmlFor="note-admin" className="text-sm text-subtle">
                Réservée aux administrateurs
              </Label>
            </div>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={pending || body.trim().length === 0}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Ajouter la note
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <EmptyState title="Aucune note" description="Les notes ajoutées ici restent internes à l'agence." />
      ) : (
        <ol className="flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-border bg-surface-2/50 p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-subtle">
                <span>
                  <span className="font-semibold text-foreground">{n.author?.name ?? "Utilisateur supprimé"}</span> · {formatDateTime(n.createdAt, timezone)}
                  {n.legacySource ? <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5">Historique importé</span> : null}
                  {n.visibility === "ADMIN_ONLY" ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-warning">
                      <Lock className="size-3" aria-hidden /> Admin
                    </span>
                  ) : null}
                </span>
                {!n.legacySource && (n.author?.id === currentUserId || isAdmin) ? (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="Supprimer la note">
                        <Trash2 aria-hidden />
                      </Button>
                    }
                    title="Supprimer cette note ?"
                    description="La suppression est tracée dans le journal d'audit."
                    destructive
                    confirmLabel="Supprimer"
                    action={() => deleteNoteAction(n.id)}
                  />
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
