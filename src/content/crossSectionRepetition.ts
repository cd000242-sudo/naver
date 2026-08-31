/**
 * 섹션 간 반복 감지.
 *
 * contentOptimizer 의 removeConsecutiveDuplicates 는 2026-08-05 에 처리 범위를
 * 문단 안으로 좁혔다. 그전에는 글 전체를 훑다가 문단 경계를 통째로 날리고
 * (실측: 문단 8개 -> 1개) 문단마다 반복되는 정상 문장까지 지웠기 때문이다.
 * 그 수정은 옳았지만, 그 자리에서 "섹션과 섹션 사이" 를 보는 눈이 같이 사라졌다.
 *
 * 여기서는 지우지 않는다. 어디와 어디가 겹치는지 알려주기만 한다.
 * 결론이 앞 내용을 요약하는 것은 정상이므로, 거의 그대로 옮긴 경우만 잡는다.
 */

export interface Section {
  heading?: string;
  content?: string;
}

export interface CrossSectionRepeat {
  earlierHeading: string;
  laterHeading: string;
  earlier: string;
  later: string;
  similarity: number;
}

/**
 * 비교 하한. 짧은 문장은 우연히 겹친다 — "그렇습니다" 두 번을 반복이라 부를 수 없다.
 */
const MIN_SENTENCE_CHARS = 18;

/**
 * 같은 말로 볼 임계값.
 *
 * 결론이 앞 내용을 다시 짚는 것은 정상이라 낮게 잡으면 정상 글이 걸린다.
 * 실측 사례("숫자를 모르면 조절 자체가 안 됩니다" / "숫자를 모르면 조절이 안 됩니다")는
 * 어절 대부분이 그대로라 높은 임계값에서도 잡힌다.
 */
const SAME_MEANING_RATIO = 0.7;

const MAX_REPORTED = 5;

function splitSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?。])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= MIN_SENTENCE_CHARS);
}

/** 조사와 어미 차이를 흡수하려고 어절 앞부분만 본다. */
function tokenize(sentence: string): string[] {
  return sentence
    .replace(/[^가-힣a-zA-Z0-9\s]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => word.slice(0, 3));
}

function similarity(left: string, right: string): number {
  const a = tokenize(left);
  const b = new Set(tokenize(right));
  if (a.length === 0 || b.size === 0) return 0;
  const shared = a.filter((token) => b.has(token)).length;
  // 짧은 쪽 기준으로 본다 — 긴 문장에 짧은 문장이 통째로 들어가 있으면 반복이다.
  return shared / Math.min(a.length, b.size);
}

export function findCrossSectionRepeats(sections: readonly Section[] | undefined): CrossSectionRepeat[] {
  const list = (sections ?? []).map((section) => ({
    heading: String(section?.heading || '').trim() || '(제목 없음)',
    sentences: splitSentences(section?.content ?? ''),
  }));

  const found: CrossSectionRepeat[] = [];
  for (let later = 1; later < list.length; later += 1) {
    for (let earlier = 0; earlier < later; earlier += 1) {
      for (const laterSentence of list[later].sentences) {
        for (const earlierSentence of list[earlier].sentences) {
          const score = similarity(laterSentence, earlierSentence);
          if (score < SAME_MEANING_RATIO) continue;
          found.push({
            earlierHeading: list[earlier].heading,
            laterHeading: list[later].heading,
            earlier: earlierSentence,
            later: laterSentence,
            similarity: Math.round(score * 100) / 100,
          });
        }
      }
    }
  }
  return found.slice(0, MAX_REPORTED);
}

export function describeCrossSectionRepeats(repeats: readonly CrossSectionRepeat[]): string[] {
  return repeats.map((repeat) => (
    `"${repeat.laterHeading}" 의 문장이 "${repeat.earlierHeading}" 과 거의 같습니다`
    + ` (${Math.round(repeat.similarity * 100)}%): "${repeat.later.slice(0, 36)}…"`
  ));
}
