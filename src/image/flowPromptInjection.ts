// Pure prompt-injection helpers for Flow image generation.
//
// Extracted from flowGenerator.ts so they can be unit-tested directly without
// loading electron. flowGenerator re-exports these — runtime behavior is
// identical.

const HEADING_VARIATION_HINTS: readonly string[] = [
    'CRITICAL FRAMING: Use a low-angle close-up, shallow depth of field, soft natural light. 가까이서 올려다본 시점.',
    'CRITICAL FRAMING: Use a wide-angle landscape view, deep depth of field, ambient lighting. 넓은 풍경.',
    'CRITICAL FRAMING: Use an over-the-shoulder perspective, mid-distance, golden-hour lighting. 어깨 너머 시점.',
    'CRITICAL FRAMING: Use a top-down bird-eye view, flat lay style, even lighting. 위에서 내려다본 평면 구도.',
    'CRITICAL FRAMING: Use an eye-level medium shot, natural daylight, neutral background. 정면 평행 시점.',
    'CRITICAL FRAMING: Use a dramatic side-light shot, high contrast, focused subject. 측광 강조.',
    'CRITICAL FRAMING: Use a candid documentary style, environmental portrait framing. 다큐멘터리 스타일.',
    'CRITICAL FRAMING: Use a cinematic wide shot, atmospheric depth, lens flare. 시네마틱 와이드 샷.',
];

export const HEADING_VARIATION_HINT_COUNT = HEADING_VARIATION_HINTS.length;

// Per-call random salt → bypasses Flow's deterministic prompt cache.
// [v2.10.124] '#' 주석 라인 제거 — 사용자 보고: "같은 이미지가 다른 글에 포함".
//   추정 원인: Flow가 cache hash 계산 *전*에 '#'로 시작하는 라인을 주석으로 strip →
//   매번 다른 salt를 넣어도 *같은 hash* → 같은 이미지 반환.
//   수정: 자연어 trailing phrase 사용. prompt hash 다양화 보장 + 시각 영향 미미.
export function injectUniqueSalt(prompt: string): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `${prompt}\n\nGeneration context tag ${ts}-${rand}: ensure a fresh, distinctive composition.`;
}

