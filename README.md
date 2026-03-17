# Jac Extension

This extension provides support for the [Jac](https://doc.jaseci.org) programming language. It provides syntax highlighting and leverages the LSP to provide a rich editing experience.

# Quick Start

All that is needed is to have jac installed (i.e. `pip install jaclang`) and the `jac` command line tool present in your environment.

## Installation

| Marketplace | Link |
|-------------|------|
| VS Code Marketplace | [jaseci-labs.jaclang-extension](https://marketplace.visualstudio.com/items?itemName=jaseci-labs.jaclang-extension) |
| Open VSX Registry | [jaseci-labs/jaclang-extension](https://open-vsx.org/extension/jaseci-labs/jaclang-extension) |

**Supported IDEs:** VS Code, Cursor, Windsurf, VSCodium, Gitpod, Eclipse Theia

1. Open the Extensions panel - `Ctrl+Shift+X` / `Cmd+Shift+X`
2. Search **`jaclang`**
3. Click **Install** on "Jac" by Jaseci Labs

**Manual Install (VSIX):** Download from [GitHub Releases](https://github.com/Jaseci-Labs/jac-vscode/releases/latest), then use **Extensions: Install from VSIX...** in Command Palette.

# Debugging Jaclang

Note that it'll install [python extention for vscode](https://marketplace.visualstudio.com/items?itemName=ms-python.python) as a dependecy as it is needed to debug the python bytecode that jaclang produce.

To debug a jac file a launch.json file needs to created with the debug configurations. This can simply generated with:
1. Goto the debug options at the left pannel.
2. click "create a launch.json file"
3. Select `Jac Debug` Option

This will create a debug configration to run and debug a single jac file, Here is the default sinppit, modify it as your
preference to debug different types of applications or modules.

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "debugpy",
            "request": "launch",
            "name": "Run a jac file",
            "program": "${command:extension.jaclang-extension.getJacPath}",
            "args": "run ${file}"
        }
    ]
}
```

This animated GIF bellow will demonstrate on the steps discuessed above.

![Animation](https://github.com/user-attachments/assets/dcf808a4-b54e-4079-9948-9e88e6b0559e)

To visualize the Jac graph while debugging, open the graph visualize view using the command `jacvis: Visualize Jac Graph` in the command palette, (shortcut for command palette is `ctrl+shift+p`)

<img src="https://github.com/user-attachments/assets/f763fe86-33b5-4254-bb72-34c069d0f0c8" width="100%">

# Features

- Code completion
- Syntax highlighting
- Snippets
- Go to definition
- Document symbols, workspace symbols
- Variables hint, and documentation on hover
- Diagnostics

# Developer Mode

Developer mode enables additional tools for extension development and debugging. To enable it:

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `Jac: Toggle Developer Mode`

When enabled, the following features become available:

- **Restart Language Server** - Button in editor title bar to restart the LSP server
- **Inspect Token Scopes** - Dumps all TextMate token scopes for the current Jac file to help debug syntax highlighting

# Releasing (Maintainers)

1. Go to **Actions** → **Create Release PR**
2. Select version bump type (patch/minor/major)
3. A PR will be created with the version bump
4. Review and merge the PR
5. Go to **Actions** → **Release Extension**
6. Click **Run workflow** to publish to VS Code Marketplace and OpenVSX
