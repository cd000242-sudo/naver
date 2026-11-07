// @vitest-environment happy-dom
/**
 * [2026-11-07 사장님] 움짤 화면 쪽 시험 — 설정 체크(두 곳) · 소제목 카드 "🎞️ 움짤로" 버튼.
 * 2.6 이 아니면 안내만 하고 막는다(자동으로 바꾸지 않음). 모든 호출은 가짜 — 유료 호출 0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANIMATED_GIF_ONLY_26_NOTICE,
  ANIMATED_GIF_SETTING_IDS,
  animatedGifAvailability,
  animatedGifSettingInstall,
  animatedGifSettingPaint,
  animatedGifSettingResetForTest,
} from '../renderer/modules/headingImageAnimatedSetting.js';
import { animatedGifIsAnimated, animatedGifRegenerateCard } from '../renderer/modules/animatedGifCard.js';
import { ANIMATED_GIF_FRAME_COUNT, getAnimatedGifCostKRW, getOpenAIImageCostKRW } from '../renderer/utils/imageCostUtils.js';

const S26 = 'gpt-image-2.6-sunburst';
const S25 = 'gpt-image-2.5-sunburst';

function mountSettingDom(engine: string, model?: string) {
  document.body.innerHTML = `
    <select id="image-source-select"><option value="openai-image">덕트테이프</option><option value="flow">Flow</option><option value="codex-image">Codex</option></select>
    ${model ? `<input type="radio" name="openai-image-model" value="${model}" checked>` : ''}
    <input type="checkbox" id="heading-image-animated-option"><span id="heading-image-animated-option-note"></span>
    <input type="checkbox" id="heading-image-animated-include"><span id="heading-image-animated-include-note"></span>`;
  (document.getElementById('image-source-select') as HTMLSelectElement).value = engine;
}

const box = (id: string) => document.getElementById(id) as HTMLInputElement;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = '';
  animatedGifSettingResetForTest();
  for (const key of ['appendLog', 'toastManager', 'ImageManager', 'generateImagesWithCostSafety', 'syncGlobalImagesFromImageManager', 'toFileUrlMaybe']) {
    delete (globalThis as any)[key];
  }
  delete (window as any).api;
});

describe('animatedGifAvailability — 2.6 + GPT 이미지(덕트테이프)에서만', () => {
  it.each([[ 'openai-image', S26 ], [ 'openai-image', 'gpt-image-2.6-flare' ], [ 'openai-image', '' ]])(
    '%s / %j → 가능 (빈 모델은 앱 기본 2.6)', (engine, model) => {
      expect(animatedGifAvailability(engine, model)).toEqual({ available: true, notice: '' });
    },
  );
  it.each([[ 'openai-image', S25 ], [ 'openai-image', 'gpt-image-2.5-flare' ], [ 'flow', S26 ], [ 'codex-image', S26 ], [ 'dropshot', '' ], [ '', S26 ]])(
    '%s / %j → 불가 + 같은 안내 문구', (engine, model) => {
      expect(animatedGifAvailability(engine, model)).toEqual({ available: false, notice: ANIMATED_GIF_ONLY_26_NOTICE });
    },
  );
  it('안내 문구는 짧고 main 과 같다', () => {
    expect(ANIMATED_GIF_ONLY_26_NOTICE).toBe('움짤은 GPT 이미지 2.6 에서만 됩니다.');
  });
});

describe('getAnimatedGifCostKRW — 추정: 프레임 수 × 정지 단가', () => {
  it('9프레임 × 정지 한 장', () => {
    expect(ANIMATED_GIF_FRAME_COUNT).toBe(9);
    expect(getAnimatedGifCostKRW(S26, 'medium', 1400)).toBe(getOpenAIImageCostKRW(S26, 'medium', 1400) * 9);
    expect(getAnimatedGifCostKRW(S26, 'low', 1400, 4)).toBe(getOpenAIImageCostKRW(S26, 'low', 1400) * 4);
  });
});

describe('설정 체크 "움짤로 만들기" — 이미지 탭 · 풀오토 이미지 설정 두 칸이 한 값', () => {
  beforeEach(() => animatedGifSettingResetForTest());

  it('저장값 ON + 덕트테이프 2.6: 두 칸 모두 켜져 있고 쓸 수 있다', async () => {
    mountSettingDom('openai-image', S26);
    const api = { getConfig: async () => ({ headingImageAnimated: true, openaiImageModel: S26, openaiImageQuality: 'medium' }), saveConfig: vi.fn() };
    await animatedGifSettingInstall(api as any, () => undefined);
    for (const id of ANIMATED_GIF_SETTING_IDS) {
      expect(box(id).checked).toBe(true);
      expect(box(id).disabled).toBe(false);
    }
    expect(document.getElementById('heading-image-animated-option-note')?.textContent).toMatch(/₩.*추정/u);
  });

  it('다른 엔진(Flow)이면 꺼진 칸은 잠기고 안내만 보인다', async () => {
    mountSettingDom('flow');
    const api = { getConfig: async () => ({ headingImageAnimated: false, openaiImageModel: S26 }), saveConfig: vi.fn() };
    await animatedGifSettingInstall(api as any, () => undefined);
    expect(box('heading-image-animated-option').disabled).toBe(true);
    expect(box('heading-image-animated-option').checked).toBe(false);
    expect(document.getElementById('heading-image-animated-option-note')?.textContent).toBe(ANIMATED_GIF_ONLY_26_NOTICE);
  });

  it('Codex 구독 이미지에서도 잠긴다', async () => {
    mountSettingDom('codex-image');
    await animatedGifSettingInstall({ getConfig: async () => ({ openaiImageModel: S26 }), saveConfig: vi.fn() } as any, () => undefined);
    expect(box('heading-image-animated-include').disabled).toBe(true);
  });

  it('2.5 가 골라져 있으면 꺼진 칸은 잠기고 안내', async () => {
    mountSettingDom('openai-image', S25);
    await animatedGifSettingInstall({ getConfig: async () => ({ openaiImageModel: S25 }), saveConfig: vi.fn() } as any, () => undefined);
    expect(box('heading-image-animated-option').disabled).toBe(true);
    expect(document.getElementById('heading-image-animated-include-note')?.textContent).toBe(ANIMATED_GIF_ONLY_26_NOTICE);
  });

  it('옛 저장값이 켜져 있는데 엔진이 바뀐 경우: 끌 수는 있다(켜진 채 잠기지 않음)', async () => {
    mountSettingDom('flow');
    await animatedGifSettingInstall({ getConfig: async () => ({ headingImageAnimated: true, openaiImageModel: S26 }), saveConfig: vi.fn() } as any, () => undefined);
    expect(box('heading-image-animated-option').checked).toBe(true);
    expect(box('heading-image-animated-option').disabled).toBe(false);
  });

  it('체크하면 headingImageAnimated 를 저장하고 반대편 칸도 같은 값으로 바뀐다', async () => {
    mountSettingDom('openai-image', S26);
    const saveConfig = vi.fn(async (update: any) => ({ success: true, ...update }));
    const messages: string[] = [];
    await animatedGifSettingInstall({ getConfig: async () => ({ openaiImageModel: S26 }), saveConfig } as any, (m) => messages.push(m));
    box('heading-image-animated-option').checked = true;
    box('heading-image-animated-option').dispatchEvent(new Event('change', { bubbles: true }));
    await flush(); await flush();
    expect(saveConfig).toHaveBeenCalledWith({ headingImageAnimated: true });
    expect(box('heading-image-animated-include').checked).toBe(true);
    expect(messages[0]).toContain('움짤');
  });

  it('저장이 확인되지 않으면 이전 상태로 되돌리고 알린다', async () => {
    mountSettingDom('openai-image', S26);
    const kinds: string[] = [];
    await animatedGifSettingInstall({ getConfig: async () => ({ openaiImageModel: S26 }), saveConfig: async () => ({ success: false }) } as any, (_m, k) => kinds.push(k));
    box('heading-image-animated-include').checked = true;
    box('heading-image-animated-include').dispatchEvent(new Event('change', { bubbles: true }));
    await flush(); await flush();
    expect(box('heading-image-animated-include').checked).toBe(false);
    expect(kinds).toContain('error');
  });

  it('나중에 열린 창(생성 후 추가된 칸)도 animatedGifSettingPaint 로 저장값을 그린다', async () => {
    mountSettingDom('openai-image', S26);
    await animatedGifSettingInstall({ getConfig: async () => ({ headingImageAnimated: true, openaiImageModel: S26 }), saveConfig: vi.fn() } as any, () => undefined);
    box('heading-image-animated-include').checked = false;
    animatedGifSettingPaint();
    expect(box('heading-image-animated-include').checked).toBe(true);
  });
});

describe('animatedGifIsAnimated', () => {
  it('data:image/gif 또는 .gif 경로면 움짤', () => {
    expect(animatedGifIsAnimated({ previewDataUrl: 'data:image/gif;base64,AAA' })).toBe(true);
    expect(animatedGifIsAnimated({ filePath: 'C:/a/b.gif' })).toBe(true);
    expect(animatedGifIsAnimated({ filePath: 'C:/a/b.png', previewDataUrl: 'data:image/png;base64,AAA' })).toBe(false);
  });
});

describe('animatedGifRegenerateCard — 소제목 카드 한 장을 움짤로 다시 만들기', () => {
  const messages: Array<{ kind: string; text: string }> = [];
  const images: Record<string, any> = {};
  let generate: ReturnType<typeof vi.fn>;
  let getConfig: ReturnType<typeof vi.fn>;

  const baseRequest = () => ({
    items: [{ heading: '신청 자격 3가지 확인', prompt: 'a renter', englishPrompt: 'a renter reading a notice', isThumbnail: false, allowText: false }],
    postTitle: '청년 월세 지원', isFullAuto: true,
  });

  function setup(opts: { model?: string; result?: any } = {}) {
    messages.length = 0;
    for (const k of Object.keys(images)) delete images[k];
    document.body.innerHTML = '<div id="generated-images-grid"><div class="generated-image-item" data-image-index="1"><img src="old.png"></div></div><button id="b">🎞️ 움짤로</button>';
    generate = vi.fn(async () => opts.result ?? {
      success: true,
      images: [{ heading: '신청 자격 3가지 확인', filePath: 'C:/posts/a.gif', previewDataUrl: 'data:image/gif;base64,R0lGODlh', provider: 'openai-image', mimeType: 'image/gif' }],
    });
    getConfig = vi.fn(async () => ({ openaiImageModel: opts.model ?? S26, openaiImageQuality: 'low' }));
    (window as any).api = { getConfig };
    const g = globalThis as any;
    g.appendLog = (text: string) => messages.push({ kind: 'log', text });
    g.toastManager = {
      success: (t: string) => messages.push({ kind: 'success', text: t }),
      warning: (t: string) => messages.push({ kind: 'warning', text: t }),
      error: (t: string) => messages.push({ kind: 'error', text: t }),
    };
    g.ImageManager = { setImage: (heading: string, image: any) => { images[heading] = image; } };
    g.generateImagesWithCostSafety = generate;
    g.syncGlobalImagesFromImageManager = vi.fn();
    g.toFileUrlMaybe = (p: string) => (p.startsWith('data:') ? p : `file:///${p}`);
  }

  const run = (source = 'openai-image', request: any = baseRequest()) =>
    animatedGifRegenerateCard({ index: 1, heading: '신청 자격 3가지 확인', prompt: 'a renter', source, request, button: document.getElementById('b') as HTMLButtonElement });

  it('성공: 덕트테이프 2.6 으로 animatedGif 항목 1개를 보내고, 받은 GIF 로 카드·이미지 목록을 바꾼다', async () => {
    setup();
    expect(await run()).toBe(true);
    const sent = generate.mock.calls[0][0];
    expect(sent.provider).toBe('openai-image');
    expect(sent.regenerate).toBe(true);
    expect(sent.items).toHaveLength(1);
    expect(sent.items[0]).toMatchObject({ animatedGif: true, isThumbnail: false });
    expect(sent.items[0].heading).toBe('신청 자격 3가지 확인');
    const stored = images['신청 자격 3가지 확인'];
    expect(stored.filePath).toBe('C:/posts/a.gif');
    expect(stored.previewDataUrl).toMatch(/^data:image\/gif;base64,/);
    expect(stored.provider).toBe('openai-image');
    expect(stored.disableTextOverlay).toBe(true);
    expect((document.querySelector('#generated-images-grid img') as HTMLImageElement).src).toMatch(/^data:image\/gif/);
    expect(messages.some((m) => m.kind === 'success')).toBe(true);
    expect((document.getElementById('b') as HTMLButtonElement).disabled).toBe(false);
  });

  it('비용 추정(프레임 9장분)을 로그에 남긴다', async () => {
    setup();
    await run();
    expect(messages.some((m) => m.kind === 'log' && /₩/.test(m.text) && /추정/.test(m.text))).toBe(true);
  });

  it.each([['flow'], ['codex-image'], ['dropshot']])('%s 엔진이면 안내만 하고 멈춘다 — 생성 호출 0회', async (source) => {
    setup();
    expect(await run(source)).toBe(false);
    expect(generate).not.toHaveBeenCalled();
    expect(messages.some((m) => m.text.includes(ANIMATED_GIF_ONLY_26_NOTICE))).toBe(true);
    expect(Object.keys(images)).toHaveLength(0);
  });

  it('저장된 모델이 2.5 면 안내만 하고 멈춘다(자동으로 2.6 으로 바꾸지 않음)', async () => {
    setup({ model: S25 });
    expect(await run()).toBe(false);
    expect(generate).not.toHaveBeenCalled();
    expect(messages.some((m) => m.text.includes(ANIMATED_GIF_ONLY_26_NOTICE))).toBe(true);
  });

  it('썸네일 칸은 움짤로 만들지 않는다', async () => {
    setup();
    const request = { ...baseRequest(), items: [{ heading: '🖼️ 썸네일', prompt: 'x', isThumbnail: true }] };
    expect(await run('openai-image', request)).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it('GIF 가 아닌 결과가 오면 이미지 목록을 바꾸지 않고 오류를 알린다', async () => {
    setup({ result: { success: true, images: [{ heading: 'x', filePath: 'C:/posts/a.png', previewDataUrl: 'data:image/png;base64,AAA', provider: 'openai-image' }] } });
    expect(await run()).toBe(false);
    expect(Object.keys(images)).toHaveLength(0);
    expect(messages.some((m) => m.kind === 'error')).toBe(true);
    expect((document.getElementById('b') as HTMLButtonElement).disabled).toBe(false);
  });

  it('생성이 실패하면 main 이 준 안내(예: 20MB 초과)를 그대로 보여 준다', async () => {
    setup();
    generate.mockRejectedValueOnce(new Error('GIF_TOO_LARGE: 움짤이 22.0MB 로 네이버 한도 20MB 를 넘습니다.'));
    expect(await run()).toBe(false);
    expect(messages.some((m) => m.kind === 'error' && m.text.includes('20MB'))).toBe(true);
    expect(Object.keys(images)).toHaveLength(0);
  });
});
