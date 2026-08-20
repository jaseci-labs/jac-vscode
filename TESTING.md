# Testing

The extension is built from Jac sources (see `jac.toml` and `extension/`).

## Headless smoke test

```bash
jac run scripts/build_ext.jac    # build .jac/vscode/ (manifest + CJS bundle + assets)
jac run scripts/smoke_ext.jac    # drive the bundle under Node against a stub vscode module
```

The harness itself is Jac: `smoke/vscode_stub.jac` (a recording stub of the
`vscode` host module) and `smoke/smoke_runner.jac` (drives activate → env
discovery → commands → QuickPick selection → deactivate).

## Interactive

Open this folder in VS Code and press **F5** — the preLaunchTask rebuilds
from Jac and starts an Extension Development Host.

## Grammar golden tests

The TextMate grammar suites (236 tests / 991 assertions) live in
`tests-js/` and run with bun's built-in jest-compatible runner -- no jest,
no config beyond the dir-local dev-only package.json:

```bash
cd tests-js && bun install && bun test
```

`tests-js/` is a TEMPORARY js-side harness: it tests the grammar JSON
assets, not extension code, and migrates to jac-native tests once
jaseci-labs/jac#8033 lands.

## Unit tests (tests-js/unit)

The TS-era EnvManager scenarios, PATCHED to run against the compiled Jac
modules (extracted from the `jac build --as npm` tarball) under bun, with
`mock.module` injecting the Jac-written vscode stub plus controllable
discovery/LSP mocks. Requires a prior build + smoke run:

```bash
jac run scripts/build_ext.jac && jac run scripts/smoke_ext.jac
cd tests-js && bun test          # grammar goldens + unit together
```

## Integration tests (tests-integration)

The TS-era mocha suite restored nearly verbatim and patched to launch the
Jac-built extension (`.jac/vscode/`) in a real downloaded VS Code:

```bash
cd tests-integration && bun install && bun run test
```

Needs a display (WSLg works) and the Electron system libraries
(`sudo apt-get install -y libnspr4 libnss3`). CI runs it under xvfb.

## The jac-native future

All js-side harnesses above are TEMPORARY: they migrate to Jac `test`
blocks run by `jac test` once jaseci-labs/jac#8033 (custom npm module
stubs, so `vscode` can be mocked) lands upstream.
