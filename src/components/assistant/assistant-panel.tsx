"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, ChevronUp, Copy, ExternalLink, History, Minus, Plug, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "#i18n";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MAX_CLAUDE_QUESTION, buildClaudePrompt, claudeNewChatUrl } from "@/lib/claude-link";

type PanelState = "closed" | "open" | "minimized";

const STATE_KEY = "avencao.assistant.state";
const RECENT_KEY = "avencao.assistant.recent";

// État du panneau mémorisé dans le navigateur (repli en mémoire si le stockage est indisponible).
let memoryState: PanelState | null = null;
const listeners = new Set<() => void>();

function readState(): PanelState {
  if (memoryState) return memoryState;
  try {
    const v = window.localStorage.getItem(STATE_KEY);
    return v === "open" || v === "minimized" ? v : "closed";
  } catch {
    return "closed";
  }
}

function writeState(state: PanelState) {
  memoryState = state;
  try {
    window.localStorage.setItem(STATE_KEY, state);
  } catch {
    // stockage indisponible (navigation privée) : état gardé en mémoire
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readRecent(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

/**
 * « Demander à Claude » (toutes les pages) : ouvert, réduit ou fermé. La question part dans le
 * compte Claude de l'utilisateur (nouvel onglet claude.ai, ou copiée pour Claude Desktop / Code),
 * qui lit le CRM via le serveur MCP. Aucune API d'IA côté CRM.
 * Sur téléphone, il s'efface tant que la barre d'actions groupées (vidéos sélectionnées) est affichée.
 */
export function AssistantPanel({ connected, finance }: { connected: boolean; finance: boolean }) {
  const tr = useT();
  const pathname = usePathname();
  const state = useSyncExternalStore(subscribe, readState, () => "closed" as PanelState);
  const [question, setQuestion] = useState("");
  const [withPage, setWithPage] = useState(true);
  const [recent, setRecent] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecent()));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onRecordPage = pathname !== "/dashboard" && pathname !== "/claude";

  const change = useCallback((next: PanelState) => writeState(next), []);

  useEffect(() => {
    if (state === "open") setTimeout(() => inputRef.current?.focus(), 50);
  }, [state]);

  function prompt(): string {
    const page = withPage && onRecordPage ? window.location.href : null;
    return buildClaudePrompt(tr, question, page);
  }

  function remember(q: string) {
    const next = [q, ...recent.filter((r) => r !== q)].slice(0, 5);
    setRecent(next);
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // historique non mémorisé
    }
  }

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function openInClaude() {
    if (!question.trim()) return;
    const text = prompt();
    // Ouverture immédiate (geste de l'utilisateur), puis copie de secours.
    window.open(claudeNewChatUrl(text), "_blank", "noopener,noreferrer");
    remember(question.trim());
    if (await copy(text)) toast.success(tr("Question envoyée à Claude (aussi copiée : collez-la si elle n'apparaît pas)."));
  }

  async function copyOnly() {
    if (!question.trim()) return;
    remember(question.trim());
    if (await copy(prompt())) toast.success(tr("Question copiée : collez-la dans Claude Desktop ou Claude Code."));
    else toast.error(tr("Copie impossible : sélectionnez le texte manuellement."));
  }

  const suggestions = [
    tr("Qu'est-ce qui est en retard aujourd'hui ?"),
    tr("Quelles vidéos sont à attribuer cette semaine ?"),
    tr("Quel monteur a de la disponibilité cette semaine ?"),
    ...(finance ? [tr("Résume les chiffres du mois."), tr("Quelles factures sont impayées ?")] : []),
  ];

  if (state === "closed") {
    return (
      <button
        type="button"
        onClick={() => change("open")}
        className="max-md:[body:has([data-bulk-bar])_&]:hidden fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-brand-border bg-[#111111f2] px-4 py-3 text-sm font-semibold shadow-[0_0_30px_rgba(255,0,102,0.25)] backdrop-blur hover:border-brand hover:text-brand"
        aria-label={tr("Demander à Claude")}
      >
        <Sparkles className="size-4 text-brand" aria-hidden />
        <span className="hidden sm:inline">{tr("Demander à Claude")}</span>
      </button>
    );
  }

  if (state === "minimized") {
    return (
      <div className="max-md:[body:has([data-bulk-bar])_&]:hidden fixed bottom-4 right-4 z-40 flex items-center gap-1 rounded-full border border-brand-border bg-[#111111f2] py-1.5 pl-4 pr-1.5 text-sm shadow-[0_0_30px_rgba(255,0,102,0.2)] backdrop-blur" role="region" aria-label={tr("Demander à Claude")}>
        <button type="button" onClick={() => change("open")} className="flex items-center gap-2 font-semibold hover:text-brand">
          <Sparkles className="size-4 text-brand" aria-hidden />
          {tr("Claude")}
          {question.trim() ? <span className="size-2 rounded-full bg-brand" aria-label={tr("Question en cours de rédaction")} /> : null}
        </button>
        <Button size="icon" variant="ghost" className="size-7 rounded-full" onClick={() => change("open")} aria-label={tr("Agrandir")}>
          <ChevronUp aria-hidden />
        </Button>
        <Button size="icon" variant="ghost" className="size-7 rounded-full" onClick={() => change("closed")} aria-label={tr("Fermer")}>
          <X aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <section
      role="region"
      aria-label={tr("Demander à Claude")}
      onKeyDown={(e) => {
        if (e.key === "Escape") change("minimized");
      }}
      className="max-md:[body:has([data-bulk-bar])_&]:hidden fixed inset-x-0 bottom-0 z-40 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border border-brand-border bg-[#0d0d0df7] shadow-[0_0_50px_rgba(255,0,102,0.18)] backdrop-blur sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[400px] sm:rounded-2xl"
    >
      <header className="av-panel-header flex items-center gap-2 px-3 py-2.5">
        <Sparkles className="size-4 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">{tr("Demander à Claude")}</h2>
          <p className="truncate text-[0.7rem] text-subtle">{tr("Avec votre compte Claude, selon vos droits")}</p>
        </div>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => change("minimized")} aria-label={tr("Réduire")} title={tr("Réduire")}>
          <Minus aria-hidden />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => change("closed")} aria-label={tr("Fermer")} title={tr("Fermer")}>
          <X aria-hidden />
        </Button>
      </header>

      <div className="flex flex-col gap-3 overflow-y-auto p-3 av-scroll">
        {connected ? (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {tr("Claude est connecté au CRM.")}
          </p>
        ) : (
          <Notice tone="info" title={tr("Connectez Claude une seule fois")}>
            <span className="block">{tr("Ajoutez le connecteur « Avencao CRM » dans Claude pour qu'il lise le CRM avec vos droits.")}</span>
            <Link href="/claude" className="mt-1 inline-flex items-center gap-1 font-semibold text-brand hover:underline">
              <Plug className="size-3.5" aria-hidden />
              {tr("Connecter Claude")}
            </Link>
          </Notice>
        )}

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void openInClaude();
          }}
        >
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void openInClaude();
              }
            }}
            rows={3}
            maxLength={MAX_CLAUDE_QUESTION}
            placeholder={tr("Votre question…")}
            aria-label={tr("Votre question…")}
            className="min-h-20 resize-y rounded-lg border border-input bg-surface px-3 py-2 text-sm focus-visible:border-brand focus-visible:outline-offset-0"
          />
          {onRecordPage ? (
            <div className="flex items-center gap-2">
              <Checkbox id="assistant-with-page" checked={withPage} onCheckedChange={(v) => setWithPage(v === true)} />
              <Label htmlFor="assistant-with-page" className="min-w-0 text-xs text-subtle">
                <span className="truncate">{tr("Joindre la page ouverte ({0})", [pathname])}</span>
              </Label>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={!question.trim()}>
              <ExternalLink aria-hidden />
              {tr("Ouvrir dans Claude")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void copyOnly()} disabled={!question.trim()} title={tr("Pour Claude Desktop ou Claude Code")}>
              <Copy aria-hidden />
              {tr("Copier")}
            </Button>
          </div>
        </form>

        {!question.trim() ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-subtle">{tr("Idées de questions")}</p>
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setQuestion(s)} className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-brand/60 hover:bg-brand-soft">
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {recent.length ? (
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-1 text-xs font-semibold text-subtle">
              <History className="size-3.5" aria-hidden />
              {tr("Questions récentes")}
            </p>
            {recent.map((r) => (
              <button key={r} type="button" onClick={() => setQuestion(r)} className="truncate rounded px-2 py-1 text-left text-xs text-subtle hover:bg-surface-2 hover:text-foreground" title={r}>
                {r}
              </button>
            ))}
          </div>
        ) : null}

        <p className="text-[0.7rem] leading-snug text-faint">
          {tr("Claude répond dans un nouvel onglet, avec votre propre compte (aucun coût pour le CRM). La question est aussi copiée : collez-la si elle n'apparaît pas.")}
        </p>
      </div>
    </section>
  );
}
