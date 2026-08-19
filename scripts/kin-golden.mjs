#!/usr/bin/env node
/**
 * 지식인 황금질문 수집 — 사장님 설계(2026-08-20):
 *   실시간 Q&A  = 지식인 홈 '많이 본 Q&A' 30건 전부 (제목·요약·조회·답변 인라인 실측)
 *   급상승 Q&A  = 직전 스냅샷 대비 조회수가 붙는 속도 상위 (2회차부터 차오른다)
 *   숨은 Q&A    = 전체 최신 목록에서 조회 많고 답변 적은 것 — 많이 본 목록엔 없는 질문
 *
 * 왜: 질문이 곧 키워드다. 많이 본 질문은 지금 다른 판(카페·SNS·검색)에서도 같은
 * 질문이 터지고 있다는 실측 신호라, 답변+링크로 외부유입을 연쇄시킬 수 있다.
 *
 * 전부 무료 페이지 실측이다. 최신 목록에는 조회수가 없어(실측 확인) 숨은 후보만
 * 질문 페이지를 개별로 열어 조회수·답변수를 잰다. 15분 크론에 얹혀 돈다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'spa', 'public', 'data', 'kin-golden.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
/** 숨은 Q&A 판정 — 최신 질문인데 조회는 붙고 답변은 빈 자리. */
const HIDDEN_MIN_VIEWS = 100;
const HIDDEN_MAX_ANSWERS = 2;
/** 숨은 질문은 며칠 안 된 것이어야 한다(사장님: "무엇보다 최신이어야"). */
const HIDDEN_FRESH_DAYS = 3;
/** 숨은 후보 개별 실측 상한 — 크론 한 번의 예의 있는 폭. */
const HIDDEN_CANDIDATE_CAP = 60;
/** 급상승 판정 — 이 정도는 붙어야 잰 값이지 노이즈가 아니다. */
const RISING_MIN_DELTA = 20;

/*
 * 숨은 질문 시드 사전 — "일반인이 답변 달 수 있는" 생활 수요 어휘.
 * 전체 최신 목록은 초 단위로 흘러(3페이지가 전부 '7분 전' 실측) 조회가 쌓일
 * 시간이 없는 풀이었다. 검색(sort=date)은 며칠 된 최신을 날짜·답변수와 함께
 * 주므로, 여기서만 조회수를 개별 실측하면 된다. 시간대별로 12개씩 돌려
 * 회차마다 다른 밭을 훑는다.
 */
const HIDDEN_SEEDS = [
  '환불', '취소', '오류', '고장', '수리', '설치',
  '중고거래', '사기', '배송', '교환', '반품', '보증',
  '대출', '보험금', '전세', '월세', '이사', '계약',
  '퇴사', '실업급여', '알바', '급여', '세금', '연말정산',
  '자동차', '면허', '벌금', '여권', '항공권', '병원비',
];
const SEEDS_PER_RUN = 12;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const num = (s) => Number(String(s).replace(/,/g, ''));
const docIdOf = (link) => (String(link).match(/docId=(\d+)/) || [])[1] || String(link);

