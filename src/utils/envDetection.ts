import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

// Cache for discovered environments
let environmentCache: string[] | null = null;  // Stores found environment paths
let lastScanTime: number = 0;
const CACHE_DURATION = 10000;                // Cache valid for 10 seconds

function isJacInVenv(venvPath: string): string | null {
    const jacPath = path.join(venvPath, 'bin', 'jac');
    const jacPathWin = path.join(venvPath, 'Scripts', 'jac.exe');
    if (fs.existsSync(jacPath)) return jacPath;
    if (fs.existsSync(jacPathWin)) return jacPathWin;
    return null;
}

function walkForVenvs(baseDir: string, depth = 3): string[] {
    const found: string[] = [];
    if (depth === 0) return found;

    try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(baseDir, entry.name);

                const jacPath = isJacInVenv(fullPath);
                if (jacPath) {
                    found.push(jacPath);
                }

                // Continue walking deeper
                try {
                    found.push(...walkForVenvs(fullPath, depth - 1));
                } catch {}
            }
        }
    } catch (error) {
        // Silently ignore permission errors or other issues
    }
    return found;
}

function scanWorkspaceForVenvs(workspaceRoot: string): string[] {
    const envs: string[] = [];
    
    // Common virtual environment directory names
    const commonVenvNames = ['.venv', 'venv', 'env', '.env', 'virtualenv', 'pyenv'];
    
    // Check direct subdirectories first
    for (const dirName of commonVenvNames) {
        const jacPath = isJacInVenv(path.join(workspaceRoot, dirName));
        if (jacPath) envs.push(jacPath);
    }
    
    // Deeper search in common project structure directories
    const projectDirs = ['projects', 'workspace', 'dev', 'src'];
    for (const projectDir of projectDirs) {
        const fullProjectPath = path.join(workspaceRoot, projectDir);
        if (fs.existsSync(fullProjectPath)) {
            envs.push(...walkForVenvs(fullProjectPath, 3));
        }
    }
    
    // Search in immediate subdirectories (limited depth)
    try {
        const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.') && !projectDirs.includes(entry.name)) {
                const subPath = path.join(workspaceRoot, entry.name);
                // Check if this subdirectory itself contains venvs
                for (const venvName of commonVenvNames) {
                    const jacPath = isJacInVenv(path.join(subPath, venvName));
                    if (jacPath) envs.push(jacPath);
                }
            }
        }
    } catch (error) {
        // Silently ignore permission errors
    }
    
    return envs;
}

export async function findPythonEnvsWithJac(workspaceRoot: string = process.cwd(), useCache: boolean = true): Promise<string[]> {
    // CACHE CHECK: Return cached results if available and not expired
    if (useCache && environmentCache && (Date.now() - lastScanTime) < CACHE_DURATION) {
        return environmentCache;  // Return instantly - NO file system scanning!
    }


    const envs: string[] = [];

    // 1. Check PATH
    const searchDirs = process.env.PATH?.split(path.delimiter) || [];
    for (const dir of searchDirs) {
        const jacPath = path.join(dir, process.platform === 'win32' ? 'jac.exe' : 'jac');
        if (fs.existsSync(jacPath)) {
            envs.push(jacPath);
        }
    }

    // 2. Conda environments
    try {
        const condaInfo = cp.execSync('conda env list', { encoding: 'utf8', timeout: 5000 });
        const condaLines = condaInfo.split('\n');
        for (const line of condaLines) {
            const match = line.match(/^(.*?)\s+(\S+)/);
            if (match) {
                const envPath = match[2];
                const jacPath = isJacInVenv(envPath);
                if (jacPath) envs.push(jacPath);
            }
        }
    } catch (err) {
        console.warn('conda env list failed:', err);
    }

    // 3. WSL Conda environments (skip if already inside WSL)
    if (!process.env.WSL_DISTRO_NAME) {
        try {
            const wslCondaInfo = cp.execSync('wsl conda env list', { encoding: 'utf8', timeout: 5000 });
            const wslCondaLines = wslCondaInfo.split('\n');
            for (const line of wslCondaLines) {
                const match = line.match(/^(.*?)\s+(\S+)/);
                if (match) {
                    const envPath = match[2];
                    const jacPath = `/mnt/${envPath.replace(/^\/mnt\//, '').replace(/\\/g, '/')}/bin/jac`;
                    try {
                        const wslCheck = cp.execSync(`wsl test -f ${jacPath} && echo exists || echo missing`, { encoding: 'utf8', timeout: 3000 }).trim();
                        if (wslCheck === 'exists') envs.push(`wsl:${jacPath}`);
                    } catch {}
                }
            }
        } catch {
            console.warn('Skipping WSL conda env list (likely inside WSL or no permission)');
        }
    }

    // 4. Enhanced workspace search
    envs.push(...scanWorkspaceForVenvs(workspaceRoot));

    // 5. Walk home directory to find other venvs
    const homeDir = process.env.HOME || process.env.USERPROFILE || workspaceRoot;
    if (homeDir !== workspaceRoot) {
        envs.push(...walkForVenvs(homeDir, 4));  // Reduced depth for home directory
    }
    
    const venvWrapperDir = path.join(homeDir, '.virtualenvs');
    if (fs.existsSync(venvWrapperDir)) {
        envs.push(...walkForVenvs(venvWrapperDir, 2));
    }

    // 6. Deduplicate and cache results
    const uniqueEnvs = Array.from(new Set(envs));
    
    // CACHE UPDATE: Store results with current timestamp
    environmentCache = uniqueEnvs;        // Save found environments
    lastScanTime = Date.now();            // Remember when we scanned
    
    return uniqueEnvs;
}

export function clearEnvironmentCache(): void {
    environmentCache = null;  // Clear stored environments
    lastScanTime = 0;        // Reset timestamp (forces fresh scan)
}

export function isCacheValid(): boolean {
    // Check if we have cache AND it's not expired
    return environmentCache !== null && (Date.now() - lastScanTime) < CACHE_DURATION;
}
