"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "#i18n";

/**
 * Graphiques (Recharts). Les montants arrivent en chaînes décimales exactes ; ils ne sont
 * convertis en nombre que pour le tracé (position des marques), jamais pour un calcul.
 * Palette validée sur fond #111111 : #ff0066 (série 1) et #4f8ff0 (série 2).
 * Un seul axe Y ; info-bulle au survol ; vue tableau disponible.
 */
export const SERIES = ["#ff0066", "#4f8ff0"] as const;

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurPrecise = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const AXIS = { stroke: "#7a7a7a", fontSize: 11 };
const tooltipStyle = { background: "#151515", border: "1px solid rgba(255,0,102,0.3)", borderRadius: 10, color: "#f2f2f2", fontSize: 12 };

function TableToggle({ children, table }: { children: React.ReactNode; table: React.ReactNode }) {
  const tr = useT();
  const [showTable, setShowTable] = useState(false);
  return (
    <div>
      <div className="mb-1 flex justify-end">
        <Button size="xs" variant="ghost" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          <Table2 aria-hidden /> {showTable ? tr("Graphique") : tr("Données")}
        </Button>
      </div>
      {showTable ? <div className="max-h-72 overflow-auto av-scroll">{table}</div> : children}
    </div>
  );
}

export function MonthlyFinanceChart({ data }: { data: { month: string; invoicedEur: string; collectedEur: string }[] }) {
  const tr = useT();
  const points = data.map((d) => ({ month: d.month.slice(5) + "/" + d.month.slice(2, 4), invoiced: Number(d.invoicedEur), collected: Number(d.collectedEur), raw: d }));
  const empty = data.every((d) => d.invoicedEur === "0.00" && d.collectedEur === "0.00");
  if (empty) return <p className="py-10 text-center text-sm text-subtle">{tr("Aucune facture ni encaissement sur les 12 derniers mois.")}</p>;
  return (
    <TableToggle
      table={
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-subtle"><th>{tr("Mois")}</th><th className="text-right">{tr("CA facturé HT net")}</th><th className="text-right">{tr("Encaissements")}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.month} className="border-t border-border"><td>{d.month}</td><td className="num text-right">{eurPrecise.format(d.invoicedEur as unknown as number)}</td><td className="num text-right">{eurPrecise.format(d.collectedEur as unknown as number)}</td></tr>)}</tbody>
        </table>
      }
    >
      <div className="h-64" role="img" aria-label={tr("CA facturé et encaissements sur 12 mois")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#262626" vertical={false} />
            <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => eur.format(v)} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#555", strokeWidth: 1 }} formatter={(v, name) => [eurPrecise.format(Number(v)), name === "invoiced" ? "CA facturé HT net" : "Encaissements TTC"]} />
            <Legend formatter={(v) => <span className="text-xs text-subtle">{v === "invoiced" ? tr("CA facturé HT net") : tr("Encaissements (TTC)")}</span>} />
            <Line type="monotone" dataKey="invoiced" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#111111" }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="collected" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#111111" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </TableToggle>
  );
}

/** Barres horizontales, une seule série (une seule couleur), valeurs formatées en texte neutre. */
export function BarList({
  data,
  valueLabel,
  money = false,
  emptyText,
}: {
  data: { label: string; value: string; note?: string }[];
  valueLabel: string;
  money?: boolean;
  emptyText: string;
}) {
  const tr = useT();
  if (data.length === 0) return <p className="py-10 text-center text-sm text-subtle">{tr(emptyText)}</p>;
  const fmt = (v: string) => (money ? eurPrecise.format(v as unknown as number) : v);
  const points = data.map((d) => ({ ...d, label: tr(d.label), note: d.note ? tr(d.note) : d.note, n: Number(d.value) }));
  const height = Math.max(120, data.length * 34 + 30);
  return (
    <TableToggle
      table={
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-subtle"><th>{tr("Libellé")}</th><th className="text-right">{valueLabel}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label} className="border-t border-border"><td>{tr(d.label)}{d.note ? <span className="block text-xs text-faint">{tr(d.note)}</span> : null}</td><td className="num text-right">{fmt(d.value)}</td></tr>)}</tbody>
        </table>
      }
    >
      <div style={{ height }} role="img" aria-label={tr(valueLabel)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={8}>
            <CartesianGrid stroke="#262626" horizontal={false} />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => (money ? eur.format(v) : String(v))} />
            <YAxis type="category" dataKey="label" tick={{ ...AXIS, fill: "#aaaaaa" }} width={130} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,0,102,0.06)" }} formatter={(_v, _n, item) => [fmt((item.payload as { value: string }).value), valueLabel]} />
            <Bar dataKey="n" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {points.map((p) => <Cell key={p.label} fill={SERIES[0]} fillOpacity={p.n < 0 ? 0.45 : 1} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </TableToggle>
  );
}
