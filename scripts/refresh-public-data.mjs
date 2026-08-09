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
const BRIGHTDATA_FALLBACK_MAX_REQUESTS = Math.max(0, Number(process.env.BRIGHTDATA_FALLBACK_MAX_REQUESTS || 0) || 0);
const USE_BRIGHTDATA = Boolean(
  BRIGHTDATA_API_KEY
  && BRIGHTDATA_WEB_UNLOCKER_ZONE
  && BRIGHTDATA_FALLBACK_MAX_REQUESTS > 0,
);
let brightDataFallbackRemaining = BRIGHTDATA_FALLBACK_MAX_REQUESTS;

// Bright Data is a recovery-only path. Direct collection is the default so the
// 5,000-request monthly allowance is not spent on routine 15-minute refreshes.
const DIRECT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; LeadersProSignalCollector/1.0; +https://leaderspro.kr)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.6',
};
const NEWS_PER_KEYWORD = Math.min(3, Math.max(1, Number(process.env.NEWS_PER_KEYWORD || 2) || 2));
const NEWS_FETCH_CONCURRENCY = Math.min(3, Math.max(1, Number(process.env.NEWS_FETCH_CONCURRENCY || 1) || 1));
// Collect three article-backed rows per lane on every refresh. This prevents a
// top-three item from opening an empty detail panel while staying below the
// existing direct-collection ceiling.
const NEWS_MAX_QUERIES_PER_RUN = Math.min(20, Math.max(1, Number(process.env.NEWS_MAX_QUERIES_PER_RUN || 18) || 18));
const INSIGHT_REFRESH_MINUTES = Math.min(240, Math.max(15, Number(process.env.INSIGHT_REFRESH_MINUTES || 60) || 60));
const LLM_BRIEF_MAX_ITEMS = Math.min(20, Math.max(1, Number(process.env.LLM_BRIEF_MAX_ITEMS || 10) || 10));
const KEYWORD_BRIEF_LLM_API_URL = String(process.env.KEYWORD_BRIEF_LLM_API_URL || '').trim();
const KEYWORD_BRIEF_LLM_API_KEY = String(process.env.KEYWORD_BRIEF_LLM_API_KEY || '').trim();
const KEYWORD_BRIEF_LLM_MODEL = String(process.env.KEYWORD_BRIEF_LLM_MODEL || '').trim();
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

/** 상태 요약 — 워크플로 로그에서 한눈에 보이게 한다. */
const report = [];

async function directGet(url, { timeoutMs = TIMEOUT_MS, encoding = 'utf-8', headers = {} } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
    const res = await fetch(url, {
      headers: { ...DIRECT_HEADERS, ...headers },
      signal: controller.signal,
      redirect: 'follow',
    });
    // 네이트 뉴스 등 EUC-KR 사이트는 text() 로 읽으면 한글이 깨진다.
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder(encoding).decode(buffer);
    return { ok: res.ok, status: res.status, text, via: 'direct' };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: String(error?.message || error), via: 'direct' };
  } finally {
    clearTimeout(timer);
  }
}

async function brightDataGet(url, { timeoutMs = TIMEOUT_MS, encoding = 'utf-8' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BRIGHTDATA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ zone: BRIGHTDATA_WEB_UNLOCKER_ZONE, url, format: 'raw' }),
      signal: controller.signal,
    });
    const buffer = await res.arrayBuffer();
    return { ok: res.ok, status: res.status, text: new TextDecoder(encoding).decode(buffer), via: 'brightdata' };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: String(error?.message || error), via: 'brightdata' };
  } finally {
    clearTimeout(timer);
  }
}

