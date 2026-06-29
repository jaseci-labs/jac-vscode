import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Constants ─────────────────────────────────────────────────────────────────

// Maximum number of conda env paths to scan (avoids runaway I/O on large setups)
const MAX_CONDA_ENVS_TO_SCAN = 30;

// How many directory levels deep to search for venvs
const VENV_WALK_DEPTH = 2;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

// Checks if a directory is a Python venv by looking for pyvenv.cfg
async function isVenv(dir: string): Promise<boolean> {
    return fileExists(path.join(dir, 'pyvenv.cfg'));
}

// Looks for jac binary inside a venv/conda env folder
async function getJacInEnv(envPath: string): Promise<string | null> {
    const isWin = process.platform === 'win32';
    const jacExe = isWin ? 'jac.exe' : 'jac';
    const binDir = isWin ? 'Scripts' : 'bin';
    const jacPath = path.join(envPath, binDir, jacExe);
    return (await fileExists(jacPath)) ? jacPath : null;
}

// Walks directories looking for venvs (identified by pyvenv.cfg) with jac installed
async function walkForVenvs(baseDir: string, depth: number): Promise<string[]> {
    if (depth === 0) return [];

    let entries: Dirent[];
    try {
        entries = await fs.readdir(baseDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const results = await Promise.all(
        entries
            .filter(dirEntry => dirEntry.isDirectory())
            .map(async (dirEntry): Promise<string[]> => {
                const fullPath = path.join(baseDir, dirEntry.name);
                if (await isVenv(fullPath)) {
                    const jac = await getJacInEnv(fullPath);
                    return jac ? [jac] : [];
                }
                return depth > 1 ? walkForVenvs(fullPath, depth - 1) : [];
            })
    );
    return results.flat();
}

// ── Environment Locators ─────────────────────────────────────────────────────

// Locator 0: Checks well-known binary install locations directly (no PATH dependency).
// Catches the case where ~/.local/bin isn't on PATH yet (common right after install).
async function findDefaultBinary(): Promise<string[]> {
    const homeDir = os.homedir();
    const isWin = process.platform === 'win32';
    const jacExe = isWin ? 'jac.exe' : 'jac';
    const candidates = isWin ? [] : [
        path.join(homeDir, '.local', 'bin', jacExe),   // curl installer default
        '/usr/local/bin/jac',                            // manual / system-wide installs
    ];
    const results = await Promise.all(candidates.map(async p => (await fileExists(p)) ? p : null));
    return results.filter((p): p is string => p !== null);
}

// Locator 1: Scans $PATH for jac
async function findInPath(): Promise<string[]> {
    const isWin = process.platform === 'win32';
    const jacExe = isWin ? 'jac.exe' : 'jac';
    const pathDirs = [...new Set(process.env.PATH?.split(path.delimiter) ?? [])];
    const results = await Promise.all(
        pathDirs.map(async dir => {
            const jacBinPath = path.join(dir, jacExe);
            return (await fileExists(jacBinPath)) ? jacBinPath : null;
        })
    );
    return results.filter((candidate): candidate is string => candidate !== null);
}

// Locator 2: Finds conda environments
async function findInCondaEnvs(): Promise<string[]> {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const condaRoots = [
        path.join(homeDir, 'anaconda3'),
        path.join(homeDir, 'miniconda3'),
        path.join(homeDir, 'miniforge3'),
        path.join(homeDir, 'mambaforge'),
        '/opt/anaconda3',
        '/opt/miniconda3',
    ];

    const envPaths: string[] = [];

    // Read environments.txt — conda's own registry of all known env paths
    try {
        const text = await fs.readFile(path.join(homeDir, '.conda', 'environments.txt'), 'utf-8');
        envPaths.push(...text.split('\n').map(line => line.trim()).filter(Boolean));
    } catch { /* file absent */ }

    // Scan conda roots for envs/ subdirectories + add base env
    const rootScans = await Promise.all(condaRoots.map(async root => {
        const found: string[] = [];
        // Check base env
        found.push(root);
        // Check envs/ subfolder
        try {
            const entries = await fs.readdir(path.join(root, 'envs'), { withFileTypes: true });
            entries
                .filter(dirEntry => dirEntry.isDirectory())
                .forEach(dirEntry => found.push(path.join(root, 'envs', dirEntry.name)));
        } catch { /* no envs folder */ }
        return found;
    }));
    envPaths.push(...rootScans.flat());

    // Dedupe, cap at MAX_CONDA_ENVS_TO_SCAN, check for jac
    const deduped = [...new Set(envPaths)].slice(0, MAX_CONDA_ENVS_TO_SCAN);
    const jacResults = await Promise.all(deduped.map(getJacInEnv));
    return jacResults.filter((result): result is string => result !== null);
}

// Locator 3: Finds jac in workspace — checks .jac/venv first (new binary model),
// then falls back to walking for old-style .venv folders (backward compat).
async function findInWorkspace(workspaceRoot: string): Promise<string[]> {
    // .jac/venv is where `jac install` puts plugins in the new binary model.
    // It contains a real jac binary that the extension can use directly.
    const jacVenv = path.join(workspaceRoot, '.jac', 'venv');
    const jacInPluginVenv = await getJacInEnv(jacVenv);
    const pluginResult = jacInPluginVenv ? [jacInPluginVenv] : [];

    // Also walk for old-style .venv folders (pip install jaclang, backward compat)
    const venvResults = await walkForVenvs(workspaceRoot, VENV_WALK_DEPTH);

    return [...pluginResult, ...venvResults];
}

// Locator 4: Finds venvs in home directory stores
async function findInHome(): Promise<string[]> {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) return [];

    const stores = [
        path.join(homeDir, '.virtualenvs'),
        path.join(homeDir, '.venvs'),
        path.join(homeDir, '.local', 'share', 'virtualenvs'),
        path.join(homeDir, '.local', 'pipx', 'venvs'),
    ];

    const results = await Promise.all(stores.map(dir => walkForVenvs(dir, VENV_WALK_DEPTH)));
    return results.flat();
}

// ── Main Discovery ───────────────────────────────────────────────────────────

export interface JacEnvironment {
    path: string;
    type: 'global' | 'conda' | 'venv' | 'workspace';
}

// Discovers all Jac environments on-demand (~10-15ms)
export async function discoverJacEnvironments(workspaceRoots: string[]): Promise<JacEnvironment[]> {
    const [defaultBinaries, pathEnvs, condaEnvs, homeEnvs, ...workspaceResults] = await Promise.all([
        findDefaultBinary(),
        findInPath(),
        findInCondaEnvs(),
        findInHome(),
        ...workspaceRoots.map(findInWorkspace)
    ]);

    const workspaceEnvs = workspaceResults.flat();
    const seen = new Set<string>();
    const envs: JacEnvironment[] = [];

    const add = (envPath: string, type: JacEnvironment['type']) => {
        if (!seen.has(envPath)) {
            seen.add(envPath);
            envs.push({ path: envPath, type });
        }
    };

    // Priority: workspace (.jac/venv + .venv) > default binary > PATH > conda > home venvs
    workspaceEnvs.forEach(envPath => add(envPath, 'workspace'));
    defaultBinaries.forEach(envPath => add(envPath, 'global'));
    pathEnvs.forEach(envPath => add(envPath, 'global'));
    condaEnvs.forEach(envPath => add(envPath, 'conda'));
    homeEnvs.forEach(envPath => add(envPath, 'venv'));

    return envs;
}

// ── Validation ───────────────────────────────────────────────────────────────

// Validates that a jac executable exists on disk
export async function validateJacExecutable(jacPath: string): Promise<boolean> {
    if (path.isAbsolute(jacPath)) {
        return fileExists(jacPath);
    }
    // Bare name — check in PATH
    const pathDirs = process.env.PATH?.split(path.delimiter) ?? [];
    const checks = await Promise.all(pathDirs.map(dir => fileExists(path.join(dir, jacPath))));
    return checks.some(Boolean);
}
