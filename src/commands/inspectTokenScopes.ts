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
 * Tokenize content using a TextMate grammar.
 *
 * @param scopeName  Top-level scope of the grammar (e.g. 'source.jac', 'source.jactoml').
 *                   Defaults to 'source.jac' for backwards compatibility.
 */
export async function tokenizeContent(
    content: string,
    grammarPath: string,
    wasmPath: string,
    scopeName: string = 'source.jac'
): Promise<TokenizeResult> {
    await initOnigurumaWithPath(wasmPath);

    const grammarData = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
    const registry = new vsctm.Registry({
        onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
        loadGrammar: async (requested) => requested === scopeName ? grammarData : null,
    });

    const grammar = await registry.loadGrammar(scopeName);
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

/** Per-language grammar info for the inspector. */
interface InspectableLanguage {
    grammarFile: string;
    scopeName: string;
}

const INSPECTABLE_LANGUAGES: Record<string, InspectableLanguage> = {
    jac:     { grammarFile: 'jac.tmLanguage.json',     scopeName: 'source.jac' },
    jactoml: { grammarFile: 'jactoml.tmLanguage.json', scopeName: 'source.jactoml' },
};

/**
 * Handler for the Inspect Token Scopes command.
 * Dumps all TextMate token scopes for the current Jac or Jac TOML file.
 */
export async function inspectTokenScopesHandler(context: vscode.ExtensionContext): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor. Please open a Jac or jac.toml file first.');
        return;
    }

    const langId = editor.document.languageId;
    const lang = INSPECTABLE_LANGUAGES[langId];
    if (!lang) {
        vscode.window.showErrorMessage(
            `This command only works with Jac (.jac) or Jac TOML (jac.toml) files. Current language: ${langId}.`
        );
        return;
    }

    const outputChannel = vscode.window.createOutputChannel('Jac Token Scopes');
    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine(`Token Scopes for: ${editor.document.fileName}`);
    outputChannel.appendLine(`Language:         ${langId}  (scope ${lang.scopeName})`);
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('');

    try {
        const wasmPath = path.join(context.extensionPath, 'vendor', 'onig.wasm');
        if (!fs.existsSync(wasmPath)) {
            throw new Error(
                `onig.wasm not found at ${wasmPath}. ` +
                `Run "npm run copy-wasm" (or "npm run compile") before launching the extension.`
            );
        }

        const grammarPath = path.join(context.extensionPath, 'syntaxes', lang.grammarFile);
        const text = editor.document.getText();

        const { tokens } = await tokenizeContent(text, grammarPath, wasmPath, lang.scopeName);

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
