/**
 * Extraction des textes d'interface français (clés du catalogue anglais).
 *   node scripts/i18n/extract.mjs [--json sortie.json] [--missing]
 * - exact : clés recherchées telles quelles (tr("…"), libellés, messages littéraux) ;
 * - templates : messages construits avec des variables (`… ${x}`) → « … {0} ».
 * --missing : liste uniquement les clés absentes de src/lib/i18n/en.json (code de sortie 1 si manque).
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SKIP_DIRS = ["src/generated", "src/lib/i18n"];
const LABEL_KEYS = new Set(["label", "header", "title", "description", "hint", "allLabel", "cta", "dateBasis", "body", "placeholder", "emptyText", "subtitle", "message", "reason"]);
const ERROR_CLASSES = new Set(["DomainError", "ForbiddenError", "NotFoundError", "ConflictError", "UnauthenticatedError", "Error"]);
const ZOD_METHODS = new Set(["min", "max", "refine", "regex", "length", "email", "url", "int", "positive", "nonnegative", "superRefine", "check"]);
const WORD = /[A-Za-zÀ-ÿ]{2,}/;
const FRENCHISH = /[éèàçêîôûùœÉÈÀ]|\b(le|la|les|des|du|de|un|une|et|ou|à|au|aux|pour|sans|avec|sur|par|dans|est|sont|aucun|aucune|non|oui|vidéo|client|facture|montant|coût|monteur|projet)\b/i;

const exact = new Map(); // clé -> premier emplacement
const templates = new Map();

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    const rel = path.relative(ROOT, p);
    if (SKIP_DIRS.some((d) => rel.startsWith(d))) continue;
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

function templateKey(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  let key = node.head.text;
  node.templateSpans.forEach((s, i) => (key += `{${i}}` + s.literal.text));
  return key;
}

/** Codes et identifiants qui ne sont jamais du texte d'interface. */
const NOT_TEXT = /^([A-Z][A-Z0-9_]+|\/.*|[a-z]+(\.[a-zA-Z]+)+|[a-z]+[A-Z][A-Za-z]*|https?:\/\/.*|.*\.md|string|neutral|brand|muted|danger|warning|success|info)$/;

