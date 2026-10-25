import "server-only";
/**
 * Sources de lecture de l'ancien CRM Rails — toujours en lecture seule.
 * - MySQL : connexion directe (de préférence à une copie restaurée du dump, jamais en écriture).
 * - JSON : un dossier contenant <table>.json (tableau d'objets), utile pour les tests et les exports.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export type LegacyRow = Record<string, unknown>;

export interface LegacySource {
  read(table: string): Promise<LegacyRow[]>;
  close(): Promise<void>;
}

/** Tables lues : liste fermée, jamais construite depuis une entrée utilisateur. */
export const LEGACY_TABLES = new Set([
  "users",
  "contacts",
  "notes",
  "paiements",
  "suivi_clients",
  "suivis",
  "reglages",
  "active_storage_attachments",
  "active_storage_blobs",
]);

/** Colonnes lues pour users : le mot de passe chiffré et les jetons ne sont jamais extraits. */
const USER_COLUMNS = "id, email, nom, prenom, role, created_at, updated_at";

export function jsonDirSource(dir: string): LegacySource {
  return {
    async read(table) {
      if (!LEGACY_TABLES.has(table)) throw new Error(`Table non autorisée : ${table}`);
      try {
        const rows = JSON.parse(await readFile(path.join(dir, `${table}.json`), "utf8")) as LegacyRow[];
        if (!Array.isArray(rows)) throw new Error(`${table}.json doit contenir un tableau`);
        if (table === "users") {
          return rows.map((row) => {
            const rest = { ...row };
            delete rest.encrypted_password;
            delete rest.reset_password_token;
            return rest;
          });
        }
        return rows;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw e;
      }
    },
    async close() {},
  };
}

export async function mysqlSource(url: string): Promise<LegacySource> {
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({ uri: url, dateStrings: false, supportBigNumbers: true, bigNumberStrings: true });
  // Garde-fou : session en lecture seule côté MySQL.
  await conn.query("SET SESSION TRANSACTION READ ONLY");
  return {
    async read(table) {
      if (!LEGACY_TABLES.has(table)) throw new Error(`Table non autorisée : ${table}`);
      const columns = table === "users" ? USER_COLUMNS : "*";
      const [rows] = await conn.query(`SELECT ${columns} FROM \`${table}\` ORDER BY id`);
      return rows as LegacyRow[];
    },
    async close() {
      await conn.end();
    },
  };
}
