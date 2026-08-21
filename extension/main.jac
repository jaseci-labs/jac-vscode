"""Extension entry point (port of src/extension.ts).

activate(): wire the env manager, register commands, initialize the
environment (unless syntaxHighlightingOnly), then start the LSP when a
valid jac binary exists. deactivate(): stop the LSP.
"""
import from "vscode" { workspace }
import from .env_detect { validate_jac_executable }
import from .env_manager { env_manager }
import from .lsp_client { lsp }
import from .commands { register_all_commands }
import from .visual_debugger { setup_visual_debugger_webview }

def is_syntax_highlighting_only -> bool {
    config = workspace.getConfiguration("jaclang-extension");
    # config["get"]: WorkspaceConfiguration is a frozen plain object; subscript-call bypasses the runtime's Python-method dispatch.
    return bool(config["get"]("syntaxHighlightingOnly", False));
}

async def:pub activate(context: any) -> any {
    env_manager.attach(context);
    lsp.env = env_manager;
    register_all_commands(context);
    setup_visual_debugger_webview(context);

    highlight_only = is_syntax_highlighting_only();
    if not highlight_only {
        await env_manager.init();
        jac_path = env_manager.get_jac_path();
        if await validate_jac_executable(jac_path) {
            try {
                await lsp.start();
            } except Exception as e {
                print(f"LSP failed to start during activation: {e}");
            }
        }
    }

    return {
        "getEnvManager": lambda -> any { return env_manager; },
        "getLspManager": lambda -> any { return lsp; }
    };
}

async def:pub deactivate -> None {
    await lsp.stop();
}
