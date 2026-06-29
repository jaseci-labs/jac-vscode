import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Matches the version on `jac --version` output, e.g. "Version:  0.30.2".
const VERSION_RE = /Version:\s*([0-9]+\.[0-9]+\.[0-9]+(?:[.\-+][0-9A-Za-z.\-]+)?)/;

// Fast path: scan THIS env's own site-packages for a jaclang-*.dist-info (~1ms, no subprocess).
// Keyed on the given jacPath so each env reports its own version. A single self-contained
// binary has no sibling dist-info, so this returns undefined and the subprocess path is used.
async function getJacVersionFromDistInfo(jacPath: string): Promise<string | undefined> {
    try {
        const envRoot = path.dirname(path.dirname(jacPath));

        // Only trust the dist-info scan inside a real venv/conda env (marked by pyvenv.cfg).
        // A single binary at e.g. ~/.local/bin shares its prefix with unrelated pip installs,
        // so its sibling lib/ dist-info would be a different, stale jaclang. Skip it there.
        try { await fs.access(path.join(envRoot, 'pyvenv.cfg')); }
        catch { return undefined; }

        const libDir = path.join(envRoot, 'lib');

        let libEntries: string[];
        try { libEntries = await fs.readdir(libDir); }
        catch { return undefined; }

        for (const libEntry of libEntries.filter(entry => entry.startsWith('python'))) {
            for (const pkgDir of ['site-packages', 'dist-packages']) {
                try {
                    const sitePackages = path.join(libDir, libEntry, pkgDir);
                    const siteEntries  = await fs.readdir(sitePackages);
                    const distInfoDir  = siteEntries.find(
                        entry => entry.startsWith('jaclang-') && entry.endsWith('.dist-info')
                    );
                    if (distInfoDir) {
                        return distInfoDir.slice('jaclang-'.length, -'.dist-info'.length);
                    }
                } catch { continue; }
            }
        }
        return undefined;
    } catch { return undefined; }
}

// Authoritative: ask the specific binary directly. Works for any install (single binary or venv).
async function getJacVersionFromBinary(jacPath: string): Promise<string | undefined> {
    try {
        const { stdout, stderr } = await execFileAsync(jacPath, ['--version'], { timeout: 5000 });
        return VERSION_RE.exec(`${stdout}\n${stderr}`)?.[1];
    } catch { return undefined; }
}

// Resolve the version for THIS jacPath. Per-env dist-info first (fast, no subprocess),
// then the binary itself. Both are keyed on jacPath so each env reports its own version.
export async function getJacVersion(jacPath: string): Promise<string | undefined> {
    return (await getJacVersionFromDistInfo(jacPath)) ?? (await getJacVersionFromBinary(jacPath));
}

// Compares two semver strings. Returns positive if a > b, negative if a < b, 0 if equal.
export function compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
        if (diff !== 0) { return diff; }
    }
    return 0;
}
