#!/usr/bin/env node
/**
 * 방문자 화면용 정적 스냅샷 생성기.
 *
 * 목적: leaderspro.kr 방문자 화면이 API 서버 없이도 살아있게 한다.
 * 서버(141.164.59.17)는 관리자 기능 때문에 계속 필요하지만, 서버가 죽었다고
 * 홈이 하드코딩 폴백으로 떨어지면 안 된다. 그래서 주기적으로 스냅샷을 떠서
 * Pages 정적 자산으로 커밋하고, SPA 는 정적본을 먼저 읽는다.
 *
 * 두 종류를 만든다.
 *  - 서버 미러: 공지/브리핑/다운로드 (관리자가 서버에 올린 것을 스냅샷)
 *  - 직접 수집: 실시간 검색어 (서버를 거치지 않고 원천에서 바로)
 *
 * 안전 규칙(가장 중요): **좋은 데이터를 빈 데이터로 절대 덮지 않는다.**
 * 수집 실패·0건이면 기존 파일을 그대로 둔다. 서버가 죽은 날 스냅샷이 빈 값으로
 * 갈아엎히면 정적 폴백을 만든 의미가 없다.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'spa', 'public', 'data');
const SERVER = process.env.LEWORD_API_BASE || 'https://141.164.59.17.sslip.io';
const TIMEOUT_MS = 15_000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** 상태 요약 — 워크플로 로그에서 한눈에 보이게 한다. */
const report = [];

