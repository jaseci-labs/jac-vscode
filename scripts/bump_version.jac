"""Bump the extension version in jac.toml (replaces scripts/bump-version.js;
jac.toml [project] version is the single source of truth -- the generated
package.json inherits it at build time).

Usage:  jac run scripts/bump_version.jac -- <version>
        (CI passes the version via the BUMP_VERSION env var instead)
Emits GitHub Actions outputs when GITHUB_OUTPUT is set.
"""
import os;
import re;
import sys;

with entry {
    new_version = os.environ.get("BUMP_VERSION", "");
    if not new_version and len(sys.argv) > 1 {
        new_version = sys.argv[-1];
    }
    if not re.fullmatch(r"\d+\.\d+\.\d+", new_version or "") {
        print("Usage: BUMP_VERSION=<version> jac run scripts/bump_version.jac");
        print("Example: BUMP_VERSION=2026.3.17");
        sys.`exit(1);
    }

    with open("jac.toml", "r") as f {
        text = f.read();
    }
    m = re.search(r'(?m)^version = "([^"]+)"$', text);
    if not m {
        print("error: no version line found in jac.toml [project]");
        sys.`exit(1);
    }
    old_version = m.group(1);
    text = text.replace(f'version = "{old_version}"', f'version = "{new_version}"', 1);
    with open("jac.toml", "w") as f {
        f.write(text);
    }

    branch_name = f"release/v{new_version}";
    pr_title = f"Bump version from {old_version} to {new_version}";
    pr_body = (
        f"## Version Bump\n\n- **From:** `{old_version}`\n- **To:** `{new_version}`\n\n"
        "After merging, run the **Release Extension** workflow to publish."
    );

    out_file = os.environ.get("GITHUB_OUTPUT", "");
    if out_file {
        with open(out_file, "a") as f {
            f.write(f"old_version={old_version}\n");
            f.write(f"new_version={new_version}\n");
            f.write(f"branch_name={branch_name}\n");
            f.write(f"pr_title={pr_title}\n");
            f.write(f"pr_body<<EOF\n{pr_body}\nEOF\n");
        }
    } else {
        print(f"old_version={old_version}");
        print(f"new_version={new_version}");
        print(f"branch_name={branch_name}");
    }
}
