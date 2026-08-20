/*
 * PATCHED shim: the TS-era src/constants.ts is gone. These are contract
 * constants (command ids fixed by the generated manifest); the smoke
 * harness asserts the same ids against the real bundle, so drift is caught.
 */
export const TERMINAL_NAME = 'Jac Terminal';

export const COMMANDS = {
    RUN_FILE: 'jaclang-extension.runCurrentFile',
    SERVE_FILE: 'jaclang-extension.serveCurrentFile',
    DEBUG_FILE: 'jaclang-extension.debugCurrentFile',
    SELECT_ENV: 'jaclang-extension.selectEnv',
    TOGGLE_DEV_MODE: 'jaclang-extension.toggleDeveloperMode',
    RESTART_LSP: 'jaclang-extension.restartLanguageServer',
    GET_JAC_PATH: 'extension.jaclang-extension.getJacPath',
    GET_PYTHON_PATH: 'extension.jaclang-extension.getPythonPath',
    VISUALIZE: 'jaclang-extension.visualizeGraph',
    INSPECT_SCOPES: 'jaclang-extension.inspectTokenScopes',
    LINTFIX_FORMAT: 'jac.lintfixFormat',
};
