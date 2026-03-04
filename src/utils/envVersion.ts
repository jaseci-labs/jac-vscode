import * as fs from 'fs/promises';
import * as path from 'path';

// Finds jaclang version by scanning site-packages for a jaclang-*.dist-info folder (~1ms, no subprocess).
// Returns undefined if version cannot be determined.
export async function getJacVersion(jacPath: string): Promise<string | undefined> {
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
