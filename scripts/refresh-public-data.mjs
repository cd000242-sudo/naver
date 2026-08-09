#!/usr/bin/env node
/**
 * 방문자 화면용 정적 스냅샷 생성기.
 *
 * 목적: leaderspro.kr 방문자 화면이 API 서버 없이도 살아있게 한다.
 * 별도 API 서버가 없어도 주기적으로 스냅샷을 떠서
 * Pages 정적 자산으로 커밋하고, SPA 는 정적본을 먼저 읽는다.
 *
 * 직접 수집한 실시간 검색어를 Pages 정적 자산으로 커밋한다.
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
const TIMEOUT_MS = 15_000;
const BRIGHTDATA_API_KEY = String(process.env.BRIGHTDATA_API_KEY || '').trim();
const BRIGHTDATA_WEB_UNLOCKER_ZONE = String(process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE || '').trim();
const USE_BRIGHTDATA = Boolean(BRIGHTDATA_API_KEY && BRIGHTDATA_WEB_UNLOCKER_ZONE);

/** 상태 요약 — 워크플로 로그에서 한눈에 보이게 한다. */
const report = [];

async function get(url, { timeoutMs = TIMEOUT_MS, encoding = 'utf-8' } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
    const res = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BRIGHTDATA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zone: BRIGHTDATA_WEB_UNLOCKER_ZONE,
        url,
        format: 'raw',
      }),
      signal: controller.signal,
    });
    // 네이트 뉴스 등 EUC-KR 사이트는 text() 로 읽으면 한글이 깨진다.
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder(encoding).decode(buffer);
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

async function collectNate() {
  const res = await get('https://www.nate.com/');
  if (!res.ok) return [];
  // <ol id="olLiveIssueKeyword"> 안의 <span class="txt_rank">키워드</span>
  const section = (res.text.match(/olLiveIssueKeyword[\s\S]{0,8000}/) || [res.text])[0];
  const matches = [...section.matchAll(/class="txt_rank">([^<]{2,40})</g)].map((m) => m[1].trim());
  const unique = [...new Set(matches)].filter(Boolean);
  return unique.slice(0, 10).map((keyword, index) => ({ rank: index + 1, keyword }));
}

