import { EnvManager } from '../environment/manager';

import * as vscode from 'vscode';
import * as envDetection from '../utils/envDetection';

/**
 * @jest-environment node
 */
// Inline mock for 'vscode' to avoid recursive require issues. Must appear before imports.
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

// Mock envDetection before importing EnvManager so its imports are mocked
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

  test('should fallback to jac in PATH if no saved env', () => {
    const path = envManager.getJacPath();
    expect(path).toBe(process.platform === 'win32' ? 'jac.exe' : 'jac');
  });

  test('should update status bar when jacPath is set', () => {
    (envManager as any).jacPath = '/usr/local/bin/jac';
    envManager.updateStatusBar();
    expect((envManager as any).statusBar.text).toContain('Jac');
  });

  test('should accept manual path if validate passes', async () => {
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('/fake/jac');

    await (envManager as any).handleManualPathEntry();

    expect(envDetection.validateJacExecutable).toHaveBeenCalledWith('/fake/jac');
    expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/fake/jac');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  test('should reject invalid manual path and retry', async () => {
    (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('/bad/jac')  // First call returns bad path
      .mockResolvedValueOnce(undefined);  // Second call (retry) user cancels
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Retry');

    await (envManager as any).handleManualPathEntry();

    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(2); // Should be called twice
  });

  test('should prompt environment selection when envs found', async () => {
    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue(['/path/to/jac']);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      env: '/path/to/jac',
      label: 'Jac',
      description: '',
    });

    await envManager.promptEnvironmentSelection();

    expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/path/to/jac');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  test('should show warning when no envs are found', async () => {
    (envDetection.findPythonEnvsWithJac as jest.Mock).mockResolvedValue([]);

    await envManager.promptEnvironmentSelection();

    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });
});
