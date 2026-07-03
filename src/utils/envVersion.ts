import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';

const execFileAsync = promisify(execFile);

// Matches the version on `jac --version` output, e.g. "Version:  0.30.2".
const VERSION_RE = /Version:\s*([0-9]+\.[0-9]+\.[0-9]+(?:[.\-+][0-9A-Za-z.\-]+)?)/;

// Cold `jac --version` extracts the full runtime payload and can take 10s+.
const VERSION_SUBPROCESS_TIMEOUT_MS = 30000;

function jacCacheBase(): string {
    return process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
}

// ── Persistent version memo ──────────────────────────────────────────────────
// jac's gcStale wipes other binaries' rt cache dirs, so with 2+ binaries the rt cache
// can't hold every version. Memo keyed by hash16 (payload content hash) never goes stale.

const memoFile = () => path.join(jacCacheBase(), 'jac-vscode', 'versions.json');
let memoCache: Record<string, string> | undefined;

async function memoLoad(): Promise<Record<string, string>> {
    if (memoCache) return memoCache;
    try { memoCache = JSON.parse(await fs.readFile(memoFile(), 'utf-8')); }
    catch { memoCache = {}; }
    return memoCache!;
}

async function memoStore(hash16: string, version: string): Promise<void> {
    const memo = await memoLoad();
    if (memo[hash16] === version) return;
    memo[hash16] = version;
    try {
        await fs.mkdir(path.dirname(memoFile()), { recursive: true });
        await fs.writeFile(memoFile(), JSON.stringify(memo, null, 2));
    } catch { /* memo is best-effort */ }
}

// Reads the 80-byte trailer from a jac binary to get the hash16 (payload identity, ~0ms).
// Trailer layout: JACBIN01 (8) | payload_len u64le (8) | sha256hex (64)
async function getBinaryHash16(jacPath: string): Promise<string | undefined> {
    try {
        const { size } = await fs.stat(jacPath);
        if (size < 80) return undefined;
        const fh = await fs.open(jacPath, 'r');
        try {
            const buf = Buffer.alloc(80);
            await fh.read(buf, 0, 80, size - 80);
            if (buf.subarray(0, 8).toString('ascii') !== 'JACBIN01') return undefined;
            return buf.subarray(16, 32).toString('ascii'); // first 16 chars of sha256hex
        } finally { await fh.close(); }
    } catch { return undefined; }
}

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

// Dev builds report the LIVE <repo>/jac.toml version at runtime, which can drift from
// their build-time dist-info. Read jac.toml directly — instant and always correct.
async function getJacVersionFromDevSource(jacPath: string): Promise<string | undefined> {
    let resolved: string;
    try { resolved = await fs.realpath(jacPath); } catch { resolved = jacPath; }

    const binDir = path.dirname(resolved);                       // .../zig-out/bin
    const zigOut = path.dirname(binDir);                         // .../zig-out
    if (path.basename(binDir) !== 'bin' || path.basename(zigOut) !== 'zig-out') return undefined;

    try {
        const toml = await fs.readFile(path.join(path.dirname(zigOut), 'jac.toml'), 'utf-8');
        return toml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    } catch { return undefined; }
}

// Reads the version from a jac runtime cache site/ dir.
// Dev builds carry a jac_linked_source file pointing at the live source; its jac.toml wins.
async function getVersionFromSiteDir(siteDir: string): Promise<string | undefined> {
    try {
        const linkedSource = (await fs.readFile(path.join(siteDir, 'jac_linked_source'), 'utf-8')).trim();
        if (linkedSource) {
            const toml = await fs.readFile(path.join(linkedSource, 'jac.toml'), 'utf-8');
            const m = toml.match(/^version\s*=\s*"([^"]+)"/m);
            if (m) return m[1];
        }
    } catch { /* not a dev build */ }

    const entries = await fs.readdir(siteDir).catch(() => [] as string[]);
    const di = entries.find(e => e.startsWith('jaclang-') && e.endsWith('.dist-info'));
    return di ? di.slice('jaclang-'.length, -'.dist-info'.length) : undefined;
}

