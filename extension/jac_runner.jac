"""Terminal runner (port of src/utils/jacRunner.ts): reuses (or creates)
the shared "Jac Terminal" and sends `<jac> <command> "<file>"` for the
active editor's file."""
import from "vscode" { window }
import from .constants { TERMINAL_NAME }

def:pub run_jac_command_for_current_file(command: str, jac_path: str) -> None {
    editor = window.activeTextEditor;
    if not editor {
        return;
    }
    file_path = editor.document.uri.fsPath;
    if not file_path {
        return;
    }
    terminal: any = None;
    open_terminals: any = window.terminals;
    for t in open_terminals {
        if t.name == TERMINAL_NAME {
            terminal = t;
            break;
        }
    }
    if not terminal {
        terminal = window.createTerminal(TERMINAL_NAME);
    }
    terminal.show();
    terminal.sendText(f'{jac_path} {command} "{file_path}"');
}
