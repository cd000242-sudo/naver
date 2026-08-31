/**
 * AI 경험 문장의 3요소 계약.
 *
 * 사장님 나이키 예시가 기준이다.
 *   남들 다 하는 말   "통풍 잘되고 가볍고 오래 달려도 괜찮다"
 *   값이 있는 문장    "내성발톱이 있어서 오래 못 뛰는데, 완전히 안 아픈 건 아니지만
 *                     다른 걸 신을 때에 비해서는 좀 낫더라"
 *
 * 뒷문장에는 셋이 있다 — 제약 / 유보 / 비교.
 * 이 셋을 강제하면 과장이 형태적으로 못 들어온다. "인생이 바뀌었다" 에는
 * 제약도 유보도 비교도 넣을 자리가 없다. 금지어 목록보다 튼튼한 이유가 그것이다.
 *
 * 경고만 낸다 — 발행을 막지 않는다.
 */

export const EXPERIENCE_CONTRACT_PARTS = ['constraint', 'reservation', 'comparison'] as const;

export type ExperienceContractPart = typeof EXPERIENCE_CONTRACT_PARTS[number];

export interface ExperienceSentenceCheck {
  ok: boolean;
  missing: ExperienceContractPart[];
}

export interface ExperienceViolation {
  sentence: string;
  missing: ExperienceContractPart[];
}

export interface ExperienceAudit {
  checked: number;
  violations: ExperienceViolation[];
  tooMany: boolean;
}

/**
 * 경험 문장이 글 전체에서 차지해도 되는 상한.
 *
 * 진짜 후기는 대부분 정보고 경험은 한두 줄 섞이는 정도다. 문단마다 경험이 나오면
 * 그 자체가 AI 티다 — human-writing-anti-pattern 이 "판단 1인칭은 2~4곳이면 충분하다" 고
 * 걸어둔 것과 같은 이유다.
 */
const MAX_EXPERIENCE_SENTENCES = 6;

/** ① 제약 — 남이 못 쓰는 조건. 신박함의 유일한 출처다. */
const CONSTRAINT = /(?:이라서|이라|라서|다\s*보니|편이라|편이고|있어서|있다\s*보니|없어서|없다\s*보니|때문에|탓에|한계|약한|예민한|좁[은아]|짧은|처음이라)/u;

/** ② 유보 — 좋기만 하면 광고다. 흠이 섞여야 사람이 쓴 문장으로 읽힌다. */
const RESERVATION = /(?:건\s*아니지만|건\s*아니고|건\s*아닌데|지는\s*않(?:지만|아도|은데|았지만)|않아도|아쉬운|아쉽|단점|불편|걸리는|한\s*건\s*아니|그럭저럭|견딜\s*만|무겁긴|아프긴|정도는\s*아니)/u;

/** ③ 비교 — 절대 단정이 아니라 상대 비교. 지어내기 어려운 형태다. */
const COMPARISON = /(?:보다는|보다\s|에\s*비해|비하면|비교하면|비교해\s*보면|전에\s*쓰던|이전\s*(?:모델|제품|것)|다른\s*(?:제품|것|걸|거)|덜\s|더\s*나[았은]|낫[다더]|나았)/u;

/**
 * 체험 표기 — 겪은 일로 읽히는 문장을 골라낸다.
 *
 * human-writing-anti-pattern 의 분류를 그대로 따른다: 판단 · 조사 · 정리 · 권유 · 전달은
 * 체험이 아니므로 검사 대상이 아니다. 직접 쓰고 · 가고 · 먹고 · 신어본 일만 본다.
 */
const FIRSTHAND = /(?:써\s*보|써봤|사용해\s*보|신어\s*보|신어봤|먹어\s*보|가\s*보|가봤|입어\s*보|발라\s*보|들어\s*보|겪|해\s*봤|해보니|써보니|살아\s*보|지내\s*보|주\s*(?:써|살아|지내)|개월\s*(?:써|살아|지내)|우리\s*집)/u;

function splitSentences(body: string): string[] {
  return body
    .split(/(?<=[.!?。])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 문장 하나가 3요소 계약을 지키는지 본다. */
export function checkExperienceSentence(sentence: string): ExperienceSentenceCheck {
  const text = String(sentence || '');
  const missing: ExperienceContractPart[] = [];
  if (!CONSTRAINT.test(text)) missing.push('constraint');
  if (!RESERVATION.test(text)) missing.push('reservation');
  if (!COMPARISON.test(text)) missing.push('comparison');
  return { ok: missing.length === 0, missing };
}

/** 문장이 체험 표기를 담고 있는지 — 계약 검사 대상인지 가른다. */
export function isFirsthandSentence(sentence: string): boolean {
  return FIRSTHAND.test(String(sentence || ''));
}

/** 본문 전체에서 체험 문장을 골라 계약 위반과 과다 사용을 함께 본다. */
export function auditExperienceSentences(body: string | undefined): ExperienceAudit {
  const text = String(body || '');
  if (!text.trim()) return { checked: 0, violations: [], tooMany: false };

  const firsthand = splitSentences(text).filter(isFirsthandSentence);
  const violations = firsthand
    .map((sentence) => ({ sentence, ...checkExperienceSentence(sentence) }))
    .filter((result) => !result.ok)
    .map(({ sentence, missing }) => ({ sentence, missing }));

  return {
    checked: firsthand.length,
    violations,
    tooMany: firsthand.length > MAX_EXPERIENCE_SENTENCES,
  };
}

const PART_LABEL: Record<ExperienceContractPart, string> = {
  constraint: '제약(남이 못 쓰는 내 조건)',
  reservation: '유보(완전히 좋지는 않다는 인정)',
  comparison: '비교(다른 것과 견준 상대 평가)',
};

/** 로그 한 줄로 읽히게 만든다 — 무엇이 빠졌는지 보이지 않으면 고칠 수 없다. */
export function describeExperienceAudit(audit: ExperienceAudit): string[] {
  const lines: string[] = [];
  if (audit.tooMany) {
    lines.push(`⚠️ 경험 문장 ${audit.checked}개 — 많을수록 지어낸 티가 납니다(권장 ${MAX_EXPERIENCE_SENTENCES}개 이하).`);
  }
  for (const violation of audit.violations) {
    const missing = violation.missing.map((part) => PART_LABEL[part]).join(' · ');
    lines.push(`⚠️ 경험 문장에 ${missing} 없음: "${violation.sentence.slice(0, 40)}…"`);
  }
  return lines;
}
