#!/usr/bin/env bash
# Publish this folder to a new GitHub repository.
#
#   scripts/publish-to-github.sh [repo-name] [public|private]
#
# Needs git, and the GitHub CLI (https://cli.github.com) signed in with `gh auth login`.
# Without the GitHub CLI it prints the manual steps instead. See docs/PUBLISHING.md.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${1:-botbench}"
VIS="${2:-public}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init -b main
if [ -z "$(git config user.name || true)" ] || [ -z "$(git config user.email || true)" ]; then
  echo "Tell git who you are first (this name shows on your commits):"
  echo '  git config --global user.name  "Your Name"'
  echo '  git config --global user.email "you@example.com"'
  exit 1
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  OWNER="$(gh api user -q .login)"
  bash scripts/set-repo.sh "$OWNER" "$REPO"
  git add -A
  git diff --cached --quiet || git commit -m "Initial commit: Bot Bench"
  gh repo create "$REPO" "--$VIS" --source=. --remote=origin --push \
    --description "Discord bot toolkit: Python + JavaScript bots, a one-script SDK, docs and 115 free APIs"
  # Turn on GitHub Pages from Actions (needs admin rights on the repo; harmless if it fails).
  gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
    && echo "GitHub Pages enabled." \
    || echo "Enable Pages yourself: Settings > Pages > Source: GitHub Actions."
  echo
  echo "Done: https://github.com/$OWNER/$REPO"
  echo "Site (after the first Pages run): https://$OWNER.github.io/$REPO/"
else
  echo "GitHub CLI not found or not signed in. Manual steps:"
  echo "  1. Create an EMPTY repository on github.com (no README, no license)."
  echo "  2. Run:  scripts/set-repo.sh YOUR_USERNAME $REPO"
  echo "  3. Run:  git add -A && git commit -m 'Initial commit' && git branch -M main"
  echo "  4. Run:  git remote add origin https://github.com/YOUR_USERNAME/$REPO.git && git push -u origin main"
  echo "  5. On GitHub: Settings > Pages > Source: GitHub Actions"
fi
