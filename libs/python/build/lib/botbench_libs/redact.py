"""Find and hide secrets (bot tokens, webhook URLs, API keys) in text, logs and files.

    redact("token: " + some_token)                 # "token: [REDACTED:discord_token]"
    python -m botbench_libs.redact src/ README.md  # scan files; exits 1 if it finds anything

Pattern-based, so it's a safety net, not a guarantee. It won't catch a secret it has no pattern for.
"""
from __future__ import annotations

import logging
import os
import re
import sys
from typing import Callable, Iterable, List

PATTERNS = [
    ("discord_webhook", re.compile(r"https://(?:ptb\.|canary\.)?discord(?:app)?\.com/api/(?:v\d+/)?webhooks/\d+/[\w-]+")),
    ("discord_token", re.compile(r"[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,38}")),
    ("anthropic_key", re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}")),
    ("github_token", re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}")),
    ("aws_access_key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("private_key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
]


def find_secrets(text: str) -> List[dict]:
    """Returns [{"kind", "match", "start", "end"}] sorted by position, without overlaps."""
    found = []
    for kind, rx in PATTERNS:
        for m in rx.finditer(text):
            found.append({"kind": kind, "match": m.group(0), "start": m.start(), "end": m.end()})
    found.sort(key=lambda f: (f["start"], -(f["end"] - f["start"])))
    out, last_end = [], -1
    for f in found:
        if f["start"] >= last_end:
            out.append(f)
            last_end = f["end"]
    return out


def redact(text: str, mask: Callable[[str], str] = lambda kind: f"[REDACTED:{kind}]") -> str:
    out, pos = [], 0
    for f in find_secrets(text):
        out.append(text[pos:f["start"]])
        out.append(mask(f["kind"]))
        pos = f["end"]
    out.append(text[pos:])
    return "".join(out)


class RedactFilter(logging.Filter):
    """logging.getLogger().addFilter(RedactFilter()) hides secrets in every log line."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = ()
        return True


SKIP_DIRS = {".git", "node_modules", "__pycache__", "venv", ".venv", "_site", "release", "dist"}


def _walk(root: str) -> Iterable[str]:
    if os.path.isfile(root):
        yield root
        return
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            yield os.path.join(dirpath, name)


def scan_paths(paths: Iterable[str], exclude: Iterable[str] = ("/test/", "/tests/")) -> List[dict]:
    """Scan files and folders. Findings show the kind and a masked preview, never the whole secret."""
    findings = []
    for root in paths:
        for path in _walk(root):
            norm = path.replace("\\", "/")
            if any(x in norm for x in exclude):
                continue
            try:
                with open(path, encoding="utf-8") as fh:
                    text = fh.read()
            except (UnicodeDecodeError, OSError):
                continue
            for f in find_secrets(text):
                line = text.count("\n", 0, f["start"]) + 1
                findings.append({"path": path, "line": line, "kind": f["kind"], "preview": f["match"][:6] + "…"})
    return findings


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv) or ["."]
    findings = scan_paths(args)
    for f in findings:
        print(f"{f['path']}:{f['line']}: possible {f['kind']} ({f['preview']})")
    print(f"{len(findings)} possible secret(s) found" if findings else "No secrets found")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
