export interface UrlModeDirectiveSource {
  url?: string;
  sourceType?: string;
  rawText?: string | null;
}

const URL_MODE_DIRECTIVE = `[URL 원본 글 재구성 — 절대 준수 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

당신은 URL 원본 글을 기반으로 *훨씬 좋은 퀄리티의 블로그 글*을 작성한다.

## 1. 원본 100% 보존 (최우선)
- 원본의 모든 사실(fact), 숫자, 인명, 지명, 제품명, 인용문, 사례를 **빠짐없이** 포함하라.
- 원본에 등장하는 *모든 핵심 정보*는 결과 본문에 반드시 등장해야 한다.
- 정보를 *축약·요약·생략·뭉뚱그림* 하지 마라. 자세히 풀어 쓰는 방향으로만 가공하라.
- 결과 본문 길이는 원본의 85% 이상 (필요하면 *더 길게* 작성하되 부풀리지 말 것).

## 2. 퀄리티 업그레이드 (필수)
- 원본보다 *더 깊이 있게*: 맥락·배경·왜 그런지 한 단계 더 설명.
- 원본보다 *더 친절하게*: 어려운 개념은 일상 비유로 풀어줌.
- 원본보다 *더 읽기 좋게*: 문단 짧게, 한 문장 30~70자, 소제목으로 호흡 분리.
- 원본보다 *더 자연스럽게*: 기사체/보고체 제거, 블로거 본인이 직접 경험·관찰한 톤으로 변환.

## 3. 환각 절대 금지
- 원본에 *없는* 부정 키워드(폭로/논란/의혹/비판/위선/이중성 등) 추가 금지.
- 원본 인물·사건의 감정 방향(긍정/부정)을 *원본 그대로* 유지하라. 왜곡 금지.
- 원본에 없는 사실·수치·인용을 *지어내지* 마라. grounding 검색 결과도 원본과 충돌하면 원본 우선.

## 4. 자연어 가공 원칙
- 원본 문장을 그대로 베끼지 말되, 원본의 *모든 사실*은 그대로 보존하라.
- 본인이 직접 본 듯한 톤("솔직히", "막상", "개인적으로")으로 자연스럽게 풀어라.
- AI 보고체("알아보겠습니다", "살펴보겠습니다", "마치겠습니다") 절대 금지.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

export function shouldApplyUrlModeDirective(source: UrlModeDirectiveSource): boolean {
  const isUrlSourceMode = !!source.url || source.sourceType === 'naver_news' || source.sourceType === 'daum_news';
  return isUrlSourceMode && (source.rawText ?? '').length >= 200;
}

export function buildUrlModeDirective(source: UrlModeDirectiveSource): string {
  return shouldApplyUrlModeDirective(source) ? URL_MODE_DIRECTIVE : '';
}