async function get(url, { headers = {}, timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, ...headers },
      signal: controller.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function readExisting(fileName) {
  const path = join(OUT_DIR, fileName);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 건수가 0이면 쓰지 않는다. 이 가드가 이 스크립트의 존재 이유다.
 * @returns {'written'|'kept'|'unchanged'}
 */
function writeSnapshot(fileName, payload, count) {
  const path = join(OUT_DIR, fileName);
  if (!count || count <= 0) {
    report.push(`  KEPT     ${fileName} — 수집 0건이라 기존 파일 유지`);
    return 'kept';
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const next = JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }, null, 2);
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : '';
  // updatedAt 만 다른 커밋을 매 사이클 만들지 않도록 본문만 비교한다.
  const strip = (text) => text.replace(/"updatedAt":\s*"[^"]*",?\s*/g, '');
  if (previous && strip(previous) === strip(next)) {
    report.push(`  SAME     ${fileName} — 내용 동일(${count}건), 커밋 생략`);
    return 'unchanged';
  }
  writeFileSync(path, `${next}\n`, 'utf8');
  report.push(`  WRITTEN  ${fileName} — ${count}건`);
  return 'written';
}

// ---------------------------------------------------------------- 서버 미러

async function mirrorFromServer(fileName, path, pick) {
  const res = await get(`${SERVER}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    report.push(`  SKIP     ${fileName} — 서버 응답 ${res.status || res.error}`);
    return;
  }
  // 200 인데 HTML 이면 API 가 아니라 에러 페이지다(과거 여러 번 물린 패턴).
  if (res.text.trimStart().startsWith('<')) {
    report.push(`  SKIP     ${fileName} — 200이지만 HTML 응답`);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(res.text);
  } catch {
    report.push(`  SKIP     ${fileName} — JSON 파싱 실패`);
    return;
  }
  const items = pick(payload);
  writeSnapshot(fileName, { source: 'server-mirror', items }, Array.isArray(items) ? items.length : 0);
}

// ---------------------------------------------------------------- 직접 수집

async function collectSignalBz() {
  const res = await get('https://api.signal.bz/news/realtime', { headers: { Referer: 'https://www.signal.bz/' } });
  if (!res.ok) return [];
  try {
    const rows = JSON.parse(res.text)?.top10 || [];
    return rows
      .map((row, index) => ({ rank: Number(row.rank) || index + 1, keyword: String(row.keyword || '').trim() }))
      .filter((row) => row.keyword);
  } catch {
    return [];
  }
}

async function collectDaumTrend() {
  const res = await get('https://www.daum.net/');
  if (!res.ok) return [];
  // 다음 홈은 실시간 트렌드를 HTML 노드가 아니라 하이드레이션 JSON 안에 싣는다.
  // 그래서 클래스 셀렉터로는 안 잡히고 "keyword":"..." 를 긁어야 한다.
  // 구조가 바뀌면 0건이 되고, 그러면 writeSnapshot 가드가 기존 파일을 지킨다.
  const matches = [...res.text.matchAll(/"keyword"\s*:\s*"([^"]{2,40})"/g)]
    .map((m) => m[1].replace(/\\u[0-9a-fA-F]{4}/g, (esc) => String.fromCharCode(parseInt(esc.slice(2), 16))).trim())
    .filter((keyword) => /[가-힣]/.test(keyword) && !/^https?:/.test(keyword));
  const unique = [...new Set(matches)];
  return unique.slice(0, 10).map((keyword, index) => ({ rank: index + 1, keyword }));
}

async function collectZum() {
  const res = await get('https://www.zum.com/');
  if (!res.ok) return [];
  const matches = [...res.text.matchAll(/issue-word-list__keyword[^>]*>([^<]{2,40})</g)]
    .map((m) => m[1].trim());
  const unique = [...new Set(matches)].filter(Boolean);
  return unique.slice(0, 10).map((keyword, index) => ({ rank: index + 1, keyword }));
}

const LANE_DESC = {
  naver: '네이버 실시간 흐름에서 수집한 검색 신호입니다.',
  daum: '다음 실시간 트렌드에서 수집한 검색 신호입니다.',
  zum: 'ZUM 이슈검색어에서 수집한 검색 신호입니다.',
};

/**
 * SPA 카드가 기대하는 필드로 맞춘다.
 * keyword 만 넣으면 설명·점수 칸이 빈 채로 렌더돼 카드가 깨져 보인다.
 */
function toSignalItems(laneId, rows) {
  return rows.map((row, index) => ({
    id: `${laneId}-${index + 1}`,
    keyword: row.keyword,
    title: row.keyword,
    description: LANE_DESC[laneId] || '실시간 수집 신호입니다.',
    // 순위를 점수로 환산한다(1위=100). 실측 지표가 아니라 표시용 정렬값이다.
    priority: Math.max(1, 100 - index),
    source: laneId,
    // 네이버 자동완성 실측 확장(사람들이 실제로 이어서 치는 검색어)
    expansions: row.expansions || [],
    // 확장을 뽑은 시드(헤드라인 전체가 아니라 개체명일 수 있음 — 표시 정직성용)
    expansionSeed: row.expansionSeed,
  }));
}

/**
 * 키워드별 네이버 자동완성 확장 — 마인드맵의 "문맥 확장" 재료.
 * 토큰을 템플릿으로 합성한 가짜 확장이 아니라, 사람들이 실제로 이어서 치는
 * 검색어만 싣는다(조합 제조 금지 원칙). 실패하면 빈 배열 — 화면은 폴백으로 버틴다.
 */
async function fetchNaverExpansions(keyword) {
  const url = 'https://ac.search.naver.com/nx/ac?q=' + encodeURIComponent(keyword)
    + '&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&frm=nv&q_enc=UTF-8';
  const res = await get(url, { headers: { Referer: 'https://search.naver.com/' }, timeoutMs: 8000 });
  if (!res.ok) return [];
  try {
    const items = (JSON.parse(res.text).items || []).flat();
    return [...new Set(items
      .map((row) => String(Array.isArray(row) ? row[0] : row).trim())
      .filter((kw) => kw && kw !== keyword))].slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * 헤드라인에서 검색되는 개체명 후보를 뽑는다.
 * "규제합리화위 부위원장에 김태유" 전체로는 자동완성이 0건이지만
 * "김태유"로는 실제 검색어가 붙는다. 조사 어미를 떼고 2~6자 토큰을 후보로.
 */
function entitySeedCandidates(keyword) {
  const tokens = String(keyword).split(/\s+/)
    .map((token) => token.replace(/(에서|으로|에게|부터|까지|라며|한다|했다|[은는이가을를에의도])$/, ''))
    .filter((token) => /^[가-힣A-Za-z0-9]{2,6}$/.test(token))
    // 서술어(…다 종결)는 시드로 쓰면 "드러나다 뜻" 같은 사전형 확장만 나온다
    .filter((token) => !/[가-힣]다$/.test(token))
    // 헤드라인 상투어·가족 일반명사 제외("모친"을 시드로 쓰면 "모친 뜻"이 나온다)
    .filter((token) => !/^(오늘|내일|전국|긴급|속보|단독|공식|발표|확정|논란|사망|고독사|출연|기록|개장|모친|부친|남편|아내|동생|형|누나|어머니|아버지|증조부|조부|장모|시모|가족)$/.test(token));
  // 인명·고유명사는 헤드라인의 맨 앞 또는 맨 뒤에 주로 온다 — [첫 토큰, 마지막 토큰] 순서로 시도
  const ordered = [tokens[0], tokens[tokens.length - 1], ...tokens];
  return [...new Set(ordered.filter(Boolean))].slice(0, 2);
}

async function attachExpansions(rows) {
  const out = [];
  for (const row of rows) {
    let expansions = await fetchNaverExpansions(row.keyword);
    let expansionSeed = row.keyword;
    if (expansions.length === 0) {
      // 헤드라인 전체가 0건이면 개체명 후보 2개를 모두 시도해 합친다.
      // 한 시드만 쓰면 "극한 폭염"에서 "극한"이 잡혀 극한직업이 나오는 식의
      // 미스가 생긴다 — 합쳐놓고 원문 토큰을 포함한 확장을 앞세운다.
      const seeds = entitySeedCandidates(row.keyword);
      const merged = [];
      for (const seed of seeds) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const got = await fetchNaverExpansions(seed);
        if (got.length > 0 && merged.length === 0) expansionSeed = seed;
        merged.push(...got);
      }
      const headlineTokens = String(row.keyword).split(/\s+/).filter((t) => t.length >= 2);
      const relevance = (kw) => headlineTokens.reduce((n, t) => n + (kw.includes(t) ? 1 : 0), 0);
      expansions = [...new Set(merged)]
        .sort((a, b) => relevance(b) - relevance(a))
        .slice(0, 8);
    }
    out.push({ ...row, expansions, expansionSeed: expansions.length > 0 ? expansionSeed : undefined });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return out;
}

async function refreshSourceSignals() {
  const [naverRaw, daumRaw, zumRaw] = await Promise.all([
    collectSignalBz().catch(() => []),
    collectDaumTrend().catch(() => []),
    collectZum().catch(() => []),
  ]);
  // 자동완성은 순차 호출(레인당 10개 × 3레인 = 최대 30콜, 150ms 간격)
  const naver = await attachExpansions(naverRaw);
  const daum = await attachExpansions(daumRaw);
  const zum = await attachExpansions(zumRaw);
  const expansionCount = [...naver, ...daum, ...zum].reduce((sum, row) => sum + (row.expansions?.length || 0), 0);
  report.push(`  INFO     자동완성 확장 ${expansionCount}건 수집`);
  const lanes = [
    { id: 'naver', label: '네이버', items: toSignalItems('naver', naver) },
    { id: 'daum', label: '다음', items: toSignalItems('daum', daum) },
    { id: 'zum', label: '줌', items: toSignalItems('zum', zum) },
  ].filter((lane) => lane.items.length > 0);

  const total = lanes.reduce((sum, lane) => sum + lane.items.length, 0);
  for (const lane of [['naver', naver], ['daum', daum], ['zum', zum]]) {
    if (lane[1].length === 0) report.push(`  WARN     실시간 ${lane[0]} 0건 — 수집기 점검 필요`);
  }
  writeSnapshot('source-signals.json', { source: 'direct-crawl', lanes }, total);
}

// ---------------------------------------------------------------- 실행

async function main() {
  console.log('='.repeat(66));
  console.log(`정적 스냅샷 갱신  ${new Date().toISOString()}`);
  console.log(`서버 ${SERVER}`);
  console.log('='.repeat(66));

  await refreshSourceSignals();

  await mirrorFromServer(
    'home-notices.json',
    '/v1/public/home-notices',
    (payload) => payload?.notices?.notices || payload?.notices || [],
  );
  await mirrorFromServer(
    'downloads.json',
    '/v1/public/downloads',
    (payload) => payload?.downloads || payload?.items || [],
  );

  // 브리핑은 이미 SPA 가 /data/home-keyword-briefing-seed.json 을 폴백으로 읽는다.
  // 파일명을 바꾸면 기존 폴백이 끊기므로 같은 이름을 갱신한다.
  const briefing = await get(`${SERVER}/v1/public/home-keyword-briefing`, { headers: { Accept: 'application/json' } });
  if (briefing.ok && !briefing.text.trimStart().startsWith('<')) {
    try {
      const payload = JSON.parse(briefing.text);
      const rows = payload?.briefing?.rows || payload?.rows || [];
      if (Array.isArray(rows) && rows.length > 0) {
        writeSnapshot('home-keyword-briefing-seed.json', payload.briefing || payload, rows.length);
      } else {
        report.push('  KEPT     home-keyword-briefing-seed.json — rows 0건');
      }
    } catch {
      report.push('  SKIP     home-keyword-briefing-seed.json — JSON 파싱 실패');
    }
  } else {
    report.push(`  SKIP     home-keyword-briefing-seed.json — 서버 응답 ${briefing.status || briefing.error}`);
  }

  console.log(report.join('\n'));
  console.log('-'.repeat(66));
  const written = report.filter((line) => line.includes('WRITTEN')).length;
  console.log(written > 0 ? `갱신 ${written}건` : '갱신 없음');
}

main().catch((error) => {
  console.error('스냅샷 갱신 실패:', error);
  // 스냅샷 실패가 배포를 막으면 안 된다. 기존 파일이 그대로 서빙된다.
  process.exit(0);
});
