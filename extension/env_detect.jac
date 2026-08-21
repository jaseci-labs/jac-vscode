"""Jac environment discovery + version detection.

Port of src/utils/envDetection.ts + src/utils/envVersion.ts. Pure Node
logic -- no vscode imports -- which is what makes it the first migrated
module. Discovery walks well-known install locations, $PATH, conda envs,
workspace venvs, and home venv stores; version detection prefers the
env's own dist-info (fast, no subprocess) and falls back to running
`<jac> --version`.
"""
import from "node:fs/promises" { access, readdir, readFile }
import from "node:path" { join, dirname, isAbsolute, delimiter }
import from "node:os" { homedir }
import from "node:child_process" { execFile }
import from "node:util" { promisify }
import from "node:process" { platform, env }

glob MAX_CONDA_ENVS: int = 30;
glob VENV_WALK_DEPTH: int = 2;

glob exec_file_async: any = promisify(execFile);

obj:pub JacEnvironment {
    has path: str,
        kind: str;  # "global" | "conda" | "venv" | "workspace"
}

async def file_exists(p: str) -> bool {
    try {
        await access(p);
        return True;
    } except Exception {
        return False;
    }
}

async def is_venv(dir_path: str) -> bool {
    return await file_exists(join(dir_path, "pyvenv.cfg"));
}

"""Looks for the jac binary inside a venv/conda env folder."""
async def jac_in_env(env_path: str) -> str | None {
    is_win = platform == "win32";
    jac_exe = "jac.exe" if is_win else "jac";
    bin_dir = "Scripts" if is_win else "bin";
    p = join(env_path, bin_dir, jac_exe);
    return p if await file_exists(p) else None;
}

"""Walks directories looking for venvs (pyvenv.cfg) that have jac installed."""
async def walk_for_venvs(base_dir: str, depth: int) -> list[str] {
    if depth == 0 {
        return [];
    }
    found: list[str] = [];
    entries: any = None;
    try {
        entries = await readdir(base_dir, {"withFileTypes": True});
    } except Exception {
        return [];
    }
    for ent in entries {
        if not ent.isDirectory() {
            continue;
        }
        full_path: str = join(base_dir, ent.name);
        if await is_venv(full_path) {
            jac_path = await jac_in_env(full_path);
            if jac_path {
                found.append(jac_path);
            }
        } elif depth > 1 {
            found.extend(await walk_for_venvs(full_path, depth - 1));
        }
    }
    return found;
}

"""Locator 0: well-known single-binary install locations (catches fresh
installs before the install dir is on PATH)."""
async def find_default_binary -> list[str] {
    home: str = homedir();
    candidates: list[str] = [];
    if platform == "win32" {
        local_app: str = env.LOCALAPPDATA or join(home, "AppData", "Local");
        candidates = [
            join(local_app, "Programs", "jac", "jac.exe"),
            join(local_app, "jac", "bin", "jac.exe")
        ];
    } else {
        candidates = [
            join(home, ".local", "bin", "jac"),
            "/opt/homebrew/bin/jac",
            "/usr/local/bin/jac"
        ];
    }
    found: list[str] = [];
    for c in candidates {
        if await file_exists(c) {
            found.append(c);
        }
    }
    return found;
}

"""Locator 1: scan $PATH for jac."""
async def find_in_path -> list[str] {
    is_win = platform == "win32";
    jac_exe = "jac.exe" if is_win else "jac";
    path_var: str = env.PATH or "";
    found: list[str] = [];
    for d in path_var.split(delimiter) {
        if not d {
            continue;
        }
        cand: str = join(d, jac_exe);
        if cand not in found and await file_exists(cand) {
            found.append(cand);
        }
    }
    return found;
}

"""Locator 2: conda environments (environments.txt registry + root scans)."""
async def find_in_conda_envs -> list[str] {
    home_dir: str = env.HOME or env.USERPROFILE or "";
    conda_roots: list[str] = [
        join(home_dir, "anaconda3"),
        join(home_dir, "miniconda3"),
        join(home_dir, "miniforge3"),
        join(home_dir, "mambaforge"),
        "/opt/anaconda3",
        "/opt/miniconda3"
    ];
    env_paths: list[str] = [];

    try {
        text: str = await readFile(join(home_dir, ".conda", "environments.txt"), "utf-8");
        for raw in text.split("\n") {
            line: str = raw.strip();
            if line and line not in env_paths {
                env_paths.append(line);
            }
        }
    } except Exception {}

    for conda_root in conda_roots {
        if conda_root not in env_paths {
            env_paths.append(conda_root);
        }
        try {
            entries: any = await readdir(join(conda_root, "envs"), {"withFileTypes": True});
            for ent in entries {
                if ent.isDirectory() {
                    p: str = join(conda_root, "envs", ent.name);
                    if p not in env_paths {
                        env_paths.append(p);
                    }
                }
            }
        } except Exception {}
    }

    found: list[str] = [];
    for env_path in env_paths[:MAX_CONDA_ENVS] {
        jac_path = await jac_in_env(env_path);
        if jac_path {
            found.append(jac_path);
        }
    }
    return found;
}

