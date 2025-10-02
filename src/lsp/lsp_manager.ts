// lsp/manager.ts
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import type { EnvManager } from '../environment/manager';

export class LspManager {
    private client: LanguageClient | undefined;
    private envManager: EnvManager;

    constructor(envManager: EnvManager) {
        this.envManager = envManager;
    }

    public async start(): Promise<void> {
        if (this.client) {
            vscode.window.showWarningMessage("LSP client already running. Restart instead.");
            return;
        }

        const jacPath = this.envManager.getJacPath();

        const serverOptions: ServerOptions = {
            run: { command: jacPath, args: ['lsp'] },
            debug: { command: jacPath, args: ['lsp'] }
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: 'file', language: 'jac' }],
        };

        // Use a unique client ID to prevent conflicts with previous instances
        const clientId = `jacLanguageServer-${Date.now()}`;
        this.client = new LanguageClient(
            clientId,
            'Jac Language Server',
            serverOptions,
            clientOptions
        );

        await this.client.start();
        vscode.window.showInformationMessage('Jac Language Server started!');
    }

    public async stop(): Promise<void> {
        if (this.client) {
            try {
                // Properly dispose of the client to clean up output channels
                await this.client.stop();
                this.client.dispose();
            } catch (error) {
                console.warn('Error stopping LSP client:', error);
            } finally {
                this.client = undefined;
            }
            vscode.window.showInformationMessage("Jac Language Server stopped.");
        }
    }

    public async restart(): Promise<void> {
        try {
            await this.stop();
            // Small delay to ensure proper cleanup before restarting
            await new Promise(resolve => setTimeout(resolve, 500));
            await this.start();
            vscode.window.showInformationMessage('Jac Language Server restarted successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to restart Jac Language Server: ${error}`);
            throw error;
        }
    }

    public getClient(): LanguageClient | undefined {
        return this.client;
    }
}
