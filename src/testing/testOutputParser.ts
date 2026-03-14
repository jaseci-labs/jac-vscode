// Parses the stdout/stderr of a single `jac test filepath --test_name name` invocation
// and maps it to a PASSED / FAILED / SKIPPED result for the VS Code test explorer.

export interface TestResult {
    status: 'PASSED' | 'FAILED' | 'SKIPPED';
    message?: string; // failure traceback shown inline in the editor
}

// Pulls the most relevant error line(s) out of a unittest traceback.
function extractFailureMessage(output: string): string {
    const lines = output.split('\n');
    const errorLines = lines.filter(l => /^(AssertionError|Error:|assert\s)/.test(l.trim()));
    if (errorLines.length > 0) {
        return errorLines.map(l => l.trim()).join('\n');
    }
    // Fallback: everything after the separator line
    const sepIdx = lines.findIndex(l => /^-{20,}/.test(l));
    if (sepIdx !== -1) {
        return lines.slice(sepIdx + 1).join('\n').trim();
    }
    return output.trim();
}

// Determines pass/fail/skip from jac test output.
// "Ran 0 tests" means the test name didn't match → SKIPPED.
// "Passed successfully" / "OK" → PASSED.
// "FAILED" / "failures=" / "errors=" → FAILED with message.
export function parseTestOutput(output: string): TestResult {
    if (/Ran 0 tests/.test(output)) {
        return { status: 'SKIPPED' };
    }
    if (/Passed successfully/.test(output) || /\nOK\s*$/.test(output.trim())) {
        return { status: 'PASSED' };
    }
    if (/FAILED|failures=\d+|errors=\d+/.test(output)) {
        return { status: 'FAILED', message: extractFailureMessage(output) };
    }
    return { status: 'SKIPPED' };
}