"""Locator 4: venvs in home-directory stores (~/.virtualenvs etc.)."""
async def find_in_home -> list[str] {
    home_dir: str = env.HOME or env.USERPROFILE or "";
    if not home_dir {
        return [];
    }
    stores: list[str] = [
        join(home_dir, ".virtualenvs"),
        join(home_dir, ".venvs"),
        join(home_dir, ".local", "share", "virtualenvs"),
        join(home_dir, ".local", "pipx", "venvs")
    ];
    found: list[str] = [];
    for store in stores {
        found.extend(await walk_for_venvs(store, VENV_WALK_DEPTH));
    }
    return found;
}

"""Discovers all Jac environments. Priority: workspace > default binary >
PATH > conda > home venvs. (Sequential awaits for now -- discovery is
on-demand and still runs in tens of ms.)"""
async def:pub discover_jac_environments(workspace_roots: list[str]) -> list[JacEnvironment] {
    ws_envs: list[str] = [];
    for w in workspace_roots {
        ws_envs.extend(await walk_for_venvs(w, VENV_WALK_DEPTH));
    }
    default_bins = await find_default_binary();
    path_envs = await find_in_path();
    conda_envs = await find_in_conda_envs();
    home_envs = await find_in_home();

    seen: list[str] = [];
    envs: list[JacEnvironment] = [];
    groups: list[tuple[list[str], str]] = [
        (ws_envs, "workspace"),
        (default_bins, "global"),
        (path_envs, "global"),
        (conda_envs, "conda"),
        (home_envs, "venv")
    ];
    for (paths, kind) in groups {
        for p in paths {
            if p not in seen {
                seen.append(p);
                envs.append(JacEnvironment(path=p, kind=kind));
            }
        }
    }
    return envs;
}

"""Validates that a jac executable exists (absolute path or on $PATH)."""
async def:pub validate_jac_executable(jac_path: str) -> bool {
    if isAbsolute(jac_path) {
        return await file_exists(jac_path);
    }
    path_var: str = env.PATH or "";
    for d in path_var.split(delimiter) {
        if d and await file_exists(join(d, jac_path)) {
            return True;
        }
    }
    return False;
}

"""Fast path: read the version from this env's own jaclang-*.dist-info
(~1ms, no subprocess). Only trusted inside a real venv (pyvenv.cfg guard);
a single self-contained binary has no sibling dist-info."""
async def version_from_dist_info(jac_path: str) -> str | None {
    try {
        env_root: str = dirname(dirname(jac_path));
        if not await file_exists(join(env_root, "pyvenv.cfg")) {
            return None;
        }
        lib_dir: str = join(env_root, "lib");
        lib_entries: any = None;
        try {
            lib_entries = await readdir(lib_dir);
        } except Exception {
            return None;
        }
        for raw_entry in lib_entries {
            lib_entry: str = raw_entry;
            if not lib_entry.startswith("python") {
                continue;
            }
            for pkg_dir in ["site-packages", "dist-packages"] {
                try {
                    site_entries: any = await readdir(join(lib_dir, lib_entry, pkg_dir));
                    for raw_site in site_entries {
                        site_entry: str = raw_site;
                        if site_entry.startswith("jaclang-") and site_entry.endswith(".dist-info") {
                            return site_entry[len("jaclang-"):-len(".dist-info")];
                        }
                    }
                } except Exception {
                    continue;
                }
            }
        }
        return None;
    } except Exception {
        return None;
    }
}

"""Authoritative: run `<jac> --version`. Handles both the old pip output
("Version:  0.30.2") and the Zig single-binary output ("jac 0.36.0 (...)")
-- the latter is a fix over the TS port, whose regex only knew the former."""
async def version_from_binary(jac_path: str) -> str | None {
    try {
        r = await exec_file_async(jac_path, ["--version"], {"timeout": 5000});
        text: str = str(r.stdout) + "\n" + str(r.stderr);
        for pattern in ["Version:\\s*([0-9]+\\.[0-9]+\\.[0-9]+(?:[.\\-+][0-9A-Za-z.\\-]+)?)",
                        "jac\\s+([0-9]+\\.[0-9]+\\.[0-9]+(?:[.\\-+][0-9A-Za-z.\\-]+)?)"] {
            m = RegExp(pattern).exec(text);
            if m {
                return str(m[1]);
            }
        }
        return None;
    } except Exception {
        return None;
    }
}

"""Resolve the version for this jacPath: per-env dist-info first, then the
binary itself."""
async def:pub get_jac_version(jac_path: str) -> str | None {
    return (await version_from_dist_info(jac_path)) or (await version_from_binary(jac_path));
}

def num_or_zero(s: str) -> int {
    try {
        return int(s);
    } except Exception {
        return 0;
    }
}

"""Compares dotted version strings: positive if a > b, negative if a < b."""
def:pub compare_versions(a: str, b: str) -> int {
    a_parts = a.split(".");
    b_parts = b.split(".");
    n = max(len(a_parts), len(b_parts));
    for i in range(n) {
        av = num_or_zero(a_parts[i]) if i < len(a_parts) else 0;
        bv = num_or_zero(b_parts[i]) if i < len(b_parts) else 0;
        if av != bv {
            return av - bv;
        }
    }
    return 0;
}
