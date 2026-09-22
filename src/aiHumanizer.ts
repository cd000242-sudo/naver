/**
 * ✅ AI 글 탐지 회피 모듈 (Humanizer)
 *
 * AI가 생성한 콘텐츠를 사람이 작성한 것처럼 자연스럽게 변환한다.
 *
 * [2026-09-22 SPEC — 후처리 결정론화] 이전 버전은 무작위 함수 기반 동의어 치환·어미
 * 다양화(by chance)·감탄사/개인 표현 삽입·문장 무작위 분리를 사용했다. 이는 (1) 같은
 * 입력이 실행마다 다른 출력을 만들어 회귀 테스트를 불안정하게 했고, (2) "제 경험상"류
 * 삽입은 자료에 없는 1인칭 체험을 무작위로 만들어냈다("LLM이 작성한 좋은 결과를
 * 후처리기가 임의로 망가뜨리지 않는다" 원칙 위반). 이 버전은 무작위성을 전혀 쓰지
 * 않는다 — 같은 입력은 항상 같은 출력을 낸다.
 *
 * 강도(intensity):
 * - 'off'    : 입력을 그대로 반환.
 * - 'light'  : 안전한 결정론적 정리만 — 맞춤법 교정, 번역투 제거, 공백/중복 접속사 정리.
 * - 'medium' | 'strong' : light 전체 + 결정론적 AI 패턴 제거·반복 제거·문장 연결 보정.
 *   (기존 'strong'이 하던 무작위 변주는 전부 제거됐다 — 더 이상 light보다 "더 과감하게
 *   무작위로 바꾸는" 단계가 아니라, 안전 확정 변환을 더 많이 적용하는 단계다.)
 *
 * 보호 구간(protected spans): 숫자+단위, 날짜, 인용문("…"/'…'/「…」), 라틴 문자
 * 토큰(모델명 등), 그리고 옵션으로 넘긴 protectedTerms는 어떤 강도에서도 변형되지 않는다.
 */

// ✅ 한국어 자주 틀리는 맞춤법 교정 사전
const SPELLING_CORRECTIONS: Record<string, string> = {
  // 띄어쓰기 오류
  '할수있': '할 수 있',
  '할수없': '할 수 없',
  '할수도': '할 수도',
  '될수있': '될 수 있',
  '않을수': '않을 수',
  '있을수': '있을 수',
  '것같': '것 같',
  '때문에': '때문에',
  '만큼': ' 만큼',
  '처럼은': '처럼은',
  // 자주 틀리는 맞춤법
  '되요': '돼요',
  '됬': '됐',
  '됬어': '됐어',
  '됬습니': '됐습니',
  '안되': '안 돼',
  '안돼요': '안 돼요',
  '몇일': '며칠',
  '몇 일': '며칠',
  '왠지': '왠지', // 정확함
  '웬지': '왠지',
  '웬일': '웬일', // 정확함
  '왠일': '웬일',
  '어의없': '어이없',
  '어의가 없': '어이가 없',
  '금새': '금세',
  '금세말고': '금세 말고',
  '오랫만': '오랜만',
  '오랫동안': '오랫동안', // 정확함
  '설레임': '설렘',
  '어떻게': '어떻게', // 정확함
  '어떻해': '어떡해',
  '어떡게': '어떻게',
  '왠만하': '웬만하',
  '왠만해': '웬만해',
  '낳다': '낳다', // 출산
  '낫다': '낫다', // 치유/비교
  '함부러': '함부로',
  '조금씩': '조금씩', // 정확함
  '조금 식': '조금씩',
  '희안': '희한',
  '의외로': '의외로', // 정확함
  '이외로': '의외로',
  '바램': '바람',
  '알맞는': '알맞은',
  '틀리다': '틀리다', // 오답
  '다르다': '다르다', // 차이
  '다를수': '다를 수',
  '틀릴수': '틀릴 수',
  '곰곰히': '곰곰이',
  '꼼꼼히': '꼼꼼히', // 정확함
  '일일히': '일일이',
  '오랫 동안': '오랫동안',
  '빼곡히': '빼곡이',
  '대게': '대개', // 대부분
  '대계': '대개',
  '갈갈이': '갈갈이', // 정확함
  '구지': '굳이',
  '있슴': '있음',
  '없슴': '없음',
  '했슴': '했음',
  '됬음': '됐음',
  '거예요': '거예요', // 정확함
  '거에요': '거예요',
  '예요': '예요', // 정확함
  '에요': '에요', // 정확함 (받침 없을 때)
};

