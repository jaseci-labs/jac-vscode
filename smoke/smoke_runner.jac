"""Headless smoke runner, in Jac.

Drives the full ported activation flow against the stub vscode module:
activate -> env manager init (real discovery + version detection) ->
status bar -> commands -> QuickPick selection -> terminal runner ->
deactivate. JAC_SMOKE_DISABLE_LSP=1 keeps the (real, bundled)
vscode-languageclient from spawning a server under the stub host.
"""
import from "node:module" { createRequire }
import from "node:path" { join }
import from "node:process" { env }

"""Matches production: vscode's Memento is a class instance, so the poly
dispatcher forwards get/update to the real methods (a plain dict would get
Python-dict semantics instead)."""
obj MementoStub {
    has store: dict = {};

    def get(key: str) -> any {
        return self.store[key];
    }

    def update(key: str, value: any) -> any {
        self.store[key] = value;
        return None;
    }
}

def calls_of_kind(all_calls: any, kind: str) -> list {
    found: list = [];
    for c in all_calls {
        if c[0] == kind {
            found.append(c);
        }
    }
    return found;
}

def find_command(subs: list, command_id: str) -> any {
    for s in subs {
        if s.cmd_id == command_id {
            return s;
        }
    }
    return None;
}

async def main -> None {
    stage: str = env.JAC_SMOKE_STAGE or "";
    assert stage, "JAC_SMOKE_STAGE env var not set";
    req = createRequire(join(stage, "anchor.js"));
    vs = req("vscode");
    ext = req("./extension.js");

    subs: list = [];
    memento = MementoStub();
    state: dict = memento.store;
    ctx = {"subscriptions": subs, "workspaceState": memento};
    api = await ext.activate(ctx);
    assert api, "activate returned nothing";

    # Env manager initialized: real discovery ran, status bar shows version.
    bars = calls_of_kind(vs.__calls, "statusbar.show");
    assert len(bars) > 0, "status bar never shown";
    final_bar: str = str(bars[-1][1]);
    assert "Jac (" in final_bar, f"status bar has no version: {final_bar}";
    assert state["jacEnvPath"], "no environment persisted to workspaceState";

    # All commands registered.
    expected = [
        "jaclang-extension.selectEnv", "jaclang-extension.runCurrentFile",
        "jaclang-extension.serveCurrentFile", "jaclang-extension.debugCurrentFile",
        "extension.jaclang-extension.getJacPath",
        "extension.jaclang-extension.getPythonPath",
        "jaclang-extension.toggleDeveloperMode",
        "jaclang-extension.restartLanguageServer", "jac.lintfixFormat",
        "jaclang-extension.inspectTokenScopes", "jaclang-extension.visualizeGraph"
    ];
    for cmd_id in expected {
        assert find_command(subs, cmd_id) is not None, f"{cmd_id} not registered";
    }

    # getJacPath returns the persisted env.
    get_path = find_command(subs, "extension.jaclang-extension.getJacPath");
    jac_path: str = str(get_path.fn());
    assert jac_path == str(state["jacEnvPath"]), "getJacPath disagrees with workspaceState";

    # Terminal runner (needs an active editor).
    vs.window.activeTextEditor = {
        "document": {
            "languageId": "jac",
            "uri": {"fsPath": "/tmp/smoke_probe.jac"}
        }
    };
    run_cmd = find_command(subs, "jaclang-extension.runCurrentFile");
    run_cmd.fn();
    sends = calls_of_kind(vs.__calls, "terminal.sendText");
    assert len(sends) == 1, "runCurrentFile sent nothing";
    sent: str = str(sends[0][1]);
    assert sent.endswith(' run "/tmp/smoke_probe.jac"'), f"unexpected terminal command: {sent}";
    run_cmd.fn();
    assert len(calls_of_kind(vs.__calls, "createTerminal")) == 1, "terminal not reused";

    # QuickPick selection round-trip: selectEnv -> pick the discovered env.
    select_cmd = find_command(subs, "jaclang-extension.selectEnv");
    select_cmd.fn();
    # The prompt discovers environments asynchronously; poll until items land.
    tries = 0;
    while len(vs.__quickpicks) == 0 and tries < 50 {
        await sleep_ms(100);
        tries += 1;
    }
    assert len(vs.__quickpicks) > 0, "selectEnv never created a QuickPick";
    qp: any = vs.__quickpicks[0];
    tries = 0;
    while len(qp.items) == 0 and tries < 100 {
        await sleep_ms(100);
        tries += 1;
    }
    assert len(qp.items) > 0, "QuickPick never populated";
    picked: any = None;
    for item in qp.items {
        if item["envPath"] and item["envPath"] not in ["manual", "browse"] {
            picked = item;
            break;
        }
    }
    assert picked is not None, "no selectable environment item";
    qp.selectedItems = [picked];
    qp.accept_handler();
    await sleep_ms(500);
    assert str(state["jacEnvPath"]) == str(picked["envPath"]), "selection not persisted";

    await ext.deactivate();
    print(f"SMOKE PASS - {len(vs.__calls)} vscode API calls");
    print(f"status bar: {final_bar}");
    print(f"runCurrentFile sent: {sent}");
    print(f"selected env: {state['jacEnvPath']}");
}

async def sleep_ms(ms: int) -> None {
    p: any = Promise(lambda (resolve: any, reject: any) -> None {
        setTimeout(resolve, ms);
    });
    await p;
}

with entry {
    main();
}
