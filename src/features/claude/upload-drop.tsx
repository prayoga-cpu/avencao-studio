"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useLocale, useT } from "#i18n";
import { Notice } from "@/components/app/notice";
import { translateMessage } from "@/lib/i18n/translate";

type DropState = { status: "idle" | "sending" } | { status: "error"; message: string } | { status: "done"; label: string; url: string };

/** Zone de dépôt de la page /depot : envoi du fichier sur le lien à usage unique remis par Claude. */
export function UploadDrop({ token, maxUploadMb }: { token: string; maxUploadMb: number }) {
  const tr = useT();
  const locale = useLocale();
  const [state, setState] = useState<DropState>({ status: "idle" });
  const [dragging, setDragging] = useState(false);

  async function send(file: File | undefined) {
    if (!file || state.status === "sending") return;
    if (file.size > maxUploadMb * 1024 * 1024) {
      setState({ status: "error", message: tr("Fichier trop volumineux (max {0} Mo).", [String(maxUploadMb)]) });
      return;
    }
    setState({ status: "sending" });
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch(`/api/mcp/upload/${encodeURIComponent(token)}`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string; attachedTo?: string; url?: string };
      if (res.status === 413) setState({ status: "error", message: tr("Fichier trop volumineux (max {0} Mo).", [String(maxUploadMb)]) });
      else if (!res.ok) setState({ status: "error", message: translateMessage(locale, data.error ?? "Envoi impossible pour le moment.") });
      else setState({ status: "done", label: data.attachedTo ?? "", url: data.url ?? "/" });
    } catch {
      setState({ status: "error", message: tr("Envoi impossible pour le moment.") });
    }
  }

  if (state.status === "done") {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="success" title={tr("Document enregistré")}>{tr("Rattaché à : {0}", [state.label])}</Notice>
        <a href={state.url} className="text-sm font-semibold text-brand hover:underline">{tr("Ouvrir dans le CRM")}</a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void send(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${dragging ? "border-brand bg-surface-2" : "border-border"}`}
      >
        {state.status === "sending" ? <Loader2 className="size-8 animate-spin text-brand" aria-hidden /> : <FileUp className="size-8 text-brand" aria-hidden />}
        <span className="font-semibold">{state.status === "sending" ? tr("Envoi en cours…") : tr("Glissez le fichier ici ou touchez pour le choisir")}</span>
        <span className="text-xs text-subtle">{tr("PDF, PNG, JPEG ou WebP · {0} Mo maximum", [String(maxUploadMb)])}</span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={state.status === "sending"}
          onChange={(e) => void send(e.target.files?.[0])}
        />
      </label>
      {state.status === "error" ? <Notice tone="danger">{state.message}</Notice> : null}
    </div>
  );
}
