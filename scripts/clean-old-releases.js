#!/usr/bin/env node
/**
 * [2026-08-04] release_final 이전 버전 정리.
 *
 * 매 릴리스마다 Setup-x.y.z.exe(약 180MB)와 .blockmap이 쌓여 폴더가 GB 단위로
 * 커진다. 현재 package.json 버전의 산출물만 남기고 이전 버전 파일을 지운다.
 *
 * 안전 규칙:
 * - 현재 버전 exe / blockmap / latest.yml / win-unpacked 는 절대 지우지 않는다
 *   (latest.yml은 현재 버전을 가리키고, win-unpacked는 재패키징 캐시).
 * - 버전이 붙은 산출물만 대상으로 한다. 정규식에 맞지 않는 파일은 건드리지 않는다.
 * - --dry-run 으로 삭제 목록만 확인할 수 있다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release_final');

/** 버전이 붙은 릴리스 산출물만 매칭 — 그 외 파일은 대상에서 제외된다. */
const VERSIONED_ARTIFACT = /^(.+?)-(\d+\.\d+\.\d+)\.exe(\.blockmap)?$/;

function readCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const version = String(pkg.version || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`package.json version이 올바르지 않습니다: "${version}"`);
  }
  return version;
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(RELEASE_DIR)) {
    console.log('[CleanReleases] release_final 폴더가 없습니다 — 정리할 것이 없습니다.');
    return;
  }

  const currentVersion = readCurrentVersion();
  const entries = fs.readdirSync(RELEASE_DIR, { withFileTypes: true });

  const stale = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;                       // win-unpacked 등 디렉토리 보존
    const match = VERSIONED_ARTIFACT.exec(entry.name);
    if (!match) continue;                                // latest.yml, builder-debug.yml 등 보존
    if (match[2] === currentVersion) continue;           // 현재 버전 보존
    const full = path.join(RELEASE_DIR, entry.name);
    stale.push({ name: entry.name, full, size: fs.statSync(full).size });
  }

  if (stale.length === 0) {
    console.log(`[CleanReleases] 현재 버전 ${currentVersion} 외 이전 산출물이 없습니다.`);
    return;
  }

  const total = stale.reduce((sum, f) => sum + f.size, 0);
  console.log(`[CleanReleases] 현재 버전: ${currentVersion} — 이전 산출물 ${stale.length}개 (${formatMb(total)})`);

  for (const file of stale) {
    if (dryRun) {
      console.log(`  [dry-run] 삭제 예정: ${file.name} (${formatMb(file.size)})`);
      continue;
    }
    try {
      fs.unlinkSync(file.full);
      console.log(`  🗑️ 삭제: ${file.name} (${formatMb(file.size)})`);
    } catch (err) {
      console.warn(`  ⚠️ 삭제 실패 (건너뜀): ${file.name} — ${err.message}`);
    }
  }

  if (!dryRun) {
    console.log(`[CleanReleases] ✅ 완료 — ${formatMb(total)} 확보`);
  }
}

try {
  main();
} catch (err) {
  // 정리 실패가 릴리스를 막지는 않는다 (부가 작업).
  console.warn(`[CleanReleases] ⚠️ 정리 건너뜀: ${err.message}`);
}
