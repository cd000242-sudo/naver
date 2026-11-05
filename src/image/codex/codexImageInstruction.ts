// src/image/codex/codexImageInstruction.ts
// The instruction handed to `codex exec` (on stdin). It tells the model to pass each prompt to the image_gen tool
// untouched — the app's prompt builder already decided what to draw, the model must not rewrite or "improve" it.
// The single-image form is the one measured to work on Codex CLI 0.166.0 (2026-11-03).

const SINGLE_HEAD = '이미지 생성 도구(image_gen.imagegen)에 아래 프롬프트를 한 글자도 바꾸지 말고 그대로 넘겨 이미지 1장만 만드세요. 다른 작업이나 설명은 하지 마세요. 프롬프트: ';

// The image_gen tool takes no size argument (prompt / transparent_background / references only), so it picks the frame
// from the prompt — a section prompt without a ratio came back 16:9. The item's ratio (thumbnail / heading setting,
// default 1:1) is appended as one line; measured 2026-11-03: the square line gave 1254x1254.
const CODEX_ASPECT_FRAMES: Readonly<Record<string, string>> = Object.freeze({
  // 2026-11-04: Codex still returned 16:9 for most square requests, so the app centre-crops (codexImageFrame.ts);
  //   keeping the subject and every letter inside the central square is what makes that crop safe.
  '1:1': 'square 1:1 (1024x1024). Keep the main subject and all text inside the central square',
  '16:9': 'wide landscape 16:9',
  '9:16': 'tall portrait 9:16',
  '4:3': 'landscape 4:3',
  '3:4': 'portrait 3:4',
});

export function withCodexAspectRatio(prompt: string, ratio: unknown): string {
  const frame = CODEX_ASPECT_FRAMES[String(ratio || '')] ?? CODEX_ASPECT_FRAMES['1:1'];
  return `${String(prompt ?? '').trim()}\nASPECT RATIO: ${frame}. Compose for this frame; keep every subject and all text inside it.`;
}

// [2026-11-05] Shopping product reference. The instruction tells the model to pass the prompt untouched, so the
// product-preservation wording has to live inside the prompt itself. "referenced image 1" is the one reference photo.
const PRODUCT_REFERENCE_LINE = 'PRODUCT REFERENCE: referenced image 1 is the real product. Draw this exact product — same shape, proportions, colours, materials, logo, label text and packaging; do not redesign, recolour, mirror, re-letter or replace it. Build a new scene for this section; do not reuse the reference photo\'s background or framing.';

/** Appends the product-preservation line. Call it BEFORE withCodexAspectRatio so the prompt ends with the ratio line. */
export function withCodexProductReference(prompt: string): string {
  return `${String(prompt ?? '').trim()}\n${PRODUCT_REFERENCE_LINE}`;
}

// One image with a reference photo. Method A (image_gen's `referenced_image_paths`): the model calls the tool once with
// the prompt unchanged and the photo's slash path. Measured 2026-11-05 on Codex CLI 0.166.0 (gpt-6-luna, one product
// photo): exactly one image_gen call, prompt byte-identical, referenced_image_paths = this session's reference-01.png,
// 42s, the product's tread, sidewall lettering and wheel were kept in a new scene. The `-i` attach +
// `num_last_images_to_include` form (method B) was not needed and is deliberately not implemented; no runtime switching. The path is a plain forward-slash path on purpose — a backslash path
// inside a JS string literal in the model's exec code would be read as escapes.
function buildReferenceHead(referencePath: string): string {
  const path = referencePath.replace(/\\/g, '/');
  return '이미지 생성 도구(image_gen.imagegen)를 딱 한 번만 불러 이미지 1장만 만드세요. '
    + '도구의 prompt 인자에는 아래 프롬프트를 한 글자도 바꾸지 말고 그대로 넘기고, '
    + `referenced_image_paths 인자에는 ["${path}"] 를 그대로 넘기세요. `
    + '참고 파일(reference-01.png)을 열거나 고치거나 그대로 결과로 내보내지 마세요. 다른 작업이나 설명은 하지 마세요. 프롬프트: ';
}

export function buildCodexImageInstruction(prompts: readonly string[], referencePath?: string): string {
  const clean = prompts.map((prompt) => String(prompt ?? '').trim());
  if (clean.length === 0 || clean.some((prompt) => prompt.length === 0)) {
    throw new Error('Codex 구독 이미지에 넘길 프롬프트가 비어 있습니다.');
  }
  if (referencePath) {
    if (clean.length !== 1) throw new Error('Codex 구독 이미지: 참고 사진은 한 번에 1장짜리 요청에만 붙일 수 있습니다.');
    return `${buildReferenceHead(referencePath)}"${clean[0]}"`;
  }
  if (clean.length === 1) return `${SINGLE_HEAD}"${clean[0]}"`;
  const count = clean.length;
  const head = `이미지 생성 도구(image_gen.imagegen)에 아래 ${count}개 프롬프트를 각각 한 글자도 바꾸지 말고 그대로 넘겨, 번호 순서대로 이미지를 한 장씩 모두 ${count}장 만드세요. `
    + '프롬프트마다 도구를 한 번씩만 부르고, 건너뛰거나 같은 프롬프트를 다시 그리지 마세요. 다른 작업이나 설명은 하지 마세요.';
  return [head, ...clean.map((prompt, index) => `프롬프트 ${index + 1}: "${prompt}"`)].join('\n');
}
