/*
 * Jest tests for the jactoml grammar via tokenizeContent.
 * Uses the fixture at src/test/fixtures/sample.jac.toml.
 */

import * as path from 'path';
import * as fs from 'fs';
import { tokenizeContent, TokenizeResult, TokenInfo } from '../commands/inspectTokenScopes';

const GRAMMAR_PATH = path.join(process.cwd(), 'syntaxes', 'jactoml.tmLanguage.json');
const WASM_PATH = path.join(process.cwd(), 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm');
const FIXTURE = path.join(process.cwd(), 'src', 'test', 'fixtures', 'sample.jac.toml');

const fixtureContent = fs.readFileSync(FIXTURE, 'utf-8');

function findTokenByText(result: TokenizeResult, line: number, text: string): TokenInfo | undefined {
    return result.tokens.find(t => t.line === line && t.text === text);
}

describe('jactoml grammar — sample.jac.toml', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(fixtureContent, GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
    });

    test('grammar loads under source.jactoml and produces tokens', () => {
        expect(result.tokens.length).toBeGreaterThan(0);
        expect(result.tokens.every(t => t.scopes[0] === 'source.jactoml')).toBe(true);
    });

    test('[project] table head is captured as one token under jac-known', () => {
        const tok = findTokenByText(result, 3, 'project');
        expect(tok).toBeDefined();
        expect(tok!.scopes).toContain('entity.name.tag.jac-known.jactoml');
    });

    test('[dependencies.npm]-style headers capture the full dotted path as one jac-known token (not split per segment)', async () => {
        const r = await tokenizeContent('[dependencies.npm]\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
        const whole = r.tokens.find(t => t.text === 'dependencies.npm');
        expect(whole).toBeDefined();
        expect(whole!.scopes).toContain('entity.name.tag.jac-known.jactoml');
        const justNpm = r.tokens.find(t => t.text === 'npm');
        expect(justNpm).toBeUndefined();
    });

    test('[plugins.byllm.model] captures the full dotted path as one jac-known token', () => {
        const tok = findTokenByText(result, 47, 'plugins.byllm.model');
        expect(tok).toBeDefined();
        expect(tok!.scopes).toContain('entity.name.tag.jac-known.jactoml');
    });

    test('[[plugins.scale.microservices.shared_volumes]] array-of-tables captures full path under jac-known', () => {
        const tok = findTokenByText(result, 53, 'plugins.scale.microservices.shared_volumes');
        expect(tok).toBeDefined();
        expect(tok!.scopes).toContain('entity.name.tag.jac-known.jactoml');
    });

    test('arbitrary table names like [jac-shadcn] also get the jac-known scope (no allowlist)', async () => {
        const r = await tokenizeContent('[jac-shadcn]\n[desktop.window]\n[some.deeply.nested.x.y.z]\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
        for (const name of ['jac-shadcn', 'desktop.window', 'some.deeply.nested.x.y.z']) {
            const tok = r.tokens.find(t => t.text === name);
            expect(tok).toBeDefined();
            expect(tok!.scopes).toContain('entity.name.tag.jac-known.jactoml');
        }
    });

    test('every LHS key falls back to base taplo property scope (no allowlist)', () => {
        const tok = findTokenByText(result, 48, 'default_model');
        expect(tok).toBeDefined();
        expect(tok!.scopes).toContain('support.type.property-name.toml');
        expect(tok!.scopes).not.toContain('support.type.property-name.jac-known.jactoml');
    });

    describe('[plugins.scale.sso.github] block in the fixture (env placeholders in real context)', () => {
        test('table header captures the full dotted path as one jac-known token', () => {
            const tok = findTokenByText(result, 57, 'plugins.scale.sso.github');
            expect(tok).toBeDefined();
            expect(tok!.scopes).toContain('entity.name.tag.jac-known.jactoml');
        });

        test('all four ${GITHUB_*} placeholders are scoped as variable.other.env.jactoml inside the double-quoted string', () => {
            const cases: Array<[number, string]> = [
                [58, '${GITHUB_CLIENT_ID}'],
                [59, '${GITHUB_CLIENT_SECRET}'],
                [60, '${GITHUB_PUBLIC_LINK}'],
                [61, '${GITHUB_APP_SLUG}'],
            ];
            for (const [line, text] of cases) {
                const tok = findTokenByText(result, line, text);
                expect(tok).toBeDefined();
                expect(tok!.scopes).toContain('variable.other.env.jactoml');
                expect(tok!.scopes).toContain('string.quoted.single.basic.line.toml');
            }
        });

        test('bare $HOST (no braces) is scoped', () => {
            const tok = findTokenByText(result, 62, '$HOST');
            expect(tok).toBeDefined();
            expect(tok!.scopes).toContain('variable.other.env.jactoml');
        });

        test('a string with no placeholder has no env scope', () => {
            const tok = findTokenByText(result, 63, 'plain literal value');
            expect(tok).toBeDefined();
            expect(tok!.scopes).not.toContain('variable.other.env.jactoml');
        });

        test('the LHS keys (client_id, client_secret, public_link, app_slug, host) are recognised as TOML property names by the base grammar', () => {
            for (const [line, name] of [[58, 'client_id'], [59, 'client_secret'], [60, 'public_link'], [61, 'app_slug'], [62, 'host']] as const) {
                const tok = findTokenByText(result, line, name);
                expect(tok).toBeDefined();
                expect(tok!.scopes).toContain('support.type.property-name.toml');
            }
        });
    });

    describe('incomplete-bracket recovery (mirrors jac grammar -incomplete convention)', () => {
        test('an unclosed [project line is marked invalid.illegal.table.jactoml', async () => {
            const r = await tokenizeContent('[project\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const tok = r.tokens.find(t => t.text === '[project');
            expect(tok).toBeDefined();
            expect(tok!.scopes).toContain('invalid.illegal.table.jactoml');
        });

        test('lines AFTER an unclosed [project keep their proper scoping (no cascade)', async () => {
            const src = '[project\nname = "jac-ide"\nversion = "1.0.0"\n[dependencies]\nwebsockets = ">=12.0"\n';
            const r = await tokenizeContent(src, GRAMMAR_PATH, WASM_PATH, 'source.jactoml');

            const nameKey = r.tokens.find(t => t.line === 2 && t.text === 'name');
            expect(nameKey).toBeDefined();
            expect(nameKey!.scopes).toContain('support.type.property-name.toml');
            expect(nameKey!.scopes.some(s => s.startsWith('meta.array'))).toBe(false);

            const depsTable = r.tokens.find(t => t.line === 4 && t.text === 'dependencies');
            expect(depsTable).toBeDefined();
            expect(depsTable!.scopes).toContain('entity.name.tag.jac-known.jactoml');

            const wsKey = r.tokens.find(t => t.line === 5 && t.text === 'websockets');
            expect(wsKey).toBeDefined();
            expect(wsKey!.scopes).toContain('support.type.property-name.toml');
        });

        test('an unclosed [[plugins.x line is marked invalid and does not cascade', async () => {
            const src = '[[plugins.x\nname = "foo"\n[dependencies]\n';
            const r = await tokenizeContent(src, GRAMMAR_PATH, WASM_PATH, 'source.jactoml');

            const badHead = r.tokens.find(t => t.line === 1 && t.text === '[[plugins.x');
            expect(badHead).toBeDefined();
            expect(badHead!.scopes).toContain('invalid.illegal.table.jactoml');

            const depsTable = r.tokens.find(t => t.line === 3 && t.text === 'dependencies');
            expect(depsTable).toBeDefined();
            expect(depsTable!.scopes).toContain('entity.name.tag.jac-known.jactoml');
        });
    });

    describe('env-var placeholders inside strings', () => {
        test('${VAR} inside double-quoted string is scoped as variable.other.env.jactoml', async () => {
            const r = await tokenizeContent('image_registry = "${ECR_REGISTRY}"\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const tok = r.tokens.find(t => t.text === '${ECR_REGISTRY}');
            expect(tok).toBeDefined();
            expect(tok!.scopes).toContain('variable.other.env.jactoml');
        });

        test('bare $VAR (no braces) is also scoped', async () => {
            const r = await tokenizeContent('host = "$HOST"\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const tok = r.tokens.find(t => t.text === '$HOST');
            expect(tok).toBeDefined();
            expect(tok!.scopes).toContain('variable.other.env.jactoml');
        });

        test('${VAR} inside single-quoted (literal) string is also scoped', async () => {
            const r = await tokenizeContent("literal = '${LITERAL_VAR}'\n", GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const tok = r.tokens.find(t => t.text === '${LITERAL_VAR}');
            expect(tok).toBeDefined();
            expect(tok!.scopes).toContain('variable.other.env.jactoml');
        });

        test('mixed text around ${VAR} keeps the surrounding plain string un-scoped', async () => {
            const r = await tokenizeContent('mixed = "prefix-${MID}-suffix"\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const placeholder = r.tokens.find(t => t.text === '${MID}');
            expect(placeholder).toBeDefined();
            expect(placeholder!.scopes).toContain('variable.other.env.jactoml');
            const prefix = r.tokens.find(t => t.text === 'prefix-');
            expect(prefix).toBeDefined();
            expect(prefix!.scopes).not.toContain('variable.other.env.jactoml');
        });

        test('a plain string with no $ has no env scope', async () => {
            const r = await tokenizeContent('plain = "no vars here"\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            for (const t of r.tokens) {
                expect(t.scopes).not.toContain('variable.other.env.jactoml');
            }
        });
    });

    describe('edge cases (TOML stress tests)', () => {
        test('triple-double-quoted multiline string spans lines and keeps its scope', async () => {
            const src = 'k = """\nLine 1\nLine 2 with $dollar and "quotes"\n"""\n';
            const r = await tokenizeContent(src, GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const body = r.tokens.find(t => t.line === 3 && t.text.startsWith('Line 2'));
            expect(body).toBeDefined();
            expect(body!.scopes).toContain('string.quoted.triple.basic.block.toml');
            const dollarVar = r.tokens.find(t => t.line === 3 && t.text === '$dollar');
            expect(dollarVar).toBeDefined();
            expect(dollarVar!.scopes).toContain('variable.other.env.jactoml');
        });

        test('triple-single-quoted literal multiline does NOT process escape sequences', async () => {
            const src = "regex = '''^\\d{3}-\\d{2}-\\d{4}$'''\n";
            const r = await tokenizeContent(src, GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const lineToks = r.tokens.filter(t => t.line === 1);
            const hasLiteralString = lineToks.some(t => t.scopes.includes('string.quoted.triple.literal.block.toml'));
            expect(hasLiteralString).toBe(true);
            const hasEscape = lineToks.some(t => t.scopes.includes('constant.character.escape.toml'));
            expect(hasEscape).toBe(false);
        });

        test('quoted dotted key "a.b.c" = "..." is a property name, NOT a table header', async () => {
            const r = await tokenizeContent('"a.b.c" = "this is a key, not a table"\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const lineToks = r.tokens.filter(t => t.line === 1);
            const isJacKnown = lineToks.some(t => t.scopes.includes('entity.name.tag.jac-known.jactoml'));
            expect(isJacKnown).toBe(false);
            const isProperty = lineToks.some(t => t.scopes.includes('support.type.property-name.toml'));
            expect(isProperty).toBe(true);
        });

        test('deeply nested table header [a.b.c.d.e.f.g] is one whole-path jac-known token', async () => {
            const r = await tokenizeContent('[a.b.c.d.e.f.g]\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const tok = r.tokens.find(t => t.text === 'a.b.c.d.e.f.g');
            expect(tok).toBeDefined();
            expect(tok!.scopes).toContain('entity.name.tag.jac-known.jactoml');
        });

        test('repeated [[array.of.tables]] headers are each tagged jac-known', async () => {
            const src = '[[products]]\nname = "A"\n[[products]]\nname = "B"\n  [[products.features]]\n  k = "v"\n';
            const r = await tokenizeContent(src, GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const headers = r.tokens.filter(t =>
                t.scopes.includes('entity.name.tag.jac-known.jactoml') &&
                (t.text === 'products' || t.text === 'products.features')
            );
            expect(headers.length).toBe(3);
        });

        test('inline table { k = "v", n = 42 } scopes keys as meta.table.inline.toml + property name', async () => {
            const r = await tokenizeContent('inline = { k = "v", n = 42 }\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const k = r.tokens.find(t => t.line === 1 && t.text === 'k' && t.scopes.includes('meta.table.inline.toml'));
            expect(k).toBeDefined();
            expect(k!.scopes).toContain('support.type.property-name.toml');
            const n = r.tokens.find(t => t.line === 1 && t.text === '42' && t.scopes.includes('meta.table.inline.toml'));
            expect(n).toBeDefined();
            expect(n!.scopes).toContain('constant.numeric.integer.toml');
        });

        test('datetime value like 1999-12-31T23:59:59Z is a TOML datetime constant', async () => {
            const r = await tokenizeContent('dob = 1999-12-31T23:59:59Z\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const tok = r.tokens.find(t => t.text === '1999-12-31T23:59:59Z');
            expect(tok).toBeDefined();
            expect(tok!.scopes.some(s => s.includes('time.datetime'))).toBe(true);
        });

        test('empty table [empty] is still tagged as jac-known', async () => {
            const r = await tokenizeContent('[empty]\nkey_in_next_section = 1\n', GRAMMAR_PATH, WASM_PATH, 'source.jactoml');
            const tok = r.tokens.find(t => t.text === 'empty');
            expect(tok).toBeDefined();
            expect(tok!.scopes).toContain('entity.name.tag.jac-known.jactoml');
        });
    });
});
