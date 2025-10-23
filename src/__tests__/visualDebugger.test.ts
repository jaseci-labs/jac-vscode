/*
 * Jest tests for Visual Debugger functionality in VSCode extension.
 */

import { setupVisualDebuggerWebview } from '../webview/visualDebugger';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';

// Mock the visual debugger module
jest.mock('../visual_debugger/visdbg', () => ({
  makeWebView: jest.fn(),
  getDebugGraphData: jest.fn(),
}));

// Mock the vscode module
jest.mock('vscode', () => ({
  commands: { registerCommand: jest.fn() },
  debug: {
    onDidStartDebugSession: jest.fn(),
    onDidChangeActiveStackItem: jest.fn(),
    onDidTerminateDebugSession: jest.fn(),
  },
}));

describe('Visual Debugger (Essential Tests Only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should register visualize command with correct ID', () => {
    const context: any = { subscriptions: [] };

    setupVisualDebuggerWebview(context);

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      COMMANDS.VISUALIZE,
      expect.any(Function)
    );
  });
});