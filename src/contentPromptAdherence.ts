export type PromptAdherenceReport = {
  checked: boolean;
  passed: boolean;
  score: number;
  requiredTerms: string[];
  missingTerms: string[];
  forbiddenTerms: string[];
  foundForbiddenTerms: string[];
  missingFeatures: string[];
  issues: string[];
  retryInstruction: string;
};

type PromptAdherenceHeading = {
  title?: string;
  content?: string;
  body?: string;
  summary?: string;
};

type PromptAdherenceContent = {
  selectedTitle?: string;
  title?: string;
  introduction?: string;
  headings?: PromptAdherenceHeading[];
  conclusion?: string;
  bodyPlain?: string;
  bodyHtml?: string;
  hashtags?: string[];
};

type PromptAdherenceSource = {
  customPrompt?: string;
};

const PROMPT_ADHERENCE_STOPWORDS = new Set([
  '사용자', '추가', '지시사항', '프롬프트', '작성', '해주세요', '해줘', '합니다',
  '그리고', '그냥', '이렇게', '저렇게', '내용', '본문', '문장', '문단', '소제목',
  '제목', '글', '블로그', '정리', '중요', '핵심', '부분', '필수', '반드시',
  '포함', '강조', '언급', '사용', '금지', '제외', '삭제', '넣어', '빼고',
  'mobile', 'naver', 'blog', 'content', 'prompt',
]);

const PROMPT_REQUIRED_SIGNAL = /반드시|꼭|필수|포함|넣어|넣고|강조|언급|다뤄|다루|사용|주제|키워드|비교|정리|FAQ|Q&A|표|체크리스트|단계|절차/i;
const PROMPT_FORBIDDEN_SIGNAL = /금지|빼|제외|삭제|쓰지|사용하지|넣지|하지\s*말|하지마|없애|말고|제거/i;

function normalizePromptProbe(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\s"'`~!@#$%^&*()[\]{}|\\;:,.<>/?，。！？、·•\-_=+]+/g, '')
    .trim();
}

