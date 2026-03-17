const fs = require('fs');

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('Usage: node bump-version.js <version>');
  console.error('Example: node bump-version.js 2026.3.17');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const oldVersion = pkg.version;

pkg.version = newVersion;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

const branchName = `release/v${newVersion}`;
const prTitle = `Bump version from ${oldVersion} to ${newVersion}`;
const prBody = `## Version Bump

- **From:** \`${oldVersion}\`
- **To:** \`${newVersion}\`

After merging, run the **Release Extension** workflow to publish.`;

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  fs.appendFileSync(outputFile, `old_version=${oldVersion}\n`);
  fs.appendFileSync(outputFile, `new_version=${newVersion}\n`);
  fs.appendFileSync(outputFile, `branch_name=${branchName}\n`);
  fs.appendFileSync(outputFile, `pr_title=${prTitle}\n`);
  fs.appendFileSync(outputFile, `pr_body<<EOF\n${prBody}\nEOF\n`);
} else {
  console.log(`old_version=${oldVersion}`);
  console.log(`new_version=${newVersion}`);
  console.log(`branch_name=${branchName}`);
}
