import "server-only";
/**
 * Briques communes des outils MCP (lecture et écriture) : définition d'un outil, champs
 * d'entrée réutilisables et forme des résultats d'écriture renvoyés à Claude.
 *
 * Les textes destinés au modèle (descriptions, refus `ToolError`, consignes `next`) sont en
 * anglais et ne passent pas par le catalogue de traduction ; les libellés (`label`) sont
 * affichés dans le CRM et donc traduits.
 */
import { z } from "zod";
import { isIsoDate, toDateOnlyString } from "@/lib/dates";
import type { Actor, Permission } from "../policies";
import type { UploadLink } from "../mcp/uploads";
import { appLink, recordUrl, type RecordType } from "./record-links";

export interface CrmTool {
  name: string;
  /** Libellé affiché dans l'interface (texte français, traduit à l'affichage). */
  label: string;
  /** Description destinée au modèle (anglais, non traduite). */
  about: string;
  /** L'outil est proposé si l'utilisateur a au moins une de ces permissions. */
  anyOf: Permission[];
  /** Écriture : proposée seulement avec la portée crm:write, journalisée « via Claude ». */
  kind: "read" | "write";
  /** Modifie ou fait avancer un élément existant (indication `destructiveHint` pour Claude). */
  destructive: boolean;
  input: z.ZodObject;
  run: (actor: Actor, input: never) => Promise<unknown>;
}

interface ToolDef<S extends z.ZodObject> {
  name: string;
  label: string;
  about: string;
  anyOf: Permission[];
  input: S;
  run: (actor: Actor, input: z.infer<S>) => Promise<unknown>;
}

export function tool<S extends z.ZodObject>(def: ToolDef<S>): CrmTool {
  return { ...def, kind: "read", destructive: false } as unknown as CrmTool;
}

export function writeTool<S extends z.ZodObject>(def: ToolDef<S> & { destructive?: boolean }): CrmTool {
  return { ...def, kind: "write", destructive: def.destructive ?? false } as unknown as CrmTool;
}

/** Refus d'un outil à l'intention de Claude (message en anglais, renvoyé tel quel). */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

// ───────────────────────────── Champs d'entrée ─────────────────────────────

export const DATE_HINT = ["Expected", "YYYY-MM-DD"].join(" ");

export const id = (what: string) => z.string().min(1).max(64).describe(`${what} id (from a search result)`);
export const optionalId = (description: string) => z.string().trim().max(64).optional().describe(description);
export const optionalText = (description: string) => z.string().trim().max(200).optional().describe(description);
export const text = (max: number, description: string) => z.string().trim().max(max).optional().describe(description);
export const isoDate = (description: string) => z.string().refine(isIsoDate, DATE_HINT).optional().describe(description);
export const requiredDate = (description: string) => z.string().refine(isIsoDate, DATE_HINT).describe(description);
/** Montant : nombre ou texte décimal (« 1250.50 », « 1 250,50 »), tel qu'il figure sur la pièce. */
export const amount = (description: string) => z.union([z.string().trim().min(1).max(40), z.number().nonnegative()]).describe(description);
export const optionalAmount = (description: string) => amount(description).optional();
export const currency = z.enum(["EUR", "IDR", "USD"]).optional().describe("Currency of the amounts (default EUR)");
export const manualFxRate = optionalAmount("Units of the currency per 1 EUR, only for IDR/USD when the CRM has no reference rate for that date");
export const confirmDuplicate = z
  .boolean()
  .optional()
  .describe("Set true only after the user confirmed this is NOT one of the records returned in possible_duplicates.");

/** Valeur d'un champ facultatif pour un service : "" quand absente (convention des formulaires). */
export const v = (value: string | number | null | undefined): string => (value === undefined || value === null ? "" : String(value).trim());

// ───────────────────────────── Sorties ─────────────────────────────

export const link = (path: string) => appLink(path);
export const d = (value: Date | null | undefined) => (value ? toDateOnlyString(value) : null);
export const clip = (value: string | null | undefined, max = 600) =>
  value ? (value.length > max ? `${value.slice(0, max)}…` : value) : null;

export interface RecordRef {
  type: RecordType;
  id: string;
  reference: string | null;
  label: string;
  url: string;
}

/** `page` : fiche où l'élément est visible quand il n'a pas la sienne (note, contact, mission…). */
export function ref(type: RecordType, recordId: string, label: string, reference: string | null = null, page?: { type: RecordType; id: string }): RecordRef {
  return { type, id: recordId, reference, label, url: page ? recordUrl(page.type, page.id) : recordUrl(type, recordId) };
}

export interface PossibleDuplicate {
  type: RecordType;
  id: string;
  label: string;
  why: string;
  url: string;
}

export function possible(type: RecordType, recordId: string, label: string, why: string): PossibleDuplicate {
  return { type, id: recordId, label, why, url: recordUrl(type, recordId) };
}

export type WriteResult =
  | {
      done: "created" | "updated" | "partial";
      records: RecordRef[];
      warnings?: string[];
      /** Lien de dépôt de la pièce d'origine (PDF, image) sur l'élément créé. */
      attach?: UploadLink;
      /** Étape en échec (création partielle) : ce qui précède est enregistré. */
      failed?: { step: string; problem: string };
      next?: string;
    }
  | { done: "nothing"; possible_duplicates: PossibleDuplicate[]; next: string };

const DUPLICATE_NEXT = [
  "Nothing was saved. Show these possible duplicates to the user.",
  "If the document is already recorded, stop. If the user confirms it is a different record, call the tool again with confirm_duplicate=true.",
].join(" ");

export function duplicatesFound(list: PossibleDuplicate[]): WriteResult {
  return { done: "nothing", possible_duplicates: list, next: DUPLICATE_NEXT };
}

export function isWriteResult(value: unknown): value is WriteResult {
  return !!value && typeof value === "object" && "done" in value;
}
