import { META_CRITIQUE_PHRASES } from './content/forbiddenPhrases.js';

type SanitizableHeading = {
  title?: string;
  body?: string;
  content?: string;
};

type SanitizableContent = {
  selectedTitle?: string;
  title?: string;
  content?: string;
  introduction?: string;
  conclusion?: string;
  bodyPlain?: string;
  bodyHtml?: string;
  headings?: SanitizableHeading[];
};

/**
 * Removes fake source phrases that LLMs tend to hallucinate into generated posts.
 */
export function stripFakeSourcePhrases(text: string): string {
  if (!text) return text;
  let out = text;

  const PREFIX = '(?:(?:본|위|해당|공식|이|그|저|한|일부)\\s+)?';
  const STRONG = '원문|원본|기사|보도|외신|영상|유튜브|동영상|클립|쇼츠|숏츠|논문|취재';

  const strongPatternsEmpty: RegExp[] = [
    new RegExp(
      `${PREFIX}(?:${STRONG})\\s*에(?:서[는도]?|선)(?:\\s*(?:확인|보면|나오|소개|다루|언급|등장|말하|전하)\\S*)?\\s*[,，]?\\s*`,
      'g',
    ),
    new RegExp(`${PREFIX}(?:${STRONG})\\s*에\\s*(?:따르면|의하면)\\s*[,，]?\\s*`, 'g'),
    new RegExp(
      `${PREFIX}(?:${STRONG})\\s*(?:을|를)\\s*보(?:니|면|자|았\\S*)?\\s*[,，]?\\s*`,
      'g',
    ),
  ];
  for (const re of strongPatternsEmpty) {
    out = out.replace(re, '');
  }

  const strongStartPattern = new RegExp(
    `(^|[\\.\\?\\!]\\s+)(?:${STRONG})(?:은|는)\\s+`,
    'g',
  );
  out = out.replace(strongStartPattern, '$1');

  const strongMidClausePattern = new RegExp(
    `([가-힣]{2,}(?:고|며|지만|는데|으며|면서|다가|으나|면|자|니))\\s+(?:${STRONG})(?:은|는)\\s+`,
    'g',
  );
  out = out.replace(strongMidClausePattern, '$1 ');

  const WEAK = '본문|문서|포스팅|포스트|리뷰|자료|뉴스|방송|매체|발표|보고서';

  const weakPatterns: RegExp[] = [
    new RegExp(`${PREFIX}(?:${WEAK})\\s*에(?:서[는도]?|선)\\s*[,，]?\\s*`, 'g'),
    new RegExp(`${PREFIX}(?:${WEAK})\\s*에\\s*(?:따르면|의하면)\\s*[,，]?\\s*`, 'g'),
    new RegExp(`${PREFIX}(?:${WEAK})\\s*(?:을|를)\\s*보(?:니|면|자|았\\S*)?\\s*[,，]?\\s*`, 'g'),
  ];
  for (const re of weakPatterns) {
    out = out.replace(re, '');
  }

  out = out
    .replace(/(?:전해진|알려진)\s*바에?\s*(?:따르면|의하면)\s*[,，]?\s*/g, '')
    .replace(/관계자에?\s*(?:따르면|의하면)\s*[,，]?\s*/g, '')
    .replace(/(?:한|일부|여러)\s*매체(?:에서|에)?\s*(?:따르면|의하면|보도)?\s*[,，]?\s*/g, '')
    .replace(/외신\s*(?:보도)?에?\s*(?:따르면|의하면)?\s*[,，]?\s*/g, '')
    .replace(/공식\s*(?:발표|입장)에?\s*(?:따르면|의하면)\s*[,，]?\s*/g, '');

  out = out
    .replace(/^\s*[,，\.]\s*/gm, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+([,，\.\?\!])/g, '$1')
    .trim();

  return out;
}

/**
 * Removes machine-like inline citation labels from publishable prose.
 * Natural attribution such as "보건복지부 자료에 따르면" is intentionally kept.
 */
export function stripInlineSourceMarkers(text: string): string {
  if (!text) return text;

  return text
    .replace(/[\[［【]\s*출처\s*[:：]\s*[^\]］】\r\n]{1,300}[\]］】]/g, ' ')
    .replace(/\(\s*출처\s*[:：]\s*[^)\r\n]{1,300}\)/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?。，；：！？])/g, '$1')
    .replace(/[ \t]+\r?\n/g, '\n')
    .replace(/\r?\n[ \t]+/g, '\n')
    .trim();
}

export function sanitizePublishableSourceText(text: string): string {
  return stripInlineSourceMarkers(stripFakeSourcePhrases(text));
}

