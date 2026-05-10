#!/usr/bin/env node
/**
 * SPEC-IMAGE-RECOVERY-001 — silent engine/model fallback regression guard.
 *
 * Scans `src/image/` and `src/renderer/components/RecoveryBlockingModal.ts`
 * for patterns that would silently switch the user-selected engine or model.
 * Fails the build (exit 1) when a forbidden pattern is found.
 *
 * Allowed patterns are explicitly whitelisted (user-driven settings storage).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = [
  path.join(ROOT, 'src/image'),
  path.join(ROOT, 'src/renderer/components'),
  path.join(ROOT, 'src/main/ipc'),
];

// Patterns that suggest engine/model auto-switching.
const FORBIDDEN_PATTERNS = [
  /imageSource\s*=\s*['"](?!gemini|deepinfra|nano-banana-pro|imagefx|flow|leonardo|pollinations)/i,
  /subWorkProvider\s*=\s*['"]/,
  /silent.*fallback/i,
  /auto.*switch.*engine/i,
];

// Whitelist substrings — files where the patterns are legitimate (user input handling).
const WHITELIST_FILE_SUBSTRINGS = [
  'HeadingImageSettings.ts',
  'modelRegistry.ts',
  'imageEngineConfig',
  'settingsModal',
];

let violations = 0;

function scanFile(file) {
  if (WHITELIST_FILE_SUBSTRINGS.some((w) => file.includes(w))) return;
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return;
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        // Skip comments — they may legitimately mention the forbidden patterns.
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) continue;
        console.error(
          `❌ silent fallback 의심 패턴 발견:\n  ${file}:${i + 1}\n  ${line.trim()}`,
        );
        violations++;
      }
    }
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|js)$/.test(entry.name) &&
      !/\.test\./.test(entry.name)
    ) {
      scanFile(full);
    }
  }
}

for (const dir of SCAN_DIRS) walk(dir);

if (violations > 0) {
  console.error(`\n[silent-fallback-guard] ${violations}건 위반 — SPEC-IMAGE-RECOVERY-001 위배`);
  process.exit(1);
}

console.log('[silent-fallback-guard] OK — silent engine/model fallback 패턴 없음');
process.exit(0);
