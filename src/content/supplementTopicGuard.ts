/**
 * Guards the thin-source supplement so it cannot replace the article's subject.
 *
 * [2026-08-27] A URL about 윤은혜's "민폐 하객" statement produced an article entirely about
 * 김수현's 넉오프. The log tells the whole story:
 *
 *   crawl 1,472 chars (윤은혜)
 *   [URL 심화보강] 원본 1472자 < 1500자 → 상위글 풀텍스트 수집
 *   query: `윤은혜, 때아닌 결혼식 '민폐 하객' 논란 해명 "정해진 드레스 코드 있어" | 스타뉴스`
 *   [URL 심화보강] ✅ 4건 / 10,330자 보강   →  rawText 11,831 chars
 *
 * Two faults compounded. The query was the entire headline — outlet suffix and quoted
 * phrase included — and Naver splits a long query into tokens, so generic words like
 * "논란 해명" pulled in unrelated posts. Then the result was concatenated with no check on
 * what it was about: 87% of the material was a different story, and the model followed the
 * majority.
 *
 * The supplement is background material. When it is off-topic it is worse than nothing —
 * a thin source is better than the wrong subject.
 */
import { toHashtagCandidate } from './hashtagCandidateFilter.js';
import { extractKoreanFactTokens } from './koreanFactTokens.js';
import { isContentWord } from './searchQueryNarrowing.js';

/** Longer queries drift: Naver tokenizes them and matches on the generic words. */
const MAX_QUERY_WORDS = 4;

/** Below this the base is too thin to derive a topic from — do not judge. */
const MIN_BASE_CHARS = 200;

