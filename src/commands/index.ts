import * as vscode from 'vscode';
import { runJacCommandForCurrentFile } from '../utils';
import { COMMANDS } from '../constants';
import { getLspManager } from '../extension';

export function registerAllCommands(context: vscode.ExtensionContext, envManager: any) {
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.SELECT_ENV, () => {
            envManager.promptEnvironmentSelection();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.REFRESH_ENV, () => {
            envManager.refreshEnvironments();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.RUN_FILE, () => {
            runJacCommandForCurrentFile('run', envManager);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.CHECK_FILE, () => {
            runJacCommandForCurrentFile('check', envManager);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.SERVE_FILE, () => {
            runJacCommandForCurrentFile('serve', envManager);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.jaclang-extension.getJacPath', config => {
            // Use envManager to get the selected jac path
            return envManager.getJacPath();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.TOGGLE_DEV_MODE, async () => {
            const config = vscode.workspace.getConfiguration('jaclang-extension');
            const currentMode = config.get<boolean>('developerMode', false);
            
            // Toggle the mode
            await config.update('developerMode', !currentMode, vscode.ConfigurationTarget.Global);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.RESTART_LSP, async () => {
            const lspManager = getLspManager();
            if (lspManager) {
                try {
                    vscode.window.showInformationMessage('Restarting Jac Language Server...');
                    await lspManager.restart();
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Failed to restart Jac Language Server: ${error.message || error}`);
                }
            } else {
                vscode.window.showErrorMessage('Language Server not available for restart.');
            }
        })
    );
}
