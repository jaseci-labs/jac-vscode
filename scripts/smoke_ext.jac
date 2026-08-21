"""Headless smoke test for the staged extension bundle.

Run from the repo root, after `jac run scripts/build_ext.jac`:

    jac run scripts/smoke_ext.jac

The harness itself is Jac (smoke/vscode_stub.jac + smoke/smoke_runner.jac):
this script only compiles those two modules to CJS, places the stub where
the bundle's require('vscode') resolves it, and runs the runner under Node.
"""
import subprocess;
import tomllib;
import os;
import shutil;
import sys;

def apply_local_dev_source(repo_root: str) -> None {
    if os.environ.get("JAC_DEV_SOURCE") {
        return;
    }
    local_toml = os.path.join(repo_root, "jac.local.toml");
    if not os.path.isfile(local_toml) {
        return;
    }
    with open(local_toml, "rb") as f {
        data = tomllib.load(f);
    }
    src = data.get("dev", {}).get("jaclang_source", "");
    if src {
        os.environ["JAC_DEV_SOURCE"] = os.path.abspath(os.path.join(repo_root, src));
    }
}

def run_or_die(cmd: list, cwd: str = "", env_extra: dict = {}) -> str {
    run_env = dict(os.environ);
    run_env.update(env_extra);
    r = subprocess.run(
        cmd, cwd=(cwd or None), env=run_env, capture_output=True, text=True
    );
    if r.returncode != 0 {
        print(r.stdout);
        print(r.stderr);
        sys.`exit(1);
    }
    return r.stdout;
}

with entry {
    repo_root = os.getcwd();
    apply_local_dev_source(repo_root);
    stage = os.path.join(repo_root, ".jac", "vscode");
    if not os.path.isfile(os.path.join(stage, "extension.js")) {
        print("error: no staged bundle; run `jac run scripts/build_ext.jac` first");
        sys.`exit(1);
    }
    jac_bin = os.environ.get("JAC_EXECUTABLE") or shutil.which("jac") or "jac";
    bun = shutil.which("bun") or os.path.expanduser("~/.bun/bin/bun");
    tmp_dir = os.path.join(repo_root, ".jac", "smoke");
    stub_dir = os.path.join(repo_root, ".jac", "node_modules", "vscode");
    os.makedirs(tmp_dir, exist_ok=True);
    os.makedirs(stub_dir, exist_ok=True);

    # 1. Compile the Jac vscode stub -> CJS at .jac/node_modules/vscode, the
    #    spot where the bundle's require('vscode') resolves (mirroring how the
    #    real extension host injects the module into the loader).
    stub_mjs = os.path.join(tmp_dir, "vscode_stub.mjs");
    with open(stub_mjs, "w") as f {
        f.write(run_or_die([jac_bin, "tool", "jac2js", "smoke/vscode_stub.jac"]));
    }
    run_or_die(
        [bun, "x", "esbuild", stub_mjs, "--format=cjs", "--platform=node",
         f"--outfile={os.path.join(stub_dir, 'index.js')}"]
    );

    # 2. Compile the Jac smoke runner -> CJS entry.
    runner_mjs = os.path.join(tmp_dir, "smoke_runner.mjs");
    with open(runner_mjs, "w") as f {
        f.write(run_or_die([jac_bin, "tool", "jac2js", "smoke/smoke_runner.jac"]));
    }
    run_cjs = os.path.join(tmp_dir, "run.cjs");
    run_or_die(
        [bun, "x", "esbuild", runner_mjs, "--bundle", "--format=cjs",
         "--platform=node", f"--outfile={run_cjs}"]
    );

    # 3. Execute under Node; the runner asserts and reports.
    node_bin = shutil.which("node") or shutil.which("bun") or "node";
    out = run_or_die(
        [node_bin, "run.cjs"], cwd=tmp_dir, env_extra={"JAC_SMOKE_STAGE": stage, "JAC_SMOKE_DISABLE_LSP": "1"}
    );
    print(out);
}
