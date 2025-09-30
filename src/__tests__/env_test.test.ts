/*
 * Jest tests for EnvManager class in a VSCode extension.
 */

import { EnvManager } from '../environment/manager';

import * as vscode from 'vscode';
import * as envDetection from '../utils/envDetection';

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


describe('EnvManager (Jest)', () => {
  let context: any;
  let envManager: EnvManager;

  beforeEach(() => {
    jest.clearAllMocks();
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
    console.log(`Default Jac path: ${path}`);
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
   * TEST 3: Manual path entry - successful validation
   * 
   * What we're testing:
   * - User can manually enter a path to a Jac executable
   * - Valid paths are accepted and saved
   * - Window reloads to apply the new environment
   */
  test('should accept manual path if validate passes', async () => {

    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('/fake/jac');

    // Execute the manual path entry workflow
    await (envManager as any).handleManualPathEntry();

    expect(envDetection.validateJacExecutable).toHaveBeenCalledWith('/fake/jac');
    expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/fake/jac');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  /**
   * TEST 4: Manual path entry - validation failure and retry
   * 
   * - Invalid paths are rejected with error message
   * - User is prompted to retry after entering invalid path
   * - Error handling works correctly in the retry flow
   */
  test('should reject invalid manual path and retry', async () => {

    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('/bad/jac')
      .mockResolvedValueOnce(undefined); 
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Retry');

    await (envManager as any).handleManualPathEntry();

    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(2);
  });

  /**
   * TEST 5: Successful environment selection from auto-detected environments
   * 
   * - Auto-detection finds available Jac environments
   * - User can select from a list of found environments
   * - Selected environment is saved and applied
   * 
   */
  test('should prompt environment selection when envs found', async () => {

    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(['/path/to/jac']);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      env: '/path/to/jac',
      label: 'Jac',
      description: '',
    });

    // Execute the environment selection workflow
    await envManager.promptEnvironmentSelection();

    expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/path/to/jac');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  /**
   * TEST 6: Warning displayed when no environments are found
   * 
   * - Appropriate warning is shown when no Jac environments are detected
   * - User gets helpful guidance when Jac is not installed
   * 
   */
  test('should show warning when no envs are found', async () => {

    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue([]);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

    await envManager.promptEnvironmentSelection();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "No Jac environments found. Install Jac to enable syntax highlighting, IntelliSense, and debugging!",
      "Install Jac Now",
      "Enter Jac Path Manually",
      "Cancel"
    );
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
   * - New environment selection is prompted
   * 
   */
  test('should handle invalid saved environment during init', async () => {

    context.globalState.get.mockReturnValue('/invalid/jac/path');
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Select New Environment');

    await envManager.init();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        `The previously selected Jac environment is no longer valid: /invalid/jac/path`,
        'Select New Environment');
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
});
