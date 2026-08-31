/**
 * 문장마다 문단을 나눈다.
 *
 * 사장님 실측: 쇼핑커넥트 발행글에서 두세 문장이 한 덩어리로 붙어 모바일에서
 * 벽처럼 보였다. 지시는 명확했다 — "마침표가 있다면 한 번 띄우는 규칙이 있어야 돼."
 *
 * 왜 없었는지 찾아보니 문단 길이 규칙 자체가 없었다. contentOptimizer 의
 * optimizeParagraphStructure 가 400자를 넘을 때 중간에서 한 번 쪼개는 것이 전부라,
 * 300자짜리 뭉텅이는 손도 대지 않고 지나간다. 붙여넣기 계층은 문장마다 <p> 를
 * 만들지만 문단 경계는 빈 줄이 맡으므로, 본문에 빈 줄이 없으면 한 덩어리로 보인다.
 *
 * 마침표는 문장 끝에만 있는 게 아니다. 소수점("45.5%"), 번호 목록("1."),
 * 말줄임표, 표 구분자가 전부 이 자리를 지나간다. 하나라도 잘못 끊으면 글이 망가지므로
 * 끊지 않을 줄을 먼저 걸러낸 뒤 남은 줄에만 적용한다.
 */

/** 이 꼴로 시작하는 줄은 통째로 둔다 — 표 · 목록 · 소제목 · 인용. */
const KEEP_WHOLE = /^\s*(?:\||#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/u;

/**
 * 문장 끝 판정.
 *
 * 마침표 · 물음표 · 느낌표 뒤에 공백이 오고, 그 다음이 문장 시작으로 보일 때만 끊는다.
 *   · 앞이 숫자면 소수점이다 — (?<!\d) 로 막는다.
 *   · 점이 연달아 있으면 말줄임표다 — (?<!\.) 와 (?!\.) 로 막는다.
 */
const SENTENCE_END = /(?<!\d)(?<!\.)([.!?])(?!\.)\s+(?=\S)/gu;

export function enforceSentenceParagraphs(text: string | undefined): string {
  const input = String(text ?? '');
  if (!input.trim()) return input;

  // 문단 구분자를 캡처해 그대로 돌려놓는다 — 나누려다 기존 경계를 잃으면 안 된다.
  return input
    .split(/(\n{2,})/u)
    .map((segment) => {
      if (/^\n{2,}$/u.test(segment)) return segment;
      return segment
        .split('\n')
        .map((line) => (KEEP_WHOLE.test(line) ? line : line.replace(SENTENCE_END, '$1\n\n')))
        .join('\n');
    })
    .join('');
}
