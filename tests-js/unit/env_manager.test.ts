/*
 * EnvManager unit tests — adapted from the TS-era src/__tests__/env_test.test.ts.
 *
 * PATCHED to run against the COMPILED JAC MODULES (extracted from the
 * jac build --as npm tarball) under bun's jest-compatible runner:
 *   - `vscode`      -> the Jac-written recording stub (smoke/vscode_stub.jac,
 *                      compiled to CJS by scripts/smoke_ext.jac)
 *   - env_detect.js -> controllable mock (discovery/version results per test)
 *   - lsp_client.js -> spy mock (no vscode-languageclient import chain)
 *
 * Prereq: `jac run scripts/build_ext.jac && jac run scripts/smoke_ext.jac`
 * (build tarball + compiled stub). CI runs both before this suite.
 */
import { describe, it, expect, beforeAll, beforeEach, mock } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

const REPO = path.resolve(__dirname, '..', '..');
const BUILD = path.resolve(__dirname, '..', '.build');
const EXT = path.join(BUILD, 'package', 'extension');
const STUB = path.join(REPO, '.jac', 'node_modules', 'vscode', 'index.js');

// ── Controllable mock state ──────────────────────────────────────────────────
const det = {
    envs: [] as { path: string; kind: string }[],
    versions: {} as Record<string, string>,
    valid: (p: string) => true,
    discoverCalls: 0,
    validateCalls: [] as string[],
};

function cmpVersions(a: string, b: string): number {
    const pa = a.split('.').map(n => parseInt(n) || 0);
    const pb = b.split('.').map(n => parseInt(n) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d;
    }
    return 0;
}

const lspMock = {
    calls: [] as string[],
    env: null as any,
    client: null as any,
    ensure_started: async () => { lspMock.calls.push('ensure_started'); },
    start: async () => { lspMock.calls.push('start'); },
    stop: async () => { lspMock.calls.push('stop'); },
    restart: async () => { lspMock.calls.push('restart'); },
    get_client: () => lspMock.client,
};

let vs: any;
let env_manager: any;
let origWindow: any;
let origEnv: any;

class MementoStub {
    store: Record<string, any> = {};
    get(k: string) { return this.store[k]; }
    update(k: string, v: any) { this.store[k] = v; }
}
let ctx: { subscriptions: any[]; workspaceState: MementoStub };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const infos = () => vs.__calls.filter((c: any[]) => c[0] === 'info');

beforeAll(async () => {
    const tgz = fs.readdirSync(path.join(REPO, '.jac', 'npm-dist'))
        .find(f => f.endsWith('.tgz'));
    if (!tgz) throw new Error('run `jac run scripts/build_ext.jac` first (no npm tarball)');
    if (!fs.existsSync(STUB)) throw new Error('run `jac run scripts/smoke_ext.jac` first (no compiled vscode stub)');
    fs.rmSync(BUILD, { recursive: true, force: true });
    fs.mkdirSync(BUILD, { recursive: true });
    execSync(`tar xzf ${path.join(REPO, '.jac', 'npm-dist', tgz)} -C ${BUILD}`);

    mock.module('vscode', () => require(STUB));
    mock.module(path.join(EXT, 'env_detect.js'), () => ({
        JacEnvironment: class { constructor(o: any) { Object.assign(this, o); } },
        discover_jac_environments: async () => { det.discoverCalls++; return det.envs; },
        validate_jac_executable: async (p: string) => { det.validateCalls.push(p); return det.valid(p); },
        get_jac_version: async (p: string) => det.versions[p] ?? null,
        compare_versions: cmpVersions,
    }));
    mock.module(path.join(EXT, 'lsp_client.js'), () => ({ lsp: lspMock }));

    vs = require(STUB);
    origWindow = { ...vs.window };
    origEnv = { ...vs.env };
    ({ env_manager } = await import(path.join(EXT, 'env_manager.js')));
});

beforeEach(() => {
    Object.assign(vs.window, origWindow);
    Object.assign(vs.env, origEnv);
    vs.__calls.length = 0;
    vs.__quickpicks.length = 0;
    det.envs = [];
    det.versions = {};
    det.valid = () => true;
    det.discoverCalls = 0;
    det.validateCalls.length = 0;
    lspMock.calls.length = 0;
    ctx = { subscriptions: [], workspaceState: new MementoStub() };
    env_manager.jac_path = '';
    env_manager.jac_version = '';
    env_manager.attach(ctx);
});

