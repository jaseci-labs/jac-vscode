/*
 * Visual Debugger tests — adapted from the TS-era src/__tests__/visualDebugger.test.ts,
 * PATCHED to run against the compiled Jac module (see env_manager.test.ts header).
 */
import { describe, it, expect, beforeAll, mock } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';

const REPO = path.resolve(__dirname, '..', '..');
const EXT = path.resolve(__dirname, '..', '.build', 'package', 'extension');
const STUB = path.join(REPO, '.jac', 'node_modules', 'vscode', 'index.js');

let vs: any;
let setup_visual_debugger_webview: any;

beforeAll(async () => {
    if (!fs.existsSync(path.join(EXT, 'visual_debugger.js'))) {
        throw new Error('run env_manager.test.ts first (extracts the build) or `jac run scripts/build_ext.jac`');
    }
    mock.module('vscode', () => require(STUB));
    vs = require(STUB);
    ({ setup_visual_debugger_webview } = await import(path.join(EXT, 'visual_debugger.js')));
});

describe('Visual Debugger (Essential Tests Only)', () => {
    it('registers the visualize command with the correct ID', () => {
        const before = vs.__calls.length;
        const context: any = { subscriptions: [], extensionPath: '/tmp/ext' };
        setup_visual_debugger_webview(context);
        const regs = vs.__calls.slice(before)
            .filter((c: any[]) => c[0] === 'registerCommand')
            .map((c: any[]) => c[1]);
        expect(regs).toContain('jaclang-extension.visualizeGraph');
        expect(context.subscriptions.length).toBeGreaterThan(0);
    });
});
