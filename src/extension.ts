import * as vscode from 'vscode';
import { setupLspClient, client } from './lsp/client';
import { EnvManager } from './environment/manager';
import { registerAllCommands } from './commands';
import { setupVisualDebuggerWebview } from './webview/visualDebugger';

export async function activate(context: vscode.ExtensionContext) {
    try {
        // Environment manager: handles env detection, selection, status bar
        const envManager = new EnvManager(context);
        await envManager.init();

        registerAllCommands(context, envManager);

        // Visual debugger webview integration
        setupVisualDebuggerWebview(context, envManager);

        // Only start LSP if we have a valid environment
        if (envManager.getJacPath() !== 'jac' && envManager.getJacPath() !== 'jac.exe') {
            const lspClient = await setupLspClient(envManager);
            context.subscriptions.push(lspClient);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to activate Jac extension: ${error}`);
        console.error('Extension activation error:', error);
    }
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

