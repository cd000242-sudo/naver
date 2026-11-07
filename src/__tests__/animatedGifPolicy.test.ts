/**
 * [2026-11-07 사장님] GPT Image 2.6 으로 움짤(GIF) 만들기 — 순수 정책 시험.
 * 2.6(sunburst/flare)에서만 되고, 썸네일은 항상 정지 이미지이며, 2.5 는 조용히 바꾸지 않고 안내 후 멈춘다.
 */
import { describe, expect, it } from 'vitest';
import {
  GIF_MAX_BYTES,
  GIF_ONLY_26_MESSAGE,
  GIF_NO_SHOPPING_MESSAGE,
  assertGifSavable,
  buildGifRequestFields,
  isAnimatedGifImage,
  isGifBuffer,
  isGifCapableOpenaiModel,
  isGifFatalError,
  planAnimatedGif,
  readGifSize,
} from '../image/animatedGifPolicy.js';

const S26 = 'gpt-image-2.6-sunburst';
const F26 = 'gpt-image-2.6-flare';

function fakeGif(totalBytes = 2048, width = 64, height = 48): Buffer {
  const buf = Buffer.alloc(totalBytes, 0x11);
  buf.write('GIF89a', 0, 'latin1');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

describe('isGifCapableOpenaiModel — 2.6 두 모델만', () => {
  it.each([S26, F26, ` ${S26} `])('%j 는 가능', (m) => expect(isGifCapableOpenaiModel(m)).toBe(true));
  it.each(['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-1.5', 'gpt-image-2', 'dall-e-3', '', undefined, null, 'gpt-image-2.6-other'])(
    '%j 는 불가', (m) => expect(isGifCapableOpenaiModel(m as any)).toBe(false),
  );
});

describe('buildGifRequestFields — 공식 범위(프레임 2–16, 간격 20–2000ms)', () => {
  it('기본은 9장 × 200ms', () => {
    expect(buildGifRequestFields()).toEqual({ output_format: 'gif', frame_count: 9, frame_duration_ms: 200 });
  });
  it.each([[1, 2], [2, 2], [16, 16], [17, 16], [100, 16], [4.4, 4], [Number.NaN, 9], [undefined, 9]])(
    'frame_count %j → %j', (input, expected) => {
      expect(buildGifRequestFields({ frameCount: input as any }).frame_count).toBe(expected);
    },
  );
  it.each([[5, 20], [20, 20], [2000, 2000], [5000, 2000], [Number.NaN, 200]])(
    'frame_duration_ms %j → %j', (input, expected) => {
      expect(buildGifRequestFields({ frameDurationMs: input as any }).frame_duration_ms).toBe(expected);
    },
  );
});

describe('GIF 바이트 판정', () => {
  it('GIF87a / GIF89a 는 GIF, PNG·JPEG·짧은 버퍼는 아니다', () => {
    expect(isGifBuffer(fakeGif())).toBe(true);
    const old = fakeGif(); old.write('GIF87a', 0, 'latin1');
    expect(isGifBuffer(old)).toBe(true);
    expect(isGifBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe(false);
    expect(isGifBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isGifBuffer(Buffer.from('GIF'))).toBe(false);
  });
  it('헤더에서 한 프레임 크기를 읽는다', () => {
    expect(readGifSize(fakeGif(100, 512, 384))).toEqual({ width: 512, height: 384 });
    expect(readGifSize(Buffer.from('nope'))).toBeNull();
  });
});

describe('assertGifSavable — 저장 전 검사(조용히 JPEG 로 바꾸지 않는다)', () => {
  it('정상 GIF 는 통과', () => {
    expect(() => assertGifSavable(fakeGif())).not.toThrow();
  });
  it('GIF 가 아닌 응답은 GIF_NOT_RETURNED 로 멈춘다', () => {
    expect(() => assertGifSavable(Buffer.alloc(4096, 1))).toThrow(/^GIF_NOT_RETURNED/);
  });
  it('20MB 를 넘으면 GIF_TOO_LARGE 로 멈추고 메시지에 크기와 한도가 나온다', () => {
    const big = fakeGif(GIF_MAX_BYTES + 1);
    expect(() => assertGifSavable(big)).toThrow(/^GIF_TOO_LARGE/);
    try { assertGifSavable(big); } catch (e) { expect(String((e as Error).message)).toMatch(/20\s*MB/i); }
  });
  it('딱 20MB 는 통과', () => {
    expect(() => assertGifSavable(fakeGif(GIF_MAX_BYTES))).not.toThrow();
  });
  it('GIF_ 꼬리표 오류만 치명(재시도 금지)으로 본다', () => {
    expect(isGifFatalError(new Error('GIF_TOO_LARGE: x'))).toBe(true);
    expect(isGifFatalError(new Error('GIF_NOT_RETURNED: x'))).toBe(true);
    expect(isGifFatalError(new Error('timeout of 120000ms exceeded'))).toBe(false);
    expect(isGifFatalError(null)).toBe(false);
  });
});

describe('isAnimatedGifImage', () => {
  it('확장자 · MIME · 미리보기 주소 중 하나만 GIF 여도 참', () => {
    expect(isAnimatedGifImage({ filePath: 'C:/a/b.GIF' })).toBe(true);
    expect(isAnimatedGifImage({ mimeType: 'image/gif' })).toBe(true);
    expect(isAnimatedGifImage({ previewDataUrl: 'data:image/gif;base64,AAA' })).toBe(true);
    expect(isAnimatedGifImage({ filePath: 'C:/a/b.png', previewDataUrl: 'data:image/png;base64,AAA' })).toBe(false);
    expect(isAnimatedGifImage(null)).toBe(false);
    expect(isAnimatedGifImage({})).toBe(false);
  });
});

describe('planAnimatedGif — 어느 항목을 움짤로 만들지, 막을지', () => {
  const sec = (extra: Record<string, unknown> = {}) => ({ heading: '소제목', isThumbnail: false, ...extra });
  const thumb = (extra: Record<string, unknown> = {}) => ({ heading: '🖼️ 썸네일', isThumbnail: true, ...extra });
  const base = { provider: 'openai-image', model: S26, settingOn: false, articleSectionImages: true, isShoppingConnect: false };

  it('아무것도 요청하지 않았으면 비어 있다', () => {
    const items = [sec(), thumb()];
    expect(planAnimatedGif({ ...base, items }).size).toBe(0);
  });

  it('카드 버튼(animatedGif=true)은 2.6 에서 그 항목만 움짤', () => {
    const a = sec({ animatedGif: true }); const b = sec();
    const plan = planAnimatedGif({ ...base, items: [a, b] });
    expect(plan.has(a)).toBe(true);
    expect(plan.has(b)).toBe(false);
  });

  it('설정 체크 ON + 본문 소제목 이미지 호출이면 소제목 전부, 썸네일은 제외', () => {
    const a = sec(); const b = sec(); const t = thumb();
    const plan = planAnimatedGif({ ...base, settingOn: true, items: [t, a, b] });
    expect(plan.has(a) && plan.has(b)).toBe(true);
    expect(plan.has(t)).toBe(false);
  });

  it('설정 체크 ON 이어도 이미지 스튜디오 같은 비-본문 호출(articleSectionImages 아님)은 정지 이미지', () => {
    const a = sec();
    expect(planAnimatedGif({ ...base, settingOn: true, articleSectionImages: false, items: [a] }).size).toBe(0);
  });

  it('썸네일에 animatedGif=true 를 실어도 정지 이미지로 둔다', () => {
    const t = thumb({ animatedGif: true });
    expect(planAnimatedGif({ ...base, items: [t] }).size).toBe(0);
    const named = { heading: '썸네일', animatedGif: true };
    expect(planAnimatedGif({ ...base, items: [named] }).size).toBe(0);
  });

  it.each(['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'])('%s 선택 + 카드 버튼 → 안내 후 멈춤(조용히 바꾸지 않음)', (model) => {
    expect(() => planAnimatedGif({ ...base, model, items: [sec({ animatedGif: true })] })).toThrow(GIF_ONLY_26_MESSAGE);
  });

  it('2.5 선택 + 설정 체크 ON → 안내 후 멈춤', () => {
    expect(() => planAnimatedGif({ ...base, model: 'gpt-image-2.5-flare', settingOn: true, items: [sec()] })).toThrow(GIF_ONLY_26_MESSAGE);
  });

  it('2.5 선택이어도 움짤 요청이 없으면(체크 OFF, 썸네일뿐) 멈추지 않는다', () => {
    expect(() => planAnimatedGif({ ...base, model: 'gpt-image-2.5-flare', items: [sec()] })).not.toThrow();
    expect(() => planAnimatedGif({ ...base, model: 'gpt-image-2.5-flare', settingOn: true, items: [thumb()] })).not.toThrow();
  });

  it.each(['flow', 'dropshot', 'genspark', 'codex-image', 'nano-banana-2', 'dall-e-3'])(
    '%s 엔진 + 카드 버튼 → 안내 후 멈춤', (provider) => {
      expect(() => planAnimatedGif({ ...base, provider, items: [sec({ animatedGif: true })] })).toThrow(GIF_ONLY_26_MESSAGE);
    },
  );

  it.each(['flow', 'codex-image'])('%s 엔진 + 설정 체크만 ON(옛 저장값) → 막지 않고 정지 이미지', (provider) => {
    const plan = planAnimatedGif({ ...base, provider, settingOn: true, items: [sec()] });
    expect(plan.size).toBe(0);
  });

  it('쇼핑 글: 카드 버튼은 안내 후 멈춤, 설정 체크는 무시', () => {
    expect(() => planAnimatedGif({ ...base, isShoppingConnect: true, items: [sec({ animatedGif: true })] })).toThrow(GIF_NO_SHOPPING_MESSAGE);
    expect(planAnimatedGif({ ...base, isShoppingConnect: true, settingOn: true, items: [sec()] }).size).toBe(0);
  });

  it('모델이 비어 있으면 앱 기본(2.6 Sunburst)으로 보고 움짤 가능', () => {
    const a = sec({ animatedGif: true });
    expect(planAnimatedGif({ ...base, model: '', items: [a] }).has(a)).toBe(true);
  });

  it('안내 문구는 짧다', () => {
    expect(GIF_ONLY_26_MESSAGE.length).toBeLessThanOrEqual(30);
    expect(GIF_ONLY_26_MESSAGE).toContain('GPT 이미지 2.6');
  });
});
