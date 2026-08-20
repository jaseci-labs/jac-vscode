"""Recording stub of the `vscode` host module, in Jac.

Compiled to CJS and placed at .jac/node_modules/vscode/index.js so the
staged bundle's require('vscode') resolves to it during the headless
smoke test. Every API call is recorded into `__calls` for assertions.
"""

glob:pub __calls: list = [];

glob:pub StatusBarAlignment: dict = {"Left": 1, "Right": 2};
glob:pub QuickPickItemKind: dict = {"Separator": -1, "Default": 0};
glob:pub ConfigurationTarget: dict = {"Global": 1, "Workspace": 2};
glob:pub DiagnosticSeverity: dict = {"Error": 0, "Warning": 1};
glob:pub ViewColumn: dict = {"One": 1, "Two": 2, "Three": 3};

obj Terminal {
    has name: str;

    def show -> None {
        __calls.append(["terminal.show", self.name]);
    }

    def sendText(text: str) -> None {
        __calls.append(["terminal.sendText", text]);
    }
}

obj Registration {
    has cmd_id: str,
        fn: any;

    def dispose -> None {
        return;
    }
}

obj StatusBarItem {
    has text: str = "",
        tooltip: str = "",
        command: str = "";

    def show -> None {
        __calls.append(["statusbar.show", self.text]);
    }

    def dispose -> None {
        return;
    }
}

obj QuickPickStub {
    has title: str = "",
        placeholder: str = "",
        matchOnDescription: bool = False,
        ignoreFocusOut: bool = False,
        busy: bool = False,
        items: list = [],
        selectedItems: list = [],
        accept_handler: any = None,
        hide_handler: any = None;

    def show -> None {
        __calls.append(["quickpick.show"]);
    }

    def hide -> None {
        __calls.append(["quickpick.hide"]);
        if self.hide_handler {
            self.hide_handler();
        }
    }

    def onDidAccept(fn: any) -> None {
        self.accept_handler = fn;
    }

    def onDidHide(fn: any) -> None {
        self.hide_handler = fn;
    }

    def dispose -> None {
        return;
    }
}

# Deliberately a PLAIN OBJECT factory (not a class): the real extension
# host's OutputChannel is a frozen object literal, which is exactly the
# shape that makes Python-method poly dispatch dangerous (e.g. `.clear()`
# wiping the object). Keeping the stub plain catches that class of bug.
def _make_output_channel(name: str) -> dict {
    return {
        "name": name,
        "appendLine": lambda (text: str) -> None {},
        "clear": lambda -> None {},
        "show": lambda (preserve: any) -> None {},
        "dispose": lambda -> None {}
    };
}

glob terminals: list = [];
glob:pub __quickpicks: list = [];

def _noop -> None {
    return;
}

def _create_status_bar_item(align: any, priority: any) -> StatusBarItem {
    __calls.append(["createStatusBarItem", align, priority]);
    return StatusBarItem();
}

def _create_terminal(name: str) -> Terminal {
    term = Terminal(name=name);
    terminals.append(term);
    __calls.append(["createTerminal", name]);
    return term;
}

def _create_quick_pick -> QuickPickStub {
    qp = QuickPickStub();
    __quickpicks.append(qp);
    __calls.append(["createQuickPick"]);
    return qp;
}

def _create_output_channel(name: str) -> dict {
    __calls.append(["createOutputChannel", name]);
    return _make_output_channel(name);
}

def _show_information_message(msg: str) -> any {
    __calls.append(["info", msg]);
    return None;
}

def _show_warning_message(msg: str) -> any {
    __calls.append(["warn", msg]);
    return None;
}

def _show_error_message(msg: str) -> any {
    __calls.append(["error", msg]);
    return None;
}

def _register_command(command_id: str, fn: any) -> Registration {
    __calls.append(["registerCommand", command_id]);
    return Registration(cmd_id=command_id, fn=fn);
}

def _config_get(key: str, default_value: any) -> any {
    return default_value;
}

async def _config_update(key: str, value: any, target: any) -> None {
    __calls.append(["config.update", key, value]);
}

def _get_configuration(section: str) -> dict {
    return {"get": _config_get, "update": _config_update};
}

glob:pub window: dict = {
    "terminals": terminals,
    "activeTextEditor": None,
    "createStatusBarItem": _create_status_bar_item,
    "createTerminal": _create_terminal,
    "createQuickPick": _create_quick_pick,
    "createOutputChannel": _create_output_channel,
    "showInformationMessage": _show_information_message,
    "showWarningMessage": _show_warning_message,
    "showErrorMessage": _show_error_message
};

glob:pub workspace: dict = {
    "workspaceFolders": None,
    "getConfiguration": _get_configuration
};

glob:pub commands: dict = {"registerCommand": _register_command};

def _uri_parse(s: str) -> dict {
    __calls.append(["Uri.parse", s]);
    return {"fsPath": s};
}

def _uri_file(s: str) -> dict {
    return {"fsPath": s};
}

glob:pub Uri: dict = {"parse": _uri_parse, "file": _uri_file};

def _open_external(uri: any) -> None {
    __calls.append(["openExternal"]);
}

glob:pub env: dict = {"openExternal": _open_external};

glob:pub languages: dict = {"getDiagnostics": lambda (uri: any) -> list { return []; }};

def _on_debug_event(handler: any) -> Registration {
    __calls.append(["debug.subscribe"]);
    return Registration(cmd_id="debug-event", fn=handler);
}

glob:pub debug: dict = {
    "activeDebugSession": None,
    "onDidStartDebugSession": _on_debug_event,
    "onDidChangeActiveStackItem": _on_debug_event,
    "onDidTerminateDebugSession": _on_debug_event
};

# vscode-languageclient subclasses these host classes at module load; empty
# stand-ins keep `class X extends code.Y` from exploding under the stub.
obj:pub CompletionItem {}
obj:pub CodeLens {}
obj:pub DocumentLink {}
obj:pub CallHierarchyItem {}
obj:pub TypeHierarchyItem {}
obj:pub InlayHint {}
obj:pub Diagnostic {}
obj:pub SymbolInformation {}
obj:pub CodeAction {}
obj:pub Position {}
obj:pub Range {}
obj:pub Location {}
obj:pub TextEdit {}
obj:pub WorkspaceEdit {}
obj:pub SemanticTokens {}
obj:pub CancellationError {}
obj:pub EventEmitter {
    def fire(data: any) -> None {}
    def dispose -> None {}
}
obj:pub Disposable {
    def dispose -> None {}
}
