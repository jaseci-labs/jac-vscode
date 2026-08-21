"""Visual debugger (port of src/webview/visualDebugger.ts +
src/visual_debugger/visdbg.ts).

A webview panel rendering the Jac object graph, refreshed from the active
debugpy session via DAP customRequests. The webview page itself is a
browser-context asset (assets/webview/index.html). Fixes the TS version's
__dirname-relative HTML path, which broke in bundled builds -- the page now
loads from the extension install dir.
"""
import from "vscode" { window, commands, debug, ViewColumn }
import from "node:fs" { readFileSync }
import from "node:path" { join }
import from .constants { CMD_VISUALIZE }

obj VisualDebugger {
    has panel: any = None;

    def make_webview(extension_path: str) -> any {
        panel = window.createWebviewPanel(
            "jacvisWebview", "Jac Visual Debugger", ViewColumn.Two,
            {"enableScripts": True}
        );
        html_path = join(extension_path, "assets", "webview", "index.html");
        panel.webview.html = str(readFileSync(html_path, "utf8"));
        return panel;
    }

    async def get_debug_graph_data -> any {
        session = debug.activeDebugSession;
        if not session {
            return None;
        }
        threads: any = await session.customRequest("threads");
        if (not threads) or (not threads.threads) or len(threads.threads) == 0 {
            window.showErrorMessage("No active threads found.");
            return None;
        }
        thread_id = threads.threads[0].id;
        stack: any = await session.customRequest("stackTrace", {"threadId": thread_id});
        if (not stack) or (not stack.stackFrames) or len(stack.stackFrames) == 0 {
            window.showErrorMessage("No stack frames found");
            return None;
        }
        frame_id = stack.stackFrames[0].id;
        # Evaluate inside the debuggee: import printgraph from the Jac runtime
        # builtins so retrieval works even when not imported in the frame.
        response: any = await session.customRequest("evaluate", {
            "expression": "__import__('jaclang.runtimelib.builtin', fromlist=['printgraph']).printgraph(format='json')",
            "frameId": frame_id,
            "context": "clipboard"
        });
        try {
            raw: str = str(response.result).replace("\\'", "'");
            # The evaluate result is a quoted JSON string; strip the quotes.
            return JSON.parse(raw[1:-1]);
        } except Exception {
            window.showErrorMessage(f"Error parsing: {response.result}");
        }
        return None;
    }

    async def post_graph(command: str) -> None {
        if not self.panel {
            return;
        }
        data = await self.get_debug_graph_data();
        if data is not None {
            self.panel.webview.postMessage({"command": command, "data": data});
        }
    }
}

glob vis: VisualDebugger = VisualDebugger();

def:pub setup_visual_debugger_webview(context: any) -> None {
    extension_path: str = str(context.extensionPath);
    context.subscriptions.push(
        commands.registerCommand(CMD_VISUALIZE, lambda {
            if vis.panel {
                vis.panel.reveal();
            } else {
                vis.panel = vis.make_webview(extension_path);
                vis.panel.onDidDispose(lambda {
                    vis.panel = None;
                });
            }
        })
    );
    debug.onDidStartDebugSession(lambda (session: any) {
        vis.post_graph("init");
    });
    debug.onDidChangeActiveStackItem(lambda (item: any) {
        vis.post_graph("update");
    });
    debug.onDidTerminateDebugSession(lambda (session: any) {
        if vis.panel {
            vis.panel.webview.postMessage({"command": "clear"});
        }
    });
}
