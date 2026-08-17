#!/usr/bin/env node
/**
 * [2026-08-18] 사이트 다운로드 버전 드리프트 검사.
 *
 * 왜: 릴리즈를 올려도 사이트 카탈로그(spa/src/data/download-catalog.json)를 같이
 * 고치지 않으면 방문자는 계속 구버전을 받는다. 실측으로 v2.11.195를 배포한 시점에
 * 사이트는 v2.11.182(SPA) / v2.11.67(레거시 페이지)를 내려주고 있었다.
 *
 * 하는 일: package.json 버전과 카탈로그의 naver Windows 링크 버전을 비교한다.
 *   불일치면 exit 1 — 릴리즈 전에 반드시 맞춘다.
 *
 * 사용: node scripts/check-download-catalog-version.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(resolve(ROOT, 'spa/src/data/download-catalog.json'), 'utf8'));

const appVersion = String(pkg.version || '').trim();
const win = (catalog?.naver?.downloads || []).find((d) => d.key === 'windows');

if (!win?.url) {
  console.error('[DownloadCatalog] naver windows 항목을 찾지 못했습니다.');
  process.exit(1);
}

const urlVersion = (win.url.match(/Better-Life-Naver-Setup-([\d.]+)\.exe/) || [])[1] || '';
const detailVersion = (String(win.detail || '').match(/([\d.]+)/) || [])[1] || '';
const headerVersion = (String(catalog?.naver?.version || '').match(/v([\d.]+)/) || [])[1] || '';

const mismatches = [
  ['다운로드 URL', urlVersion],
  ['버튼 표기(detail)', detailVersion],
  ['카드 제목(version)', headerVersion],
].filter(([, v]) => v !== appVersion);

if (mismatches.length > 0) {
  console.error(`[DownloadCatalog] ❌ 앱 버전(${appVersion})과 사이트 카탈로그가 다릅니다:`);
  for (const [label, value] of mismatches) {
    console.error(`   - ${label}: ${value || '(없음)'}`);
  }
  console.error('   → spa/src/data/download-catalog.json 의 naver 항목을 최신 버전으로 갱신하세요.');
  process.exit(1);
}

console.log(`[DownloadCatalog] ✅ 사이트 카탈로그가 앱 버전(${appVersion})과 일치합니다.`);
