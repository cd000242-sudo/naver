// Wrapper to launch Electron with ELECTRON_RUN_AS_NODE explicitly removed.
// cross-env's `VAR=` sets empty string which Electron 31 still treats as defined
// (forcing node mode). Explicit `delete` in Node is reliable cross-platform.

import { spawn } from 'node:child_process';
import process from 'node:process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn('electron', ['.'], {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[run-electron-dev] spawn error:', err);
  process.exit(1);
});
