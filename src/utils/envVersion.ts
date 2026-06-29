import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';

// Matches the version on `jac --version` output: e.g. "Version:  0.30.2" (allows pre-release/build suffixes).
const VERSION_RE = /Version:\s*([0-9]+\.[0-9]+\.[0-9]+(?:[.\-+][0-9A-Za-z.\-]+)?)/;

// Resolves the Jac version. The single native binary is the source of truth, so we ask it directly via
// `jac --version`. Falls back to scanning site-packages for a jaclang-*.dist-info folder (offline/pip installs).
// Returns undefined if version cannot be determined. Never throws.
export async function getJacVersion(jacPath: string): Promise<string | undefined> {
    const fromBinary = await getVersionFromBinary(jacPath);
    if (fromBinary) { return fromBinary; }
    return getVersionFromDistInfo(jacPath);
}

// Primary: spawn the jac executable with --version and parse stdout.
async function getVersionFromBinary(jacPath: string): Promise<string | undefined> {
    return new Promise(resolve => {
        try {
            // Absolute path runs directly; a bare name is resolved via PATH.
            execFile(jacPath, ['--version'], { timeout: 5000 }, (err, stdout, stderr) => {
                if (err) { return resolve(undefined); }
                const match = VERSION_RE.exec(`${stdout}\n${stderr}`);
                resolve(match ? match[1] : undefined);
            });
        } catch { resolve(undefined); }
    });
}

// Fallback: scan site-packages for a jaclang-*.dist-info folder (~1ms, no subprocess).
async function getVersionFromDistInfo(jacPath: string): Promise<string | undefined> {
    try {
        const envRoot = path.dirname(path.dirname(jacPath));
        const libDir  = path.join(envRoot, 'lib');

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
