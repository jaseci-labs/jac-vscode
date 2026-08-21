"""Build the VS Code extension staging directory from Jac sources.

Run from the repo root:  jac run scripts/build_ext.jac

Produces .jac/vscode/ containing:
  package.json   generated from jac.toml [project] + [vscode]
  extension.js   single CJS bundle, only `vscode` external

That directory is directly loadable with
  code --extensionDevelopmentPath=$PWD/.jac/vscode
and is what `vsce package` will run against once we publish from Jac.
"""
import subprocess;
import tarfile;
import tomllib;
import json;
import os;
import shutil;
import sys;

"""Until the next jac release, jac.local.toml may point [dev]
jaclang_source at a compiler checkout. The shipped launcher only reads
that stanza from jac.toml, so promote it to JAC_DEV_SOURCE here so every
child jac invocation compiles with the intended compiler."""
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
        os.environ["JAC_DEV_SOURCE"] = os.path.abspath(
            os.path.join(repo_root, src)
        );
    }
}

with entry {
    repo_root = os.getcwd();
    if not os.path.isfile(os.path.join(repo_root, "jac.toml")) {
        print("error: run from the repo root (jac.toml not found)");
        sys.`exit(1);
    }
    apply_local_dev_source(repo_root);
    stage = os.path.join(repo_root, ".jac", "vscode");
    dist = os.path.join(repo_root, ".jac", "npm-dist");

    # 1. Type-check the extension sources only. The repo also contains
    #    intentionally-broken .jac fixtures for the TextMate grammar tests
    #    (src/test/fixtures, examples/), and `jac build`'s whole-project gate
    #    has no exclude config -- so we gate our real code explicitly and
    #    build with --no_typecheck below.
    jac_bin = os.environ.get("JAC_EXECUTABLE") or shutil.which("jac") or "jac";
    r = subprocess.run(
        [jac_bin, "check", "extension"],
        capture_output=True, text=True
    );
    print(r.stdout);
    if r.returncode != 0 {
        print(r.stderr);
        sys.`exit(1);
    }

    # 2. Ensure npm deps ([dependencies.npm]) are installed into
    #    .jac/client/node_modules (bun-managed) so the bundler can resolve
    #    vscode-languageclient, and the type system can read its .d.ts.
    r = subprocess.run([jac_bin, "install"], capture_output=True, text=True);
    if r.returncode != 0 {
        print(r.stdout);
        print(r.stderr);
        sys.`exit(1);
    }

    # 3. Compile Jac -> per-module ESM JS via the npm projection.
    r = subprocess.run(
        [jac_bin, "build", "--as", "npm", "-o", dist, "--no_typecheck"],
        capture_output=True, text=True
    );
    print(r.stdout);
    if r.returncode != 0 {
        print(r.stderr);
        sys.`exit(1);
    }

    # 2. Unpack the tarball's compiled JS into the staging src dir.
    with open(os.path.join(repo_root, "jac.toml"), "rb") as f {
        cfg = tomllib.load(f);
    }
    proj = cfg.get("project", {});
    vs = cfg.get("vscode", {});
    name = proj.get("name", "");
    version = proj.get("version", "0.0.0");
    tgz = os.path.join(dist, f"{name}-{version}.tgz");
    src_dir = os.path.join(stage, "src");
    if os.path.isdir(src_dir) {
        shutil.rmtree(src_dir);
    }
    os.makedirs(src_dir, exist_ok=True);
    with tarfile.open(tgz, "r:gz") as tf {
        for m in tf.getmembers() {
            if m.name.startswith("package/") {
                m.name = m.name[len("package/"):];
                if m.name {
                    tf.extract(m, src_dir);
                }
            }
        }
    }

    # 3. Generate the VS Code manifest. vsce/VS Code demand a literal
    #    package.json in the extension root; jac.toml is its source of truth.
    manifest = {
        "name": name,
        "displayName": vs.get("display-name", name),
        "description": proj.get("description", ""),
        "version": version,
        "publisher": vs.get("publisher", ""),
        "engines": {"vscode": vs.get("engines", "^1.96.0")},
        "categories": vs.get("categories", ["Programming Languages"]),
        "main": "./extension.js",
        "contributes": vs.get("contributes", {})
    };
    if vs.get("activation-events") {
        manifest["activationEvents"] = vs["activation-events"];
    }
    if vs.get("extension-dependencies") {
        manifest["extensionDependencies"] = vs["extension-dependencies"];
    }
    with open(os.path.join(stage, "package.json"), "w") as f {
        json.dump(manifest, f, indent=2);
        f.write("\n");
    }

    # 4. Bundle to one CJS file, `vscode` external — the same shipping recipe
    #    the TS build uses today (esbuild --format=cjs --external:vscode).
    entry_rel = proj.get("entry-point", "extension/main.jac").replace(".jac", ".js");
    entry_js = os.path.join(src_dir, entry_rel);
    bun = shutil.which("bun") or os.path.expanduser("~/.bun/bin/bun");
    out_js = os.path.join(stage, "extension.js");
    bundle_env = dict(os.environ);
    bundle_env["NODE_PATH"] = os.path.join(repo_root, ".jac", "client", "node_modules");
    r = subprocess.run(
        [bun, "x", "esbuild", entry_js, "--bundle", f"--outfile={out_js}",
         "--external:vscode", "--format=cjs", "--platform=node"],
        capture_output=True, text=True, env=bundle_env
    );
    print(r.stdout);
    if r.returncode != 0 {
        print(r.stderr);
        sys.`exit(1);
    }
    # 5. Stage static assets (grammars, language configs, icons) referenced
    #    by the generated manifest.
    os.makedirs(os.path.join(stage, "syntaxes"), exist_ok=True);
    os.makedirs(os.path.join(stage, "assets"), exist_ok=True);
    os.makedirs(os.path.join(stage, "assets", "webview"), exist_ok=True);
    os.makedirs(os.path.join(stage, "vendor"), exist_ok=True);
    for asset in ["syntaxes/jac.tmLanguage.json", "syntaxes/jactoml.tmLanguage.json",
                  "language-configuration.json", "language-configuration.jactoml.json",
                  "assets/file-icon.svg", "assets/icon.png",
                  "assets/webview/index.html",
                  "README.md", "LICENSE", "CHANGELOG.md"] {
        src_path = os.path.join(repo_root, asset);
        if os.path.isfile(src_path) {
            shutil.copy2(src_path, os.path.join(stage, asset));
        }
    }
    wasm_src = os.path.join(
        repo_root, ".jac", "client", "node_modules",
        "vscode-oniguruma", "release", "onig.wasm"
    );
    if os.path.isfile(wasm_src) {
        shutil.copy2(wasm_src, os.path.join(stage, "vendor", "onig.wasm"));
    }
    # The per-module compile output was only the bundler input; drop it so the
    # staged dir (and thus the vsix) contains exactly what ships.
    shutil.rmtree(src_dir);
    print(f"staged: {stage}");
    print(f"try it: code --extensionDevelopmentPath={stage}");
}
