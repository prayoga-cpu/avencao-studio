import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money, Percent } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { Section } from "@/components/app/section";
import { TabLinks } from "@/components/app/tab-links";
import { Button } from "@/components/ui/button";
import { requireActor } from "@/server/auth/session";
import { can } from "@/server/policies";
import { periodFromParams } from "@/server/period";
import { REPORTS, buildReport, type ReportTable } from "@/server/services/reports";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rapports" };

export default async function ReportsPage(props: PageProps<"/rapports">) {
  const actor = await requireActor();
  const params = await props.searchParams;
  const available = REPORTS.filter((r) => can(actor, r.perm));
  if (available.length === 0) redirect("/acces-refuse");
  const tabs = [...available.map((r) => ({ value: r.key, label: r.label })), { value: "definitions", label: "Définitions" }];
  const key = tabs.find((t) => t.value === params.rapport)?.value ?? tabs[0].value;
  const def = available.find((r) => r.key === key);
  const { period } = await periodFromParams(params);
  const keep: Record<string, string> = {};
  for (const k of ["periode", "du", "au"]) if (typeof params[k] === "string") keep[k] = params[k] as string;
  const report = def ? await buildReport(actor, key, period) : null;
  const qs = new URLSearchParams({ du: period.from, au: period.to }).toString();
  return (
    <>
      <PageHeader title="Rapports" subtitle="Chaque rapport indique sa date de référence. L'export CSV contient exactement les lignes affichées." actions={report ? <Button asChild size="sm" variant="outline"><a href={`/api/exports/${key}?${qs}`}><Download aria-hidden /> Export CSV</a></Button> : null}>
        {def?.usesPeriod ? <PeriodFilter label={period.label} /> : null}
      </PageHeader>
      <TabLinks tabs={tabs} active={key} basePath="/rapports" param="rapport" extraParams={keep} />
      {report ? <ReportView report={report} /> : <Definitions />}
    </>
  );
}

function ReportView({ report }: { report: ReportTable }) {
  const cell = (kind: string | undefined, v: string | null) =>
    kind === "money" ? <Money value={v} empty="—" /> : kind === "percent" ? <Percent value={v} /> : (v ?? "—");
  return (
    <Section title={report.title} description={`Date de référence : ${report.dateBasis}`}>
      {report.notes?.map((n) => <p key={n} className="mb-2 text-xs text-subtle">{n}</p>)}
      {report.rows.length === 0 ? (
        <EmptyState title="Aucune donnée pour cette période" description="Modifiez la période ou vérifiez que des livraisons, factures ou coûts existent." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-border av-scroll">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">{report.title}</caption>
            <thead>
              <tr className="bg-bordeaux">
                {report.columns.map((c) => (
                  <th key={c.key} scope="col" className={cn("border-b border-brand-border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#ffc2db]", c.kind && c.kind !== "text" && "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-brand-soft/40">
                  {report.columns.map((c) => (
                    <td key={c.key} className={cn("px-3 py-2", c.kind && c.kind !== "text" && "num text-right")}>{cell(c.kind, r[c.key] ?? null)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {report.totals ? (
              <tfoot>
                <tr className="bg-surface-2 font-semibold">
                  {report.columns.map((c) => (
                    <td key={c.key} className={cn("px-3 py-2", c.kind && c.kind !== "text" && "num text-right")}>{report.totals![c.key] === undefined ? "" : cell(c.kind, report.totals![c.key] ?? null)}</td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </Section>
  );
}

const DEFINITIONS: [string, string][] = [
  ["Ventes signées HT", "Lignes de ventes acceptées, nettes des annulations, à leur date d'acceptation (annulations à leur date). Les devis non acceptés restent prévisionnels (prospection)."],
  ["CA facturé HT net", "Factures émises HT moins avoirs émis HT, à leur date d'émission respective. Brouillons exclus. Une facture finale déduit l'acompte déjà facturé : le même revenu n'est jamais compté deux fois."],
  ["CA de gestion livré", "Allocation analytique des ventes sur les livrables effectivement livrés, à la date de livraison (et vidéos annulées dont le revenu est maintenu, à la date d'annulation). Mesure de gestion, distincte du CA facturé et de tout revenu comptable légal."],
  ["Encaissements", "Mouvements réellement reçus à leur date de règlement, en TTC (trésorerie). Ne sont pas qualifiés de CA HT."],
  ["Coûts directs", "Sous-traitance, achats et frais exclusivement affectés à une production. Estimé, engagé et validé sont les étapes d'un même coût ; « payé » est dérivé des règlements. Un coût inconnu reste « à renseigner », jamais 0."],
  ["Marge directe", "Revenu contractuel alloué net − coûts directs du même périmètre. « Prévisionnelle » tant que les coûts ne sont pas tous validés ; « finale » quand ils sont clôturés et complets ; « provisoire » si un coût manque."],
  ["Taux de marge sur CA", "Marge directe / revenu HT × 100. Revenu nul → « non calculable » (jamais 0 %)."],
  ["Résultat de gestion estimé, avant fiscalité", "CA de gestion livré de la période − coûts directs de ces livrables − charges de structure rattachées à la période − enveloppes non allouées − frais de paiement − écarts de change. Affiché avant et après valorisation du temps du dirigeant. Ce n'est pas un bénéfice fiscal."],
  ["Flux net de trésorerie", "Encaissements réels − remboursements − règlements prestataires − charges payées − frais. Ce n'est pas un solde bancaire (pas de solde initial ni de rapprochement)."],
  ["Devises", "Chaque opération conserve montant d'origine, devise, taux figé (date et source) et montant EUR. Un nouveau taux ne réécrit jamais une opération passée. Taux manuel signalé comme tel."],
  ["TVA", "La rentabilité est calculée hors TVA récupérable. Une TVA non récupérable peut être intégrée au coût (réglage). Aucun régime fiscal n'est présumé."],
];

function Definitions() {
  return (
    <Section title="Définitions des indicateurs" description="Ce CRM fournit des indicateurs de gestion et ne se présente pas comme un logiciel comptable certifié.">
      <dl className="flex flex-col gap-4">
        {DEFINITIONS.map(([t, d]) => (
          <div key={t}>
            <dt className="font-semibold">{t}</dt>
            <dd className="mt-1 text-sm text-subtle">{d}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
