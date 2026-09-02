/**
 * 문단을 2~3문장 묶음으로 유지한다.
 *
 * [2026-09-02 사장님 결정] "문단정리 기본값을 2~3줄에서 줄바꿈 띄우기로."
 * 이전 규칙은 "마침표가 있다면 한 번 띄운다" 였다(쇼핑글이 벽처럼 보이던 실측에서 나온 지시).
 * 그 규칙을 모든 모드에 걸었더니 이번엔 문장 하나가 문단 하나가 되어, 4편이 전부 한 줄씩 끊긴
 * 글로 나왔다. 모바일 2~3줄(대략 2~3문장)이 한 문단이고 그 사이가 빈 줄이다.
 *
 * 규칙은 형태다.
 *   · 한 문단이 3문장을 넘으면 2~3문장씩 고르게 나눈다(4→2+2, 5→3+2, 7→3+2+2). 혼자 남는 문장을 만들지 않는다.
 *   · 3문장 이하면 손대지 않는다. 모델이 한 문장으로 끊은 문단도 그대로 둔다 — 리듬은 모델 몫이다.
 *   · 기존 빈 줄(문단 경계)은 절대 합치지 않는다. 나누기만 한다.
 *
 * 마침표는 문장 끝에만 있는 게 아니다. 소수점("45.5%"), 번호 목록("1."), 말줄임표, 표 구분자가
 * 전부 이 자리를 지나간다. 끊지 않을 줄을 먼저 걸러낸 뒤 남은 줄에만 적용한다.
 */

/** 이 꼴로 시작하는 줄은 통째로 둔다 — 표 · 목록 · 소제목 · 인용. */
const KEEP_WHOLE = /^\s*(?:\||#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/u;

/**
 * 문장 경계 — 마침표·물음표·느낌표 뒤의 공백. 구두점은 앞 문장에 남는다.
 *   · 구두점 앞이 숫자면 소수점이다 — (?<!\d) 로 막는다.
 *   · 점이 연달아 있으면 말줄임표다 — (?<!\.) 와 (?!\.) 로 막는다.
 */
const SENTENCE_BOUNDARY = /(?<=(?<!\d)(?<!\.)[.!?])(?!\.)\s+(?=\S)/u;

export const DEFAULT_MAX_SENTENCES_PER_PARAGRAPH = 3;

/** n 문장을 max 이하 크기의 묶음으로 고르게 나눈다 — 마지막 묶음이 혼자 남지 않게. */
export function paragraphGroupSizes(sentenceCount: number, maxSentences: number = DEFAULT_MAX_SENTENCES_PER_PARAGRAPH): number[] {
  const n = Math.max(0, Math.floor(sentenceCount));
  const max = Math.max(1, Math.floor(maxSentences));
  if (n === 0) return [];
  if (n <= max) return [n];
  const groups = Math.ceil(n / max);
  const base = Math.floor(n / groups);
  const extra = n % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
}

function regroupLine(line: string, maxSentences: number): string {
  if (KEEP_WHOLE.test(line)) return line;
  const sentences = line.split(SENTENCE_BOUNDARY).filter((s) => s.length > 0);
  if (sentences.length <= maxSentences) return line;
  const sizes = paragraphGroupSizes(sentences.length, maxSentences);
  const paragraphs: string[] = [];
  let cursor = 0;
  for (const size of sizes) {
    paragraphs.push(sentences.slice(cursor, cursor + size).join(' '));
    cursor += size;
  }
  return paragraphs.join('\n\n');
}

export function enforceSentenceParagraphs(
  text: string | undefined,
  maxSentences: number = DEFAULT_MAX_SENTENCES_PER_PARAGRAPH,
): string {
  const input = String(text ?? '');
  if (!input.trim()) return input;

  // 문단 구분자를 캡처해 그대로 돌려놓는다 — 나누려다 기존 경계를 잃으면 안 된다.
  return input
    .split(/(\n{2,})/u)
    .map((segment) => {
      if (/^\n{2,}$/u.test(segment)) return segment;
      return segment
        .split('\n')
        // [2026-09-02 사장님 참고글] 빈 줄이 문단 경계다. 그 안의 홑 줄바꿈(모델이 문장마다 넣은 것)은 같은 문단이라
        //   평문 줄끼리 먼저 잇고 나서 2~3문장씩 묶는다. 표·목록·소제목·인용 줄은 따로 둔다.
        .reduce<string[]>((acc, line) => {
          const prev = acc.length ? acc[acc.length - 1] : undefined;
          if (prev !== undefined && line.trim() && !KEEP_WHOLE.test(line) && !KEEP_WHOLE.test(prev) && prev.trim()) {
            acc[acc.length - 1] = `${prev.trim()} ${line.trim()}`;
          } else {
            acc.push(line);
          }
          return acc;
        }, [])
        .map((line) => regroupLine(line, maxSentences))
        .join('\n');
    })
    .join('');
}