function add(map, key, where, trusted = false) {
  if (!key || !WORD.test(key)) return;
  if (NOT_TEXT.test(key)) return;
  // Hors contextes sûrs (tr(), props d'interface, tables de libellés), on écarte les identifiants techniques.
  if (!trusted && /^[a-z0-9_.:/#-]+$/i.test(key) && !FRENCHISH.test(key)) return;
  if (!map.has(key)) map.set(key, where);
}

/** Enregistre un littéral (ou les branches d'une expression) comme clé exacte ou modèle. */
let trustedValue = false;
function collectValue(node, where, { asTemplate = false } = {}) {
  if (!node) return;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return collectValue(node.expression, where, { asTemplate });
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return add(exact, node.text, where, trustedValue);
  if (ts.isTemplateExpression(node)) return add(asTemplate ? templates : exact, templateKey(node), where);
  if (ts.isConditionalExpression(node)) {
    collectValue(node.whenTrue, where, { asTemplate });
    collectValue(node.whenFalse, where, { asTemplate });
  }
  if (ts.isBinaryExpression(node)) {
    collectValue(node.left, where, { asTemplate });
    collectValue(node.right, where, { asTemplate });
  }
}

for (const file of walk(path.join(ROOT, "src"))) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isLabels = /src\/lib\/labels\.ts$|nav-config\.ts$/.test(rel);
  const isServer = rel.startsWith("src/server/") || /\/(actions|schemas)\.ts$/.test(rel) || rel.startsWith("src/lib/validation");
  const loc = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;

  function visit(node) {
    // tr("…") / tr(`… ${x}`) → clé exacte (les variables deviennent {0}, {1}…)
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tr" && node.arguments[0]) {
      const a = node.arguments[0];
      if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) add(exact, a.text, loc(a), true);
    }
    // Fichiers de libellés : toute chaîne avec du texte.
    if (isLabels && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !/^[a-z-]+$/.test(node.text)) {
      if (!ts.isImportDeclaration(node.parent) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) add(exact, node.text, loc(node), true);
    }
    // Attributs JSX textuels passés à des composants qui traduisent eux-mêmes (label="…").
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf);
      if (["label", "title", "description", "hint", "placeholder", "aria-label", "subtitle", "submitLabel", "confirmLabel", "reasonLabel", "emptyText", "basis", "alt", "caption"].includes(name)) {
        add(exact, node.initializer.text, loc(node), true);
      }
    }
    // Tables de libellés partout (X_LABELS = { … }) : toutes les valeurs textuelles.
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /_LABELS$/.test(node.name.text) && node.initializer) {
      const scan = (n) => {
        if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) add(exact, n.text, loc(n), true);
        ts.forEachChild(n, scan);
      };
      scan(node.initializer);
    }
    // Propriétés d'objets portant du texte (où qu'elles soient).
    if (ts.isPropertyAssignment(node)) {
      const key = node.name.getText(sf).replace(/["']/g, "");
      if (LABEL_KEYS.has(key)) {
        trustedValue = ["label", "header", "title", "allLabel", "description", "hint"].includes(key);
        collectValue(node.initializer, loc(node), { asTemplate: isServer });
        trustedValue = false;
      }
      if (key === "notes" && ts.isArrayLiteralExpression(node.initializer)) node.initializer.elements.forEach((e) => collectValue(e, loc(e), { asTemplate: true }));
    }
    // Erreurs métier : new DomainError("…" | `… ${x}`)
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ERROR_CLASSES.has(node.expression.text) && node.arguments?.[0]) {
      collectValue(node.arguments[0], loc(node), { asTemplate: true });
    }
    // Classes d'erreurs : super("message par défaut")
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword && node.arguments[0]) {
      collectValue(node.arguments[0], loc(node), { asTemplate: true });
    }
    // Paramètres par défaut textuels (ex. message = "Accès refusé.")
    if (ts.isParameter(node) && node.initializer && (ts.isStringLiteral(node.initializer))) collectValue(node.initializer, loc(node));
    // safeAction(fn, "Message de succès")
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "safeAction" && node.arguments[1]) {
      collectValue(node.arguments[1], loc(node), { asTemplate: true });
    }
    // Messages Zod : .min(1, "…"), .refine(fn, "…"), { message: "…" }, { error: "…" }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ZOD_METHODS.has(node.expression.name.text)) {
      for (const a of node.arguments) {
        if (ts.isStringLiteral(a) || ts.isTemplateExpression(a) || ts.isNoSubstitutionTemplateLiteral(a)) collectValue(a, loc(a), { asTemplate: true });
        if (ts.isObjectLiteralExpression(a)) for (const p of a.properties) if (ts.isPropertyAssignment(p) && ["message", "error"].includes(p.name.getText(sf))) collectValue(p.initializer, loc(p), { asTemplate: true });
      }
    }
    // return { ok: false, error: "…" } et NextResponse.json({ error: "…" })
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === "error") collectValue(node.initializer, loc(node), { asTemplate: true });
    // Retours textuels de fonctions serveur/formatage (ex. formatPercent, libellés de période)
    if (isServer && ts.isReturnStatement(node) && node.expression && (ts.isStringLiteral(node.expression) || ts.isTemplateExpression(node.expression))) {
      if (FRENCHISH.test(node.expression.getText(sf))) collectValue(node.expression, loc(node), { asTemplate: true });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

const args = process.argv.slice(2);
const result = {
  exact: [...exact.entries()].map(([key, where]) => ({ key, where })),
  templates: [...templates.entries()].filter(([k]) => /\{\d+\}/.test(k)).map(([key, where]) => ({ key, where })),
};
// Un « modèle » sans variable est une clé exacte.
for (const [k, where] of templates) if (!/\{\d+\}/.test(k) && !exact.has(k)) result.exact.push({ key: k, where });

if (args.includes("--missing")) {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/i18n/en.json"), "utf8"));
  const missing = result.exact.filter((e) => !(e.key in en.exact));
  const missingT = result.templates.filter((e) => !(e.key in en.templates));
  for (const m of [...missing, ...missingT]) console.log(`${m.where}\t${JSON.stringify(m.key)}`);
  console.error(`${missing.length} clé(s) exacte(s) et ${missingT.length} modèle(s) sans traduction.`);
  process.exit(missing.length + missingT.length ? 1 : 0);
}
const out = args[args.indexOf("--json") + 1];
if (args.includes("--json") && out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`${result.exact.length} clés exactes, ${result.templates.length} modèles.`);
