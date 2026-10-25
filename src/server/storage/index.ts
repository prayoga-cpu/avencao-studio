import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Stockage privé des petites pièces jointes (factures PDF, justificatifs, logo).
 * Les rushs et masters restent dans Drive/Frame.io : jamais stockés ici.
 * - local : dossier hors de /public, servi uniquement par /api/files/[id] après contrôle d'accès.
 * - s3 : bucket privé compatible S3, URL signée de courte durée après contrôle d'accès.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  signedUrl(key: string, filename: string, contentType: string, inline: boolean): Promise<string | null>;
}

function safeKey(key: string): string {
  if (key.includes("..") || path.isAbsolute(key)) throw new Error("Clé de stockage invalide");
  return key;
}

class LocalDriver implements StorageDriver {
  constructor(private root: string) {}
  private file(key: string) {
    return path.join(path.resolve(this.root), safeKey(key));
  }
  async put(key: string, data: Buffer) {
    const target = this.file(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data, { flag: "wx" });
  }
  async read(key: string) {
    return readFile(this.file(key));
  }
  async exists(key: string) {
    try {
      await stat(this.file(key));
      return true;
    } catch {
      return false;
    }
  }
  async signedUrl() {
    return null;
  }
}

class S3Driver implements StorageDriver {
  private client: S3Client;
  constructor(private bucket: string) {
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }
  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: data, ContentType: contentType }),
    );
  }
  async read(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("Objet vide");
    return Buffer.from(bytes);
  }
  async exists(key: string) {
    try {
      await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Range: "bytes=0-0" }));
      return true;
    } catch {
      return false;
    }
  }
  async signedUrl(key: string, filename: string, contentType: string, inline: boolean) {
    const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        ResponseContentDisposition: disposition,
        ResponseContentType: contentType,
      }),
      { expiresIn: 300 },
    );
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  if (process.env.STORAGE_DRIVER === "s3") {
    if (!process.env.S3_BUCKET) throw new Error("S3_BUCKET manquant");
    driver = new S3Driver(process.env.S3_BUCKET);
  } else {
    // Sur Vercel, le disque est éphémère : un fichier « enregistré » serait perdu. Refus explicite.
    if (process.env.VERCEL) throw new Error("Stockage local indisponible sur Vercel : configurez STORAGE_DRIVER=s3 (Cloudflare R2).");
    driver = new LocalDriver(process.env.STORAGE_LOCAL_DIR || ".storage");
  }
  return driver;
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Types autorisés, vérifiés par signature binaire (et non par l'extension annoncée). */
export const ALLOWED_TYPES = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type AllowedType = keyof typeof ALLOWED_TYPES;

export function sniffType(data: Buffer): AllowedType | null {
  if (data.length >= 5 && data.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
