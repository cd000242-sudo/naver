import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  OPENAI_IMAGES_EDITS_URL,
  buildOpenaiImageEditsRequest,
  referenceFileNameForMime,
} from '../image/openaiImageEditsRequest';

/**
 * [2026-09-02 라이브] 쇼핑커넥트 AI 이미지 5장 전부 실패:
 *   status: 400, code: unknown_parameter — "Unknown parameter: 'image'."  (3회 재시도 모두 동일)
 *
 * 2026-03-03 부터 참조 이미지를 generations 엔드포인트에 JSON image 필드로 보냈다. 그 엔드포인트는
 * image 를 모른다. 참조 이미지는 edits 엔드포인트에 multipart 로 간다. 이 파일은 그 형태를 잠근다 —
 * 그리고 "OpenAI 가 모르는 필드를 싣지 않는다" 는 규칙도 함께 잠근다(이번 400 이 그 부류다).
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('참조 이미지는 edits 엔드포인트에 multipart 로 간다', () => {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
  const request = buildOpenaiImageEditsRequest(
    { buffer, mimeType: 'image/jpeg' },
    { model: 'gpt-image-2', prompt: 'a product photo', size: '1024x1024', quality: 'medium' },
  );

  it('URL 이 edits 다 — generations 에는 image 파라미터가 없다', () => {
    expect(request.url).toBe(OPENAI_IMAGES_EDITS_URL);
    expect(request.url).not.toContain('generations');
  });

  it('image 는 파일 파트(Blob)로, 나머지는 문자열 필드로 실린다', () => {
    const part = request.body.get('image');
    expect(part).toBeInstanceOf(Blob);
    expect((part as Blob).type).toBe('image/jpeg');
    expect((part as Blob).size).toBe(buffer.length);
    expect(request.fileName).toBe('reference.jpg');
    expect(request.body.get('model')).toBe('gpt-image-2');
    expect(request.body.get('prompt')).toBe('a product photo');
    expect(request.body.get('n')).toBe('1');
    expect(request.body.get('size')).toBe('1024x1024');
    expect(request.body.get('quality')).toBe('medium');
  });

  it('OpenAI 가 모르는 필드를 싣지 않는다 — 이번 400 이 그 부류다', () => {
    expect([...request.body.keys()].sort()).toEqual(['image', 'model', 'n', 'prompt', 'quality', 'size']);
    for (const stray of ['response_format', 'input_fidelity', 'image_url', 'reference', 'style']) {
      expect(request.body.has(stray)).toBe(false);
    }
  });

  it('mime 에 맞는 파일 이름 — 모르면 png', () => {
    expect(referenceFileNameForMime('image/png')).toBe('reference.png');
    expect(referenceFileNameForMime('image/webp')).toBe('reference.webp');
    expect(referenceFileNameForMime('IMAGE/JPEG')).toBe('reference.jpg');
    expect(referenceFileNameForMime('')).toBe('reference.png');
  });
});

describe('배선: 생성기는 참조가 있을 때 JSON image 필드를 쓰지 않는다', () => {
  const src = read('image/openaiImageGenerator.ts');

  it('requestBody.image 가 없다 — 되돌리면 같은 400 이 돌아온다', () => {
    expect(src).not.toMatch(/requestBody\.image\s*=/u);
  });

  it('참조가 있으면 edits 요청을 만들어 그 URL·본문으로 보낸다', () => {
    expect(src).toMatch(/buildOpenaiImageEditsRequest\(cachedReferenceImage/u);
    expect(src).toMatch(/axios\.post\(\s*editsRequest\.url,\s*editsRequest\.body/u);
  });

  it('multipart 요청에 application/json 을 박지 않는다 — axios 가 boundary 를 붙인다', () => {
    const at = src.indexOf('axios.post(editsRequest.url, editsRequest.body');
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 400)).not.toContain('application/json');
  });
});
