#!/usr/bin/env node
// One-shot patcher for the summer-theme transition.
// - Adds summer-theme.css <link> before </head> (if not present)
// - Adds summer-theme.js <script> before </body> (if not present)
// - Replaces mailto:cd000242@gmail.com href with the KakaoTalk URL.
// Idempotent: re-running has no effect once everything is in place.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const KAKAO_URL = 'https://open.kakao.com/o/sPcaslwh';
const CSS_TAG = '    <link rel="stylesheet" href="summer-theme.css">';
const JS_TAG = '    <script src="summer-theme.js"></script>';

const MAILTO_RE = /href=(["'])mailto:cd000242@gmail\.com(?:\?[^"']*)?\1/g;

async function patch(file) {
  const full = path.join(ROOT, file);
  let src = await readFile(full, 'utf8');
  const changes = [];

  if (!src.includes('summer-theme.css') && src.includes('</head>')) {
    src = src.replace('</head>', CSS_TAG + '\n</head>');
    changes.push('css');
  }

  if (!src.includes('summer-theme.js') && src.includes('</body>')) {
    src = src.replace('</body>', JS_TAG + '\n</body>');
    changes.push('js');
  }

  if (MAILTO_RE.test(src)) {
    MAILTO_RE.lastIndex = 0;
    src = src.replace(
      MAILTO_RE,
      `href="${KAKAO_URL}" target="_blank" rel="noopener"`,
    );
    changes.push('kakao');
  }

  if (changes.length === 0) return null;
  await writeFile(full, src, 'utf8');
  return changes;
}

async function main() {
  const entries = await readdir(ROOT);
  const htmls = entries.filter((f) => f.endsWith('.html'));
  let touched = 0;
  for (const f of htmls) {
    const ch = await patch(f);
    if (ch) {
      console.log(`[OK]    ${f.padEnd(28)} ${ch.join(', ')}`);
      touched++;
    } else {
      console.log(`[skip]  ${f}`);
    }
  }
  console.log(`\nTotal: ${touched}/${htmls.length} files patched`);
}

main().catch((err) => {
  console.error('[ERR]', err.message);
  process.exit(1);
});
