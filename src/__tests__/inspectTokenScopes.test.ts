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

// Load test fixtures
const keywordsContent     = fs.readFileSync(path.join(EXAMPLES_DIR, 'keywords.jac'), 'utf-8');
const functionsContent    = fs.readFileSync(path.join(EXAMPLES_DIR, 'functions.jac'), 'utf-8');
const jsxContent          = fs.readFileSync(path.join(EXAMPLES_DIR, 'jsx.jac'), 'utf-8');
const jsxCommentsContent  = fs.readFileSync(path.join(EXAMPLES_DIR, 'jsx_comments.jac'), 'utf-8');
const walkersContent      = fs.readFileSync(path.join(EXAMPLES_DIR, 'walkers.jac'), 'utf-8');
const clSvNaContent       = fs.readFileSync(path.join(EXAMPLES_DIR, 'cl_sv_na.jac'), 'utf-8');
const keywordEscContent   = fs.readFileSync(path.join(EXAMPLES_DIR, 'keyword_escape.jac'), 'utf-8');
const semErrContent       = fs.readFileSync(path.join(EXAMPLES_DIR, 'sem_err.jac'), 'utf-8');
const accessModContent    = fs.readFileSync(path.join(EXAMPLES_DIR, 'access_modifiers.jac'), 'utf-8');
const lambdaFstringContent = fs.readFileSync(path.join(EXAMPLES_DIR, 'lambda_fstring.jac'), 'utf-8');
const overrideFnContent   = fs.readFileSync(path.join(EXAMPLES_DIR, 'override_fn.jac'), 'utf-8');

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