function splitPromptSentences(prompt: string): string[] {
  return String(prompt || '')
    .split(/[\r\n]+|(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

/*
 * [2026-09-12] 요청사항이 "정확히 반영되는가"의 뿌리는 대조 어휘를 어떻게 뽑느냐였다.
 * 실측으로 드러난 세 가지:
 *   1. 조사가 붙은 채 대조했다 — "체크리스트를" 은 본문의 "체크리스트" 와 안 맞아 멀쩡한 글도
 *      누락 판정을 받았다.
 *   2. 지시 동사를 요구 내용으로 착각했다 — "넣어주세요" · "써주세요" · "라는" 이 필수어가 됐다.
 *   3. 한 문장에 금지와 지시가 섞이면 문장 전체를 금지로 봤다 — "가격 비교는 빼고 사용 환경
 *      위주로" 에서 "환경" 이 금지어가 되어, 사장님이 요구한 바로 그것을 지우라고 재생성시켰다.
 */

/** 어절 끝의 조사·연결어미를 뗀다. 형태소 분석기 없이 대조 가능한 형태로만 맞춘다. */
const TRAILING_PARTICLES = /(?:이라는|라는|에서는|에서|으로는|으로|로는|로써|로서|로|께서|에게|한테|까지|부터|처럼|보다|마다|조차|밖에|이나|나마|이야|은|는|이|가|을|를|에|와|과|의|도|만|랑|이랑)$/;

const TRAILING_VERBAL = /(?:하고|하며|해서|하여|하거나|한\s*뒤|해두고|해\s*주고)$/;

function stripKoreanParticles(token: string): string {
  const cleaned = token.replace(/[.,!?·…]+$/, '').trim().replace(TRAILING_VERBAL, '');
  if (cleaned.length <= 1) return cleaned;
  const stripped = cleaned.replace(TRAILING_PARTICLES, '');
  // 조사를 떼고 한 글자만 남으면 대조어로 쓸 수 없다(글·표·답). 버린다 — "표" 같은 요구는
  // 어휘 대조가 아니라 구조 규칙(detectMissingPromptFeatures)이 본다.
  return stripped.length >= 2 ? stripped : '';
}

/** 요구 "내용"이 아니라 요구하는 "행위"를 가리키는 말. 대조 대상이 아니다. */
const INSTRUCTION_TOKEN = /^(?:넣|빼|쓰|써|해|하)?(?:주세요|주십시오|하세요|해줘|해주|바랍니다|바래요|부탁|합니다|하고|해서|하지|말고|말아|마세요|지마)$|(?:해\s*주세요|주세요|하세요|해줘|바랍니다|부탁드립니다)$/;

function isInstructionToken(token: string): boolean {
  return INSTRUCTION_TOKEN.test(token);
}

function extractPromptTokens(text: string): string[] {
  const matches = String(text || '').match(/[가-힣A-Za-z0-9][가-힣A-Za-z0-9+#._-]{1,}/g) || [];
  return matches
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#._-]+$/gu, '').trim())
    .filter((token) => token.length > 0 && !isInstructionToken(token))
    .map((token) => stripKoreanParticles(token))
    .filter((token) => {
      if (token.length < 2 || token.length > 32) return false;
      const key = token.toLowerCase();
      if (PROMPT_ADHERENCE_STOPWORDS.has(key) || PROMPT_ADHERENCE_STOPWORDS.has(token)) return false;
      if (/^\d+$/.test(token)) return false;
      if (isInstructionToken(token)) return false;
      return true;
    });
}

function uniquePromptTerms(terms: string[], maxCount: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    const normalized = normalizePromptProbe(term);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(term.trim());
    if (result.length >= maxCount) break;
  }
  return result;
}

function extractQuotedPromptTerms(prompt: string): string[] {
  const terms: string[] = [];
  const re = /["'“”‘’「」『』`]\s*([^"'“”‘’「」『』`]{2,60}?)\s*["'“”‘’「」『』`]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(prompt)) !== null) {
    const value = match[1]?.trim();
    if (value) terms.push(value);
  }
  return terms;
}

/*
 * 구조를 가리키는 낱말은 어휘로 대조하지 않는다 — 구조 규칙이 따로 본다.
 * 표를 실제로 넣은 글이 본문에 "비교표" 라고 적지 않았다는 이유로 누락 판정을 받던 자리다.
 */
const STRUCTURE_OWNED_TERMS = new Set([
  '비교표', '표', '테이블', '기준표', '체크리스트', '체크포인트', '확인목록',
  'faq', 'q&a', '문답', '단계', '순서', '절차', '주의사항',
]);

function isStructureOwnedTerm(term: string): boolean {
  return STRUCTURE_OWNED_TERMS.has(term.trim().toLowerCase().replace(/\s+/g, ''));
}

function extractRequiredPromptTerms(prompt: string): string[] {
  const scored = new Map<string, { term: string; score: number }>();
  const bump = (term: string, score: number) => {
    const normalized = normalizePromptProbe(term);
    if (!normalized) return;
    const previous = scored.get(normalized);
    scored.set(normalized, {
      term: previous?.term || term.trim(),
      score: (previous?.score || 0) + score,
    });
  };

  const quoted = extractQuotedPromptTerms(prompt);
  for (const term of quoted) bump(term, 5);

  for (const sentence of splitPromptSentences(prompt)) {
    if (!PROMPT_REQUIRED_SIGNAL.test(sentence)) continue;
    // 인용구가 있는 문장은 그 문구 자체가 요구다. 낱말로 쪼개면 "라는"·"자문" 같은 파편이
    // 따로 대조되어, 문구를 그대로 넣은 글도 누락 판정을 받는다.
    if (quoted.some((q) => sentence.includes(q))) continue;
    // 금지절은 요구에서 뺀다 — 같은 문장의 뒷절(지시)만 남긴다.
    const positive = PROMPT_FORBIDDEN_SIGNAL.test(sentence)
      ? sentence.slice(forbiddenClauseOf(sentence).length)
      : sentence;
    const sentenceScore = /반드시|꼭|필수/.test(sentence) ? 3 : 2;
    for (const token of extractPromptTokens(positive)) {
      bump(token, sentenceScore);
    }
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score || b.term.length - a.term.length)
    .map((item) => item.term)
    .filter((term) => !isStructureOwnedTerm(term))
    .slice(0, 14);
}

/*
 * 금지와 지시가 한 문장에 섞이면 앞절만 금지다.
 *   "가격 비교는 빼고 사용 환경 위주로 써주세요"
 *    └ 금지: 가격 비교          └ 지시: 사용 환경 위주
 * 예전에는 문장 전체를 금지로 봐서 "환경" 이 금지어가 됐고, 사장님이 요구한 바로 그것을
 * 지우라고 재생성시켰다.
 */
const FORBIDDEN_CLAUSE_BREAK = /빼고|빼 주고|말고|제외하고|제외한 뒤|삭제하고|없애고|지우고|쓰지\s*말고|하지\s*말고|대신에|대신/;

function forbiddenClauseOf(sentence: string): string {
  const match = FORBIDDEN_CLAUSE_BREAK.exec(sentence);
  if (!match || match.index <= 0) return sentence;
  return sentence.slice(0, match.index);
}

function extractForbiddenPromptTerms(prompt: string): string[] {
  const terms: string[] = [];
  for (const sentence of splitPromptSentences(prompt)) {
    if (!PROMPT_FORBIDDEN_SIGNAL.test(sentence)) continue;
    terms.push(...extractPromptTokens(forbiddenClauseOf(sentence)));
  }
  return uniquePromptTerms(terms, 12);
}

function generatedTextForPromptAdherence(content: PromptAdherenceContent): string {
  return [
    content.selectedTitle,
    content.title,
    content.introduction,
    ...(content.headings || []).flatMap((heading) => [
      heading?.title,
      heading?.content,
      heading?.body,
      heading?.summary,
    ]),
    content.conclusion,
    content.bodyPlain,
    content.bodyHtml,
    ...(content.hashtags || []),
  ].filter(Boolean).join('\n');
}

function hasPromptTerm(textProbe: string, term: string): boolean {
  const termProbe = normalizePromptProbe(term);
  if (!termProbe) return true;
  if (textProbe.includes(termProbe)) return true;

  const tokenParts = extractPromptTokens(term);
  if (tokenParts.length <= 1) return false;
  const matchedParts = tokenParts.filter((part) => textProbe.includes(normalizePromptProbe(part))).length;
  return matchedParts / tokenParts.length >= 0.7;
}

function detectMissingPromptFeatures(prompt: string, generatedText: string): string[] {
  const promptLower = prompt.toLowerCase();
  const text = generatedText;
  /*
   * [2026-09-12] 예전 규칙은 "표를 넣어달라" 는 요청에 본문의 '비교' 라는 낱말 하나만 있어도
   * 통과시켰다. 표도 체크리스트도 없는 글이 "구조 누락 없음" 으로 나갔다 — 요청이 반영됐는지
   * 재는 장치가 사실상 꺼져 있었다. 낱말이 아니라 **실제 구조**를 본다.
   */
  const lines = text.split(new RegExp('\\r?\\n'));
  const bulletCount = lines.filter((line) => /^\s*(?:[-*•·]|\d+[.)])\s+\S/.test(line)).length;
  const tableRowCount = lines.filter((line) => /^\s*\|.+\|\s*$/.test(line)).length;
  const questionCount = (text.match(new RegExp('[^\\n]{4,}\\?', 'g')) || []).length;

  const rules: Array<{ name: string; prompt: RegExp; satisfied: boolean }> = [
    {
      name: 'FAQ/Q&A',
      prompt: /faq|q&a|자주\s*묻|질문\s*답변|문답/i,
      // "Q1." "Q:" "Q)" 같은 표기 하나로도 문답 구조로 본다. 질문만 둘 이상이어도 된다.
      satisfied: questionCount >= 2 || new RegExp('\\bQ\\s*\\d*\\s*[.:)]').test(text),
    },
    {
      name: '비교표/표',
      prompt: /비교표|표\s*형식|표로|테이블|기준표/i,
      satisfied: tableRowCount >= 2,
    },
    {
      name: '체크리스트',
      prompt: /체크리스트|체크\s*포인트|확인\s*목록|준비물/i,
      satisfied: bulletCount >= 3 || /체크리스트/.test(text),
    },
    {
      name: '단계형 절차',
      prompt: /단계|순서|절차|방법\s*\d|step/i,
      satisfied: /\d\s*단계|첫째|둘째|①|②/.test(text) || bulletCount >= 3,
    },
    {
      name: '주의사항',
      prompt: /주의|유의|위험|피해야|하지\s*말/i,
      satisfied: /주의|유의|위험|피해야|확인해야|하지\s*말/.test(text),
    },
  ];

  return rules
    .filter((rule) => rule.prompt.test(promptLower) && !rule.satisfied)
    .map((rule) => rule.name);
}


function buildPromptAdherenceRetryInstruction(report: Omit<PromptAdherenceReport, 'retryInstruction'>): string {
  const lines = [
    '[PROMPT_ADHERENCE_REPAIR]',
    '- 이전 응답은 사용자 프롬프트를 충분히 반영하지 못했습니다.',
    '- 전체 글을 다시 쓰되, 아래 누락/위반 항목을 반드시 수정하세요.',
  ];
  if (report.missingTerms.length > 0) {
    lines.push(`- 반드시 반영할 핵심어/주제: ${report.missingTerms.slice(0, 10).join(', ')}`);
  }
  if (report.foundForbiddenTerms.length > 0) {
    lines.push(`- 본문에서 제거할 금지 요소: ${report.foundForbiddenTerms.slice(0, 8).join(', ')}`);
  }
  if (report.missingFeatures.length > 0) {
    lines.push(`- 반드시 추가할 구조 요소: ${report.missingFeatures.join(', ')}`);
  }
  lines.push('- 출력은 순수 JSON 하나만 반환하세요. 설명/마크다운/사과문은 금지입니다.');
  return `\n${lines.join('\n')}\n`;
}

export function assessCustomPromptAdherence(
  content: PromptAdherenceContent,
  source: PromptAdherenceSource,
): PromptAdherenceReport {
  const customPrompt = String(source.customPrompt || '').trim();
  if (!customPrompt) {
    return {
      checked: false,
      passed: true,
      score: 100,
      requiredTerms: [],
      missingTerms: [],
      forbiddenTerms: [],
      foundForbiddenTerms: [],
      missingFeatures: [],
      issues: [],
      retryInstruction: '',
    };
  }

  const generatedText = generatedTextForPromptAdherence(content);
  const generatedProbe = normalizePromptProbe(generatedText);
  const requiredTerms = extractRequiredPromptTerms(customPrompt);
  const forbiddenTerms = extractForbiddenPromptTerms(customPrompt);
  const missingTerms = requiredTerms.filter((term) => !hasPromptTerm(generatedProbe, term));
  const foundForbiddenTerms = forbiddenTerms.filter((term) => hasPromptTerm(generatedProbe, term));
  const missingFeatures = detectMissingPromptFeatures(customPrompt, generatedText);

  const requiredCoverage = requiredTerms.length === 0
    ? 1
    : (requiredTerms.length - missingTerms.length) / requiredTerms.length;
  const featurePenalty = missingFeatures.length * 15;
  const forbiddenPenalty = foundForbiddenTerms.length * 20;
  const score = Math.max(0, Math.round(requiredCoverage * 100 - featurePenalty - forbiddenPenalty));
  const minCoverage = requiredTerms.length >= 6 ? 0.5 : requiredTerms.length >= 3 ? 0.6 : 0.45;
  const issues: string[] = [];
  if (missingTerms.length > 0 && requiredCoverage < minCoverage) {
    issues.push(`사용자 프롬프트 핵심 반영 부족 (${Math.round(requiredCoverage * 100)}%)`);
  }
  if (foundForbiddenTerms.length > 0) {
    issues.push(`사용자 금지 요소 포함: ${foundForbiddenTerms.slice(0, 5).join(', ')}`);
  }
  if (missingFeatures.length > 0) {
    issues.push(`요청 구조 누락: ${missingFeatures.join(', ')}`);
  }

  const passed = issues.length === 0;
  const reportBase = {
    checked: true,
    passed,
    score,
    requiredTerms,
    missingTerms,
    forbiddenTerms,
    foundForbiddenTerms,
    missingFeatures,
    issues,
  };
  return {
    ...reportBase,
    retryInstruction: passed ? '' : buildPromptAdherenceRetryInstruction(reportBase),
  };
}
