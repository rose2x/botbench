#!/usr/bin/env node
'use strict';
// Scan files for leaked secrets. Usage: botbench-scan-secrets [paths...]   (default: current folder)
// Exits with 1 if anything looks like a secret. Great as a CI step or a pre-commit hook.
process.exit(require('../src/redact').main());
