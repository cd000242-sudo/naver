import { META_CRITIQUE_PHRASES } from './content/forbiddenPhrases.js';
import { classifyAttributions, type Attribution, type AttributionEvidence } from './content/attributionGuard.js';

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
  /** Attached by sanitizeContentFakeSources — records what attribution stripping did/found. */
  _attributionReport?: AttributionReport;
};

export interface AttributionReport {
  /** Count of named/generic attributions confirmed against evidence and left untouched. */
  supported: number;
  /** Attributions whose source could not be confirmed and had their phrase stripped. */
  unsupported: Array<{ phrase: string; orgName: string | null }>;
  /** Every attribution phrase actually removed from the text. */
  stripped: string[];
}

export type SanitizeFakeSourcesOptions = {
  /** When provided, named/generic attributions are checked against this evidence
   *  before stripping. Without it, no attribution phrase is stripped — only recorded. */
  evidence?: AttributionEvidence;
  /** 'strip-unsupported' (default): evidence-aware, phrase-only stripping.
   *  'legacy': the old blanket regex stripper, kept for callers that need parity. */
  mode?: 'strip-unsupported' | 'legacy';
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
      // [2026-09-17] '에는' 이 빠져 있었다 — "원문에는 …" 이 그대로 실렸다.
      `${PREFIX}(?:${STRONG})\\s*에(?:서[는도]?|선|는)(?:\\s*(?:확인|보면|나오|소개|다루|언급|등장|말하|전하)\\S*)?\\s*[,，]?\\s*`,
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

  /*
   * [2026-09-17 생성 실측] 화자를 모를 때 모델이 자료 자체를 화자로 세운다.
   *   원문  눈에 들어온 건 바지였어요 … "라고 적었어요.
   *   원문 블로그는 2019년 이후 활동이 뜸해졌다고 정리하며 …
   * blueprint/quoteInsertionPatch 가 '담당자는 "…"라고 말했다' 꼴을 요구하는데,
   * 출처가 블로그·기사라 이름이 없으면 그 자리를 '원문' 으로 메운다.
   * 독자에게 '원문' 은 아무 뜻이 없다 — 우리가 자료를 부르는 내부 명칭이다.
   *
   * 붙여 넣어진 뉴스 페이지 UI 인 '기사원문' 은 제외한다. 실측 2,076편에서
   * 이 꼴로 걸리는 것은 2건뿐이고 그중 1건도 같은 누출이었다.
   */
  // (1) 자료를 명사로 부르는 꼴 — "원문 블로그는", "원본 글에서는". 조사까지 함께 뗀다.
  out = out.replace(
    /(?<!기사)(?:원문|원본)\s*(?:블로그|글|포스트)\s*(?:은|는|이|가|에는|에서는?|도)?\s*/gu,
    '',
  );
  // (1-b) 설계도(blueprint)도 내부 명칭이다. 이번 실측: "설계도에 담긴 감독 발언도 분명합니다."
  // 자료를 가리키는 '에' 형태로만 좁힌다. 실측 본문 3건은 전부 "설계도를 그리다" 같은
  // 정상 용법이었고(건축·인생 설계도), 그쪽은 건드리면 안 된다.
  out = out.replace(/설계도\s*에(?:는|서는?)?\s*(?:담긴|적힌|나온|있는|따르면|의하면)?\s*/gu, '');

  // (2) 이름 자리에 자료를 세운 꼴 — "원문  눈에 들어온 건…", "원문에는 …".
  //     뒤가 한글이나 여는 따옴표일 때만 뗀다(숫자·기호로 이어지면 다른 문장이다).
  out = out.replace(
    /(?<!기사)(?:원문|원본)\s*(?:은|는|이|가|에는)?\s{0,3}(?=["“‘가-힣])/gu,
    '',
  );

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
  /*
   * [2026-09-01] bodyPlain · bodyHtml 이 빠져 있었다.
   *
   * 발행은 headings[] 가 아니라 bodyPlain 을 타이핑한다(editorHelpers). 그래서
   * 소제목 본문에서 지워도 독자에게 가는 글에는 자가검수 메타 문장이 그대로 남았다.
   * 형제 함수들은 둘 다 처리한다 — HTML 태그 제거도, 가짜 출처 제거도.
   * 타입에도 이미 선언돼 있다. 이 함수만 빼먹었다.
   */
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

/**
 * Legacy blanket stripper — removes every "~에 따르면/원문에는/관계자에 따르면" style
 * phrase regardless of whether the claim is actually backed by real evidence. Kept for
 * callers that opt into `{ mode: 'legacy' }` and need old-behavior parity.
 */
function sanitizeContentFakeSourcesLegacy(content: SanitizableContent): number {
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
    console.warn(`[Sanitizer] 🧹 출처 날조 표현 ${count}개 자동 제거 (legacy 모드)`);
  }

  return count;
}

/** Removes just the matched attribution phrase from `text`, collapsing the resulting gap. */
function stripAttributionPhrase(text: string, attr: Attribution): string {
  const before = text.slice(0, attr.index);
  const after = text.slice(attr.index + attr.phrase.length);
  return (before + after)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]*[,，]\s*/, '')
    .replace(/\s+([,，\.\?\!])/g, '$1')
    .trim();
}

