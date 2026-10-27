import { NextResponse, type NextRequest } from "next/server";
import { DomainError, ForbiddenError, NotFoundError } from "@/server/errors";
import { consumeUploadTicket } from "@/server/mcp/uploads";
import { revalidateAppQuietly } from "@/server/revalidate";

/**
 * Dépôt d'une pièce d'origine par lien à usage unique remis par Claude (le lien est le seul
 * justificatif, aucune session) :
 * - PUT : contenu brut, ex. `curl -T facture.pdf <lien>` depuis Claude Code (nom facultatif : ?nom=…) ;
 * - POST : formulaire multipart, champ « file » (page /depot).
 */
export const maxDuration = 60;

async function save(token: string, file: File) {
  try {
    const res = await consumeUploadTicket(token, file);
    revalidateAppQuietly();
    return NextResponse.json({ ok: true, attachmentId: res.attachmentId, attachedTo: res.label, url: res.url });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[mcp-upload] dépôt échoué", (e as Error).message);
    return NextResponse.json({ error: "Envoi impossible pour le moment." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/mcp/upload/[token]">) {
  const { token } = await ctx.params;
  const data = await request.arrayBuffer().catch(() => null);
  if (!data || data.byteLength === 0) return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
  const name = request.nextUrl.searchParams.get("nom") || request.nextUrl.searchParams.get("filename") || "document";
  return save(token, new File([data], name, { type: request.headers.get("content-type") ?? "application/octet-stream" }));
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/mcp/upload/[token]">) {
  const { token } = await ctx.params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  return save(token, file);
}