async function get(url, options = {}) {
  const direct = await directGet(url, options);
  if (direct.ok || !USE_BRIGHTDATA || brightDataFallbackRemaining <= 0) return direct;

  brightDataFallbackRemaining -= 1;
  report.push(`  FALLBACK Bright Data (${BRIGHTDATA_FALLBACK_MAX_REQUESTS - brightDataFallbackRemaining}/${BRIGHTDATA_FALLBACK_MAX_REQUESTS}) ${new URL(url).hostname}`);
  return brightDataGet(url, options);
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

function cleanIssueHeadline(raw) {
  return decodeHtml(raw)
    .replace(/\s+[가-힣]{2,5}\s+기자\s*(?:[·・|]\s*)?\d+\s*(?:분|시간)\s*전\s*$/u, '')
    .replace(/\s*[·・|]\s*\d+\s*(?:분|시간)\s*전\s*$/u, '')
    .replace(/\[[^\]]{1,32}\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractIssueKeyword(title) {
  const clean = cleanIssueHeadline(title);
  if (!clean) return '';

  // Keep an exact, useful headline when an unambiguous topic cannot be
  // determined. A complete headline is much safer than a fabricated one-word
  // "keyword" such as "배우", "결혼", or "10년".
  const withoutLeadQuote = clean
    .replace(/^[“"'‘][^”"'’]{2,42}[”"'’]\s*/u, '')
    .replace(/^(?:배우|가수|방송인|개그맨|아이돌)\s+/u, '')
    .trim();
  const subject = withoutLeadQuote.split(/[,…]/u)[0].replace(/\s+/g, ' ').trim();
  const event = clean.match(/결혼|웨딩|열애|동거|프로포즈|임신|출산|컴백|시구|하차|출연|공개|이별/u)?.[0] || '';

  if (subject.includes('♥') && subject.length >= 3 && subject.length <= 32) {
    return `${subject.replace(/♥/g, ' ').replace(/\s+/g, ' ')} ${event || '커플'}`.trim();
  }
  if (event && subject.length >= 2 && subject.length <= 24) {
    return `${subject} ${event}`.trim();
  }
  return clean.slice(0, 72);
}

function parseLatestIssueArticles(html, { baseUrl, sourceLabel, hrefPattern }) {
  const rows = [];
  const seen = new Set();
  for (const match of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = match[1];
    if (!hrefPattern.test(href)) continue;
    const title = cleanIssueHeadline(match[2]);
    const keyword = extractIssueKeyword(title);
    const url = safeHttpUrl(href.startsWith('http') ? href : new URL(href, baseUrl).toString());
    const key = title.replace(/[^0-9A-Za-z가-힣]+/g, '').toLowerCase();
    if (title.length < 8 || !keyword || !url || seen.has(key)) continue;
    seen.add(key);
    rows.push({ keyword, title, context: `${sourceLabel} 최신 기사 · ${title}`, officialUrl: url, sourceLabel });
  }
  return rows;
}

async function collectLatestIssueHeadlines() {
  const [starnews, sportschosun] = await Promise.all([
    get('https://www.starnewskorea.com/latest-news/all'),
    get('https://sports.chosun.com/entertainment/'),
  ]);

  const newest = starnews.ok
    ? parseLatestIssueArticles(starnews.text, {
      baseUrl: 'https://www.starnewskorea.com',
      sourceLabel: '스타뉴스',
      hrefPattern: /^\/(star|entertainment|broadcast-drama|broadcast-show|broadcast-|music)\//,
    })
    : [];
  const fallback = sportschosun.ok
    ? parseLatestIssueArticles(sportschosun.text, {
      baseUrl: 'https://sports.chosun.com',
      sourceLabel: '스포츠조선',
      hrefPattern: /\/entertainment\//,
    })
    : [];
  const seen = new Set();
  return [...newest, ...fallback]
    .filter((row) => {
      const key = row.title.replace(/[^0-9A-Za-z가-힣]+/g, '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function collectOfficialPolicyBriefings() {
  const res = await get('https://www.korea.kr/briefing/pressReleaseList.do');
  if (!res.ok) return [];
  const rows = [];
  const seen = new Set();
  const pattern = /<a href="([^"]*pressReleaseView[^\"]*)">[\s\S]{0,900}?<strong>([\s\S]*?)<\/strong>[\s\S]{0,1300}?<span class="lead">([\s\S]*?)<\/span>[\s\S]{0,700}?<span class="source">[\s\S]{0,300}?<span>([^<]+)<\/span>/g;
  for (const match of res.text.matchAll(pattern)) {
    const keyword = decodeHtml(match[2]).slice(0, 80);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    rows.push({
      rank: rows.length + 1,
      keyword,
      context: `${decodeHtml(match[4]).slice(0, 50) || '대한민국 정책브리핑'} 공식 발표 · ${decodeHtml(match[3]).slice(0, 160)}`,
      officialUrl: `https://www.korea.kr${match[1].replace(/&amp;/g, '&')}`,
    });
    if (rows.length >= 10) break;
  }
  return rows;
}

async function collectPolicy() {
  // 복지서비스 공공데이터 — 문장 조각이 아니라 제도명 자체가 온다.
  const key = String(process.env.WELFARE_API_KEY || '').trim();
  const officialRows = await collectOfficialPolicyBriefings();
  if (officialRows.length > 0) return officialRows;
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
  issue: '최신 연예 기사 흐름에서 수집한 이슈입니다.',
};

const BROAD_SIGNAL_TERMS = new Set([
  '채무', '배우', '결혼', '연예', '뉴스', '이슈', '사건', '사고', '주식', '코인', '날씨', '부동산', '대출', '보험',
]);
const EXCLUDED_BROAD_SIGNAL_TERMS = new Set([
  ...BROAD_SIGNAL_TERMS,
  '의과대학', '의대',
]);
const WEAK_EXPANSION_SUFFIX = /(?:뜻|의미|나무위키|영어로|인스타|프로필|직업|고향|나이|사진)$/u;

function isDisplayableSignal(laneId, row) {
  if (laneId === 'issue') return true;
  const compact = String(row?.keyword || '').replace(/\s+/g, '');
  // A generic category without a verified article has no reliable subject to
  // put on a mind map. Do not replace it with a random autocomplete result.
  return Boolean(compact) && !EXCLUDED_BROAD_SIGNAL_TERMS.has(compact);
}

function selectCoreSignalKeyword(row) {
  const raw = String(row?.keyword || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '');
  // Preserve genuine multi-word portal terms. Only replace a clearly broad,
  // one-word signal with a measured autocomplete continuation.
  if (!BROAD_SIGNAL_TERMS.has(compact) && compact.length > 2) return raw;

  const specific = (row?.expansions || [])
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .find((candidate) => {
      const candidateCompact = candidate.replace(/\s+/g, '');
      return candidateCompact.startsWith(compact)
        && candidateCompact.length >= compact.length + 2
        && candidateCompact.length <= 28
        && !WEAK_EXPANSION_SUFFIX.test(candidate);
    });
  return specific || raw;
}

/**
 * SPA 카드가 기대하는 필드로 맞춘다.
 * keyword 만 넣으면 설명·점수 칸이 빈 채로 렌더돼 카드가 깨져 보인다.
 */
function toSignalItems(laneId, rows) {
  return rows.filter((row) => isDisplayableSignal(laneId, row)).map((row, index) => ({
    id: `${laneId}-${index + 1}`,
    keyword: selectCoreSignalKeyword(row),
    title: row.title || row.keyword,
    rawKeyword: row.keyword,
    // 이슈 레인은 원 기사 제목을 맥락으로 보여준다.
    description: row.context || LANE_DESC[laneId] || '실시간 수집 신호입니다.',
    // 순위를 점수로 환산한다(1위=100). 실측 지표가 아니라 표시용 정렬값이다.
    priority: Math.max(1, 100 - index),
    source: laneId,
    officialUrl: row.officialUrl,
    sourceLabel: row.sourceLabel,
    // 네이버 자동완성 실측 확장(사람들이 실제로 이어서 치는 검색어)
    expansions: row.expansions || [],
    // 확장을 뽑은 시드(헤드라인 전체가 아니라 개체명일 수 있음 — 표시 정직성용)
    expansionSeed: row.expansionSeed,
  }));
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanNewsValue(value, limit = 220) {
  return decodeHtml(value).replace(/\s*\|\s*[^|]{1,40}$/u, '').slice(0, limit).trim();
}

function safeHttpUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function readJsonObject(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return '';
}

function parseNaverNewsResults(html) {
  const rows = [];
  const seen = new Set();
  const templates = html.matchAll(/"templateId"\s*:\s*"newsItem"/g);

  for (const template of templates) {
    // A page-level layout also has a props object around every card.  Starting
    // from that outer object skips all nested news cards, so find the props
    // object paired with each newsItem template instead.
    const propsMarker = html.lastIndexOf('{"props":', template.index);
    if (propsMarker < 0) continue;
    const objectStart = html.indexOf('{', propsMarker + '{"props":'.length);
    if (objectStart < 0) continue;
    const rawProps = readJsonObject(html, objectStart);
    if (!rawProps || objectStart + rawProps.length > template.index) continue;

    try {
      const props = JSON.parse(rawProps);
      const title = cleanNewsValue(props.title, 180);
      const url = safeHttpUrl(props.contentHref || props.titleHref);
      if (!title || !url || seen.has(url)) continue;
      seen.add(url);
      const excerpt = cleanNewsValue(props.content, 260) || title;
      const press = cleanNewsValue(props.sourceProfile?.title, 60) || new URL(url).hostname;
      const image = safeHttpUrl(props.imageSrc);
      rows.push({ title, excerpt, url, press, image });
    } catch {
      // The Naver search page can include experimental cards with a non-JSON props block.
    }
  }
  return rows;
}

async function fetchNaverNews(keyword) {
  const url = 'https://search.naver.com/search.naver?where=news&query=' + encodeURIComponent(keyword);
  const res = await get(url, { timeoutMs: 12_000, headers: { Referer: 'https://search.naver.com/' } });
  if (!res.ok) return [];
  return parseNaverNewsResults(res.text).slice(0, NEWS_PER_KEYWORD);
}

async function mapWithConcurrency(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(values[index], index);
      } catch {
        results[index] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

function sourceGroundedTitles(keyword, laneId, headlines) {
  const lead = cleanNewsValue(headlines[0], 72) || keyword;
  const laneLabel = LANE_COLLECTORS.find((lane) => lane.id === laneId)?.label || laneId;
  return {
    seo: `${keyword} 최신 이슈와 핵심 내용 정리`,
    home: `${keyword}, ${lead} 관련 확인할 점`,
    topic: keyword,
    topicGroup: `${laneLabel} 실시간 검색어`,
  };
}

function needsInsightRefresh(item, now = Date.now()) {
  const collectedAt = Date.parse(String(item.insight?.collectedAt || ''));
  return !Number.isFinite(collectedAt) || now - collectedAt >= INSIGHT_REFRESH_MINUTES * 60_000;
}

function selectInsightTargets(lanes) {
  const queues = lanes.map((lane) => ({
    lane,
    items: lane.items.filter((item) => needsInsightRefresh(item)),
  }));
  const targets = [];
  for (let rank = 0; targets.length < NEWS_MAX_QUERIES_PER_RUN; rank += 1) {
    let added = false;
    for (const queue of queues) {
      const item = queue.items[rank];
      if (!item) continue;
      targets.push({ lane: queue.lane, item });
      added = true;
      if (targets.length >= NEWS_MAX_QUERIES_PER_RUN) break;
    }
    if (!added) break;
  }
  return targets;
}

async function enrichSourceInsights(lanes) {
  const targets = selectInsightTargets(lanes);
  const collectedAt = new Date().toISOString();
  const results = await mapWithConcurrency(targets, NEWS_FETCH_CONCURRENCY, async ({ lane, item }) => {
    const newsArticles = await fetchNaverNews(item.keyword);
    const officialUrl = safeHttpUrl(item.officialUrl);
    const officialArticle = officialUrl
      ? [{ title: item.title || item.keyword, excerpt: item.description || item.keyword, url: officialUrl, press: item.sourceLabel || '대한민국 정책브리핑', image: '' }]
      : [];
    const articles = [...officialArticle, ...newsArticles.filter((article) => article.url !== officialUrl)];
    if (articles.length === 0) return null;
    const headlines = articles.map((article) => article.title);
    return {
      lane,
      item,
      insight: {
        titles: sourceGroundedTitles(item.keyword, lane.id, headlines),
        facts: articles.map((article, sourceIndex) => ({ text: article.excerpt, sourceIndex })),
        links: articles.map((article) => ({ url: article.url, press: article.press })),
        images: [...new Set(articles.map((article) => article.image).filter(Boolean))].slice(0, 1),
        press: [...new Set(articles.map((article) => article.press))],
        headlines,
        collectedAt,
      },
    };
  });

  let count = 0;
  for (const result of results) {
    if (!result?.insight) continue;
    result.item.insight = result.insight;
    count += 1;
  }
  return count;
}

function parseJsonObject(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function briefPrompt(rows) {
  return [
    'You are an editor for a Korean real-time search dashboard.',
    'Use only the provided news headlines. Do not invent facts, dates, people, or claims.',
    'For every input row, return concise Korean titles for a search-focused article and a homepage article.',
    'Return strict JSON only: {"items":[{"id":"...","seo":"...","home":"...","topic":"...","topicGroup":"..."}]}.',
    'Each title must be 18-58 Korean characters and must keep the original keyword intent.',
    JSON.stringify(rows),
  ].join('\n');
}

async function callConfiguredLlm(prompt) {
  if (KEYWORD_BRIEF_LLM_API_URL && KEYWORD_BRIEF_LLM_MODEL) {
    const res = await fetch(KEYWORD_BRIEF_LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(KEYWORD_BRIEF_LLM_API_KEY ? { Authorization: `Bearer ${KEYWORD_BRIEF_LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: KEYWORD_BRIEF_LLM_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Return only valid JSON. Never add facts that are not in the supplied headlines.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`configured LLM HTTP ${res.status}`);
    const payload = await res.json();
    return { provider: KEYWORD_BRIEF_LLM_MODEL, data: parseJsonObject(payload?.choices?.[0]?.message?.content) };
  }

  if (GEMINI_API_KEY) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const payload = await res.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    return { provider: GEMINI_MODEL, data: parseJsonObject(text) };
  }

  return null;
}

function validLlmTitle(value) {
  const text = cleanNewsValue(value, 90);
  return text.length >= 6 && text.length <= 90 ? text : '';
}

async function enrichInsightTitlesWithLlm(lanes) {
  const freshAfter = Date.now() - 5 * 60_000;
  const rows = lanes.flatMap((lane) => lane.items
    .filter((item) => item.insight?.headlines?.length && Date.parse(String(item.insight.collectedAt || '')) >= freshAfter)
    .map((item) => ({
      id: item.id,
      lane: lane.id,
      keyword: item.keyword,
      headlines: item.insight.headlines.slice(0, NEWS_PER_KEYWORD),
    })))
    .slice(0, LLM_BRIEF_MAX_ITEMS);
  if (rows.length === 0) return 0;

  try {
    const response = await callConfiguredLlm(briefPrompt(rows));
    if (!response?.data || !Array.isArray(response.data.items)) return 0;
    const byId = new Map(response.data.items.map((item) => [String(item?.id || ''), item]));
    let count = 0;
    for (const lane of lanes) {
      for (const item of lane.items) {
        const generated = byId.get(item.id);
        if (!generated || !item.insight) continue;
        const seo = validLlmTitle(generated.seo);
        const home = validLlmTitle(generated.home);
        if (!seo && !home) continue;
        item.insight.titles = {
          ...item.insight.titles,
          ...(seo ? { seo } : {}),
          ...(home ? { home } : {}),
          ...(validLlmTitle(generated.topic) ? { topic: validLlmTitle(generated.topic) } : {}),
          ...(validLlmTitle(generated.topicGroup) ? { topicGroup: validLlmTitle(generated.topicGroup) } : {}),
        };
        count += 1;
      }
    }
    if (count > 0) report.push(`  INFO     source-grounded LLM titles ${count} items (${response.provider})`);
    return count;
  } catch (error) {
    report.push(`  WARN     LLM title enrichment skipped: ${String(error?.message || error)}`);
    return 0;
  }
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
  { id: 'issue', label: '이슈', collect: collectLatestIssueHeadlines },
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
  // Preserve recent article briefs for unchanged keywords before selecting the
  // small, round-robin direct-news refresh budget for this run.
  const carriedBefore = carryOverInsights(lanes);
  if (carriedBefore > 0) report.push(`  INFO     carried article/image briefs ${carriedBefore} items`);
  const articleBriefs = await enrichSourceInsights(lanes);
  if (articleBriefs > 0) report.push(`  INFO     direct article/image briefs ${articleBriefs} items`);
  await enrichInsightTitlesWithLlm(lanes);
  const carriedAfter = carryOverInsights(lanes);
  const carried = carriedAfter;
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
      if (insight && !item.insight) { item.insight = insight; carried += 1; }
    }
  }
  return carried;
}

// ---------------------------------------------------------------- 실행

async function main() {
  console.log('='.repeat(66));
  console.log(`정적 스냅샷 갱신  ${new Date().toISOString()}`);
  console.log(USE_BRIGHTDATA
    ? `direct collection with Bright Data recovery budget (${BRIGHTDATA_FALLBACK_MAX_REQUESTS})`
    : 'direct collection only (Bright Data recovery disabled)');
  console.log('='.repeat(66));

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
