/**
 * Builds the multipart request for OpenAI image edits (reference image / img2img).
 *
 * [2026-09-02 라이브] status 400, code unknown_parameter: "Unknown parameter: 'image'."
 * 2026-03-03 부터 참조 이미지를 /v1/images/generations 에 JSON `image` 필드로 보냈다.
 * 그 엔드포인트에는 image 파라미터가 없다 — 참조 이미지는 /v1/images/edits 에
 * multipart/form-data 로 간다. 쇼핑커넥트 img2img 는 그날 이후 한 번도 성공한 적이 없고,
 * 3회 재시도가 매번 같은 400 을 받았다(재시도로 풀릴 오류가 아니다).
 *
 * 규칙: OpenAI 가 모르는 필드는 하나도 싣지 않는다 — 이번 400 이 그 부류다.
 * response_format·input_fidelity 는 모델별 지원이 갈려 싣지 않는다(gpt-image 계열은 b64_json 기본).
 */
export const OPENAI_IMAGES_EDITS_URL = 'https://api.openai.com/v1/images/edits';

export interface OpenaiImageEditsReference {
  readonly buffer: Buffer | Uint8Array;
  readonly mimeType: string;
}

export interface OpenaiImageEditsFields {
  readonly model: string;
  readonly prompt: string;
  readonly size: string;
  readonly quality: string;
  readonly n?: number;
}

export interface OpenaiImageEditsRequest {
  readonly url: string;
  readonly body: FormData;
  readonly fileName: string;
}

const OPENAI_EDITS_MIME_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
});

/** File name the multipart part carries — the API sniffs the type from the part, but a matching extension avoids ambiguity. */
export function referenceFileNameForMime(mimeType: string): string {
  const ext = OPENAI_EDITS_MIME_EXTENSIONS[String(mimeType || '').trim().toLowerCase()] || 'png';
  return `reference.${ext}`;
}

export function buildOpenaiImageEditsRequest(
  reference: OpenaiImageEditsReference,
  fields: OpenaiImageEditsFields,
): OpenaiImageEditsRequest {
  const mimeType = String(reference.mimeType || '').trim().toLowerCase() || 'image/png';
  const fileName = referenceFileNameForMime(mimeType);
  const body = new FormData();
  body.append('image', new Blob([new Uint8Array(reference.buffer)], { type: mimeType }), fileName);
  body.append('model', fields.model);
  body.append('prompt', fields.prompt);
  body.append('n', String(fields.n ?? 1));
  body.append('size', fields.size);
  body.append('quality', fields.quality);
  return { url: OPENAI_IMAGES_EDITS_URL, body, fileName };
}
