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

// --- Step 2: Define allowlists per keyword category ---
// Only tokens present in these lists will be written into jac.js.
// This prevents noise tokens from regex patterns slipping through.

const CATEGORY_ALLOWLISTS = {
  ARCHETYPE_KEYWORDS: ['walker', 'node', 'edge', 'obj', 'class', 'enum', 'test', 'impl'],
  ABILITY_KEYWORDS: ['can', 'def'],
  ACCESS_KEYWORDS: ['pub', 'priv', 'protect', 'static', 'override', 'abs', 'abstract'],
  CONTROL_KEYWORDS: [
    'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'pass', 'return', 'yield',
    'raise', 'assert', 'del', 'try', 'except', 'finally', 'with', 'as', 'match', 'case',
    'switch', 'default'
  ],
  IMPORT_KEYWORDS: ['import', 'include', 'from'],
  ASYNC_KEYWORDS: ['async', 'await'],
  OSP_KEYWORDS: ['visit', 'revisit', 'disengage', 'skip', 'report', 'spawn', 'entry', 'exit', 'ignore'],
  MISC_KEYWORDS: ['has', 'glob', 'global', 'nonlocal', 'sem', 'let', 'check', 'lambda', 'to', 'by'],
  OPERATOR_KEYWORDS: ['and', 'or', 'not', 'in', 'is']
};

// Single-letter tokens extracted from regex patterns are meaningless — ignore them.
const TOKEN_NOISE = new Set(['x']);

// --- Step 3: Helpers ---

// Deduplicate and sort tokens alphabetically for deterministic output.
function uniqSorted(items) {
  return [...new Set(items)].sort((left, right) => left.localeCompare(right));
}

