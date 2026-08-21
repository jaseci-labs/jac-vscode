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
