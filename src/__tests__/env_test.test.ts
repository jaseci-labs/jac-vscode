/*
 * Jest tests for EnvManager class in a VSCode extension.
 */

import { EnvManager } from "../environment/manager";

import * as vscode from "vscode";
import * as envDetection from "../utils/envDetection";
import { getLspManager } from "../extension";

// Inline mock for vscode-languageclient
jest.mock("vscode-languageclient/node", () => {
  return {
    LanguageClient: class {
      start = jest.fn();
      stop = jest.fn();
      dispose = jest.fn();
    },
    LanguageClientOptions: jest.fn(),
    ServerOptions: jest.fn(),
  };
});

// Mock the vscode module to simulate VSCode API behavior
jest.mock("vscode", () => {
  const statusBarItem = {
    show: jest.fn(),
    hide: jest.fn(),
    text: "",
    tooltip: "",
    command: undefined,
  };

  return {
    window: {
      createStatusBarItem: () => statusBarItem,
      showWarningMessage: jest.fn(),
      showInformationMessage: jest.fn(),
      showErrorMessage: jest.fn(),
      showQuickPick: jest.fn(),
      showInputBox: jest.fn(),
      showOpenDialog: jest.fn(),
    },
    commands: {
      executeCommand: jest.fn(),
    },
    env: {
      openExternal: jest.fn(),
    },
    Uri: {
      parse: jest.fn((str: string) => ({ fsPath: str, toString: () => str })),
      file: jest.fn((str: string) => ({ fsPath: str, toString: () => str })),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: "/mock/workspace" } }],
    },
  };
});

jest.mock("../utils/envDetection", () => ({
  findPythonEnvsWithJac: jest.fn(),
  validateJacExecutable: jest.fn(),
}));

// Mock LspManager instance
const mockLspManager = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  restart: jest.fn().mockResolvedValue(undefined),
  getClient: jest.fn().mockReturnValue(undefined),
};

// IMPORTANT: default to NO LSP manager (so default flow is reloadWindow)
jest.mock("../extension", () => ({
  getLspManager: jest.fn(() => undefined),
}));

