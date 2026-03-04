/**
 * JAC Language Extension - Integration Test Suite
 *
 * Phase 1: Extension Auto-Activation
 *   - Extension activates when a .jac file is opened
 *   - EnvManager is exposed via extension API
 *   - silentAutoSelect runs on startup (status bar reflects result)
 *
 * Phase 2: Environment Lifecycle
 *   - Python venv creation and jaclang installation
 *   - discoverJacEnvironments finds the workspace venv with type 'workspace'
 *   - getJacVersion reads version from installed package (no subprocess)
 *   - Selecting an environment updates status bar with path and version
 * NOTE: Tests run sequentially and share state across phases.
 */

import * as vscode from 'vscode';
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs/promises';
import { runCommand, fileExists, detectPython } from './testUtils';
import { discoverJacEnvironments } from '../../utils/envDetection';
import { getJacVersion } from '../../utils/envVersion';

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
            this.timeout(30_000);;

            // Get extension reference (not yet activated)
            const ext = vscode.extensions.getExtension('jaseci-labs.jaclang-extension');
            expect(ext).to.exist;
            expect(ext!.isActive).to.be.false; // Should not be active before opening .jac file

            // Open sample.jac file - this should trigger auto-activation via onLanguage:jac activation event
            const filePath = path.join(workspacePath, 'sample.jac');
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            await vscode.window.showTextDocument(doc);

            // Wait for activation to complete
            await new Promise(resolve => setTimeout(resolve, 5_000));

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
     * PHASE 2: Environment Lifecycle - Install, Discover & Select
     *
     * Tests the complete environment workflow:
     * - Detects Python and creates virtual environment in the workspace
     * - Installs jaclang and verifies via dist-info metadata (no subprocess)
     * - discoverJacEnvironments finds the workspace .venv with type 'workspace'
     * - Selecting an environment updates status bar with path and version
     */
    describe('Phase 2: Environment Lifecycle', () => {
        let pythonCmd: { cmd: string; argsPrefix: string[] };
        let venvPath: string;
        let venvPythonPath: string;
        let jacExePath: string;

        before(async function () {
            this.timeout(10_000);
            // Initialize paths and environment manager
            const detectedPython = await detectPython();
            if (!detectedPython) {
                throw new Error('Python interpreter not found. Tests require Python to be installed.');
            }
            pythonCmd = detectedPython;

            // Platform-specific paths to Python and jac executables
            venvPath = path.join(workspacePath, '.venv');
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

            await fs.mkdir(venvPath, { recursive: true });
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
        it('jac installation is detectable via dist-info metadata', async function () {
            this.timeout(5_000);

            const version = await getJacVersion(jacExePath);

            expect(version).to.be.a('string');
            expect(version).to.match(/^\d+\.\d+\.\d+/, 'expected a semver version like 0.7.x');
        });

        // ── Discovery ─────────────────────────────────────────────────────────

        it('discoverJacEnvironments finds the workspace .venv and tags it as type "workspace"', async function () {
            this.timeout(10_000);

            const envs = await discoverJacEnvironments([workspacePath]);
            const workspaceEnv = envs.find(env => env.path === jacExePath);

            expect(workspaceEnv, `Expected ${jacExePath} in discovered environments`).to.exist;
            expect(workspaceEnv!.type).to.equal('workspace');
            // Confirm the discovered path points to a real jac executable on disk
            expect(await fileExists(workspaceEnv!.path)).to.be.true;
            expect(await getJacVersion(workspaceEnv!.path)).to.match(/^\d+\.\d+\.\d+/);
        });

        // ── Selection ─────────────────────────────────────────────────────────

        it('selecting the workspace .venv clears "No Env" from the status bar', async function () {
            this.timeout(30_000);

            // Use selectEnvironment() to properly set env and start the LSP
            await (envManager as any).selectEnvironment(jacExePath);

            // Wait for LSP to initialize
            await new Promise(resolve => setTimeout(resolve, 10_000));

            const text = envManager.getStatusBar().text;
            expect(text).to.not.include('No Env');
            expect(text).to.include('$(check)');
        });

        // Verify status bar displays the installed jaclang version
        it('status bar shows the installed version after environment selection', async function () {
            this.timeout(10_000);

            const version = await getJacVersion(jacExePath);
            if (version) {
                const text = envManager.getStatusBar().text;
                expect(text).to.include(version);
            }
        });

        // Verify getJacPath returns the correct jac executable path
        it('getJacPath returns the selected .venv jac executable path', () => {
            expect(envManager.getJacPath()).to.equal(jacExePath);
        });

        // Verify getPythonPath returns the python sibling next to the jac executable
        it('getPythonPath returns the python sibling of the jac executable', () => {
            const pythonExe = process.platform === 'win32' ? 'python.exe' : 'python';
            const expectedPython = path.join(path.dirname(jacExePath), pythonExe);
            expect(envManager.getPythonPath()).to.equal(expectedPython);
        });
    });
});

