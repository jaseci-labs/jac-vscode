/*
 * Jest tests for inspectTokenScopesHandler functionality in VSCode extension.
 * Uses real vscode-textmate and vscode-oniguruma libraries for actual grammar testing.
 *
 * Token locations use format: "line:startCol-endCol" (1-based)
 */

import * as path from 'path';
import * as fs from 'fs';
import {
    tokenizeContent,
    TokenizeResult,
    TokenInfo
} from '../commands/inspectTokenScopes';

/** Get token at a specific location */
function getTokenByLocation(
    result: TokenizeResult,
    line: number,
    startCol: number,
    endCol: number
): TokenInfo | undefined {
    return result.byLocation.get(`${line}:${startCol}-${endCol}`);
}

// Test fixture paths
const EXAMPLES_DIR = path.join(process.cwd(), 'examples');
const GRAMMAR_PATH = path.join(process.cwd(), 'syntaxes', 'jac.tmLanguage.json');
const WASM_PATH = path.join(process.cwd(), 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm');

// Load test fixture
const appJacContent = fs.readFileSync(path.join(EXAMPLES_DIR, 'app.jac'), 'utf-8');

/**
 * Helper to assert a token has expected text and contains expected scopes
 */
function expectToken(
    result: TokenizeResult,
    line: number,
    startCol: number,
    endCol: number,
    expectedText: string,
    expectedScopes: string[]
): void {
    const token = getTokenByLocation(result, line, startCol, endCol);
    expect(token).toBeDefined();
    expect(token!.text).toBe(expectedText);
    for (const scope of expectedScopes) {
        expect(token!.scopes).toContain(scope);
    }
}

describe('inspectTokenScopesHandler - Location Based Tests', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(appJacContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('Jac Keywords', () => {
        test('cl keyword at line 1', () => {
            // cl {
            expectToken(result, 1, 1, 3, 'cl', ['source.jac', 'storage.modifier.declaration.jac']);
        });

        test('def keyword', () => {
            // def app() -> any {
            expectToken(result, 3, 5, 8, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('return keyword', () => {
            // return <div>
            expectToken(result, 5, 9, 15, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('lambda keyword', () => {
            // lambda e: any -> None { ... }
            expectToken(result, 8, 30, 36, 'lambda', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('with keyword', () => {
            // with entry{
            expectToken(result, 37, 1, 5, 'with', ['source.jac', 'storage.type.function.jac']);
        });

        test('entry keyword', () => {
            // with entry{
            expectToken(result, 37, 6, 11, 'entry', ['source.jac', 'keyword.control.flow.jac']);
        });
    });

    describe('Builtin Functions', () => {
        test('print builtin function', () => {
            // print("Hello, Jac!");
            expectToken(result, 38, 5, 10, 'print', ['source.jac', 'support.function.builtin.jac']);
        });
    });

    describe('JSX HTML Tags (lowercase)', () => {
        test('div opening tag', () => {
            // <div>
            expectToken(result, 5, 17, 20, 'div', ['entity.name.tag.html.jsx.jac']);
        });

        test('h1 opening tag', () => {
            // <h1>Hello, World!</h1>
            expectToken(result, 6, 14, 16, 'h1', ['entity.name.tag.html.jsx.jac']);
        });

        test('p opening tag', () => {
            // <p>Count: {count}</p>
            expectToken(result, 7, 14, 15, 'p', ['entity.name.tag.html.jsx.jac']);
        });

        test('button opening tag', () => {
            // <button onClick={...}>
            expectToken(result, 8, 14, 20, 'button', ['entity.name.tag.html.jsx.jac']);
        });
    });

    describe('JSX Component Tags (PascalCase)', () => {
        test('ButtonComponent tag', () => {
            // <ButtonComponent label="Click Me" />
            expectToken(result, 11, 14, 29, 'ButtonComponent', ['support.class.component.jsx.jac']);
        });

        test('NavLink opening tag', () => {
            // <NavLink to="/about">
            expectToken(result, 12, 14, 21, 'NavLink', ['support.class.component.jsx.jac']);
        });
    });

    describe('JSX Attributes', () => {
        test('onClick attribute', () => {
            // <button onClick={...}>
            expectToken(result, 8, 21, 28, 'onClick', ['entity.other.attribute-name.jsx.jac']);
        });

        test('label attribute', () => {
            // <ButtonComponent label="Click Me" />
            expectToken(result, 11, 30, 35, 'label', ['entity.other.attribute-name.jsx.jac']);
        });

        test('to attribute', () => {
            // <NavLink to="/about">
            expectToken(result, 12, 22, 24, 'to', ['entity.other.attribute-name.jsx.jac']);
        });
    });

    describe('JSX Attribute Strings', () => {
        test('string attribute value - Click Me', () => {
            // label="Click Me"
            expectToken(result, 11, 37, 45, 'Click Me', ['string.quoted.double.jac']);
        });

        test('string attribute value - /about', () => {
            // to="/about"
            expectToken(result, 12, 26, 32, '/about', ['string.quoted.double.jac']);
        });
    });

    describe('Keyword Escape Syntax', () => {
        test('<>esc keyword escape', () => {
            // a = <>esc;
            // esc is at columns 11-14 (1-based)
            const escToken = getTokenByLocation(result, 19, 11, 14);
            expect(escToken).toBeDefined();
            expect(escToken!.text).toBe('esc');
            expect(escToken!.scopes).toContain('variable.other.escaped.jac');
        });

        test('<> punctuation for keyword escape', () => {
            // a = <>esc;
            // <> is at columns 9-11 (1-based)
            const punctToken = getTokenByLocation(result, 19, 9, 11);
            expect(punctToken).toBeDefined();
            expect(punctToken!.text).toBe('<>');
            expect(punctToken!.scopes).toContain('punctuation.definition.keyword-escape.jac');
        });
    });

    describe('JSX Fragments', () => {
        test('fragment opening tag <>', () => {
            // <>
            //   <div>First</div>
            // </>
            const fragmentOpen = getTokenByLocation(result, 22, 13, 15);
            expect(fragmentOpen).toBeDefined();
            expect(fragmentOpen!.text).toBe('<>');
            expect(fragmentOpen!.scopes).toContain('punctuation.definition.tag.jsx.jac');
        });

        test('fragment closing tag </>', () => {
            const fragmentClose = getTokenByLocation(result, 29, 13, 16);
            expect(fragmentClose).toBeDefined();
            expect(fragmentClose!.text).toBe('</>');
            expect(fragmentClose!.scopes).toContain('punctuation.definition.tag.jsx.jac');
        });
    });

    describe('Types', () => {
        test('any type annotation', () => {
            // def app() -> any {
            expectToken(result, 3, 18, 21, 'any', ['source.jac', 'support.type.jac']);
        });
    });

    describe('Strings', () => {
        test('string literal - Hello, Jac!', () => {
            // print("Hello, Jac!");
            expectToken(result, 38, 12, 23, 'Hello, Jac!', ['string.quoted.single.jac']);
        });
    });

    describe('Lambda Arrow Syntax (line 64)', () => {
        test('lambda keyword', () => {
            // useEffect(lambda   -> None{ ... }
            expectToken(result, 64, 19, 25, 'lambda', ['storage.type.function.lambda.jac']);
        });

        test('lambda arrow operator', () => {
            expectToken(result, 64, 28, 30, '->', ['punctuation.separator.annotation.result.jac']);
        });

        test('lambda None return type', () => {
            expectToken(result, 64, 31, 35, 'None', ['constant.language.jac']);
        });

        test('lambda opening brace', () => {
            expectToken(result, 64, 35, 36, '{', ['punctuation.section.function.lambda.begin.jac']);
        });
    });

    describe('JSX Text Content (line 65)', () => {
        test('h1 tag name', () => {
            // <h1>Count is {count}</h1>
            expectToken(result, 65, 17, 19, 'h1', ['entity.name.tag.html.jsx.jac']);
        });

        test('JSX text "Count is " as string', () => {
            expectToken(result, 65, 20, 29, 'Count is ', ['string.unquoted.jsx.jac']);
        });

        test('JSX embedded expression brace', () => {
            expectToken(result, 65, 29, 30, '{', ['punctuation.section.embedded.begin.jsx.jac']);
        });
    });

    describe('JSX with test keyword (line 72)', () => {
        test('h2 opening tag', () => {
            // <h2>This is a test component</h2>
            expectToken(result, 72, 14, 16, 'h2', ['entity.name.tag.html.jsx.jac']);
        });

        test('JSX text with "test" as string not keyword', () => {
            expectToken(result, 72, 17, 41, 'This is a test component', ['string.unquoted.jsx.jac']);
        });

        test('h2 closing tag name', () => {
            expectToken(result, 72, 43, 45, 'h2', ['entity.name.tag.html.jsx.jac']);
        });

        test('div closing tag (line 74)', () => {
            // </div>
            expectToken(result, 74, 11, 14, 'div', ['entity.name.tag.html.jsx.jac']);
        });
    });

    describe('Function with pub modifier (line 70)', () => {
        test('def keyword', () => {
            // def:pub TestComponent() -> any {
            expectToken(result, 70, 5, 8, 'def', ['storage.type.function.jac']);
        });

        test('pub modifier', () => {
            expectToken(result, 70, 9, 12, 'pub', ['storage.modifier.declaration.jac']);
        });

        test('function name TestComponent', () => {
            expectToken(result, 70, 13, 26, 'TestComponent', ['entity.name.function.jac']);
        });

        test('return type any', () => {
            expectToken(result, 70, 32, 35, 'any', ['support.type.jac']);
        });
    });
});