// ---------------------------------------------------------------------------
// keywords.jac
// ---------------------------------------------------------------------------
describe('keywords.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(keywordsContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('with entry block', () => {
        test('with keyword (line 1)', () => {
            expectToken(result, 1, 1, 5, 'with', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('entry keyword (line 1)', () => {
            expectToken(result, 1, 6, 11, 'entry', ['source.jac', 'meta.function.jac', 'keyword.control.flow.jac']);
        });

        test('print builtin function (line 2)', () => {
            expectToken(result, 2, 5, 10, 'print', ['source.jac', 'meta.function-call.jac', 'support.function.builtin.jac']);
        });

        test('string literal - Hello, Jac! (line 2)', () => {
            expectToken(result, 2, 12, 23, 'Hello, Jac!', ['source.jac', 'string.quoted.single.jac']);
        });
    });

    describe('import from typing (line 5)', () => {
        test('import keyword', () => {
            expectToken(result, 5, 1, 7, 'import', ['source.jac', 'keyword.control.import.jac']);
        });

        test('from keyword', () => {
            expectToken(result, 5, 8, 12, 'from', ['source.jac', 'keyword.control.import.jac']);
        });

        test('typing namespace', () => {
            expectToken(result, 5, 13, 19, 'typing', ['source.jac', 'entity.name.namespace.jac']);
        });

        test('Optional import', () => {
            expectToken(result, 5, 22, 30, 'Optional', ['source.jac', 'entity.name.namespace.jac']);
        });

        test('comma separator after Optional', () => {
            expectToken(result, 5, 30, 31, ',', ['source.jac', 'punctuation.separator.jac']);
        });

        test('Callable import', () => {
            expectToken(result, 5, 32, 40, 'Callable', ['source.jac', 'entity.name.namespace.jac']);
        });

        test('Any import', () => {
            expectToken(result, 5, 42, 45, 'Any', ['source.jac', 'entity.name.namespace.jac']);
        });
    });

    describe('glob variable with list comprehension (lines 7-11)', () => {
        test('glob keyword', () => {
            expectToken(result, 7, 1, 5, 'glob', ['source.jac', 'storage.type.variable.jac']);
        });

        test('enum_semstr property name', () => {
            expectToken(result, 7, 6, 18, 'enum_semstr ', ['source.jac', 'entity.name.type.property.jac']);
        });

        test('assignment operator', () => {
            expectToken(result, 7, 18, 19, '=', ['source.jac', 'keyword.operator.assignment.jac']);
        });

        test('for keyword in comprehension', () => {
            expectToken(result, 9, 5, 8, 'for', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('in keyword in comprehension', () => {
            expectToken(result, 9, 16, 18, 'in', ['source.jac', 'keyword.operator.logical.python']);
        });

        test('if keyword in comprehension', () => {
            expectToken(result, 10, 5, 7, 'if', ['source.jac', 'keyword.control.flow.jac']);
        });
    });

    describe('Docstring (line 13)', () => {
        test('docstring opening quotes', () => {
            expectToken(result, 13, 1, 4, '"""', ['source.jac', 'string.quoted.docstring.multi.jac', 'punctuation.definition.string.begin.jac']);
        });

        test('docstring content', () => {
            expectToken(result, 13, 4, 41, 'Implementation of analysis scheduler.', ['source.jac', 'string.quoted.docstring.multi.jac']);
        });

        test('docstring closing quotes', () => {
            expectToken(result, 13, 41, 44, '"""', ['source.jac', 'string.quoted.docstring.multi.jac', 'punctuation.definition.string.end.jac']);
        });
    });

    describe('def _static_bash declaration (line 15)', () => {
        test('def keyword', () => {
            expectToken(result, 15, 1, 4, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('_static_bash function name', () => {
            expectToken(result, 15, 5, 17, '_static_bash', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
        });

        test('commands parameter', () => {
            expectToken(result, 15, 18, 26, 'commands', ['source.jac', 'meta.function.jac', 'variable.parameter.function.language.jac']);
        });

        test('commands parameter type colon', () => {
            expectToken(result, 15, 26, 27, ':', ['source.jac', 'meta.function.jac', 'punctuation.separator.annotation.jac']);
        });

        test('list type for commands', () => {
            expectToken(result, 15, 28, 32, 'list', ['source.jac', 'meta.function.jac', 'support.type.jac']);
        });

        test('parameter separator comma', () => {
            expectToken(result, 15, 32, 33, ',', ['source.jac', 'meta.function.jac', 'punctuation.separator.parameters.jac']);
        });

        test('exe parameter', () => {
            expectToken(result, 15, 34, 37, 'exe', ['source.jac', 'meta.function.jac', 'variable.parameter.function.language.jac']);
        });

        test('str type for exe', () => {
            expectToken(result, 15, 39, 42, 'str', ['source.jac', 'meta.function.jac', 'support.type.jac']);
        });

        test('return type str', () => {
            expectToken(result, 15, 47, 50, 'str', ['source.jac', 'meta.function.jac', 'support.type.jac']);
        });
    });

    describe('impl _static_bash (line 16)', () => {
        test('impl keyword', () => {
            expectToken(result, 16, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('_static_bash as function name in impl', () => {
            expectToken(result, 16, 6, 18, '_static_bash', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });
    });

    describe('sem syntax (line 18)', () => {
        test('sem keyword', () => {
            expectToken(result, 18, 1, 4, 'sem', ['source.jac', 'meta.semstring.jac', 'storage.type.semstring.jac']);
        });

        test('word namespace', () => {
            expectToken(result, 18, 5, 9, 'word', ['source.jac', 'meta.semstring.jac', 'entity.name.namespace.jac']);
        });

        test('cost function name in semstring', () => {
            expectToken(result, 18, 10, 14, 'cost', ['source.jac', 'meta.semstring.jac', 'entity.name.function.semstring.jac']);
        });

        test('assignment operator in semstring', () => {
            expectToken(result, 18, 15, 16, '=', ['source.jac', 'meta.semstring.jac', 'keyword.operator.assignment.jac']);
        });

        test('semstring value', () => {
            expectToken(result, 18, 18, 33, 'it is a expense', ['source.jac', 'meta.semstring.jac', 'string.quoted.single.jac']);
        });
    });

    describe('impl SchedulerConfig.default (lines 20-22)', () => {
        test('impl keyword', () => {
            expectToken(result, 20, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('SchedulerConfig class name', () => {
            expectToken(result, 20, 6, 21, 'SchedulerConfig', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('dot separator', () => {
            expectToken(result, 20, 21, 22, '.', ['source.jac', 'meta.class.jac']);
        });

        test('default method name', () => {
            expectToken(result, 20, 22, 29, 'default', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('return keyword inside impl', () => {
            expectToken(result, 21, 5, 11, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('SchedulerConfig constructor call', () => {
            expectToken(result, 21, 12, 27, 'SchedulerConfig', ['source.jac', 'meta.function-call.jac', 'meta.function-call.generic.jac']);
        });
    });

    describe('impl PendingAnalysis.postinit (lines 24-28)', () => {
        test('impl keyword', () => {
            expectToken(result, 24, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('PendingAnalysis class name', () => {
            expectToken(result, 24, 6, 21, 'PendingAnalysis', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('postinit method name', () => {
            expectToken(result, 24, 22, 30, 'postinit', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('if keyword', () => {
            expectToken(result, 25, 5, 7, 'if', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('self keyword', () => {
            expectToken(result, 25, 8, 12, 'self', ['source.jac', 'variable.language.special.self.jac']);
        });

        test('equality comparison operator', () => {
            expectToken(result, 25, 23, 25, '==', ['source.jac', 'keyword.operator.comparison.jac']);
        });

        test('numeric literal 0', () => {
            expectToken(result, 25, 26, 27, '0', ['source.jac', 'constant.numeric.dec.jac']);
        });

        test('self in assignment', () => {
            expectToken(result, 26, 9, 13, 'self', ['source.jac', 'variable.language.special.self.jac']);
        });

        test('assignment operator', () => {
            expectToken(result, 26, 24, 25, '=', ['source.jac', 'keyword.operator.assignment.jac']);
        });

        test('time function call', () => {
            expectToken(result, 26, 31, 35, 'time', ['source.jac', 'meta.function-call.jac', 'meta.function-call.generic.jac']);
        });
    });

    describe('impl semantic (line 30)', () => {
        test('impl keyword', () => {
            // impl semantic{}
            expectToken(result, 30, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('semantic as function name', () => {
            expectToken(result, 30, 6, 14, 'semantic', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });
    });

    describe('check is not a keyword (line 33)', () => {
        test('check used as identifier', () => {
            expectToken(result, 33, 1, 7, 'check', ['source.jac']);
        });
    });
});

// ---------------------------------------------------------------------------
// functions.jac
// ---------------------------------------------------------------------------
describe('functions.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(functionsContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('def init_cache (line 1)', () => {
        test('def keyword', () => {
            // def init_cache() -> dict {
            expectToken(result, 1, 1, 4, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('init_cache function name not split by init keyword', () => {
            expectToken(result, 1, 5, 15, 'init_cache', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
        });

        test('dict return type', () => {
            expectToken(result, 1, 21, 25, 'dict', ['source.jac', 'meta.function.jac', 'support.type.jac']);
        });

        test('return keyword', () => {
            expectToken(result, 2, 5, 11, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });
    });

    describe('with entry block with lambda (lines 5-11)', () => {
        test('with keyword', () => {
            // with entry {
            expectToken(result, 5, 1, 5, 'with', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('entry keyword', () => {
            expectToken(result, 5, 6, 11, 'entry', ['source.jac', 'meta.function.jac', 'keyword.control.flow.jac']);
        });

        test('assignment operator for process', () => {
            // process = lambda x: int -> int {
            expectToken(result, 6, 13, 14, '=', ['source.jac', 'keyword.operator.assignment.jac']);
        });

        test('lambda keyword in assignment', () => {
            expectToken(result, 6, 15, 21, 'lambda', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('int type annotation for x parameter', () => {
            expectToken(result, 6, 25, 28, 'int', ['source.jac', 'support.type.jac']);
        });

        test('int return type for lambda', () => {
            expectToken(result, 6, 32, 35, 'int', ['source.jac', 'support.type.jac']);
        });

        test('multiplication operator', () => {
            // doubled = x * 2;
            expectToken(result, 7, 21, 22, '*', ['source.jac', 'keyword.operator.arithmetic.jac']);
        });

        test('numeric literal 2', () => {
            expectToken(result, 7, 23, 24, '2', ['source.jac', 'constant.numeric.dec.jac']);
        });

        test('addition operator', () => {
            // result = doubled + 1;
            expectToken(result, 8, 26, 27, '+', ['source.jac', 'keyword.operator.arithmetic.jac']);
        });

        test('numeric literal 1', () => {
            expectToken(result, 8, 28, 29, '1', ['source.jac', 'constant.numeric.dec.jac']);
        });

        test('return keyword in lambda', () => {
            // return result;
            expectToken(result, 9, 9, 15, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });
    });

    describe('na def priority_score (line 13)', () => {
        test('na keyword is storage modifier (line 13)', () => {
            // na def priority_score(title: str) -> int;
            expectToken(result, 13, 1, 3, 'na', ['source.jac', 'meta.function.jac', 'storage.modifier.declaration.jac']);
        });

        test('def keyword after na modifier', () => {
            expectToken(result, 13, 4, 7, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('function name priority_score after na def', () => {
            expectToken(result, 13, 8, 22, 'priority_score', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
        });
    });
});

// ---------------------------------------------------------------------------
// jsx.jac
// ---------------------------------------------------------------------------
describe('jsx.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(jsxContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('cl import (line 1)', () => {
        test('cl keyword', () => {
            // cl import from react { useState }
            expectToken(result, 1, 1, 3, 'cl', ['source.jac', 'storage.modifier.declaration.jac']);
        });

        test('import keyword after cl', () => {
            expectToken(result, 1, 4, 10, 'import', ['source.jac', 'keyword.control.import.jac']);
        });

        test('from keyword', () => {
            expectToken(result, 1, 11, 15, 'from', ['source.jac', 'keyword.control.import.jac']);
        });

        test('react namespace', () => {
            expectToken(result, 1, 16, 21, 'react', ['source.jac', 'entity.name.namespace.jac']);
        });

        test('useState import name', () => {
            expectToken(result, 1, 24, 32, 'useState', ['source.jac', 'entity.name.namespace.jac']);
        });
    });

    describe('cl keyword and def app (lines 3-4)', () => {
        test('cl keyword', () => {
            // cl {
            expectToken(result, 3, 1, 3, 'cl', ['source.jac', 'storage.modifier.declaration.jac']);
        });

        test('def keyword', () => {
            // def app() -> JsxElement {
            expectToken(result, 4, 5, 8, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('app function name', () => {
            expectToken(result, 4, 9, 12, 'app', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
        });
    });

    describe('JSX HTML tags (lines 6-14)', () => {
        test('return keyword', () => {
            // return <div>
            expectToken(result, 6, 9, 15, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('div opening tag', () => {
            expectToken(result, 6, 17, 20, 'div', ['entity.name.tag.html.jsx.jac']);
        });

        test('h1 opening tag', () => {
            // <h1>Hello, World!</h1>
            expectToken(result, 7, 14, 16, 'h1', ['entity.name.tag.html.jsx.jac']);
        });

        test('p opening tag', () => {
            // <p>Count: {count}</p>
            expectToken(result, 8, 14, 15, 'p', ['entity.name.tag.html.jsx.jac']);
        });

        test('button opening tag', () => {
            // <button onClick={...}>
            expectToken(result, 9, 14, 20, 'button', ['entity.name.tag.html.jsx.jac']);
        });
    });

    describe('JSX Component Tags (lines 12-13)', () => {
        test('ButtonComponent tag', () => {
            // <ButtonComponent label="Click Me" />
            expectToken(result, 12, 14, 29, 'ButtonComponent', ['support.class.component.jsx.jac']);
        });

        test('NavLink opening tag', () => {
            // <NavLink to="/about">
            expectToken(result, 13, 14, 21, 'NavLink', ['support.class.component.jsx.jac']);
        });
    });

    describe('JSX Attributes (lines 9, 12, 13)', () => {
        test('onClick attribute', () => {
            expectToken(result, 9, 21, 28, 'onClick', ['entity.other.attribute-name.jsx.jac']);
        });

        test('label attribute', () => {
            expectToken(result, 12, 30, 35, 'label', ['entity.other.attribute-name.jsx.jac']);
        });

        test('to attribute', () => {
            expectToken(result, 13, 22, 24, 'to', ['entity.other.attribute-name.jsx.jac']);
        });
    });

    describe('JSX Attribute Strings (lines 12-13)', () => {
        test('string attribute value - Click Me', () => {
            expectToken(result, 12, 37, 45, 'Click Me', ['string.quoted.double.jac']);
        });

        test('string attribute value - /about', () => {
            expectToken(result, 13, 26, 32, '/about', ['string.quoted.double.jac']);
        });
    });

    describe('lambda in JSX onClick (line 9)', () => {
        test('lambda keyword', () => {
            // lambda e: any -> None { setCount(count + 1); }
            expectToken(result, 9, 30, 36, 'lambda', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('any type annotation', () => {
            expectToken(result, 9, 40, 43, 'any', ['source.jac', 'support.type.jac']);
        });

        test('None return type', () => {
            expectToken(result, 9, 47, 51, 'None', ['source.jac', 'constant.language.jac']);
        });
    });

    describe('Lambda Arrow Syntax in useEffect (line 21)', () => {
        test('lambda keyword', () => {
            // useEffect(lambda -> None { ... }
            expectToken(result, 21, 19, 25, 'lambda', ['storage.type.function.lambda.jac']);
        });

        test('lambda arrow operator', () => {
            expectToken(result, 21, 26, 28, '->', ['punctuation.separator.annotation.result.jac']);
        });

        test('lambda None return type', () => {
            expectToken(result, 21, 29, 33, 'None', ['constant.language.jac']);
        });

        test('lambda opening brace', () => {
            expectToken(result, 21, 34, 35, '{', ['punctuation.section.function.lambda.begin.jac']);
        });
    });

    describe('JSX text content (line 22)', () => {
        test('h1 tag name', () => {
            // <h1>Count is {count}</h1>
            expectToken(result, 22, 17, 19, 'h1', ['entity.name.tag.html.jsx.jac']);
        });

        test('JSX text "Count is " as string', () => {
            expectToken(result, 22, 20, 29, 'Count is ', ['string.unquoted.jsx.jac']);
        });

        test('JSX embedded expression brace', () => {
            expectToken(result, 22, 29, 30, '{', ['punctuation.section.embedded.begin.jsx.jac']);
        });
    });

    describe('def:pub TestComponent (lines 26-33)', () => {
        test('def keyword', () => {
            // def:pub TestComponent() -> JsxElement {
            expectToken(result, 27, 5, 8, 'def', ['storage.type.function.jac']);
        });

        test('pub modifier', () => {
            expectToken(result, 27, 9, 12, 'pub', ['storage.modifier.declaration.jac']);
        });

        test('function name TestComponent', () => {
            expectToken(result, 27, 13, 26, 'TestComponent', ['entity.name.function.jac']);
        });

        test('h2 opening tag', () => {
            // <h2>This is a test component</h2>
            expectToken(result, 29, 14, 16, 'h2', ['entity.name.tag.html.jsx.jac']);
        });

        test('JSX text with "test" as string not keyword', () => {
            expectToken(result, 29, 17, 41, 'This is a test component', ['string.unquoted.jsx.jac']);
        });

        test('h2 closing tag name', () => {
            expectToken(result, 29, 43, 45, 'h2', ['entity.name.tag.html.jsx.jac']);
        });

        test('div closing tag (line 31)', () => {
            // </div>
            expectToken(result, 31, 11, 14, 'div', ['entity.name.tag.html.jsx.jac']);
        });
    });

    describe('def app with EmailBuddyLayout (lines 35-39)', () => {
        test('def keyword', () => {
            // def app {
            expectToken(result, 35, 1, 4, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('app function name', () => {
            expectToken(result, 35, 5, 8, 'app', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
        });

        test('return keyword', () => {
            // return (
            expectToken(result, 36, 5, 11, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('EmailBuddyLayout opening tag punctuation', () => {
            expectToken(result, 37, 9, 10, '<', ['source.jac', 'meta.jsx.component.jac', 'punctuation.definition.tag.begin.jsx.jac']);
        });

        test('EmailBuddyLayout component tag', () => {
            // <EmailBuddyLayout />
            expectToken(result, 37, 10, 26, 'EmailBuddyLayout', ['source.jac', 'meta.jsx.component.jac', 'support.class.component.jsx.jac']);
        });

        test('EmailBuddyLayout self-closing tag />', () => {
            // />
            expectToken(result, 37, 27, 29, '/>', ['source.jac', 'meta.jsx.component.jac', 'punctuation.definition.tag.end.jsx.jac']);
        });
    });

    describe('cl with def:pub app and has property (lines 41-50)', () => {
        test('cl keyword', () => {
            // cl {
            expectToken(result, 41, 1, 3, 'cl', ['source.jac', 'storage.modifier.declaration.jac']);
        });

        test('def keyword with pub modifier', () => {
            // def:pub app() -> JsxElement {
            expectToken(result, 42, 5, 8, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('pub modifier', () => {
            expectToken(result, 42, 9, 12, 'pub', ['source.jac', 'meta.function.jac', 'storage.modifier.declaration.jac']);
        });

        test('app function name', () => {
            expectToken(result, 42, 13, 16, 'app', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
        });

        test('has keyword for property', () => {
            // has count: int = 0;
            expectToken(result, 43, 9, 12, 'has', ['source.jac', 'meta.property.jac', 'storage.type.function.jac']);
        });

        test('count property name', () => {
            expectToken(result, 43, 13, 18, 'count', ['source.jac', 'meta.property.jac', 'variable.parameter.language.jac']);
        });

        test('property type annotation colon', () => {
            expectToken(result, 43, 18, 19, ':', ['source.jac', 'meta.property.jac', 'punctuation.separator.parameters.jac']);
        });

        test('int type for count', () => {
            expectToken(result, 43, 20, 23, 'int', ['source.jac', 'meta.property.jac', 'support.type.jac']);
        });

        test('property assignment operator', () => {
            expectToken(result, 43, 24, 25, '=', ['source.jac', 'meta.property.jac', 'keyword.operator.assignment.jac']);
        });

        test('property default value 0', () => {
            expectToken(result, 43, 26, 27, '0', ['source.jac', 'meta.property.jac', 'constant.numeric.dec.jac']);
        });

        test('return keyword', () => {
            expectToken(result, 44, 9, 15, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('div opening tag', () => {
            expectToken(result, 44, 17, 20, 'div', ['source.jac', 'meta.jsx.html.jac', 'entity.name.tag.html.jsx.jac']);
        });

        test('button tag in nested JSX', () => {
            expectToken(result, 45, 14, 20, 'button', ['entity.name.tag.html.jsx.jac']);
        });

        test('onClick attribute on button', () => {
            expectToken(result, 45, 21, 28, 'onClick', ['entity.other.attribute-name.jsx.jac']);
        });

        test('lambda keyword in onClick handler', () => {
            // lambda -> None { count = count + 1; }
            expectToken(result, 45, 30, 36, 'lambda', ['keyword.control.flow.jac']);
        });

        test('None return type in lambda', () => {
            expectToken(result, 45, 40, 44, 'None', ['constant.language.jac']);
        });

        test('numeric literal 1 in lambda body', () => {
            expectToken(result, 45, 63, 64, '1', ['constant.numeric.dec.jac']);
        });

        test('button closing tag', () => {
            expectToken(result, 47, 15, 21, 'button', ['entity.name.tag.html.jsx.jac']);
        });

        test('div closing tag', () => {
            expectToken(result, 48, 11, 14, 'div', ['entity.name.tag.html.jsx.jac']);
        });
    });
});

// ---------------------------------------------------------------------------
// jsx_comments.jac
// ---------------------------------------------------------------------------
describe('jsx_comments.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(jsxCommentsContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('JSX text with # should NOT be highlighted as comment', () => {
        test('# outside JSX is a comment (line 1)', () => {
            // # Comment outside JSX - highlighted as comment
            expectToken(result, 1, 1, 2, '#', ['source.jac', 'comment.line.number-sign.jac', 'punctuation.definition.comment.jac']);
        });

        test('text after </span> with # is string not comment (line 5)', () => {
            // <span>{ "*" }</span> # this is not a comment; html Content <--
            const token = getTokenByLocation(result, 5, 33, 72);
            expect(token).toBeDefined();
            expect(token!.text).toBe(' # this is not a comment; html Content ');
            expect(token!.scopes).toContain('string.unquoted.jsx.jac');
            expect(token!.scopes).not.toContain('comment.line.number-sign.jac');
        });

        test('# this is not a comment - inside <p> is string (line 7)', () => {
            const token = getTokenByLocation(result, 7, 1, 41);
            expect(token).toBeDefined();
            expect(token!.scopes).toContain('string.unquoted.jsx.jac');
            expect(token!.scopes).not.toContain('comment.line.number-sign.jac');
        });

        test('#this is not # a comment - inside <p> is string (line 8)', () => {
            const token = getTokenByLocation(result, 8, 1, 42);
            expect(token).toBeDefined();
            expect(token!.scopes).toContain('string.unquoted.jsx.jac');
            expect(token!.scopes).not.toContain('comment.line.number-sign.jac');
        });

        test('block comment #* inside {} is valid comment (line 9)', () => {
            // {#* This is the valid comment inside jsx *# }
            expectToken(result, 9, 18, 20, '#*', ['source.jac', 'comment.block.jac', 'punctuation.definition.comment.begin.jac']);
        });

        test('block comment content inside {} (line 9)', () => {
            expectToken(result, 9, 20, 58, ' This is the valid comment inside jsx ', ['source.jac', 'comment.block.jac']);
        });

        test('block comment *# end (line 9)', () => {
            expectToken(result, 9, 58, 60, '*#', ['source.jac', 'comment.block.jac', 'punctuation.definition.comment.end.jac']);
        });

        test('<p> opening tag (line 6)', () => {
            expectToken(result, 6, 14, 15, 'p', ['entity.name.tag.html.jsx.jac']);
        });

        test('</p> closing tag (line 10)', () => {
            expectToken(result, 10, 15, 16, 'p', ['entity.name.tag.html.jsx.jac']);
        });

        test('</div> closing tag (line 11)', () => {
            expectToken(result, 11, 11, 14, 'div', ['source.jac', 'meta.jsx.html.jac', 'entity.name.tag.html.jsx.jac']);
        });
    });
});

// ---------------------------------------------------------------------------
// walkers.jac
// ---------------------------------------------------------------------------
describe('walkers.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(walkersContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('walker get_profile (lines 1-7)', () => {
        test('walker keyword', () => {
            // walker get_profile {
            expectToken(result, 1, 1, 7, 'walker', ['source.jac', 'storage.type.class.jac']);
        });

        test('get_profile walker name', () => {
            expectToken(result, 1, 8, 19, 'get_profile', ['source.jac', 'entity.name.type.class.jac']);
        });

        test('can keyword in ability', () => {
            // can run with Root entry {
            expectToken(result, 2, 5, 8, 'can', ['source.jac', 'storage.type.function.jac']);
        });

        test('run as ability name', () => {
            expectToken(result, 2, 9, 12, 'run', ['source.jac', 'entity.name.function.jac']);
        });

        test('report keyword', () => {
            // report 'ok';
            expectToken(result, 3, 9, 15, 'report', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('ok string literal', () => {
            expectToken(result, 3, 17, 19, 'ok', ['source.jac', 'string.quoted.single.jac']);
        });

        test('lambda keyword inside sort function call', () => {
            // tweets.sort(key=lambda t: s)
            expectToken(result, 4, 25, 31, 'lambda', ['source.jac', 'storage.type.function.lambda.jac']);
        });

        test('report keyword after lambda line (regression)', () => {
            expectToken(result, 5, 9, 15, 'report', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('not ok string literal after lambda line (regression)', () => {
            expectToken(result, 5, 17, 23, 'not ok', ['source.jac', 'string.quoted.single.jac']);
        });
    });

    describe('walker:pub get_all_profiles (lines 9-13)', () => {
        test('walker keyword', () => {
            // walker:pub get_all_profiles {
            expectToken(result, 9, 1, 7, 'walker', ['source.jac', 'storage.type.class.jac']);
        });

        test('pub modifier on walker', () => {
            expectToken(result, 9, 8, 11, 'pub', ['source.jac', 'storage.modifier.declaration.jac']);
        });

        test('report results', () => {
            // report results;
            expectToken(result, 11, 9, 15, 'report', ['source.jac', 'keyword.control.flow.jac']);
        });
    });

    describe('String with colon inside function call (line 16)', () => {
        test('string "mongo:7.0" is a string not a parameter annotation', () => {
            // with MongoDbContainer("mongo:7.0") as mongo {
            expectToken(result, 16, 28, 37, 'mongo:7.0', ['string.quoted.single.jac']);
        });

        test('as keyword', () => {
            expectToken(result, 16, 40, 42, 'as', ['keyword.control.import.jac']);
        });

        test('mongo variable name', () => {
            expectToken(result, 16, 43, 48, 'mongo', ['entity.name.function.jac']);
        });
    });
});

// ---------------------------------------------------------------------------
// cl_sv_na.jac
// ---------------------------------------------------------------------------
describe('cl_sv_na.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(clSvNaContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('cl import (line 1)', () => {
        test('cl keyword is storage modifier', () => {
            // cl import from react { useState }
            expectToken(result, 1, 1, 3, 'cl', ['source.jac', 'storage.modifier.declaration.jac']);
        });
    });

    describe('sv import keyword highlighting (lines 2-3)', () => {
        test('sv keyword is storage modifier like cl (line 2)', () => {
            // sv import from endpoints { AddTodo, GetTodos }
            expectToken(result, 2, 1, 3, 'sv', ['source.jac', 'storage.modifier.declaration.jac']);
        });

        test('sv keyword is NOT colored as import keyword (line 2)', () => {
            const token = getTokenByLocation(result, 2, 1, 3);
            expect(token).toBeDefined();
            expect(token!.scopes).not.toContain('keyword.control.import.jac');
        });

        test('import keyword after sv (line 2)', () => {
            expectToken(result, 2, 4, 10, 'import', ['source.jac', 'keyword.control.import.jac']);
        });

        test('endpoints as namespace (line 2)', () => {
            expectToken(result, 2, 16, 25, 'endpoints', ['source.jac', 'entity.name.namespace.jac']);
        });

        test('AddTodo import name (line 2)', () => {
            expectToken(result, 2, 28, 35, 'AddTodo', ['source.jac', 'entity.name.namespace.jac']);
        });

        test('sv keyword on second sv import line (line 3)', () => {
            // sv import from auth { login, logout }
            expectToken(result, 3, 1, 3, 'sv', ['source.jac', 'storage.modifier.declaration.jac']);
        });
    });

    describe('na keyword highlighting (lines 22, 24)', () => {
        test('na keyword is storage modifier like cl (line 22)', () => {
            // na def priority_score(title: str) -> int;
            expectToken(result, 22, 1, 3, 'na', ['source.jac', 'meta.function.jac', 'storage.modifier.declaration.jac']);
        });

        test('na keyword is storage modifier like cl (line 24)', () => {
            // na { def bytes_search_na() ... }
            expectToken(result, 24, 1, 3, 'na', ['source.jac', 'storage.modifier.declaration.jac']);
        });
    });
});

// ---------------------------------------------------------------------------
// keyword_escape.jac
// ---------------------------------------------------------------------------
describe('keyword_escape.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(keywordEscContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('JSX Fragments (lines 5, 12)', () => {
        test('fragment opening tag <>', () => {
            // <>
            const fragmentOpen = getTokenByLocation(result, 5, 13, 15);
            expect(fragmentOpen).toBeDefined();
            expect(fragmentOpen!.text).toBe('<>');
            expect(fragmentOpen!.scopes).toContain('punctuation.definition.tag.jsx.jac');
        });

        test('fragment closing tag </>', () => {
            const fragmentClose = getTokenByLocation(result, 12, 13, 16);
            expect(fragmentClose).toBeDefined();
            expect(fragmentClose!.text).toBe('</>');
            expect(fragmentClose!.scopes).toContain('punctuation.definition.tag.jsx.jac');
        });
    });
});

// ---------------------------------------------------------------------------
// sem_err.jac
// ---------------------------------------------------------------------------
describe('sem_err.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(semErrContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('Error recovery: incomplete sem followed by impl (lines 3-4)', () => {
        test('sem keyword in incomplete statement', () => {
            // sem word.cost =
            expectToken(result, 3, 1, 4, 'sem', ['source.jac', 'meta.semstring.jac', 'storage.type.semstring.jac']);
        });

        test('impl keyword after incomplete sem recovers correctly', () => {
            // impl semantic{}
            expectToken(result, 4, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('semantic function name after impl', () => {
            expectToken(result, 4, 6, 14, 'semantic', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });
    });
});

// ---------------------------------------------------------------------------
// access_modifiers.jac
// ---------------------------------------------------------------------------
describe('access_modifiers.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(accessModContent, GRAMMAR_PATH, WASM_PATH);
    });

    test('pub / priv / protect are scoped as storage modifier', () => {
        expectToken(result, 1, 6,  9,  'pub',     ['storage.modifier.declaration.jac']);
        expectToken(result, 2, 6,  10, 'priv',    ['storage.modifier.declaration.jac']);
        expectToken(result, 3, 6,  13, 'protect', ['storage.modifier.declaration.jac']);
    });

    test('archetype name is highlighted after access tag on all 6 declarations', () => {
        expectToken(result, 1, 10, 20, 'PublicNode',    ['entity.name.type.class.jac']);
        expectToken(result, 2, 11, 22, 'PrivateNode',   ['entity.name.type.class.jac']);
        expectToken(result, 3, 14, 27, 'ProtectedNode', ['entity.name.type.class.jac']);
        expectToken(result, 4, 9,  18, 'PublicObj',     ['entity.name.type.class.jac']);
        expectToken(result, 5, 12, 24, 'PublicWalker',  ['entity.name.type.class.jac']);
        expectToken(result, 6, 10, 20, 'PublicEdge',    ['entity.name.type.class.jac']);
    });
});

// ---------------------------------------------------------------------------
// lambda_fstring.jac  — lambda must not exit at '{' inside f-string
// ---------------------------------------------------------------------------
describe('lambda_fstring.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(lambdaFstringContent, GRAMMAR_PATH, WASM_PATH);
    });

    describe('same-line paren: sorted( with lambda f-string body (lines 6-8)', () => {
        // line 7: "        items, key=lambda cls : source.find(f"class {cls.__name__}"),

        test('lambda keyword is scoped (col 20-26)', () => {
            expectToken(result, 7, 20, 26, 'lambda', ['source.jac', 'storage.type.function.lambda.jac']);
        });

        test('trailing comma after f-string body is argument separator — not broken by premature lambda exit at { (col 69-70)', () => {
            // If lambda exits at '{' inside the f-string, the comma ends up in a
            // spurious string scope instead of being a function-argument separator.
            expectToken(result, 7, 69, 70, ',', ['source.jac', 'punctuation.separator.arguments.jac']);
        });

        test('closing ) of sorted() is argument-end punctuation (line 8, col 5-6)', () => {
            expectToken(result, 8, 5, 6, ')', ['source.jac', 'punctuation.definition.arguments.end.jac']);
        });
    });

    describe('lambda with plain string containing braces (line 20)', () => {
        // line 20: "    result = sorted(items, key=lambda x : x.find("hello {world}"));

        test('lambda keyword (col 32-38)', () => {
            expectToken(result, 20, 32, 38, 'lambda', ['source.jac', 'storage.type.function.lambda.jac']);
        });

        test('outer ) of sorted() closes correctly (col 66-67)', () => {
            expectToken(result, 20, 66, 67, ')', ['source.jac', 'punctuation.definition.arguments.end.jac']);
        });
    });

    describe('lambda with nested function call in body (line 24)', () => {
        // line 24: "    result = map(lambda x : str(x), items);

        test('lambda keyword (col 18-24)', () => {
            expectToken(result, 24, 18, 24, 'lambda', ['source.jac', 'storage.type.function.lambda.jac']);
        });

        test('str builtin in lambda body is typed (col 29-32)', () => {
            expectToken(result, 24, 29, 32, 'str', ['source.jac', 'support.type.jac']);
        });

        test('comma separating lambda arg from items (col 35-36)', () => {
            expectToken(result, 24, 35, 36, ',', ['source.jac', 'punctuation.separator.arguments.jac']);
        });
    });
});

// ---------------------------------------------------------------------------
// override_fn.jac — function names after override get entity.name.function
// ---------------------------------------------------------------------------
describe('override_fn.jac', () => {
    let result: TokenizeResult;

    beforeAll(async () => {
        result = await tokenizeContent(overrideFnContent, GRAMMAR_PATH, WASM_PATH);
    });

    test('area function name after override can gets entity.name.function.jac (line 10)', () => {
        // line 10: "    override can area() -> float {"
        expectToken(result, 10, 18, 22, 'area', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
    });

    test('perimeter function name after override can gets entity.name.function.jac (line 14)', () => {
        // line 14: "    override can perimeter() -> float {"
        expectToken(result, 14, 18, 27, 'perimeter', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
    });

    test('area function name after override can gets entity.name.function.jac (line 23)', () => {
        // line 23: "    override can area() -> float {"
        expectToken(result, 23, 18, 22, 'area', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
    });
});
