"""LSP client manager (port of src/lsp/lsp_manager.ts).

Wraps vscode-languageclient's LanguageClient around `<jac> lsp` (stdio).
A single module-level instance is shared; main.jac wires `env` to the
EnvManager at activation.
"""
import from "vscode" { window }
# Deep import: the package root node.d.ts is a bare `export * from` chain,
# which jaclang's d.ts parser does not follow yet (upstream issue pending);
# lib/node/main.d.ts declares LanguageClient directly, so typing (and `new`
# emission) works. Same runtime module either way.
import from "vscode-languageclient/lib/node/main" { LanguageClient }
import from "node:process" { env as node_env }

obj LspManager {
    has env: any = None,
        client: any = None,
        output_channel: any = None;

    async def start -> None {
        if node_env.JAC_SMOKE_DISABLE_LSP {
            return;
        }
        if self.client {
            window.showWarningMessage("LSP client already running. Restart instead.");
            return;
        }
        jac_path: str = self.env.get_jac_path() if self.env else "jac";
        server_options = {
            "run": {"command": jac_path, "args": ["lsp"]},
            "debug": {"command": jac_path, "args": ["lsp"]}
        };
        self.output_channel = window.createOutputChannel("Jac Language Server");
        client_options = {
            "documentSelector": [{"scheme": "file", "language": "jac"}],
            "outputChannel": self.output_channel
        };
        self.client = LanguageClient(
            "jacLanguageServer", "Jac Language Server", server_options, client_options
        );
        await self.client.start();
        window.showInformationMessage("Jac Language Server started!");
    }

    async def stop -> None {
        if self.client {
            try {
                await self.client.stop();
                self.client.dispose();
            } except Exception {
            }
            self.client = None;
            if self.output_channel {
                self.output_channel.dispose();
                self.output_channel = None;
            }
        }
    }

    async def restart -> None {
        await self.stop();
        await self.start();
    }

    """Start if not running, else restart -- used after env changes."""
    async def ensure_started -> None {
        if self.client {
            await self.restart();
        } else {
            await self.start();
        }
    }

    def get_client -> any {
        return self.client;
    }
}

glob:pub lsp: LspManager = LspManager();
