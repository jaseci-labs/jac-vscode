#!/usr/bin/env bash
# Enforces that only expected files are changed in highlightjs-jac.
# Run from within the highlightjs-jac checkout directory.
set -euo pipefail

changed_files=$( {
  git diff --name-only --diff-filter=ACMR
  git ls-files --others --exclude-standard
} | sort -u )

if [ -z "$changed_files" ]; then
  echo "No file changes detected."
  exit 0
fi

while IFS= read -r file; do
  case "$file" in
    src/languages/jac.js \
    | dist/jac.es.min.js \
    | dist/jac.min.js \
    | test/markup/jac/*.expect.txt)
      ;;
    *)
      echo "ERROR: Unexpected changed file: $file"
      exit 1
      ;;
  esac
done <<EOF
$changed_files
EOF

echo "All changed files are within the allowlist."