export function stripMetaCritiqueLines(s: string | undefined): string | undefined {
  if (!s) return s;

  const segments = s.split(/(\r?\n|(?<=[.!?。])\s+)/);
  const kept = segments.filter((seg) => {
    if (!seg) return true;
    const probe = seg.trim();
    if (!probe) return true;
    return !META_CRITIQUE_PHRASES.some((phrase) => probe.includes(phrase));
  });

  return kept.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function sanitizeContentMetaCritique(content: SanitizableContent): number {
  let count = 0;
  const tryFix = (s: string | undefined): string | undefined => {
    if (!s) return s;
    const fixed = stripMetaCritiqueLines(s);
    if (fixed !== s) count++;
    return fixed;
  };

  if (content.selectedTitle) content.selectedTitle = tryFix(content.selectedTitle)!;
  if (content.title) content.title = tryFix(content.title);
  if (content.introduction) content.introduction = tryFix(content.introduction)!;
  if (content.conclusion) content.conclusion = tryFix(content.conclusion)!;
  if (Array.isArray(content.headings)) {
    for (const h of content.headings) {
      if (h.title) h.title = tryFix(h.title);
      if (h.body) h.body = tryFix(h.body);
      if (h.content) h.content = tryFix(h.content);
    }
  }

  if (count > 0) {
    console.warn(`[Sanitizer] 🧹 자가검수 메타 표현 ${count}개 자동 제거 (자체비평/체크리스트 등)`);
  }

  return count;
}

export function sanitizeContentHtmlTags(content: SanitizableContent): number {
  let count = 0;
  const stripHtml = (s: string | undefined): string | undefined => {
    if (!s) return s;
    let cleaned = s;

    cleaned = cleaned.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g, '');
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&hellip;/g, '…')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&copy;/g, '©')
      .replace(/&reg;/g, '®')
      .replace(/&times;/g, '×');
    cleaned = cleaned.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');

    if (cleaned !== s) count++;
    return cleaned.trim();
  };

  if (content.selectedTitle) content.selectedTitle = stripHtml(content.selectedTitle)!;
  if (content.title) content.title = stripHtml(content.title);
  if (content.introduction) content.introduction = stripHtml(content.introduction)!;
  if (content.conclusion) content.conclusion = stripHtml(content.conclusion)!;
  if (content.bodyPlain) content.bodyPlain = stripHtml(content.bodyPlain);
  if (content.bodyHtml) content.bodyHtml = stripHtml(content.bodyHtml);
  if (Array.isArray(content.headings)) {
    for (const h of content.headings) {
      if (h.title) h.title = stripHtml(h.title);
      if (h.body) h.body = stripHtml(h.body);
      if (h.content) h.content = stripHtml(h.content);
    }
  }

  if (count > 0) {
    console.warn(`[Sanitizer] 🧹 HTML 태그 ${count}개 자동 제거 (네이버 에디터는 평문만 허용)`);
  }

  return count;
}

export function sanitizeContentFakeSources(content: SanitizableContent): number {
  let count = 0;
  const tryFix = (s: string | undefined): string | undefined => {
    if (!s) return s;
    const fixed = sanitizePublishableSourceText(s);
    if (fixed !== s) count++;
    return fixed;
  };

  if (content.selectedTitle) content.selectedTitle = tryFix(content.selectedTitle)!;
  if (content.title) content.title = tryFix(content.title);
  if (content.content) content.content = tryFix(content.content);
  if (content.introduction) content.introduction = tryFix(content.introduction)!;
  if (content.conclusion) content.conclusion = tryFix(content.conclusion)!;
  if (content.bodyPlain) content.bodyPlain = tryFix(content.bodyPlain);
  if (content.bodyHtml) content.bodyHtml = tryFix(content.bodyHtml);
  if (Array.isArray(content.headings)) {
    for (const h of content.headings) {
      if (h.title) h.title = tryFix(h.title);
      if (h.body) h.body = tryFix(h.body);
      if (h.content) h.content = tryFix(h.content);
    }
  }

  if (count > 0) {
    console.warn(`[Sanitizer] 🧹 출처 날조 표현 ${count}개 자동 제거`);
  }

  return count;
}

export function sanitizeContentFakeSourcesCopy<T extends SanitizableContent>(content: T): T {
  const copy = {
    ...content,
    ...(Array.isArray(content.headings)
      ? { headings: content.headings.map(heading => ({ ...heading })) }
      : {}),
  } as T;

  sanitizeContentFakeSources(copy);
  return copy;
}