// Strip regex syntax from a pattern and extract plain word tokens.
// e.g. "(foo|bar|baz)\b" → ['bar', 'baz', 'foo']
function extractAlternationWords(expr) {
  if (!expr) {
    return [];
  }

  const normalized = expr
    .replace(/\(\?#.*?\)/gs, ' ')
    .replace(/\(\?<=[\s\S]*?\)/g, ' ')
    .replace(/\(\?<![\s\S]*?\)/g, ' ')
    .replace(/\(\?=[\s\S]*?\)/g, ' ')
    .replace(/\(\?![\s\S]*?\)/g, ' ')
    .replace(/\(\?:/g, '(')
    .replace(/\\[A-Za-z.]+/g, ' ')
    .replace(/[\[\]{}()*+?^$:]/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ');

  return uniqSorted(
    (normalized.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).filter((token) => !TOKEN_NOISE.has(token))
  );
}

// Look up a pattern inside a repository key by a predicate.
// Throws clearly if the key or pattern is missing.
function getPattern(repositoryKey, predicate) {
  const entry = repository[repositoryKey];
  if (!entry || !Array.isArray(entry.patterns)) {
    throw new Error(`Missing patterns for repository key: ${repositoryKey}`);
  }
  const match = entry.patterns.find(predicate);
  if (!match) {
    throw new Error(`Unable to find expected pattern inside repository key: ${repositoryKey}`);
  }
  return match;
}

// Read the current values of a const array from jac.js.
// e.g. const KEYWORDS = ['foo', 'bar'] → ['foo', 'bar']
function readConstArray(source, constName) {
  const pattern = new RegExp(`const ${constName} = \\[\\n([\\s\\S]*?)\\n  \\];`);
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Unable to read array declaration for ${constName}`);
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

// Replace the values of a const array in jac.js with new values.
function replaceConstArray(source, constName, values) {
  const replacement = `const ${constName} = [\n${values.map((value) => `    '${value}'`).join(',\n')}\n  ];`;
  const pattern = new RegExp(`const ${constName} = \\[\\n[\\s\\S]*?\\n  \\];`);
  if (!pattern.test(source)) {
    throw new Error(`Unable to locate array declaration for ${constName}`);
  }
  return source.replace(pattern, replacement);
}

// Merge existing values with newly extracted ones, filtered by the category allowlist.
function mergeCategory(currentValues, extractedValues, allowlist) {
  return uniqSorted([...currentValues, ...extractedValues].filter((token) => allowlist.includes(token)));
}

// Extract plain word tokens from a list of regex pattern strings.
function collectTokens(expressions) {
  return uniqSorted(expressions.flatMap((expr) => extractAlternationWords(expr)));
}

// --- Step 4: Extract patterns from jac.tmLanguage.json ---
// Each pattern corresponds to a grammar rule in the TextMate JSON.

const statementKeyword = repository['statement-keyword'];
if (!statementKeyword || !Array.isArray(statementKeyword.patterns)) {
  throw new Error('repository.statement-keyword is required');
}

const functionPattern = getPattern('statement-keyword', (pattern) => pattern.name === 'storage.type.function.jac');
const modifierPattern = getPattern('statement-keyword', (pattern) => pattern.name === 'storage.modifier.declaration.jac');
const classPattern = getPattern('statement-keyword', (pattern) => pattern.name === 'storage.type.class.jac');
const hasPattern = getPattern('statement-keyword', (pattern) => pattern.name === 'storage.type.has.jac');
const flowPatterns = statementKeyword.patterns.filter(
  (pattern) => pattern.name === 'keyword.control.flow.jac' || pattern.captures?.['1']?.name === 'keyword.control.flow.jac'
);
const importPattern = repository.import?.patterns?.[0];
const operatorPattern = repository.operator;
const literalPattern = getPattern('literal', (pattern) => pattern.name === 'constant.language.jac');
const builtinsPattern = repository['builtin-functions']?.patterns || [];
const builtinTypesPattern = repository['builtin-types'];
const specialVariablesPattern = repository['special-variables'];

// --- Step 5: Read current const arrays from jac.js ---
// These are the values already in the file before this sync run.

const currentArrays = {
  ARCHETYPE_KEYWORDS: readConstArray(target, 'ARCHETYPE_KEYWORDS'),
  ABILITY_KEYWORDS: readConstArray(target, 'ABILITY_KEYWORDS'),
  ACCESS_KEYWORDS: readConstArray(target, 'ACCESS_KEYWORDS'),
  CONTROL_KEYWORDS: readConstArray(target, 'CONTROL_KEYWORDS'),
  IMPORT_KEYWORDS: readConstArray(target, 'IMPORT_KEYWORDS'),
  ASYNC_KEYWORDS: readConstArray(target, 'ASYNC_KEYWORDS'),
  OSP_KEYWORDS: readConstArray(target, 'OSP_KEYWORDS'),
  MISC_KEYWORDS: readConstArray(target, 'MISC_KEYWORDS'),
  BUILT_INS: readConstArray(target, 'BUILT_INS'),
  LITERALS: readConstArray(target, 'LITERALS'),
  LANGUAGE_VARS: readConstArray(target, 'LANGUAGE_VARS'),
  OPERATOR_KEYWORDS: readConstArray(target, 'OPERATOR_KEYWORDS')
};

// --- Step 6: Extract fresh tokens from the grammar patterns ---

const functionTokens = collectTokens([functionPattern.match]);
const modifierTokens = collectTokens([modifierPattern.match]);
const classTokens = collectTokens([classPattern.match, functionPattern.match]);
const flowTokens = collectTokens(flowPatterns.map((pattern) => pattern.match).filter(Boolean));
const importTokens = collectTokens([
  importPattern?.begin || '',
  ...(importPattern?.patterns || []).map((pattern) => pattern.match || '')
]);
const operatorTokens = collectTokens([operatorPattern?.match || '']);
const hasTokens = collectTokens([hasPattern.match]);
const builtinTokens = collectTokens([
  ...builtinsPattern.map((pattern) => pattern.match || ''),
  builtinTypesPattern?.match || ''
]);
const literalTokens = collectTokens([literalPattern.match]);
const languageVarTokens = collectTokens([specialVariablesPattern?.match || '']);

// --- Step 7: Merge current + extracted tokens per category ---
// Each category merges its existing values with newly extracted ones,
// then filters by its allowlist to keep only valid tokens.

const nextArrays = {
  ARCHETYPE_KEYWORDS: mergeCategory(currentArrays.ARCHETYPE_KEYWORDS, classTokens, CATEGORY_ALLOWLISTS.ARCHETYPE_KEYWORDS),
  ABILITY_KEYWORDS: mergeCategory(currentArrays.ABILITY_KEYWORDS, functionTokens, CATEGORY_ALLOWLISTS.ABILITY_KEYWORDS),
  ACCESS_KEYWORDS: mergeCategory(currentArrays.ACCESS_KEYWORDS, modifierTokens, CATEGORY_ALLOWLISTS.ACCESS_KEYWORDS),
  CONTROL_KEYWORDS: mergeCategory(currentArrays.CONTROL_KEYWORDS, [...flowTokens, ...operatorTokens], CATEGORY_ALLOWLISTS.CONTROL_KEYWORDS),
  IMPORT_KEYWORDS: mergeCategory(currentArrays.IMPORT_KEYWORDS, importTokens, CATEGORY_ALLOWLISTS.IMPORT_KEYWORDS),
  ASYNC_KEYWORDS: mergeCategory(currentArrays.ASYNC_KEYWORDS, [...functionTokens, ...flowTokens, ...operatorTokens], CATEGORY_ALLOWLISTS.ASYNC_KEYWORDS),
  OSP_KEYWORDS: mergeCategory(currentArrays.OSP_KEYWORDS, flowTokens, CATEGORY_ALLOWLISTS.OSP_KEYWORDS),
  MISC_KEYWORDS: mergeCategory(
    currentArrays.MISC_KEYWORDS,
    [...modifierTokens, ...functionTokens, ...flowTokens, ...operatorTokens, ...hasTokens],
    CATEGORY_ALLOWLISTS.MISC_KEYWORDS
  ),
  OPERATOR_KEYWORDS: mergeCategory(currentArrays.OPERATOR_KEYWORDS, operatorTokens, CATEGORY_ALLOWLISTS.OPERATOR_KEYWORDS),
  BUILT_INS: uniqSorted([...currentArrays.BUILT_INS, ...builtinTokens]),
  LITERALS: uniqSorted([...currentArrays.LITERALS, ...literalTokens]),
  LANGUAGE_VARS: uniqSorted([...currentArrays.LANGUAGE_VARS, ...languageVarTokens])
};

// --- Step 8: Write updated arrays back into jac.js ---
// Only writes if something actually changed.

let updated = target;
for (const [constName, values] of Object.entries(nextArrays)) {
  updated = replaceConstArray(updated, constName, values);
}

if (updated !== target) {
  fs.writeFileSync(targetPath, updated);
}

// --- Step 9: Log results ---

console.log(`Updated ${path.relative(process.cwd(), targetPath)}`);
for (const [constName, values] of Object.entries(nextArrays)) {
  console.log(`${constName}: ${values.length}`);
}
