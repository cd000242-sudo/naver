/**
 * 자료 라벨 누출 감지.
 *
 * 사장님 실측: 냉장고 글에 "상위 글에서 정리 주기는…", "상위 사례에서는…" 이 실렸다.
 * 독자에게 "상위 글" 이 무엇인가. 우리가 수집한 자료를 부르는 내부 명칭이다.
 *
 * sourceAssembler 가 자료를 이렇게 감싸 넘긴다.
 *   === 상위 노출 글 본문 발췌 (사실 자료 …) ===
 *   [상위글 1 — 제목]
 * 모델은 그 라벨을 출처 이름으로 알고 인용한다. 우리 배관이 본문으로 샌 것이다.
 *
 * 검색 건수 누출과 같은 계열이다. 사람이라면 "블로그 후기들을 보면" 이라고 쓴다.
 * 경고만 낸다.
 */

/**
 * 내부 명칭 목록.
 *
 * "상위 노출" 자체는 블로그 주제어로 정상 등장하므로("상위 노출을 노린다면"),
 * 자료를 가리키는 꼴일 때만 잡는다 — 뒤에 글 · 사례 · 본문 · 자료가 붙는 경우다.
 */
const LABEL_PATTERNS: readonly RegExp[] = Object.freeze([
  /상위\s*(?:노출\s*)?(?:글|사례|본문|자료|포스트)/u,
  /상위글/u,
  /(?:참고|수집|제공된|주어진|첨부(?:된)?)\s*자료/u,
  /본문\s*발췌/u,
  /검색\s*결과\s*스니펫/u,
]);

const MAX_REPORTED = 5;

export function findMaterialLabelLeaks(text: string | undefined): string[] {
  const body = String(text ?? '');
  if (!body.trim()) return [];

  const found: string[] = [];
  for (const pattern of LABEL_PATTERNS) {
    const match = body.match(pattern);
    if (!match) continue;
    const at = body.indexOf(match[0]);
    found.push(body.slice(Math.max(0, at - 10), at + match[0].length + 24).replace(/\s+/gu, ' ').trim());
    if (found.length >= MAX_REPORTED) break;
  }
  return found;
}

export function describeMaterialLabelLeaks(leaks: readonly string[]): string[] {
  return leaks.map((leak) => (
    `자료를 부르는 내부 명칭이 본문에 실렸습니다 — 독자는 그게 무엇인지 모릅니다.`
    + ` "후기에서는", "블로그 사례에서는" 처럼 실제 출처로 바꿔야 합니다: "${leak.slice(0, 40)}…"`
  ));
}
