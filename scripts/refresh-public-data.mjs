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
const NEWS_FETCH_CONCURRENCY = Math.min(3, Math.max(1, Number(process.env.NEWS_FETCH_CONCURRENCY || 3) || 3));
// The portal's directly collected rank is the evidence that a term is live.
// News lookup enriches the card with context but must never hide a real source
// signal when an article has not been matched yet. This is not Bright Data.
const NEWS_MAX_QUERIES_PER_RUN = Math.min(60, Math.max(1, Number(process.env.NEWS_MAX_QUERIES_PER_RUN || 60) || 60));
const INSIGHT_REFRESH_MINUTES = Math.min(240, Math.max(15, Number(process.env.INSIGHT_REFRESH_MINUTES || 60) || 60));
const PLAYWRIGHT_ARTICLE_EXTRACTION = String(process.env.PLAYWRIGHT_ARTICLE_EXTRACTION || '1').trim() !== '0';
const PLAYWRIGHT_ARTICLE_MAX_VISITS = Math.min(60, Math.max(1, Number(process.env.PLAYWRIGHT_ARTICLE_MAX_VISITS || 60) || 60));
const PLAYWRIGHT_PAGE_TIMEOUT_MS = Math.min(20_000, Math.max(5_000, Number(process.env.PLAYWRIGHT_PAGE_TIMEOUT_MS || 12_000) || 12_000));
const LLM_BRIEF_MAX_ITEMS = Math.min(20, Math.max(1, Number(process.env.LLM_BRIEF_MAX_ITEMS || 10) || 10));
const KEYWORD_BRIEF_LLM_API_URL = String(process.env.KEYWORD_BRIEF_LLM_API_URL || '').trim();
const KEYWORD_BRIEF_LLM_API_KEY = String(process.env.KEYWORD_BRIEF_LLM_API_KEY || '').trim();
const KEYWORD_BRIEF_LLM_MODEL = String(process.env.KEYWORD_BRIEF_LLM_MODEL || '').trim();
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
/*
 * 클로드코드 **구독** 자격(claude setup-token 으로 발급). API 키가 아니라
 * 사장님 구독으로 도는 경로라 건당 과금이 없다 — 사장님 지시대로 브리프 제목의
 * 1순위 두뇌다. 없으면 아래 API 키 경로로, 그것도 없으면 템플릿으로 내려간다.
 */
const CLAUDE_CODE_OAUTH_TOKEN = String(process.env.CLAUDE_CODE_OAUTH_TOKEN || '').trim();

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

/**
 * 실시간 검색어 정제 — "엉성한 단어나 문장이 아닌 깔끔하고 정확한 검색어"
 * (사장님 지시 2026-08-18).
 *
 * 실시간 레인 키워드는 뉴스 집계에서 오는 경우가 있어 쉼표·따옴표·말줄임이
 * 섞인다("김민석, 신임 당대표 수락"). 사람이 검색창에 치는 형태로 다듬는다 —
 * 문장 부호를 걷고, 접두 수식("배우/가수")과 대괄호 태그를 떼고, 공백을 정리.
 * 새 낱말을 만들지 않는다. 있는 글자를 걷어낼 뿐이다.
 */
