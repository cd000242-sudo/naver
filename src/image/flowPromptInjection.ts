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
// Visual result unchanged because salt is a comment line.
export function injectUniqueSalt(prompt: string): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `${prompt}\n\n# variation-id: ${ts}-${rand}`;
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
