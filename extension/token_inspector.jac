"""TextMate token-scope inspector (port of src/commands/inspectTokenScopes.ts).

Dev-mode tool: tokenizes the active Jac / jac.toml file with the shipped
TextMate grammars (vscode-textmate + the oniguruma WASM engine) and dumps
every token's scopes to the "Jac Token Scopes" output channel.
"""
import from "vscode" { window }
import from "vscode-textmate" { Registry, INITIAL }
import from "vscode-oniguruma" { loadWASM, OnigScanner, OnigString }
import from "node:fs" { readFileSync, existsSync }
import from "node:path" { join }

glob _state: dict = {"oniguruma_ready": False};

async def init_oniguruma(wasm_path: str) -> None {
    if _state["oniguruma_ready"] {
        return;
    }
    wasm: any = readFileSync(wasm_path);
    await loadWASM(wasm.buffer);
    _state["oniguruma_ready"] = True;
}

def create_onig_scanner(patterns: any) -> any {
    return OnigScanner(patterns);
}

def create_onig_string(s: str) -> any {
    return OnigString(s);
}

obj GrammarSource {
    has scope_name: str,
        grammar_data: any;

    async def load(requested: str) -> any {
        return self.grammar_data if requested == self.scope_name else None;
    }
}

"""Tokenize content with a TextMate grammar; returns a list of
{text, line, startCol, endCol, scopes} dicts (1-based positions)."""
async def:pub tokenize_content(
    content: str, grammar_path: str, wasm_path: str, scope_name: str = "source.jac"
) -> list {
    await init_oniguruma(wasm_path);
    source = GrammarSource(
        scope_name=scope_name,
        grammar_data=JSON.parse(str(readFileSync(grammar_path, "utf-8")))
    );
    registry = Registry({
        "onigLib": Promise.resolve({
            "createOnigScanner": create_onig_scanner,
            "createOnigString": create_onig_string
        }),
        "loadGrammar": lambda (requested: str) -> any {
            return source.load(requested);
        }
    });
    grammar: any = await registry.loadGrammar(scope_name);
    if not grammar {
        raise Exception("Failed to load grammar");
    }
    tokens: list = [];
    rule_stack: any = INITIAL;
    for (line_index, line) in enumerate(content.split("\n")) {
        line_tokens: any = grammar.tokenizeLine(line, rule_stack);
        for token in line_tokens.tokens {
            text: str = line[int(token.startIndex):int(token.endIndex)];
            if not text.strip() {
                continue;
            }
            tokens.append({
                "text": text,
                "line": line_index + 1,
                "startCol": int(token.startIndex) + 1,
                "endCol": int(token.endIndex) + 1,
                "scopes": token.scopes
            });
        }
        rule_stack = line_tokens.ruleStack;
    }
    return tokens;
}

glob INSPECTABLE: dict = {
    "jac": {"grammarFile": "jac.tmLanguage.json", "scopeName": "source.jac"},
    "jactoml": {"grammarFile": "jactoml.tmLanguage.json", "scopeName": "source.jactoml"}
};

async def:pub inspect_token_scopes_handler(context: any) -> None {
    editor = window.activeTextEditor;
    if not editor {
        window.showErrorMessage("No active editor. Please open a Jac or jac.toml file first.");
        return;
    }
    lang_id: str = str(editor.document.languageId);
    lang: any = INSPECTABLE[lang_id];
    if not lang {
        window.showErrorMessage(
            f"This command only works with Jac (.jac) or Jac TOML (jac.toml) files. Current language: {lang_id}."
        );
        return;
    }
    channel = window.createOutputChannel("Jac Token Scopes");
    # channel["clear"]: OutputChannel is a plain object in the extension host,
    # and `clear` collides with Python's dict.clear -- attribute-call form
    # would let the runtime's poly dispatcher WIPE the object's properties.
    # Subscript-call emits a direct JS call. (Same pattern for get/update/sort
    # on other untyped host objects across this codebase.)
    channel["clear"]();
    channel.show(True);
    channel.appendLine(f"Token Scopes for: {editor.document.fileName}");
    channel.appendLine(f"Language:         {lang_id}  (scope {lang['scopeName']})");
    channel.appendLine("=" * 80);
    channel.appendLine("");
    try {
        extension_path: str = str(context.extensionPath);
        wasm_path = join(extension_path, "vendor", "onig.wasm");
        if not existsSync(wasm_path) {
            raise Exception(f"onig.wasm not found at {wasm_path}.");
        }
        grammar_path = join(extension_path, "syntaxes", str(lang["grammarFile"]));
        text: str = str(editor.document.getText());
        tokens = await tokenize_content(text, grammar_path, wasm_path, str(lang["scopeName"]));
        for token in tokens {
            channel.appendLine(f"{token['text']}: {token['line']}:{token['startCol']}-{token['endCol']}");
            scopes_str = ", ".join([str(s) for s in token["scopes"]]);
            channel.appendLine(f"  scopes: {scopes_str}");
        }
        channel.appendLine("\n--- Source Code ---");
        channel.appendLine(text);
    } except Exception as e {
        channel.appendLine(f"Error: {e}");
    }
    window.showInformationMessage('Token scopes printed to "Jac Token Scopes" output channel.');
}
