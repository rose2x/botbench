#!/usr/bin/env bash
# Assemble the GitHub Pages site into _site/:
#   /              the documentation website
#   /playground/   the botbench SDK playground
#   /dist/         the SDK files (the playground loads ../dist/botbench.js)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site/playground _site/dist
cp website/index.html _site/index.html
cp botbench-sdk/demo/index.html _site/playground/index.html
cp botbench-sdk/dist/* _site/dist/
cp docs/CHEATSHEET.md docs/FREE-APIS.md data/apis.json data/apis.csv _site/
touch _site/.nojekyll
echo "Built _site/"
