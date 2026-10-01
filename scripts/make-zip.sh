#!/usr/bin/env bash
# Make a release zip. Usage: scripts/make-zip.sh [version]   (default: dev)
# Inside a git repo it zips exactly the committed files; otherwise it zips the folder and skips junk.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:-dev}"
OUT="release/botbench-${VERSION}.zip"
mkdir -p release
rm -f "$OUT"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && [ -n "$(git ls-files | head -1)" ]; then
  git archive --format=zip --prefix="botbench/" -o "$OUT" HEAD
else
  python3 - "$OUT" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
skip_dirs = {".git", "node_modules", "__pycache__", "release", "_site", "venv", ".venv"}
skip_files = {".env", "bot.db"}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for dp, dn, fn in os.walk("."):
        dn[:] = sorted(d for d in dn if d not in skip_dirs)
        for f in sorted(fn):
            if f in skip_files or f.endswith(".pyc"):
                continue
            p = os.path.join(dp, f)
            z.write(p, os.path.join("botbench", os.path.relpath(p, ".")))
PY
fi
echo "Wrote $OUT"
