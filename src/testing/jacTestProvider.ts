import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import { EnvManager } from '../environment/manager';
import { COMMANDS } from '../constants';
import { parseTestOutput } from './testOutputParser';

// Files matching this glob are treated as Jac test files.
const TEST_FILE_GLOB = '**/{test_*.jac,*.test.jac}';

export function registerJacTestProvider(
    context: vscode.ExtensionContext,
    envManager: EnvManager
): void {
    const ctrl = vscode.tests.createTestController('jacTests', 'Jac Tests');
    context.subscriptions.push(ctrl);

    // --- Discovery ---

    // Parses test declarations from file text and registers them as test items.
    function parseTestItems(uri: vscode.Uri, text: string): void {
        const fileItem = ctrl.createTestItem(uri.toString(), path.basename(uri.fsPath), uri);
        fileItem.canResolveChildren = false;

        const children: vscode.TestItem[] = [];
        const lines = text.split('\n');
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const match = lines[lineIndex].match(/^\s*test\s+(?:"([^"]+)"|(\w+))\s*\{/);
            if (!match) { continue; }
            const name = match[1] ?? match[2];
            const item = ctrl.createTestItem(`${uri.toString()}::${name}`, name, uri);
            item.range = new vscode.Range(lineIndex, 0, lineIndex, 0);
            children.push(item);
        }

        if (children.length > 0) {
            fileItem.children.replace(children);
            ctrl.items.add(fileItem);
        } else {
            ctrl.items.delete(uri.toString());
        }
    }

    // Reads a single file from disk and registers its test items.
    async function discoverFile(uri: vscode.Uri): Promise<void> {
        const text = (await vscode.workspace.fs.readFile(uri)).toString();
        parseTestItems(uri, text);
    }

    // Clears all known tests and re-scans the entire workspace.
    async function discoverAll(): Promise<void> {
        ctrl.items.replace([]);
        const files = await vscode.workspace.findFiles(TEST_FILE_GLOB, '**/node_modules/**');
        await Promise.all(files.map(discoverFile));
    }

    // Triggered when the Testing panel opens — scans workspace for test files.
    ctrl.resolveHandler = async (item) => {
        if (!item) { await discoverAll(); }
    };

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (isTestFile(doc.uri)) { parseTestItems(doc.uri, doc.getText()); }
        }),
        vscode.workspace.onDidDeleteFiles(e => {
            e.files.forEach(uri => ctrl.items.delete(uri.toString()));
        }),
        vscode.workspace.onDidCreateFiles(e => {
            e.files.filter(isTestFile).forEach(discoverFile);
        })
    );

    // --- Run handler ---

    // Groups requested test items by file, then runs each test individually
    // via `jac test filepath --test_name name` and reports pass/fail to VS Code.

    ctrl.createRunProfile(
        'Run',
        vscode.TestRunProfileKind.Run,
        (request, token) => runTests(request, token, false),
        true
    );

    ctrl.createRunProfile(
        'Debug',
        vscode.TestRunProfileKind.Debug,
        (request, token) => runTests(request, token, true),
        false
    );

    // Executes the requested tests, running each one individually via jac CLI.
    async function runTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
        debug: boolean
    ): Promise<void> {
        const fileMap = new Map<string, { fileItem: vscode.TestItem; tests: vscode.TestItem[] }>();

        // Collects leaf test items (individual tests) grouped by their source file.
        function enqueue(item: vscode.TestItem): void {
            if (item.children.size > 0) {
                item.children.forEach(enqueue);
            } else {
                const fileUri = item.uri!.toString();
                if (!fileMap.has(fileUri)) {
                    const parentItem = ctrl.items.get(fileUri);
                    if (!parentItem) { return; }
                    fileMap.set(fileUri, { fileItem: parentItem, tests: [] });
                }
                fileMap.get(fileUri)!.tests.push(item);
            }
        }

        if (request.include) {
            request.include.forEach(enqueue);
        } else {
            ctrl.items.forEach(fileItem => fileItem.children.forEach(enqueue));
        }

        const run = ctrl.createTestRun(request);
        const jacPath = envManager.getJacPath();

        for (const [, { fileItem, tests }] of fileMap) {
            if (token.isCancellationRequested) { break; }

            const filePath = fileItem.uri!.fsPath;

            if (debug) {
                await debugTests(envManager, filePath);
                tests.forEach(t => run.skipped(t));
                continue;
            }

            for (const item of tests) {
                if (token.isCancellationRequested) { break; }

                run.started(item);
                const output = await spawnJacTest(jacPath, filePath, item.label, token);

                if (output === null) {
                    run.skipped(item);
                    continue;
                }

                run.appendOutput(output.replace(/\r?\n/g, '\r\n'));

                const result = parseTestOutput(output);
                if (result.status === 'PASSED') {
                    run.passed(item);
                } else if (result.status === 'FAILED') {
                    run.failed(item, new vscode.TestMessage(result.message ?? ''));
                } else {
                    run.skipped(item);
                }
            }
        }

        run.end();
    }

    // Called by the Run File command — discovers and runs all tests in the given file.
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.RUN_ALL_TESTS, async (uri: vscode.Uri) => {
            const fileItem = ctrl.items.get(uri.toString()) ??
                await discoverFile(uri).then(() => ctrl.items.get(uri.toString()));
            if (!fileItem) { return; }
            const cts = new vscode.CancellationTokenSource();
            try {
                await runTests(new vscode.TestRunRequest([fileItem]), cts.token, false);
            } finally {
                cts.dispose();
            }
        })
    );
}

// --- Helpers ---

// Returns true for files that follow Jac test naming conventions.
function isTestFile(uri: vscode.Uri): boolean {
    const name = path.basename(uri.fsPath);
    return (name.startsWith('test_') || name.endsWith('.test.jac')) && name.endsWith('.jac');
}

// Removes the cached bytecode for this file so jac recompiles it on the next run,
// preventing stale cache from masking code changes.
function evictJacCache(filePath: string): void {
    const cacheFile = path.join(path.dirname(filePath), '__jac_cache__', path.basename(filePath, '.jac') + '.jbc');
    try { fs.unlinkSync(cacheFile); } catch { /* not cached yet — fine */ }
}

// Runs a single test via `jac test filepath --test_name name` and returns the raw output.
function spawnJacTest(
    jacPath: string,
    filePath: string,
    testName: string,
    token: vscode.CancellationToken
): Promise<string | null> {
    evictJacCache(filePath);
    return new Promise(resolve => {
        let settled = false;
        const settle = (val: string | null) => { if (!settled) { settled = true; resolve(val); } };

        const proc = cp.spawn(jacPath, ['test', filePath, '--test_name', testName], {
            cwd: path.dirname(filePath)
        });
        let output = '';
        proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { output += d.toString(); });
        const cancel = token.onCancellationRequested(() => { proc.kill(); settle(null); });
        proc.on('close', () => { cancel.dispose(); settle(output); });
        proc.on('error', () => { cancel.dispose(); settle(null); });
    });
}

// Launches the test file under the debugpy debugger.
async function debugTests(
    envManager: EnvManager,
    filePath: string
): Promise<void> {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    await vscode.debug.startDebugging(folder, {
        type: 'debugpy',
        request: 'launch',
        name: 'Jac: Debug Tests',
        python: envManager.getPythonPath(),
        program: envManager.getJacPath(),
        args: ['test', filePath],
        console: 'integratedTerminal',
        justMyCode: false
    });
}