function sanitizeFieldEvidenceAware(
  text: string,
  evidence: AttributionEvidence | undefined,
  report: AttributionReport,
): string {
  if (!text) return text;
  // Machine-artifact bracket labels ("[출처: X]") are never a real attribution —
  // always safe to strip regardless of evidence.
  let working = stripInlineSourceMarkers(text);

  if (!evidence) {
    // No evidence supplied: record nothing to strip, only leave the text untouched.
    return working;
  }

  const { supported, unsupported } = classifyAttributions(working, evidence);
  report.supported += supported.length;
  if (unsupported.length === 0) return working;

  // Strip from rightmost to leftmost so earlier indices (computed once, up front) stay valid.
  const rightToLeft = [...unsupported].sort((a, b) => b.index - a.index);
  for (const attr of rightToLeft) {
    working = stripAttributionPhrase(working, attr);
    report.unsupported.push({ phrase: attr.phrase, orgName: attr.orgName });
    report.stripped.push(attr.phrase);
  }
  return working;
}

function sanitizeContentFakeSourcesEvidenceAware(
  content: SanitizableContent,
  evidence?: AttributionEvidence,
): number {
  let count = 0;
  const report: AttributionReport = { supported: 0, unsupported: [], stripped: [] };
  const tryFix = (s: string | undefined): string | undefined => {
    if (!s) return s;
    const fixed = sanitizeFieldEvidenceAware(s, evidence, report);
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

  content._attributionReport = report;

  if (report.stripped.length > 0) {
    console.warn(
      `[Sanitizer] 🧹 출처 귀속 검증: 미확인 ${report.unsupported.length}건 제거, 확인됨 ${report.supported}건 유지`,
    );
  }

  return count;
}

/**
 * Removes fake/unverifiable source attribution phrases while preserving the underlying claim.
 *
 * Default mode ('strip-unsupported'): with no `evidence`, nothing is stripped — attributions
 * are only detectable via the returned `content._attributionReport` in a follow-up call once
 * evidence is available. With `evidence`, attributions confirmed against it are kept verbatim;
 * unconfirmed ones have only their attribution phrase removed (the claim itself stays).
 *
 * `{ mode: 'legacy' }` restores the old blanket-stripping behavior for callers that need it.
 */
export function sanitizeContentFakeSources(
  content: SanitizableContent,
  options?: SanitizeFakeSourcesOptions,
): number {
  if (options?.mode === 'legacy') {
    return sanitizeContentFakeSourcesLegacy(content);
  }
  return sanitizeContentFakeSourcesEvidenceAware(content, options?.evidence);
}

export function sanitizeContentFakeSourcesCopy<T extends SanitizableContent>(
  content: T,
  options?: SanitizeFakeSourcesOptions,
): T {
  const copy = {
    ...content,
    ...(Array.isArray(content.headings)
      ? { headings: content.headings.map(heading => ({ ...heading })) }
      : {}),
  } as T;

  sanitizeContentFakeSources(copy, options);
  return copy;
}