/** Blocks arrive labelled by collectTopArticleFullTexts. */
const BLOCK_MARKER = /(?=\[상위글\s*\d+)/;

/** A block must share at least this many proper nouns with the base to count as on-topic. */
const MIN_SHARED_TOKENS = 1;

/*
 * [2026-08-27] 보강은 원본의 몇 배까지만 쓴다.
 *
 * 황석정 실측: 원본 590자에 보강 6,544자가 붙어 원본이 8%가 됐다. 주제 필터를 통과한
 * 블로그 안에도 잡다한 게 섞여 있었고(수집 원본 6,722 / 24,045 / 93,872자), 재료의
 * 대부분이 블로그면 글의 주인이 바뀐다 — 2차전지 시황과 조선시대 품계가 본문에 실렸다.
 *
 * 보강 경고문은 처음부터 "원본이 주 근거, 보충은 배경/맥락용"이라 적고 있었다.
 * 코드가 그 말을 강제하지 않았을 뿐이다.
 */
const MAX_SUPPLEMENT_RATIO = 3;

/**
 * Search query for the supplement, derived from the headline.
 *
 * Drops what a search engine cannot use: the outlet suffix after a pipe, the quoted phrase
 * the headline is built around, and everything past the first few words.
 */
export function buildSupplementQuery(
  title: string | undefined,
  keywords: readonly string[] | undefined,
): string {
  try {
    let text = String(title || '').trim();
    // "제목 | 스타뉴스" 처럼 매체명이 꼬리로 붙는다. 검색어에 넣으면 그 매체 글만 걸린다.
    text = text.split('|')[0];
    // 기사 제목의 따옴표 인용은 발언 조각이라 검색어로는 잡음이다.
    text = text.replace(/["'“”‘’][^"'“”‘’]{0,60}["'“”‘’]/g, ' ');
    text = text.replace(/[,·…]+/g, ' ').replace(/\s+/g, ' ').trim();

    const words = text.split(' ').filter(Boolean).slice(0, MAX_QUERY_WORDS);
    if (words.length > 0) return words.join(' ');

    const fromKeywords = (Array.isArray(keywords) ? keywords : [])
      .map((k) => String(k || '').trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');
    return fromKeywords;
  } catch {
    return '';
  }
}

/**
 * True when the text belongs to the searched keyword's topic.
 *
 * [2026-08-27] `filterOnTopicSupplement` needs a base article to compare against, which
 * keyword mode does not have: several blogs arrive as equals, and if one of them is about
 * a car, the car goes in. 서인영's 46kg diet article carried a MINI Countryman spec sheet
 * (4445mm, 204마력, 4550만원) across two sections.
 *
 * Without a base, the keyword itself is the anchor. A document that shares not one proper
 * noun with the search terms is not material for that keyword.
 *
 * Fails open: when the keyword yields no usable token (digits only, one letter), nothing is
 * filtered. A guard that cannot see must not act.
 */
export function isOnTopicForKeyword(
  text: string | undefined,
  keyword: string | undefined,
): boolean {
  try {
    const body = String(text || '').trim();
    if (!body) return true;

    const tokens: string[] = [];
    for (const word of String(keyword || '').split(/[^가-힣A-Za-z0-9]+/)) {
      const token = toPromiseTokenFromKeyword(word);
      if (token) tokens.push(token);
    }
    if (tokens.length === 0) return true;

    /*
     * [2026-09-01] "하나라도 포함" 은 너무 느슨했다.
     *
     * 명절 냉장고 정리 글에 김치냉장고 제품 스펙(RK70F49M1ZG · 199만 원)이 통째로 실렸다.
     * 30개 블로그 중 1건만 걸러졌는데, 구매 글도 "냉장고" 를 포함하니 통과했기 때문이다.
     * 정리 · 냄새 제거와 제품 구매는 완전히 다른 의도인데 낱말 하나로 묶였다.
     *
     * 주제어가 여럿이면 그중 둘 이상이 있어야 같은 주제로 본다.
     * 주제어가 하나뿐인 짧은 키워드("냉장고")는 그 하나로 판정한다 — 안 그러면 아무것도 못 쓴다.
     */
    const matched = tokens.filter((token) => body.includes(token)).length;
    const required = tokens.length >= 2 ? 2 : 1;
    return matched >= required;
  } catch {
    return true;
  }
}

/** Keyword word → the noun worth matching on, or null when it proves nothing. */
function toPromiseTokenFromKeyword(rawWord: string): string | null {
  const word = String(rawWord || '').trim();
  // 숫자가 섞인 말("46kg", "2026")은 아무 글에나 있어 주제의 근거가 못 된다.
  if (!/^[가-힣]{2,}$/.test(word)) return null;
  const core = toHashtagCandidate(word) || word;
  return core.length >= 2 ? core : null;
}

export interface SupplementFilterResult {
  /** Supplement text with off-topic blocks removed; empty when none survive. */
  readonly text: string;
  readonly kept: number;
  /** Blocks dropped for being about something else. */
  readonly dropped: number;
  /** Blocks dropped for exceeding the budget, after passing the topic check. */
  readonly overflowDropped: number;
}

/**
 * Keeps only the supplement blocks that share proper nouns with the base article.
 *
 * Judged per block, because one off-topic result should not throw away three good ones.
 * When the base is too short to yield proper nouns, nothing is dropped — a guard that
 * cannot see must not act.
 */
export function filterOnTopicSupplement(
  baseBody: string | undefined,
  supplementText: string | undefined,
): SupplementFilterResult {
  try {
    const base = String(baseBody || '').trim();
    const supplement = String(supplementText || '').trim();
    const asIs = (text: string) => ({ text, kept: 1, dropped: 0, overflowDropped: 0 });
    if (!supplement) return { text: '', kept: 0, dropped: 0, overflowDropped: 0 };
    if (base.length < MIN_BASE_CHARS) return asIs(supplement);

    const topic = extractKoreanFactTokens(base, 12);
    if (topic.length === 0) return asIs(supplement);

    const blocks = supplement.split(BLOCK_MARKER).map((b) => b.trim()).filter(Boolean);
    if (blocks.length === 0) return asIs(supplement);

    const onTopic: string[] = [];
    let dropped = 0;
    for (const block of blocks) {
      const shared = topic.filter((token) => block.includes(token)).length;
      if (shared >= MIN_SHARED_TOKENS) onTopic.push(block);
      else dropped += 1;
    }

    // 헤더만 남는 경우를 막는다 — 본문 블록이 하나도 없으면 보강 자체가 없는 것과 같다.
    const kept = onTopic.filter((b) => b.startsWith('[상위글')).length;
    if (kept === 0 && dropped > 0) return { text: '', kept: 0, dropped, overflowDropped: 0 };

    /*
     * 예산 안에서만 붙인다. 블록은 통째로만 자른다 — 중간에서 끊으면 문장이 잘린다.
     * 첫 블록이 예산보다 커도 하나는 남긴다: 보강이 통째로 사라지면 원본이 얇다는
     * 문제를 그대로 두는 셈이라, 주제가 맞는 자료 하나는 배경으로 쓸 값어치가 있다.
     */
    const budget = base.length * MAX_SUPPLEMENT_RATIO;
    const within: string[] = [];
    let used = 0;
    let overflowDropped = 0;
    for (const block of onTopic) {
      if (within.length > 0 && used + block.length > budget) {
        overflowDropped += 1;
        continue;
      }
      within.push(block);
      used += block.length;
    }

    return {
      text: within.join('\n\n'),
      // 실제 상위글 블록만 센다 — 머리말 조각이 건수에 섞이면 로그가 어긋난다.
      kept: within.filter((b) => b.startsWith('[상위글')).length || within.length,
      dropped,
      overflowDropped,
    };
  } catch {
    // 검사 실패로 보강을 잃지 않는다 — 원래 동작으로 돌아간다.
    return { text: String(supplementText || ''), kept: 1, dropped: 0, overflowDropped: 0 };
  }
}

/**
 * 주제 적합도를 통과/탈락이 아니라 정도로 잰다.
 *
 * [2026-09-02 실측] isOnTopicForKeyword 는 토큰 2개면 통과시킨다. 그 판정 자체는 옳다 —
 * 실외기 화재 기사도 실제로 아파트와 베란다를 말하므로 버릴 근거가 없다.
 * 문제는 통과한 자료가 **얼마나 실릴지**를 아무도 정하지 않는다는 것이었다.
 *
 *   "장마 아파트 베란다 창문" 으로 모은 자료의 절반이
 *   실외기 화재 통계와 지하주차장 침수 대피였다.
 *   창문 글인데 본문 절반이 창문이 아니다.
 *
 * 게이트를 조이면 자료가 마른다. 대신 **머리 명사**를 본다 —
 * 한국어 명사구의 머리는 마지막 실질 명사다("아파트 베란다 창문" 의 머리는 창문).
 * 머리를 말하는 자료가 그 글의 본류고, 나머지는 곁가지다.
 * 곁가지를 버리지 않고 몫만 제한하면 자료량은 지키면서 주제는 안 샌다.
 */
export interface TopicMatch {
  /** 주제어 중 본문에 나타난 비율. 0~1 */
  readonly score: number;
  /** 머리 명사가 본문에 있는가 */
  readonly hasHead: boolean;
}

export function scoreTopicMatch(text: string | undefined, keyword: string | undefined): TopicMatch {
  const body = String(text || '');
  const tokens: string[] = [];
  for (const word of String(keyword || '').split(/[^가-힣A-Za-z0-9]+/u)) {
    const token = toPromiseTokenFromKeyword(word);
    if (token && isContentWord(token)) tokens.push(token);
  }
  if (!body.trim() || tokens.length === 0) {
    // 판정할 수 없으면 본류로 본다 — 볼 수 없는 가드는 움직이지 않는다.
    return { score: 1, hasHead: true };
  }

  const matched = tokens.filter((token) => body.includes(token)).length;
  const head = tokens[tokens.length - 1];
  return { score: matched / tokens.length, hasHead: body.includes(head) };
}

/** 이 글의 본류인가. 머리 명사를 말하고 주제어 절반 이상이 나와야 한다. */
export function isPrimaryTopicMaterial(match: TopicMatch): boolean {
  return match.hasHead && match.score >= 0.5;
}
