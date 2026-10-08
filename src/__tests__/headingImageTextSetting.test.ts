/**
 * [2026-10-08 사장님] "소제목 이미지에 소제목 글자 넣기" is read from config inside generateImages, so every flow
 * (single, continuous, multi-account, regeneration) gets it without each renderer path carrying a flag.
 * Drives the real generateImages with the Flow engine stubbed — no browser, no network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ config: {} as Record<string, unknown>, sent: [] as any[] }));

vi.mock('../configManager.js', () => ({ loadConfig: async () => state.config }));
vi.mock('../image/flowGenerator.js', () => ({
  generateWithFlow: vi.fn(async (items: any[]) => {
    state.sent.push(...items);
    return items.map((item) => ({ heading: item.heading, filePath: 'C:/none/x.png', previewDataUrl: 'data:a', provider: 'flow' }));
  }),
  resetFlowState: vi.fn(),
}));

import { generateImages } from '../imageGenerator.js';

async function sentFor(config: Record<string, unknown>, extra: Record<string, unknown> = { articleSectionImages: true }) {
  state.config = config;
  state.sent.length = 0;
  await generateImages({
    provider: 'flow',
    isFullAuto: true,
    ...extra,
    postTitle: '청년 월세 지원 신청 방법',
    items: [{ heading: '신청 자격 3가지 확인', prompt: 'a Korean renter reading a notice', isThumbnail: false }],
  } as any).catch(() => undefined);
  return state.sent[0];
}

describe('generateImages — 소제목 글자 설정', () => {
  beforeEach(() => { state.sent.length = 0; });

  it('ON: the section image is allowed text and the brief names the heading verbatim', async () => {
    const item = await sentFor({ headingImageTextInclude: true });
    expect(item.allowText).toBe(true);
    expect(item.prompt).toContain('Write this exact Korean section title in the image: "신청 자격 3가지 확인"');
  });

  it('OFF (default): text-free, exactly as before', async () => {
    const item = await sentFor({});
    expect(item.allowText).toBe(false);
    expect(item.prompt).toContain('ZERO TEXT');
  });

  it('ON but not an article section call (image studio, tools): text-free', async () => {
    const item = await sentFor({ headingImageTextInclude: true }, {});
    expect(item.allowText).toBe(false);
    expect(item.prompt).toContain('ZERO TEXT');
  });
});
