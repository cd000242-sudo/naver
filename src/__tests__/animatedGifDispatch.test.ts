/**
 * [2026-11-07 사장님] 움짤 — generateImages(디스패처) 단계 시험. 진짜 generateImages 를 돌리되 엔진은 가짜로 막는다
 * (브라우저·네트워크·유료 호출 0). 썸네일은 정지 유지, 2.5/다른 엔진은 안내 후 멈춤, 저장된 체크는 다른 엔진을 막지 않음.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  openaiItems: [] as any[],
  flowItems: [] as any[],
  overlayCalls: [] as any[],
}));

vi.mock('../configManager.js', () => ({ loadConfig: async () => state.config }));
vi.mock('../image/openaiImageGenerator.js', () => ({
  generateWithOpenAIImage: vi.fn(async (items: any[]) => {
    state.openaiItems.push(...items);
    return items.map((item) => ({ heading: item.heading, filePath: 'C:/none/x.png', previewDataUrl: 'data:a', provider: 'openai-image' }));
  }),
  generateSingleOpenAIImage: vi.fn(),
}));
vi.mock('../image/flowGenerator.js', () => ({
  generateWithFlow: vi.fn(async (items: any[]) => {
    state.flowItems.push(...items);
    return items.map((item) => ({ heading: item.heading, filePath: 'C:/none/x.png', previewDataUrl: 'data:a', provider: 'flow' }));
  }),
  resetFlowState: vi.fn(),
}));
vi.mock('../thumbnailService.js', () => ({
  thumbnailService: { createProductThumbnail: vi.fn(async (...args: unknown[]) => { state.overlayCalls.push(args); }) },
}));

import { applyKoreanTextOverlayIfNeeded, generateImages } from '../imageGenerator.js';
import { enrichImageItemsWithArticleContext } from '../image/contextualImagePrompt.js';

const S26 = 'gpt-image-2.6-sunburst';
const S25 = 'gpt-image-2.5-sunburst';

async function call(extra: Record<string, unknown>, items?: any[]) {
  state.openaiItems.length = 0;
  state.flowItems.length = 0;
  return generateImages({
    provider: 'openai-image',
    isFullAuto: true,
    postTitle: '청년 월세 지원 신청 방법',
    items: items ?? [
      { heading: '🖼️ 썸네일', prompt: 'a Korean renter reading a notice', isThumbnail: true },
      { heading: '신청 자격 3가지 확인', prompt: 'a Korean renter reading a notice', isThumbnail: false },
    ],
    ...extra,
  } as any);
}

beforeEach(() => {
  state.config = { openaiImageModel: S26 };
  state.openaiItems.length = 0;
  state.flowItems.length = 0;
  state.overlayCalls.length = 0;
});

describe('generateImages — 움짤 계획', () => {
  it('카드 버튼(animatedGif=true): 그 소제목 항목만 움짤로 넘어간다', async () => {
    await call({ imageModel: S26 }, [{ heading: '신청 자격 3가지 확인', prompt: 'a renter', isThumbnail: false, animatedGif: true }]);
    expect(state.openaiItems).toHaveLength(1);
    expect(state.openaiItems[0].animatedGif).toBe(true);
  });

  it('썸네일에 animatedGif=true 가 실려 와도 정지 이미지로 넘긴다', async () => {
    await call({ imageModel: S26 }, [
      { heading: '🖼️ 썸네일', prompt: 'a renter', isThumbnail: true, animatedGif: true },
      { heading: '신청 자격 3가지 확인', prompt: 'a renter', isThumbnail: false },
    ]);
    const thumb = state.openaiItems.find((i) => i.isThumbnail === true);
    expect(thumb.animatedGif).toBeFalsy();
  });

  it('설정 "움짤로 만들기" ON + 본문 소제목 호출: 소제목은 움짤, 썸네일은 정지', async () => {
    state.config = { openaiImageModel: S26, headingImageAnimated: true };
    await call({ articleSectionImages: true });
    const thumb = state.openaiItems.find((i) => i.isThumbnail === true);
    const section = state.openaiItems.find((i) => i.isThumbnail !== true);
    expect(section.animatedGif).toBe(true);
    expect(thumb.animatedGif).toBeFalsy();
  });

  it('설정 ON 이어도 이미지 스튜디오 같은 비-본문 호출은 정지 이미지', async () => {
    state.config = { openaiImageModel: S26, headingImageAnimated: true };
    await call({});
    expect(state.openaiItems.every((i) => !i.animatedGif)).toBe(true);
  });

  it('설정 OFF(기본): 아무것도 움짤이 아니다', async () => {
    await call({ articleSectionImages: true });
    expect(state.openaiItems.every((i) => !i.animatedGif)).toBe(true);
  });

  it('2.5 선택 + 카드 버튼: 안내 후 멈춤, 엔진 호출 0회', async () => {
    await expect(call({ imageModel: S25 }, [{ heading: '소제목', prompt: 'a renter', isThumbnail: false, animatedGif: true }]))
      .rejects.toThrow('움짤은 GPT 이미지 2.6 에서만 됩니다.');
    expect(state.openaiItems).toHaveLength(0);
  });

  it('저장된 모델이 2.5 이고 설정 ON(요청에 모델 없음): 안내 후 멈춤', async () => {
    state.config = { openaiImageModel: S25, headingImageAnimated: true };
    await expect(call({ articleSectionImages: true })).rejects.toThrow('2.6');
    expect(state.openaiItems).toHaveLength(0);
  });

  it('2.5 선택이어도 설정 OFF 면 평소대로 생성', async () => {
    state.config = { openaiImageModel: S25 };
    await call({ articleSectionImages: true });
    expect(state.openaiItems.length).toBeGreaterThan(0);
  });

  it('다른 엔진(Flow) + 카드 버튼: 안내 후 멈춤, Flow 호출 0회', async () => {
    await expect(call({ provider: 'flow' }, [{ heading: '소제목', prompt: 'a renter', isThumbnail: false, animatedGif: true }]))
      .rejects.toThrow('움짤은 GPT 이미지 2.6 에서만 됩니다.');
    expect(state.flowItems).toHaveLength(0);
  });

  it('다른 엔진(Flow) + 저장된 체크 ON: 막지 않고 정지 이미지로 평소대로', async () => {
    state.config = { openaiImageModel: S26, headingImageAnimated: true };
    await call({ provider: 'flow', articleSectionImages: true });
    expect(state.flowItems.length).toBeGreaterThan(0);
    expect(state.flowItems.every((i) => !i.animatedGif)).toBe(true);
  });
});

describe('화면 → main 사이 항목 재구성에서 animatedGif 가 버려지지 않는다(페이로드 화이트리스트 함정)', () => {
  it('글 문맥 보강(costAndAutoGen 이 거치는 길)은 항목을 펼쳐 담아 animatedGif 를 그대로 둔다', () => {
    const [item] = enrichImageItemsWithArticleContext(
      [{ heading: '신청 자격', prompt: 'p', animatedGif: true } as any],
      { articleTitle: '청년 월세 지원', globalSubject: '월세', articleContext: '', sections: [] } as any,
    );
    expect((item as any).animatedGif).toBe(true);
  });
});

describe('applyKoreanTextOverlayIfNeeded — 움짤은 덧그리지 않는다(첫 프레임만 남는 평탄화 방지)', () => {
  it('.gif 이미지는 썸네일 문구 합성 대상이어도 건드리지 않는다', async () => {
    const gif = { heading: '🖼️ 썸네일', filePath: 'C:/img/a.gif', previewDataUrl: 'data:image/gif;base64,AAA', provider: 'imagefx', isThumbnail: true } as any;
    const out = await applyKoreanTextOverlayIfNeeded([gif], 'imagefx', '청년 월세 지원 신청 방법', true, [{ heading: '🖼️ 썸네일', isThumbnail: true, allowText: true }] as any);
    expect(state.overlayCalls).toHaveLength(0);
    expect(out[0]).toBe(gif);
  });

  it('같은 조건의 정지 이미지는 종전처럼 합성 경로를 탄다', async () => {
    const png = { heading: '🖼️ 썸네일', filePath: 'C:/none/a.png', previewDataUrl: 'data:image/png;base64,AAA', provider: 'imagefx', isThumbnail: true } as any;
    await applyKoreanTextOverlayIfNeeded([png], 'imagefx', '청년 월세 지원 신청 방법', true, [{ heading: '🖼️ 썸네일', isThumbnail: true, allowText: true }] as any).catch(() => undefined);
    expect(state.overlayCalls).toHaveLength(1);
  });
});
