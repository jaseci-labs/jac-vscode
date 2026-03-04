import { EnvManager } from '../environment/manager';
import * as vscode from 'vscode';
import * as envDetection from '../utils/envDetection';
import * as envVersion from '../utils/envVersion';
import { getLspManager, createAndStartLsp } from '../extension';

// ── Module Mocks ──────────────────────────────────────────────────────────────

jest.mock('vscode-languageclient/node', () => ({
    LanguageClient: class {
        start = jest.fn();
        stop = jest.fn();
        dispose = jest.fn();
    },
    LanguageClientOptions: jest.fn(),
    ServerOptions: jest.fn(),
}));

const mockQuickPick = {
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
    onDidAccept: jest.fn(),
    onDidHide: jest.fn(),
    items: [] as any[],
    selectedItems: [] as any[],
    title: '',
    placeholder: '',
    busy: false,
    matchOnDescription: false,
    ignoreFocusOut: false,
};

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
            createQuickPick: jest.fn(() => mockQuickPick),
            showWarningMessage: jest.fn().mockResolvedValue(undefined),
            showInformationMessage: jest.fn().mockResolvedValue(undefined),
            showErrorMessage: jest.fn(),
            showQuickPick: jest.fn(),
            showInputBox: jest.fn(),
            showOpenDialog: jest.fn(),
        },
        commands: { executeCommand: jest.fn() },
        env: { openExternal: jest.fn() },
        Uri: {
            parse: jest.fn((str: string) => ({ fsPath: str, toString: () => str })),
            file: jest.fn((str: string) => ({ fsPath: str, toString: () => str })),
        },
        StatusBarAlignment: { Left: 1, Right: 2 },
        QuickPickItemKind: { Separator: -1 },
        workspace: {
            workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
            textDocuments: [],
            onDidOpenTextDocument: jest.fn(),
        },
    };
});

jest.mock('../utils/envDetection', () => ({
    discoverJacEnvironments: jest.fn(),
    validateJacExecutable: jest.fn(),
}));

jest.mock('../utils/envVersion', () => ({
    getJacVersion: jest.fn(),
    // Plain function (not jest.fn) so clearAllMocks() cannot wipe the implementation
    compareVersions: (a: string, b: string) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
            if (diff !== 0) return diff;
        }
        return 0;
    },
}));

const mockLspManager = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    restart: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn().mockReturnValue(undefined),
};

jest.mock('../extension', () => ({
    getLspManager: jest.fn(() => mockLspManager),
    createAndStartLsp: jest.fn().mockResolvedValue(undefined),
}));

// ── Shared Setup ──────────────────────────────────────────────────────────────

function makeContext(): any {
    return {
        globalState: {
            get: jest.fn().mockReturnValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
        },
        subscriptions: [],
    };
}

function resetQuickPickMock() {
    mockQuickPick.items = [];
    mockQuickPick.selectedItems = [];
    mockQuickPick.onDidAccept.mockImplementation((cb: Function) => {
        (mockQuickPick as any)._onAccept = cb;
        return { dispose: jest.fn() };
    });
    mockQuickPick.onDidHide.mockImplementation((cb: Function) => {
        (mockQuickPick as any)._onHide = cb;
        return { dispose: jest.fn() };
    });
}

// ── EnvManager Core ───────────────────────────────────────────────────────────

