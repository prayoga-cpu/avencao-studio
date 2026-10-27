import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthCard } from "../../auth-card";
import { Notice } from "@/components/app/notice";
import { UploadDrop } from "@/features/claude/upload-drop";
import { formatDateTime } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { describeUploadTicket } from "@/server/mcp/uploads";
import { agencyTimezone } from "@/server/services/common";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Déposer un document") };
}

/** Taille utile d'un envoi sur Vercel (corps de requête limité à ~4,5 Mo par fonction). */
const VERCEL_BODY_MB = 4;

/**
 * Dépôt de la pièce d'origine (facture, reçu, devis, brief) sur l'élément créé par Claude.
 * Page publique : le lien à usage unique (24 h) est le seul justificatif, sans connexion,
 * pour pouvoir déposer depuis un téléphone. Rien d'autre que le libellé de l'élément n'est affiché.
 */
export default async function DepotPage(props: PageProps<"/depot/[token]">) {
  await connection();
  const tr = await getT();
  const { token } = await props.params;
  const state = await describeUploadTicket(token);

  if (state.status === "unknown" || state.status === "expired") {
    return (
      <AuthCard title="Lien de dépôt invalide">
        <Notice tone="warning">{tr("Ce lien est expiré ou inconnu. Demandez à Claude un nouveau lien de dépôt.")}</Notice>
      </AuthCard>
    );
  }
  if (state.status === "used") {
    return (
      <AuthCard title="Document déjà déposé">
        <Notice tone="success">{tr("Le document est déjà rattaché à : {0}", [state.label])}</Notice>
      </AuthCard>
    );
  }
  const timezone = await agencyTimezone();
  const maxUploadMb = process.env.VERCEL ? Math.min(state.maxUploadMb, VERCEL_BODY_MB) : state.maxUploadMb;
  return (
    <AuthCard title="Déposer le document d'origine" subtitle={tr("Il sera rattaché à : {0}", [state.label])}>
      <UploadDrop token={token} maxUploadMb={maxUploadMb} />
      <p className="mt-4 text-xs text-faint">{tr("Lien à usage unique, valable jusqu'au {0}.", [formatDateTime(state.expiresAt, timezone)])}</p>
    </AuthCard>
  );
}
