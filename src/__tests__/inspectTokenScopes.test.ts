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

    describe('def app with EmailBuddyLayout component (lines 78-83)', () => {
        test('def keyword for app function', () => {
            // def app{
            expectToken(result, 78, 1, 4, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('app function name', () => {
            expectToken(result, 78, 5, 8, 'app', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
        });

        test('return keyword', () => {
            // return (
            expectToken(result, 79, 5, 11, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('EmailBuddyLayout component tag', () => {
            // <EmailBuddyLayout
            expectToken(result, 80, 14, 30, 'EmailBuddyLayout', ['source.jac', 'meta.jsx.component.jac', 'support.class.component.jsx.jac']);
        });

        test('EmailBuddyLayout opening tag punctuation', () => {
            expectToken(result, 80, 13, 14, '<', ['source.jac', 'meta.jsx.component.jac', 'punctuation.definition.tag.begin.jsx.jac']);
        });

        test('EmailBuddyLayout self-closing tag />', () => {
            // />
            expectToken(result, 81, 13, 15, '/>', ['source.jac', 'meta.jsx.component.jac', 'punctuation.definition.tag.end.jsx.jac']);
        });

        test('closing parenthesis and semicolon after JSX', () => {
            // ); - ensure scope exits JSX context
            expectToken(result, 82, 1, 8, '    );', ['source.jac']);
        });

    });

    describe('Function declaration with parameters (line 85)', () => {
        test('def keyword for _static_bash', () => {
            // def _static_bash(commands: list, exe: str) -> str;
            expectToken(result, 85, 1, 4, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('_static_bash function name', () => {
            expectToken(result, 85, 5, 17, '_static_bash', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
        });

        test('commands parameter', () => {
            expectToken(result, 85, 18, 26, 'commands', ['source.jac', 'meta.function.jac', 'meta.function.parameters.jac', 'variable.parameter.function.language.jac']);
        });

        test('commands parameter type annotation colon', () => {
            expectToken(result, 85, 26, 27, ':', ['source.jac', 'meta.function.jac', 'meta.function.parameters.jac', 'punctuation.separator.annotation.jac']);
        });

        test('list type for commands', () => {
            expectToken(result, 85, 28, 32, 'list', ['source.jac', 'meta.function.jac', 'meta.function.parameters.jac', 'support.type.jac']);
        });

        test('parameter separator comma', () => {
            expectToken(result, 85, 32, 33, ',', ['source.jac', 'meta.function.jac', 'meta.function.parameters.jac', 'punctuation.separator.parameters.jac']);
        });

        test('exe parameter', () => {
            expectToken(result, 85, 34, 37, 'exe', ['source.jac', 'meta.function.jac', 'meta.function.parameters.jac', 'variable.parameter.function.language.jac']);
        });

        test('str type for exe', () => {
            expectToken(result, 85, 39, 42, 'str', ['source.jac', 'meta.function.jac', 'meta.function.parameters.jac', 'support.type.jac']);
        });

        test('return type str', () => {
            expectToken(result, 85, 47, 50, 'str', ['source.jac', 'meta.function.jac', 'support.type.jac']);
        });
    });

    describe('impl _static_bash (line 86)', () => {
        test('impl keyword', () => {
            // impl _static_bash{}
            expectToken(result, 86, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('_static_bash as function name in impl', () => {
            expectToken(result, 86, 6, 18, '_static_bash', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });
    });

    describe('Semantic string (sem) syntax (line 88)', () => {
        test('sem keyword', () => {
            // sem word.cost = "it is a expense";
            expectToken(result, 88, 1, 4, 'sem', ['source.jac', 'meta.semstring.jac', 'storage.type.semstring.jac']);
        });

        test('word namespace', () => {
            expectToken(result, 88, 5, 9, 'word', ['source.jac', 'meta.semstring.jac', 'entity.name.namespace.jac']);
        });

        test('cost function name in semstring', () => {
            expectToken(result, 88, 10, 14, 'cost', ['source.jac', 'meta.semstring.jac', 'entity.name.function.semstring.jac']);
        });

        test('assignment operator in semstring', () => {
            expectToken(result, 88, 15, 16, '=', ['source.jac', 'meta.semstring.jac', 'keyword.operator.assignment.jac']);
        });

        test('semstring value - it is a expense', () => {
            expectToken(result, 88, 18, 33, 'it is a expense', ['source.jac', 'meta.semstring.jac', 'string.quoted.single.jac']);
        });
    });

    describe('impl semantic (line 90)', () => {
        test('impl keyword for semantic', () => {
            // impl semantic{}
            expectToken(result, 90, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('semantic as function name not keyword', () => {
            expectToken(result, 90, 6, 14, 'semantic', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });
    });

    describe('cl with def:pub app and has property (lines 92-103)', () => {
        test('cl keyword', () => {
            // cl {
            expectToken(result, 92, 1, 3, 'cl', ['source.jac', 'storage.modifier.declaration.jac']);
        });

        test('def keyword with pub modifier', () => {
            // def:pub app() -> any {
            expectToken(result, 93, 5, 8, 'def', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('colon separator for modifier', () => {
            expectToken(result, 93, 8, 9, ':', ['source.jac', 'meta.function.jac']);
        });

        test('pub modifier', () => {
            expectToken(result, 93, 9, 12, 'pub', ['source.jac', 'meta.function.jac', 'storage.modifier.declaration.jac']);
        });

        test('app function name', () => {
            expectToken(result, 93, 13, 16, 'app', ['source.jac', 'meta.function.jac', 'entity.name.function.jac']);
        });

        test('any return type', () => {
            expectToken(result, 93, 22, 25, 'any', ['source.jac', 'meta.function.jac', 'support.type.jac']);
        });

        test('has keyword for property', () => {
            // has count: int = 0;
            expectToken(result, 94, 9, 12, 'has', ['source.jac', 'meta.property.jac', 'storage.type.function.jac']);
        });

        test('count property name', () => {
            expectToken(result, 94, 13, 18, 'count', ['source.jac', 'meta.property.jac', 'variable.parameter.language.jac']);
        });

        test('property type annotation colon', () => {
            expectToken(result, 94, 18, 19, ':', ['source.jac', 'meta.property.jac', 'punctuation.separator.parameters.jac']);
        });

        test('int type for count', () => {
            expectToken(result, 94, 20, 23, 'int', ['source.jac', 'meta.property.jac', 'support.type.jac']);
        });

        test('property assignment operator', () => {
            expectToken(result, 94, 24, 25, '=', ['source.jac', 'meta.property.jac', 'keyword.operator.assignment.jac']);
        });

        test('property default value 0', () => {
            expectToken(result, 94, 26, 27, '0', ['source.jac', 'meta.property.jac', 'constant.numeric.dec.jac']);
        });

        test('return keyword', () => {
            expectToken(result, 96, 9, 15, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('div opening tag', () => {
            expectToken(result, 96, 17, 20, 'div', ['source.jac', 'meta.jsx.html.jac', 'entity.name.tag.html.jsx.jac']);
        });

        test('JSX comment punctuation (#)', () => {
            // # No parameters - should be treated as a comment in JSX
            expectToken(result, 97, 13, 14, '#', ['source.jac', 'comment.line.number-sign.jac']);
        });

        test('button tag in nested JSX', () => {
            expectToken(result, 98, 14, 20, 'button', ['source.jac', 'meta.jsx.html.jac', 'meta.jsx.html.jac', 'entity.name.tag.html.jsx.jac']);
        });

        test('onClick attribute on button', () => {
            expectToken(result, 98, 21, 28, 'onClick', ['source.jac', 'meta.jsx.html.jac', 'meta.jsx.html.jac', 'entity.other.attribute-name.jsx.jac']);
        });

        test('lambda keyword in onClick handler', () => {
            // lambda -> None { count = count + 1; }
            expectToken(result, 98, 30, 36, 'lambda', ['source.jac', 'meta.jsx.html.jac', 'meta.jsx.html.jac', 'meta.embedded.expression.jsx.jac', 'keyword.control.flow.jac']);
        });

        test('None return type in lambda', () => {
            expectToken(result, 98, 40, 44, 'None', ['source.jac', 'meta.jsx.html.jac', 'meta.jsx.html.jac', 'meta.embedded.expression.jsx.jac', 'constant.language.jac']);
        });

        test('numeric literal 1 in lambda body', () => {
            expectToken(result, 98, 63, 64, '1', ['source.jac', 'meta.jsx.html.jac', 'meta.jsx.html.jac', 'meta.embedded.expression.jsx.jac', 'constant.numeric.dec.jac']);
        });

        test('Increment text as JSX string', () => {
            const token = getTokenByLocation(result, 99, 1, 26);
            expect(token).toBeDefined();
            expect(token!.scopes).toContain('string.unquoted.jsx.jac');
        });

        test('button closing tag', () => {
            expectToken(result, 100, 15, 21, 'button', ['source.jac', 'meta.jsx.html.jac', 'meta.jsx.html.jac', 'entity.name.tag.html.jsx.jac']);
        });

        test('div closing tag', () => {
            expectToken(result, 101, 11, 14, 'div', ['source.jac', 'meta.jsx.html.jac', 'entity.name.tag.html.jsx.jac']);
        });
    });

    describe('with entry block with lambda (lines 105-111)', () => {
        test('with keyword', () => {
            // with entry{
            expectToken(result, 105, 1, 5, 'with', ['source.jac', 'meta.function.jac', 'storage.type.function.jac']);
        });

        test('entry keyword', () => {
            expectToken(result, 105, 6, 11, 'entry', ['source.jac', 'meta.function.jac', 'keyword.control.flow.jac']);
        });

        test('assignment operator for process', () => {
            // process = lambda x: int -> int {
            expectToken(result, 106, 13, 14, '=', ['source.jac', 'keyword.operator.assignment.jac']);
        });

        test('lambda keyword in assignment', () => {
            expectToken(result, 106, 15, 21, 'lambda', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('int type annotation for x parameter', () => {
            expectToken(result, 106, 25, 28, 'int', ['source.jac', 'support.type.jac']);
        });

        test('int return type for lambda', () => {
            expectToken(result, 106, 32, 35, 'int', ['source.jac', 'support.type.jac']);
        });

        test('multiplication operator', () => {
            // doubled = x * 2;
            expectToken(result, 107, 17, 18, '*', ['source.jac', 'keyword.operator.arithmetic.jac']);
        });

        test('numeric literal 2', () => {
            expectToken(result, 107, 19, 20, '2', ['source.jac', 'constant.numeric.dec.jac']);
        });

        test('addition operator', () => {
            // result = doubled + 1;
            expectToken(result, 108, 22, 23, '+', ['source.jac', 'keyword.operator.arithmetic.jac']);
        });

        test('numeric literal 1', () => {
            expectToken(result, 108, 24, 25, '1', ['source.jac', 'constant.numeric.dec.jac']);
        });

        test('return keyword in lambda', () => {
            // return result;
            expectToken(result, 109, 5, 11, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });
    });

    describe('glob variable with list comprehension (lines 113-117)', () => {
        test('glob keyword', () => {
            // glob enum_semstr = [
            expectToken(result, 113, 1, 5, 'glob', ['source.jac', 'meta.property.jac', 'storage.type.variable.jac']);
        });

        test('enum_semstr property name', () => {
            expectToken(result, 113, 6, 18, 'enum_semstr ', ['source.jac', 'meta.property.jac', 'entity.name.type.property.jac']);
        });

        test('assignment operator', () => {
            expectToken(result, 113, 18, 19, '=', ['source.jac', 'meta.property.jac', 'keyword.operator.assignment.jac']);
        });

        test('for keyword in comprehension', () => {
            // for member in enum_info_to_use.members
            expectToken(result, 115, 5, 8, 'for', ['source.jac', 'meta.property.jac', 'keyword.control.flow.jac']);
        });

        test('in keyword in comprehension', () => {
            expectToken(result, 115, 16, 18, 'in', ['source.jac', 'meta.property.jac', 'keyword.operator.logical.python']);
        });

        test('if keyword in comprehension', () => {
            // if member.semstr
            expectToken(result, 116, 5, 7, 'if', ['source.jac', 'meta.property.jac', 'keyword.control.flow.jac']);
        });
    });

    describe('Docstring (line 119)', () => {
        test('docstring opening quotes', () => {
            // """Implementation of analysis scheduler."""
            expectToken(result, 119, 1, 4, '"""', ['source.jac', 'string.quoted.docstring.multi.jac', 'punctuation.definition.string.begin.jac']);
        });

        test('docstring content', () => {
            expectToken(result, 119, 4, 41, 'Implementation of analysis scheduler.', ['source.jac', 'string.quoted.docstring.multi.jac']);
        });

        test('docstring closing quotes', () => {
            expectToken(result, 119, 41, 44, '"""', ['source.jac', 'string.quoted.docstring.multi.jac', 'punctuation.definition.string.end.jac']);
        });
    });

    describe('import from typing (line 121)', () => {
        test('import keyword', () => {
            // import from typing { Optional, Callable, Any }
            expectToken(result, 121, 1, 7, 'import', ['source.jac', 'keyword.control.import.jac']);
        });

        test('from keyword', () => {
            expectToken(result, 121, 8, 12, 'from', ['source.jac', 'keyword.control.import.jac']);
        });

        test('typing namespace', () => {
            expectToken(result, 121, 13, 19, 'typing', ['source.jac', 'entity.name.namespace.jac']);
        });

        test('Optional import', () => {
            expectToken(result, 121, 22, 30, 'Optional', ['source.jac', 'entity.name.namespace.jac']);
        });

        test('comma separator after Optional', () => {
            expectToken(result, 121, 30, 31, ',', ['source.jac', 'punctuation.separator.jac']);
        });

        test('Callable import', () => {
            expectToken(result, 121, 32, 40, 'Callable', ['source.jac', 'entity.name.namespace.jac']);
        });

        test('Any import', () => {
            expectToken(result, 121, 42, 45, 'Any', ['source.jac', 'entity.name.namespace.jac']);
        });
    });

    describe('impl SchedulerConfig.default (lines 124-126)', () => {
        test('impl keyword', () => {
            // impl SchedulerConfig.default -> SchedulerConfig {
            expectToken(result, 124, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('SchedulerConfig class name', () => {
            expectToken(result, 124, 6, 21, 'SchedulerConfig', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('dot separator', () => {
            expectToken(result, 124, 21, 22, '.', ['source.jac', 'meta.class.jac']);
        });

        test('default method name', () => {
            expectToken(result, 124, 22, 29, 'default', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('SchedulerConfig return type', () => {
            expectToken(result, 124, 33, 48, 'SchedulerConfig', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('return keyword inside impl', () => {
            // return SchedulerConfig();
            expectToken(result, 125, 5, 11, 'return', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('SchedulerConfig constructor call', () => {
            expectToken(result, 125, 12, 27, 'SchedulerConfig', ['source.jac', 'meta.function-call.jac', 'meta.function-call.generic.jac']);
        });
    });

    describe('impl PendingAnalysis.postinit (lines 129-133)', () => {
        test('impl keyword', () => {
            // impl PendingAnalysis.postinit -> None {
            expectToken(result, 129, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('PendingAnalysis class name', () => {
            expectToken(result, 129, 6, 21, 'PendingAnalysis', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('postinit method name', () => {
            expectToken(result, 129, 22, 30, 'postinit', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('None return type in impl', () => {
            expectToken(result, 129, 34, 38, 'None', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });

        test('if keyword', () => {
            // if self.timestamp == 0 {
            expectToken(result, 130, 5, 7, 'if', ['source.jac', 'keyword.control.flow.jac']);
        });

        test('self keyword', () => {
            expectToken(result, 130, 8, 12, 'self', ['source.jac', 'variable.language.special.self.jac']);
        });

        test('equality comparison operator', () => {
            expectToken(result, 130, 23, 25, '==', ['source.jac', 'keyword.operator.comparison.jac']);
        });

        test('numeric literal 0 in condition', () => {
            expectToken(result, 130, 26, 27, '0', ['source.jac', 'constant.numeric.dec.jac']);
        });

        test('self in assignment', () => {
            // self.timestamp = time.time();
            expectToken(result, 131, 9, 13, 'self', ['source.jac', 'variable.language.special.self.jac']);
        });

        test('assignment operator', () => {
            expectToken(result, 131, 24, 25, '=', ['source.jac', 'keyword.operator.assignment.jac']);
        });

        test('time function call', () => {
            expectToken(result, 131, 31, 35, 'time', ['source.jac', 'meta.function-call.jac', 'meta.function-call.generic.jac']);
        });
    });

    describe('Error recovery: incomplete sem followed by impl (lines 135-136)', () => {
        test('sem keyword in incomplete statement', () => {
            // sem word.cost =
            expectToken(result, 135, 1, 4, 'sem', ['source.jac', 'meta.semstring.jac', 'storage.type.semstring.jac']);
        });

        test('impl keyword after incomplete sem recovers correctly', () => {
            // impl semantic{}
            expectToken(result, 136, 1, 5, 'impl', ['source.jac', 'meta.class.jac', 'storage.type.class.jac']);
        });

        test('semantic function name after impl', () => {
            // impl semantic{}
            expectToken(result, 136, 6, 14, 'semantic', ['source.jac', 'meta.class.jac', 'entity.name.function.jac']);
        });
    });

    describe('check is no longer a keyword', () => {
        test('check used as identifier', () => {
            expectToken(result, 138, 1, 7, 'check', ['source.jac']);
        });
    });
});