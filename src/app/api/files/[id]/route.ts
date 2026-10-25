import { NextResponse, type NextRequest } from "next/server";
import { assertCanReadAttachment } from "@/server/attachments";
import { getActor } from "@/server/auth/session";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { storage } from "@/server/storage";

/**
 * Téléchargement autorisé : contrôle d'accès AVANT toute lecture. Local : flux direct ;
 * S3/R2 : redirection vers une URL signée valable 5 minutes.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const att = await assertCanReadAttachment(actor, id);
    const inline = att.contentType === "application/pdf" || att.contentType.startsWith("image/");
    const signed = await storage().signedUrl(att.storageKey, att.filename, att.contentType, inline);
    if (signed) {
      return NextResponse.redirect(signed, { status: 302, headers: { "Cache-Control": "private, no-store" } });
    }
    const data = await storage().read(att.storageKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": att.contentType,
        "Content-Length": String(data.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    if (e instanceof NotFoundError) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
    console.error("[files] lecture échouée", (e as Error).message);
    return NextResponse.json({ error: "Fichier indisponible." }, { status: 500 });
  }
}
