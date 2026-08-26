import { buildSourceFactChecklist } from './content/sourceFactChecklist.js';
export interface UrlModeDirectiveSource {
  url?: string;
  sourceType?: string;
  rawText?: string | null;
  /** 이번 글의 발행 모드. 없으면 모드 규칙을 건드리지 않는 중립 지시문을 쓴다. */
  contentMode?: string;
}

// [2026-08-23] 이 지시문은 시스템 프롬프트 **맨 앞**에 붙는다. 그래서 여기 적힌 규칙이
//   모드 프롬프트(홈판 클릭 계약, SEO 키워드 배치 등)보다 위에서 작동한다.
//   이전 버전은 모드를 보지 않고 "원본 100% 보존 / 길이 85% 이상"을 절대 규칙으로 걸었고,
//   그 결과 홈판 모드로 URL 글을 뽑아도 기사 재구성체가 나왔다(사용자 실측).
//   → 공통부에는 "사실"만 묶고, 제목·구성·길이 같은 **형식 권한은 모드에 넘긴다**.

const URL_MODE_CORE = `[URL 원본 글 재구성 — 절대 준수 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

당신은 URL 원본 글을 *재료*로 삼아 훨씬 좋은 퀄리티의 블로그 글을 작성한다.

## 1. 사실 보존 (최우선)
- 원본의 모든 사실(fact), 숫자, 인명, 지명, 제품명, 인용문, 사례를 **빠짐없이** 포함하라.
- 정보를 *축약·요약·생략·뭉뚱그림* 하지 마라. 자세히 풀어 쓰는 방향으로만 가공하라.

## 2. 환각 절대 금지
- 원본에 *없는* 부정 키워드(폭로/논란/의혹/비판/위선/이중성 등) 추가 금지.
- 원본 인물·사건의 감정 방향(긍정/부정)을 *원본 그대로* 유지하라. 왜곡 금지.
- 원본에 없는 사실·수치·인용을 *지어내지* 마라. grounding 검색 결과도 원본과 충돌하면 원본 우선.

## 3. 퀄리티 업그레이드
- 원본보다 *더 깊이 있게*: 맥락·배경·왜 그런지 한 단계 더 설명.
- 원본보다 *더 친절하게*: 어려운 개념은 일상 비유로 풀어줌.
- 원본보다 *더 자연스럽게*: 기사체/보고체 제거, 블로거 본인의 관찰 톤으로 변환.

## 4. 자연어 가공 원칙
- 원본 문장을 그대로 베끼지 마라. 사실만 가져오고 문장은 새로 쓴다.
- AI 보고체("알아보겠습니다", "살펴보겠습니다", "마치겠습니다") 절대 금지.
`;

/**
 * 형식(제목·구성·길이) 권한을 어디에 둘지 — 모드마다 다르다.
 * 원문 형식을 따라가야 자연스러운 모드가 있고, 원문 형식이 오히려 방해가 되는 모드가 있다.
 */
const URL_MODE_SHAPE: Readonly<Record<string, string>> = Object.freeze({
  seo: `
## 5. 형식 — 검색 노출 우선
- 제목은 원문 기사 제목을 따라가지 마라. **사람이 실제로 검색창에 칠 말**이 제목 앞에 와야 한다.
- 분량 기준은 두지 않는다. 위 사실 목록을 다 담으면 그게 필요한 길이다(seo R0-5와 같은 계약).
  ⛔ 사실을 빠뜨린 채 짧게 끝내는 것도, 사실 없이 수식어로 늘리는 것도 똑같이 실패다.
- 문단은 짧게, 소제목으로 호흡을 나눠라.
`,
  homefeed: `
## 5. 형식 — 홈피드 노출 우선 (원문 형식보다 이 규칙이 위다)
- **제목과 글의 짜임은 이 글의 홈피드 규칙을 따른다. 원문 기사 제목·구성을 그대로 옮기지 마라.**
- 원문은 "무슨 일이 있었는지"를 알려주는 재료일 뿐이다. 형식까지 빌려오지 마라.
- 원본 길이에 맞출 의무는 없다. 홈피드 규칙이 요구하는 분량과 리듬을 따르라.
`,
  'traffic-hunter': `
## 5. 형식 — 유입 우선 (원문 형식보다 이 규칙이 위다)
- **제목과 글의 짜임은 이 모드의 규칙을 따른다. 원문 기사 제목을 그대로 옮기지 마라.**
- 원본 길이에 맞출 의무는 없다. 이 모드가 요구하는 분량과 리듬을 따르라.
`,
});

const URL_MODE_SHAPE_DEFAULT = `
## 5. 형식
- 분량 기준은 두지 않는다. 위 사실 목록을 다 담으면 그게 필요한 길이다(seo R0-5와 같은 계약).
  ⛔ 사실을 빠뜨린 채 짧게 끝내는 것도, 사실 없이 수식어로 늘리는 것도 똑같이 실패다.
- 문단은 짧게, 한 문장 30~70자, 소제목으로 호흡을 나눠라.
`;

const DIRECTIVE_FOOTER = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

export function shouldApplyUrlModeDirective(source: UrlModeDirectiveSource): boolean {
  const isUrlSourceMode = !!source.url || source.sourceType === 'naver_news' || source.sourceType === 'daum_news';
  return isUrlSourceMode && (source.rawText ?? '').length >= 200;
}

/** 모드별 형식 절. 알 수 없는 모드는 기존(원문 길이 추종) 동작을 유지한다. */
export function buildUrlModeShapeClause(contentMode?: string): string {
  const mode = String(contentMode || '').trim();
  return URL_MODE_SHAPE[mode] ?? URL_MODE_SHAPE_DEFAULT;
}

export function buildUrlModeDirective(source: UrlModeDirectiveSource): string {
  if (!shouldApplyUrlModeDirective(source)) return '';
  // [2026-08-26] "빠짐없이 포함하라"는 산문 한 줄로는 안 됐다(실측 보존율 17%).
  //   원본에서 뽑은 사실을 목록으로 박아 준다. 지시 바로 뒤에 와야 같이 읽힌다.
  const checklist = buildSourceFactChecklist(source.rawText).block;
  return URL_MODE_CORE
    + (checklist ? `
${checklist}
` : '')
    + buildUrlModeShapeClause(source.contentMode)
    + DIRECTIVE_FOOTER;
}