function cleanRealtimeQuery(raw) {
  const text = decodeHtml(String(raw || ''))
    .replace(/[“”"'‘’]/g, '')
    .replace(/\[[^\]]{1,20}\]/g, '')
    .replace(/[,·…]+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s+[-–—]\s+.*$/u, '')     // "제목 - 매체명" 꼬리
    .replace(/^(?:배우|가수|방송인|개그맨|아이돌)\s+/u, '')
    .replace(/[!?~♥]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  // 정제 후 두 글자도 안 남으면 원문을 유지한다 — 지우는 게 능사가 아니다.
  return text.length >= 2 ? text.slice(0, 40) : String(raw || '').trim().slice(0, 40);
}

/**
 * 스포츠 레인(사장님 지시 2026-08-18: "스포츠도 추가해줘" — 소스는 네이버).
 *
 * 네이버 스포츠 많이 본 뉴스(모바일 랭킹). 데스크톱은 302 로 튕기고 모바일이
 * 하이드레이션 JSON 에 {"rank":n, ..., "title":"..."} 로 싣는다(실측).
 * 검색어는 제목에서 뽑은 개체명(선수·팀·대회), 제목은 맥락으로 함께 싣는다.
 */
async function collectNaverSports() {
  const res = await get('https://m.sports.naver.com/ranking', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36' },
  });
  if (!res.ok) return [];
  // 페이지에는 뉴스 랭킹과 숏폼/영상 랭킹이 섞여 있어 rank 가 중복된다(실측).
  // 언론사(officeName)가 붙은 것만 뉴스다 — 숏폼 제목은 검색어 재료가 못 된다.
  // oid/aid 로 기사 주소를 조립한다(실측 200) — "검색 버튼이 크롤링한 기사로
  // 바로 가게"(사장님 2026-08-19). URL 필드는 응답에 없고 이 두 값이 기사 좌표다.
  const entries = [...res.text.matchAll(/\{"rank":(\d+),"section":"([a-z]+)"[^{}]*?"oid":"(\d+)","aid":"(\d+)"[^{}]*?"officeName":"[^"]+","newsDateTime":"[^"]+","title":"((?:[^"\\]|\\.){8,160})"/g)]
    .map((m) => ({
      rank: Number(m[1]),
      articleUrl: `https://m.sports.naver.com/${m[2]}/article/${m[3]}/${m[4]}`,
      title: m[5]
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\"/g, '"')
        .replace(/\[[^\]]{1,14}\]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((e) => e.title.length >= 6)
    .sort((a, b) => a.rank - b.rank);
  const rows = [];
  const seen = new Set();
  for (const entry of entries) {
    // 실존결재 — 후보 중 자동완성이 실제로 아는 검색어만 채택한다.
    // 후보[0] 무조건 승격이 "신경외과"·"충격파치료" 같은 기사 어휘를 띄운 원인.
    const picked = await pickRealSearchTerm(entitySeedCandidates(entry.title), seen, entry.title);
    if (!picked) continue;
    seen.add(picked.base);
    // 기사 사건으로 니즈 문구를 조립한다("심권호 간암 투병 마지막 시술" 꼴).
    // 조립할 사건 토큰이 없으면 자동완성 확장(picked.keyword)으로 물러선다.
    const need = needPhraseFromTitle(picked.base, entry.title);
    rows.push({ rank: rows.length + 1, keyword: need || picked.keyword, context: entry.title, articleUrl: entry.articleUrl });
    if (rows.length >= 10) break;
  }
  return rows;
}

/**
 * 후보들 중 네이버 자동완성이 결과를 돌려주는 첫 후보 = 사람들이 실제로 치는
 * 검색어. 아무 후보도 실존하지 않으면 null — 지어내지 않는다.
 *
 * 반환은 { keyword, base }:
 *   base    — 실존이 확인된 개체명(중복 판정용)
 *   keyword — 화면에 띄울 검색어. "심권호"만 있으면 "심권호 뭐?"가 되므로
 *             (사장님 지적 2026-08-19) 자동완성 확장 중 **기사 내용과 겹치는
 *             것**("심권호 간암")을 고른다. 확장은 네이버가 준 실제 검색어라
 *             조립이 아니고, 선택 기준은 기사 토큰 일치라는 매칭 사실이다.
 *             겹치는 확장이 없으면 개체명 그대로 — 문장을 만들지 않는다.
 */
async function pickRealSearchTerm(candidates, seen, contextTitle) {
  for (const candidate of candidates || []) {
    if (!candidate || seen.has(candidate)) continue;
    await new Promise((resolve) => setTimeout(resolve, 150));
    const expansions = await fetchNaverExpansions(candidate);
    if (expansions.length === 0) continue;
    const contextTokens = String(contextTitle || '')
      .split(/[^가-힣A-Za-z0-9]+/)
      .filter((token) => token.length >= 2 && !token.includes(candidate) && !candidate.includes(token));
    let best = null;
    let bestScore = 0;
    for (const expansion of expansions) {
      if (!expansion.includes(candidate) || expansion.length > 20) continue;
      const rest = expansion.replace(candidate, ' ');
      const score = contextTokens.reduce((n, token) => n + (rest.includes(token) ? 1 : 0), 0);
      if (score > bestScore) { best = expansion; bestScore = score; }
    }
    /*
     * **일반명사는 단독으로 못 뜬다** (2026-08-19 스크린샷 실사고:
     * '프로야구팀'·'맥주인'·'강속구' — 제목 조각이 자동완성 실존결재를 통과해
     * 그대로 노출됐다. '맥주인' 은 "맥주인가?" 에서 조사만 뗀 조각이다).
     *
     * 금지어 목록을 늘리는 방식은 이 레인에서 이틀 새 세 번 실패했다("우승"·
     * "신경외과"·"충격파치료"). 목록이 아니라 형태로 거른다:
     *   인명(3자) — 단독 허용. 이름 자체가 니즈다("황희찬").
     *   그 외    — 기사 맥락과 겹치는 확장을 찾았을 때만("심권호 간암" 꼴).
     *              못 찾으면 다음 후보로 넘어간다. 검색어만 봐도 니즈가 읽혀야
     *              한다는 것이 이 레인의 존재 이유다(사장님 2026-08-19).
     */
    if (!best && !isKoreanName(candidate)) continue;
    return { keyword: best || candidate, base: candidate };
  }
  return null;
}

async function collectNateEntIssues() {
  // 네이트 연예 랭킹은 EUC-KR — 디코딩 지정 필수
  const res = await get('https://news.nate.com/rank/interest?sc=ent&p=day', { encoding: 'euc-kr' });
  if (!res.ok) return [];
  // 실제 마크업은 <h2 class="tit">제목</h2> (strong 아님 — 초기 정규식이 틀려 0건이었다).
  // 기사 링크(//news.nate.com/view/…)를 같이 캡처한다 — "검색 버튼이 기사로 바로"(2026-08-19).
  const titles = [...res.text.matchAll(/<a href="(\/\/news\.nate\.com\/view\/[^"]+)"[^>]*>[\s\S]{0,400}?<h2 class="tit">([^<]{5,80})<\/h2>/g)]
    .map((m) => ({
      articleUrl: `https:${m[1]}`,
      title: m[2]
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
        .replace(/\[[^\]]{1,14}\]/g, '')
        .replace(/…$/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((entry) => entry.title.length >= 6);
  // 기사 제목을 잘라 키워드로 쓰면 "비판에도", "20년팬 등판" 같은 조각이 나온다
  // (정책 레인에서 이미 겪은 실패). 제목은 맥락으로만 두고, 검색어는 제목에서 뽑은
  // 개체명(인물·작품·기관)으로 삼는다. 확장은 그 개체명 기준으로 붙는다.
  const rows = [];
  const seen = new Set();
  for (const entry of titles) {
    // 스포츠 레인과 같은 실존결재 + 맥락 확장 — "심권호"가 아니라 "심권호 간암".
    const picked = await pickRealSearchTerm(entitySeedCandidates(entry.title), seen, entry.title);
    if (!picked) continue;
    seen.add(picked.base);
    // 스포츠 레인과 같은 니즈 문구 조립 — 확장 폴백도 동일.
    const need = needPhraseFromTitle(picked.base, entry.title);
    rows.push({ rank: rows.length + 1, keyword: need || picked.keyword, context: entry.title, articleUrl: entry.articleUrl });
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
  /*
   * 이슈 레인은 크롤링한 기사 제목을 그대로 쓴다(사장님 지시 2026-08-18:
   * "이슈는 크롤링해 온 거 그대로 띄워도 돼, 그게 제목이 될 수 있거든").
   * 예전에는 주어+사건을 재조합했는데("박주호 안나 커플"류), 조합은 우리가
   * 만든 문장이지 실측이 아니다. 기자 노출/시각 꼬리와 태그만 걷어낸다.
   */
  return cleanIssueHeadline(title).slice(0, 72);
}

/**
 * "2분 전", "3시간 전" 같은 상대 표기를 분으로 바꾼다.
 * 이슈는 선점 여부가 시간에 달려 있어서 몇 분 전 기사인지가 판단 근거다.
 */
function parseAgoMinutes(text) {
  const value = String(text || '').trim();
  const m = value.match(/(\d+)\s*(분|시간|일)\s*전/);
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2] === '분') return n;
  if (m[2] === '시간') return n * 60;
  return n * 60 * 24;
}

/**
 * 기사 목록을 카드 단위로 읽는다.
 *
 * 예전에는 <a> 태그만 훑어서 제목·링크만 건졌다. 그래서 이슈 레인에는
 * 대표 사진도 게시 시각도 없었다(실측: 이슈만 이미지 2/10, 시각 0/10).
 * 사진은 목록에 이미 실려 오고, 시각도 <time> 에 절대·상대 둘 다 있다.
 * 다시 검색해서 채우려 하지 말고 여기서 같이 챙긴다.
 */
function parseLatestIssueArticles(html, { baseUrl, sourceLabel, hrefPattern }) {
  const rows = [];
  const seen = new Set();

  // 카드 경계(<li> 또는 <article>) 로 잘라야 제목·시각·이미지가 서로 섞이지 않는다.
  const cards = String(html).split(/<li[\s>]|<article[\s>]/).slice(1);
  for (const card of cards) {
    const hrefMatch = card.match(/href="([^"]+)"/);
    if (!hrefMatch || !hrefPattern.test(hrefMatch[1])) continue;

    const headingMatch = card.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/);
    const rawTitle = headingMatch ? headingMatch[1] : card;
    const title = cleanIssueHeadline(rawTitle);
    const keyword = extractIssueKeyword(title);
    const url = safeHttpUrl(hrefMatch[1].startsWith('http')
      ? hrefMatch[1]
      : new URL(hrefMatch[1], baseUrl).toString());
    const key = title.replace(/[^0-9A-Za-z가-힣]+/g, '').toLowerCase();
    if (title.length < 8 || !keyword || !url || seen.has(key)) continue;
    seen.add(key);

    const timeMatch = card.match(/<time[^>]*dateTime="([^"]*)"[^>]*>([\s\S]*?)<\/time>/i)
      || card.match(/<time[^>]*>([\s\S]*?)<\/time>/i);
    const agoText = timeMatch ? decodeHtml(timeMatch[timeMatch.length - 1]).replace(/<[^>]+>/g, '').trim() : '';
    const absolute = timeMatch && timeMatch.length > 2 ? decodeHtml(timeMatch[1]).trim() : '';

    // srcSet 은 여러 후보를 담고 있으니 첫 주소만 쓴다.
    const imageMatch = card.match(/(?:srcSet|srcset|src)="([^"\s]+\.(?:jpg|jpeg|png|webp|avif)[^"\s]*)/i)
      || card.match(/(?:srcSet|srcset)="([^"\s]+)/i);
    const image = imageMatch ? safeHttpUrl(imageMatch[1].startsWith('http')
      ? imageMatch[1]
      : new URL(imageMatch[1], baseUrl).toString()) : '';

    rows.push({
      keyword,
      title,
      context: `${sourceLabel} 최신 기사 · ${title}`,
      officialUrl: url,
      sourceLabel,
      ...(agoText ? { ago: agoText } : {}),
      ...(parseAgoMinutes(agoText) !== null ? { agoMinutes: parseAgoMinutes(agoText) } : {}),
      ...(absolute ? { publishedLabel: absolute } : {}),
      ...(image ? { image } : {}),
    });
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

async function collectOfficialPolicyBriefingsWithPlaywright() {
  const articleBrowser = await launchArticleBrowser();
  if (!articleBrowser) return [];
  let page = null;
  try {
    page = await articleBrowser.context.newPage();
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(PLAYWRIGHT_PAGE_TIMEOUT_MS);
    await page.goto('https://www.korea.kr/briefing/pressReleaseList.do', {
      waitUntil: 'commit',
      timeout: PLAYWRIGHT_PAGE_TIMEOUT_MS,
    });
    await page.waitForTimeout(600);
    const rows = await page.locator('a[href*="pressReleaseView"]').evaluateAll((links) => links
      .map((link) => ({ href: link.href, title: (link.textContent || '').replace(/\s+/g, ' ').trim() }))
      .filter((row) => row.href && row.title.length >= 6 && row.title.length <= 120)
      .slice(0, 20));
    const seen = new Set();
    return rows
      .filter((row) => {
        const key = row.title.replace(/\s+/g, ' ');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10)
      .map((row, index) => ({
        rank: index + 1,
        keyword: row.title,
        context: `대한민국 정책브리핑 공식 발표 · ${row.title}`,
        officialUrl: row.href,
        sourceLabel: '대한민국 정책브리핑',
      }));
  } catch (error) {
    report.push(`  WARN     정책 Playwright 수집 실패: ${String(error?.message || error)}`);
    return [];
  } finally {
    await page?.close().catch(() => {});
    await articleBrowser.context.close().catch(() => {});
    await articleBrowser.browser.close().catch(() => {});
  }
}

/**
 * data.go.kr 서비스키를 URL 에 안전하게 싣는다.
 *
 * 포털이 Encoding 키와 Decoding 키를 둘 다 준다. 디코딩 키를 그대로 넣으면
 * 안에 있는 '+' 가 쿼리스트링에서 공백으로 해석돼 인증이 깨진다. 반대로 이미
 * 인코딩된 키를 또 인코딩하면 '%' 가 '%25' 가 되어 역시 깨진다.
 * 그래서 이미 인코딩된 형태인지 보고 한 번만 인코딩한다.
 */
function encodeServiceKey(key) {
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

/**
 * 복지서비스 공공데이터 — 문장 조각이 아니라 제도명 자체가 온다.
 * 레인 설명("복지서비스 공공데이터에서 조회수 상위로 뽑은 제도명")이 가리키는
 * 원래 1순위 소스다. korea.kr 스크래핑보다 먼저 시도한다 — korea.kr 은
 * GitHub Actions IP 에서 막혀 크론에서만 조용히 0건이 됐다(실측: 로컬 20건 / CI 타임아웃).
 */
async function collectWelfareServices() {
  const key = String(process.env.WELFARE_API_KEY || '').trim();
  if (!key) {
    report.push('  WARN     정책 복지 API — WELFARE_API_KEY 미설정');
    return [];
  }
  const url = 'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001'
    // 이 API 는 Accept 헤더를 무시하고 기본 XML 을 돌려준다. _type=json 이 있어야
    // JSON 이 온다(로그에 <?xml ...><wantedList> 가 찍혀서 확인됐다).
    + `?serviceKey=${encodeServiceKey(key)}&callTp=L&pageNo=1&numOfRows=30&srchKeyCode=003&orderBy=popular&_type=json`;
  const res = await get(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    report.push(`  WARN     정책 복지 API HTTP ${res.status}`);
    return [];
  }

  const body = String(res.text || '').trim();
  let rows = [];
  if (body.startsWith('{')) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      // 실패를 조용히 삼키면 "왜 0건인지" 를 영영 모른다. 실제로 그래서 오래 방치됐다.
      report.push(`  WARN     정책 복지 API 응답 파싱 실패: ${body.slice(0, 80)}`);
      return [];
    }
    const apiError = parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (apiError) {
      report.push(`  WARN     정책 복지 API 오류: ${apiError.returnAuthMsg || apiError.errMsg}`);
      return [];
    }
    const list = parsed.servList || parsed?.wantedList?.servList || [];
    rows = list.map((row) => String(row.servNm || '').trim());
  } else {
    // _type=json 을 무시하고 XML 로 오는 경우가 있다. 파서를 새로 들이는 대신
    // 필요한 제도명 태그만 꺼낸다 — 여기서 필요한 건 servNm 하나뿐이다.
    const xmlError = body.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/)
      || body.match(/<errMsg>([^<]+)<\/errMsg>/);
    if (xmlError) {
      report.push(`  WARN     정책 복지 API 오류: ${xmlError[1]}`);
      return [];
    }
    rows = [...body.matchAll(/<servNm>([\s\S]*?)<\/servNm>/g)]
      .map((m) => decodeHtml(m[1]).replace(/<!\[CDATA\[|\]\]>/g, '').trim());
  }

  const out = rows
    .map((name) => name.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((keyword, index) => ({ rank: index + 1, keyword }));
  if (out.length === 0) report.push('  WARN     정책 복지 API 응답에 제도명 없음');
  return out;
}

async function collectPolicy() {
  const welfareRows = await collectWelfareServices();
  if (welfareRows.length > 0) {
    report.push(`  INFO     정책 복지 API ${welfareRows.length}건`);
    return welfareRows;
  }
  const officialRows = await collectOfficialPolicyBriefings();
  if (officialRows.length > 0) {
    report.push(`  INFO     정책 korea.kr 직접 수집 ${officialRows.length}건`);
    return officialRows;
  }
  const browserRows = await collectOfficialPolicyBriefingsWithPlaywright();
  if (browserRows.length > 0) {
    report.push(`  INFO     정책 Playwright 원본 수집 ${browserRows.length}건`);
    return browserRows;
  }
  return [];
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
    rank: Number(row.rank) || index + 1,
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
    // 크롤링한 원본 기사 주소 — 화면의 '검색' 버튼이 기사로 바로 간다(2026-08-19).
    ...(row.articleUrl ? { articleUrl: row.articleUrl } : {}),
    // 네이버 자동완성 실측 확장(사람들이 실제로 이어서 치는 검색어)
    expansions: row.expansions || [],
    // 확장을 뽑은 시드(헤드라인 전체가 아니라 개체명일 수 있음 — 표시 정직성용)
    expansionSeed: row.expansionSeed,
    // 게시 시각 — 이슈는 선점 여부가 시간에 달려 있다. 몇 분 전 기사인지가
    // "지금 써도 되는 키워드인가" 판단의 근거라 원본에서 온 값을 그대로 싣는다.
    ...(row.ago ? { ago: row.ago } : {}),
    ...(Number.isFinite(row.agoMinutes) ? { agoMinutes: row.agoMinutes } : {}),
    ...(row.publishedLabel ? { publishedLabel: row.publishedLabel } : {}),
    // 목록에 이미 실려 온 대표 사진. 재검색으로 채우려다 이슈 레인만 비었었다.
    ...(row.image ? { image: row.image } : {}),
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

async function launchArticleBrowser() {
  if (!PLAYWRIGHT_ARTICLE_EXTRACTION) return null;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, timeout: PLAYWRIGHT_PAGE_TIMEOUT_MS });
    const context = await browser.newContext({
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 },
    });
    return { browser, context };
  } catch (error) {
    report.push(`  WARN     Playwright article extraction unavailable: ${String(error?.message || error)}`);
    return null;
  }
}

function cleanArticleExcerpt(value, fallback) {
  const text = decodeHtml(value)
    .replace(/(?:무단\s*전재|재배포\s*금지)[\s\S]*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (text || cleanNewsValue(fallback, 420)).slice(0, 420).trim();
}

async function extractFirstArticleWithPlaywright(context, keyword, fallbackArticle) {
  let page = null;
  try {
    page = await Promise.race([
      context.newPage(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('article page creation timeout')), PLAYWRIGHT_PAGE_TIMEOUT_MS)),
    ]);
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(PLAYWRIGHT_PAGE_TIMEOUT_MS);
    const searchUrl = 'https://search.naver.com/search.naver?where=news&query=' + encodeURIComponent(keyword);
    await page.goto(searchUrl, { waitUntil: 'commit', timeout: PLAYWRIGHT_PAGE_TIMEOUT_MS });
    const firstResultUrl = await page.locator('a.news_tit').first().getAttribute('href').catch(() => null);
    const articleUrl = safeHttpUrl(firstResultUrl) || safeHttpUrl(fallbackArticle?.url);
    if (!articleUrl) return { article: fallbackArticle, extracted: false };

    await page.goto(articleUrl, { waitUntil: 'commit', timeout: PLAYWRIGHT_PAGE_TIMEOUT_MS });
    await page.waitForTimeout(450);
    const extracted = await page.evaluate(() => {
      const meta = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content') || '';
      const selectors = [
        '#dic_area', '#articleBodyContents', '#articeBody', '#newsct_article',
        '.article_body', '.article-body', '.news-view-body', '.article-view', 'article', 'main',
      ];
      const candidates = selectors
        .map((selector) => document.querySelector(selector))
        .filter(Boolean)
        .map((node) => {
          const clone = node.cloneNode(true);
          clone.querySelectorAll('script, style, noscript, iframe, nav, header, footer, button, .ad, .advertisement').forEach((child) => child.remove());
          return clone.innerText || clone.textContent || '';
        })
        .map((text) => text.replace(/\s+/g, ' ').trim())
        .filter((text) => text.length >= 80)
        .sort((a, b) => b.length - a.length);
      const rawImage = meta('og:image') || document.querySelector('article img[src], main img[src], img[src]')?.getAttribute('src') || '';
      let image = rawImage;
      try { image = rawImage ? new URL(rawImage, location.href).toString() : ''; } catch { image = ''; }
      return {
        title: meta('og:title') || document.title || '',
        description: meta('description') || '',
        text: candidates[0] || '',
        image,
      };
    });
    return {
      article: {
        ...fallbackArticle,
        title: cleanNewsValue(extracted.title || fallbackArticle?.title, 180) || fallbackArticle?.title,
        excerpt: cleanArticleExcerpt(extracted.text || extracted.description, fallbackArticle?.excerpt),
        image: safeHttpUrl(extracted.image) || fallbackArticle?.image || '',
        url: articleUrl,
      },
      extracted: Boolean(extracted.text || extracted.description || extracted.image),
    };
  } catch {
    return { article: fallbackArticle, extracted: false };
  } finally {
    await page?.close().catch(() => {});
  }
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

/**
 * 에이전트가 미리 만들어 둔 제목 창고.
 *
 * 이 크론은 15분마다 데이터를 통째로 다시 만든다. 그래서 밖에서 제목을 고쳐
 * 넣어 봐야 다음 회차에 지워진다 — 붙이려면 **만드는 자리**에서 붙여야 한다.
 * 그런데 이 저장소에는 구독 자격이 없다(있는 곳은 leword-app 저장소다).
 *
 * 그래서 자격이 있는 쪽이 키워드별 제목을 만들어 이 파일에 얹어 두고, 여기서는
 * 키워드로 찾아 쓴다. 없으면 기존 템플릿 그대로 — 창고가 비어도 화면은 산다.
 */
const BRIEF_TITLE_CACHE_PATH = join(OUT_DIR, 'brief-titles.json');
let briefTitleCache = null;

function loadBriefTitleCache() {
  if (briefTitleCache) return briefTitleCache;
  briefTitleCache = new Map();
  try {
    if (existsSync(BRIEF_TITLE_CACHE_PATH)) {
      const raw = JSON.parse(readFileSync(BRIEF_TITLE_CACHE_PATH, 'utf8'));
      for (const entry of raw?.titles || []) {
        const key = String(entry?.keyword || '').trim();
        if (key) briefTitleCache.set(key, entry);
      }
      report.push(`  INFO     brief-titles 창고 ${briefTitleCache.size}건 적재`);
    }
  } catch (error) {
    report.push(`  WARN     brief-titles 적재 실패(템플릿으로 계속): ${String(error?.message || error).slice(0, 100)}`);
  }
  return briefTitleCache;
}

function sourceGroundedTitles(keyword, laneId, headlines) {
  const lead = cleanNewsValue(headlines[0], 72) || keyword;
  const laneLabel = LANE_COLLECTORS.find((lane) => lane.id === laneId)?.label || laneId;
  const fallback = {
    seo: `${keyword} 최신 이슈와 핵심 내용 정리`,
    home: `${keyword}, ${lead} 관련 확인할 점`,
    topic: keyword,
    topicGroup: `${laneLabel} 실시간 검색어`,
  };

  const cached = loadBriefTitleCache().get(String(keyword || '').trim());
  if (!cached) return fallback;
  // 창고에 있는 것만 갈아끼운다. 한 칸이 비었다고 나머지까지 버리지 않는다.
  return {
    ...fallback,
    ...(cached.seo ? { seo: cached.seo } : {}),
    ...(cached.home ? { home: cached.home } : {}),
    ...(cached.topic ? { topic: cached.topic } : {}),
    // 기사 원문을 통째로 늘어놓는 대신 두 문장 요약을 앞에 세운다.
    ...(cached.summary ? { summary: cached.summary } : {}),
    aiTitled: Boolean(cached.seo || cached.home),
  };
}

function needsInsightRefresh(item, now = Date.now()) {
  const collectedAt = Date.parse(String(item.insight?.collectedAt || ''));
  return item.insight?.extraction !== 'playwright'
    || !Number.isFinite(collectedAt)
    || now - collectedAt >= INSIGHT_REFRESH_MINUTES * 60_000;
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
  const articleBrowser = targets.length > 0 ? await launchArticleBrowser() : null;
  let browserVisits = 0;
  let browserExtracted = 0;
  try {
    const results = await mapWithConcurrency(targets, NEWS_FETCH_CONCURRENCY, async ({ lane, item }) => {
      const newsArticles = await fetchNaverNews(item.keyword);
      const officialUrl = safeHttpUrl(item.officialUrl);
      const officialArticle = officialUrl
        ? [{ title: item.title || item.keyword, excerpt: item.description || item.keyword, url: officialUrl, press: item.sourceLabel || '대한민국 정책브리핑', image: '' }]
        : [];
      const firstNews = newsArticles[0];
      let primaryArticle = firstNews;
      let playwrightExtracted = false;
      if (articleBrowser && browserVisits < PLAYWRIGHT_ARTICLE_MAX_VISITS) {
        browserVisits += 1;
        const result = await extractFirstArticleWithPlaywright(articleBrowser.context, item.keyword, firstNews || officialArticle[0]);
        if (result.article) {
          primaryArticle = result.article;
          playwrightExtracted = result.extracted;
          if (playwrightExtracted) browserExtracted += 1;
        }
      }
      const articles = [...officialArticle, ...(primaryArticle ? [primaryArticle] : []), ...newsArticles.slice(firstNews ? 1 : 0)]
        .filter((article, index, all) => article?.url && all.findIndex((candidate) => candidate?.url === article.url) === index);
      if (articles.length === 0) return null;
      const headlines = articles.map((article) => article.title);
      return {
        lane,
        item,
        insight: {
          titles: sourceGroundedTitles(item.keyword, lane.id, headlines),
          facts: articles.map((article, sourceIndex) => ({ text: article.excerpt, sourceIndex })),
          links: articles.map((article) => ({ url: article.url, press: article.press })),
          // 뉴스 재검색으로 사진을 못 구하면 목록에서 이미 받아 둔 기사 사진을 쓴다.
          // 이슈 레인은 키워드가 기사 제목 통째라 재검색이 거의 안 걸려
          // 이미지가 10건 중 2건뿐이었다. 원본이 이미 준 걸 버릴 이유가 없다.
          images: [...new Set([
            ...articles.map((article) => article.image),
            item.image,
          ].filter(Boolean))].slice(0, 1),
          press: [...new Set(articles.map((article) => article.press))],
          headlines,
          extraction: playwrightExtracted ? 'playwright' : 'search-card',
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
    if (browserExtracted > 0) report.push(`  INFO     Playwright article body/image extraction ${browserExtracted} items`);
    return count;
  } finally {
    await articleBrowser?.context?.close().catch(() => {});
    await articleBrowser?.browser?.close().catch(() => {});
  }
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

/**
 * 클로드코드 CLI 를 헤드리스로 한 번 왕복한다.
 *
 * -p(프롬프트 모드) + --output-format json 이면 봉투 안에 result 문자열이 온다.
 * plan 모드는 계획만 답하고 산출물을 안 내므로 절대 쓰지 않는다(실측 함정).
 * 도구는 전부 막는다 — 여기서 필요한 건 문장 생성뿐이고, 파일을 만지게 둘
 * 이유가 없다.
 */
async function callClaudeCodeSubscription(prompt) {
  const { execFile } = await import('node:child_process');
  const stdout = await new Promise((resolve, reject) => {
    const child = execFile(
      'claude',
      ['-p', '--output-format', 'json', '--permission-mode', 'default', '--disallowedTools', '*'],
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024, env: process.env },
      (error, out) => {
        if (error) { reject(new Error(`claude CLI: ${String(error.message || error).slice(0, 160)}`)); return; }
        resolve(String(out || ''));
      },
    );
    child.stdin?.end(prompt);
  });
  const envelope = parseJsonObject(stdout);
  const text = typeof envelope?.result === 'string' ? envelope.result : stdout;
  return { provider: 'claude-code(구독)', data: parseJsonObject(text) };
}

async function callConfiguredLlm(prompt) {
  /*
   * 구독이 먼저다. API 키를 먼저 보면, 키가 꽂혀 있는 한 구독은 영원히 안 쓰인다
   * — 사장님이 이미 내고 있는 구독을 두고 종량 과금이 돌게 된다.
   */
  if (CLAUDE_CODE_OAUTH_TOKEN) {
    try {
      return await callClaudeCodeSubscription(prompt);
    } catch (error) {
      // 구독 경로가 죽었다고 브리프 전체를 포기하지 않는다 — 아래로 내려간다.
      report.push(`  WARN     claude-code 구독 경로 실패, 다음 경로로: ${String(error?.message || error).slice(0, 120)}`);
    }
  }

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
/*
 * 한국 인명은 3자(성 1 + 이름 2)만 인정한다. 1자 이름을 허용했더니 스포츠
 * 레인에서 "우승"(성 우 + 승)이 인명으로 승격되는 실사고(2026-08-19 스크린샷).
 * pickRealSearchTerm 도 같은 판정을 쓰므로 모듈 스코프에 둔다.
 */
const NAME_RE = /^[김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허남심노하곽성차주우구민유][가-힣]{2}$/;
const NOT_A_NAME = /^(최종|최고|최근|최대|최소|이번|이상|이후|이전|이유|정부|정도|정식|조사|강화|강남|임신|오전|오후|서울|한국|전국|전체|고속|신규|안전|송출|유지|민간|주요|구성|구매|박스|양측|손실|백만|허가|남녀|심각|하락|하루|성공|성장|차량|주가|주식|우려|김치|문제|양국|배송|노동|권리|황금|안내|송금|전망|홍보|고객|박빙|정면|신인왕|우승자)$/;
const isKoreanName = (token) => NAME_RE.test(token) && !NOT_A_NAME.test(token);

/*
 * 개체명 + 기사 사건 토큰으로 **니즈가 읽히는 검색어**를 조립한다.
 *
 * 사장님(2026-08-19): "'심권호 근황'이 아니라 왜 이게 검색되는지 보고 검색어를
 * 추론해서 넣어줘야지 — '심권호 간암투병 마지막 시술' 이런 식으로."
 * 자동완성 확장('근황')은 실존하지만 니즈를 안 담는다. 기사 제목이 이미 사건을
 * 말하고 있으므로 그 어절로 문구를 만든다 — 검색어만 봐도 무슨 일인지 읽히게.
 *
 * 저널리즘 상투어(충격·공개·근황·속보…)와 직책어(국가대표·공격수…)는 뺀다 —
 * 사건이 아니라 포장이다. 조사는 가볍게 뗀다("중동으로"→"중동", "이적하나"→"이적").
 */
const NEED_STOP = /^(충격|대충격|충격적|경악|단독|속보|화제|포착|눈물|심경|고백|논란|파문|이유|모습|소식|초유|사태|결국|전격|공식|확인|근황|공개|며칠|오늘|어제|내일|현재|영상|사진|인터뷰|반응|누리꾼|네티즌|팬들|국가대표|공격수|미드필더|수비수|골키퍼|투수|포수|내야수|외야수|간판타자|감독|코치|선수|해설|중계|대형|쇼크|대참사|이럴|수가|저였으면|얌전히|역대|역사적|최대|최악|최고|최초|끝내|결국엔|와|어머|헉|무려)$/;
/*
 * 서술어·인용 어미가 붙은 어절은 사건이 아니라 **말**이다 — "던졌는데", "있었죠",
 * "됐다" 가 검색어에 섞이면 문구가 인용문 조각이 된다(2026-08-19 1차 실주행에서
 * '고우석 대형 쇼크 50구나 던졌는데'·'박재현 저였으면 얌전히 2루에 있었죠' 실사고).
 */
const NEED_VERBISH = /(는데|었다|았다|였다|졌다|겠다|했다|된다|됐다|한다|하다|어요|네요|아요|습니다|입니다|했죠|었죠|았죠|이죠|겠죠|잖아|구나|라니|다니|가요|나요|까요|쓰나|되나|하려나|인가|일까|할까)$/;
function needPhraseFromTitle(base, title) {
  const tokens = String(title || '')
    .split(/[^가-힣A-Za-z0-9]+/)
    .map((token) => token.replace(/(에서|으로|에게|부터|까지|라며|하나|한다|했다|이다|였다)$/, ''))
    // 한 글자 조사는 남으면 인용문 조각처럼 보인다("2루에"·"사과와"·"김도영의" 실사고).
    // 두 글자 이하 어절은 조사가 아닐 확률이 높아 건드리지 않는다("제주도" 보호).
    .map((token) => (token.length >= 3 ? token.replace(/[은는이가을를에의와과]$/, '') : token))
    .filter((token) => token.length >= 2 && token.length <= 8)
    .filter((token) => !token.includes(base) && !base.includes(token))
    .filter((token) => !NEED_STOP.test(token) && !NEED_VERBISH.test(token) && !/^\d+$/.test(token));
  const picked = [];
  for (const token of tokens) {
    if (picked.includes(token)) continue;
    picked.push(token);
    if (picked.length >= 4) break;
    if ([base, ...picked].join(' ').length >= 20) break;
  }
  while ([base, ...picked].join(' ').length > 24 && picked.length > 1) picked.pop();
  return picked.length > 0 ? [base, ...picked].join(' ') : '';
}

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

  // 스포츠·사건 기사 상투어 — 첫/끝 토큰 폴백이 이런 일반명사를 승격하면 안 된다
  // ("신경외과", "충격파치료" 실사고). 검색어가 아니라 기사 어휘다.
  const HEADLINE_COMMON = /^(우승|패배|역전|결승|연승|연패|부상|수술|치료|외과|내과|병원|감독|선수|구단|이적|계약|은퇴|복귀|데뷔|충격|경악|논란|파문|근황|공개|심경|고백|눈물|분노|응원|화제|포착|목격|인터뷰|단독|속보|충격파치료|신경외과)$/;
  const names = tokens.filter(isKoreanName);
  // 그 외에는 헤드라인 맨 앞/맨 뒤(고유명사가 주로 오는 자리) 순서로
  const ordered = [...names, tokens[0], tokens[tokens.length - 1], ...tokens];
  return [...new Set(ordered.filter(Boolean))]
    .filter((token) => !HEADLINE_COMMON.test(token))
    .slice(0, 3);
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
  { id: 'sports', label: '스포츠', collect: collectNaverSports },
  { id: 'policy', label: '정책', collect: collectPolicy },
  { id: 'issue', label: '이슈', collect: collectLatestIssueHeadlines },
];

async function refreshSourceSignals() {
  const previousSnapshot = readExisting('source-signals.json');
  const previousLanes = new Map((previousSnapshot?.lanes || []).map((lane) => [lane.id, lane]));
  const collected = await Promise.all(
    LANE_COLLECTORS.map((lane) => lane.collect().catch(() => [])),
  );

  const lanes = [];
  let expansionCount = 0;
  for (let index = 0; index < LANE_COLLECTORS.length; index += 1) {
    const config = LANE_COLLECTORS[index];
    /*
     * 이슈 레인은 크롤링해 온 기사 제목 그대로가 곧 제목이다(사장님 확인).
     * 나머지 레인은 검색어 형태로 다듬는다 — 쉼표·따옴표 낀 뉴스 조각이
     * 검색어 자리에 앉으면 화면 전체가 엉성해 보인다.
     */
    const raw = config.id === 'issue'
      ? collected[index]
      : (() => {
        const seen = new Set();
        return collected[index]
          .map((row) => ({ ...row, keyword: cleanRealtimeQuery(row.keyword) }))
          .filter((row) => row.keyword && !seen.has(row.keyword) && seen.add(row.keyword));
      })();
    if (raw.length === 0) {
      const previousLane = previousLanes.get(config.id);
      if (previousLane?.items?.length) {
        lanes.push({ id: config.id, label: config.label, items: previousLane.items });
        report.push(`  KEPT     실시간 ${config.id} 0건 — 직전 직접 수집본 ${previousLane.items.length}건 유지`);
        continue;
      }
      report.push(`  WARN     실시간 ${config.id} 0건 — 수집기 점검 필요`);
      continue;
    }
    // 자동완성은 순차 호출(레인당 최대 10개, 150ms 간격)
    const rows = await attachExpansions(raw);
    expansionCount += rows.reduce((sum, row) => sum + (row.expansions?.length || 0), 0);
    lanes.push({ id: config.id, label: config.label, items: toSignalItems(config.id, rows) });
  }

  report.push(`  INFO     자동완성 확장 ${expansionCount}건 수집 (${lanes.length}/${LANE_COLLECTORS.length} 레인)`);
  // Preserve recent article briefs for unchanged keywords before refreshing
  // the supporting news context for newly collected public terms.
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
 * 이 크론은 15분마다 파일을 통째로 새로 쓴다. 키워드가 그대로면 최근에
 * 직접 확인한 기사 근거도 그대로 유효하므로, 다음 시간별 재검증 전까지
 * 승계한다. 사라진 키워드의 브리프는 자연히 버려진다.
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
      // 승계한 브리프는 사진이 없을 수 있다(이슈 레인은 뉴스 재검색이 거의 안 걸린다).
      // 목록에서 이미 받아 둔 기사 사진이 있으면 그걸로 채운다 — 승계본이라고
      // 사진 없는 상태로 굳어버리면 그 키워드는 영영 사진이 안 붙는다.
      if (item.insight && item.image && !(item.insight.images || []).length) {
        item.insight = { ...item.insight, images: [item.image] };
      }
    }
  }
  return carried;
}

// ---------------------------------------------------------------- 실행


const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

/**
 * 공지 스냅샷 발행.
 *
 * 공지는 원래 Vultr API(/v1/public/home-notices)가 서빙했다. 서버를 폐지하면서
 * 그 경로가 끊겼고 home-notices.json 은 아무도 만들지 않아 404 가 됐다.
 * GAS 에는 읽기 액션(get-notices)이 살아 있으므로, 여기서 받아 정적본으로 발행한다.
 * 이러면 GAS 가 잠깐 죽어도 사이트의 공지는 마지막 스냅샷으로 계속 뜬다.
 */
async function refreshHomeNotices() {
  const res = await get(`${GAS_URL}?action=get-notices&ts=${Date.now()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    report.push(`  WARN     공지 GAS HTTP ${res.status} — 기존 파일 유지`);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(res.text);
  } catch {
    report.push(`  WARN     공지 GAS 응답 파싱 실패: ${res.text.slice(0, 80)}`);
    return;
  }
  const notices = Array.isArray(payload?.notices) ? payload.notices
    : Array.isArray(payload?.items) ? payload.items
      : [];
  // 0건이면 쓰지 않는다. 좋은 공지를 빈 값으로 덮지 않기 위한 가드다.
  writeSnapshot('home-notices.json', { source: 'gas', items: notices }, notices.length);
}

async function main() {
  console.log('='.repeat(66));
  console.log(`정적 스냅샷 갱신  ${new Date().toISOString()}`);
  console.log(USE_BRIGHTDATA
    ? `direct collection with Bright Data recovery budget (${BRIGHTDATA_FALLBACK_MAX_REQUESTS})`
    : 'direct collection only (Bright Data recovery disabled)');
  console.log('='.repeat(66));

  await refreshSourceSignals();
  await refreshHomeNotices();

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
