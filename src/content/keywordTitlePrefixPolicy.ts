// src/content/keywordTitlePrefixPolicy.ts
// "키워드를 제목 맨 앞에 배치" 옵션이 좋은 제목을 망치지 않게 거르는 순수 판정.
//
// [2026-08-26 사용자 실측] 후보 재선택이 100점 제목을 골랐는데, 그 뒤 이 옵션이
// 키워드를 앞에 붙여 3점짜리로 만들었다.
//
//   고른 제목:  "나혼산 전현무 알마티 여행 논란, 렌터카 공증 절차와 제작진 입장 정리"
//   키워드:     "전현무 즉흥여행 논란"
//   붙인 결과:  "전현무 즉흥여행 논란 나혼산 전현무 알마티 여행 논란, ..."  ← 3점
//   중복 제거 후: 73점 (원래 100점보다 나쁘다)
//
// 기존 중복 제거는 키워드가 제목에 **연속으로** 들어 있을 때만 걷어냈다. 위 사례처럼
// 전현무 / 논란 이 흩어져 있으면 못 잡고 그대로 붙여 중복을 만든다.
//
// 옵션 자체는 사용자가 켠 것이므로 끄지 않는다. 다만 키워드가 이미 충분히 들어 있으면
// 붙이지 않는다 — 검색 노출 목적은 이미 달성됐고, 붙이면 손해만 남는다.

export interface KeywordPrefixDecision {
  readonly shouldPrefix: boolean;
  readonly reason: 'absent' | 'already-covered' | 'starts-with-keyword' | 'empty';
  /** 제목에 이미 들어 있는 키워드 토큰 수 / 전체 토큰 수. */
  readonly coveredTokens: number;
  readonly totalTokens: number;
}

/** 비교용 정규화 — 따옴표·구두점·공백을 걷어낸다. */
function normalize(value: string): string {
  return String(value || '')
    .replace(/[''"""\u2018\u2019\u201C\u201D,，·\-–—:：;；!！?？()\[\]「」『』]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

/** 의미 있는 토큰만 — 한 글자 조사·접속사는 우연히 겹친다. */
function meaningfulTokens(keyword: string): string[] {
  return String(keyword || '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => normalize(t).length >= 2);
}

/**
 * 키워드가 제목에 이미 충분히 들어 있으면 앞배치를 건너뛴다.
 *
 * 기준: 의미 토큰의 3분의 2 이상이 제목에 보이면 "이미 커버됨" 으로 본다.
 * 위 실측 사례는 전현무·논란 2/3 이 걸려 건너뛰게 된다.
 * 토큰이 하나뿐이면 그 하나가 있으면 커버로 본다.
 */
export interface KeywordCoverage {
  /** 제목에 실제로 보이는 의미 토큰 수. */
  readonly covered: number;
  /** 키워드의 의미 토큰 총수. */
  readonly total: number;
  /** covered / total (총수 0이면 0). */
  readonly ratio: number;
}

/**
 * 키워드가 제목에 얼마나 물려 있는지 센다.
 *
 * [2026-08-26] 접두 판정과 검색 노출 채점이 같은 토큰 기준을 쓰게 하려고 뺐다.
 * 두 곳이 다르게 쪼개면 "붙이지 않기로 해놓고 점수는 깎는" 모순이 생긴다.
 */
export function measureKeywordCoverage(keyword: string, title: string): KeywordCoverage {
  const kw = String(keyword || '').trim();
  const t = String(title || '').trim();
  if (!kw || !t) return { covered: 0, total: 0, ratio: 0 };

  const tokens = meaningfulTokens(kw);
  const titleNorm = normalize(t);

  if (tokens.length === 0) {
    const covered = titleNorm.includes(normalize(kw)) ? 1 : 0;
    return { covered, total: 1, ratio: covered };
  }

  const covered = tokens.filter((token) => titleNorm.includes(normalize(token))).length;
  return { covered, total: tokens.length, ratio: covered / tokens.length };
}

export function decideKeywordPrefix(keyword: string, title: string): KeywordPrefixDecision {
  const kw = String(keyword || '').trim();
  const t = String(title || '').trim();
  if (!kw || !t) {
    return { shouldPrefix: false, reason: 'empty', coveredTokens: 0, totalTokens: 0 };
  }

  if (t.startsWith(kw)) {
    return { shouldPrefix: false, reason: 'starts-with-keyword', coveredTokens: 0, totalTokens: 0 };
  }

  const tokens = meaningfulTokens(kw);
  if (tokens.length === 0) {
    // 전부 한 글자면 토큰 판정을 못 한다 — 통째로 들어 있는지만 본다.
    const covered = normalize(t).includes(normalize(kw));
    return {
      shouldPrefix: !covered,
      reason: covered ? 'already-covered' : 'absent',
      coveredTokens: covered ? 1 : 0,
      totalTokens: 1,
    };
  }

  const titleNorm = normalize(t);
  const covered = tokens.filter((token) => titleNorm.includes(normalize(token))).length;
  const enough = covered * 3 >= tokens.length * 2; // 2/3 이상

  return {
    shouldPrefix: !enough,
    reason: enough ? 'already-covered' : 'absent',
    coveredTokens: covered,
    totalTokens: tokens.length,
  };
}
