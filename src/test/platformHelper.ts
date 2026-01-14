/**
 * Platform Helper Functions
 * Platform-specific utilities for handling Python extension installation across WSL, macOS, Linux, and Windows
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Detect if running inside Windows Subsystem for Linux
export function isWSL(): boolean {
	try {
		const releaseFile = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
		return releaseFile.includes('microsoft') || releaseFile.includes('wsl');
	} catch {
		return false;
	}
}

// Detect if running on native Windows
export function isWindows(): boolean {
	return process.platform === 'win32';
}

// Find pre-installed Python extension from system directory
// WSL/Windows: searches .vscode-server/extensions or .vscode\extensions
// This avoids slow re-installation in isolated test environments
export async function findPythonExtension(): Promise<string | null> {
	try {
		const homeDir = process.env.HOME || os.homedir();
		const systemExtensionsDir = path.join(homeDir, isWindows() ? '.vscode\\extensions' : '.vscode-server/extensions');
		if (!fs.existsSync(systemExtensionsDir)) {
			return null;
		}
		const extensions = fs.readdirSync(systemExtensionsDir);
		const pythonExt = extensions.find(ext => ext.startsWith('ms-python.python-'));
		return pythonExt ? path.join(systemExtensionsDir, pythonExt) : null;
	} catch {
		return null;
	}
}

// Copy extension to isolated test extensions directory
// Uses platform-specific commands: cp (Unix) or xcopy (Windows)
export async function copyExtension(source: string, destDir: string): Promise<void> {
	const extName = path.basename(source);
	const dest = path.join(destDir, extName);
	if (!fs.existsSync(destDir)) {
		fs.mkdirSync(destDir, { recursive: true });
	}

	if (isWindows()) {
		// Use xcopy for Windows
		await execAsync(`xcopy "${source}" "${dest}" /E /I /Y`);
	} else {
		// Use cp for Unix-like systems (macOS, Linux, WSL)
		await execAsync(`cp -r "${source}" "${dest}"`);
	}
}

export { execAsync, execFileAsync };
