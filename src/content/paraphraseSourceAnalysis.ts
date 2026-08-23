/**
 * paraphraseSourceAnalysis.ts — stage 1 of the two-stage paraphrase pipeline.
 *
 * 페러프레이징의 원본은 이미 상위노출/홈판노출된 글이다. 그 글을 그대로 바꿔 쓰는 대신,
 * "왜 이게 떴는가"를 먼저 읽어내고 그 결과를 2단 작성의 재료로 넘긴다.
 *
 * 이 모듈은 순수하다 — 모델 호출은 주입받는다. 그래야 프롬프트/파싱 계약을 모델 없이 검증한다.
 * 분석은 보조 단계라 실패해도 예외를 던지지 않는다: 재료 없이 기존 경로로 계속 간다.
 */

export interface ParaphraseSourceAnalysis {
  /** 지나가던 사람이 이 글을 클릭한 단 하나의 이유. */
  clickReason: string;
  /** 원본이 실제로 노리는 메인키워드. 제목 첫 단어 추측을 대체한다. */
  mainKeyword: string;
  subKeywords: string[];
  /** 도입 → 전개 → 종결의 실제 흐름. */
  skeleton: string[];
  /** 홈판을 태운 관찰·경험 문장이 어디에 있는가. */
  experienceSignals: string[];
  /** 유지해야 할 숫자·날짜·고유명사. 여기 없는 사실은 2단에서 지어내면 안 된다. */
  evidenceAnchors: string[];
  /** 원본이 비운 곳 — 상위호환의 재료. */
  gaps: string[];
  /** 노출 근거 요약 한 문단. */
  exposureHypothesis: string;
}

/** JSON Schema for agent CLIs (codex/claude/gemini) that accept --output-schema. */
export const PARAPHRASE_ANALYSIS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'clickReason', 'mainKeyword', 'subKeywords', 'skeleton',
    'experienceSignals', 'evidenceAnchors', 'gaps', 'exposureHypothesis',
  ],
  properties: {
    clickReason: { type: 'string' },
    mainKeyword: { type: 'string' },
    subKeywords: { type: 'array', items: { type: 'string' } },
    skeleton: { type: 'array', items: { type: 'string' } },
    experienceSignals: { type: 'array', items: { type: 'string' } },
    evidenceAnchors: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    exposureHypothesis: { type: 'string' },
  },
};

export interface ParaphraseAnalysisInput {
  title: string;
  body: string;
  hashtags?: string;
}

/** 분석 입력 상한 — 원본이 길어도 비용과 지연을 묶어 둔다. */
const MAX_BODY_CHARS = 6_000;

export function buildParaphraseAnalysisPrompt(input: ParaphraseAnalysisInput): string {
  const body = String(input.body || '').slice(0, MAX_BODY_CHARS);
  return `아래는 네이버에서 이미 상위노출 또는 홈판노출된 블로그 글이다.
이 글이 왜 노출됐는지 분석하라. 글을 다시 쓰지 마라 — 분석만 한다.

【절대 규칙】
- 원본에 실제로 있는 것만 답한다. 없는 사실·숫자·발언을 지어내면 분석 전체가 무효다.
- 일반론("정보가 유용해서", "가독성이 좋아서") 금지. 이 글에서만 나오는 구체를 짚는다.
- 모든 값은 한국어로 쓴다. mainKeyword 는 검색창에 실제로 칠 법한 형태여야 한다.

【뽑을 것】
- clickReason: 이 제목이 클릭을 만든 단 하나의 이유 (한 문장)
- mainKeyword: 이 글이 노리는 검색 키워드 하나 (제목의 첫 단어가 아니라 실제 주제어)
- subKeywords: 본문에 실제로 깔린 연관 검색어 (최대 5개)
- skeleton: 도입부터 마무리까지 실제 전개 순서 (각 단계 한 줄, 최대 8개)
- experienceSignals: 글쓴이가 직접 보고 겪었음을 드러낸 문장 (원문 인용, 최대 5개)
- evidenceAnchors: 유지해야 할 숫자·날짜·기관명·고유명사 (최대 8개)
- gaps: 이 글이 다루지 않아 독자가 여전히 궁금할 지점 (최대 5개)
- exposureHypothesis: 노출 근거 요약 (2~3문장)

【원본】
제목: ${String(input.title || '').trim()}
${input.hashtags ? `해시태그: ${input.hashtags}\n` : ''}본문:
${body}

위 스키마의 JSON 객체 하나만 출력한다. 설명·머리말·코드펜스 금지.`;
}

function clampList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0 && item.length <= 400)
    .slice(0, limit);
}

function clampText(value: unknown, limit: number): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

