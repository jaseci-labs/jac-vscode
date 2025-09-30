// __mocks__/vscode.ts
const vscode = {
  window: {
    createStatusBarItem: jest.fn().mockImplementation(() => {
      const item: any = {
        show: jest.fn(),
        hide: jest.fn(),
        text: '',
        tooltip: '',
        command: undefined, // must be writable
      };
      return item;
    }),
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
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  workspace: {
    workspaceFolders: [
      {
        uri: {
          fsPath: '/mock/workspace',
        },
      },
    ],
  },
};

module.exports = vscode;