describe("EnvManager (Jest) - updated", () => {
  let context: any;
  let envManager: EnvManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLspManager.start.mockClear();
    mockLspManager.stop.mockClear();
    mockLspManager.restart.mockClear();
    mockLspManager.getClient.mockClear();

    context = {
      globalState: {
        get: jest.fn().mockReturnValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
      subscriptions: [],
    };

    envManager = new EnvManager(context);
  });

  /**
   * TEST 1: Default behavior when no environment is configured
   */
  test("should fallback to jac in PATH if no saved env", () => {
    const jac = envManager.getJacPath();
    expect(jac).toBe(process.platform === "win32" ? "jac.exe" : "jac");
  });

  /**
   * TEST 2: Status bar updates correctly when environment is set
   */
  test("should update status bar when jacPath is set", () => {
    (envManager as any).jacPath = "/usr/local/bin/jac";

    envManager.updateStatusBar();

    expect((envManager as any).statusBar.text).toContain("$(check) Jac (Global)");
  });

  /**
   * TEST 3: Manual path entry - successful validation (direct private call)
   */
  test("should accept manual path if validate passes (fallback reload when no LSP)", async () => {
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue("/fake/jac");

    await (envManager as any).handleManualPathEntry();

    expect(envDetection.validateJacExecutable).toHaveBeenCalledWith("/fake/jac");
    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/fake/jac");

    // first message: set env
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Jac environment set to: /fake/jac"
    );

    // fallback message + reload
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Reloading window to apply environment changes..."
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.reloadWindow");
  });

  /**
   * TEST 4: Manual path entry - validation failure and retry
   */
  test("should reject invalid manual path and retry", async () => {
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);

    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce("/bad/jac") // first try
      .mockResolvedValueOnce(undefined); // user cancels on retry

    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue("Retry");

    await (envManager as any).handleManualPathEntry();

    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(2);
  });

  /**
   * TEST 5: Successful environment selection from auto-detected environments
   */
  test("should prompt environment selection when envs found (fallback reload when no LSP)", async () => {
    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(["/path/to/jac"]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      env: "/path/to/jac",
      label: "Jac (MyEnv)",
      description: "/path/to/jac",
    });

    await envManager.promptEnvironmentSelection();

    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/path/to/jac");

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Selected Jac environment: Jac (MyEnv)",
      { detail: "Path: /path/to/jac" }
    );

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Reloading window to apply environment changes..."
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.reloadWindow");
  });

  /**
   * TEST 6: Warning displayed when no environments are found
   *
   * Updated behavior:
   * - Shows non-blocking warning with only "Install Jac Now"
   * - STILL shows QuickPick (manual/browse options)
   */
  test("should show warning when no envs are found and still show QuickPick", async () => {
    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue([]);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined); // user cancels

    await envManager.promptEnvironmentSelection();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "No Jac environments found. You can install Jac, or select a Jac executable manually.",
      "Install Jac Now"
    );

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(context.globalState.update).not.toHaveBeenCalled();
  });

  /**
   * TEST 7: Initialization with saved environment path (valid)
   */
  test("should initialize with saved environment path", async () => {
    context.globalState.get.mockReturnValue("/saved/jac/path");
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);

    await envManager.init();

    expect(envDetection.validateJacExecutable).toHaveBeenCalledWith("/saved/jac/path");
    expect((envManager as any).statusBar.text).toContain("Jac");
  });

  /**
   * TEST 8: Initialization handles invalid saved environment
   */
  test("should handle invalid saved environment during init", async () => {
    context.globalState.get.mockReturnValue("/invalid/jac/path");
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);

    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue([]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await envManager.init();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "The previously selected Jac environment is no longer valid: /invalid/jac/path",
      "Select New Environment"
    );
    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", undefined);
    expect((envManager as any).statusBar.text).toContain("No Env");
  });

  /**
   * TEST 9: User cancels environment selection
   */
  test("should handle user cancellation of environment selection", async () => {
    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(["/path/to/jac"]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await envManager.promptEnvironmentSelection();

    expect(context.globalState.update).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  /**
   * TEST 10: Language server restart (no reload) when LSP manager exists
   */
  test("should restart language server without VSCode reload when environment changes", async () => {
    (getLspManager as jest.Mock).mockReturnValue(mockLspManager);

    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(["/new/jac/path"]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      env: "/new/jac/path",
      label: "Jac (NewEnv)",
      description: "/new/jac/path",
    });

    await envManager.promptEnvironmentSelection();

    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/new/jac/path");

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Selected Jac environment: Jac (NewEnv)",
      { detail: "Path: /new/jac/path" }
    );

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Restarting Jac Language Server to apply environment changes..."
    );

    expect(mockLspManager.restart).toHaveBeenCalledTimes(1);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith("workbench.action.reloadWindow");
  });

  /**
   * TEST 11: Fallback to VSCode reload when LSP manager is unavailable
   */
  test("should fallback to VSCode reload when LSP manager unavailable", async () => {
    (getLspManager as jest.Mock).mockReturnValue(undefined);

    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(["/another/jac/path"]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      env: "/another/jac/path",
      label: "Jac (AnotherEnv)",
      description: "/another/jac/path",
    });

    await envManager.promptEnvironmentSelection();

    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/another/jac/path");
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Reloading window to apply environment changes..."
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.reloadWindow");
    expect(mockLspManager.restart).not.toHaveBeenCalled();
  });

  /**
   * TEST 12: LSP restart failure => shows error + warning + reloadWindow
   */
  test("should handle LSP restart failure and fallback to reload", async () => {
    const mockError = new Error("LSP restart failed");
    mockLspManager.restart.mockRejectedValue(mockError);
    (getLspManager as jest.Mock).mockReturnValue(mockLspManager);

    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(["/failing/jac/path"]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      env: "/failing/jac/path",
      label: "Jac (FailingEnv)",
      description: "/failing/jac/path",
    });

    await envManager.promptEnvironmentSelection();

    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/failing/jac/path");

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Failed to restart language server: LSP restart failed"
    );
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "Falling back to window reload..."
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.reloadWindow");
  });

  /**
   * TEST 13: Manual path entry with successful LSP restart
   */
  test("should restart LSP after successful manual path entry", async () => {
    (getLspManager as jest.Mock).mockReturnValue(mockLspManager);

    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue("/manual/jac/path");

    await (envManager as any).handleManualPathEntry();

    expect(envDetection.validateJacExecutable).toHaveBeenCalledWith("/manual/jac/path");
    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/manual/jac/path");

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Jac environment set to: /manual/jac/path"
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Restarting Jac Language Server to apply environment changes..."
    );

    expect(mockLspManager.restart).toHaveBeenCalledTimes(1);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith("workbench.action.reloadWindow");
  });

  /**
   * TEST 14: File browser selection with successful LSP restart
   */
  test("should restart LSP after successful file browser selection", async () => {
    (getLspManager as jest.Mock).mockReturnValue(mockLspManager);

    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: "/browser/selected/jac" }]);

    await (envManager as any).handleFileBrowser();

    expect(envDetection.validateJacExecutable).toHaveBeenCalledWith("/browser/selected/jac");
    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/browser/selected/jac");

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Jac environment set to: /browser/selected/jac"
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Restarting Jac Language Server to apply environment changes..."
    );

    expect(mockLspManager.restart).toHaveBeenCalledTimes(1);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith("workbench.action.reloadWindow");
  });
});
