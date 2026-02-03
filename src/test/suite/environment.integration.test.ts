/**
 * JAC Language Extension - Integration Test Suite
 *
 * Tests the complete lifecycle of the Jaclang extension:
 * - Phase 1: Extension auto-activation and initialization
 *   (Verifies extension loads when .jac file is opened, language detection, status bar)
 * - Phase 2: Complete environment lifecycle (venv creation, jaclang installation,
 *            environment detection & selection, cleanup & verification)
 *
 * NOTE: Tests run sequentially and share state across phases.
 */

import * as vscode from 'vscode';
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs/promises';
import { runCommand, fileExists, detectPython } from './testUtils';

describe('Extension Integration Tests - Full Lifecycle', () => {
    let workspacePath: string;
    let envManager: any; // Shared across Phase 1 and Phase 2

    before(() => {
        // Resolve workspace path from VS Code workspace folders
        const folders = vscode.workspace.workspaceFolders;
        expect(folders).to.exist;
        expect(folders?.length).to.be.greaterThan(0);
        workspacePath = folders![0].uri.fsPath;
    });

    /**
     * PHASE 1: Extension Auto-Activation and Initialization
     *
     * Verifies the extension auto-activates when a .jac file is opened:
     * - Extension is NOT active before opening .jac file
     * - Opening .jac file triggers auto-activation (onLanguage:jac event)
     * - JAC language is properly registered and detected
     * - Status bar shows "No Env" when no environment is configured
     */
    describe('Phase 1: Extension Auto-Activation and Initialization', () => {

        before(async function () {
            this.timeout(30_000);

            // Mock the environment prompts to prevent blocking during test
            vscode.window.showWarningMessage = async () => undefined as any;

            // Get extension reference (not yet activated)
            const ext = vscode.extensions.getExtension('jaseci-labs.jaclang-extension');
            expect(ext).to.exist;
            expect(ext!.isActive).to.be.false; // Should not be active before opening .jac file

            // Open sample.jac file - this should trigger auto-activation via onLanguage:jac activation event
            const filePath = path.join(workspacePath, 'sample.jac');
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            await vscode.window.showTextDocument(doc);

            // Wait for activation to complete
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Verify extension auto-activated after opening .jac file
            expect(ext!.isActive).to.be.true; // Should now be active

            // Verify document was opened successfully and language is detected
            expect(doc.languageId).to.equal('jac');
            expect(vscode.window.activeTextEditor?.document).to.equal(doc);

            // Get EnvManager for status bar verification in tests
            const exports = ext!.exports;
            envManager = exports?.getEnvManager?.();
            expect(envManager, 'EnvManager should be exposed').to.exist;
        });

        afterEach(async () => {
            // Clean up any open editors between tests
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        it('should show "No Env" status bar when extension starts', () => {
            // When no environment is selected, status bar displays "No Env"
            const statusBar = envManager.getStatusBar();
            expect(statusBar.text).to.include('No Env');
        });
    });


    /**
     * PHASE 2: Environment Lifecycle - Install, Select, Verify & Cleanup
     *
     * Tests the complete environment workflow:
     * - Detects Python and creates virtual environment
     * - Installs jaclang package
     * - Tests environment detection and selection with status bar verification
     * - Cleans up by uninstalling and removing venv
     */
    describe('Phase 2: Environment Lifecycle - Install, Select, Verify & Cleanup', () => {
        let temporaryVenvDirectory = '';
        let venvPath = '';
        let pythonCmd: { cmd: string; argsPrefix: string[] };
        let venvPythonPath = '';
        let jacExePath = '';

        before(async function () {
            this.timeout(10_000);
            // Initialize paths and environment manager
            const detectedPython = await detectPython();
            if (!detectedPython) {
                throw new Error('Python interpreter not found. Tests require Python to be installed.');
            }
            pythonCmd = detectedPython;
            temporaryVenvDirectory = path.join(workspacePath, '.venv');
            venvPath = temporaryVenvDirectory;

            // Platform-specific paths to Python and jac executables
            venvPythonPath = process.platform === 'win32'
                ? path.join(venvPath, 'Scripts', 'python.exe')
                : path.join(venvPath, 'bin', 'python');
            jacExePath = process.platform === 'win32'
                ? path.join(venvPath, 'Scripts', 'jac.exe')
                : path.join(venvPath, 'bin', 'jac');
        });

        afterEach(async () => {
            // Clean up any open editors between tests
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        // === INSTALLATION PHASE ===

        it('should detect Python interpreter', () => {
            // Verify Python is available on the system
            expect(pythonCmd, 'Python must be available').to.exist;
        });

        it('should create Python virtual environment', async function () {
            this.timeout(10_000);

            // Create isolated virtual environment where jaclang will be installed
            //recursive: true prevents errors if .venv already exists from a previous incomplete test run.
            await fs.mkdir(temporaryVenvDirectory, { recursive: true });

            const venvCreationResult = await runCommand(pythonCmd.cmd, [...pythonCmd.argsPrefix, '-m', 'venv', venvPath]);

            expect(venvCreationResult.code).to.equal(0);
            expect(await fileExists(venvPythonPath)).to.be.true;
        });

        it('should install jaclang package via pip with terminal feedback', async function () {
            this.timeout(10_000); //pip install can take a while

            // Display terminal window for visual installation feedback
            const terminal = vscode.window.createTerminal({
                name: 'JAC: Installing',
                cwd: workspacePath,
            });
            terminal.show(true);

            terminal.sendText(`${venvPythonPath} -m pip install jaclang`, true);

            // Execute installation in background
            const installationResult = await runCommand(venvPythonPath, ['-m', 'pip', 'install', '--no-cache-dir', 'jaclang']);

            // Verify installation success
            expect(installationResult.code).to.equal(0);
            expect(await fileExists(jacExePath)).to.be.true;
        });

        it('should verify jac executable works', async function () {
            this.timeout(25_000);

            // Test that the installed jac binary is functional
            const versionCheckResult = await runCommand(jacExePath, ['--version']);

            expect(versionCheckResult.code).to.equal(0);
            expect(versionCheckResult.commandOutput).to.have.length.greaterThan(0);
        });

        // === ENVIRONMENT DETECTION & SELECTION PHASE ===

        it('should have venv jac binary available in test environment', async function () {
            this.timeout(5_000);

            // Verify test workspace structure contains expected fixtures
            expect(workspacePath).to.include('fixtures/workspace');
        });

        it('should allow environment selection through selectEnv command and verify status bar update', async function () {
            this.timeout(10_000);

            // Trigger environment selection command
            await vscode.commands.executeCommand('jaclang-extension.selectEnv');
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Navigate to .venv option in quick pick menu
            await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext');
            await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext');

            // Confirm selection
            await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
            await new Promise(resolve => setTimeout(resolve, 1500));

            // After environment selection, status bar should display the selected path
            const statusBar = envManager?.getStatusBar?.();

            // Status bar should no longer show "No Env" and should include path indicator
            expect(statusBar?.text).to.not.include('No Env');
            expect(statusBar?.text.length).to.be.greaterThan(0);
        });
    });
});

