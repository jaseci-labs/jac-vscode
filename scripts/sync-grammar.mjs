/**
 * Syncs Jac grammar tokens from TextMate grammar to highlight.js language definition.
 *
 * Environment variables:
 *   TARGET_PATH: Path to highlightjs-jac checkout
 *   TARGET_LANGUAGE_FILE: Target file path (e.g., src/languages/jac.js)
 *
 * Usage: node scripts/sync-grammar.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// --- Step 1: Load source (jac.tmLanguage.json) and target (jac.js) files ---

const sourcePath = path.join(process.cwd(), 'syntaxes', 'jac.tmLanguage.json');
const targetPath = path.join(process.cwd(), process.env.TARGET_PATH, process.env.TARGET_LANGUAGE_FILE);

const grammar = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const repository = grammar.repository || {};
const target = fs.readFileSync(targetPath, 'utf8');

// --- Step 2: Small allowlists for patterns that mix tokens from multiple scopes ---
// ABILITY: the pattern \b((async\s+)?\s*(can|impl|sem|def))\b also matches "async"
// OPERATOR: the operator pattern contains non-operator words like "for", "if", "else"
// ABILITY_TITLE: impl/sem declare types not named functions, so exclude from title.function regex
const ABILITY_FILTER = new Set(['can', 'def', 'impl', 'sem']);
const OPERATOR_FILTER = new Set(['and', 'or', 'not', 'in', 'is']);
const ABILITY_TITLE_FILTER = new Set(['can', 'def']);

// --- Step 3: Helpers ---

function uniqSorted(items) {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

// Strip regex syntax and extract plain word tokens from a pattern string.
function extractWords(expr) {
  if (!expr) return [];

  const normalized = expr
    .replace(/\(\?#.*?\)/gs, ' ')
    .replace(/\(\?<=[\s\S]*?\)/g, ' ')
    .replace(/\(\?<![\s\S]*?\)/g, ' ')
    .replace(/\(\?=[\s\S]*?\)/g, ' ')
    .replace(/\(\?![\s\S]*?\)/g, ' ')
    .replace(/\(\?:/g, '(')
    .replace(/\[:[a-z]+:\]/g, ' ')
    .replace(/\\[A-Za-z.]+/g, ' ')
    .replace(/[[\]{}()*+?^$:|]/g, ' ')
    .replace(/\s+/g, ' ');

  return (normalized.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).filter(
    (t) => t.length > 1  // single-letter tokens are noise
  );
}

// Collect tokens from all patterns that match a given scope name.
function tokensByScope(patterns, scope) {
  const tokens = [];
  for (const p of patterns) {
    const name = p.name || p.captures?.['1']?.name;
    if (name === scope) {
      tokens.push(...extractWords(p.match || ''));
    }
  }
  return uniqSorted(tokens);
}

// Read the current values of a const array from jac.js.
function readConstArray(source, constName) {
  const pattern = new RegExp(`const ${constName} = \\[\\n([\\s\\S]*?)\\n  \\];`);
  const match = source.match(pattern);
  if (!match) throw new Error(`Unable to read array declaration for ${constName}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// Replace the values of a const array in jac.js with new values.
function replaceConstArray(source, constName, values) {
  const replacement = `const ${constName} = [\n${values.map((v) => `    '${v}'`).join(',\n')}\n  ];`;
  const pattern = new RegExp(`const ${constName} = \\[\\n[\\s\\S]*?\\n  \\];`);
  if (!pattern.test(source)) throw new Error(`Unable to locate array declaration for ${constName}`);
  return source.replace(pattern, replacement);
}

// Merge existing values with newly extracted ones (only adds, never removes).
function merge(current, extracted) {
  return uniqSorted([...current, ...extracted]);
}

// Replace the word alternation inside a /\b(?:a|b|c)\b/ regex marked with // sync:MARKER.
// Works for both simple /\b(?:...)\b/ and complex patterns — targets the last (?:...) group
// immediately before the closing \b/.
function replaceRegexAlt(source, marker, values) {
  // Matches the last (?:words) group right before \b/ on a line ending with // sync:MARKER
  const pattern = new RegExp(
    String.raw`(\(\?:)([\w|]+)(\)\\b\/,?\s*\/\/\s*sync:${marker})`
  );
  if (!pattern.test(source)) throw new Error(`Cannot find sync marker: ${marker}`);
  return source.replace(pattern, `$1${values.join('|')}$3`);
}

// --- Step 4: Extract tokens per scope from statement-keyword ---

const statementKeyword = repository['statement-keyword'];
if (!statementKeyword || !Array.isArray(statementKeyword.patterns)) {
  throw new Error('repository.statement-keyword is required');
}

const archetypeTokens = tokensByScope(statementKeyword.patterns, 'storage.type.class.jac');
const abilityTokens   = tokensByScope(statementKeyword.patterns, 'storage.type.function.jac').filter((t) => ABILITY_FILTER.has(t));
const accessTokens    = tokensByScope(statementKeyword.patterns, 'storage.modifier.declaration.jac');
const flowTokens      = tokensByScope(statementKeyword.patterns, 'keyword.control.flow.jac');
const hasTokens       = tokensByScope(statementKeyword.patterns, 'storage.type.has.jac');

// Import: collect keyword.control.import.jac tokens from the import repository rule
const importPatterns = repository.import?.patterns || [];
const importTokens = [];
for (const imp of importPatterns) {
  if (imp.beginCaptures?.['1']?.name === 'keyword.control.import.jac') {
    importTokens.push(...extractWords(imp.begin || ''));
  }
  for (const nested of (imp.patterns || [])) {
    if (nested.name === 'keyword.control.import.jac') {
      importTokens.push(...extractWords(nested.match || ''));
    }
  }
}
const importKeyTokens = uniqSorted(importTokens);

// Operator keywords
const operatorTokens = uniqSorted(extractWords(repository.operator?.match || '')).filter((t) => OPERATOR_FILTER.has(t));

// Built-ins and literals (unchanged logic)
const builtinsPattern = repository['builtin-functions']?.patterns || [];
const builtinTypesPattern = repository['builtin-types'];
const builtinTokens = uniqSorted([
  ...builtinsPattern.flatMap((p) => extractWords(p.match || '')),
  ...extractWords(builtinTypesPattern?.match || '')
]);

const literalPattern = statementKeyword.patterns.find((p) => p.name === 'constant.language.jac')
  || repository.literal?.patterns?.find((p) => p.name === 'constant.language.jac');
const literalTokens = uniqSorted(extractWords(literalPattern?.match || ''));

const specialVariablesPattern = repository['special-variables'];
const languageVarTokens = uniqSorted(extractWords(specialVariablesPattern?.match || ''));

// --- Step 5: Read current const arrays from jac.js ---

const currentArrays = {
  ARCHETYPE_KEYWORDS: readConstArray(target, 'ARCHETYPE_KEYWORDS'),
  ABILITY_KEYWORDS:   readConstArray(target, 'ABILITY_KEYWORDS'),
  ACCESS_KEYWORDS:    readConstArray(target, 'ACCESS_KEYWORDS'),
  CONTROL_KEYWORDS:   readConstArray(target, 'CONTROL_KEYWORDS'),
  IMPORT_KEYWORDS:    readConstArray(target, 'IMPORT_KEYWORDS'),
  MISC_KEYWORDS:      readConstArray(target, 'MISC_KEYWORDS'),
  OPERATOR_KEYWORDS:  readConstArray(target, 'OPERATOR_KEYWORDS'),
  BUILT_INS:          readConstArray(target, 'BUILT_INS'),
  LITERALS:           readConstArray(target, 'LITERALS'),
  LANGUAGE_VARS:      readConstArray(target, 'LANGUAGE_VARS')
};

// --- Step 6: Merge current + extracted tokens per category ---

const nextArrays = {
  ARCHETYPE_KEYWORDS: merge(currentArrays.ARCHETYPE_KEYWORDS, archetypeTokens),
  ABILITY_KEYWORDS:   merge(currentArrays.ABILITY_KEYWORDS,   abilityTokens),
  ACCESS_KEYWORDS:    merge(currentArrays.ACCESS_KEYWORDS,    accessTokens),
  CONTROL_KEYWORDS:   merge(currentArrays.CONTROL_KEYWORDS,   flowTokens),
  IMPORT_KEYWORDS:    merge(currentArrays.IMPORT_KEYWORDS,    importKeyTokens),
  MISC_KEYWORDS:      merge(currentArrays.MISC_KEYWORDS,      hasTokens),
  OPERATOR_KEYWORDS:  merge(currentArrays.OPERATOR_KEYWORDS,  operatorTokens),
  BUILT_INS:          merge(currentArrays.BUILT_INS,          builtinTokens),
  LITERALS:           merge(currentArrays.LITERALS,           literalTokens),
  LANGUAGE_VARS:      merge(currentArrays.LANGUAGE_VARS,      languageVarTokens)
};

// --- Step 7: Write updated arrays and inline regexes back into jac.js ---

let updated = target;
for (const [constName, values] of Object.entries(nextArrays)) {
  updated = replaceConstArray(updated, constName, values);
}
updated = replaceRegexAlt(updated, 'archetype-title', nextArrays.ARCHETYPE_KEYWORDS);
updated = replaceRegexAlt(updated, 'ability-title', nextArrays.ABILITY_KEYWORDS.filter((t) => ABILITY_TITLE_FILTER.has(t)));

if (updated !== target) {
  fs.writeFileSync(targetPath, updated);
}

// --- Step 8: Log results ---

console.log(`Updated ${path.relative(process.cwd(), targetPath)}`);
for (const [constName, values] of Object.entries(nextArrays)) {
  console.log(`${constName}: ${values.length}`);
}
