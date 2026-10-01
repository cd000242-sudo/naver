// src/__tests__/imageSourceCaption.test.ts
// [2026-10-01 사용자 요청 "이미지마다 출처를 입력하면 자동으로 들어가게"]
//
// 끊겨 있던 배선 세 곳을 잠근다.
//   1) formAndAutomation 의 페이로드 화이트리스트에 caption 이 없어서, 입력은 저장되는데
//      발행에는 안 들어갔다 (image.link 가 2026-07-30 부터 그 상태로 남아 있다).
//   2) applyCaption 이 문서의 '첫 번째' 캡션 칸을 집어서, 이미지가 여러 장이면 2번째
//      이후 사진의 출처가 전부 1번 사진에 겹쳤다.
//   3) 그 함수는 아무도 호출하지 않는 insertImages() 안에만 배선돼 있었다.
// 그리고 캡션에 글자가 들어가면 본문 캐럿 탐색이 캡션을 집을 수 있다는 2차 위험도 함께.

import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { applyCaptionToLastImage } from '../automation/imageCaption.js';

const readSrc = (rel: string): string => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

type ImageHelpers = typeof import('../renderer/utils/imageHelpers');
let deriveImageSourceCaption: ImageHelpers['deriveImageSourceCaption'];
let IMAGE_CAPTION_MAX_LENGTH: ImageHelpers['IMAGE_CAPTION_MAX_LENGTH'];

beforeAll(async () => {
  // imageHelpers 는 로드 시점에 window 를 건드린다 (imageSlotSpace.test.ts 와 같은 이유).
  (globalThis as any).window = (globalThis as any).window || {};
  const mod = await import('../renderer/utils/imageHelpers');
  deriveImageSourceCaption = mod.deriveImageSourceCaption;
  IMAGE_CAPTION_MAX_LENGTH = mod.IMAGE_CAPTION_MAX_LENGTH;
});

describe('deriveImageSourceCaption — 수집 이미지 출처 프리필', () => {
  it('수집 이미지의 원본 주소에서 도메인만 뽑는다', () => {
    expect(deriveImageSourceCaption({
      isCollected: true,
      url: 'https://imgnews.pstatic.net/image/001/2026/10/01/photo.jpg?type=w800',
    })).toBe('imgnews.pstatic.net');
  });

  it('www. 는 떼고 보여 준다', () => {
    expect(deriveImageSourceCaption({ isCollected: true, url: 'https://www.hani.co.kr/a.jpg' }))
      .toBe('hani.co.kr');
  });

  it('sourceUrl 이 url 보다 우선한다 — 공식문서 캡처는 원문 주소를 들고 온다', () => {
    expect(deriveImageSourceCaption({
      isCollected: true,
      sourceUrl: 'https://www.gov.kr/portal/notice/1',
      url: 'https://cdn.example.com/cache/x.png',
    })).toBe('gov.kr');
  });

  it('AI 생성 이미지에는 출처를 만들지 않는다 — 생성 제공자 주소는 출처가 아니다', () => {
    // 이걸 허용하면 "출처: image.pollinations.ai" 같은 거짓 출처가 사진 아래 박힌다.
    expect(deriveImageSourceCaption({
      provider: 'pollinations',
      url: 'https://image.pollinations.ai/prompt/abc.jpg',
    })).toBe('');
    expect(deriveImageSourceCaption({
      provider: 'nano-banana-pro',
      url: 'https://generativelanguage.googleapis.com/x.png',
    })).toBe('');
  });

  it('직접 넣은 로컬 파일에는 출처가 없다', () => {
    expect(deriveImageSourceCaption({ provider: 'local', url: 'file:///C:/photos/a.jpg' })).toBe('');
    expect(deriveImageSourceCaption({ provider: 'local-folder', filePath: 'C:/photos/a.jpg' })).toBe('');
  });

  it('쇼핑 수집 이미지도 도메인을 뽑는다', () => {
    expect(deriveImageSourceCaption({ provider: 'shopping', url: 'https://shop1.phinf.naver.net/p.jpg' }))
      .toBe('shop1.phinf.naver.net');
    expect(deriveImageSourceCaption({ source: 'coupang-collect', url: 'https://thumbnail.coupangcdn.com/p.jpg' }))
      .toBe('thumbnail.coupangcdn.com');
  });

  it('주소가 없거나 깨졌으면 빈 문자열', () => {
    expect(deriveImageSourceCaption({ isCollected: true })).toBe('');
    expect(deriveImageSourceCaption({ isCollected: true, url: 'not-a-url' })).toBe('');
    expect(deriveImageSourceCaption({ isCollected: true, url: 'data:image/png;base64,AAA' })).toBe('');
    expect(deriveImageSourceCaption(null)).toBe('');
    expect(deriveImageSourceCaption(undefined)).toBe('');
  });

  it('길이 상한은 200자다', () => {
    expect(IMAGE_CAPTION_MAX_LENGTH).toBe(200);
  });
});

// ── applyCaptionToLastImage ──────────────────────────────────────────────────

