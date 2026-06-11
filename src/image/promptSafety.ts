// Prompt safety helpers shared by image generators.
//
// FLUX-family models render Korean characters as literal text inside the
// generated image, so Korean must be stripped from prompts. But stripping a
// Korean-only prompt leaves an empty shell (e.g. "visual scene depicting: ,"),
// and an effectively empty prompt makes the model free-generate arbitrary
// images (random people) unrelated to the post. These helpers make that
// empty state detectable so callers can recover via AI translation instead
// of calling the image API with garbage.

/** Remove Korean characters and collapse whitespace. */
export function stripKoreanResidue(prompt: string): string {
    return prompt
        .replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Words that don't describe a visual subject on their own — scaffold text
// like "visual scene depicting:" must not count as meaningful content.
const PROMPT_FILLER_WORDS = new Set([
    'visual', 'scene', 'depicting', 'image', 'picture',
    'the', 'and', 'with', 'for', 'not', 'text', 'writing', 'watermark',
]);

/**
 * True when the prompt carries no meaningful visual content — i.e. fewer
 * than two non-filler words of 3+ letters (typical after Korean stripping).
 */
export function isPromptContentEmpty(prompt: string): boolean {
    const words = (prompt.match(/[a-zA-Z]{3,}/g) || [])
        .filter((w) => !PROMPT_FILLER_WORDS.has(w.toLowerCase()));
    return words.length < 2;
}

/**
 * True when an englishPrompt field is usable as-is: present AND actually
 * English. Upstream AI prompt generation sometimes returns Korean inside the
 * englishPrompt field; treating that as English bypassed translation and
 * produced empty prompts after Korean stripping (2026-06-11 live regression).
 */
export function hasUsableEnglishPrompt(englishPrompt: string | undefined | null): boolean {
    return !!englishPrompt && !/[가-힣]/.test(englishPrompt);
}
