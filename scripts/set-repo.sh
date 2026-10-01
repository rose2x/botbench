#!/usr/bin/env bash
# Replace the OWNER/REPO placeholders (badges, links) with your GitHub username and repo name.
# Usage: scripts/set-repo.sh YOUR_GITHUB_USERNAME REPO_NAME
set -euo pipefail
if [ $# -ne 2 ]; then echo "Usage: $0 GITHUB_USERNAME REPO_NAME"; exit 1; fi
cd "$(dirname "$0")/.."
OWNER="$1"; REPO="$2"
FILES=(README.md CONTRIBUTING.md botbench-sdk/README.md .github/ISSUE_TEMPLATE/config.yml)
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  if grep -qE 'OWNER/REPO|OWNER\.github\.io' "$f"; then
    sed -i.bak -e "s#OWNER/REPO#${OWNER}/${REPO}#g" -e "s#OWNER\.github\.io/REPO#${OWNER}.github.io/${REPO}#g" "$f"
    rm -f "$f.bak"
    echo "updated $f"
  fi
done