interface FakeSelf {
  self: any;
  clicks: Array<{ x: number; y: number }>;
  typed: string[];
  logs: string[];
}

function makeSelf(options: {
  target?: { found: boolean; x: number; y: number; selector: string };
  verified?: boolean;
  frameOffset?: { x: number; y: number };
  evaluateThrows?: boolean;
}): FakeSelf {
  const clicks: Array<{ x: number; y: number }> = [];
  const typed: string[] = [];
  const logs: string[] = [];

  const frame = {
    evaluate: vi.fn(async (_fn: any, payload: any) => {
      if (options.evaluateThrows) throw new Error('frame detached');
      // 1번째 호출은 좌표 탐색, 2번째는 입력 확인 (payload 모양으로 구분한다).
      if (payload && 'expected' in payload) return options.verified ?? true;
      return options.target ?? { found: false, x: 0, y: 0, selector: '' };
    }),
  };

  const page = {
    $: vi.fn(async () => (options.frameOffset
      ? { boundingBox: async () => ({ x: options.frameOffset!.x, y: options.frameOffset!.y, width: 800, height: 600 }) }
      : null)),
    mouse: { click: vi.fn(async (x: number, y: number) => { clicks.push({ x, y }); }) },
    keyboard: {
      type: vi.fn(async (text: string) => { typed.push(text); }),
      // safeKeyboardType 은 타이핑 끝에 Escape 를 누른다(자동완성 팝업 차단).
      // 캡션 입력에서는 이게 포커스를 빼 주는 역할도 해서, 확인 읽기는 그 뒤에 일어난다.
      press: vi.fn(async () => undefined),
    },
  };

  const self = {
    ensurePage: () => page,
    getAttachedFrame: async () => frame,
    log: (msg: string) => { logs.push(msg); },
    delay: async () => undefined,
  };

  return { self, clicks, typed, logs };
}

describe('applyCaptionToLastImage', () => {
  it('빈 출처면 에디터를 건드리지 않는다 — 안 넣은 사람에게 캡션을 만들지 않는다', async () => {
    const fake = makeSelf({ target: { found: true, x: 10, y: 20, selector: '.se-caption' } });
    expect(await applyCaptionToLastImage(fake.self, '   ')).toBe(false);
    expect(fake.clicks).toHaveLength(0);
    expect(fake.typed).toHaveLength(0);
  });

  it('캡션 칸을 찾으면 iframe 오프셋을 더한 좌표를 클릭하고 타이핑한다', async () => {
    const fake = makeSelf({
      target: { found: true, x: 100, y: 200, selector: '.se-caption' },
      verified: true,
      frameOffset: { x: 30, y: 70 },
    });

    expect(await applyCaptionToLastImage(fake.self, 'news.naver.com')).toBe(true);
    expect(fake.clicks).toEqual([{ x: 130, y: 270 }]);
    expect(fake.typed.join('')).toBe('news.naver.com');
    expect(fake.logs.some((l) => l.includes('news.naver.com'))).toBe(true);
  });

  it('캡션 칸을 못 찾으면 클릭/타이핑 없이 false — 발행은 계속된다', async () => {
    const fake = makeSelf({ target: { found: false, x: 0, y: 0, selector: '' } });
    expect(await applyCaptionToLastImage(fake.self, 'news.naver.com')).toBe(false);
    expect(fake.clicks).toHaveLength(0);
    expect(fake.typed).toHaveLength(0);
    expect(fake.logs.some((l) => l.includes('사진 설명 칸'))).toBe(true);
  });

  it('입력 확인에 실패하면 false 를 돌려주되 던지지 않는다', async () => {
    const fake = makeSelf({
      target: { found: true, x: 10, y: 10, selector: '.se-caption' },
      verified: false,
    });
    expect(await applyCaptionToLastImage(fake.self, '출처')).toBe(false);
    expect(fake.logs.some((l) => l.includes('확인하지 못했습니다'))).toBe(true);
  });

  it('프레임이 떨어져도 던지지 않는다 — 캡션 때문에 발행이 멈추면 안 된다', async () => {
    const fake = makeSelf({ evaluateThrows: true });
    await expect(applyCaptionToLastImage(fake.self, '출처')).resolves.toBe(false);
  });
});

// ── 배선 (source guard) ──────────────────────────────────────────────────────