// ── init() ───────────────────────────────────────────────────────────────────
describe('init', () => {
    it('keeps a saved valid path and shows its version in the status bar', async () => {
        ctx.workspaceState.store['jacEnvPath'] = '/opt/x/bin/jac';
        det.versions['/opt/x/bin/jac'] = '1.2.3';
        await env_manager.init();
        expect(env_manager.jac_path).toBe('/opt/x/bin/jac');
        expect(env_manager.status_bar.text).toContain('Jac (1.2.3)');
        expect(det.validateCalls).toContain('/opt/x/bin/jac');
        expect(det.discoverCalls).toBe(0);           // no auto-select needed
    });

    it('clears an invalid saved path and auto-selects the best discovered env', async () => {
        ctx.workspaceState.store['jacEnvPath'] = '/gone/jac';
        det.valid = p => p !== '/gone/jac';
        det.envs = [
            { path: '/a/bin/jac', kind: 'venv' },
            { path: '/b/bin/jac', kind: 'conda' },
        ];
        det.versions['/a/bin/jac'] = '0.30.0';
        det.versions['/b/bin/jac'] = '0.36.0';
        await env_manager.init();
        expect(env_manager.jac_path).toBe('/b/bin/jac');
        expect(ctx.workspaceState.store['jacEnvPath']).toBe('/b/bin/jac');
    });

    it('shows the install hint when no environments exist', async () => {
        await env_manager.init();
        const hint = infos().find((c: any[]) => String(c[1]).includes('No Jac environment found'));
        expect(hint).toBeTruthy();
        expect(env_manager.status_bar.text).toContain('No Env');
    });
});

// ── path getters ─────────────────────────────────────────────────────────────
describe('getJacPath / getPythonPath', () => {
    it('falls back to bare jac when nothing selected', () => {
        expect(env_manager.get_jac_path()).toBe('jac');
    });

    it('returns the sibling python when it exists (venv layout)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jacenv-'));
        fs.writeFileSync(path.join(dir, 'jac'), '');
        fs.writeFileSync(path.join(dir, 'python'), '');
        env_manager.jac_path = path.join(dir, 'jac');
        expect(env_manager.get_python_path()).toBe(path.join(dir, 'python'));
    });

    it('falls back to bare python for the single binary (no sibling)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jacbin-'));
        fs.writeFileSync(path.join(dir, 'jac'), '');
        env_manager.jac_path = path.join(dir, 'jac');
        expect(env_manager.get_python_path()).toBe('python');
    });
});

// ── helpers ──────────────────────────────────────────────────────────────────
describe('helpers', () => {
    it('get_env_name extracts conda env names', () => {
        expect(env_manager.get_env_name('/home/u/miniconda3/envs/myenv/bin/jac')).toBe('myenv');
    });

    it('get_env_name extracts venv folder names', () => {
        expect(env_manager.get_env_name('/proj/.venv/bin/jac')).toBe('.venv');
    });

    it('get_env_name skips bin and returns the env dir', () => {
        expect(env_manager.get_env_name('/opt/tools/someenv/bin/jac')).toBe('someenv');
    });

    it('format_path shortens the home prefix to ~', () => {
        const home = process.env.HOME as string;
        expect(env_manager.format_path(path.join(home, 'x', 'jac'))).toBe('~/x/jac');
    });

    it('build_env_item marks the active env and includes type label', () => {
        const item = env_manager.build_env_item(
            { path: '/c/envs/e1/bin/jac', kind: 'conda', version: '1.0.0' }, true
        );
        expect(item.label).toContain('$(check)');
        expect(item.label).toContain('Jac 1.0.0');
        expect(item.description).toContain('Conda');
        expect(item.envPath).toBe('/c/envs/e1/bin/jac');
    });
});

// ── status bar ───────────────────────────────────────────────────────────────
describe('update_status_bar', () => {
    it('marks PATH-resident binaries as Global', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jacglob-'));
        fs.writeFileSync(path.join(dir, 'jac'), '');
        const oldPath = process.env.PATH;
        process.env.PATH = dir + path.delimiter + oldPath;
        env_manager.jac_path = path.join(dir, 'jac');
        env_manager.jac_version = '2.0.0';
        env_manager.update_status_bar();
        process.env.PATH = oldPath;
        expect(env_manager.status_bar.text).toBe('$(check) Jac (2.0.0) · Global');
    });

    it('omits Global for non-PATH envs', () => {
        env_manager.jac_path = '/some/venv/bin/jac';
        env_manager.jac_version = '2.0.0';
        env_manager.update_status_bar();
        expect(env_manager.status_bar.text).toBe('$(check) Jac (2.0.0)');
    });
});

// ── selection ────────────────────────────────────────────────────────────────
describe('select_environment', () => {
    it('persists, updates the bar, and (re)starts the LSP', async () => {
        det.versions['/n/bin/jac'] = '3.1.4';
        await env_manager.select_environment('/n/bin/jac');
        expect(ctx.workspaceState.store['jacEnvPath']).toBe('/n/bin/jac');
        expect(env_manager.status_bar.text).toContain('3.1.4');
        expect(lspMock.calls).toContain('ensure_started');
    });
});

