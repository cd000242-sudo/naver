// src/image/codex/codexImageInstruction.ts
// The instruction handed to `codex exec` (on stdin). It tells the model to pass each prompt to the image_gen tool
// untouched — the app's prompt builder already decided what to draw, the model must not rewrite or "improve" it.
// The single-image form is the one measured to work on Codex CLI 0.166.0 (2026-11-03).

const SINGLE_HEAD = '이미지 생성 도구(image_gen.imagegen)에 아래 프롬프트를 한 글자도 바꾸지 말고 그대로 넘겨 이미지 1장만 만드세요. 다른 작업이나 설명은 하지 마세요. 프롬프트: ';

// The image_gen tool takes no size argument (prompt / transparent_background / references only), so it picks the frame
// from the prompt — a section prompt without a ratio came back 16:9. The item's ratio (thumbnail / heading setting,
// default 1:1) is appended as one line; measured 2026-11-03: the square line gave 1254x1254.
const CODEX_ASPECT_FRAMES: Readonly<Record<string, string>> = Object.freeze({
  '1:1': 'square 1:1 (1024x1024)',
  '16:9': 'wide landscape 16:9',
  '9:16': 'tall portrait 9:16',
  '4:3': 'landscape 4:3',
  '3:4': 'portrait 3:4',
});

export function withCodexAspectRatio(prompt: string, ratio: unknown): string {
  const frame = CODEX_ASPECT_FRAMES[String(ratio || '')] ?? CODEX_ASPECT_FRAMES['1:1'];
  return `${String(prompt ?? '').trim()}\nASPECT RATIO: ${frame}. Compose for this frame; keep every subject and all text inside it.`;
}

export function buildCodexImageInstruction(prompts: readonly string[]): string {
  const clean = prompts.map((prompt) => String(prompt ?? '').trim());
  if (clean.length === 0 || clean.some((prompt) => prompt.length === 0)) {
    throw new Error('Codex 구독 이미지에 넘길 프롬프트가 비어 있습니다.');
  }
  if (clean.length === 1) return `${SINGLE_HEAD}"${clean[0]}"`;
  const count = clean.length;
  const head = `이미지 생성 도구(image_gen.imagegen)에 아래 ${count}개 프롬프트를 각각 한 글자도 바꾸지 말고 그대로 넘겨, 번호 순서대로 이미지를 한 장씩 모두 ${count}장 만드세요. `
    + '프롬프트마다 도구를 한 번씩만 부르고, 건너뛰거나 같은 프롬프트를 다시 그리지 마세요. 다른 작업이나 설명은 하지 마세요.';
  return [head, ...clean.map((prompt, index) => `프롬프트 ${index + 1}: "${prompt}"`)].join('\n');
}
