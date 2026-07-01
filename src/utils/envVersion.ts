import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';

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

// Middle path: scan ~/.cache/jac/rt/*/site/jaclang-*.dist-info, keyed on jacPath.
// New format (≥0.30.3): <hash16>-<pathhash16> — per binary. Old format (≤0.30.2): <hash16> — shared.
// Old format used only when no new-format dirs exist (prevents cross-version pollution).
async function getJacVersionFromCache(jacPath: string): Promise<string | undefined> {
    const cacheBase = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
    const rtDir = path.join(cacheBase, 'jac', 'rt');
    let hashDirs: string[];
    try { hashDirs = await fs.readdir(rtDir); }
    catch { return undefined; }
    if (hashDirs.length === 0) return undefined;

    const RT_KEY_LEN = 33;
    const HEX16 = /^[0-9a-f]{16}$/;

    // Runtime hashes realpath(exe); try resolved first, fall back to raw (macOS symlink behaviour).
    let resolvedPath: string;
    try { resolvedPath = await fs.realpath(jacPath); } catch { resolvedPath = jacPath; }

    const pathHashFor = (p: string) => createHash('sha256').update(p).digest('hex').slice(0, 16);

    // New format: per-binary
    const newFormatDirs = hashDirs.filter(d => d.length === RT_KEY_LEN && d[16] === '-');
    let matchingDirs = newFormatDirs.filter(d => d.slice(17) === pathHashFor(resolvedPath));
    if (matchingDirs.length === 0 && resolvedPath !== jacPath) {
        matchingDirs = newFormatDirs.filter(d => d.slice(17) === pathHashFor(jacPath));
    }

    if (matchingDirs.length > 0) {
        const versions: string[] = [];
        for (const dir of matchingDirs) {
            let entries: string[];
            try { entries = await fs.readdir(path.join(rtDir, dir, 'site')); } catch { continue; }
            const di = entries.find(e => e.startsWith('jaclang-') && e.endsWith('.dist-info'));
            if (di) versions.push(di.slice('jaclang-'.length, -'.dist-info'.length));
        }
        const unique = [...new Set(versions)];
        if (unique.length === 1) return unique[0];
        return undefined;
    }

    // Old format: only when no new-format dirs exist (avoids returning stale version after GC).
    const oldFormatDirs = hashDirs.filter(d => d.length === 16 && HEX16.test(d));
    if (newFormatDirs.length === 0 && oldFormatDirs.length > 0) {
        const versions: string[] = [];
        for (const dir of oldFormatDirs) {
            let entries: string[];
            try { entries = await fs.readdir(path.join(rtDir, dir, 'site')); } catch { continue; }
            const di = entries.find(e => e.startsWith('jaclang-') && e.endsWith('.dist-info'));
            if (di) versions.push(di.slice('jaclang-'.length, -'.dist-info'.length));
        }
        const unique = [...new Set(versions)];
        if (unique.length === 1) return unique[0];
    }

    return undefined;
}

// Last resort: ask the specific binary directly (~1.8s, may be slow on cold cache).
async function getJacVersionFromBinary(jacPath: string): Promise<string | undefined> {
    try {
        const { stdout, stderr } = await execFileAsync(jacPath, ['--version'], { timeout: 5000 });
        return VERSION_RE.exec(`${stdout}\n${stderr}`)?.[1];
    } catch { return undefined; }
}

// dist-info (venvs) → cache scan (binary install, no subprocess) → subprocess (last resort).
export async function getJacVersion(jacPath: string): Promise<string | undefined> {
    return (await getJacVersionFromDistInfo(jacPath)) ?? (await getJacVersionFromCache(jacPath)) ?? (await getJacVersionFromBinary(jacPath));
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
