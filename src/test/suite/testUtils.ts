/**
 * Shared Test Utilities
 * Used by all integration test files to avoid code duplication
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';

/**
 * Execute shell commands and capture output
 * Returns exit code, stdout, and stderr for verification
 */
export async function runCommand(cmd: string, args: string[]) {
    return await new Promise<{ code: number; commandOutput: string; commandError: string }>((resolve, reject) => {
        const childProcess = spawn(cmd, args, { shell: false });
        let commandOutput = '';
        let commandError = '';
        childProcess.stdout.on('data', (data) => (commandOutput += data.toString()));
        childProcess.stderr.on('data', (data) => (commandError += data.toString()));
        childProcess.on('error', reject);
        childProcess.on('close', (code) => resolve({ code: code ?? 0, commandOutput, commandError }));
    });
}

/**
 * Check if a file or directory exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.stat(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Finds which Python command works on local (Windows, Mac, or Linux)
 * Different systems have different Python commands, so we try them one by one
 * Returns: the Python command that works, or null if Python is not installed
 */
export async function detectPython(): Promise<{ cmd: string; argsPrefix: string[] } | null> {
    if (process.platform === 'win32') {
        try {
            const versionCheckResult = await runCommand('py', ['-3', '--version']);
            if (versionCheckResult.code === 0) return { cmd: 'py', argsPrefix: ['-3'] };
        } catch { }
    }
    try {
        const versionCheckResult = await runCommand('python3', ['--version']);
        if (versionCheckResult.code === 0) return { cmd: 'python3', argsPrefix: [] };
    } catch { }
    try {
        const versionCheckResult = await runCommand('python', ['--version']);
        if (versionCheckResult.code === 0) return { cmd: 'python', argsPrefix: [] };
    } catch { }
    return null;
}
