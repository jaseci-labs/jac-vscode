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

// Walks dirs for venvs (pyvenv.cfg). Skips .jac/ — those are project plugin venvs.
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
            .filter(dirEntry => dirEntry.isDirectory() && dirEntry.name !== '.jac')
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

// Locator 0: Checks well-known single-binary install locations directly - catches
// fresh installs before the install dir is on PATH. Cross-platform.
async function findDefaultBinary(): Promise<string[]> {
    const home = os.homedir();
    const candidates = process.platform === 'win32'
        ? [
            path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Programs', 'jac', 'jac.exe'),
            path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'jac', 'bin', 'jac.exe'),
        ]
        : [
            path.join(home, '.local', 'bin', 'jac'),
            '/opt/homebrew/bin/jac', // macOS arm brew
            '/usr/local/bin/jac',
        ];
    const results = await Promise.all(
        candidates.map(async c => (await fileExists(c)) ? c : null)
    );
    return results.filter((c): c is string => c !== null);
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

// Locator 3: Finds venvs + zig-out dev builds in workspace.
// Checks zig-out/bin/jac at root and one level deep (covers both jaseci/ and jaseci/jac/ as workspace).
async function findInWorkspace(workspaceRoot: string): Promise<string[]> {
    const venvs = await walkForVenvs(workspaceRoot, VENV_WALK_DEPTH);

    const jacExe = process.platform === 'win32' ? 'jac.exe' : 'jac';
    const zigOutPaths: string[] = [];

    const checkZigOut = async (dir: string) => {
        const candidate = path.join(dir, 'zig-out', 'bin', jacExe);
        if (await fileExists(candidate)) zigOutPaths.push(candidate);
    };

    await checkZigOut(workspaceRoot);
    let entries: Dirent[];
    try { entries = await fs.readdir(workspaceRoot, { withFileTypes: true }); }
    catch { entries = []; }
    await Promise.all(
        entries
            .filter(e => e.isDirectory() && !e.name.startsWith('.'))
            .map(e => checkZigOut(path.join(workspaceRoot, e.name)))
    );

    return [...venvs, ...zigOutPaths];
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

    // Priority: workspace > default binary (~/.local/bin) > PATH > conda > home venvs
    workspaceEnvs.forEach(envPath => add(envPath, 'workspace'));
    defaultBinaries.forEach(envPath => add(envPath, 'global'));
    pathEnvs.forEach(envPath => add(envPath, 'global'));
    condaEnvs.forEach(envPath => add(envPath, 'conda'));
    homeEnvs.forEach(envPath => add(envPath, 'venv'));

    // Dedup by realpath: --dev install symlinks ~/.local/bin/jac → zig-out/bin/jac.
    const seenReal = new Set<string>();
    const deduped: JacEnvironment[] = [];
    for (const env of envs) {
        let real: string;
        try { real = await fs.realpath(env.path); } catch { real = env.path; }
        if (!seenReal.has(real)) {
            seenReal.add(real);
            deduped.push(env);
        }
    }
    return deduped;
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
