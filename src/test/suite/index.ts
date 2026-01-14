/**
 * Mocha Test Suite Entry Point (Test Mode)
 * Configures and runs all integration tests in VS Code
 */

import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'bdd',
		color: true,
		timeout: 10000,
		reporter: 'spec',
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((resolve, reject) => {
		glob('suite/**/**.test.js', { cwd: testsRoot })
			.then((files) => {
				// Define test execution priority (lower number = earlier execution)
				const getTestPriority = (filename: string): number => {
					if (filename.includes('environment.integration')) return 1; // First
					if (filename.includes('lsp.integration')) return 2;        // Middle
					if (filename.includes('cleanup.integration')) return 3;    // Last
					return 2; // Default: middle
				};

				// Sort test files by priority
				const sortedFiles = files.sort((a, b) => getTestPriority(a) - getTestPriority(b));

				console.log(`\n🧪 Found ${sortedFiles.length} test file(s)`);

				sortedFiles.forEach(f => {
					const filePath = path.resolve(testsRoot, f);
					console.log(`   → ${f}`);
					mocha.addFile(filePath);
				});

				try {
					console.log('\n▶️  Running tests...\n');
					mocha.run(failures => {
						if (failures > 0) {
							console.log(`\n❌ ${failures} test(s) failed`);
							reject(new Error(`${failures} tests failed.`));
						} else {
							console.log('\n✓ All tests passed');
							resolve();
						}
					});
				} catch (err) {
					console.error(err);
					reject(err);
				}
			})
			.catch((err) => {
				reject(err);
			});
	});
}
