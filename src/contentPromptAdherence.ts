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

function extractPromptTokens(text: string): string[] {
  const matches = String(text || '').match(/[가-힣A-Za-z0-9][가-힣A-Za-z0-9+#._-]{1,}/g) || [];
  return matches
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#._-]+$/gu, '').trim())
    .filter((token) => {
      if (token.length < 2 || token.length > 32) return false;
      const key = token.toLowerCase();
      if (PROMPT_ADHERENCE_STOPWORDS.has(key) || PROMPT_ADHERENCE_STOPWORDS.has(token)) return false;
      if (/^\d+$/.test(token)) return false;
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

  for (const term of extractQuotedPromptTerms(prompt)) bump(term, 5);

  for (const sentence of splitPromptSentences(prompt)) {
    if (!PROMPT_REQUIRED_SIGNAL.test(sentence)) continue;
    const sentenceScore = /반드시|꼭|필수/.test(sentence) ? 3 : 2;
    for (const token of extractPromptTokens(sentence)) {
      bump(token, sentenceScore);
    }
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score || b.term.length - a.term.length)
    .map((item) => item.term)
    .slice(0, 14);
}

function extractForbiddenPromptTerms(prompt: string): string[] {
  const terms: string[] = [];
  for (const sentence of splitPromptSentences(prompt)) {
    if (!PROMPT_FORBIDDEN_SIGNAL.test(sentence)) continue;
    terms.push(...extractPromptTokens(sentence));
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
  const rules: Array<{ name: string; prompt: RegExp; output: RegExp }> = [
    { name: 'FAQ/Q&A', prompt: /faq|q&a|자주\s*묻|질문\s*답변|문답/i, output: /faq|q\s*[:.]|질문|답변|자주\s*묻/i },
    { name: '비교표/표', prompt: /비교표|표\s*형식|테이블|항목\s*결과|기준표/i, output: /구분|항목|기준|비교|결과|장점|단점|체크/i },
    { name: '체크리스트', prompt: /체크리스트|체크\s*포인트|확인\s*목록/i, output: /체크|확인|점검|주의|포인트/i },
    { name: '단계형 절차', prompt: /단계|순서|절차|방법\s*\d|step/i, output: /1단계|2단계|첫째|둘째|먼저|다음|마지막|순서|절차/i },
    { name: '주의사항', prompt: /주의|유의|위험|피해야|하지\s*말/i, output: /주의|유의|위험|피해야|확인해야|하지\s*말/i },
  ];

  return rules
    .filter((rule) => rule.prompt.test(promptLower) && !rule.output.test(text))
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
