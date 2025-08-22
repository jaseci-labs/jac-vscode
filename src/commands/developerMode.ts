import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { stopLspClient, setupLspClient } from '../lsp/client';

export function registerDeveloperModeCommand(
    context: vscode.ExtensionContext,
    envManager: any
) {
    const toggleDeveloperMode = vscode.commands.registerCommand(
        COMMANDS.TOGGLE_DEV_MODE,
        async () => {
            const config = vscode.workspace.getConfiguration('jaclang-extension');
            const currentMode = config.get<boolean>('developerMode', false);
            
            // Toggle the mode
            await config.update('developerMode', !currentMode, vscode.ConfigurationTarget.Global);
            
            // Show confirmation message
            const newMode = !currentMode ? 'Developer Mode (V2)' : 'Production Mode (V1)';
            const action = await vscode.window.showInformationMessage(
                `Switched to ${newMode}. Restart Language Server?`,
                'Restart',
                'Later'
            );
            
            if (action === 'Restart') {
                // Stop current LSP client
                await stopLspClient();
                
                // Start new LSP client with updated mode
                const newClient = setupLspClient(envManager);
                context.subscriptions.push(newClient);
            }
        }
    );
    
    context.subscriptions.push(toggleDeveloperMode);
}
