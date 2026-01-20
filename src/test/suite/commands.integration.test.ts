import * as vscode from 'vscode';
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs/promises';
import { COMMANDS, TERMINAL_NAME } from '../../constants';
import { runCommand, fileExists, detectPython, mockTerminalAndCapture } from './testUtils';

let workspacePath: string;

before(() => {
    // Resolve workspace path from VS Code workspace folders
    const folders = vscode.workspace.workspaceFolders;
    expect(folders).to.exist;
    expect(folders?.length).to.be.greaterThan(0);
    workspacePath = folders![0].uri.fsPath;
});

describe('Commands Integration Tests - RUN_FILE and Fallback Mechanisms', () => {
    let temporaryVenvDirectory = '';
    let venvPath = '';
    let pythonCmd: { cmd: string; argsPrefix: string[] };
    let venvPythonPath = '';
    let jacExePath = '';
    let envManager: any;

    before(async function () {
        this.timeout(30_000);
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

        // Get environment manager for status bar verification
        const ext = vscode.extensions.getExtension('jaseci-labs.jaclang-extension');
        await ext!.activate();
        const exports = ext!.exports;
        envManager = exports?.getEnvManager?.();
    });

    afterEach(async () => {
        // Clean up any open editors between tests
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(async () => {
        // Final cleanup: ensure test workspace is clean
        if (temporaryVenvDirectory) {
            try {
                await fs.rm(temporaryVenvDirectory, { recursive: true, force: true });
            } catch { }
        }
    });

    it('should execute Jac: Run button and verify complete terminal execution flow', async function () {
        this.timeout(60_000);

        // Setup - Open sample.jac file
        const filePath = path.join(workspacePath, 'sample.jac');
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc);
        expect(vscode.window.activeTextEditor?.document.uri.fsPath).to.equal(filePath);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Cleanup - Remove existing terminals
        vscode.window.terminals.forEach(t => t.dispose());
        await new Promise(resolve => setTimeout(resolve, 250));

        // Mock terminal and simulate button click
        const interactions = await mockTerminalAndCapture(async () => {
            await vscode.commands.executeCommand(COMMANDS.RUN_FILE);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }, TERMINAL_NAME);

        // Verify UI layer (terminal creation & visibility)
        expect(interactions.created).to.be.true;
        expect(interactions.shown).to.be.true;
        expect(interactions.name).to.equal(TERMINAL_NAME);

        // Verify command generation (correct text sent)
        expect(interactions.commands.length).to.be.greaterThan(0);
        const sentCommand = interactions.commands.join('\n');
        expect(sentCommand).to.include('run');
        expect(sentCommand).to.include('sample.jac');

        // Verify command uses correct jac path
        const ext = vscode.extensions.getExtension('jaseci-labs.jaclang-extension');
        const envMgr = ext!.exports?.getEnvManager?.();
        const selectedJacPath: string = envMgr?.getJacPath?.() ?? jacExePath;
        expect(sentCommand).to.include(selectedJacPath);

        // Verify actual execution and output
        const runResult = await runCommand(selectedJacPath, ['run', filePath]);
        expect(runResult.code).to.equal(0, `jac run command failed: ${runResult.commandError}`);

        // Verify program output
        const output = runResult.commandOutput;
        expect(output).to.include('Hello world!');
        expect(output).to.include('Calculated 3');
        expect(output).to.include('Small number');
    });

    it('should fail with a syntax error when running an invalid Jac file (bad.jac)', async function () {
        this.timeout(30_000);

        // Open bad.jac and make it the active editor (workspace file)
        const filePath = path.join(workspacePath, 'bad.jac');
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc);

        // Sanity: ensure it's a real workspace file and active
        expect(doc.isUntitled).to.be.false;
        expect(vscode.workspace.getWorkspaceFolder(doc.uri)).to.exist;
        expect(vscode.window.activeTextEditor?.document.uri.fsPath).to.equal(filePath);

        // Use selected jac if available, otherwise fall back to venv jac path from earlier setup
        const ext = vscode.extensions.getExtension('jaseci-labs.jaclang-extension');
        const envMgr = ext!.exports?.getEnvManager?.();
        const selectedJacPath: string = envMgr?.getJacPath?.() ?? jacExePath;

        // Run bad.jac directly (reliable; terminal output capture isn't)
        const runResult = await runCommand(selectedJacPath, ['run', filePath]);

        // Expect failure (syntax error or similar)
        expect(runResult.code).to.not.equal(0);

        // Expect some error text (could be in stderr or stdout depending on jac)
        const combined = `${runResult.commandOutput}\n${runResult.commandError}`.toLowerCase();
        expect(combined.length).to.be.greaterThan(0);
        expect(combined).to.match(/error|syntax|parse|exception/);
    });
});
