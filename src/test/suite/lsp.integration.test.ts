/**
 * JAC Language Extension - LSP Integration Test Suite
 *
 * Tests Language Server Protocol (LSP) specific functionality:
 *
 * Test Group 1: LSP Initialization and Startup
 *   - LSP manager availability
 *   - Output channel creation and logging
 *
 * Test Group 2: LSP Features (Code Intelligence)
 *   - Diagnostics: Error/warning detection for invalid JAC syntax
 *   - Hover: Hover information display for node definitions
 */

import * as vscode from 'vscode';
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileExists } from './testUtils';

describe('LSP Integration Tests - Language Server Protocol', () => {
    let workspacePath: string;
    let lspManager: any;
    let envManager: any;

    before(() => {
        // Resolve workspace path from VS Code workspace folders
        const folders = vscode.workspace.workspaceFolders;
        expect(folders).to.exist;
        expect(folders?.length).to.be.greaterThan(0);
        workspacePath = folders![0].uri.fsPath;
    });

    /**
     * Test Group 1: LSP Initialization and Startup
     *
     * Tests that LSP starts correctly when jac environment is available
     * and provides access to the output channel.
     */
    describe('Test Group 1: LSP Initialization and Startup', () => {
        before(async () => {
            // Get extension and managers (extension already activated in environment tests)
            const ext = vscode.extensions.getExtension('jaseci-labs.jaclang-extension');
            const exports = ext!.exports;
            envManager = exports?.getEnvManager?.();
            lspManager = exports?.getLspManager?.();
            expect(envManager, 'EnvManager should be exposed').to.exist;
        });

        afterEach(async () => {
            // Clean up any open editors between tests
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        it('should have LSP manager available when environment is valid', async function () {
            this.timeout(15_000);

            // LSP manager should be available (single phase check)
            expect(lspManager).to.exist;
        });

        it('should create and display LSP output channel', async function () {
            this.timeout(10_000);

            // Get the LSP client which uses the output channel
            const client = lspManager?.getClient?.();
            expect(client).to.exist;

            // Verify LSP infrastructure is initialized
            // Output channel is created in lsp_manager.ts during start()
            expect(client?.outputChannel).to.exist;
            expect(client?.outputChannel?.name).to.include('Jac Language Server');
        });
    });

    /**
     * Test Group 2: LSP Features (Code Intelligence)
     *
     * Tests LSP-specific code intelligence features:
     * - Diagnostics detection
     * - Hover information
     */
    describe('Test Group 2: LSP Features (Code Intelligence)', () => {
        let testJacFile: string;

        before(async function () {
            this.timeout(40000);
            // Create a test JAC file with INVALID syntax for LSP to catch errors
            testJacFile = path.join(workspacePath, 'syntax.jac');

            const jacCode = `node Bus{
    has bus_type: str:
    has bus_id: str:
}`;
            await fs.writeFile(testJacFile, jacCode);

            // Give LSP extra time to fully initialize before diagnostics/hover tests
            // LSP needs time to analyze the workspace after environment is set
            await new Promise(resolve => setTimeout(resolve, 20000));
        });

        afterEach(async () => {
            // Close all editors between tests
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        after(async () => {
            // Clean up test files created by this test group
            const testFiles = [
                path.join(workspacePath, 'syntax.jac'),
                path.join(workspacePath, 'hover.jac')
            ];

            for (const filePath of testFiles) {
                try {
                    const exists = await fileExists(filePath);
                    if (exists) {
                        await fs.unlink(filePath);
                    }
                } catch (error) {
                    // File might already be deleted, that's fine
                }
            }
        });

        it('should detect syntax errors in JAC files via LSP diagnostics', async function () {
            this.timeout(60_000);

            // Open the test file with invalid syntax (uses : instead of ;)
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(testJacFile));
            await vscode.window.showTextDocument(doc);

            // Wait for LSP to analyze the file and report diagnostics (longer wait for CI)
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Get diagnostics for the file
            const diagnostics = vscode.languages.getDiagnostics(doc.uri);
            console.log('Diagnostics:', diagnostics);
            console.log('Diagnostics count:', diagnostics.length);

            // Should detect syntax errors (colons instead of semicolons)
            expect(diagnostics.length).to.be.greaterThan(0);

            // Verify at least one error is reported
            const hasErrors = diagnostics.some(d => d.severity === vscode.DiagnosticSeverity.Error);
            expect(hasErrors).to.be.true;
        });

        it('should provide hover information for node definitions', async function () {
            this.timeout(60_000);
            const file = path.join(workspacePath, 'hover.jac');
            await fs.writeFile(file, `node Bus {}`);

            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
            await vscode.window.showTextDocument(doc);

            // Wait for language server to fully initialize and index the document
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Position inside "Bus" - the "u" character
            const position = new vscode.Position(0, 6);

            // Query hover provider
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                doc.uri,
                position
            );

            // Debug: log what we got
            console.log('Hovers received:', hovers);

            // Assertions
            expect(hovers).to.exist;
            expect(hovers?.length).to.be.greaterThan(0);

            const content = hovers![0].contents
                .map(c => typeof c === 'string' ? c : c.value)
                .join('\n');

            console.log('Hover content:', content);
            expect(content).to.include('Bus');

            // Cleanup
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            await fs.unlink(file);
        });

        it('should not break LSP when developer mode settings change', async function () {
            this.timeout(30_000);

            // Verify LSP is running before toggling
            const client = lspManager?.getClient?.();
            expect(client?.isRunning?.()).to.be.true;

            // Get current development settings
            const config = vscode.workspace.getConfiguration('jaclang-extension');
            const currentDevMode = config.get<boolean>('developerMode', false);

            // Toggle developer mode
            await config.update('developerMode', !currentDevMode, vscode.ConfigurationTarget.Global);

            // Wait for any potential LSP side effects
            await new Promise(resolve => setTimeout(resolve, 2000));

            // LSP should remain running after toggling developer mode
            expect(client?.isRunning?.()).to.be.true;
            expect(client?.outputChannel).to.exist;
            expect(client?.outputChannel?.name).to.include('Jac Language Server');

            // Restore original setting
            await config.update('developerMode', currentDevMode, vscode.ConfigurationTarget.Global);
        });
    });

});
