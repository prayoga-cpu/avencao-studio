import "server-only";
import { APIError } from "better-auth/api";
import { getLocale } from "@/lib/i18n/server";
import { publicAppUrl } from "../app-url";
import { sendMail } from "../mail";
import { LOGIN_CODE_TTL_SECONDS } from "./login-policy";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Email de connexion : code à 6 chiffres + lien direct (même code, usage unique).
 * Le lien ouvre une page avec un bouton de confirmation : un scanner de liens qui « visite »
 * l'URL ne consomme pas le code.
 */
export async function sendLoginCodeEmail(email: string, otp: string): Promise<void> {
  const locale = await getLocale();
  const minutes = LOGIN_CODE_TTL_SECONDS / 60;
  const link = `${publicAppUrl()}/connexion/code?email=${encodeURIComponent(email)}&code=${otp}`;
  const en = locale === "en";
  const subject = en ? `Avencao CRM — sign-in code: ${otp}` : `Avencao CRM — code de connexion : ${otp}`;
  const text = en
    ? `Hello,\n\nYour sign-in code: ${otp}\n\nOr sign in directly with this link:\n${link}\n\nThe code and link are valid for ${minutes} minutes and can be used once. If you didn't request this, ignore this email.`
    : `Bonjour,\n\nVotre code de connexion : ${otp}\n\nOu connectez-vous directement avec ce lien :\n${link}\n\nCode et lien valables ${minutes} minutes, utilisables une seule fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`;
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#080808;font-family:Arial,Helvetica,sans-serif;color:#f2f2f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#111111;border:1px solid rgba(255,0,102,0.25);border-radius:16px;padding:28px">
<tr><td style="font-size:13px;letter-spacing:3px;color:#aaaaaa;text-transform:uppercase">Avencao CRM</td></tr>
<tr><td style="padding-top:16px;font-size:15px">${en ? "Your sign-in code" : "Votre code de connexion"}</td></tr>
<tr><td style="padding:12px 0 20px;font-size:34px;font-weight:bold;letter-spacing:8px;color:#ffffff">${escapeHtml(otp)}</td></tr>
<tr><td><a href="${escapeHtml(link)}" style="display:inline-block;background:#ff0066;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">${en ? "Sign in to the CRM" : "Se connecter au CRM"}</a></td></tr>
<tr><td style="padding-top:20px;font-size:12px;color:#aaaaaa;line-height:1.5">${en ? `Valid for ${minutes} minutes, single use. If you didn't request this, ignore this email.` : `Valable ${minutes} minutes, utilisable une seule fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`}</td></tr>
</table></td></tr></table></body></html>`;

  // En développement, aucun email réel n'est envoyé (sauf SEND_LOGIN_EMAILS_IN_DEV=true) : le code
  // s'affiche dans la console du serveur.
  if (process.env.NODE_ENV !== "production" && process.env.SEND_LOGIN_EMAILS_IN_DEV !== "true") {
    console.info(`[dev] Code de connexion pour ${email} : ${otp} — ${link}`);
    return;
  }
  const result = await sendMail({ to: email, subject, text, html });
  if (!result.sent) {
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "Envoi du code impossible pour le moment." });
  }
}
