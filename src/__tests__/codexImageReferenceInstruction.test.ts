// The one-image instruction with a product reference photo, and the product-preservation line in the prompt.
import { describe, expect, it } from 'vitest';
import {
  buildCodexImageInstruction,
  withCodexAspectRatio,
  withCodexProductReference,
} from '../image/codex/codexImageInstruction.js';

const PRODUCT_LINE = 'PRODUCT REFERENCE: referenced image 1 is the real product. Draw this exact product — same shape, proportions, colours, materials, logo, label text and packaging; do not redesign, recolour, mirror, re-letter or replace it. Build a new scene for this section; do not reuse the reference photo\'s background or framing.';
const REF_PATH = 'C:/Users/me/AppData/Local/Temp/agentcli-codex-image-AbC123/reference-01.png';

describe('withCodexProductReference', () => {
  it('프롬프트 뒤에 상품 보존 줄을 한 줄 붙인다', () => {
    expect(withCodexProductReference('  scene prompt  ')).toBe(`scene prompt\n${PRODUCT_LINE}`);
  });

  it('비율 줄 앞에 놓이면 프롬프트 끝은 보존 줄 다음 비율 줄이다', () => {
    const full = withCodexAspectRatio(withCodexProductReference('scene prompt'), '1:1');
    expect(full.startsWith(`scene prompt\n${PRODUCT_LINE}\nASPECT RATIO: square 1:1`)).toBe(true);
    expect(full.indexOf('PRODUCT REFERENCE')).toBeLessThan(full.indexOf('ASPECT RATIO'));
  });
});

describe('buildCodexImageInstruction — 참고 사진이 있을 때', () => {
  const text = buildCodexImageInstruction(['scene prompt'], REF_PATH);

  it('도구를 한 번만 불러 1장만 만들고, prompt 는 한 글자도 바꾸지 않고, 참고 경로를 그대로 넘기라고 한다', () => {
    expect(text).toContain('image_gen.imagegen');
    expect(text).toContain('한 번만');
    expect(text).toContain('1장만');
    expect(text).toContain('한 글자도 바꾸지 말고');
    expect(text).toContain('referenced_image_paths');
    expect(text).toContain(`["${REF_PATH}"]`);
    expect(text.endsWith('프롬프트: "scene prompt"')).toBe(true);
  });

  it('참고 파일을 열거나 고치거나 그대로 내보내지 말라고 한다', () => {
    expect(text).toMatch(/reference-01\.png[^.]*열거나 고치거나 그대로 (결과로 )?내보내지 마세요/);
  });

  it('경로의 역슬래시는 슬래시로 바꿔 쓴다 (이스케이프 사고 방지)', () => {
    const windows = buildCodexImageInstruction(['p'], 'C:\\Users\\me\\Temp\\agentcli-codex-image-x\\reference-01.png');
    expect(windows).toContain('["C:/Users/me/Temp/agentcli-codex-image-x/reference-01.png"]');
    expect(windows).not.toContain('\\');
  });

  it('여러 장과 참고 사진을 함께 쓰는 조합은 오류다', () => {
    expect(() => buildCodexImageInstruction(['a', 'b'], REF_PATH)).toThrow(/참고 사진/);
  });

  it('빈 프롬프트는 참고 사진이 있어도 거부한다', () => {
    expect(() => buildCodexImageInstruction(['  '], REF_PATH)).toThrow();
  });
});

describe('buildCodexImageInstruction — 참고 사진이 없을 때는 지금 문자열과 완전히 같다', () => {
  const single = '이미지 생성 도구(image_gen.imagegen)에 아래 프롬프트를 한 글자도 바꾸지 말고 그대로 넘겨 이미지 1장만 만드세요. 다른 작업이나 설명은 하지 마세요. 프롬프트: "p"';
  it('1장', () => {
    expect(buildCodexImageInstruction(['p'])).toBe(single);
    expect(buildCodexImageInstruction(['p'], undefined)).toBe(single);
    expect(buildCodexImageInstruction(['p'], '')).toBe(single);
  });
  it('여러 장', () => {
    const multi = buildCodexImageInstruction(['a', 'b']);
    expect(multi).toContain('프롬프트 1: "a"');
    expect(multi).toContain('프롬프트 2: "b"');
    expect(multi).not.toContain('referenced_image_paths');
  });
});
