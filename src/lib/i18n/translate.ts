/**
 * Traduction « texte source » : la clé est la phrase française elle-même.
 * - fr : renvoie le texte (après interpolation) ;
 * - en : catalogue exact, puis modèles avec variables, sinon repli sur le français.
 * Variables : {0}, {1}… (tableau) ou {nom} (objet).
 */
import { EN, EN_TEMPLATES } from "./catalog.en";
import type { Locale } from "./locales";

export type Vars = ReadonlyArray<string | number | null | undefined> | Record<string, string | number | null | undefined>;
/** Traducteur : une valeur vide (null/undefined) est renvoyée telle quelle. */
export interface T {
  (text: string, vars?: Vars): string;
  (text: string | null | undefined, vars?: Vars): string | null | undefined;
}

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (all, key: string) => {
    const v = Array.isArray(vars) ? vars[Number(key)] : (vars as Record<string, unknown>)[key];
    return v === undefined || v === null ? all : String(v);
  });
}

interface CompiledTemplate {
  regex: RegExp;
  names: string[];
  target: string;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const compiled: CompiledTemplate[] = EN_TEMPLATES.map(([source, target]) => {
  const names: string[] = [];
  const pattern = source
    .split(/(\{\w+\})/)
    .map((part) => {
      const m = part.match(/^\{(\w+)\}$/);
      if (m) {
        names.push(m[1]);
        return "(.+?)";
      }
      return escapeRegex(part);
    })
    .join("");
  return { regex: new RegExp(`^${pattern}$`, "s"), names, target };
});

/** Traduit un message déjà construit (erreurs serveur, notifications, libellés dynamiques). */
export function translateMessage(locale: Locale, message: string, depth = 0): string {
  if (locale === "fr" || !message) return message;
  const exact = EN[message];
  if (exact !== undefined) return exact;
  const trimmed = message.trim();
  if (trimmed !== message && EN[trimmed] !== undefined) return message.replace(trimmed, EN[trimmed]);
  for (const t of compiled) {
    const m = message.match(t.regex);
    if (!m) continue;
    const values: Record<string, string> = {};
    t.names.forEach((name, i) => {
      const captured = m[i + 1];
      // Les morceaux capturés peuvent eux-mêmes être traduisibles (statut, mois, libellé…).
      values[name] = depth < 2 ? translateMessage(locale, captured, depth + 1) : (EN[captured] ?? captured);
    });
    return interpolate(t.target, values);
  }
  return message;
}

/** En anglais, les variables textuelles connues (mois, statuts, libellés) sont traduites aussi. */
function localizeVars(locale: Locale, vars?: Vars): Vars | undefined {
  if (!vars || locale === "fr") return vars;
  const tr1 = (v: string | number | null | undefined) => (typeof v === "string" && /[A-Za-zÀ-ÿ]{2}/.test(v) ? translateMessage(locale, v, 1) : v);
  return Array.isArray(vars) ? vars.map(tr1) : Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, tr1(v)]));
}

export function translate(locale: Locale, text: string, vars?: Vars): string {
  if (locale === "fr") return interpolate(text, vars);
  const localVars = localizeVars(locale, vars);
  const target = EN[text];
  if (target !== undefined) return interpolate(target, localVars);
  return translateMessage(locale, interpolate(text, localVars));
}

const translators = new Map<Locale, T>();

export function makeT(locale: Locale): T {
  let t = translators.get(locale);
  if (!t) {
    t = ((text: string | null | undefined, vars?: Vars) => (typeof text === "string" ? translate(locale, text, vars) : text)) as T;
    translators.set(locale, t);
  }
  return t;
}

/** Traduit une prop de composant si c'est du texte ; un nœud React est rendu tel quel. */
export function trNode<N>(tr: T, node: N): N {
  return (typeof node === "string" ? tr(node) : node) as N;
}
