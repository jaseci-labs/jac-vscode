/*
 * Jest tests for EnvManager class in a VSCode extension.
 */

import { EnvManager } from '../environment/manager';

import * as vscode from 'vscode';
import * as envDetection from '../utils/envDetection';
import { getLspManager, createAndStartLsp } from '../extension';


// Inline mock for vscode-languageclient
jest.mock('vscode-languageclient/node', () => {
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
jest.mock('vscode', () => {
  const statusBarItem = {
    show: jest.fn(),
    hide: jest.fn(),
    text: '',
    tooltip: '',
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
      workspaceFolders: [
        { uri: { fsPath: '/mock/workspace' } }
      ],
    },
  };
});

jest.mock('../utils/envDetection', () => ({
  findPythonEnvsWithJac: jest.fn(),
  validateJacExecutable: jest.fn(),
}));

// Mock the LspManager class
const mockLspManager = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  restart: jest.fn().mockResolvedValue(undefined),
  getClient: jest.fn().mockReturnValue(undefined),
};

// Mock the extension module
jest.mock('../extension', () => ({
  getLspManager: jest.fn(() => mockLspManager),
  createAndStartLsp: jest.fn().mockResolvedValue(undefined),
}));


describe('EnvManager (Jest)', () => {
  let context: any;
  let envManager: EnvManager;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset LSP manager mock
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
   * TEST-1: Default behavior when no environment is configured
   *
   * - EnvManager should provide a sensible default when no Jac environment is saved
   * - The default should be platform-appropriate ('jac.exe' on Windows, 'jac' on Unix)
   *
   */
  test('should fallback to jac in PATH if no saved env', () => {
    // Call the method that should return the Jac executable path
    const path = envManager.getJacPath();

    // Verify it returns the appropriate platform-specific default
    expect(path).toBe(process.platform === 'win32' ? 'jac.exe' : 'jac');
  });

  /**
   * TEST 2: Status bar updates correctly when environment is set
   *
   * - Status bar text is updated to show current Jac environment
   * - Status bar is properly displayed to the user
   *
   */
  test('should update status bar when jacPath is set', () => {

    (envManager as any).jacPath = '/usr/local/bin/jac';

    envManager.updateStatusBar();
    expect((envManager as any).statusBar.text).toContain('$(check) Jac (Global)');
  });

  /**
   * TEST 3: Manual path entry - successful validation - No LSP manager
   *
   * What we're testing:
   * - User can manually enter a path to a Jac executable
   * - Valid paths are accepted and saved
   * - LSP manager is created and started when not already running
   */
  test('should accept manual path if validate passes', async () => {
    (getLspManager as jest.Mock).mockReturnValue(undefined);

    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('/fake/jac');

    // Execute the manual path entry workflow
    await (envManager as any).handleManualPathEntry();

    expect(envDetection.validateJacExecutable).toHaveBeenCalledWith('/fake/jac');
    expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/fake/jac');

    // first message: set env
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Jac environment set to: /fake/jac'
    );
    // LSP is created and started when manager doesn't exist
    expect(createAndStartLsp).toHaveBeenCalledTimes(1);
  });

  /**
   * TEST 4: Manual path entry - validation failure and retry
   *
   * - Invalid paths are rejected with error message
   * - User is prompted to retry after entering invalid path
   * - Error handling works correctly in the retry flow
   * - And he escapes by cancelling the input box
   */
  test('should reject invalid manual path and retry', async () => {

    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('/bad/jac') // first try
      .mockResolvedValueOnce(undefined); // user cancels on retry

    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Retry');

    await (envManager as any).handleManualPathEntry();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Invalid Jac executable: /bad/jac',
      'Retry',
      'Browse for File'
    );
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(2);
  });

  /**
   * TEST 5: Successful environment selection from auto-detected environments
   *
   * - Auto-detection finds available Jac environments
   * - User can select from a list of found environments
   * - Selected environment is saved and applied
   * - LSP manager is created and started when not already running
   */
  test('should prompt environment selection when envs found', async () => {
    (getLspManager as jest.Mock).mockReturnValue(undefined);

    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(['/path/to/jac']);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      env: '/path/to/jac',
      label: 'Jac (MyEnv)',
      description: '/path/to/jac',
    });

    // Execute the environment selection workflow
    await envManager.promptEnvironmentSelection();

    expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/path/to/jac');

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Selected Jac environment: Jac (MyEnv)',
      { detail: 'Path: /path/to/jac' }
    );

    expect(createAndStartLsp).toHaveBeenCalledTimes(1);
  });

  /**
   * TEST 6: Warning displayed when no environments are found
   *
   * Updated behavior:
   * - Shows non-blocking warning with only 'Install Jac Now'
   * - STILL shows QuickPick (manual/browse options)
   */
  test('should show warning when no envs are found and still show QuickPick', async () => {

    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue([]);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined); // user cancels

    await envManager.promptEnvironmentSelection();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'No Jac environments found. You can install Jac, or select a Jac executable manually.',
      'Install Jac Now'
    );

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(context.globalState.update).not.toHaveBeenCalled();
  });

  /**
   * TEST 7: Initialization with saved environment path
   *
   * - EnvManager correctly loads a previously saved environment path
   * - Status bar is updated with the saved environment
   * - No prompting occurs when valid saved environment exists
   *
   */
  test('should initialize with saved environment path', async () => {

    context.globalState.get.mockReturnValue('/saved/jac/path');
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);

    await envManager.init();

    expect(envDetection.validateJacExecutable).toHaveBeenCalledWith('/saved/jac/path');
    expect((envManager as any).statusBar.text).toContain('Jac');
  });

  /**
   * TEST 8: Initialization handles invalid saved environment
   *
   * - Invalid saved environments are detected and cleared
   * - User is warned about the invalid environment
   */
  test('should handle invalid saved environment during init', async () => {
    context.globalState.get.mockReturnValue('/invalid/jac/path');
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

    await envManager.init();

    expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', undefined);
    expect((envManager as any).statusBar.text).toContain('No Env');
  });

  /**
   * TEST 9: User cancels environment selection
   *
   * - Graceful handling when user cancels the environment selection dialog
   * - Status bar still updates appropriately even when user cancels
   * - No errors occur when user dismisses dialogs
   *
   */
  test('should handle user cancellation of environment selection', async () => {

    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(['/path/to/jac']);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await envManager.promptEnvironmentSelection();

    expect(context.globalState.update).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  /**
   * TEST 10: LSP restart without VSCode reload on environment change
   *
   * - When LSP manager is available, it should restart the language server
   * - Environment change is saved to global state
   */
  test("restarts LSP when manager exists", async () => {
    (getLspManager as jest.Mock).mockReturnValue(mockLspManager);
    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(['/new/jac/path']);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      env: '/new/jac/path',
      label: 'Jac (NewEnv)',
      description: '/new/jac/path',
    });

    await envManager.promptEnvironmentSelection();

    expect(mockLspManager.restart).toHaveBeenCalledTimes(1);
  });

  /**
   * TEST 11: LSP restart on manual path entry
   *
   * - Valid manual path is saved to global state
   * - LSP is restarted if manager exists
   */
  test("manual path success restarts LSP if manager exists", async () => {
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue("/manual/jac");

    (getLspManager as jest.Mock).mockReturnValue(mockLspManager);

    await (envManager as any).handleManualPathEntry();
    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/manual/jac");
    expect(mockLspManager.restart).toHaveBeenCalledTimes(1);
  });

  /**
   * TEST 12: File browser path selection without LSP
   *
   * - User can browse and select Jac executable via file dialog
   * - Selected path is validated and saved to global state
   * - LSP manager is created and started when not already running
   */
  test("file browser success with no LSP", async () => {
    (getLspManager as jest.Mock).mockReturnValue(undefined);
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
      { fsPath: "/browser/jac" },
  ]);

    await (envManager as any).handleFileBrowser();

    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/browser/jac");
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Jac environment set to: /browser/jac'
    );

    expect(createAndStartLsp).toHaveBeenCalledTimes(1);
  });

  /**
   * TEST 13: LSP restart on file browser selection
   *
   * - Path selected via file browser is saved to global state
   * - LSP is restarted if manager exists
   */
  test("file browser success restarts LSP if manager exists", async () => {
    (getLspManager as jest.Mock).mockReturnValue(mockLspManager);
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
      { fsPath: "/browser/jac" },
    ]);

    await (envManager as any).handleFileBrowser();

    expect(context.globalState.update).toHaveBeenCalledWith("jacEnvPath", "/browser/jac");
    expect(mockLspManager.restart).toHaveBeenCalledTimes(1);
  });
});