/** 모델 출력은 신뢰 경계다 — 모양과 길이를 여기서 강제한다. */
export function normalizeParaphraseAnalysis(raw: unknown): ParaphraseSourceAnalysis | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;

  const analysis: ParaphraseSourceAnalysis = {
    clickReason: clampText(source.clickReason, 200),
    mainKeyword: clampText(source.mainKeyword, 40),
    subKeywords: clampList(source.subKeywords, 5),
    skeleton: clampList(source.skeleton, 8),
    experienceSignals: clampList(source.experienceSignals, 5),
    evidenceAnchors: clampList(source.evidenceAnchors, 8),
    gaps: clampList(source.gaps, 5),
    exposureHypothesis: clampText(source.exposureHypothesis, 600),
  };

  // 클릭 이유도 키워드도 못 뽑았으면 재료로서 가치가 없다.
  if (!analysis.clickReason && !analysis.mainKeyword) return null;
  return analysis;
}

/** 코드펜스로 감싸거나 앞뒤에 말을 붙인 응답에서 JSON 객체 하나를 건져낸다. */
export function extractAnalysisJson(text: string): unknown {
  const raw = String(text || '').trim();
  if (!raw) return undefined;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], raw].filter((value): value is string => !!value);
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // 다음 후보로 계속.
    }
  }
  return undefined;
}

/**
 * 2단 작성에 넘길 재료 브리프. 분석이 없으면 빈 문자열이라 기존 프롬프트가 그대로 나간다.
 */
export function buildParaphraseUpgradeBrief(analysis: ParaphraseSourceAnalysis | null): string {
  if (!analysis) return '';

  const lines: string[] = [
    '════════════════════════════════════════',
    '📊 원본 노출 분석 (1단계 결과 — 이 글이 왜 떴는가)',
    '════════════════════════════════════════',
  ];
  if (analysis.exposureHypothesis) lines.push(`[노출 근거] ${analysis.exposureHypothesis}`);
  if (analysis.clickReason) lines.push(`[원본 clickReason] ${analysis.clickReason}`);
  if (analysis.mainKeyword) lines.push(`[메인키워드] ${analysis.mainKeyword}`);
  if (analysis.subKeywords.length) lines.push(`[서브키워드] ${analysis.subKeywords.join(', ')}`);
  if (analysis.skeleton.length) {
    lines.push('[원본 전개 골격]');
    analysis.skeleton.forEach((step, index) => lines.push(`  ${index + 1}. ${step}`));
  }
  if (analysis.experienceSignals.length) {
    lines.push('[원본의 경험 신호 — 같은 밀도로 다시 만들되 문장은 새로 쓴다]');
    analysis.experienceSignals.forEach((signal) => lines.push(`  · ${signal}`));
  }
  if (analysis.evidenceAnchors.length) {
    lines.push(`[반드시 보존할 사실] ${analysis.evidenceAnchors.join(' / ')}`);
    lines.push('  ⚠️ 이 목록에 없는 숫자·날짜·발언을 새로 만들어내면 실패다.');
  }
  if (analysis.gaps.length) {
    lines.push('[상위호환 지점 — 원본이 비운 곳. 여기를 채워야 원본보다 낫다]');
    analysis.gaps.forEach((gap) => lines.push(`  · ${gap}`));
  }
  lines.push('');
  lines.push('[작성 지시] 원본의 노출 요인(clickReason·골격·경험 밀도·키워드 배치)은 유지하고,');
  lines.push('위 "상위호환 지점"을 실제 내용으로 채워 원본보다 한 겹 더 깊은 글을 쓴다.');
  lines.push('원본 문장을 재배열하는 수준이면 실패다.');

  return lines.join('\n');
}

export interface ParaphraseAnalysisDeps {
  /** 프롬프트를 넣고 원문 텍스트를 받는다. 실패 시 throw. */
  callModel: (prompt: string) => Promise<string>;
}

/**
 * 1단 분석 실행. 실패·형식 오류는 null 로 흡수한다 — 분석은 보조 단계이고,
 * 페러프레이징 자체가 이것 때문에 죽으면 안 된다.
 */
export async function analyzeParaphraseSource(
  deps: ParaphraseAnalysisDeps,
  input: ParaphraseAnalysisInput,
): Promise<ParaphraseSourceAnalysis | null> {
  if (!String(input.body || '').trim()) return null;
  try {
    const raw = await deps.callModel(buildParaphraseAnalysisPrompt(input));
    return normalizeParaphraseAnalysis(extractAnalysisJson(raw));
  } catch (error) {
    console.warn('[ParaphraseAnalysis] 1단 분석 실패 — 재료 없이 진행:', (error as Error)?.message);
    return null;
  }
}
