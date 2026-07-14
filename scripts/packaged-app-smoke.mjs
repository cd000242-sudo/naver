#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIsolatedPackagedAppEnv,
  findPackagedExecutable,
  removeIsolatedSmokeRoot,
} from './lib/packaged-smoke-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unpackedDir = path.join(root, 'release_final', 'win-unpacked');
if (!fs.existsSync(unpackedDir)) {
  console.error(`[packaged-smoke] win-unpacked not found: ${unpackedDir}`);
  process.exit(1);
}

const executableName = findPackagedExecutable(fs.readdirSync(unpackedDir));
if (!executableName) {
  console.error('[packaged-smoke] product executable not found');
  process.exit(1);
}

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bln-packaged-smoke-'));
for (const dir of ['appdata', 'localappdata', 'profile', 'userdata']) {
  fs.mkdirSync(path.join(isolatedRoot, dir), { recursive: true });
}

const executable = path.join(unpackedDir, executableName);
console.log(`[packaged-smoke] launching ${executableName} with isolated profile ${isolatedRoot}`);
try {
  const result = spawnSync(executable, [], {
    cwd: unpackedDir,
    env: buildIsolatedPackagedAppEnv(process.env, isolatedRoot),
    stdio: 'inherit',
    timeout: 120_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`packaged app self-test exited with ${result.status}`);
  }
  console.log('[packaged-smoke] PASS');
} finally {
  removeIsolatedSmokeRoot(isolatedRoot);
}
