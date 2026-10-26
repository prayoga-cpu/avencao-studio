/**
 * Codemod i18n (exécution unique, conservé pour référence) : enveloppe les textes d'interface
 * français dans `tr("…")` et insère le traducteur dans chaque composant.
 *   node scripts/i18n/codemod.mjs [--dry] <fichiers…>
 * - Texte JSX, attributs d'interface (label, title…), propriétés d'objets (label, header…),
 *   gabarits `${x}` → tr("… {0}", [x]), toasts, libellés d'énumérations ({X_LABELS[k]}, {o.label}).
 * - Composant synchrone : `const tr = useT();` (#i18n) ; composant async (serveur) :
 *   `const tr = await getT();` (@/lib/i18n/server).
 * - Signale ce qui ne peut pas être traité automatiquement (texte hors composant).
 */
import fs from "node:fs";
import ts from "typescript";

const ATTRS = new Set([
  "label", "title", "description", "hint", "aria-label", "subtitle", "placeholder", "basis", "submitLabel",
  "confirmLabel", "searchPlaceholder", "valueLabel", "emptyText", "empty", "ariaLabel", "alt", "caption",
  "reasonLabel", "allLabel", "cancelLabel", "deltaLabel", "emptyLabel", "tooltip",
]);
const OBJECT_KEYS = new Set(["label", "header", "title", "allLabel", "description", "hint", "cta", "placeholder", "emptyText"]);
const CALLS = new Set(["toast", "toast.success", "toast.error", "toast.info", "toast.warning", "setError", "setMessage", "setNotice"]);
const HAS_WORD = /[A-Za-zÀ-ÿ]{2,}/;

const dry = process.argv.includes("--dry");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const report = { changed: [], manual: [], strings: 0 };

function decodeEntities(s) {
  return s
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/** Texte rendu par React pour un JSXText (règles de Babel). */
function cleanJsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  lines.forEach((l, i) => { if (/[^ \t]/.test(l)) lastNonEmpty = i; });
  let out = "";
  lines.forEach((line, i) => {
    let t = line.replace(/\t/g, " ");
    if (i !== 0) t = t.replace(/^[ ]+/, "");
    if (i !== lines.length - 1) t = t.replace(/[ ]+$/, "");
    if (t) {
      if (i !== lastNonEmpty) t += " ";
      out += t;
    }
  });
  return decodeEntities(out);
}

const lit = (s) => JSON.stringify(s);

function functionName(fn) {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  let p = fn.parent;
  while (p && (ts.isCallExpression(p) || ts.isParenthesizedExpression(p) || ts.isAsExpression(p))) p = p.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isExportAssignment(p)) return "default";
  if (ts.isFunctionDeclaration(fn) && fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return "default";
  return null;
}

const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);

/** Fonction la plus externe englobant le nœud (composant de niveau module). */
function outerFunction(node) {
  let outer = null;
  for (let p = node.parent; p; p = p.parent) if (isFn(p)) outer = p;
  return outer;
}

/** Une déclaration `tr` intermédiaire masquerait le traducteur. */
function shadowed(node, top) {
  for (let p = node.parent; p && p !== top; p = p.parent) {
    if (isFn(p) && p.parameters.some((prm) => ts.isIdentifier(prm.name) && prm.name.text === "tr")) return true;
  }
  return false;
}

function templateToCall(tpl, sf) {
  // `a ${x} b` → tr("a {0} b", [x])
  if (ts.isNoSubstitutionTemplateLiteral(tpl)) return `tr(${lit(tpl.text)})`;
  let key = tpl.head.text;
  const args = [];
  tpl.templateSpans.forEach((span, i) => {
    key += `{${i}}` + span.literal.text;
    args.push(span.expression.getText(sf));
  });
  return `tr(${lit(key)}, [${args.join(", ")}])`;
}

function processFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const needsTr = new Map(); // fn node -> async?
  const isClient = /^\s*["']use client["']/.test(src);

  function wrap(node, replacement) {
    const top = outerFunction(node);
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const where = `${file}:${pos.line + 1}`;
    if (!top) return report.manual.push(`${where} hors composant : ${node.getText(sf).slice(0, 70)}`);
    const name = functionName(top);
    if (!name || !(name === "default" || /^[A-Z]/.test(name))) {
      return report.manual.push(`${where} dans « ${name ?? "?"} » (pas un composant) : ${node.getText(sf).slice(0, 60)}`);
    }
    if (shadowed(node, top)) return report.manual.push(`${where} tr masqué`);
    const isAsync = !!top.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (isAsync && isClient) return report.manual.push(`${where} composant client async`);
    needsTr.set(top, isAsync);
    edits.push({ start: node.getStart(sf), end: node.getEnd(), text: replacement });
    report.strings++;
  }

  /** Littéraux texte d'une expression « valeur » (conditions, ??, ||, &&, parenthèses). */
  function wrapValueExpression(expr) {
    if (ts.isParenthesizedExpression(expr)) return wrapValueExpression(expr.expression);
    if (ts.isStringLiteral(expr)) { if (HAS_WORD.test(expr.text)) wrap(expr, `tr(${lit(expr.text)})`); return; }
    if (ts.isNoSubstitutionTemplateLiteral(expr) || ts.isTemplateExpression(expr)) {
      if (HAS_WORD.test(expr.getText(sf).replace(/\$\{[^}]*\}/g, ""))) wrap(expr, templateToCall(expr, sf));
      return;
    }
    if (ts.isConditionalExpression(expr)) { wrapValueExpression(expr.whenTrue); wrapValueExpression(expr.whenFalse); return; }
    if (ts.isBinaryExpression(expr) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(expr.operatorToken.kind)) {
      if (expr.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) wrapValueExpression(expr.left);
      wrapValueExpression(expr.right);
      return;
    }
    // Libellés d'énumérations : X_LABELS[k], X_LABELS[k].label, objet.label
    const text = expr.getText(sf);
    if ((ts.isElementAccessExpression(expr) && /(^|_)LABELS$/.test(expr.expression.getText(sf))) ||
        (ts.isPropertyAccessExpression(expr) && expr.name.text === "label")) {
      wrap(expr, `tr(${text})`);
    }
  }

  /** Comme wrapValueExpression, mais un littéral simple doit ressembler à une phrase (espace ou accent). */
  function wrapReadable(expr) {
    if (ts.isParenthesizedExpression(expr)) return wrapReadable(expr.expression);
    if (ts.isStringLiteral(expr)) {
      if (HAS_WORD.test(expr.text) && /[\sÀ-ÿ]/.test(expr.text)) wrap(expr, `tr(${lit(expr.text)})`);
      return;
    }
    if (ts.isConditionalExpression(expr)) { wrapReadable(expr.whenTrue); wrapReadable(expr.whenFalse); return; }
    if (ts.isBinaryExpression(expr) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expr.operatorToken.kind)) {
      wrapReadable(expr.left); wrapReadable(expr.right); return;
    }
    if (ts.isNoSubstitutionTemplateLiteral(expr) || ts.isTemplateExpression(expr)) {
      if (HAS_WORD.test(expr.getText(sf).replace(/\$\{[^}]*\}/g, ""))) wrap(expr, templateToCall(expr, sf));
    }
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      const clean = cleanJsxText(node.getFullText(sf));
      const key = clean.trim();
      if (key && HAS_WORD.test(key)) {
        const lead = /^\s/.test(clean) ? '{" "}' : "";
        const trail = /\s$/.test(clean) ? '{" "}' : "";
        // Le nœud JsxText inclut le texte brut ; on le remplace entièrement.
        const top = outerFunction(node);
        if (top) wrap(node, `${lead}{tr(${lit(key)})}${trail}`);
        else report.manual.push(`${file} texte JSX hors composant : ${key.slice(0, 60)}`);
      }
      return;
    }
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (ATTRS.has(name)) {
        const init = node.initializer;
        if (ts.isStringLiteral(init)) {
          if (HAS_WORD.test(init.text)) wrap(init, `{tr(${lit(init.text)})}`);
        } else if (ts.isJsxExpression(init) && init.expression) {
          wrapValueExpression(init.expression);
        }
      }
      ts.forEachChild(node, visit);
      return;
    }
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      wrapValueExpression(node.expression);
    }
    if (ts.isPropertyAssignment(node) && OBJECT_KEYS.has(node.name.getText(sf).replace(/["']/g, ""))) {
      wrapValueExpression(node.initializer);
    }
    // Valeurs affichées (listes de définitions, statistiques) : jamais les codes d'options.
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === "value") wrapReadable(node.initializer);
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "value" && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      wrapReadable(node.initializer.expression);
    }
    // Cellules de tableaux : cell: (r) => …
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === "cell" && ts.isArrowFunction(node.initializer) && !ts.isBlock(node.initializer.body)) {
      wrapReadable(node.initializer.body);
    }
    // Arguments d'une phrase traduite : tr("… {0}", [`… ${x}`, "texte"])
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tr" && node.arguments[1] && ts.isArrayLiteralExpression(node.arguments[1])) {
      for (const el of node.arguments[1].elements) wrapReadable(el);
    }
    if (ts.isCallExpression(node) && CALLS.has(node.expression.getText(sf)) && node.arguments[0]) {
      wrapValueExpression(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!edits.length) return;

  // Insertion du traducteur en tête de chaque composant concerné.
  let usesHook = false;
  let usesAsync = false;
  for (const [fn, isAsync] of needsTr) {
    const body = fn.body;
    const already = body && ts.isBlock(body) && /\bconst tr\s*=/.test(body.getText(sf));
    if (already) continue;
    const decl = isAsync ? "const tr = await getT();" : "const tr = useT();";
    if (isAsync) usesAsync = true; else usesHook = true;
    if (body && ts.isBlock(body)) {
      edits.push({ start: body.getStart(sf) + 1, end: body.getStart(sf) + 1, text: `\n  ${decl}` });
    } else if (body) {
      // Fonction fléchée à expression : on la convertit en bloc.
      edits.push({ start: body.getStart(sf), end: body.getStart(sf), text: `{\n  ${decl}\n  return ` });
      edits.push({ start: body.getEnd(), end: body.getEnd(), text: `;\n}` });
    }
  }
  // Imports après le dernier import (ou après la directive).
  const imports = sf.statements.filter((s) => ts.isImportDeclaration(s));
  const anchor = imports.length ? imports[imports.length - 1].getEnd() : (sf.statements[0] && ts.isExpressionStatement(sf.statements[0]) ? sf.statements[0].getEnd() : 0);
  let importText = "";
  if (usesHook && !/from "#i18n"/.test(src)) importText += `\nimport { useT } from "#i18n";`;
  if (usesAsync && !/from "@\/lib\/i18n\/server"/.test(src)) importText += `\nimport { getT } from "@/lib/i18n/server";`;
  if (importText) edits.push({ start: anchor, end: anchor, text: importText });

  // Application de la fin vers le début ; les éditions imbriquées sont ignorées (la plus externe gagne).
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  let lastStart = Infinity;
  for (const e of edits) {
    if (e.end > lastStart && e.start !== e.end) continue; // chevauchement
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    if (e.start !== e.end) lastStart = e.start;
  }
  if (!dry) fs.writeFileSync(file, out);
  report.changed.push(`${file} (${edits.length})`);
}

for (const f of files) processFile(f);
console.log(`${report.changed.length} fichier(s) modifié(s), ${report.strings} texte(s) enveloppé(s).`);
if (report.manual.length) {
  console.log(`\nÀ traiter manuellement (${report.manual.length}) :`);
  for (const m of report.manual) console.log("  - " + m);
}