// ✅ AI 특유 패턴 제거 (완전 제거 대상) — 톤 공통, light/strong 공통
const AI_PATTERN_REMOVALS_COMMON: { pattern: RegExp; replacement: string }[] = [
  { pattern: /물론,?\s*/g, replacement: '' },
  { pattern: /제가 알기로는,?\s*/g, replacement: '' },
  { pattern: /다음과 같습니다[.:]?\s*/g, replacement: '' },
  { pattern: /요약하자면,?\s*/g, replacement: '' },
  { pattern: /결론적으로,?\s*/g, replacement: '결국 ' },
];

/**
 * [2026-09-22] "강조어" 삭제는 strong 전용으로 뺐다. 확실히/분명히/당연히/일반적으로/
 * 기본적으로/중요한 점은은 문장의 어조를 바꾸는 판단(강조 제거)이라, light(안전한 정리)
 * 범주를 벗어난다.
 */
const AI_PATTERN_REMOVALS_EMPHASIS_STRONG_ONLY: { pattern: RegExp; replacement: string }[] = [
  { pattern: /확실히,?\s*/g, replacement: '' },
  { pattern: /당연히,?\s*/g, replacement: '' },
  { pattern: /분명히,?\s*/g, replacement: '' },
  { pattern: /중요한 점은,?\s*/g, replacement: '' },
  { pattern: /기본적으로,?\s*/g, replacement: '' },
  // [2026-08-05] '일반적으로' → '보통' 은 base F3 금칙어 → F3 금칙어라 순수 손해다. 삭제만 한다.
  { pattern: /일반적으로,?\s*/g, replacement: '' },
];

// ✅ 구어체 전용 AI 패턴 제거 — professional/formal 톤에서는 스킵. light/strong 공통.
const AI_PATTERN_REMOVALS_CASUAL_ONLY: { pattern: RegExp; replacement: string }[] = [
  { pattern: /~것입니다\./g, replacement: '거예요.' },
  { pattern: /~입니다\./g, replacement: '예요.' },
  { pattern: /알려드리겠습니다/g, replacement: '알려드릴게요' },
  { pattern: /소개해드리겠습니다/g, replacement: '소개해드릴게요' },
  { pattern: /말씀드리겠습니다/g, replacement: '말씀드릴게요' },
  { pattern: /살펴보겠습니다/g, replacement: '살펴볼게요' },
  { pattern: /도움이 되셨으면 좋겠습니다/g, replacement: '도움이 됐으면 해요' },
];

// ✅ 개인적 표현 (AI가 잘 사용하지 않는 표현) — 탐지(analyzeAiDetectionRisk) 전용.
// [2026-09-22] 개인 표현 삽입 기능은 제거했다 — 무작위 함수 기반이었고,
// 자료에 없는 1인칭 체험을 무작위로 만들어내는 위험이 있었다. 탐지용으로만 남긴다.
const PERSONAL_EXPRESSIONS = [
  '제 기준으로는', '개인적으로', '결론부터 말하면', '제 경험상', '정리하면',
  '직접 해보니까', '알고 보니', '나중에 알았는데', '처음엔 몰랐는데',
  '찾아보니까', '핵심만 보면', '한 가지 분명한 건', '제가 느끼기엔',
];

// ✅ 문장 연결어 다양화 — strong 전용, 결정론적(항상 첫 번째 대안 선택)
const CONNECTORS: Record<string, string[]> = {
  '그리고': ['또', '게다가', '덧붙여', '더불어', '아울러', '그러면서'],
  '그러나': ['하지만', '근데', '다만', '반면', '그런데', '허나'],
  '그래서': ['따라서', '그러니까', '그러므로', '결국', '그래서인지'],
  '또한': ['더불어', '아울러', '함께', '마찬가지로', '이와 함께'],
  '특히': ['무엇보다', '그중에서도', '특별히', '유독', '더욱이'],
  '예를 들어': ['예컨대', '가령', '이를테면', '한 예로', '말하자면'],
  '즉': ['다시 말해', '바꿔 말하면', '풀어서 말하자면', '이는'],
};

// ✅ 불필요한 반복 패턴 (제거 대상)
const REPETITIVE_PATTERNS = [
  /(?:입니다\.\s*){2,}/g,
  /(?:합니다\.\s*){2,}/g,
  /(?:있습니다\.\s*){2,}/g,
  /(?:것입니다\.\s*){2,}/g,
  /(?:해요\.\s*){2,}/g,
  /(?:됩니다\.\s*){2,}/g,
  /(?:됐습니다\.\s*){2,}/g,
  /(?:했어요\.\s*){2,}/g,
  /(?:있어요\.\s*){2,}/g,
  /(?:돼요\.\s*){2,}/g,
];

