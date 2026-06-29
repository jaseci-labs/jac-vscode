import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Fast path: scan ~/.cache/jac/rt/*/site/jaclang-*.dist-info (~0.002s, no subprocess).
// If multiple cache dirs found (e.g. dev build + release), skip and fall back to subprocess.
async function getJacVersionFromCache(): Promise<string | undefined> {
    const cacheBase = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
    const rtDir = path.join(cacheBase, 'jac', 'rt');

    let hashDirs: string[];
    try { hashDirs = await fs.readdir(rtDir); }
    catch { return undefined; }

    const versions: string[] = [];

    for (const hashDir of hashDirs) {
        const siteDir = path.join(rtDir, hashDir, 'site');
        let entries: string[];
        try { entries = await fs.readdir(siteDir); }
        catch { continue; }

        const distInfo = entries.find(e => e.startsWith('jaclang-') && e.endsWith('.dist-info'));
        if (distInfo) {
            versions.push(distInfo.slice('jaclang-'.length, -'.dist-info'.length));
        }
    }

    // Multiple distinct versions in cache = ambiguous (dev build + release coexist).
    // Fall back to subprocess so we don't show wrong version.
    const unique = [...new Set(versions)];
    return unique.length === 1 ? unique[0] : undefined;
}

// Slow fallback: run jac --version (~1.8s). Only hits when cache doesn't exist yet
// (first-ever run before jac has been invoked). Runs silently in background.
async function getJacVersionFromBinary(jacPath: string): Promise<string | undefined> {
    try {
        const { stdout } = await execFileAsync(jacPath, ['--version'], { timeout: 5000 });
        return stdout.match(/Version:\s+([\d.]+)/)?.[1];
    } catch { return undefined; }
}

// Cache first (~0.002s). Subprocess fallback only if cache is missing.
export async function getJacVersion(jacPath: string): Promise<string | undefined> {
    return (await getJacVersionFromCache()) ?? (await getJacVersionFromBinary(jacPath));
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