// ── QuickPick flow ───────────────────────────────────────────────────────────
describe('prompt_environment_selection', () => {
    it('populates sorted items with separators and add options', async () => {
        det.envs = [
            { path: '/old/bin/jac', kind: 'venv' },
            { path: '/new/bin/jac', kind: 'conda' },
        ];
        det.versions['/old/bin/jac'] = '0.1.0';
        det.versions['/new/bin/jac'] = '9.9.9';
        await env_manager.prompt_environment_selection();
        const qp = vs.__quickpicks[0];
        expect(qp).toBeTruthy();
        expect(qp.busy).toBe(false);
        const envItems = qp.items.filter((i: any) => i.envPath && !['manual', 'browse'].includes(i.envPath));
        expect(envItems[0].envPath).toBe('/new/bin/jac');   // highest version first
        expect(qp.items.some((i: any) => i.envPath === 'manual')).toBe(true);
        expect(qp.items.some((i: any) => i.envPath === 'browse')).toBe(true);
    });

    it('accepting an item selects and persists that env', async () => {
        det.envs = [{ path: '/pick/bin/jac', kind: 'venv' }];
        det.versions['/pick/bin/jac'] = '1.0.0';
        await env_manager.prompt_environment_selection();
        const qp = vs.__quickpicks[0];
        const item = qp.items.find((i: any) => i.envPath === '/pick/bin/jac');
        qp.selectedItems = [item];
        qp.accept_handler();
        await sleep(50);
        expect(ctx.workspaceState.store['jacEnvPath']).toBe('/pick/bin/jac');
    });

    it('dismissing without a choice falls back to the best env', async () => {
        det.envs = [{ path: '/fb/bin/jac', kind: 'venv' }];
        det.versions['/fb/bin/jac'] = '2.0.0';
        await env_manager.prompt_environment_selection();
        const qp = vs.__quickpicks[0];
        qp.hide();          // user dismissed: onDidHide with nothing handled
        await sleep(50);
        expect(ctx.workspaceState.store['jacEnvPath']).toBe('/fb/bin/jac');
    });
});

// ── silentAutoSelect (remaining TS-era cases) ────────────────────────────────
describe('silent_auto_select', () => {
    it('silently selects the only env without any UI', async () => {
        det.envs = [{ path: '/envs/venv/bin/jac', kind: 'venv' }];
        det.versions['/envs/venv/bin/jac'] = '0.11.0';
        await env_manager.silent_auto_select();
        expect(ctx.workspaceState.store['jacEnvPath']).toBe('/envs/venv/bin/jac');
        expect(infos().length).toBe(0);
        expect(vs.__calls.some((c: any[]) => c[0] === 'warn')).toBe(false);
    });

    it('keeps the first env on version ties (stable tie-break)', async () => {
        det.envs = [
            { path: '/envs/first/bin/jac', kind: 'venv' },
            { path: '/envs/second/bin/jac', kind: 'venv' },
        ];
        det.versions['/envs/first/bin/jac'] = '0.11.0';
        det.versions['/envs/second/bin/jac'] = '0.11.0';
        await env_manager.silent_auto_select();
        expect(ctx.workspaceState.store['jacEnvPath']).toBe('/envs/first/bin/jac');
    });

    it('falls back to the first env when none report a version', async () => {
        det.envs = [
            { path: '/envs/a/bin/jac', kind: 'venv' },
            { path: '/envs/b/bin/jac', kind: 'venv' },
        ];
        await env_manager.silent_auto_select();
        expect(ctx.workspaceState.store['jacEnvPath']).toBe('/envs/a/bin/jac');
    });

    it('offers Install Jac / Select Manually buttons when nothing is found', async () => {
        let captured: any[] = [];
        vs.window.showInformationMessage = async (...args: any[]) => { captured = args; return undefined; };
        await env_manager.silent_auto_select();
        expect(captured).toEqual([
            'No Jac environment found. Install Jac to enable IntelliSense.',
            'Install Jac', 'Select Manually',
        ]);
        expect(ctx.workspaceState.store['jacEnvPath']).toBeUndefined();
    });

    it('opens the install page when the user clicks Install Jac', async () => {
        let opened = false;
        vs.window.showInformationMessage = async () => 'Install Jac';
        vs.env.openExternal = () => { opened = true; };
        await env_manager.silent_auto_select();
        expect(opened).toBe(true);
    });

    it('opens the environment picker when the user clicks Select Manually', async () => {
        vs.window.showInformationMessage = async () => 'Select Manually';
        await env_manager.silent_auto_select();
        expect(vs.__quickpicks.length).toBe(1);
    });
});

