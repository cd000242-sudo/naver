/*
 * [2026-10-22] 구간형 요청사항 읽기.
 *
 * 사장님은 LEWORD 카드의 작성 안내를 그대로 붙여 넣는다 — "이렇게 쓰세요 / 노릴 검색어 / 반드시 들어갈 내용 /
 * 넣지 않을 내용 / 작성 전 확인". 예전엔 이걸 한 덩어리 문장으로만 봐서
 *   · 프롬프트에서는 원본 본문(수천 자) 앞 중간에 묻혔고,
 *   · 준수 검사는 줄 단위라 머리말 낱말("들어갈" · "넣지")을 검사어로 잡고 항목은 놓쳤다
 *     (일본판을 섞고 부승권을 뺀 글이 79점으로 통과 — 실측).
 * 여기서 구간을 나눠 읽고, 프롬프트 끝에 붙일 점검표를 만든다. 순수 함수 · 네트워크 없음.
 */
export type RequestSections = {
  direction: string[];
  targets: string[];
  mustInclude: string[];
  mustAvoid: string[];
  verify: string[];
};

type SectionKey = keyof RequestSections;

const HEADERS: Array<{ key: SectionKey; re: RegExp }> = [
  { key: 'direction', re: /^이렇게\s*쓰세요\s*[:：]?\s*/ },
  { key: 'targets', re: /^노릴\s*검색어(?:\s*[·:：-]\s*네이버\s*자동완성)?\s*[:：·-]?\s*/ },
  { key: 'mustInclude', re: /^(?:반드시|꼭)\s*(?:들어갈|넣을|포함할|다룰)\s*(?:내용|것|항목)?\s*[:：]?\s*/ },
  { key: 'mustAvoid', re: /^(?:넣지\s*않을|빼야\s*할|피할|제외할|쓰지\s*않을)\s*(?:내용|것|항목)?\s*[:：]?\s*/ },
  { key: 'verify', re: /^작성\s*전\s*확인\s*[:：]?\s*/ },
];

/** 한 줄에 여러 항목을 " · " 로 늘어놓는 구간. 항목 안의 "장승조·김지원"(띄어쓰기 없는 점)은 자르지 않는다. */
const INLINE_LIST_SECTIONS = new Set<SectionKey>(['targets', 'verify']);
const BULLET = /^\s*(?:[-*•·▪◦]|\d+[.)])\s+/;
const INTERNAL_MARKER = /^\[[A-Z][A-Z0-9_ -]{3,}\]/;

function splitItems(key: SectionKey, text: string): string[] {
  const cleaned = text.replace(BULLET, '').trim();
  if (!cleaned) return [];
  return INLINE_LIST_SECTIONS.has(key) ? cleaned.split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean) : [cleaned];
}

/** 구간 머리말이 하나도 없으면 null — 평범한 요청은 기존 검사가 그대로 본다. */
export function parseRequestSections(prompt: string | undefined): RequestSections | null {
  const sections: RequestSections = { direction: [], targets: [], mustInclude: [], mustAvoid: [], verify: [] };
  let current: SectionKey | null = null;
  let headerCount = 0;
  for (const rawLine of String(prompt || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // 앱이 요청사항 뒤에 덧붙이는 내부 지시([DAILY HOMEFEED EDITORIAL] 등)부터는 사장님 글이 아니다.
    if (INTERNAL_MARKER.test(line)) break;
    const header = HEADERS.find((h) => h.re.test(line));
    if (header) {
      current = header.key;
      if (header.key !== 'direction') headerCount += 1;
      sections[current] = [...sections[current], ...splitItems(current, line.replace(header.re, ''))];
      continue;
    }
    if (current) sections[current] = [...sections[current], ...splitItems(current, line)];
    else sections.direction = [...sections.direction, line];
  }
  return headerCount > 0 ? sections : null;
}

/** 지켜야 할 쪽(방향 · 검색어 · 반드시 들어갈 내용) 글 — 금지 구간의 낱말이 요구로 읽히지 않게 따로 뗀다. */
export function positiveRequestText(sections: RequestSections): string {
  return [...sections.direction, ...sections.targets, ...sections.mustInclude].join('\n');
}

/*
 * 프롬프트 맨 끝(근거 안전 계약 바로 앞)에 붙이는 점검표. 요청사항 원문은 본문 앞에 그대로 있고,
 * 이건 수천 자 원문 뒤에서 모델이 마지막으로 다시 보게 하는 항목 목록이다.
 */
export function buildRequestChecklistBlock(prompt: string | undefined): string {
  const s = parseRequestSections(prompt);
  if (!s) return '';
  const lines = ['[사용자 요청사항 최종 점검 — 출력 전에 항목마다 확인]'];
  if (s.targets.length) lines.push(`- 노릴 검색어: ${s.targets.map((t) => `「${t}」`).join(', ')} — 제목과 도입부, 본문에 이 표현 그대로 자연스럽게 넣는다.`);
  if (s.mustInclude.length) {
    lines.push('- 반드시 들어갈 내용(빠짐없이, 가능하면 항목마다 소제목이나 문단 하나):');
    s.mustInclude.forEach((item, i) => lines.push(`  ${i + 1}. ${item}`));
  }
  if (s.mustAvoid.length) {
    lines.push('- 넣지 않을 내용(언급 · 비교 · 예시로도 쓰지 않는다):');
    s.mustAvoid.forEach((item) => lines.push(`  · ${item}`));
  }
  if (s.verify.length) {
    // "확인되지 않았다" 같은 근거 메타 문구는 뒤의 근거 계약이 금지한다(2026-10-22 실주행) — 확인된 범위만 쓰거나 뺀다.
    lines.push('- 작성 전 확인 — 아래가 [원본 텍스트]로 확인되지 않으면 그 대목은 단정하지 말고 빼거나, 자료에 있는 범위까지만 쓴다:');
    s.verify.forEach((item) => lines.push(`  · ${item}`));
  }
  return lines.join('\n');
}

/*
 * 개인 프롬프트(모드별 저장 · 연속발행 항목 값)와 이번 글 요청사항을 합친다.
 * 예전엔 둘 중 하나만 골라, 개인 프롬프트를 한 번이라도 저장한 모드에서는 요청사항이 경고 없이 버려졌다(2026-10-22 실측).
 * 이미 들어 있는 요청(연속발행 항목에 큐 저장 때 합쳐 둔 값)은 두 번 붙이지 않는다.
 */
export function mergeCustomPrompt(base: string | undefined, extra: string | undefined): string {
  const b = String(base || '').trim();
  const e = String(extra || '').trim();
  if (!e) return b;
  if (!b) return e;
  if (b.includes(e)) return b;
  return `${b}\n\n[이번 글 요청사항]\n${e}`;
}
