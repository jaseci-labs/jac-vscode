/**
 * JAC Language Extension - Cleanup Integration Test
 *
 * Runs LAST to clean up the virtual environment created during tests.
 * This file must run after all other integration tests to ensure
 * the test workspace is clean for the next test run.
 *
 * NOTE: This test must run AFTER environment.integration.test.ts and lsp.integration.test.ts
 */

import * as vscode from 'vscode';
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Check if a file or directory exists (HELPER FUNCTION)
 */
async function fileExists(filePath: string) {
    try {
        await fs.stat(filePath);
        return true;
    } catch {
        return false;
    }
}

describe('Cleanup Integration Tests - Environment Teardown', () => {
    let workspacePath: string;
    let temporaryVenvDirectory: string;

    before(() => {
        // Resolve workspace path from VS Code workspace folders
        const folders = vscode.workspace.workspaceFolders;
        expect(folders).to.exist;
        expect(folders?.length).to.be.greaterThan(0);
        workspacePath = folders![0].uri.fsPath;
        temporaryVenvDirectory = path.join(workspacePath, '.venv');
    });

    describe('Final Cleanup', () => {
        it('should remove virtual environment directory', async function () {
            this.timeout(30_000);

            // Check if .venv exists
            const venvExists = await fileExists(temporaryVenvDirectory);
            if (!venvExists) {
                // Already cleaned up, nothing to do
                return;
            }

            // Remove entire virtual environment directory
            try {
                await fs.rm(temporaryVenvDirectory, { recursive: true, force: true });
            } catch (error) {
                console.warn(`Warning: Could not delete .venv: ${error}`);
                // Don't fail - some files might be locked
            }

            // Verify directory was deleted
            const dirExists = await fileExists(temporaryVenvDirectory);
            expect(dirExists).to.be.false;
        });



        it('should verify test workspace is clean', async function () {
            this.timeout(10_000);

            // Check that .venv is gone
            const venvExists = await fileExists(path.join(workspacePath, '.venv'));
            expect(venvExists).to.be.false;

            // Workspace should be back to original state
            expect(workspacePath).to.exist;
            expect(workspacePath.length).to.be.greaterThan(0);
        });
    });
});

