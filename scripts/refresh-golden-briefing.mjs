#!/usr/bin/env node
/**
 * 황금키워드 브리핑 갱신 — 검색량은 많은데 글이 적은 키워드를 실측으로 고른다.
 *
 * 왜 필요한가:
 *   홈의 "무료 선정 황금키워드" 가 2026-07-16 발행본에 멈춰 있었다. 그 데이터를
 *   만들던 24시간 워커가 Vultr 에 있었고 서버를 폐지하면서 같이 사라졌다.
 *
 * 어디서 후보를 얻는가:
 *   실시간 레인(source-signals.json)의 키워드와 자동완성 확장. 지금 사람들이
 *   실제로 치고 있는 말이라 후보의 출처가 분명하다. 합성 조합은 쓰지 않는다.
 *
 * 무엇을 재는가 (둘 다 실측):
 *   searchVolume   네이버 검색광고 API 월간 조회수(PC+모바일)
 *   documentCount  네이버 검색 API 블로그 문서 총건수
 *   opportunity    searchVolume / documentCount — 수요 대비 공급이 얼마나 비었나
 *
 * 추정하지 않는다. 두 값 중 하나라도 못 재면 그 키워드는 버린다.
 * 화면에 나가는 숫자는 전부 API 가 준 값이다.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'spa', 'public', 'data');
const SIGNALS = join(OUT_DIR, 'source-signals.json');
const OUT = join(OUT_DIR, 'home-keyword-briefing-seed.json');

const SEARCHAD_LICENSE = String(process.env.NAVER_SEARCHAD_ACCESS_LICENSE || '').trim();
const SEARCHAD_SECRET = String(process.env.NAVER_SEARCHAD_SECRET_KEY || '').trim();
const SEARCHAD_CUSTOMER = String(process.env.NAVER_SEARCHAD_CUSTOMER_ID || '').trim();
const SEARCH_CLIENT_ID = String(process.env.NAVER_CLIENT_ID || '').trim();
const SEARCH_CLIENT_SECRET = String(process.env.NAVER_CLIENT_SECRET || '').trim();
// [2026-08] NAVER API HUB (네이버클라우드). 있으면 이쪽을 먼저 쓰고, 인증이 막히면 기존 키로 넘어간다.
const HUB_CLIENT_ID = String(process.env.NAVER_HUB_CLIENT_ID || '').trim();
const HUB_CLIENT_SECRET = String(process.env.NAVER_HUB_CLIENT_SECRET || '').trim();

/** HUB 우선, 기존 키가 그 다음. 있는 것만 담는다. */
function naverCredentials() {
  const creds = [];
  if (HUB_CLIENT_ID && HUB_CLIENT_SECRET) {
    creds.push({
      mode: 'hub',
      url: (type, qs) => `https://naverapihub.apigw.ntruss.com/search/v1/${type}?${qs}`,
      headers: { 'X-NCP-APIGW-API-KEY-ID': HUB_CLIENT_ID, 'X-NCP-APIGW-API-KEY': HUB_CLIENT_SECRET },
    });
  }
  if (SEARCH_CLIENT_ID && SEARCH_CLIENT_SECRET) {
    creds.push({
      mode: 'legacy',
      url: (type, qs) => `https://openapi.naver.com/v1/search/${type}.json?${qs}`,
      headers: { 'X-Naver-Client-Id': SEARCH_CLIENT_ID, 'X-Naver-Client-Secret': SEARCH_CLIENT_SECRET },
    });
  }
  return creds;
}

/** 황금 판정 기준. 검색은 있는데 글이 적어야 초보자가 1페이지에 갈 수 있다. */
const MIN_VOLUME = Number(process.env.GOLDEN_MIN_VOLUME || 300);
const MAX_DOCS = Number(process.env.GOLDEN_MAX_DOCS || 20000);
const MIN_OPPORTUNITY = Number(process.env.GOLDEN_MIN_OPPORTUNITY || 1);
const MAX_ROWS = Number(process.env.GOLDEN_MAX_ROWS || 120);
const MAX_CANDIDATES = Number(process.env.GOLDEN_MAX_CANDIDATES || 400);

