#!/usr/bin/env node
// Full-auto Apps Script redeploy via clasp.
// The deployment ID is reused, so the /exec URL stays the same — no HTML or
// git changes needed.
//
// Usage:
//   node payment-page/scripts/redeploy-auto.mjs           # real redeploy
//   node payment-page/scripts/redeploy-auto.mjs --dry-run # show what would run

import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, 'gas.config.json');

const log = {
  info: (m) => console.log(`[INFO]  ${m}`),
  ok: (m) => console.log(`[OK]    ${m}`),
  warn: (m) => console.log(`[WARN]  ${m}`),
  err: (m) => console.error(`[ERR]   ${m}`),
};

function parseArgs(argv) {
  const flags = new Set(argv);
  return {
    dryRun: flags.has('--dry-run'),
    skipPull: flags.has('--skip-pull'),
  };
}

async function loadConfig() {
  const raw = await readFile(CONFIG_PATH, 'utf8');
  const cfg = JSON.parse(raw);
  if (!cfg.scriptId || !cfg.deploymentId || !cfg.deploymentUrl) {
    throw new Error('gas.config.json is missing required fields');
  }
  return cfg;
}

function run(cmd, cwd, dryRun) {
  if (dryRun) {
    log.info(`(dry-run) would run: ${cmd}`);
    return '';
  }
  log.info(`$ ${cmd}`);
  return execSync(cmd, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function healthCheck(url) {
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    const json = JSON.parse(text);
    return json;
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
  }
}

async function main() {
  const { dryRun, skipPull } = parseArgs(process.argv.slice(2));
  const cfg = await loadConfig();

  log.ok(`Project: ${cfg.projectName} (${cfg.account})`);
  log.ok(`Script ID:     ${cfg.scriptId}`);
  log.ok(`Deployment ID: ${cfg.deploymentId.slice(0, 24)}...`);
  log.ok(`URL:           ${cfg.deploymentUrl}`);
  if (dryRun) log.warn('DRY-RUN MODE: no actual changes will be made.');

  const claspDir = path.resolve(__dirname, cfg.claspWorkingDir);

  // 1. Pre-flight health check (informational)
  log.info('Pre-flight health check...');
  try {
    const before = await healthCheck(cfg.deploymentUrl);
    log.ok(`Currently alive: ${before.message ?? JSON.stringify(before).slice(0, 80)}`);
  } catch (err) {
    log.warn(`Currently down (this is the expected failure mode): ${err.message}`);
  }

  // 2. Pull latest code from Apps Script editor
  if (!skipPull) {
    log.info('Pulling latest code from Apps Script editor...');
    run('clasp pull', claspDir, dryRun);
    if (!dryRun) log.ok('Pull complete.');
  } else {
    log.info('Skipping pull (--skip-pull).');
  }

  // 3. Re-deploy to the same deployment ID → URL unchanged
  const desc = `Auto-redeploy ${new Date().toISOString().replace(/[:.]/g, '-')}`;
  log.info(`Re-deploying (description: "${desc}")`);
  const deployOutput = run(
    `clasp deploy -i "${cfg.deploymentId}" -d "${desc}"`,
    claspDir,
    dryRun,
  );
  if (!dryRun) {
    log.ok('Deploy command finished.');
    if (deployOutput.trim()) {
      console.log(deployOutput);
    }
  }

  if (dryRun) {
    log.ok('Dry-run complete. Run without --dry-run to apply.');
    return;
  }

  // 4. Wait for propagation
  log.info('Waiting 5 seconds for propagation...');
  await new Promise((r) => setTimeout(r, 5000));

  // 5. Post-deploy health check
  log.info('Post-deploy health check...');
  const after = await healthCheck(cfg.deploymentUrl);
  log.ok(`Alive after redeploy: ${after.message ?? JSON.stringify(after).slice(0, 80)}`);

  log.ok('Done. URL unchanged, deployment refreshed.');
}

main().catch((err) => {
  log.err(err.message);
  process.exit(1);
});
