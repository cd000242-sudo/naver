#!/usr/bin/env node
/**
 * 자료 수집만 돌려보는 검증기 — 글은 생성하지 않는다.
 *
 * [2026-09-01] 사장님이 자료 문제를 확인하려고 매번 글을 뽑아야 했다. LLM 호출이라
 * 돈이 들고, 한 편에 몇 백 원씩 나간다. 그런데 자료 수집은 네이버 검색 API(하루 25,000건
 * 무료)와 크롤링뿐이라 비용이 0이다. 확인해야 할 것이 자료라면 글을 뽑을 이유가 없다.
 *
 * 쓰는 법:
 *   node scripts/check-collection.mjs "키워드" ["키워드2" ...]
 *
 * 보여주는 것:
 *   · 질의가 어떻게 좁혀지는가 (주제어가 살아 있는가)
 *   · 어떤 자료가 몇 건 잡혔는가 (기사 / 블로그)
 *   · 주제와 무관한 자료가 섞였는가
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const dist = (p) => pathToFileURL(resolve(process.cwd(), 'dist', p)).href;

const { narrowSearchQueries } = await import(dist('content/searchQueryNarrowing.js'));
const { isOnTopicForKeyword } = await import(dist('content/supplementTopicGuard.js'));
const { auditSourceMaterial, classifySourceKind } = await import(dist('content/sourceMaterialAudit.js'));
const { collectContentFromPlatforms } = await import(dist('sourceAssembler.js'));

const keywords = process.argv.slice(2);
if (keywords.length === 0) {
  console.error('사용법: node scripts/check-collection.mjs "키워드" ["키워드2" ...]');
  process.exit(1);
}

/*
 * 설정 파일을 직접 읽는다. getConfigSync 는 Electron 의 userData 경로에 기대는데
 * 이 스크립트는 Electron 밖이라 빈 설정을 받아, 네이버 API 를 못 쓰고
 * 크롤링 경로만 돌게 된다(실측: 4,111자가 124자로 떨어졌다).
 */
const { readFileSync, readdirSync } = await import('node:fs');
const { homedir } = await import('node:os');
const settingsDir = resolve(homedir(), 'AppData', 'Roaming', 'better-life-naver');
let cfg = {};
try {
  const file = readdirSync(settingsDir).find((f) => f.startsWith('settings_') && f.endsWith('.json'));
  if (file) cfg = JSON.parse(readFileSync(resolve(settingsDir, file), 'utf-8'));
} catch { /* 설정을 못 읽으면 환경변수로 넘어간다 */ }
const clientId = cfg.naverClientId || process.env.NAVER_CLIENT_ID || '';
const clientSecret = cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '';
console.log(`네이버 API 키: ${clientId && clientSecret ? '✅ 로드됨' : '❌ 없음 — 크롤링만 검증됩니다'}`);

for (const keyword of keywords) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔎 "${keyword}"`);
  console.log('='.repeat(70));

  const queries = narrowSearchQueries(keyword);
  console.log('\n[질의 좁힘]');
  for (const [i, q] of queries.entries()) {
    console.log(`  ${i === 0 ? '원문' : `후보${i}`}: ${q}`);
  }

  let result;
  try {
    result = await collectContentFromPlatforms(keyword, {
      clientId, clientSecret, logger: (m) => console.log(`  ${m}`),
    });
  } catch (e) {
    console.log(`  ❌ 수집 실패: ${e?.message || e}`);
    continue;
  }

  const urls = result?.urls || [];
  const news = urls.filter((u) => classifySourceKind(u) === 'news').length;
  const text = String(result?.collectedText || result?.text || '');

  console.log('\n[자료 등급]');
  const audit = auditSourceMaterial({ newsCount: news, blogCount: urls.length - news, totalChars: text.length });
  console.log(`  기사 ${news}건 / 블로그 ${urls.length - news}건 / ${text.length.toLocaleString()}자`);
  console.log(`  ${audit.level === 'ok' ? '✅ 정상' : `⚠️ ${audit.message}`}`);

  console.log('\n[주제 일치]');
  const blocks = text.split(/\n(?=\[자료 \d)/u).filter((b) => b.trim().length > 60);
  let offTopic = 0;
  for (const block of blocks) {
    const head = block.slice(0, 60).replace(/\s+/gu, ' ');
    const ok = isOnTopicForKeyword(block, keyword);
    if (!ok) offTopic += 1;
    console.log(`  ${ok ? '✅' : '⛔ 무관'} ${head}…`);
  }
  console.log(`\n  → 자료 ${blocks.length}건 중 주제 무관 ${offTopic}건`);
}
