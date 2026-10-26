import "server-only";
import nodemailer from "nodemailer";
import { mailTransport } from "./env";

export interface MailResult {
  sent: boolean;
  reason?: string;
}

/**
 * Envoi d'email uniquement si un canal est configuré (Resend ou SMTP). Sinon rien n'est
 * « envoyé » : l'appelant affiche le lien à l'administrateur. Aucun envoi simulé.
 */
export async function sendMail(input: { to: string; subject: string; text: string; html?: string }): Promise<MailResult> {
  const cfg = mailTransport();
  if (!cfg) return { sent: false, reason: "Aucun canal email configuré" };
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
  });
  try {
    await transport.sendMail({ from: cfg.from, replyTo: cfg.replyTo, to: input.to, subject: input.subject, text: input.text, html: input.html });
    return { sent: true };
  } catch (error) {
    // Le message d'erreur du fournisseur peut contenir l'adresse : journalisé côté serveur seulement.
    console.error("[mail] échec d'envoi", (error as Error).message);
    return { sent: false, reason: "Échec d'envoi (voir journaux serveur)" };
  }
}