// Middle path: scan ~/.cache/jac/rt/*/site — no subprocess, ~2ms.
//
// Two cache dir formats:
//   New (≥0.30.3): <hash16>-<pathhash16>  (33 chars) — per binary path
//   Old (≤0.30.2): <hash16>               (16 chars) — per payload, shared
async function getJacVersionFromCache(jacPath: string, hash16: string | undefined): Promise<string | undefined> {
    const rtDir = path.join(jacCacheBase(), 'jac', 'rt');
    let hashDirs: string[];
    try { hashDirs = await fs.readdir(rtDir); }
    catch { return undefined; }
    if (hashDirs.length === 0) return undefined;

    const RT_KEY_LEN = 33;
    const HEX16 = /^[0-9a-f]{16}$/;
    const newFormatDirs = hashDirs.filter(d => d.length === RT_KEY_LEN && d[16] === '-');

    // 1. hash16 (payload identity) match — exact and path-independent
    if (hash16) {
        for (const dir of newFormatDirs.filter(d => d.startsWith(hash16 + '-'))) {
            const ver = await getVersionFromSiteDir(path.join(rtDir, dir, 'site'));
            if (ver) return ver;
        }
    }

    // 2. pathhash match — covers binaries whose trailer we couldn't read
    let resolvedPath: string;
    try { resolvedPath = await fs.realpath(jacPath); } catch { resolvedPath = jacPath; }

    const pathHashFor = (p: string) => createHash('sha256').update(p).digest('hex').slice(0, 16);

    let matchingDirs = newFormatDirs.filter(d => d.slice(17) === pathHashFor(resolvedPath));
    if (matchingDirs.length === 0 && resolvedPath !== jacPath) {
        matchingDirs = newFormatDirs.filter(d => d.slice(17) === pathHashFor(jacPath));
    }
    for (const dir of matchingDirs) {
        const ver = await getVersionFromSiteDir(path.join(rtDir, dir, 'site'));
        if (ver) return ver;
    }

    // 3. Old format — only safe when no new-format dirs exist (avoids stale post-GC reads)
    const oldFormatDirs = hashDirs.filter(d => d.length === 16 && HEX16.test(d));
    if (newFormatDirs.length === 0 && oldFormatDirs.length > 0) {
        const versions: string[] = [];
        for (const dir of oldFormatDirs) {
            const ver = await getVersionFromSiteDir(path.join(rtDir, dir, 'site'));
            if (ver) versions.push(ver);
        }
        const unique = [...new Set(versions)];
        if (unique.length === 1) return unique[0];
    }

    return undefined;
}

// Last resort: ask the binary directly. Slow on cold cache; memoized so it runs once per binary.
async function getJacVersionFromBinary(jacPath: string): Promise<string | undefined> {
    try {
        const { stdout, stderr } = await execFileAsync(jacPath, ['--version'], { timeout: VERSION_SUBPROCESS_TIMEOUT_MS });
        return VERSION_RE.exec(`${stdout}\n${stderr}`)?.[1];
    } catch { return undefined; }
}

// dist-info (venvs) → jac.toml (dev builds) → memo → rt cache → subprocess (result memoized).
export async function getJacVersion(jacPath: string): Promise<string | undefined> {
    const distInfo = await getJacVersionFromDistInfo(jacPath);
    if (distInfo) return distInfo;

    const devVersion = await getJacVersionFromDevSource(jacPath);
    if (devVersion) return devVersion;

    const hash16 = await getBinaryHash16(jacPath);
    if (hash16) {
        const memo = await memoLoad();
        if (memo[hash16]) return memo[hash16];
    }

    const version = (await getJacVersionFromCache(jacPath, hash16)) ?? (await getJacVersionFromBinary(jacPath));
    if (version && hash16) await memoStore(hash16, version);
    return version;
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
