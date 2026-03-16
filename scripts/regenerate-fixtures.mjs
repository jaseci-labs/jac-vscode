/**
 * Regenerates highlight.js test fixtures for Jac language.
 *
 * Reads .txt files from test/markup/jac/ directory, applies Jac syntax highlighting,
 * and writes expected output to .expect.txt files for test comparison.
 *
 * Should be run from highlightjs-jac directory:
 * Usage: cd highlightjs-jac && node ../jac-vscode/scripts/regenerate-fixtures.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import hljs from 'highlight.js/lib/core';
import jac from './src/languages/jac.js';

hljs.registerLanguage('jac', jac);

const fixtureDir = path.join(process.cwd(), 'test', 'markup', 'jac');

for (const fileName of fs.readdirSync(fixtureDir).sort()) {
  if (!fileName.endsWith('.txt') || fileName.endsWith('.expect.txt')) {
    continue;
  }

  const source = fs.readFileSync(path.join(fixtureDir, fileName), 'utf8');
  const highlighted = hljs.highlight(source, { language: 'jac' }).value;
  const outputPath = path.join(fixtureDir, fileName.replace(/\.txt$/, '.expect.txt'));
  fs.writeFileSync(outputPath, `${highlighted}\n`);
  console.log(`Generated ${path.basename(outputPath)}`);
}
