import * as vscode from "vscode";
import { EnvManager } from "./environment/manager";
import { registerAllCommands } from "./commands";
import { setupVisualDebuggerWebview } from "./webview/visualDebugger";
import { LspManager } from "./lsp/lsp_manager";
import { validateJacExecutable } from "./utils/envDetection";

let lspManager: LspManager | undefined;
let envManager: EnvManager | undefined;

export function getLspManager(): LspManager | undefined {
  return lspManager;
}

export function getEnvManager(): EnvManager | undefined {
    return envManager;
}

// Create and start LSP Manager if not already running
export async function createAndStartLsp(
  envManager: EnvManager,
  context: vscode.ExtensionContext
): Promise<void> {
  if (!lspManager) {
    try {
      lspManager = new LspManager(envManager);
      await lspManager.start();
      context.subscriptions.push({ dispose: () => lspManager?.stop() });
    } catch (error) {
      lspManager = undefined;
      throw error;
    }
  }
}

export async function activate(context: vscode.ExtensionContext) {
  try {
    const envManager = new EnvManager(context);
    registerAllCommands(context, envManager);
    await envManager.init();

    setupVisualDebuggerWebview(context);

    const jacPath = envManager.getJacPath();
    const isJacAvailable = await validateJacExecutable(jacPath); // Check if Jac is available before starting LSP

    if (isJacAvailable) {
      try {
        await createAndStartLsp(envManager, context);
      } catch (error) {
        console.error("LSP failed to start during activation:", error);
      }
    }

    return {
        getEnvManager: () => envManager,
        getLspManager: () => lspManager
    };
  } catch (error) {
    console.error("Extension activation error:", error);
  }
}

export function deactivate(): Thenable<void> | undefined {
  return lspManager?.stop();
}