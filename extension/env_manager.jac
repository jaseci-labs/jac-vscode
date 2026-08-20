"""Environment manager (port of src/environment/manager.ts).

Owns the selected jac binary, the status bar item, workspaceState
persistence, silent auto-select on startup, and the QuickPick selection UI.
A single module-level instance is shared; main.jac calls attach(context).
"""
import from "vscode" {
    window, workspace, env as vsenv, Uri,
    StatusBarAlignment, QuickPickItemKind, ConfigurationTarget
}
import from "node:fs" { existsSync }
import from "node:path" { join, dirname, basename, isAbsolute, delimiter, sep }
import from "node:process" { platform, env, cwd }
import from .env_detect {
    discover_jac_environments, validate_jac_executable,
    get_jac_version, compare_versions, JacEnvironment
}
import from .lsp_client { lsp }

def workspace_roots -> list[str] {
    folders: any = workspace.workspaceFolders;
    if folders {
        roots: list[str] = [];
        for f in folders {
            roots.append(str(f.uri.fsPath));
        }
        return roots;
    }
    return [cwd()];
}

obj EnvManager {
    has context: any = None,
        status_bar: any = None,
        jac_path: str = "",
        jac_version: str = "";

    def attach(context: any) -> None {
        self.context = context;
        self.status_bar = window.createStatusBarItem(StatusBarAlignment.Left, 100);
        self.status_bar.command = "jaclang-extension.selectEnv";
        context.subscriptions.push(self.status_bar);
    }

    async def init -> None {
        # workspaceState["get"]/["update"]: subscript-call bypasses the runtime's Python-method dispatch.
        saved = self.context.workspaceState["get"]("jacEnvPath");
        self.jac_path = str(saved) if saved else "";
        if self.jac_path {
            self.jac_version = (await get_jac_version(self.jac_path)) or "";
        }
        self.update_status_bar();
        await self.validate_and_clear_if_invalid();
        if not self.jac_path {
            await self.silent_auto_select();
        }
        self.update_status_bar();
    }

    def get_jac_path -> str {
        if self.jac_path {
            return self.jac_path;
        }
        return "jac.exe" if platform == "win32" else "jac";
    }

    def get_python_path -> str {
        python_exe = "python.exe" if platform == "win32" else "python";
        if self.jac_path {
            # Legacy pip venv ships a sibling python in bin/; use it when
            # present. The single binary embeds Python -- bare fallback.
            sibling = join(dirname(self.jac_path), python_exe);
            if existsSync(sibling) {
                return sibling;
            }
        }
        return python_exe;
    }

    async def validate_and_clear_if_invalid -> None {
        if self.jac_path and not (await validate_jac_executable(self.jac_path)) {
            self.jac_path = "";
            self.jac_version = "";
            await self.context.workspaceState["update"]("jacEnvPath", None);
            self.update_status_bar();
        }
    }

    """Silently pick the best environment on startup; only when nothing is
    found does the user see a (non-blocking) install hint."""
    async def silent_auto_select -> None {
        envs = await discover_jac_environments(workspace_roots());
        if len(envs) == 0 {
            choice = await window.showInformationMessage(
                "No Jac environment found. Install Jac to enable IntelliSense.",
                "Install Jac", "Select Manually"
            );
            if choice == "Install Jac" {
                vsenv.openExternal(Uri.parse("https://www.jac-lang.org/learn/installation/"));
            } elif choice == "Select Manually" {
                await self.prompt_environment_selection();
            }
            return;
        }
        (best, version) = await self.find_best_environment(envs);
        if best {
            self.jac_path = best.path;
            self.jac_version = version;
            await self.context.workspaceState["update"]("jacEnvPath", best.path);
            self.update_status_bar();
        }
    }

    """Highest-version environment plus its version string."""
    async def find_best_environment(envs: list[JacEnvironment]) -> tuple[any, str] {
        if len(envs) == 0 {
            return (None, "");
        }
        best_idx = 0;
        best_version = "";
        versions: list[str] = [];
        for e in envs {
            versions.append((await get_jac_version(e.path)) or "");
        }
        for (i, v) in enumerate(versions) {
            if v and ((not best_version) or compare_versions(v, best_version) > 0) {
                best_version = v;
                best_idx = i;
            }
        }
        return (envs[best_idx], versions[best_idx]);
    }

    async def select_environment(env_path: str) -> None {
        self.jac_path = env_path;
        self.jac_version = (await get_jac_version(env_path)) or "";
        await self.context.workspaceState["update"]("jacEnvPath", env_path);
        self.update_status_bar();
        try {
            await lsp.ensure_started();
        } except Exception as e {
            window.showErrorMessage(f"Failed to (re)start language server: {e}");
        }
    }

    def update_status_bar -> None {
        if self.jac_path {
            path_var: str = env.PATH or "";
            is_global = False;
            if self.jac_path in ["jac", "jac.exe"] {
                is_global = True;
            } else {
                for d in path_var.split(delimiter) {
                    if d and join(d, basename(self.jac_path)) == self.jac_path {
                        is_global = True;
                        break;
                    }
                }
            }
            version_part = f" ({self.jac_version})" if self.jac_version else "";
            label = f"Jac{version_part} · Global" if is_global else f"Jac{version_part}";
            self.status_bar.text = f"$(check) {label}";
            self.status_bar.tooltip = f"Current: {self.jac_path}\nClick to change";
        } else {
            self.status_bar.text = "$(warning) Jac: No Env";
            self.status_bar.tooltip = "No Jac environment selected - Click to select";
        }
        self.status_bar.show();
    }

    # -- QuickPick selection UI ------------------------------------------------

    async def prompt_environment_selection -> None {
        try {
            await self.validate_and_clear_if_invalid();
            qp = window.createQuickPick();
            current_name = self.get_env_name(self.jac_path) if self.jac_path else "";
            if self.jac_version and current_name {
                qp.title = f"Jac Environment · currently: {self.jac_version} ({current_name})";
            } else {
                qp.title = "Select Jac Environment";
            }
            qp.placeholder = "Searching for Jac environments...";
            qp.matchOnDescription = True;
            qp.ignoreFocusOut = True;
            qp.busy = True;
            qp.show();

            envs = await discover_jac_environments(workspace_roots());
            entries: list = [];
            for e in envs {
                entries.append({
                    "path": e.path, "kind": e.kind,
                    "version": (await get_jac_version(e.path)) or ""
                });
            }
            arr: any = entries;
            # arr["sort"]: JS Array.sort with a JS comparator; attribute-call
            # would poly-dispatch to Python list.sort semantics.
            arr["sort"](lambda (a: any, b: any) -> int {
                if a["version"] and b["version"] {
                    return compare_versions(b["version"], a["version"]);
                }
                if a["version"] {
                    return -1;
                }
                if b["version"] {
                    return 1;
                }
                return 0;
            });

            qp.busy = False;
            if len(envs) > 0 {
                plural = "s" if len(envs) > 1 else "";
                qp.placeholder = f"{len(envs)} environment{plural} found";
            } else {
                qp.placeholder = "No Jac environments detected";
            }

            items: list = [];
            recommended: any = None;
            for env_entry in entries {
                if env_entry["version"] {
                    recommended = env_entry;
                    break;
                }
            }
            active_version = "";
            if self.jac_path {
                for env_entry in entries {
                    if env_entry["path"] == self.jac_path {
                        items.append({"label": "Currently Active", "kind": QuickPickItemKind.Separator});
                        items.append(self.build_env_item(env_entry, True));
                        active_version = env_entry["version"];
                        break;
                    }
                }
            }
            show_recommended = (
                recommended is not None
                and recommended["path"] != self.jac_path
                and (
                    (recommended["version"] and active_version
                     and compare_versions(recommended["version"], active_version) > 0)
                    or (recommended["version"] and not active_version)
                )
            );
            if show_recommended {
                items.append({"label": "Recommended", "kind": QuickPickItemKind.Separator});
                items.append(self.build_env_item(recommended, False));
            }
            for env_entry in entries {
                if env_entry["path"] == self.jac_path {
                    continue;
                }
                if show_recommended and recommended is not None and env_entry["path"] == recommended["path"] {
                    continue;
                }
                items.append(self.build_env_item(env_entry, False));
            }
            items.append({"label": "Add", "kind": QuickPickItemKind.Separator});
            items.append({
                "label": "$(add) Enter interpreter path...",
                "description": "Manually specify the path to a Jac executable",
                "envPath": "manual"
            });
            items.append({
                "label": "$(folder-opened) Browse...",
                "description": "Browse for Jac executable using file picker",
                "envPath": "browse"
            });
            qp.items = items;

            state: dict = {"handled": False};
            qp.onDidAccept(lambda {
                state["handled"] = True;
                picked: any = qp.selectedItems[0] if qp.selectedItems else None;
                qp.hide();
                self.apply_pick(picked, envs);
            });
            qp.onDidHide(lambda {
                qp.dispose();
                if not state["handled"] {
                    self.fallback_auto_select(envs);
                }
            });
        } except Exception as e {
            self.update_status_bar();
            window.showErrorMessage(f"Error finding Jac environments: {e}");
        }
    }

    """Handles the accepted QuickPick item (floating async from the event)."""
    async def apply_pick(picked: any, envs: list[JacEnvironment]) -> None {
        if picked is None {
            await self.fallback_auto_select(envs);
            return;
        }
        # JS-object indexing yields undefined (falsy) for a missing key.
        target: any = picked["envPath"];
        if target == "manual" {
            await self.handle_manual_path_entry();
        } elif target == "browse" {
            await self.handle_file_browser();
        } elif target {
            await self.select_environment(str(target));
        }
        self.update_status_bar();
    }

    """If nothing ended up selected, quietly fall back to the best env."""
    async def fallback_auto_select(envs: list[JacEnvironment]) -> None {
        if (not self.jac_path) and len(envs) > 0 {
            (best, version) = await self.find_best_environment(envs);
            if best {
                await self.select_environment(best.path);
                return;
            }
        }
        self.update_status_bar();
    }

    def build_env_item(env_entry: any, is_active: bool) -> dict {
        env_name = self.get_env_name(str(env_entry["path"]));
        kind_str: str = str(env_entry["kind"]);
        type_label = kind_str[0].upper() + kind_str[1:];
        version_str = f"Jac {env_entry['version']}" if env_entry["version"] else "Jac";
        name_part = "";
        if kind_str != "global" and env_name {
            name_part = f" ({env_name})";
        }
        check = "$(check) " if is_active else "";
        return {
            "label": f"{check}{version_str}{name_part}",
            "description": f"{self.format_path(str(env_entry['path']))}  ·  {type_label}",
            "envPath": env_entry["path"]
        };
    }

    def get_env_name(env_path: str) -> str {
        conda_m = RegExp('envs[/\\\\]([^/\\\\]+)').exec(env_path);
        if conda_m {
            return str(conda_m[1]);
        }
        venv_m = RegExp('([^/\\\\]*(?:\\.?venv|virtualenv)[^/\\\\]*)').exec(env_path);
        if venv_m and venv_m[1] {
            return str(venv_m[1]);
        }
        parent = basename(dirname(env_path));
        if parent in ["bin", "Scripts"] {
            return basename(dirname(dirname(env_path)));
        }
        return parent;
    }

    def format_path(env_path: str) -> str {
        home_dir: str = env.HOME or env.USERPROFILE or "";
        display = env_path;
        if home_dir and display.startswith(home_dir) {
            display = "~" + display[len(home_dir):];
        }
        parts = display.split(sep);
        if len(parts) > 6 {
            head = sep.join(parts[:2]);
            tail = sep.join(parts[-3:]);
            return f"{head}{sep}...{sep}{tail}";
        }
        return display;
    }

    async def handle_manual_path_entry -> None {
        value = await window.showInputBox({
            "prompt": "Enter the path to the Jac executable",
            "placeHolder": "/path/to/jac or C:\\path\\to\\jac.exe"
        });
        if not value {
            return;
        }
        raw: str = str(value).strip();
        normalized = raw;
        if raw.startswith("~") {
            home_dir: str = env.HOME or env.USERPROFILE or "";
            normalized = join(home_dir, raw[1:].lstrip("/\\"));
        }
        if await validate_jac_executable(normalized) {
            await self.select_environment(normalized);
            window.showInformationMessage(f"Jac environment set to: {self.format_path(normalized)}");
        } else {
            action = await window.showErrorMessage("Invalid Jac executable.", "Retry", "Browse");
            if action == "Retry" {
                await self.handle_manual_path_entry();
            } elif action == "Browse" {
                await self.handle_file_browser();
            }
        }
    }

    async def handle_file_browser -> None {
        home_dir: str = env.HOME or env.USERPROFILE or "/";
        filters: dict = {"All Files": ["*"]};
        if platform == "win32" {
            filters = {"Executable Files": ["exe"], "All Files": ["*"]};
        }
        uris = await window.showOpenDialog({
            "canSelectFiles": True,
            "canSelectFolders": False,
            "canSelectMany": False,
            "openLabel": "Select Jac Executable",
            "filters": filters,
            "defaultUri": Uri.file(home_dir),
            "title": "Select Jac Executable"
        });
        if (not uris) or len(uris) == 0 {
            return;
        }
        selected = str(uris[0].fsPath);
        if await validate_jac_executable(selected) {
            await self.select_environment(selected);
            window.showInformationMessage(f"Jac environment set to: {self.format_path(selected)}");
        } else {
            action = await window.showErrorMessage(
                "Not a valid Jac executable.", "Try Again", "Enter Path Manually"
            );
            if action == "Try Again" {
                await self.handle_file_browser();
            } elif action == "Enter Path Manually" {
                await self.handle_manual_path_entry();
            }
        }
    }
}

glob:pub env_manager: EnvManager = EnvManager();
