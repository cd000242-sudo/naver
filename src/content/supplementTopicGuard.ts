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
import { extractKoreanFactTokens } from './koreanFactTokens.js';

/** Longer queries drift: Naver tokenizes them and matches on the generic words. */
const MAX_QUERY_WORDS = 4;

/** Below this the base is too thin to derive a topic from — do not judge. */
const MIN_BASE_CHARS = 200;

/** Blocks arrive labelled by collectTopArticleFullTexts. */
const BLOCK_MARKER = /(?=\[상위글\s*\d+)/;

/** A block must share at least this many proper nouns with the base to count as on-topic. */
const MIN_SHARED_TOKENS = 1;

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

export interface SupplementFilterResult {
  /** Supplement text with off-topic blocks removed; empty when none survive. */
  readonly text: string;
  readonly kept: number;
  readonly dropped: number;
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
    if (!supplement) return { text: '', kept: 0, dropped: 0 };
    if (base.length < MIN_BASE_CHARS) {
      return { text: supplement, kept: 1, dropped: 0 };
    }

    const topic = extractKoreanFactTokens(base, 12);
    if (topic.length === 0) return { text: supplement, kept: 1, dropped: 0 };

    const blocks = supplement.split(BLOCK_MARKER).map((b) => b.trim()).filter(Boolean);
    if (blocks.length === 0) return { text: supplement, kept: 1, dropped: 0 };

    const onTopic: string[] = [];
    let dropped = 0;
    for (const block of blocks) {
      const shared = topic.filter((token) => block.includes(token)).length;
      if (shared >= MIN_SHARED_TOKENS) onTopic.push(block);
      else dropped += 1;
    }

    // 헤더만 남는 경우를 막는다 — 본문 블록이 하나도 없으면 보강 자체가 없는 것과 같다.
    const kept = onTopic.filter((b) => b.startsWith('[상위글')).length;
    if (kept === 0 && dropped > 0) return { text: '', kept: 0, dropped };

    return { text: onTopic.join('\n\n'), kept: onTopic.length, dropped };
  } catch {
    // 검사 실패로 보강을 잃지 않는다 — 원래 동작으로 돌아간다.
    return { text: String(supplementText || ''), kept: 1, dropped: 0 };
  }
}