/** 홈 '많이 본 Q&A' 30건 — 한 페이지에 전부 인라인으로 실려 있다(실측 확인). */
async function fetchRealtime() {
  const html = await fetchText('https://kin.naver.com/');
  const items = [];
  const blocks = html.split(/class="ranking_item /).slice(1);
  for (const block of blocks) {
    const link = (block.match(/href="(\/qna\/detail\.naver[^"]+)"/) || [])[1];
    const title = (block.match(/class="ranking_title">([^<]+)</) || [])[1];
    const summary = (block.match(/class="text">([^<]*)</) || [])[1] || '';
    const views = (block.match(/조회수\s*([\d,]+)/) || [])[1];
    const answers = (block.match(/답변수\s*([\d,]+)/) || [])[1];
    if (!link || !title || views === undefined) continue;
    items.push({
      rank: items.length + 1,
      title: title.trim(),
      link: `https://kin.naver.com${link.replace(/&amp;/g, '&')}`,
      summary: summary.trim().slice(0, 120),
      views: num(views),
      answers: answers === undefined ? null : num(answers),
    });
  }
  return items;
}

/**
 * 지식인 검색(sort=date) — 결과 행에 날짜·답변수·전문가답변 배지가 인라인으로
 * 실린다(실측 확인: txt_inline 날짜 · class="hit">답변수 N · ico_pro alt).
 * 그래서 "최신 3일 안 + 답변 ≤2 + 전문가 전용 아님"을 조회수 실측 **전에**
 * 거를 수 있다 — 페이지 개별 실측 예산이 전부 진짜 후보에 쓰인다.
 */
async function fetchSearchCandidates() {
  const startIdx = Math.floor(Date.now() / 3_600_000) % HIDDEN_SEEDS.length;
  const seeds = Array.from({ length: SEEDS_PER_RUN }, (_v, i) => HIDDEN_SEEDS[(startIdx + i) % HIDDEN_SEEDS.length]);
  const freshFloor = Date.now() - HIDDEN_FRESH_DAYS * 24 * 3_600_000;
  const seen = new Set();
  const rows = [];
  for (const seed of seeds) {
    /*
     * 시드 범위의 sort=date 에서는 페이지가 곧 시간축이다 — 1페이지는 몇 분 전,
     * 2~6페이지가 몇 시간~이틀 전(조회가 쌓일 시간이 있었던 최신). 정확도순은
     * 4~14일 전 위주라 3일 필터에 전멸했다(실측: 후보 14건). 날짜·답변수가
     * 행에 실려 있으니 필터는 페이지 실측 전에 끝난다.
     */
    for (let page = 2; page <= 6; page += 1) {
    try {
      const html = await fetchText(`https://kin.naver.com/search/list.naver?query=${encodeURIComponent(seed)}&period=1&sort=date&page=${page}`);
      const items = html.split('<ul class="basic1"')[1] || '';
      for (const block of items.split(/<li>/).slice(1)) {
        const link = (block.match(/href="(https:\/\/kin\.naver\.com\/qna\/detail\.naver[^"]+)"/) || [])[1];
        // 검색어 하이라이트(<b>) 가 제목 중간에 끼므로 태그 너머까지 받아 걷어낸다.
        const title = ((block.match(/_searchListTitleAnchor">([\s\S]*?)<\/a>/) || [])[1] || '').replace(/<[^>]*>/g, '');
        const date = (block.match(/class="txt_inline">(\d{4})\.(\d{2})\.(\d{2})\./) || []);
        const answers = (block.match(/class="hit">답변수\s*([\d,]+)/) || [])[1];
        // 전문가(변호사·의사…) 답변이 이미 붙은 질문은 뺀다 — 일반인이 답 달 자리가 아니다.
        if (/ico_pro/.test(block)) continue;
        if (!link || !title || !date[1] || answers === undefined) continue;
        if (num(answers) > HIDDEN_MAX_ANSWERS) continue;
        if (Date.parse(`${date[1]}-${date[2]}-${date[3]}`) < freshFloor) continue;
        const cleanLink = link.replace(/&amp;/g, '&');
        const docId = docIdOf(cleanLink);
        if (seen.has(docId)) continue;
        seen.add(docId);
        rows.push({
          title: title.replace(/<[^>]*>/g, '').trim(),
          link: cleanLink,
          docId,
          askedAt: `${date[1]}.${date[2]}.${date[3]}`,
          answers: num(answers),
        });
      }
    } catch (error) {
      console.log(`  !! 검색 "${seed}" ${page}p 실패(건너뜀): ${String(error.message || error).slice(0, 60)}`);
    }
    await sleep(200);
    }
  }
  return rows;
}

/** 질문 페이지에서 조회수·답변수 실측 — enrich 의 검증된 마크업 패턴 그대로. */
async function fetchStats(link) {
  try {
    const html = await fetchText(link);
    const views = (html.match(/조회수\s*([\d,]+)/) || [])[1];
    const answers = (html.match(/answerCount"\s*>\s*([\d,]+)\s*</) || [])[1];
    return {
      views: views === undefined ? null : num(views),
      answers: answers === undefined ? null : num(answers),
    };
  } catch {
    return { views: null, answers: null };
  }
}

async function main() {
  /** 직전 스냅샷 — 급상승은 두 실측의 차이지, 한 번 보고 지어낼 수 있는 값이 아니다. */
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(DEST, 'utf8')); } catch { /* 첫 회차 */ }

  const realtime = await fetchRealtime();
  console.log(`많이 본 Q&A ${realtime.length}건`);

  const realtimeIds = new Set(realtime.map((q) => docIdOf(q.link)));

  // 숨은 후보: 수요 어휘 검색(최신 3일·답변 ≤2·전문가 제외 선필터)에서 온다.
  const candidates = (await fetchSearchCandidates())
    .filter((q) => !realtimeIds.has(q.docId))
    // 창 안에서는 오래된 것부터 — 조회가 쌓였을 확률이 커 실측 예산이 아깝지 않다.
    .sort((a, b) => a.askedAt.localeCompare(b.askedAt))
    .slice(0, HIDDEN_CANDIDATE_CAP);
  const hiddenPool = [];
  for (const q of candidates) {
    const stats = await fetchStats(q.link);
    if (stats.views !== null) {
      // 답변수는 페이지 실측이 더 최신이다 — 검색 스냅샷 이후 붙었을 수 있다.
      hiddenPool.push({ ...q, views: stats.views, answers: stats.answers ?? q.answers });
    }
    await sleep(120);
  }
  const hidden = hiddenPool
    .filter((q) => q.views >= HIDDEN_MIN_VIEWS && typeof q.answers === 'number' && q.answers <= HIDDEN_MAX_ANSWERS)
    .sort((a, b) => b.views - a.views)
    .slice(0, 40)
    .map(({ docId: _docId, ...rest }) => rest);
  console.log(`숨은 후보 ${candidates.length}건 실측 → 통과 ${hidden.length}건`);

  /*
   * 급상승 — 직전 스냅샷의 같은 질문과 조회수를 비교해 시간당 증가로 환산한다.
   * 직전 값이 없는 질문(새 진입)은 증가율을 잴 수 없으므로 싣지 않는다 —
   * 안 잰 것을 근거로 쓰지 않는 것이 이 보드의 규칙이다.
   */
  const prevMap = new Map();
  if (prev && prev.fetchedAt) {
    for (const list of [prev.realtime, prev.hidden, prev.rising]) {
      for (const q of Array.isArray(list) ? list : []) {
        if (typeof q.views === 'number') prevMap.set(docIdOf(q.link), q.views);
      }
    }
  }
  const minutes = prev && prev.fetchedAt ? Math.max(1, (Date.now() - Date.parse(prev.fetchedAt)) / 60_000) : 0;
  const rising = minutes === 0 ? [] : [...realtime, ...hidden]
    .map((q) => {
      const before = prevMap.get(docIdOf(q.link));
      if (typeof before !== 'number' || typeof q.views !== 'number') return null;
      const delta = q.views - before;
      if (delta < RISING_MIN_DELTA) return null;
      return { title: q.title, link: q.link, views: q.views, answers: q.answers ?? null, viewsDelta: delta, perHour: Math.round((delta * 60) / minutes) };
    })
    .filter(Boolean)
    .sort((a, b) => b.perHour - a.perHour)
    .slice(0, 15);
  console.log(`급상승 ${rising.length}건 (직전 스냅샷 ${prev && prev.fetchedAt ? `${Math.round(minutes)}분 전` : '없음 — 다음 회차부터'})`);

  const out = {
    fetchedAt: new Date().toISOString(),
    prevFetchedAt: (prev && prev.fetchedAt) || null,
    criteria: {
      hidden: `${HIDDEN_FRESH_DAYS}일 안 최신 · 조회 ${HIDDEN_MIN_VIEWS}+ · 답변 ${HIDDEN_MAX_ANSWERS}개 이하 · 전문가답변 전용 제외 · 많이 본 목록 제외`,
      rising: `직전 스냅샷 대비 조회 +${RISING_MIN_DELTA} 이상, 시간당 증가 순`,
    },
    realtime,
    rising,
    hidden,
  };
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, JSON.stringify(out, null, 2), 'utf8');
  console.log(`저장: ${DEST}`);
}

main().catch((error) => { console.error('지식인 황금질문 수집 실패:', error); process.exit(1); });
