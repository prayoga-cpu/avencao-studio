"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import Papa from "papaparse";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Notice } from "@/components/app/notice";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import type { ImportPreviewRow, ImportRow } from "@/server/services/clients";
import { commitClientImportAction, previewClientImportAction } from "./actions";

const TEMPLATE = "nom;type;statut;email;telephone;whatsapp;pays;adresse;tva;identifiant;site;instagram;source;devise;delai_paiement;drive;contact_prenom;contact_nom;contact_email;contact_telephone;etiquettes;notes\nExemple Studio;entreprise;prospect;hello@exemple.test;+33600000000;;France;1 rue Exemple, Paris;;;exemple.test;@exemple;Salon;EUR;30;;Alex;Martin;alex@exemple.test;;Reels, Publicité;\n";

export function ImportWizard() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null);
  const [force, setForce] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ created: number; skipped: { index: number; reason: string }[] } | null>(null);
  const [pending, start] = useTransition();

  function onFile(file: File) {
    setResult(null);
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_"),
      complete: (res) => {
        if (res.data.length === 0) {
          toast.error("Fichier vide ou illisible.");
          return;
        }
        setRows(res.data);
        start(async () => {
          const r = await previewClientImportAction(res.data);
          if (r.ok) {
            setPreview(r.data);
            setForce(new Set());
          } else toast.error(r.error);
        });
      },
      error: () => toast.error("Lecture du CSV impossible."),
    });
  }

  const ready = preview?.filter((p) => p.errors.length === 0 && ((p.duplicates.length === 0 && p.inFileDuplicateOf === null) || force.has(p.index))).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info">
        CSV séparé par « ; » ou « , » avec en-têtes. Les doublons sont détectés sur l&apos;email, le téléphone et les identifiants administratifs — jamais sur la seule ressemblance du nom. Aucune fusion automatique.
      </Notice>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:outline-2">
          <Upload className="size-4" aria-hidden /> Choisir un fichier CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <Button variant="outline" asChild>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + TEMPLATE)}`} download="modele-import-clients.csv"><Download aria-hidden /> Modèle CSV</a>
        </Button>
        {pending ? <Loader2 className="size-5 animate-spin text-subtle" aria-label="Analyse en cours" /> : null}
      </div>
      {preview ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-brand-border av-scroll">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="bg-bordeaux text-left text-xs uppercase text-[#ffc2db]"><th className="px-3 py-2">Ligne</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Contrôle</th><th className="px-3 py-2">Décision</th></tr></thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.index} className="border-t border-white/5 align-top">
                    <td className="num px-3 py-2 text-subtle">{p.index + 2}</td>
                    <td className="px-3 py-2">{p.displayName}</td>
                    <td className="px-3 py-2">
                      {p.errors.length ? <span className="text-danger">{p.errors.join(" · ")}</span> : null}
                      {p.duplicates.map((d) => <span key={d.id} className="block text-warning">Doublon possible : <Link href={`/clients/${d.id}`} target="_blank" className="underline">{d.displayName}</Link> ({d.reason})</span>)}
                      {p.inFileDuplicateOf !== null ? <span className="block text-warning">Même email que la ligne {p.inFileDuplicateOf + 2}</span> : null}
                      {!p.errors.length && !p.duplicates.length && p.inFileDuplicateOf === null ? <StatusBadge label="OK" tone="success" /> : null}
                    </td>
                    <td className="px-3 py-2">
                      {p.errors.length ? "Ignorée" : p.duplicates.length || p.inFileDuplicateOf !== null ? (
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" className="accent-[var(--av-accent)]" checked={force.has(p.index)} onChange={(e) => { const n = new Set(force); if (e.target.checked) n.add(p.index); else n.delete(p.index); setForce(n); }} />
                          Créer quand même
                        </label>
                      ) : "Créée"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-sm text-subtle">{ready} client(s) seront créés</span>
            <Button
              disabled={pending || ready === 0}
              onClick={() => start(async () => {
                const r = await commitClientImportAction(rows, [...force]);
                if (r.ok) { setResult(r.data); setPreview(null); toast.success(`${r.data.created} client(s) créé(s).`); } else toast.error(r.error);
              })}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Importer
            </Button>
          </div>
        </>
      ) : null}
      {result ? (
        <Notice tone="success" title={`${result.created} client(s) créé(s)`}>
          {result.skipped.length ? `${result.skipped.length} ligne(s) ignorée(s) (invalides ou doublons non confirmés).` : "Aucune ligne ignorée."} <Link href="/clients" className="underline">Voir les clients</Link>
        </Notice>
      ) : null}
    </div>
  );
}