const report = [];
const log = (m) => { report.push(m); console.log(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function missingCredentials() {
  const missing = [];
  if (!SEARCHAD_LICENSE) missing.push('NAVER_SEARCHAD_ACCESS_LICENSE');
  if (!SEARCHAD_SECRET) missing.push('NAVER_SEARCHAD_SECRET_KEY');
  if (!SEARCHAD_CUSTOMER) missing.push('NAVER_SEARCHAD_CUSTOMER_ID');
  if (!SEARCH_CLIENT_ID) missing.push('NAVER_CLIENT_ID');
  if (!SEARCH_CLIENT_SECRET) missing.push('NAVER_CLIENT_SECRET');
  return missing;
}

/** 검색광고 API 는 HMAC 서명을 요구한다. */
function searchAdHeaders(method, path) {
  const ts = Date.now().toString();
  const signature = createHmac('sha256', SEARCHAD_SECRET)
    .update(`${ts}.${method}.${path}`)
    .digest('base64');
  return {
    'X-Timestamp': ts,
    'X-API-KEY': SEARCHAD_LICENSE,
    'X-Customer': SEARCHAD_CUSTOMER,
    'X-Signature': signature,
  };
}

/** 월간 검색량. 한 번에 5개까지 물어볼 수 있다. */
async function fetchVolumes(keywords) {
  const path = '/keywordstool';
  const hint = keywords.map((k) => k.replace(/\s+/g, '')).join(',');
  const url = `https://api.searchad.naver.com${path}?hintKeywords=${encodeURIComponent(hint)}&showDetail=1`;
  try {
    const res = await fetch(url, { headers: searchAdHeaders('GET', path) });
    if (!res.ok) return new Map();
    const data = await res.json();
    const out = new Map();
    for (const row of data.keywordList || []) {
      const name = String(row.relKeyword || '').trim();
      // "< 10" 처럼 문자로 오는 경우가 있다. 숫자가 아니면 버린다 — 추정하지 않는다.
      const pc = Number(row.monthlyPcQcCnt);
      const mo = Number(row.monthlyMobileQcCnt);
      if (!name || !Number.isFinite(pc) || !Number.isFinite(mo)) continue;
      out.set(name.replace(/\s+/g, ''), pc + mo);
    }
    return out;
  } catch {
    return new Map();
  }
}

/** 블로그 문서 총건수. */
async function fetchDocumentCount(keyword) {
  const qs = `query=${encodeURIComponent(keyword)}&display=1`;
  const creds = naverCredentials();
  for (let i = 0; i < creds.length; i++) {
    const cred = creds[i];
    try {
      const res = await fetch(cred.url('blog', qs), { headers: cred.headers });
      if (!res.ok) {
        // 인증이 막힌 경우에만 다른 키로 토스한다. 한도(429)는 키를 바꿔도 같다.
        if ([401, 403, 404].includes(res.status) && i < creds.length - 1) continue;
        return null;
      }
      const data = await res.json();
      const total = Number(data.total);
      return Number.isFinite(total) ? total : null;
    } catch {
      return null; // 네트워크 오류는 키 문제가 아니다
    }
  }
  return null;
}

/** 실시간 레인에서 후보를 모은다. 키워드 본체 + 자동완성 확장. */
function collectCandidates() {
  if (!existsSync(SIGNALS)) return [];
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(SIGNALS, 'utf8'));
  } catch {
    return [];
  }
  const seen = new Set();
  const out = [];
  const push = (raw) => {
    const keyword = String(raw || '').replace(/\s+/g, ' ').trim();
    if (keyword.length < 2 || keyword.length > 25) return;
    // 기사 제목 통째는 검색어가 아니다.
    if (keyword.split(/\s+/).length > 5) return;
    const key = keyword.replace(/\s+/g, '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(keyword);
  };
  for (const lane of snapshot.lanes || []) {
    for (const item of lane.items || []) {
      push(item.rawKeyword || item.keyword);
      for (const expansion of item.expansions || []) push(expansion);
    }
  }
  return out.slice(0, MAX_CANDIDATES);
}

async function main() {
  const missing = missingCredentials();
  if (missing.length > 0) {
    log(`  WARN     황금보드 건너뜀 — 자격증명 없음: ${missing.join(', ')}`);
    return;
  }

  const candidates = collectCandidates();
  log(`  INFO     황금보드 후보 ${candidates.length}건 (실시간 레인 + 자동완성)`);
  if (candidates.length === 0) return;

  // 1) 검색량 — 5개씩 묶어 조회
  const volumes = new Map();
  for (let i = 0; i < candidates.length; i += 5) {
    const batch = candidates.slice(i, i + 5);
    const got = await fetchVolumes(batch);
    for (const [k, v] of got) volumes.set(k, v);
    await sleep(120);
  }
  log(`  INFO     검색량 실측 ${volumes.size}건`);

  // 2) 검색량 기준을 넘은 것만 문서수를 잰다 — 호출을 아낀다
  const worth = candidates.filter((k) => (volumes.get(k.replace(/\s+/g, '')) || 0) >= MIN_VOLUME);
  log(`  INFO     검색량 ${MIN_VOLUME} 이상 ${worth.length}건 → 문서수 조회`);

  const rows = [];
  for (const keyword of worth) {
    const searchVolume = volumes.get(keyword.replace(/\s+/g, '')) || 0;
    const documentCount = await fetchDocumentCount(keyword);
    await sleep(80);
    // 못 잰 값은 버린다. 추정해서 채우지 않는다.
    if (documentCount === null || documentCount <= 0) continue;
    if (documentCount > MAX_DOCS) continue;
    const opportunity = Math.round((searchVolume / documentCount) * 10) / 10;
    if (opportunity < MIN_OPPORTUNITY) continue;
    rows.push({ keyword, searchVolume, documentCount, opportunity });
  }

  rows.sort((a, b) => b.opportunity - a.opportunity);
  const finalRows = rows.slice(0, MAX_ROWS);
  log(`  INFO     황금 판정 통과 ${finalRows.length}건 (문서수 ${MAX_DOCS} 이하, 기회도 ${MIN_OPPORTUNITY} 이상)`);

  // 0건이면 기존 파일을 지킨다. 좋은 데이터를 빈 값으로 덮지 않는다.
  if (finalRows.length === 0) {
    log('  KEPT     황금보드 0건 — 기존 파일 유지');
    return;
  }

  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  const payload = {
    title: previous.title || '오늘의 무료 선정 황금키워드',
    author: previous.author || 'Leaders Pro',
    publishedAt: new Date().toISOString(),
    revision: Number(previous.revision || 0) + 1,
    sourceImages: previous.sourceImages || [],
    rows: finalRows,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  log(`  WRITTEN  home-keyword-briefing-seed.json — ${finalRows.length}건`);
  const top = finalRows[0];
  log(`  INFO     1위: ${top.keyword} (검색 ${top.searchVolume} / 문서 ${top.documentCount} / 기회도 ${top.opportunity})`);
}

main().catch((error) => {
  console.error('황금보드 갱신 실패:', error);
  process.exit(0); // 실패가 다른 스냅샷 갱신을 막지 않게 한다.
});
