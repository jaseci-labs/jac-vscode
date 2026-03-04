import * as vscode from 'vscode';
import * as path from 'path';
import { discoverJacEnvironments, validateJacExecutable, JacEnvironment } from '../utils/envDetection';
import { getJacVersion, compareVersions } from '../utils/envVersion';
import { getLspManager, createAndStartLsp } from '../extension';

export class EnvManager {
    private context: vscode.ExtensionContext;
    private statusBar: vscode.StatusBarItem;
    private jacPath: string | undefined;
    private jacVersion: string | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBar.command = 'jaclang-extension.selectEnv';
        context.subscriptions.push(this.statusBar);
    }

    async init() {
        this.jacPath = this.context.globalState.get<string>('jacEnvPath');
        if (this.jacPath) { this.jacVersion = await getJacVersion(this.jacPath); }
        this.updateStatusBar();

        await this.validateAndClearIfInvalid();

        if (!this.jacPath) {
            // Silently auto-select the best environment on startup (no popup)
            await this.silentAutoSelect();
        }

        this.updateStatusBar();
    }

    // Silently discover and select the best environment (no user interaction)
    // Shows a helpful message only when NO environments are found (for new users)
    private async silentAutoSelect(): Promise<void> {
        const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? [process.cwd()];
        const envs = await discoverJacEnvironments(workspaceRoots);

        if (envs.length === 0) {
            // No environments found - show a non-blocking toast notification
            vscode.window.showInformationMessage(
                'No Jac environment found. Install Jac to enable IntelliSense.',
                'Install Jac',
                'Select Manually'
            ).then(action => {
                if (action === 'Install Jac') {
                    vscode.env.openExternal(vscode.Uri.parse('https://www.jac-lang.org/learn/installation/'));
                } else if (action === 'Select Manually') {
                    this.promptEnvironmentSelection();
                }
            });
            return;
        }

        // Environments found - silently select the best one (no popup)
        const bestEnv = await this.findBestEnvironment(envs);
        if (bestEnv) {
            this.jacPath = bestEnv.env.path;
            this.jacVersion = bestEnv.version;
            await this.context.globalState.update('jacEnvPath', bestEnv.env.path);
            this.updateStatusBar();
        }
    }

    // Find the environment with the highest version — returns env + its version (already computed, no extra call)
    private async findBestEnvironment(envs: JacEnvironment[]): Promise<{ env: JacEnvironment; version: string | undefined } | undefined> {
        if (envs.length === 0) return undefined;

        const versions = await Promise.all(envs.map(env => getJacVersion(env.path)));
        let bestIndex = 0;
        let bestVersion: string | undefined;

        for (let i = 0; i < envs.length; i++) {
            const version = versions[i];
            if (version) {
                if (!bestVersion || compareVersions(version, bestVersion) > 0) {
                    bestVersion = version;
                    bestIndex = i;
                }
            }
        }

        return { env: envs[bestIndex], version: versions[bestIndex] };
    }

    getJacPath(): string {
        return this.jacPath ?? (process.platform === 'win32' ? 'jac.exe' : 'jac');
    }

    getPythonPath(): string {
        if (this.jacPath) {
            const jacDir = path.dirname(this.jacPath);
            const pythonExe = process.platform === 'win32' ? 'python.exe' : 'python';
            return path.join(jacDir, pythonExe);
        }
        return process.platform === 'win32' ? 'python.exe' : 'python';
    }

    getStatusBar(): vscode.StatusBarItem {
        return this.statusBar;
    }

    private async validateAndClearIfInvalid(): Promise<void> {
        if (this.jacPath && !(await validateJacExecutable(this.jacPath))) {
            this.jacPath = undefined;
            this.jacVersion = undefined;
            await this.context.globalState.update('jacEnvPath', undefined);
            this.updateStatusBar();
        }
    }

    // ── QuickPick Environment Selection ──────────────────────────────────────

    async promptEnvironmentSelection() {
        try {
            // Clear the saved env if it's no longer valid; QuickPick will discover fresh environments
            await this.validateAndClearIfInvalid();

            type EnvItem = vscode.QuickPickItem & { envPath?: string };

            const quickPick = vscode.window.createQuickPick<EnvItem>();
            const currentVersion = this.jacPath ? await getJacVersion(this.jacPath) : undefined;
            const currentEnvName = this.jacPath ? this.getEnvName(this.jacPath) : undefined;
            const currentLabel = currentVersion && currentEnvName
                ? `Jac Environment · currently: ${currentVersion} (${currentEnvName})`
                : 'Select Jac Environment';
            quickPick.title = currentLabel;
            quickPick.placeholder = 'Searching for Jac environments...';
            quickPick.matchOnDescription = true;
            quickPick.ignoreFocusOut = true;
            quickPick.busy = true;
            quickPick.show();

            // Discover environments on-demand
            const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? [process.cwd()];
            const envs = await discoverJacEnvironments(workspaceRoots);

            // Read versions in parallel
            const versions = await Promise.all(envs.map(env => getJacVersion(env.path)));
            const envWithVersions = envs.map((env, i) => ({ ...env, version: versions[i] }));

            // Sort by version (highest first), then by type priority
            envWithVersions.sort((envA, envB) => {
                if (envA.version && envB.version) return compareVersions(envB.version, envA.version);
                if (envA.version) return -1;
                if (envB.version) return 1;
                return 0;
            });

            quickPick.busy = false;
            quickPick.placeholder = envs.length > 0
                ? `${envs.length} environment${envs.length > 1 ? 's' : ''} found`
                : 'No Jac environments detected';

            // Build items
            const items: EnvItem[] = [];
            const makeSeparator = (label: string): EnvItem => ({ label, kind: vscode.QuickPickItemKind.Separator });

            // Find recommended (highest version)
            const recommended = envWithVersions.find(envEntry => envEntry.version); // First with version = highest

            // Currently active section
            if (this.jacPath) {
                const activeEnv = envWithVersions.find(envEntry => envEntry.path === this.jacPath);
                if (activeEnv) {
                    items.push(makeSeparator('Currently Active'));
                    items.push(this.buildEnvItem(activeEnv.path, activeEnv.type, activeEnv.version, true));
                }
            }

            // Recommended section (only if different from active and has a strictly higher version)
            const activeEnvVersion = this.jacPath
                ? envWithVersions.find(envEntry => envEntry.path === this.jacPath)?.version
                : undefined;
            const isRecommendedNewer = recommended?.version && activeEnvVersion
                ? compareVersions(recommended.version, activeEnvVersion) > 0
                : recommended?.version && !activeEnvVersion;
            if (recommended && recommended.path !== this.jacPath && isRecommendedNewer) {
                items.push(makeSeparator('Recommended'));
                items.push(this.buildEnvItem(recommended.path, recommended.type, recommended.version, false));
            }

            // Other environments (exclude active; exclude recommended only if it was shown)
            const shownRecommendedPath = (recommended && recommended.path !== this.jacPath && isRecommendedNewer)
                ? recommended.path : undefined;
            const otherEnvs = envWithVersions.filter(envEntry =>
                envEntry.path !== this.jacPath && envEntry.path !== shownRecommendedPath
            );
            if (otherEnvs.length > 0) {
                for (const env of otherEnvs) {
                    items.push(this.buildEnvItem(env.path, env.type, env.version, false));
                }
            }

            // Add options
            items.push(makeSeparator('Add'));
            items.push({
                label: '$(add) Enter interpreter path...',
                description: 'Manually specify the path to a Jac executable',
                envPath: 'manual'
            });
            items.push({
                label: '$(folder-opened) Browse...',
                description: 'Browse for Jac executable using file picker',
                envPath: 'browse'
            });

            quickPick.items = items;

            // Handle selection
            const choice = await new Promise<EnvItem | undefined>(resolve => {
                quickPick.onDidAccept(() => {
                    resolve(quickPick.selectedItems[0]);
                    quickPick.hide();
                });
                quickPick.onDidHide(() => resolve(undefined));
            });
            quickPick.dispose();

            if (choice?.envPath === 'manual') {
                await this.handleManualPathEntry();
            } else if (choice?.envPath === 'browse') {
                await this.handleFileBrowser();
            } else if (choice?.envPath) {
                await this.selectEnvironment(choice.envPath);
            }
            // else: user dismissed QuickPick without selecting

            // Final fallback: if still no environment selected after any path, auto-select best
            if (!this.jacPath && envs.length > 0) {
                const bestEnv = await this.findBestEnvironment(envs);
                if (bestEnv) {
                    await this.selectEnvironment(bestEnv.env.path);
                    return;
                }
            }
            this.updateStatusBar();
        } catch (error: any) {
            this.updateStatusBar();
            vscode.window.showErrorMessage(`Error finding Jac environments: ${error.message || error}`);
        }
    }

    private buildEnvItem(
        envPath: string,
        envType: JacEnvironment['type'],
        version?: string,
        isActive?: boolean
    ): vscode.QuickPickItem & { envPath: string } {
        const envName = this.getEnvName(envPath);
        const typeLabel = envType.charAt(0).toUpperCase() + envType.slice(1);

        const versionStr = version ? `Jac ${version}` : 'Jac';
        const namePart = envName ? ` (${envName})` : '';
        const label = `${isActive ? '$(check) ' : ''}${versionStr}${namePart}`;
        const description = `${this.formatPath(envPath)}  ·  ${typeLabel}`;

        return { label, description, envPath };
    }

    private getEnvName(envPath: string): string {
        // Conda: extract from envs/name/
        const condaMatch = envPath.match(/envs[\/\\]([^\/\\]+)/);
        if (condaMatch) return condaMatch[1];

        // Venv: extract folder name
        const venvMatch = envPath.match(/([^\/\\]*(?:\.?venv|virtualenv)[^\/\\]*)/);
        if (venvMatch) return venvMatch[1];

        // Generic: get parent folder name (skip bin/Scripts)
        const parent = path.basename(path.dirname(envPath));
        if (parent === 'bin' || parent === 'Scripts') {
            return path.basename(path.dirname(path.dirname(envPath)));
        }
        return parent;
    }

    private formatPath(envPath: string): string {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        let displayPath = envPath;
        if (homeDir && envPath.startsWith(homeDir)) {
            displayPath = '~' + envPath.slice(homeDir.length);
        }

        const parts = displayPath.split(path.sep);
        if (parts.length > 6) {
            return `${parts.slice(0, 2).join(path.sep)}${path.sep}...${path.sep}${parts.slice(-3).join(path.sep)}`;
        }
        return displayPath;
    }

    private async selectEnvironment(envPath: string): Promise<void> {
        this.jacPath = envPath;
        this.jacVersion = await getJacVersion(envPath);
        await this.context.globalState.update('jacEnvPath', envPath);
        this.updateStatusBar();
        await this.restartLanguageServer();
    }

    // ── Manual Entry & Browse ────────────────────────────────────────────────

    private async handleManualPathEntry() {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter the path to the Jac executable',
            placeHolder: '/path/to/jac or C:\\path\\to\\jac.exe',
            validateInput: (value) => {
                if (!value?.trim()) return 'Path cannot be empty';
                if (!path.isAbsolute(value) && !value.startsWith('~')) {
                    return 'Please enter an absolute path';
                }
                return null;
            }
        });

        if (!input) return;

        const normalizedPath = input.startsWith('~')
            ? path.join(process.env.HOME || process.env.USERPROFILE || '', input.slice(1))
            : input;

        if (await validateJacExecutable(normalizedPath)) {
            await this.selectEnvironment(normalizedPath);
            vscode.window.showInformationMessage(`Jac environment set to: ${this.formatPath(normalizedPath)}`);
        } else {
            const action = await vscode.window.showErrorMessage(
                'Invalid Jac executable.',
                'Retry',
                'Browse'
            );
            if (action === 'Retry') await this.handleManualPathEntry();
            else if (action === 'Browse') await this.handleFileBrowser();
        }
    }

    private async handleFileBrowser() {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select Jac Executable',
            filters: process.platform === 'win32'
                ? { 'Executable Files': ['exe'], 'All Files': ['*'] }
                : { 'All Files': ['*'] },
            defaultUri: vscode.Uri.file(process.env.HOME || process.env.USERPROFILE || '/'),
            title: 'Select Jac Executable'
        });

        if (!fileUri?.length) return;

        const selectedPath = fileUri[0].fsPath;

        if (await validateJacExecutable(selectedPath)) {
            await this.selectEnvironment(selectedPath);
            vscode.window.showInformationMessage(`Jac environment set to: ${this.formatPath(selectedPath)}`);
        } else {
            const action = await vscode.window.showErrorMessage(
                'Not a valid Jac executable.',
                'Try Again',
                'Enter Path Manually'
            );
            if (action === 'Try Again') await this.handleFileBrowser();
            else if (action === 'Enter Path Manually') await this.handleManualPathEntry();
        }
    }

    // ── Status Bar & LSP ─────────────────────────────────────────────────────

    updateStatusBar() {
        if (this.jacPath) {
            const pathDirs = process.env.PATH?.split(path.delimiter) || [];
            const isGlobal = this.jacPath === 'jac' || this.jacPath === 'jac.exe' ||
                pathDirs.some(dir => path.join(dir, path.basename(this.jacPath!)) === this.jacPath);

            const versionPart = this.jacVersion ? ` (${this.jacVersion})` : '';
            const label = isGlobal ? `Jac${versionPart} · Global` : `Jac${versionPart}`;
            this.statusBar.text = `$(check) ${label}`;
            this.statusBar.tooltip = `Current: ${this.jacPath}\nClick to change`;
        } else {
            this.statusBar.text = '$(warning) Jac: No Env';
            this.statusBar.tooltip = 'No Jac environment selected - Click to select';
        }
        this.statusBar.show();
    }

    private async restartLanguageServer(): Promise<void> {
        const lspManager = getLspManager();
        if (lspManager) {
            try {
                await lspManager.restart();
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to restart language server: ${error.message || error}`);
            }
        } else {
            try {
                await createAndStartLsp(this, this.context);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to start language server: ${error.message || error}`);
            }
        }
    }
}