describe('출처 배선 계약', () => {
  it('발행 페이로드가 caption 을 싣는다 — 여기서 빠지면 입력만 되고 발행에 안 들어간다', () => {
    const src = readSrc('renderer/modules/formAndAutomation.ts');
    const block = src.slice(
      src.indexOf('payload.generatedImages = imagesForPublish'),
      src.indexOf('.filter((img: any) => Boolean(img?.heading)'),
    );
    expect(block).toContain('caption: img.caption');
  });

  it('실제 발행 경로(insertImagesAtCurrentCursor)가 출처를 적용한다', () => {
    const src = readSrc('automation/imageHelpers.ts');
    const fnStart = src.indexOf('export async function insertImagesAtCurrentCursor');
    const fnEnd = src.indexOf('export async function setImageSizeAndAttachLink');
    expect(fnStart).toBeGreaterThan(0);
    expect(fnEnd).toBeGreaterThan(fnStart);
    expect(src.slice(fnStart, fnEnd)).toContain('applyCaptionToLastImage(self, sourceCaption)');
  });

  it('출처 입력은 문서너비/링크 단계 뒤에 온다 — 먼저 넣으면 더블클릭에 포커스가 깨진다', () => {
    const src = readSrc('automation/imageHelpers.ts');
    const fnStart = src.indexOf('export async function insertImagesAtCurrentCursor');
    const body = src.slice(fnStart, src.indexOf('export async function setImageSizeAndAttachLink'));
    expect(body.indexOf('setImageSizeToDocumentWidth(self)'))
      .toBeLessThan(body.indexOf('applyCaptionToLastImage(self, sourceCaption)'));
  });

  it('applyCaption 은 구현을 갖지 않고 위임한다 — 첫-이미지 버그가 되살아나지 않게', () => {
    const src = readSrc('automation/imageHelpers.ts');
    const fnStart = src.indexOf('export async function applyCaption(');
    const body = src.slice(fnStart, fnStart + 400);
    expect(body).toContain('applyCaptionToLastImage');
    // 종전 구현의 흔적(첫 번째 매칭 칸을 집던 코드)이 남아 있으면 안 된다.
    expect(body).not.toContain("frame.$(selector)");
  });

  it('카드에 출처 입력칸이 있고 change 에서 ImageManager 에 저장한다', () => {
    const src = readSrc('renderer/modules/imageDisplayGrid.ts');
    expect(src).toContain('image-source-caption-input');
    expect(src).toContain('ImageManager.setImageCaption(');
    expect(src).toContain('ImageManager.setImageCaptionPrefill(');
    // 입력 중 재렌더로 포커스가 날아가지 않게 change 에서만 쓴다.
    expect(src).toMatch(/addEventListener\('change'/);
  });

  it('ImageManager 는 지정한 이미지 하나에만 출처를 쓴다 (키 기반)', () => {
    const src = readSrc('renderer/modules/imageManagerCore.ts');
    const fnStart = src.indexOf('setImageCaption(headingTitle: string');
    const body = src.slice(fnStart, src.indexOf('setImageCaptionPrefill('));
    expect(body).toContain('getStableImageKey(img) === key');
    expect(body).toContain('captionTouched: true');
    // syncAllPreviews 를 부르면 타이핑 중 그리드가 다시 그려져 포커스가 날아간다.
    expect(body).not.toContain('syncAllPreviews');
  });

  it('프리필은 사용자가 손댄 칸을 덮지 않는다', () => {
    const src = readSrc('renderer/modules/imageManagerCore.ts');
    const fnStart = src.indexOf('setImageCaptionPrefill(headingTitle: string');
    const body = src.slice(fnStart, fnStart + 900);
    expect(body).toContain('captionTouched === true) return');
  });
});

describe('캡션이 본문 캐럿을 가로채지 않는다', () => {
  // 캡션도 .se-text-paragraph 다. 지금까지는 비어 있어 높이가 0이라 후보에서 떨어졌는데,
  // 출처가 들어가면 높이를 얻어 '마지막 문단'으로 뽑힌다 → 본문이 사진 설명 안으로 들어간다.
  const src = readSrc('automation/richTextPaste.ts');

  it('캡션 셀렉터 상수를 둔다 (panelSelector 에 섞지 않는다 — 측정 의미가 달라진다)', () => {
    expect(src).toContain("const SMART_EDITOR_CAPTION_SELECTOR = '.se-caption, .se-module-caption'");
  });

  it('focusLastEditableLine 의 선택 기반 경로가 캡션을 건너뛴다', () => {
    const fn = src.slice(
      src.indexOf('export async function focusLastEditableLine'),
      src.indexOf('function editableRootText'),
    );
    expect(fn).toContain('closest(captionSelector)) continue');
  });

  it('focusLastEditableLine 의 클릭 폴백도 캡션을 건너뛴다', () => {
    const fn = src.slice(
      src.indexOf('export async function focusLastEditableLine'),
      src.indexOf('function editableRootText'),
    );
    expect(fn).toContain('SMART_EDITOR_CAPTION_SELECTOR');
    expect(fn).toContain('if (inCaption) continue');
  });

  it('ensureTailTypingReady 의 문단 클릭이 캡션을 건너뛴다', () => {
    const fn = src.slice(src.indexOf('export async function ensureTailTypingReady'));
    expect(fn).toContain('closest(captionSelector)) continue');
    expect(fn).toContain('captionSelector: SMART_EDITOR_CAPTION_SELECTOR');
  });

  it('마지막 블록 판정에서 캡션 글자를 본문으로 세지 않는다', () => {
    expect(src).toContain('probeClone.querySelectorAll(captionSelector)');
  });
});
