"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { useT } from "#i18n";

export interface AttachmentItem {
  id: string;
  filename: string;
  contentType: string;
  byteSize: number;
  createdAt: Date;
}

/** Pièces jointes légères (PDF/images ≤ limite). Les rushs restent dans Drive/Frame.io. */
export function AttachmentsPanel({
  items,
  ownerType,
  ownerId,
  canUpload,
  timezone,
  hint = "PDF, PNG, JPEG ou WebP. Les rushs et masters restent dans Drive / Frame.io (ajoutez un lien).",
}: {
  items: AttachmentItem[];
  ownerType: string;
  ownerId: string;
  canUpload: boolean;
  timezone: string;
  hint?: string;
}) {
  const tr = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function upload(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("ownerType", ownerType);
      fd.set("ownerId", ownerId);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Envoi refusé");
      toast.success(tr("Document ajouté."));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {canUpload ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            id={`upload-${ownerId}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {tr("Ajouter un document")}</Button>
          <p className="text-xs text-faint">{tr(hint)}</p>
        </div>
      ) : null}
      {items.length === 0 ? (
        <EmptyState title={tr("Aucun document")} description={tr("Factures, contrats ou justificatifs apparaîtront ici.")} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 hover:text-brand">
                <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
                <span className="truncate">{a.filename}</span>
              </a>
              <span className="shrink-0 text-xs text-faint">
                {(a.byteSize / 1024).toFixed(0)} {" "}{tr("Ko ·")}{" "}{formatDateTime(a.createdAt, timezone)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