// ✅ 번역투(Translationese) 제거 - 피동→능동 변환. light/strong 공통(의미 보존형).
const TRANSLATIONESE_FIXES: { pattern: RegExp; replacement: string }[] = [
  // "~에 의해 ~되다" 패턴 → 능동태
  { pattern: /(.+)에 의해 (.+)되었습니다/g, replacement: '$1이(가) $2했어요' },
  { pattern: /(.+)에 의해 (.+)됩니다/g, replacement: '$1이(가) $2해요' },
  { pattern: /(.+)에 의해 (.+)된/g, replacement: '$1이(가) $2한' },
  { pattern: /(.+)에 의해서/g, replacement: '$1 때문에' },
  // "~되어지다" 이중 피동 제거
  { pattern: /되어지고/g, replacement: '되고' },
  { pattern: /되어집니다/g, replacement: '돼요' },
  { pattern: /되어졌/g, replacement: '됐' },
  { pattern: /되어져/g, replacement: '돼' },
  { pattern: /되어질/g, replacement: '될' },
  // "~해지다" 불필요한 피동
  { pattern: /이루어지다/g, replacement: '이루다' },
  { pattern: /이루어집니다/g, replacement: '이뤄요' },
  { pattern: /이루어졌/g, replacement: '이뤘' },
  // "~가 ~된다" → "~가 ~한다"
  { pattern: /것으로 보여집니다/g, replacement: '것 같아요' },
  { pattern: /것으로 여겨집니다/g, replacement: '것 같아요' },
  { pattern: /것으로 생각됩니다/g, replacement: '것 같아요' },
  { pattern: /것으로 판단됩니다/g, replacement: '것 같아요' },
  // 기타 번역투
  { pattern: /~라고 할 수 있습니다/g, replacement: '예요' },
  { pattern: /라고 할 수 있어요/g, replacement: '예요' },
  { pattern: /라고 볼 수 있습니다/g, replacement: '이에요' },
  { pattern: /라고 볼 수 있어요/g, replacement: '이에요' },
  { pattern: /하는 것이 가능합니다/g, replacement: '할 수 있어요' },
  { pattern: /하는 것이 필요합니다/g, replacement: '해야 해요' },
  { pattern: /하는 것이 좋습니다/g, replacement: '하면 좋아요' },
  { pattern: /하는 것을 추천합니다/g, replacement: '하는 게 좋아요' },
];

// ✅ 연속 어미 다양화 (로봇 말투 방지) — strong 전용, 결정론적(항상 첫 번째 대안)
const ENDING_VARIATIONS: Record<string, string[]> = {
  '했어요': ['했죠', '했네요', '한 거예요', '했습니다'],
  '됐어요': ['됐죠', '됐네요', '된 거예요', '됐습니다'],
  '있어요': ['있죠', '있네요', '있는 거예요', '있습니다'],
  '해요': ['하죠', '하네요', '하는 거예요', '합니다'],
  '돼요': ['되죠', '되네요', '되는 거예요', '됩니다'],
  '봐요': ['보죠', '보네요', '보는 거예요', '봅니다'],
  '줘요': ['주죠', '주네요', '주는 거예요', '줍니다'],
  '나요': ['나죠', '나네요', '나는 거예요', '납니다'],
  '가요': ['가죠', '가네요', '가는 거예요', '갑니다'],
};

// ✅ 격식체 전용 연속 어미 다양화 매핑
const FORMAL_ENDING_VARIATIONS: Record<string, string[]> = {
  '합니다': ['하겠습니다', '한 바 있습니다', '하는 것입니다'],
  '입니다': ['이겠습니다', '인 것입니다', '인 셈입니다'],
  '됩니다': ['되겠습니다', '되는 것입니다', '된 바 있습니다'],
  '있습니다': ['있겠습니다', '있는 것입니다', '있는 셈입니다'],
  '없습니다': ['없겠습니다', '없는 것입니다', '없는 셈입니다'],
  '했습니다': ['한 바 있습니다', '하였습니다', '하게 됐습니다'],
  '됐습니다': ['된 바 있습니다', '되었습니다', '되어 있습니다'],
};

// ✅ 로그 중복 방지 플래그
let _humanizerLogShown = false;

export type HumanizeIntensity = 'off' | 'light' | 'medium' | 'strong';

export interface HumanizeChange {
  kind: string;
  before: string;
  after: string;
}

export interface HumanizeReport {
  intensity: HumanizeIntensity;
  changes: HumanizeChange[];
}

