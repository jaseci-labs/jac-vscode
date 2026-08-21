/*
 * PATCHED shim: the TS-era tests imported ../../utils/envDetection and
 * ../../utils/envVersion, which no longer exist. This adapter loads the
 * COMPILED JAC env_detect module (bundled to CJS as out/env_detect.cjs by
 * the compile script, from the jac build --as npm tarball) so the
 * integration assertions still run against real shipped code.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const m = require('../env_detect.cjs');

export interface JacEnvironment {
    path: string;
    type: string;   // TS-era name; the Jac module calls it `kind`
}

export async function discoverJacEnvironments(roots: string[]): Promise<JacEnvironment[]> {
    const envs = await m.discover_jac_environments(roots);
    return envs.map((e: any) => ({ path: e.path, type: e.kind }));
}

export function getJacVersion(p: string): Promise<string | null> {
    return m.get_jac_version(p);
}
