import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as vsctm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';

// Flag to track if oniguruma has been initialized
let onigurumaInitialized = false;

/** Initialize the oniguruma WASM library (only once per session) */
async function initOnigurumaWithPath(wasmPath: string): Promise<void> {
    if (onigurumaInitialized) return;
    const wasmBin = fs.readFileSync(wasmPath).buffer;
    await oniguruma.loadWASM(wasmBin);
    onigurumaInitialized = true;
}

/** Create an Oniguruma scanner from patterns */
export const createOnigScanner = (patterns: string[]) => new oniguruma.OnigScanner(patterns);

/** Create an Oniguruma string */
export const createOnigString = (s: string) => new oniguruma.OnigString(s);

/** Token with position info */
export interface TokenInfo {
    text: string;
    line: number;
    startCol: number;
    endCol: number;
    scopes: string[];
}

/** Location key format: "line:startCol-endCol" (1-based) */
export type TokenLocation = string;

/** Result of tokenization */
export interface TokenizeResult {
    byLocation: Map<TokenLocation, TokenInfo>;
    tokens: TokenInfo[];
}

/**
 * Tokenize content using the Jac grammar.
 */
export async function tokenizeContent(
    content: string,
    grammarPath: string,
    wasmPath: string
): Promise<TokenizeResult> {
    await initOnigurumaWithPath(wasmPath);

    const grammarData = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
    const registry = new vsctm.Registry({
        onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
        loadGrammar: async (scopeName) => scopeName === 'source.jac' ? grammarData : null,
    });

    const grammar = await registry.loadGrammar('source.jac');
    if (!grammar) throw new Error('Failed to load grammar');

    const byLocation = new Map<TokenLocation, TokenInfo>();
    const tokens: TokenInfo[] = [];
    let ruleStack = vsctm.INITIAL;

    content.split('\n').forEach((line, lineIndex) => {
        const lineNumber = lineIndex + 1;
        const lineTokens = grammar.tokenizeLine(line, ruleStack);

        for (const token of lineTokens.tokens) {
            const text = line.substring(token.startIndex, token.endIndex);
            if (!text.trim()) continue;

            const startCol = token.startIndex + 1;
            const endCol = token.endIndex + 1;
            const tokenInfo: TokenInfo = { text, line: lineNumber, startCol, endCol, scopes: token.scopes };

            byLocation.set(`${lineNumber}:${startCol}-${endCol}`, tokenInfo);
            tokens.push(tokenInfo);
        }
        ruleStack = lineTokens.ruleStack;
    });

    return { byLocation, tokens };
}

/**
 * Handler for the Inspect Token Scopes command.
 * Dumps all TextMate token scopes for the current Jac file.
 */
export async function inspectTokenScopesHandler(context: vscode.ExtensionContext): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor. Please open a Jac file first.');
        return;
    }

    if (editor.document.languageId !== 'jac') {
        vscode.window.showErrorMessage('This command only works with Jac files.');
        return;
    }

    const outputChannel = vscode.window.createOutputChannel('Jac Token Scopes');
    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine(`Token Scopes for: ${editor.document.fileName}`);
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('');

    try {
        const wasmPath = path.join(context.extensionPath, 'vendor', 'onig.wasm');
        const grammarPath = path.join(context.extensionPath, 'syntaxes', 'jac.tmLanguage.json');
        const text = editor.document.getText();

        const { tokens } = await tokenizeContent(text, grammarPath, wasmPath);

        for (const token of tokens) {
            outputChannel.appendLine(`${token.text}: ${token.line}:${token.startCol}-${token.endCol}`);
            outputChannel.appendLine(`  scopes: ${token.scopes.join(', ')}`);
        }

        outputChannel.appendLine('\n--- Source Code ---');
        outputChannel.appendLine(text);
    } catch (error) {
        outputChannel.appendLine(`Error: ${error}`);
        console.error('Token inspection error:', error);
    }

    vscode.window.showInformationMessage('Token scopes printed to "Jac Token Scopes" output channel.');
}
