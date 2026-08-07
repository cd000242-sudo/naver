/**
 * kinExperienceMaterial.ts — "voice of people who lived it" material from KiN answers.
 *
 * Complements collectKinReaderContext (sourceAssembler.ts, v2.11.133) which
 * collects KiN *questions* as reader-situation material. This module collects
 * KiN *answers* — what people who actually went through the topic told the
 * asker — and packages them as advice/relay-voice material.
 *
 * Contract (aligned with SPEC-REVIEW-001 experience rules):
 *  - The material block explicitly forbids converting answers into the
 *    author's own first-person experience. Allowed voices are advice form
 *    ("~하실 거면 ~ 확인하세요") and attributed relay form ("겪은 사람들
 *    답변에서 반복되는 얘기는 ~").
 *  - Injection is gated to experience categories only (living/interior,
 *    parenting, daily-life, food, pet, travel, fashion axes) — news/spec
 *    categories (society, economy, IT, entertainment) are excluded.
 *  - Collection failures never throw; callers get a reason code so the
 *    "why is this post flat" question stays answerable from logs.
 */

/**
 * Korean category-hint tokens (see shared/categoryTaxonomy.ts) whose posts
 * benefit from lived-experience material. Exact-match against the hint.
 */
export const EXPERIENCE_CATEGORY_HINTS: readonly string[] = [
  '리빙',
  '인테리어',
  '육아',
  '생활',
  '라이프',
  '요리',
  '맛집',
  '음식',
  '반려동물',
  '여행',
  '패션',
];

export function isExperienceCategory(categoryHint?: string | null): boolean {
  const hint = String(categoryHint || '').trim();
  if (!hint) return false;
  return EXPERIENCE_CATEGORY_HINTS.includes(hint);
}

export interface KinAnswerMaterial {
  /** Prompt-ready material block. Empty string when nothing was collected. */
  block: string;
  answerCount: number;
  reason: 'ok' | 'no-keyword' | 'no-api-key' | 'no-results' | 'no-answers' | 'error';
  detail?: string;
}

/** Lines that are KiN page chrome, not answer content. */
const BOILERPLATE_PATTERNS: readonly RegExp[] = [
  /질문자\s*채택/,
  /채택된?\s*답변/,
  /\d+\s*번째\s*답변/,
  /프로필\s*사진/,
  /지식파트너/,
  /전문가\s*답변/,
  /답변을?\s*달아/,
  /도움이?\s*되었다면/,
  /출처\s*[:：]/,
  /광고입니다/,
  /더보기$/,
  /^신고$/,
  /^공유$/,
];

const MIN_ANSWER_CHARS = 60;
const MAX_ANSWER_CHARS = 600;
const MAX_ANSWERS_PER_QUESTION = 2;

function cleanAnswerText(raw: string): string {
  const lines = String(raw || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .filter((line) => !BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line)));
  return lines.join('\n').trim().substring(0, MAX_ANSWER_CHARS);
}

/**
 * Extracts answer bodies from a KiN question page (SSR HTML).
 * Selector ladder covers SmartEditor ONE answers and the legacy layout.
 */
export async function parseKinAnswers(html: string, maxAnswers: number = MAX_ANSWERS_PER_QUESTION): Promise<string[]> {
  if (!html || maxAnswers <= 0) return [];
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  const containers = $('.answer-content__item').toArray();
  const bodies: string[] = [];
  const seen = new Set<string>();

  const pushAnswer = (text: string) => {
    const cleaned = cleanAnswerText(text);
    if (cleaned.length < MIN_ANSWER_CHARS) return;
    const dedupeKey = cleaned.substring(0, 40);
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    bodies.push(cleaned);
  };

  if (containers.length > 0) {
    for (const container of containers) {
      if (bodies.length >= maxAnswers) break;
      const scope = $(container);
      const editorBody = scope.find('.se-main-container').first();
      const legacyBody = scope.find('._endContents').first();
      const source = editorBody.length > 0 ? editorBody : legacyBody.length > 0 ? legacyBody : scope;
      pushAnswer(source.text());
    }
  } else {
    // Legacy pages without the item wrapper expose answer bodies directly.
    for (const node of $('._endContents').toArray()) {
      if (bodies.length >= maxAnswers) break;
      pushAnswer($(node).text());
    }
  }

  return bodies;
}

/**
 * Builds the prompt material block. The header is the guard: relay/advice
 * voice only — never the author's fabricated first-person experience.
 */
export function buildKinAnswerBlock(answers: readonly string[]): string {
  const usable = answers.filter((answer) => String(answer || '').trim().length >= MIN_ANSWER_CHARS);
  if (usable.length === 0) return '';
  const numbered = usable.map((answer, index) => `[답변 ${index + 1}] ${answer}`);
  return (
    `=== 겪은 사람들의 말 (지식iN 답변 — 조언·전달 재료) ===\n` +
    `⚠️ 아래는 이 주제를 실제로 겪은 사람들이 남긴 답변입니다. 조언형("~하실 거면 ~ 확인하세요")이나 ` +
    `출처를 밝힌 전달형("겪은 사람들 답변에서 반복되는 얘기는 ~")으로만 옮기세요. ` +
    `작성자 본인의 1인칭 경험으로 바꾸거나, 답변에 없는 수치·기간·결과를 만들지 마세요.\n` +
    numbered.join('\n\n') + '\n'
  );
}

async function fetchKinPageHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(12_000),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });
  if (!response.ok) throw new Error(`KiN page HTTP ${response.status}`);
  return await response.text();
}

/**
 * Collects up to `maxTotalAnswers` KiN answers for the keyword.
 * Never throws — failure modes are reported through `reason`.
 */
export async function collectKinExperienceAnswers(
  keyword: string,
  maxTotalAnswers: number = 3,
): Promise<KinAnswerMaterial> {
  const query = String(keyword || '').trim();
  if (!query) return { block: '', answerCount: 0, reason: 'no-keyword' };

  try {
    const { searchKin } = await import('../naverSearchApi.js');
    const result = await searchKin({ query, display: 6, sort: 'sim' });
    const items = (result?.items || []).filter(
      (item) => typeof item?.link === 'string' && /^https?:\/\//.test(item.link),
    );
    if (items.length === 0) return { block: '', answerCount: 0, reason: 'no-results' };

    const answers: string[] = [];
    for (const item of items) {
      if (answers.length >= maxTotalAnswers) break;
      try {
        const html = await fetchKinPageHtml(item.link);
        const parsed = await parseKinAnswers(html, MAX_ANSWERS_PER_QUESTION);
        for (const answer of parsed) {
          if (answers.length >= maxTotalAnswers) break;
          answers.push(answer);
        }
      } catch (pageError) {
        console.warn(
          `[kinExperienceMaterial] 답변 페이지 크롤 실패 (무시): ${(pageError as Error).message}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (answers.length === 0) return { block: '', answerCount: 0, reason: 'no-answers' };
    const block = buildKinAnswerBlock(answers);
    console.log(`[kinExperienceMaterial] 💬 겪은 사람 말투 재료 ${answers.length}건 확보 ("${query}")`);
    return { block, answerCount: answers.length, reason: 'ok' };
  } catch (error) {
    const message = String((error as Error)?.message || error);
    if (message.includes('API 키')) {
      return { block: '', answerCount: 0, reason: 'no-api-key', detail: message };
    }
    console.warn(`[kinExperienceMaterial] 수집 실패 (무시): ${message}`);
    return { block: '', answerCount: 0, reason: 'error', detail: message };
  }
}