let _lastHumanizeReport: HumanizeReport = { intensity: 'off', changes: [] };

/** Returns the report generated by the most recent humanizeContent/humanizeContentWithReport call. */
export function getLastHumanizeReport(): HumanizeReport {
  return _lastHumanizeReport;
}

// ────────────────────────────────────────────────────────────
// Protected spans — numbers+units, dates, quotes, Latin tokens, and caller-supplied
// terms are shielded before any transform runs and restored verbatim afterward.
// ────────────────────────────────────────────────────────────

// [Bugfix] Each of these used to be applied in its own sequential .replace() pass — by the
// time LATIN_TOKEN_RE ran, earlier passes had already inserted placeholder tokens like
// "⟦PROT0⟧", and LATIN_TOKEN_RE (any Latin letter run) matched "PROT0" *inside its own
// placeholder marker* and re-shielded it, corrupting the token so restore() left a literal
// "⟦PROT0⟧" in the output. Fixed by building ONE alternation and replacing in a single pass
// over the original text, so no pattern ever sees a placeholder that isn't real content.
const QUOTE_SRC = '"[^"\\n]*"|\'[^\'\\n]*\'|「[^」\\n]*」';
const DATE_SRC = '\\d{4}\\s*년\\s*\\d{1,2}\\s*월\\s*\\d{1,2}\\s*일|\\d{1,2}\\s*월\\s*\\d{1,2}\\s*일';
const NUMBER_UNIT_SRC =
  '[0-9][0-9,]*(?:\\.[0-9]+)?\\s*(?:%|원|만원|억원|억|개월|주년|주|일|월|년|시간|분|초|회|배|kg|g|mg|cm|mm|km|m|평|가지|건|명|개|층|호|인치|리터|L|ml)';
const LATIN_TOKEN_SRC = '[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shieldProtectedSpans(
  text: string,
  protectedTerms: string[] = [],
): { shielded: string; restore: (s: string) => string } {
  const stash: string[] = [];
  const termSrcs = protectedTerms.filter((t) => t && t.trim()).map((t) => escapeRegExp(t.trim()));
  // Order matters: quotes first (swallow any numbers/dates inside as one unit), then
  // caller-supplied terms, then dates, numbers+units, and finally bare Latin tokens.
  const combined = new RegExp(
    [QUOTE_SRC, ...termSrcs, DATE_SRC, NUMBER_UNIT_SRC, LATIN_TOKEN_SRC].join('|'),
    'gi',
  );

  const shielded = text.replace(combined, (m) => {
    stash.push(m);
    return `⟦PROT${stash.length - 1}⟧`;
  });

  const restore = (s: string): string =>
    s.replace(/⟦PROT(\d+)⟧/g, (token, idx) => stash[Number(idx)] ?? token);

  return { shielded, restore };
}

/**
 * ✅ 메인 AI 회피 함수 (Humanize)
 *
 * 결정론적 함수다 — 같은 입력(content, intensity, silent, toneStyle, options)은 항상
 * 같은 출력을 낸다. 무작위 함수를 전혀 사용하지 않는다.
 *
 * @param options.protectedTerms 보호할 고유명사/용어 목록 — 이 문자열은 절대 변형되지 않는다.
 */
export function humanizeContent(
  content: string,
  intensity: HumanizeIntensity = 'light',
  silent: boolean = false,
  toneStyle?: string,
  options?: { protectedTerms?: string[] },
): string {
  const { text } = humanizeContentWithReport(content, intensity, { silent, toneStyle, protectedTerms: options?.protectedTerms });
  return text;
}

