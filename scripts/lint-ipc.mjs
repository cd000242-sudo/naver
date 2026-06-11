// SPEC-STABILITY-2026 Phase 6.2 — IPC contract lint.
//
// Verifies that every channel the preload bridge exposes to the renderer
// (ipcRenderer.invoke / ipcRenderer.send with a literal channel) is actually
// registered somewhere in the main process (ipcMain.handle / ipcMain.on /
// the safeHandle wrapper). A missing registration is exactly the
// blob:hasMany incident (13b29f9a): the renderer calls into a void, every
// feature behind the channel dies silently.
//
// Usage: npm run lint:ipc   (exit 1 when any channel is unregistered)

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Channels that are intentionally dynamic or registered through patterns the
// static scanner cannot see. Every entry needs a reason.
export const ALLOWLIST = new Set([
  // (none yet)
]);

const PRELOAD_RE = /ipcRenderer\.(?:invoke|send)\(\s*['"`]([^'"`$]+)['"`]/g;
// `once` included: license:code registers lazily when the license window
// opens — a real registration, not a dead channel.
const MAIN_RE = /(?:ipcMain\.(?:handle|on|once)|safeHandle)\(\s*['"`]([^'"`$]+)['"`]/g;

export function extractPreloadChannels(source) {
  const channels = new Set();
  for (const m of String(source).matchAll(PRELOAD_RE)) channels.add(m[1]);
  return channels;
}

export function extractMainChannels(sources) {
  const channels = new Set();
  for (const source of sources) {
    for (const m of String(source).matchAll(MAIN_RE)) channels.add(m[1]);
  }
  return channels;
}

/** Returns the list of preload channels with no main-process registration. */
export function findUnregisteredChannels(preloadSource, mainSources) {
  const preload = extractPreloadChannels(preloadSource);
  const main = extractMainChannels(mainSources);
  return [...preload].filter((ch) => !main.has(ch) && !ALLOWLIST.has(ch)).sort();
}

function walkTsFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'renderer' || entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walkTsFiles(full, out);
    } else if (entry.name.endsWith('.ts') && entry.name !== 'preload.ts') {
      out.push(full);
    }
  }
  return out;
}

export function runIpcLint(rootDir) {
  const preloadPath = path.join(rootDir, 'src', 'preload.ts');
  const preloadSource = fs.readFileSync(preloadPath, 'utf8');
  const mainFiles = walkTsFiles(path.join(rootDir, 'src'), []);
  const mainSources = mainFiles.map((f) => fs.readFileSync(f, 'utf8'));
  const missing = findUnregisteredChannels(preloadSource, mainSources);
  return {
    missing,
    preloadCount: extractPreloadChannels(preloadSource).size,
    mainCount: extractMainChannels(mainSources).size,
    mainFileCount: mainFiles.length,
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { missing, preloadCount, mainCount, mainFileCount } = runIpcLint(root);
  console.log(`[lint:ipc] preload 채널 ${preloadCount}개 ↔ main 등록 ${mainCount}개 (${mainFileCount}개 파일 스캔)`);
  if (missing.length > 0) {
    console.error(`[lint:ipc] ❌ main 프로세스에 등록되지 않은 채널 ${missing.length}개:`);
    for (const ch of missing) console.error(`  - ${ch}`);
    console.error('[lint:ipc] 등록 누락은 blob:hasMany 사고(13b29f9a)와 같은 silent 기능 전멸을 만듭니다.');
    process.exit(1);
  }
  console.log('[lint:ipc] ✅ 모든 preload 채널이 main에 등록되어 있습니다.');
}
