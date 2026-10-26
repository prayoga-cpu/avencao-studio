"use server";

import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";
import { approveAuthorization, checkAuthorizeRequest, errorRedirect, type AuthorizeParams } from "@/server/mcp/oauth";

const KEYS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

function paramsFrom(formData: FormData): AuthorizeParams {
  const out: AuthorizeParams = {};
  for (const k of KEYS) {
    const v = formData.get(k);
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

/** Accord de l'utilisateur : la demande est revalidée côté serveur avant de délivrer un code. */
export async function decideAuthorization(formData: FormData) {
  const params = paramsFrom(formData);
  const check = await checkAuthorizeRequest(params);
  if (!check.ok) {
    if (!check.fatal) redirect(check.redirectTo);
    redirect("/oauth/autoriser?erreur=1");
  }
  if (formData.get("decision") !== "approve") {
    redirect(errorRedirect(check.redirectUri, "access_denied", "The user denied access.", check.state));
  }
  const actor = await getActor();
  if (!actor) redirect(`/connexion?suite=${encodeURIComponent(`/oauth/autoriser?${new URLSearchParams(params as Record<string, string>).toString()}`)}`);
  const target = await approveAuthorization(actor, check);
  redirect(target);
}