/** Same as humanizeContent but also returns a report of what changed at each step. */
export function humanizeContentWithReport(
  content: string,
  intensity: HumanizeIntensity = 'light',
  options?: { silent?: boolean; toneStyle?: string; protectedTerms?: string[] },
): { text: string; report: HumanizeReport } {
  const silent = options?.silent ?? false;
  const toneStyle = options?.toneStyle;
  const changes: HumanizeChange[] = [];

  if (!content) {
    const report: HumanizeReport = { intensity, changes };
    _lastHumanizeReport = report;
    return { text: content, report };
  }

  if (intensity === 'off') {
    const report: HumanizeReport = { intensity, changes };
    _lastHumanizeReport = report;
    return { text: content, report };
  }

  const isFormalTone = toneStyle === 'professional' || toneStyle === 'formal' || toneStyle === 'expert_review' || toneStyle === 'calm_info';

  if (!silent && !_humanizerLogShown) {
    console.log(`[Humanizer] 🚀 결정론적 정리 시작 (강도: ${intensity}, 톤: ${toneStyle || '미지정'}${isFormalTone ? ' → 격식체 보호 모드' : ''})`);
    _humanizerLogShown = true;
  }

  const step = (kind: string, current: string, fn: (s: string) => string): string => {
    const next = fn(current);
    if (next !== current) changes.push({ kind, before: current, after: next });
    return next;
  };

  // [2026-06-12 S18-3] Markdown table rows must survive humanization.
  const shieldedTables: string[] = [];
  let result = content.replace(/^[ \t]*\|.*\|[ \t]*$/gm, (line) => {
    shieldedTables.push(line);
    return `⟦TBL${shieldedTables.length - 1}⟧`;
  });

  // Protected spans (numbers+units, dates, quotes, Latin/model-name tokens, caller terms).
  const { shielded, restore: restoreProtected } = shieldProtectedSpans(result, options?.protectedTerms);
  result = shielded;

  // 0. 한국어 맞춤법 교정 (모든 강도 공통)
  result = step('spelling', result, correctSpelling);

  // 1. AI 특유 패턴 제거 (light: 공통+구어체 / strong: + 강조어 제거)
  result = step('ai-patterns', result, (s) => removeAiPatterns(s, isFormalTone, intensity));

  // 2. 번역투(피동→능동) 변환 (의미 보존형 — 모든 강도 공통)
  result = step('translationese', result, (s) => removeTranslationese(s, isFormalTone));

  // 3. 공백/중복 접속사 등 기본 정리 (모든 강도 공통)
  result = step('whitespace-cleanup', result, lightCleanup);

  if (intensity === 'medium' || intensity === 'strong') {
    // 4. 반복 패턴 제거
    result = step('repetitive-patterns', result, removeRepetitivePatterns);

    // 5. 출처 인용 반복 패턴 제거 ("참고 자료를 보면" 류, 2번째 등장부터)
    result = step('dedupe-citations', result, deduplicateSourceCitations);

    // 6. 선언형 단독 문장 보정 ("이 지점이 중요합니다" 류)
    result = step('soften-declarative', result, (s) => softenDeclarativeSentences(s, isFormalTone));

    // 7. 연속 독립 문장 연결 (연결어 없이 3문장 이상 나열 방지) — 결정론적 연결어 선택
    result = step('connect-isolated', result, (s) => connectIsolatedSentences(s, isFormalTone));

    // 8. 연속 어미 다양화 (로봇 말투 방지) — 결정론적 첫 대안 선택
    result = step('diversify-consecutive-endings', result, (s) => diversifyConsecutiveEndings(s, isFormalTone));

    // 9. 연결어 다양화 — 결정론적 첫 대안 선택
    result = step('diversify-connectors', result, diversifyConnectors);
  }

  // Restore protected spans, then shielded table rows.
  result = restoreProtected(result);
  if (shieldedTables.length > 0) {
    result = result.replace(/⟦TBL(\d+)⟧/g, (token, idx) => {
      const original = shieldedTables[Number(idx)];
      return original !== undefined ? original : token;
    });
  }

  const report: HumanizeReport = { intensity, changes };
  _lastHumanizeReport = report;
  return { text: result, report };
}

/**
 * ✅ Humanizer 로그 플래그 리셋
 */
export function resetHumanizerLog(): void {
  _humanizerLogShown = false;
}

/**
 * ✅ light 강도 전용 안전 정리 — 의미를 바꾸지 않는 공백/중복 접속사 정돈만 한다.
 */
function lightCleanup(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/(그리고|그러나|하지만|그래서|또한)\s+\1\b/g, '$1')
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * ✅ 번역투(Translationese) 제거 - 피동→능동 변환
 */
function removeTranslationese(text: string, isFormalTone: boolean = false): string {
  let result = text;
  let fixes = 0;

  for (const { pattern, replacement } of TRANSLATIONESE_FIXES) {
    // ✅ 격식체 보호: professional/formal 톤에서 격식→구어 변환 스킵
    if (isFormalTone) {
      const repStr = String(replacement);
      if (repStr.includes('것 같아요') || repStr.includes('예요') ||
          repStr.includes('해요') || repStr.includes('했어요') ||
          repStr.includes('할 수 있어요') || repStr.includes('해야 해요') ||
          repStr.includes('하면 좋아요') || repStr.includes('하는 게 좋아요') ||
          repStr.includes('돼요') || repStr.includes('이뤄요')) {
        continue;
      }
    }
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) fixes++;
  }

  if (fixes > 0) {
    console.log(`[Humanizer] 번역투 제거: ${fixes}개${isFormalTone ? ' (격식체 보호 모드)' : ''}`);
  }
  return result;
}

