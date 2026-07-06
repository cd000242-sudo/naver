#!/usr/bin/env node
// Apps Script redeploy pipeline for leaderspro.kr payment pages.
// Usage:
//   node payment-page/scripts/redeploy.mjs <new-gas-url> [--no-push] [--dry-run]
//
// Flow:
//   1. Validate new /exec URL.
//   2. Replace GAS_URL in bank-order.html + admin.html.
//   3. Health-check the new URL (GET).
//   4. Stage only payment-page/*.html, build a Lore-format commit, push to origin.
//   5. GitHub Pages auto-deploys within 1-2 min.

import { readFile, writeFile } from 'node:fs/promises';
import { writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const FILES_TO_UPDATE = [
  'payment-page/bank-order.html',
  'payment-page/admin.html',
];

const GAS_URL_REGEX =
  /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g;
const GAS_URL_STRICT =
  /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

const log = {
  info: (m) => console.log(`[INFO]  ${m}`),
  ok: (m) => console.log(`[OK]    ${m}`),
  warn: (m) => console.log(`[WARN]  ${m}`),
  err: (m) => console.error(`[ERR]   ${m}`),
};

function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  return {
    newUrl: positional[0],
    noPush: flags.has('--no-push'),
    dryRun: flags.has('--dry-run'),
  };
}

function validateUrl(url) {
  if (!GAS_URL_STRICT.test(url)) {
    throw new Error(
      `Invalid Apps Script URL. Expected https://script.google.com/macros/s/.../exec, got: ${url}`,
    );
  }
}

async function updateFile(filePath, newUrl, dryRun) {
  const fullPath = path.join(REPO_ROOT, filePath);
  const content = await readFile(fullPath, 'utf8');
  const matches = content.match(GAS_URL_REGEX);
  if (!matches || matches.length === 0) {
    throw new Error(`No Apps Script URL token found in ${filePath}`);
  }
  const oldUrl = matches[0];
  if (oldUrl === newUrl) {
    log.warn(`${filePath}: already on new URL`);
    return false;
  }
  if (dryRun) {
    log.info(`(dry-run) would update ${filePath}`);
    return true;
  }
  const updated = content.replace(GAS_URL_REGEX, newUrl);
  await writeFile(fullPath, updated, 'utf8');
  log.ok(`${filePath} updated`);
  return true;
}

async function healthCheck(url) {
  log.info('Pinging new Apps Script URL...');
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    const json = JSON.parse(text);
    log.ok(`Health OK: ${json.message ?? JSON.stringify(json).slice(0, 80)}`);
    return json;
  } catch {
    throw new Error(
      `Non-JSON response (likely CORS/permission issue): ${text.slice(0, 200)}`,
    );
  }
}

function runGit(args, opts = {}) {
  log.info(`$ git ${args}`);
  return execSync(`git ${args}`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

function shortDeploymentId(url) {
  const match = url.match(/macros\/s\/([^/]+)\/exec$/);
  if (!match) return 'unknown';
  return match[1].slice(-12);
}

function buildLoreMessage(newUrl) {
  const tail = shortDeploymentId(newUrl);
  return [
    `fix(payment): Apps Script URL 갱신 (${tail})`,
    '',
    '재배포로 발급된 새 deployment URL을 결제 페이지에 반영.',
    '',
    'Constraint: leaderspro.kr 결제 페이지는 항상 활성 Apps Script /exec URL을 가리켜야 함',
    'Confidence: high',
    'Scope-risk: local',
    'Reversibility: trivial',
    'Directive: GitHub Pages 자동 배포(1-2분) 후 사이트에서 테스트 주문 1건 권장',
    'Tested: 새 URL GET 헬스체크 통과',
    'Not-tested: 사이트 배포 후 실 POST 주문 흐름',
    'Related: payment-page Apps Script 의존성',
    '',
    '🐙 Autopus <noreply@autopus.co>',
  ].join('\n');
}

function commitAndPush(newUrl) {
  for (const file of FILES_TO_UPDATE) {
    runGit(`add "${file}"`);
  }
  const staged = runGit('diff --cached --name-only').trim();
  if (!staged) {
    log.warn('Nothing staged, skipping commit');
    return false;
  }
  log.ok(`Staged: ${staged.split('\n').join(', ')}`);

  const msgFile = path.join(os.tmpdir(), `lore-${Date.now()}.txt`);
  writeFileSync(msgFile, buildLoreMessage(newUrl), 'utf8');
  try {
    runGit(`commit -F "${msgFile}"`);
  } finally {
    try {
      unlinkSync(msgFile);
    } catch {}
  }

  runGit('push origin main');
  return true;
}

async function main() {
  const { newUrl, noPush, dryRun } = parseArgs(process.argv.slice(2));

  if (!newUrl) {
    log.err(
      'Usage: node payment-page/scripts/redeploy.mjs <new-gas-url> [--no-push] [--dry-run]',
    );
    process.exit(1);
  }

  validateUrl(newUrl);
  log.ok(`Target: ${newUrl}`);

  let anyChanged = false;
  for (const file of FILES_TO_UPDATE) {
    if (await updateFile(file, newUrl, dryRun)) anyChanged = true;
  }

  if (!anyChanged) {
    // Working tree already has the new URL — but the commit may not be pushed yet.
    const pending = execSync('git status --porcelain payment-page', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    if (!pending) {
      log.info('No changes needed and git is clean. Exiting.');
      return;
    }
    log.info('Files already updated, but pending git changes detected. Proceeding to commit & push.');
  }

  if (dryRun) {
    log.info('(dry-run) Skipping health-check, commit, and push.');
    return;
  }

  await healthCheck(newUrl);

  if (noPush) {
    log.info('--no-push flag detected: skip commit & push.');
    log.info('Manual: git add → commit → push');
    return;
  }

  const pushed = commitAndPush(newUrl);
  if (pushed) {
    log.ok('Done. GitHub Pages will go live in ~1-2 minutes.');
  }
}

main().catch((err) => {
  log.err(err.message);
  process.exit(1);
});
