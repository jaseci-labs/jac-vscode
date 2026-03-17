const fs = require('fs');

const bumpType = process.argv[2];
if (!bumpType || !['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node bump-version.js <patch|minor|major>');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const [year, minor, patch] = pkg.version.split('.').map(Number);

let newVersion;
if (bumpType === 'major') {
  newVersion = `${year + 1}.0.0`;
} else if (bumpType === 'minor') {
  newVersion = `${year}.${minor + 1}.0`;
} else {
  newVersion = `${year}.${minor}.${patch + 1}`;
}

const oldVersion = pkg.version;
pkg.version = newVersion;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

const branchName = `release/v${newVersion}`;
const prTitle = `Bump version from ${oldVersion} to ${newVersion}`;
const prBody = `## Version Bump

- **From:** \`${oldVersion}\`
- **To:** \`${newVersion}\`
- **Bump type:** \`${bumpType}\`

After merging, run the **Release VSCE Extension** workflow to publish.`;

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
