/**
 * Integration Test Runner (VS Code Test Mode)
 * Launches VS Code with extension, fixture workspace, and Mocha tests
 */

import * as path from 'path';
import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { isWSL, isWindows, findPythonExtension, copyExtension, execAsync, execFileAsync } from './platformHelper';

async function main() {
	try {
		// Setup paths for extension, tests, and workspace
		// PATCHED: the extension is the Jac-built staging dir, not the repo root.
		const extensionDevelopmentPath = path.resolve(__dirname, '../../.jac/vscode');
		const extensionTestsPath = path.resolve(__dirname, './suite/index');
		const testWorkspacePath = path.resolve(__dirname, '../fixtures/workspace');
		const extensionsDir = path.resolve(__dirname, '../../.vscode-test/extensions');
		const userDataDir = path.resolve(__dirname, '../../.vscode-test/user-data');

		// Download and setup VS Code for testing
		const vscodeExecutablePath = await downloadAndUnzipVSCode();
		const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

		console.log('Installing dependencies...');

		// Platform-specific extension installation strategy
		const wslMode = isWSL();
		if (wslMode || isWindows()) {
			// WSL/Windows: Try to copy extension from system location to avoid slow re-installation
			const pythonExtDir = await findPythonExtension();
			if (pythonExtDir) {
				await copyExtension(pythonExtDir, extensionsDir);
				console.log('✓ Python extension copied\n');
			} else {
				// Fallback: Install directly if not found in system
				try {
					await execAsync(`${cli} --user-data-dir ${userDataDir} --extensions-dir ${extensionsDir} --install-extension ms-python.python`);
					console.log('✓ Dependencies installed\n');
				} catch (err) {
					console.warn('⚠️ Could not install Python extension automatically, test may fail\n');
				}
			}
		} else {
			// macOS/Linux/GitHub Actions: Direct installation
			try {
				await execFileAsync(cli, [...args, '--install-extension', 'ms-python.python']);
				console.log('✓ Dependencies installed\n');
			} catch (err) {
				console.warn('⚠️ Extension installation failed:', (err as Error).message);
			}
		}

		console.log('📋 Starting integration tests');
		console.log(`   Extension: ${extensionDevelopmentPath}`);
		console.log(`   Workspace: ${testWorkspacePath}\n`);

		// Configure launch arguments
		const launchArgs = [
			testWorkspacePath,
			'--disable-workspace-trust',
			'--no-sandbox',
		];

		// WSL/Windows need explicit paths for isolated environment
		if (wslMode || isWindows()) {
			launchArgs.push('--user-data-dir', userDataDir, '--extensions-dir', extensionsDir);
		}

		// Run the tests
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			vscodeExecutablePath,
			launchArgs,
		});

		console.log('✓ Tests completed successfully');
	} catch (err) {
		console.error('❌ Failed to run tests:', err);
		process.exit(1);
	}
}

main();