// ── handleManualPathEntry ────────────────────────────────────────────────────
describe('handle_manual_path_entry', () => {
    it('saves a valid path and (re)starts the LSP', async () => {
        vs.window.showInputBox = async () => '/valid/jac';
        await env_manager.handle_manual_path_entry();
        expect(det.validateCalls).toContain('/valid/jac');
        expect(ctx.workspaceState.store['jacEnvPath']).toBe('/valid/jac');
        expect(lspMock.calls).toContain('ensure_started');
    });

    it('expands a tilde path before validation', async () => {
        const originalHome = process.env.HOME;
        process.env.HOME = '/home/testuser';
        vs.window.showInputBox = async () => '~/bin/jac';
        await env_manager.handle_manual_path_entry();
        process.env.HOME = originalHome;
        expect(det.validateCalls).toContain('/home/testuser/bin/jac');
    });

    it('does nothing when the input box is cancelled', async () => {
        vs.window.showInputBox = async () => undefined;
        await env_manager.handle_manual_path_entry();
        expect(ctx.workspaceState.store['jacEnvPath']).toBeUndefined();
        expect(det.validateCalls.length).toBe(0);
    });

    it('shows Retry/Browse on an invalid path', async () => {
        det.valid = () => false;
        vs.window.showInputBox = async () => '/bad/jac';
        let captured: any[] = [];
        vs.window.showErrorMessage = async (...args: any[]) => { captured = args; return undefined; };
        await env_manager.handle_manual_path_entry();
        expect(captured).toEqual(['Invalid Jac executable.', 'Retry', 'Browse']);
    });

    it('re-prompts when the user clicks Retry', async () => {
        det.valid = () => false;
        let inputCalls = 0;
        vs.window.showInputBox = async () => { inputCalls++; return inputCalls === 1 ? '/bad/jac' : undefined; };
        let errorCalls = 0;
        vs.window.showErrorMessage = async () => { errorCalls++; return errorCalls === 1 ? 'Retry' : undefined; };
        await env_manager.handle_manual_path_entry();
        expect(inputCalls).toBe(2);
    });
});

// ── handleFileBrowser ────────────────────────────────────────────────────────
describe('handle_file_browser', () => {
    it('saves a valid file selection and (re)starts the LSP', async () => {
        vs.window.showOpenDialog = async () => [{ fsPath: '/browser/jac' }];
        await env_manager.handle_file_browser();
        expect(ctx.workspaceState.store['jacEnvPath']).toBe('/browser/jac');
        expect(lspMock.calls).toContain('ensure_started');
    });

    it('does nothing when the dialog is cancelled', async () => {
        vs.window.showOpenDialog = async () => undefined;
        await env_manager.handle_file_browser();
        expect(ctx.workspaceState.store['jacEnvPath']).toBeUndefined();
        expect(det.validateCalls.length).toBe(0);
    });

    it('shows Try Again / Enter Path Manually on an invalid selection', async () => {
        det.valid = () => false;
        vs.window.showOpenDialog = async () => [{ fsPath: '/bad/jac' }];
        let captured: any[] = [];
        vs.window.showErrorMessage = async (...args: any[]) => { captured = args; return undefined; };
        await env_manager.handle_file_browser();
        expect(captured).toEqual(['Not a valid Jac executable.', 'Try Again', 'Enter Path Manually']);
    });
});

// ── remaining status bar / getter / helper cases ─────────────────────────────
describe('remaining TS-era cases', () => {
    it('status bar shows check icon and Jac label for a configured path', () => {
        env_manager.jac_path = '/home/user/.venv/bin/jac';
        env_manager.update_status_bar();
        expect(env_manager.status_bar.text).toContain('$(check)');
        expect(env_manager.status_bar.text).toContain('Jac');
    });

    it('status bar shows warning + No Env when unconfigured', () => {
        env_manager.update_status_bar();
        expect(env_manager.status_bar.text).toContain('$(warning)');
        expect(env_manager.status_bar.text).toContain('No Env');
    });

    it('get_jac_path returns the configured path when set', () => {
        env_manager.jac_path = '/usr/local/bin/jac';
        expect(env_manager.get_jac_path()).toBe('/usr/local/bin/jac');
    });

    it('get_python_path falls back to bare python when unconfigured', () => {
        expect(env_manager.get_python_path()).toBe('python');
    });

    it('format_path returns short paths unchanged', () => {
        expect(env_manager.format_path('/usr/local/bin/jac')).toBe('/usr/local/bin/jac');
    });

    it('build_env_item shows env name for venv kind and drops version when absent', () => {
        const withV = env_manager.build_env_item(
            { path: '/home/user/.venv/bin/jac', kind: 'venv', version: '0.11.0' }, false
        );
        expect(withV.label).toContain('Jac 0.11.0');
        expect(withV.label).toContain('.venv');
        const noV = env_manager.build_env_item(
            { path: '/home/user/.venv/bin/jac', kind: 'venv', version: '' }, false
        );
        expect(noV.label).toBe('Jac (.venv)');
    });
});