async function collectNateEntIssues() {
  // 네이트 연예 랭킹은 EUC-KR — 디코딩 지정 필수
  const res = await get('https://news.nate.com/rank/interest?sc=ent&p=day', { encoding: 'euc-kr' });
  if (!res.ok) return [];
  // 실제 마크업은 <h2 class="tit">제목</h2> (strong 아님 — 초기 정규식이 틀려 0건이었다)
  const titles = [...res.text.matchAll(/<h2 class="tit">([^<]{5,80})<\/h2>/g)]
    .map((m) => m[1]
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
      .replace(/\[[^\]]{1,14}\]/g, '')
      .replace(/…$/, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((title) => title.length >= 6);
  // 기사 제목을 잘라 키워드로 쓰면 "비판에도", "20년팬 등판" 같은 조각이 나온다
  // (정책 레인에서 이미 겪은 실패). 제목은 맥락으로만 두고, 검색어는 제목에서 뽑은
  // 개체명(인물·작품·기관)으로 삼는다. 확장은 그 개체명 기준으로 붙는다.
  const rows = [];
  const seen = new Set();
  for (const title of titles) {
    const entity = entitySeedCandidates(title)[0];
    if (!entity || seen.has(entity)) continue;
    seen.add(entity);
    rows.push({ rank: rows.length + 1, keyword: entity, context: title });
    if (rows.length >= 10) break;
  }
  return rows;
}

async function collectPolicy() {
  // 복지서비스 공공데이터 — 문장 조각이 아니라 제도명 자체가 온다.
  const key = String(process.env.WELFARE_API_KEY || '').trim();
  if (!key) {
    report.push('  WARN     정책 레인 — WELFARE_API_KEY 미설정, 건너뜀');
    return [];
  }
  const url = 'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001'
    + `?serviceKey=${key}&callTp=L&pageNo=1&numOfRows=30&srchKeyCode=003&orderBy=popular`;
  const res = await get(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  try {
    const list = JSON.parse(res.text).servList || [];
    return list
      .map((row) => String(row.servNm || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((keyword, index) => ({ rank: index + 1, keyword }));
  } catch {
    return [];
  }
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
  nate: '네이트 실시간 이슈 키워드에서 수집한 검색 신호입니다.',
  zum: 'ZUM 이슈검색어에서 수집한 검색 신호입니다.',
  policy: '복지서비스 공공데이터에서 조회수 상위로 뽑은 제도명입니다.',
  issue: '네이트 연예 랭킹에서 수집한 방송·연예 흐름입니다.',
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
    // 이슈 레인은 원 기사 제목을 맥락으로 보여준다(키워드는 개체명).
    description: row.context || LANE_DESC[laneId] || '실시간 수집 신호입니다.',
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
    // 따옴표·괄호가 붙으면 인명 매칭이 실패한다(예: 황정민" → 미검출)
    .map((token) => token.replace(/^[^가-힣A-Za-z0-9]+|[^가-힣A-Za-z0-9]+$/g, ''))
    .map((token) => token.replace(/(에서|으로|에게|부터|까지|라며|한다|했다|[은는이가을를에의도])$/, ''))
    .filter((token) => /^[가-힣A-Za-z0-9]{2,6}$/.test(token))
    // 서술어·연결어미는 시드로 쓰면 사전형 확장만 나온다("드러나다 뜻", "사주 공망")
    .filter((token) => !/[가-힣](다|고|며|자|서|면|만|짐|함)$/.test(token))
    // 헤드라인 상투어·일반명사 제외("모친"→"모친 뜻", "시청률"→무관 확장)
    .filter((token) => !/^(오늘|내일|전국|긴급|속보|단독|공식|발표|확정|논란|사망|고독사|출연|기록|개장|시청률|반응|이번|바로|여전히|모친|부친|남편|아내|동생|형|누나|어머니|아버지|증조부|조부|장모|시모|가족)$/.test(token));

  // 한국 인명 패턴(성 1자 + 이름 1~2자)을 최우선. 이슈 레인은 인물이 핵심 검색어다.
  const NAME_RE = /^[김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허남심노하곽성차주우구민유][가-힣]{1,2}$/;
  // 성씨로 시작하지만 인명이 아닌 흔한 일반어(최종·구성·임신…)는 걸러낸다.
  const NOT_A_NAME = /^(최종|최고|최근|최대|최소|이번|이상|이후|이전|이유|정부|정도|정식|조사|강화|강남|임신|오전|오후|서울|한국|전국|전체|고속|신규|안전|송출|유지|민간|주요|구성|구매|박스|양측|손실|백만|허가|남녀|심각|하락|하루|성공|성장|차량|주가|주식|우려|김치|문제|양국|배송|노동|권리|황금|안내|송금|전망|홍보|고객)$/;
  const names = tokens.filter((token) => NAME_RE.test(token) && !NOT_A_NAME.test(token));
  // 그 외에는 헤드라인 맨 앞/맨 뒤(고유명사가 주로 오는 자리) 순서로
  const ordered = [...names, tokens[0], tokens[tokens.length - 1], ...tokens];
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

/** UI 탭 순서와 동일하게 6개 레인을 모두 채운다. 하나라도 비면 그 탭만 폴백으로 떨어진다. */
const LANE_COLLECTORS = [
  { id: 'naver', label: '네이버', collect: collectSignalBz },
  { id: 'daum', label: '다음', collect: collectDaumTrend },
  { id: 'nate', label: '네이트', collect: collectNate },
  { id: 'zum', label: '줌', collect: collectZum },
  { id: 'policy', label: '정책', collect: collectPolicy },
  { id: 'issue', label: '이슈', collect: collectNateEntIssues },
];

async function refreshSourceSignals() {
  const collected = await Promise.all(
    LANE_COLLECTORS.map((lane) => lane.collect().catch(() => [])),
  );

  const lanes = [];
  let expansionCount = 0;
  for (let index = 0; index < LANE_COLLECTORS.length; index += 1) {
    const config = LANE_COLLECTORS[index];
    const raw = collected[index];
    if (raw.length === 0) {
      report.push(`  WARN     실시간 ${config.id} 0건 — 수집기 점검 필요`);
      continue;
    }
    // 자동완성은 순차 호출(레인당 최대 10개, 150ms 간격)
    const rows = await attachExpansions(raw);
    expansionCount += rows.reduce((sum, row) => sum + (row.expansions?.length || 0), 0);
    lanes.push({ id: config.id, label: config.label, items: toSignalItems(config.id, rows) });
  }

  report.push(`  INFO     자동완성 확장 ${expansionCount}건 수집 (${lanes.length}/${LANE_COLLECTORS.length} 레인)`);
  const carried = carryOverInsights(lanes);
  if (carried > 0) report.push(`  INFO     이슈 브리프 ${carried}건 승계`);
  const total = lanes.reduce((sum, lane) => sum + lane.items.length, 0);
  writeSnapshot('source-signals.json', { source: 'direct-crawl', lanes }, total);
}

/**
 * 이전 스냅샷의 이슈 브리프(item.insight)를 키워드 기준으로 물려준다.
 *
 * 이 크론은 15분마다 파일을 통째로 새로 쓴다. 브리프는 별도 배치가
 * Bright Data 로 채우는데(호출 비용이 든다), 승계하지 않으면 15분마다
 * 날아가서 사실상 화면에 안 보인다. 키워드가 그대로면 사건도 그대로이므로
 * 그대로 물려주고, 사라진 키워드의 브리프는 자연히 버려진다.
 *
 * @returns {number} 승계한 건수
 */
function carryOverInsights(lanes) {
  const path = join(OUT_DIR, 'source-signals.json');
  if (!existsSync(path)) return 0;
  let previous;
  try {
    previous = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return 0;
  }
  const byKeyword = new Map();
  for (const lane of previous.lanes || []) {
    for (const item of lane.items || []) {
      const key = String(item.keyword || item.title || '').trim();
      if (key && item.insight) byKeyword.set(key, item.insight);
    }
  }
  if (byKeyword.size === 0) return 0;

  let carried = 0;
  for (const lane of lanes) {
    for (const item of lane.items || []) {
      const key = String(item.keyword || item.title || '').trim();
      const insight = key ? byKeyword.get(key) : undefined;
      if (insight) { item.insight = insight; carried += 1; }
    }
  }
  return carried;
}

// ---------------------------------------------------------------- 실행

async function main() {
  console.log('='.repeat(66));
  console.log(`정적 스냅샷 갱신  ${new Date().toISOString()}`);
  console.log(USE_BRIGHTDATA ? 'Bright Data → GitHub Pages 정적 데이터' : 'Bright Data 자격 증명 없음 — 기존 정적 데이터 유지');
  console.log('='.repeat(66));

  if (!USE_BRIGHTDATA) {
    report.push('  KEPT     source-signals.json — BRIGHTDATA_API_KEY 및 BRIGHTDATA_WEB_UNLOCKER_ZONE이 필요합니다');
    console.log(report.join('\n'));
    if (process.env.CI) process.exitCode = 1;
    return;
  }

  await refreshSourceSignals();

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
