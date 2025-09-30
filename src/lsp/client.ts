import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions
} from 'vscode-languageclient/node';

export let client: LanguageClient;

export async function setupLspClient(envManager: { getJacPath(): string; promptEnvironmentSelection(): Promise<void>;}) {
    const jacPath = envManager.getJacPath();
    
    // Check if developer mode is enabled
    const config = vscode.workspace.getConfiguration('jaclang-extension');
    const isDeveloperMode = config.get<boolean>('developerMode', false);
    
    // Use lsp_dev command if developer mode is enabled, otherwise use lsp
    const lspCommand = isDeveloperMode ? 'lsp_dev' : 'lsp';
    
    const serverOptions: ServerOptions = {
        run: { command: jacPath, args: [lspCommand] },
        debug: { command: jacPath, args: [lspCommand] }
    };
    
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'jac' }],
    };
    
    const serverName = isDeveloperMode ? 'Jac Language Server (Dev Mode)' : 'Jac Language Server';
    const clientName = isDeveloperMode ? 'JacLanguageServer-Dev' : 'JacLanguageServer';
    
    client = new LanguageClient(
        clientName,
        serverName,
        serverOptions,
        clientOptions
    );
    
    await client.start();
    
    const message = isDeveloperMode 
        ? 'Jac Language Server (Dev Mode) started!' 
        : 'Jac Language Server started!';
    vscode.window.showInformationMessage(message);
    
    return client;
}

export function stopLspClient(): Thenable<void> | undefined {
    if (!client) return undefined;
    return client.stop();
}