/**
 * ✅ 연속 어미 다양화 (로봇 말투 방지) — 결정론적: 항상 목록의 첫 대안을 선택한다.
 * "~해요. ~해요. ~해요." → "~해요. ~하죠. ~하죠."
 */
function diversifyConsecutiveEndings(text: string, isFormalTone: boolean = false): string {
  return transformPreservingNewlines(text, (segment) => diversifyConsecutiveEndingsSegment(segment, isFormalTone));
}

function diversifyConsecutiveEndingsSegment(text: string, isFormalTone: boolean = false): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let changes = 0;

  const variationMap = isFormalTone ? FORMAL_ENDING_VARIATIONS : ENDING_VARIATIONS;

  for (let i = 1; i < sentences.length; i++) {
    const prevSentence = sentences[i - 1];
    const currSentence = sentences[i];

    for (const [ending, variations] of Object.entries(variationMap)) {
      if (prevSentence.endsWith(ending + '.') && currSentence.endsWith(ending + '.')) {
        const variation = variations[0];
        sentences[i] = currSentence.slice(0, -ending.length - 1) + variation + '.';
        changes++;
        break;
      }
    }
  }

  if (changes > 0) {
    console.log(`[Humanizer] 연속 어미 다양화: ${changes}개${isFormalTone ? ' (격식체 모드)' : ''}`);
  }

  return sentences.join(' ');
}

/**
 * ✅ 한국어 맞춤법 교정
 */
function correctSpelling(text: string): string {
  let result = text;
  let corrections = 0;

  for (const [wrong, correct] of Object.entries(SPELLING_CORRECTIONS)) {
    if (result.includes(wrong) && wrong !== correct) {
      const before = result;
      result = result.split(wrong).join(correct);
      if (result !== before) corrections++;
    }
  }

  if (corrections > 0) {
    console.log(`[Humanizer] 맞춤법 교정: ${corrections}개`);
  }
  return result;
}

/**
 * ✅ AI 특유 패턴 완전 제거
 */
function removeAiPatterns(text: string, isFormalTone: boolean, intensity: HumanizeIntensity): string {
  let result = text;
  let removals = 0;

  for (const { pattern, replacement } of AI_PATTERN_REMOVALS_COMMON) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) removals++;
  }

  if (intensity === 'medium' || intensity === 'strong') {
    for (const { pattern, replacement } of AI_PATTERN_REMOVALS_EMPHASIS_STRONG_ONLY) {
      const before = result;
      result = result.replace(pattern, replacement);
      if (result !== before) removals++;
    }
  }

  // ✅ 구어체 전용 변환 — 격식체 톤에서는 스킵 (STYLE OVERRIDE 보호)
  if (!isFormalTone) {
    for (const { pattern, replacement } of AI_PATTERN_REMOVALS_CASUAL_ONLY) {
      const before = result;
      result = result.replace(pattern, replacement);
      if (result !== before) removals++;
    }
  }

  if (removals > 0) {
    console.log(`[Humanizer] AI 패턴 제거: ${removals}개${isFormalTone ? ' (격식체 보호 모드)' : ''}`);
  }
  return result;
}

/**
 * 반복 패턴 제거
 */
function removeRepetitivePatterns(text: string): string {
  let result = text;

  for (const pattern of REPETITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      const first = match.split(/\.\s*/)[0];
      return first + '. ';
    });
  }

  return result;
}

/**
 * [v2.11.134] Sentence-level rewriters below used to split the WHOLE text and
 * join(' '), flattening every \n / \n\n. Paragraph structure is both a strong
 * human signal and the mobile 1-line-per-paragraph publishing format, so the
 * transforms now run per line/paragraph segment and newline runs survive.
 */
function transformPreservingNewlines(text: string, transform: (segment: string) => string): string {
  return text
    .split(/(\n+)/)
    .map((segment) => (segment.includes('\n') || !segment.trim() ? segment : transform(segment)))
    .join('');
}

/**
 * 연결어 다양화 — 결정론적: 항상 목록의 첫 대안을 선택한다.
 */
function diversifyConnectors(text: string): string {
  let result = text;
  let changeCount = 0;

  for (const [original, alternatives] of Object.entries(CONNECTORS)) {
    const regex = new RegExp(`(^|[.!?]\\s+)${original}`, 'g');
    let isFirst = true;

    result = result.replace(regex, (match, prefix) => {
      // 첫 번째는 유지, 이후는 변환
      if (isFirst) {
        isFirst = false;
        return match;
      }
      const alt = alternatives[0];
      changeCount++;
      return prefix + alt;
    });
  }

  if (changeCount > 0) {
    console.log(`[Humanizer] 연결어 변환: ${changeCount}개`);
  }
  return result;
}