describe('EnvManager', () => {
    let context: ReturnType<typeof makeContext>;
    let envManager: EnvManager;

    beforeEach(() => {
        jest.clearAllMocks();
        resetQuickPickMock();
        context = makeContext();
        envManager = new EnvManager(context);
    });

    // ── init() ────────────────────────────────────────────────────────────────

    describe('init()', () => {
        test('loads a valid saved environment and does not call silentAutoSelect', async () => {
            context.globalState.get.mockReturnValue('/saved/jac');
            (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
            (envVersion.getJacVersion as jest.Mock).mockResolvedValue('0.11.0');

            await envManager.init();

            expect(envDetection.validateJacExecutable).toHaveBeenCalledWith('/saved/jac');
            expect(envDetection.discoverJacEnvironments).not.toHaveBeenCalled();
            expect((envManager as any).statusBar.text).toContain('Jac');
        });

        test('clears an invalid saved environment and falls through to silentAutoSelect', async () => {
            context.globalState.get.mockReturnValue('/invalid/jac');
            (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);
            (envDetection.discoverJacEnvironments as jest.Mock).mockResolvedValue([]);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            await envManager.init();

            expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', undefined);
            expect(envDetection.discoverJacEnvironments).toHaveBeenCalled();
            expect((envManager as any).statusBar.text).toContain('No Env');
        });

        test('runs silentAutoSelect when no saved environment exists', async () => {
            context.globalState.get.mockReturnValue(undefined);
            (envDetection.discoverJacEnvironments as jest.Mock).mockResolvedValue([]);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            await envManager.init();

            expect(envDetection.discoverJacEnvironments).toHaveBeenCalled();
        });
    });

    // ── silentAutoSelect() ────────────────────────────────────────────────────

    describe('silentAutoSelect()', () => {
        test('silently selects the only environment found without showing any UI', async () => {
            (envDetection.discoverJacEnvironments as jest.Mock).mockResolvedValue([
                { path: '/envs/venv/bin/jac', type: 'venv' },
            ]);
            (envVersion.getJacVersion as jest.Mock).mockResolvedValue('0.11.0');

            await (envManager as any).silentAutoSelect();

            expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/envs/venv/bin/jac');
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        test('selects the environment with the highest version when multiple are found', async () => {
            (envDetection.discoverJacEnvironments as jest.Mock).mockResolvedValue([
                { path: '/envs/old/bin/jac', type: 'venv' },
                { path: '/envs/new/bin/jac', type: 'venv' },
                { path: '/envs/mid/bin/jac', type: 'venv' },
            ]);
            // Values consumed in Promise.all call order: old=0.9.0, new=0.12.0, mid=0.11.0
            (envVersion.getJacVersion as jest.Mock)
                .mockResolvedValueOnce('0.9.0')
                .mockResolvedValueOnce('0.12.0')
                .mockResolvedValueOnce('0.11.0');

            await (envManager as any).silentAutoSelect();

            expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/envs/new/bin/jac');
        });

        test('selects the first environment when versions are equal (stable tie-break)', async () => {
            (envDetection.discoverJacEnvironments as jest.Mock).mockResolvedValue([
                { path: '/envs/first/bin/jac', type: 'venv' },
                { path: '/envs/second/bin/jac', type: 'venv' },
            ]);
            (envVersion.getJacVersion as jest.Mock).mockResolvedValue('0.11.0');

            await (envManager as any).silentAutoSelect();

            expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/envs/first/bin/jac');
        });

        test('falls back to the first environment when none have a detectable version', async () => {
            (envDetection.discoverJacEnvironments as jest.Mock).mockResolvedValue([
                { path: '/envs/a/bin/jac', type: 'venv' },
                { path: '/envs/b/bin/jac', type: 'venv' },
            ]);
            (envVersion.getJacVersion as jest.Mock).mockResolvedValue(undefined);

            await (envManager as any).silentAutoSelect();

            expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/envs/a/bin/jac');
        });

        test('shows a toast with Install/Select options when no environments are found', async () => {
            (envDetection.discoverJacEnvironments as jest.Mock).mockResolvedValue([]);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            await (envManager as any).silentAutoSelect();

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'No Jac environment found. Install Jac to enable IntelliSense.',
                'Install Jac',
                'Select Manually'
            );
            expect(context.globalState.update).not.toHaveBeenCalled();
        });

        test('opens the install page when the user clicks "Install Jac"', async () => {
            (envDetection.discoverJacEnvironments as jest.Mock).mockResolvedValue([]);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Install Jac');

            await (envManager as any).silentAutoSelect();

            expect(vscode.env.openExternal).toHaveBeenCalled();
        });

        test('opens the environment picker when the user clicks "Select Manually"', async () => {
            (envDetection.discoverJacEnvironments as jest.Mock).mockResolvedValue([]);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Select Manually');
            const spy = jest.spyOn(envManager as any, 'promptEnvironmentSelection').mockResolvedValue(undefined);

            await (envManager as any).silentAutoSelect();

            expect(spy).toHaveBeenCalledTimes(1);
        });
    });

    // ── handleManualPathEntry() ───────────────────────────────────────────────

    describe('handleManualPathEntry()', () => {
        test('saves a valid path and starts/restarts the LSP', async () => {
            (getLspManager as jest.Mock).mockReturnValue(undefined);
            (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('/valid/jac');

            await (envManager as any).handleManualPathEntry();

            expect(envDetection.validateJacExecutable).toHaveBeenCalledWith('/valid/jac');
            expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/valid/jac');
            expect(createAndStartLsp).toHaveBeenCalledTimes(1);
        });

        test('expands a tilde path to an absolute path before validation', async () => {
            const originalHome = process.env.HOME;
            process.env.HOME = '/home/testuser';
            (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('~/bin/jac');

            await (envManager as any).handleManualPathEntry();

            expect(envDetection.validateJacExecutable).toHaveBeenCalledWith('/home/testuser/bin/jac');
            process.env.HOME = originalHome;
        });

        test('does nothing when the user cancels the input box', async () => {
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

            await (envManager as any).handleManualPathEntry();

            expect(context.globalState.update).not.toHaveBeenCalled();
            expect(envDetection.validateJacExecutable).not.toHaveBeenCalled();
        });

        test('shows an error with Retry/Browse options when the path is invalid', async () => {
            (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('/bad/jac');
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);

            await (envManager as any).handleManualPathEntry();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Invalid Jac executable.',
                'Retry',
                'Browse'
            );
        });

        test('retries entry when the user clicks Retry after an invalid path', async () => {
            (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);
            (vscode.window.showInputBox as jest.Mock)
                .mockResolvedValueOnce('/bad/jac')
                .mockResolvedValueOnce(undefined);
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Retry');

            await (envManager as any).handleManualPathEntry();

            expect(vscode.window.showInputBox).toHaveBeenCalledTimes(2);
        });

        test('restarts the LSP when an LSP manager already exists', async () => {
            (getLspManager as jest.Mock).mockReturnValue(mockLspManager);
            (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('/valid/jac');

            await (envManager as any).handleManualPathEntry();

            expect(mockLspManager.restart).toHaveBeenCalledTimes(1);
            expect(createAndStartLsp).not.toHaveBeenCalled();
        });
    });

    // ── handleFileBrowser() ───────────────────────────────────────────────────

    describe('handleFileBrowser()', () => {
        test('saves a valid file selection and starts/restarts the LSP', async () => {
            (getLspManager as jest.Mock).mockReturnValue(undefined);
            (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(true);
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/browser/jac' }]);

            await (envManager as any).handleFileBrowser();

            expect(context.globalState.update).toHaveBeenCalledWith('jacEnvPath', '/browser/jac');
            expect(createAndStartLsp).toHaveBeenCalledTimes(1);
        });

        test('does nothing when the user cancels the file dialog', async () => {
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);

            await (envManager as any).handleFileBrowser();

            expect(context.globalState.update).not.toHaveBeenCalled();
            expect(envDetection.validateJacExecutable).not.toHaveBeenCalled();
        });

        test('shows an error with Try Again/Enter Path Manually when selection is invalid', async () => {
            (envDetection.validateJacExecutable as jest.Mock).mockResolvedValue(false);
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/bad/jac' }]);
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);

            await (envManager as any).handleFileBrowser();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Not a valid Jac executable.',
                'Try Again',
                'Enter Path Manually'
            );
        });
    });

    // ── updateStatusBar() ─────────────────────────────────────────────────────

    describe('updateStatusBar()', () => {
        test('shows a check icon and env label when a path is configured', () => {
            (envManager as any).jacPath = '/home/user/.venv/bin/jac';
            envManager.updateStatusBar();
            expect((envManager as any).statusBar.text).toContain('$(check)');
            expect((envManager as any).statusBar.text).toContain('Jac');
        });

        test('includes the version in the status bar label when version is available', () => {
            (envManager as any).jacPath = '/home/user/.venv/bin/jac';
            (envManager as any).jacVersion = '0.11.0';
            envManager.updateStatusBar();
            expect((envManager as any).statusBar.text).toContain('0.11.0');
        });

        test('shows a warning icon and "No Env" when no path is configured', () => {
            envManager.updateStatusBar();
            expect((envManager as any).statusBar.text).toContain('$(warning)');
            expect((envManager as any).statusBar.text).toContain('No Env');
        });
    });

    // ── Public Accessors ──────────────────────────────────────────────────────

    describe('getJacPath()', () => {
        test('returns the configured path when set', () => {
            (envManager as any).jacPath = '/usr/local/bin/jac';
            expect(envManager.getJacPath()).toBe('/usr/local/bin/jac');
        });

        test('falls back to the platform default when no path is configured', () => {
            expect(envManager.getJacPath()).toBe(process.platform === 'win32' ? 'jac.exe' : 'jac');
        });
    });

    describe('getPythonPath()', () => {
        test('returns python in the same directory as the configured jac executable', () => {
            (envManager as any).jacPath = '/home/user/.venv/bin/jac';
            const expected = process.platform === 'win32'
                ? '/home/user/.venv/bin/python.exe'
                : '/home/user/.venv/bin/python';
            expect(envManager.getPythonPath()).toBe(expected);
        });

        test('falls back to the platform default when no path is configured', () => {
            expect(envManager.getPythonPath()).toBe(process.platform === 'win32' ? 'python.exe' : 'python');
        });
    });
});

// ── EnvManager Private Helpers ────────────────────────────────────────────────

describe('EnvManager Helpers', () => {
    let envManager: EnvManager;

    beforeEach(() => {
        jest.clearAllMocks();
        const context = makeContext();
        envManager = new EnvManager(context);
    });

    // ── getEnvName() ──────────────────────────────────────────────────────────

    describe('getEnvName()', () => {
        test('extracts the environment name from a conda envs path', () => {
            expect((envManager as any).getEnvName('/home/user/miniconda3/envs/myenv/bin/jac')).toBe('myenv');
        });

        test('extracts the folder name from a standard venv path', () => {
            expect((envManager as any).getEnvName('/home/user/project/.venv/bin/jac')).toBe('.venv');
        });

        test('uses the parent directory name for a generic env path', () => {
            expect((envManager as any).getEnvName('/home/user/project/my-env/bin/jac')).toBe('my-env');
        });
    });

    // ── formatPath() ──────────────────────────────────────────────────────────

    describe('formatPath()', () => {
        test('replaces the home directory with ~', () => {
            const originalHome = process.env.HOME;
            process.env.HOME = '/home/testuser';

            const result = (envManager as any).formatPath('/home/testuser/project/.venv/bin/jac');
            expect(result).toBe('~/project/.venv/bin/jac');

            process.env.HOME = originalHome;
        });

        test('returns a short path unchanged', () => {
            const shortPath = '/usr/local/bin/jac';
            expect((envManager as any).formatPath(shortPath)).toBe(shortPath);
        });
    });

    // ── buildEnvItem() ────────────────────────────────────────────────────────

    describe('buildEnvItem()', () => {
        test('includes the version and env name in the label', () => {
            const item = (envManager as any).buildEnvItem('/home/user/.venv/bin/jac', 'venv', '0.11.0', false);
            expect(item.label).toContain('Jac 0.11.0');
            expect(item.label).toContain('.venv');
            expect(item.envPath).toBe('/home/user/.venv/bin/jac');
        });

        test('prefixes the label with a checkmark icon when the environment is active', () => {
            const item = (envManager as any).buildEnvItem('/home/user/.venv/bin/jac', 'venv', '0.11.0', true);
            expect(item.label).toContain('$(check)');
        });

        test('omits the version from the label when version is not available', () => {
            const item = (envManager as any).buildEnvItem('/home/user/.venv/bin/jac', 'venv', undefined, false);
            expect(item.label).toBe('Jac (.venv)');
        });
    });
});
