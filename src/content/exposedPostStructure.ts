// src/content/exposedPostStructure.ts
// 노출된 글에서 "구조"만 뽑아 프롬프트 지침으로 바꾼다.
//
// 왜 구조만인가: 문장·소재를 그대로 따라 쓰면 유사문서로 걸린다. 지금 겪는 문제가
// 정확히 노출·누락이라, 베끼기를 가능하게 만드는 순간 도구가 위험해진다.
// 그래서 이 모듈은 **숫자와 유형만** 내보낸다 — 원문 문장·고유명사·사실은 한 글자도
// 블록에 넣지 않는다. 베끼기가 설계상 불가능해야 안전하다.
//
// 실측 배경(2026-08-19): 홈판 발행글 30건의 문단 종결이 완결서술 91%·명사형 8% 였고
// 홈판 프롬프트가 요구하는 값(명사형 42%)과 정반대였다. 이런 축은 원문을 안 베껴도
// 배울 수 있다.

export interface PostStructureProfile {
  /** 제목 글자 수. */
  readonly titleLength: number;
  /** 제목이 취한 각도 — 내용이 아니라 형태만. */
  readonly titleAngle: 'question' | 'number' | 'reason' | 'comparison' | 'statement';
  /** 본문 글자 수(공백 포함). */
  readonly bodyLength: number;
  /** 문단 수. */
  readonly paragraphCount: number;
  /** 문단 길이 중앙값. */
  readonly medianParagraphLength: number;
  /** 문단 종결 형태 비율(%) — 합이 100이 되도록 반올림하지 않는다. */
  readonly endings: { closed: number; noun: number; punctuation: number };
  /** 소제목 수. */
  readonly headingCount: number;
  /** 소제목이 질문형인 비율(%). */
  readonly questionHeadingRatio: number;
  /** 이미지 수. */
  readonly imageCount: number;
  /** 소제목 하나당 이미지 수(소수 1자리). */
  readonly imagesPerHeading: number;
}

const CLOSED_ENDING = /(요|죠|다|까|네|군요|니다)$/;

/** 네이버 에디터는 문단을 zero-width space 로 끊는다. 없으면 빈 줄 기준으로 나눈다. */
export function splitParagraphs(body: string): string[] {
  const source = body.includes('​') ? body.split('​') : body.split(/\n\s*\n/);
  return source
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 8);
}

export function classifyEnding(paragraph: string): 'closed' | 'noun' | 'punctuation' {
  const t = paragraph.replace(/\s+$/, '');
  if (/[.…~!?]$/.test(t)) {
    return CLOSED_ENDING.test(t.replace(/[.…~!?]+$/, '')) ? 'closed' : 'punctuation';
  }
  return CLOSED_ENDING.test(t) ? 'closed' : 'noun';
}

export function classifyTitleAngle(title: string): PostStructureProfile['titleAngle'] {
  // 숫자는 날짜·나이처럼 부수적으로 섞이는 일이 잦다(예: "9월 출산 앞둔 … 들어간 이유").
  // 그래서 이유·비교를 먼저 보고, 남은 것만 숫자형으로 본다.
  if (/[?？]|일까|할까|why|뭐예요|무엇|어디|언제|누구/i.test(title)) return 'question';
  if (/이유|때문|배경|원인/.test(title)) return 'reason';
  if (/vs|비교|차이|보다|대신/i.test(title)) return 'comparison';
  if (/\d/.test(title)) return 'number';
  return 'statement';
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export interface StructureInput {
  readonly title: string;
  readonly body: string;
  readonly headings?: readonly string[];
  readonly imageCount?: number;
}

export function analyzePostStructure(input: StructureInput): PostStructureProfile {
  const title = String(input.title || '');
  const body = String(input.body || '');
  const paragraphs = splitParagraphs(body);
  const lengths = paragraphs.map((p) => p.length);

  const counts = { closed: 0, noun: 0, punctuation: 0 };
  for (const p of paragraphs) counts[classifyEnding(p)] += 1;

  const headings = (input.headings || []).map((h) => String(h || '').trim()).filter(Boolean);
  const questionHeadings = headings.filter((h) => /[?？]|일까|할까|무엇|어디|언제|누구|왜/.test(h)).length;
  const imageCount = Math.max(0, Math.floor(Number(input.imageCount) || 0));

  return {
    titleLength: title.length,
    titleAngle: classifyTitleAngle(title),
    bodyLength: body.length,
    paragraphCount: paragraphs.length,
    medianParagraphLength: median(lengths),
    endings: {
      closed: pct(counts.closed, paragraphs.length),
      noun: pct(counts.noun, paragraphs.length),
      punctuation: pct(counts.punctuation, paragraphs.length),
    },
    headingCount: headings.length,
    questionHeadingRatio: pct(questionHeadings, headings.length),
    imageCount,
    imagesPerHeading: headings.length ? Math.round((imageCount / headings.length) * 10) / 10 : 0,
  };
}

const ANGLE_LABEL: Record<PostStructureProfile['titleAngle'], string> = {
  question: '질문형',
  number: '숫자 제시형',
  reason: '이유 설명형',
  comparison: '비교형',
  statement: '단정 서술형',
};

/**
 * 프롬프트에 주입할 구조 지침. **숫자와 유형만** 들어간다.
 * 원문 문장·고유명사·사실은 넣지 않는다 — 넣는 순간 베끼기가 되고 유사문서로 걸린다.
 */
export function buildStructureGuideBlock(profile: PostStructureProfile): string {
  const e = profile.endings;
  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '📐 [노출된 글의 구조 — 형태만 참고]',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '아래는 실제로 노출된 글에서 뽑은 **구조 수치**다. 소재·문장·사실은 담겨 있지 않다.',
    '이 형태를 참고하되 **내용은 네가 받은 자료로만** 쓴다. 원문을 따라 쓰면 유사문서로 걸린다.',
    '',
    `- 제목: ${ANGLE_LABEL[profile.titleAngle]}, ${profile.titleLength}자 안팎`,
    `- 본문: ${profile.bodyLength.toLocaleString()}자 안팎`,
    `- 문단: ${profile.paragraphCount}개, 한 문단 ${profile.medianParagraphLength}자 안팎`,
    `- 문단 종결: 완결서술 ${e.closed}% / 명사형 ${e.noun}% / 구두점 ${e.punctuation}%`,
    `- 소제목: ${profile.headingCount}개${profile.headingCount ? `, 질문형 ${profile.questionHeadingRatio}%` : ''}`,
    profile.imageCount
      ? `- 이미지: ${profile.imageCount}장, 소제목당 ${profile.imagesPerHeading}장`
      : '- 이미지: 원문 기준 없음',
    '',
    '⛔ 원문의 문장·표현·고유명사를 가져오지 않는다. 위 수치는 리듬과 분량의 기준일 뿐이다.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}
