import { describe, it, expect } from 'vitest';
import { resolveImagePath, describeImagePath } from '../automation/imagePathResolve';

/**
 * [2026-08-26 사장님 실측] 반자동 발행이 첫 소제목 직후에 죽었다.
 *   "콘텐츠 적용 실패 (1회 시도 후): filePath.substring is not a function"
 * savedToLocal 은 `string | boolean` 인데(types.ts:39), 여러 호출부가
 *   img.filePath || img.savedToLocal || img.url
 * 로 고르고 바로 .substring 을 불렀다. savedToLocal 이 true 면 그대로 터진다.
 * 터진 자리가 로그 한 줄이었다는 게 더 나쁘다 — 경로를 찍으려다 발행이 멈췄다.
 */
describe('이미지 경로 선택', () => {
  it('savedToLocal 이 true 여도 경로로 채택하지 않는다', () => {
    const image = { savedToLocal: true, url: 'https://example.com/a.png' };
    expect(resolveImagePath(image)).toBe('https://example.com/a.png');
  });

  it('savedToLocal 이 문자열이면 쓴다', () => {
    expect(resolveImagePath({ savedToLocal: 'C:/img/a.png' })).toBe('C:/img/a.png');
  });

  it('filePath 가 먼저다 — 기존 우선순위를 그대로 지킨다', () => {
    const image = { filePath: 'C:/a.png', savedToLocal: 'C:/b.png', url: 'https://c.png' };
    expect(resolveImagePath(image)).toBe('C:/a.png');
  });

  it('previewDataUrl 까지 폴백한다 (ImageFX 대응)', () => {
    expect(resolveImagePath({ previewDataUrl: 'data:image/png;base64,AAA' }))
      .toBe('data:image/png;base64,AAA');
  });

  it('쓸 수 있는 경로가 없으면 null', () => {
    expect(resolveImagePath({ savedToLocal: true })).toBeNull();
    expect(resolveImagePath({ filePath: '   ' })).toBeNull();
    expect(resolveImagePath(null)).toBeNull();
    expect(resolveImagePath(undefined)).toBeNull();
  });

  it('빈 문자열은 경로가 아니다 — 다음 후보로 넘어간다', () => {
    expect(resolveImagePath({ filePath: '', url: 'https://x.png' })).toBe('https://x.png');
  });
});

describe('로그용 경로 표기는 절대 던지지 않는다', () => {
  it('boolean·객체·null 어느 것이 와도 문자열을 돌려준다', () => {
    for (const image of [
      { savedToLocal: true },
      { filePath: 123 as any },
      { filePath: {} as any },
      null,
      undefined,
    ]) {
      expect(() => describeImagePath(image as any)).not.toThrow();
      expect(typeof describeImagePath(image as any)).toBe('string');
    }
  });

  it('경로가 없으면 그렇게 말한다', () => {
    expect(describeImagePath({ savedToLocal: true })).toBe('(경로 없음)');
  });

  it('긴 경로는 잘라서 보여준다', () => {
    const long = 'C:/' + 'a'.repeat(200) + '.png';
    const shown = describeImagePath({ filePath: long }, 80);
    expect(shown.length).toBeLessThanOrEqual(83);
    expect(shown.endsWith('...')).toBe(true);
  });
});

describe('호출부가 더 이상 직접 substring 하지 않는다', () => {
  it('editorHelpers·imageHelpers 가 공통 해결자를 쓴다', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const editor = readFileSync(join(__dirname, '..', 'automation', 'editorHelpers.ts'), 'utf-8');
    const images = readFileSync(join(__dirname, '..', 'automation', 'imageHelpers.ts'), 'utf-8');
    expect(editor).not.toMatch(/img\.filePath \|\| img\.savedToLocal/);
    expect(editor).toMatch(/describeImagePath\(img\)/);
    expect(images).not.toMatch(/image\.filePath \|\| image\.savedToLocal/);
    expect(images).toMatch(/resolveImagePath\(image\)/);
  });
});
