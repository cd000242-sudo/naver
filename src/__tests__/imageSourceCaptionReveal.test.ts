// src/__tests__/imageSourceCaptionReveal.test.ts
// [2026-10-13] 10/11 02:46 발행 로그: 이미지 8장 전부 "사진 설명 칸을 찾지 못해 출처를 건너뜁니다".
//   캡션 칸은 이미지를 선택하기 전엔 높이 0 이라(richTextPaste 가 기대는 같은 사실) 좌표 탐색이 매번 비켜갔다.
//   이제 숨은 캡션이면 이미지를 클릭해 선택 → 다시 재고 → 그래도 없으면 이미지 바로 아래 띠를 클릭한다.
import { describe, expect, it, vi } from 'vitest';
import { applyCaptionToLastImage } from '../automation/imageCaption.js';

type Target = { found: boolean; x: number; y: number; selector: string; hidden?: boolean; image?: { x: number; y: number; left: number; bottom: number }; captionClasses?: string[] };

function makeSelf(sequence: Target[], verified = true) {
  const clicks: Array<{ x: number; y: number }> = [];
  const typed: string[] = [];
  const logs: string[] = [];
  let locateCalls = 0;
  const frame = {
    evaluate: vi.fn(async (_fn: unknown, payload: any) => {
      if (payload && 'expected' in payload) return verified;
      const next = sequence[Math.min(locateCalls, sequence.length - 1)];
      locateCalls += 1;
      return next;
    }),
  };
  const page = {
    $: vi.fn(async () => null),
    mouse: { click: vi.fn(async (x: number, y: number) => { clicks.push({ x, y }); }) },
    keyboard: { type: vi.fn(async (t: string) => { typed.push(t); }), press: vi.fn(async () => undefined) },
  };
  const self = { ensurePage: () => page, getAttachedFrame: async () => frame, log: (m: string) => { logs.push(m); }, delay: async () => undefined };
  return { self, clicks, typed, logs, locateCalls: () => locateCalls };
}

const image = { x: 300, y: 200, left: 100, bottom: 400 };

describe('applyCaptionToLastImage — 숨은 캡션 드러내기', () => {
  it('캡션이 숨어 있으면 이미지를 클릭해 선택한 뒤 다시 재고, 드러나면 그 칸을 눌러 타이핑한다', async () => {
    const fake = makeSelf([
      { found: false, x: 0, y: 0, selector: '.se-caption', hidden: true, image },
      { found: true, x: 120, y: 420, selector: '.se-caption', image },
    ]);
    expect(await applyCaptionToLastImage(fake.self, 'news.naver.com')).toBe(true);
    expect(fake.clicks).toEqual([{ x: 300, y: 200 }, { x: 120, y: 420 }]);
    expect(fake.typed.join('')).toBe('news.naver.com');
    expect(fake.locateCalls()).toBe(2);
  });

  it('선택해도 안 드러나면 이미지 바로 아래 띠를 한 번 더 누르고 재는 뒤 타이핑한다', async () => {
    const fake = makeSelf([
      { found: false, x: 0, y: 0, selector: '', hidden: false, image },
      { found: false, x: 0, y: 0, selector: '', hidden: false, image },
      { found: true, x: 124, y: 414, selector: '[class*="caption"]', image },
    ]);
    expect(await applyCaptionToLastImage(fake.self, '출처')).toBe(true);
    expect(fake.clicks).toEqual([{ x: 300, y: 200 }, { x: 124, y: 414 }, { x: 124, y: 414 }]);
  });

  it('세 번 재도 없으면 타이핑하지 않고 본 클래스를 로그에 남긴다 — 본문에 출처가 새면 안 된다', async () => {
    const fake = makeSelf([{ found: false, x: 0, y: 0, selector: '', image, captionClasses: ['se-caption-xyz'] }]);
    expect(await applyCaptionToLastImage(fake.self, '출처')).toBe(false);
    expect(fake.typed).toHaveLength(0);
    expect(fake.clicks).toHaveLength(2);
    expect(fake.logs.join('\n')).toContain('se-caption-xyz');
  });

  it('이미지 좌표조차 없으면(컴포넌트 없음) 클릭 없이 건너뛴다', async () => {
    const fake = makeSelf([{ found: false, x: 0, y: 0, selector: '' }]);
    expect(await applyCaptionToLastImage(fake.self, '출처')).toBe(false);
    expect(fake.clicks).toHaveLength(0);
  });
});