// Strip markdown, brackets, and runaway whitespace from a heading title so the
// model gets a clean noun phrase. Keep Korean — Flow handles Korean subjects
// literally per v2.6.7 retro M3.
export function sanitizeHeadingForPrompt(title: string | undefined | null): string {
    if (!title) return '';
    return String(title)
        .replace(/[#*_`~>]+/g, ' ')
        .replace(/[\[\]<>{}|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

// Prepend (1) the heading title as an explicit `# Subject:` line, then
// (2) the rotating viewpoint hint, then (3) the base prompt.
//
// Subject prepend addresses the upstream regression where similar headings
// produce nearly identical LLM-generated base prompts — without it, all 4
// images of "걸그룹" content collapse to the same scene because the model
// sees no distinguishing signal beyond viewpoint. Viewpoint alone is
// insufficient because Flow's caching + LLM determinism means similar
// prompts → similar images.
export function injectHeadingVariation(
    prompt: string,
    headingIndex: number,
    headingTitle?: string,
): string {
    if (typeof headingIndex !== 'number' || headingIndex < 0) return prompt;
    const hint = HEADING_VARIATION_HINTS[headingIndex % HEADING_VARIATION_HINTS.length];
    const subject = sanitizeHeadingForPrompt(headingTitle ?? '');
    const subjectLine = subject ? `# Subject (must reflect this heading): ${subject}\n\n` : '';
    return `${subjectLine}${hint}\n\n${prompt}`;
}

// Quality-preserving bypass for Flow's "문제가 발생했습니다" generation errors.
//
// The trigger is almost always the literal Korean "# Subject" heading line that
// injectHeadingVariation prepends (abstract policy/finance text, e.g. "청년내일저축계좌
// 소득·재산 기준"). The English visual scene below it (the LLM-built englishPrompt) is the
// actual quality content. So we BYPASS the trigger while keeping that scene intact — we do
// NOT dumb the image down to a generic placeholder.
//
//   level 0 = unchanged
//   level 1 = unchanged text (caller still retries on a FRESH project → clears transient/
//             project-state errors at full quality)
//   level 2 = drop ONLY the Korean "# Subject" line; keep viewpoint + English scene (full quality)
//   level 3+= also neutralize currency/percent/long-number tokens; scene stays (near-full quality)
//
// Never returns empty — if a step would strip everything, the previous text is kept.
export function simplifyFlowPrompt(prompt: string, level: number): string {
    if (!prompt || level <= 0) return prompt;

    // level 1 — no text change; the retry happens on a fresh Flow project (handled by caller).
    if (level === 1) return prompt;

    // level 2 — drop only the literal "# Subject (...): <heading>" line. English scene survives.
    let out = String(prompt)
        .replace(/^#\s*Subject[^\n]*\n+/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // level 3+ — additionally neutralize number/currency/percent tokens that can trip Flow,
    // while keeping the actual scene description.
    if (level >= 3) {
        out = out
            .replace(/[₩$]\s?\d[\d,.\s]*/g, ' ')   // currency amounts
            .replace(/\d+(\.\d+)?\s?%/g, ' ')      // percentages
            .replace(/\d{2,}/g, ' ')               // long digit runs (years, amounts, counts)
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    return out || prompt; // never empty — keep the original scene if over-stripped
}

// 금융/민감 "객체"가 등장하는 장면은 Google Flow가 결정적으로 거부하는 경향이 있다(라이브 실측:
// "banking app + financial documents" 장면이 420초 내내 "문제가 발생했습니다"로 거부됨, 같은 세션
// 다른 주제는 정상 생성).
//
// 연관성 보존(사용자 요청): 장면 전체를 일반 장면으로 갈아엎지 않고, Flow가 거부하는 구체적 객체만
// 안전한 등가물로 치환한다 — 인물·상황·분위기·구도는 그대로라 주제 연관성/가독성을 유지한다.
// (예: "금융 서류와 뱅킹앱을 검토하는 사람" → "노트와 플래너를 검토하는 사람" = 여전히 '계획·검토' 장면)
const SENSITIVE_OBJECT_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
    [/mobile banking|banking apps?/gi, 'a notebook'],
    [/bank statements?|financial statements?|financial documents?|financial papers?|loan documents?|bank documents?|card statements?|tax (?:forms?|documents?|papers?)/gi, 'planning notes in a notebook'],
    [/credit cards?|debit cards?/gi, 'a pen'],
    [/passbooks?|bankbooks?/gi, 'a notebook'],
    [/atm machines?|\batms?\b/gi, 'a tidy desk'],
    [/stacks? of (?:cash|money|bills?)|piles? of (?:cash|money)|banknotes?|wads? of cash/gi, 'a small potted plant'],
    // Korean concrete objects
    [/적금\s*통장|예금\s*통장|통장/g, '노트'],
    [/뱅킹\s*앱|모바일\s*뱅킹/g, '노트'],
    [/카드\s*명세서|은행\s*명세서/g, '메모'],
    [/현금\s*다발|지폐\s*다발/g, '작은 화분'],
    [/신용\s*카드|체크\s*카드/g, '펜'],
];

/**
 * Detects sensitive financial OBJECTS in a Flow prompt and swaps ONLY those objects for safe,
 * topically-adjacent equivalents (notebook/planner/pen/plant) — keeping the person, setting, mood
 * and composition so the image stays relevant to the article (avoids the readability drop a fully
 * generic scene would cause). Topic words alone (e.g. "financial freedom on a beach") are left
 * untouched — only concrete objects Flow tends to reject are replaced.
 */
export function softenSensitiveScene(prompt: string): { prompt: string; softened: boolean } {
    if (!prompt) return { prompt, softened: false };
    let out = prompt;
    for (const [pattern, replacement] of SENSITIVE_OBJECT_REPLACEMENTS) {
        out = out.replace(pattern, replacement);
    }
    return { prompt: out, softened: out !== prompt };
}