/**
 * ✅ [끝판왕 3.5] 출처 인용 반복 패턴 제거
 * "참고 자료를 보면", "자료에 따르면" 등이 2회 이상 등장하면 2번째부터 제거한다.
 */
function deduplicateSourceCitations(text: string): string {
  const citationPatterns: RegExp[] = [
    /참고\s*자료를\s*보면/g,
    /자료에\s*따르면/g,
    /여러\s*(?:참고\s*)?자료(?:들)?(?:을|는|에서)/g,
    /연구\s*결과에\s*따르면/g,
  ];

  let result = text;
  let changes = 0;

  for (const pattern of citationPatterns) {
    let matchCount = 0;
    result = result.replace(pattern, (match) => {
      matchCount++;
      if (matchCount === 1) return match; // 첫 번째는 유지
      changes++;
      return ''; // 2번째부터 완전 제거(사실 바로 진술)
    });
  }

  if (changes > 0) {
    console.log(`[Humanizer] 출처 인용 반복 제거: ${changes}개`);
  }
  return result;
}

/**
 * ✅ [끝판왕 3.6] 선언형 단독 문장 보정
 * "이 지점이 중요합니다.", "이 부분이 핵심입니다." 등 맥락 없이 단독으로 존재하는
 * 선언형 문장을 더 자연스럽게 바꾼다(구어체 한정 — 격식체는 원문 유지).
 */
function softenDeclarativeSentences(text: string, isFormalTone: boolean = false): string {
  const declarativePatterns = [
    /이\s*지점이\s*(중요|핵심|필수)[^.]*\./g,
    /이\s*부분이\s*(중요|핵심|필수|관건)[^.]*\./g,
    /이\s*차이를\s*함께\s*봐야[^.]*\./g,
    /이것이?\s*(중요|핵심|필수)[^.]*\./g,
    /이\s*사실이\s*(중요|핵심)[^.]*\./g,
    /이\s*점을\s*꼭\s*기억[^.]*\./g,
  ];

  let result = text;
  let changes = 0;

  for (const pattern of declarativePatterns) {
    result = result.replace(pattern, (match) => {
      if (isFormalTone) {
        // [2026-08-05] 격식체 완화어는 base R0-8/B1 블랙리스트에 걸린 적이 있어 원문을 유지한다.
        return match;
      }
      changes++;
      return match
        .replace('이 지점이 중요합니다', '왜 중요하냐면')
        .replace('이 부분이 핵심입니다', '핵심은 바로')
        .replace('이 부분이 중요합니다', '중요한 건')
        .replace('이것이 중요합니다', '중요한 건')
        .replace('이 차이를 함께 봐야 합니다', '이 차이를 알면')
        .replace('이 점을 꼭 기억해야 합니다', '꼭 기억할 건');
    });
  }

  if (changes > 0) {
    console.log(`[Humanizer] 선언형 문장 보정: ${changes}개`);
  }
  return result;
}

/**
 * ✅ [끝판왕 3.7] 연속 독립 문장 연결 — 결정론적: 항상 목록의 첫 연결어를 사용한다.
 * 연결어 없이 3개 이상 독립적으로 나열된 문장을 탐지하여 연결어를 삽입한다.
 */
function connectIsolatedSentences(text: string, isFormalTone: boolean = false): string {
  return transformPreservingNewlines(text, (segment) => connectIsolatedSentencesSegment(segment, isFormalTone));
}

function connectIsolatedSentencesSegment(text: string, isFormalTone: boolean = false): string {
  const formalConnectors = ['이에 따라 ', '이를 바탕으로 보면 ', '이러한 맥락에서 ', '한편 ', '다만 ', '아울러 '];
  // [2026-08-05] '알고 보니 ' 는 근거 없는 1인칭 발견 주장이라 뺐다.
  const casualConnectors = ['그래서 ', '근데 ', '그러니까 ', '사실 ', '그런데 '];

  const connectors = isFormalTone ? formalConnectors : casualConnectors;

  const hasConnector = /^(그래서|근데|그런데|하지만|그러나|따라서|한편|다만|그리고|또한|그러므로|이에|아울러|더불어|반면|그렇지만|또|게다가|이를|이러한|알고 보니|사실|왜냐하면|물론|실제로)/;

  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length < 3) return text;

  let isolatedCount = 0;
  let changes = 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].trim();
    if (!s) continue;

    if (hasConnector.test(s)) {
      isolatedCount = 0;
    } else {
      isolatedCount++;
    }

    if (isolatedCount >= 3 && !hasConnector.test(s)) {
      const connector = connectors[0];
      sentences[i] = connector + s;
      changes++;
      isolatedCount = 0;
    }
  }

  if (changes > 0) {
    console.log(`[Humanizer] 독립 문장 연결: ${changes}개${isFormalTone ? ' (격식체)' : ''}`);
  }
  return sentences.join(' ');
}

