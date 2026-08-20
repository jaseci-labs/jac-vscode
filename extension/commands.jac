"""Command registration (port of src/commands/index.ts)."""
import from "vscode" {
    window, workspace, commands, languages, debug,
    WorkspaceEdit, TextEdit, Range, Position,
    ConfigurationTarget, DiagnosticSeverity
}
import from .constants {
    CMD_RUN_FILE, CMD_SERVE_FILE, CMD_DEBUG_FILE, CMD_SELECT_ENV,
    CMD_TOGGLE_DEV_MODE, CMD_RESTART_LSP, CMD_GET_JAC_PATH,
    CMD_GET_PYTHON_PATH, CMD_VISUALIZE, CMD_LINTFIX_FORMAT,
    CMD_INSPECT_SCOPES
}
import from .jac_runner { run_jac_command_for_current_file }
import from .env_manager { env_manager }
import from .lsp_client { lsp }
import from .token_inspector { inspect_token_scopes_handler }

async def debug_current_file -> None {
    editor = window.activeTextEditor;
    if (not editor) or editor.document.languageId != "jac" {
        window.showErrorMessage("Please open a Jac file to debug.");
        return;
    }
    await commands.executeCommand(CMD_VISUALIZE);
    await debug.startDebugging(
        workspace.getWorkspaceFolder(editor.document.uri),
        {
            "type": "debugpy",
            "request": "launch",
            "name": "Jac: Debug Current File",
            "python": env_manager.get_python_path(),
            "program": env_manager.get_jac_path(),
            "args": ["run", editor.document.uri.fsPath],
            "console": "integratedTerminal",
            "justMyCode": True
        }
    );
}

async def toggle_developer_mode -> None {
    config = workspace.getConfiguration("jaclang-extension");
    # config["get"]/["update"]: subscript-call bypasses the runtime's Python-method dispatch.
    current = config["get"]("developerMode", False);
    await config["update"]("developerMode", not current, ConfigurationTarget.Global);
}

async def restart_lsp_command -> None {
    if lsp.get_client() {
        try {
            window.showInformationMessage("Restarting Jac Language Server...");
            await lsp.restart();
        } except Exception as e {
            window.showErrorMessage(f"Failed to restart Jac Language Server: {e}");
        }
    } else {
        window.showErrorMessage("Language Server not available for restart.");
    }
}

"""Send jac/lintfixFormat to the LSP and apply the returned edits."""
async def lintfix_format -> None {
    editor = window.activeTextEditor;
    if (not editor) or editor.document.languageId != "jac" {
        return;
    }
    diagnostics: any = languages.getDiagnostics(editor.document.uri);
    for d in diagnostics {
        if d.severity == DiagnosticSeverity.Error {
            window.showErrorMessage("Lintfix did not run: fix syntax errors in the file first.");
            return;
        }
    }
    client = lsp.get_client();
    if not client {
        window.showErrorMessage("Jac Language Server is not running.");
        return;
    }
    edits: any = await client.sendRequest(
        "jac/lintfixFormat",
        {"textDocument": {"uri": editor.document.uri.toString()}}
    );
    if edits and len(edits) > 0 {
        ws_edit = WorkspaceEdit();
        converted: list = [];
        for e in edits {
            converted.append(
                TextEdit(
                    Range(
                        Position(e.range.start.line, e.range.start.character),
                        Position(e.range.end.line, e.range.end.character)
                    ),
                    e.newText
                )
            );
        }
        ws_edit.set(editor.document.uri, converted);
        await workspace.applyEdit(ws_edit);
    }
}

def:pub register_all_commands(context: any) -> None {
    subs: any = context.subscriptions;
    subs.push(commands.registerCommand(CMD_SELECT_ENV, lambda {
        env_manager.prompt_environment_selection();
    }));
    subs.push(commands.registerCommand(CMD_RUN_FILE, lambda {
        run_jac_command_for_current_file("run", env_manager.get_jac_path());
    }));
    subs.push(commands.registerCommand(CMD_SERVE_FILE, lambda {
        run_jac_command_for_current_file("serve", env_manager.get_jac_path());
    }));
    subs.push(commands.registerCommand(CMD_DEBUG_FILE, debug_current_file));
    subs.push(commands.registerCommand(CMD_GET_JAC_PATH, lambda -> str {
        return env_manager.get_jac_path();
    }));
    subs.push(commands.registerCommand(CMD_GET_PYTHON_PATH, lambda -> str {
        return env_manager.get_python_path();
    }));
    subs.push(commands.registerCommand(CMD_TOGGLE_DEV_MODE, toggle_developer_mode));
    subs.push(commands.registerCommand(CMD_RESTART_LSP, restart_lsp_command));
    subs.push(commands.registerCommand(CMD_LINTFIX_FORMAT, lintfix_format));
    subs.push(commands.registerCommand(CMD_INSPECT_SCOPES, lambda {
        inspect_token_scopes_handler(context);
    }));
}