/**
 * ✅ HTML 콘텐츠용 AI 회피 처리 (네이버 블로그는 위지윅 에디터라 불필요 - 바로 반환)
 */
export function humanizeHtmlContent(html: string, _intensity: HumanizeIntensity = 'light'): string {
  // ✅ 네이버 블로그는 HTML이 아닌 위지윅 에디터를 사용하므로 불필요
  // 성능 향상을 위해 즉시 반환
  return html;
}

/**
 * ✅ AI 탐지 위험도 분석
 */
export function analyzeAiDetectionRisk(text: string): {
  score: number;  // 0-100 (높을수록 AI로 탐지될 확률 높음)
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // 1. 반복 패턴 체크
  for (const pattern of REPETITIVE_PATTERNS) {
    if (pattern.test(text)) {
      score += 10;
      issues.push('반복적인 문장 패턴 감지');
    }
  }

  // 2. 문장 끝 패턴 분석 (너무 일관적이면 AI 의심)
  const endings = text.match(/[가-힣]+니다\.|[가-힣]+요\.|[가-힣]+죠\./g) || [];
  const formalEndings = endings.filter(e => e.includes('니다')).length;

  if (endings.length > 10) {
    const formalRatio = formalEndings / endings.length;
    if (formalRatio > 0.9 || formalRatio < 0.1) {
      score += 15;
      issues.push('문장 끝이 너무 일관적임');
      suggestions.push('formal/casual 혼합 사용 권장');
    }
  }

  // 3. 개인적 표현 부족
  const hasPersonal = PERSONAL_EXPRESSIONS.some(exp => text.includes(exp));
  if (!hasPersonal && text.length > 500) {
    score += 10;
    issues.push('개인적 표현 부족');
    suggestions.push('개인 경험담이나 의견 추가 권장');
  }

  // 4. 문장 길이 균일성 체크
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 0);
  if (sentences.length > 5) {
    const lengths = sentences.map(s => s.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < avg * 0.2) {
      score += 15;
      issues.push('문장 길이가 너무 균일함');
      suggestions.push('짧은 문장과 긴 문장을 섞어 사용');
    }
  }

  // 5. 특정 AI 패턴 감지
  const aiPatterns = [
    /제가 알기로는/g,
    /다음과 같습니다/g,
    /요약하자면/g,
    /중요한 점은/g,
    /결론적으로/g,
  ];

  let aiPatternCount = 0;
  for (const pattern of aiPatterns) {
    const matches = text.match(pattern);
    if (matches) aiPatternCount += matches.length;
  }

  if (aiPatternCount > 3) {
    score += 20;
    issues.push('AI 특유의 표현 패턴 감지');
    suggestions.push('자연스러운 표현으로 대체 권장');
  }

  // 6. ✅ [2026-05-31 자체검증] 길이 무관 AI 클리셰 — 도입/진행/결론 클리셰는 글 길이와
  //   무관하게 강한 AI 신호다(기존 1~5번은 긴 글 위주라 짧은 AI글을 0점으로 놓쳤음).
  const lengthIndependentCliches = [
    '안녕하세요', '오늘은', '이번 글에서는', '이 글에서는', '이번 포스팅',
    '알아보겠습니다', '살펴보겠습니다', '소개해드리', '소개해 드리', '안내해드리',
    '종합적으로', '많은 분들이', '결론적으로 말하자면', '말씀드리겠습니다', '아래와 같이',
  ];
  let clicheHit = 0;
  for (const c of lengthIndependentCliches) {
    if (text.includes(c)) clicheHit += 1;
  }
  if (clicheHit >= 1) {
    score += Math.min(30, clicheHit * 10);
    issues.push(`AI 도입/진행/결론 클리셰 ${clicheHit}종 — 길이 무관 AI 신호`);
    suggestions.push('클리셰 삭제 후 1인칭 경험으로 시작');
  }

  // 점수 정규화 (0-100)
  score = Math.min(100, score);

  return {
    score,
    issues,
    suggestions,
  };
}
