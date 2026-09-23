// SPEC-NAVER-IMAGE-2026 — thumbnail director (all side effects stubbed).
// Standard mode (default) = exactly one thumbnail, no judge call. High mode = 2–3 variants + judge.
import { describe, expect, it, vi } from 'vitest';
import type { GeneratedImage, ImageRequestItem } from '../image/types';
import { buildCoverItem, runThumbnailDirector, type ThumbnailDirectorDeps, type ThumbnailDirectorInput } from '../image/director/thumbnailDirector';

const baseImage: GeneratedImage = { heading: 't', filePath: 'C:/img/base.png', previewDataUrl: 'data:x', provider: 'openai-image' };

function makeInput(overrides: Partial<ThumbnailDirectorInput> = {}): ThumbnailDirectorInput {
  return {
    title: '청년월세 20만원 받는 법',
    cardPromise: '',
    item: { heading: '🖼️ 썸네일', prompt: 'thumbnail', englishPrompt: 'thumbnail emoji prompt' } as ImageRequestItem,
    textMode: 'auto',
    qualityMode: 'standard',
    kind: 'info',
    allowBakedText: true,
    engineDrawsText: false,
    realImages: [],
    realWorkDir: 'C:/work',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ThumbnailDirectorDeps> = {}): ThumbnailDirectorDeps {
  const compose = (kind: string) => vi.fn(async (_input: string, output: string) => ({ filePath: output, width: 800, height: 800, method: kind }));
  return {
    generateBase: vi.fn(async () => baseImage),
    composeSquare: compose('square'),
    composeTight: compose('tight'),
    composeHook: compose('hook'),
    composePair: vi.fn(async (_left: string, _right: string, output: string) => ({ filePath: output, width: 800, height: 800, method: 'pair' })),
    toJudgeImage: vi.fn(async () => ({ base64: 'b64' })),
    judge: vi.fn(async () => ({ pickIndex: 1, source: 'judge' as const, reason: 'ok', scores: [] })),
    isLocalFile: () => true,
    log: () => undefined,
    ...overrides,
  };
}

describe('standard mode (default): one thumbnail, no judge call', () => {
  it('AUTO with a number → the one AI image carries a short baked phrase', async () => {
    const deps = makeDeps();
    const result = await runThumbnailDirector(makeInput(), deps);
    expect(deps.generateBase).toHaveBeenCalledTimes(1);
    expect(deps.judge).not.toHaveBeenCalled();
    expect(result!.winner.kind).toBe('ai-hook');
    expect(result!.text).toMatchObject({ include: true });
    expect(result!.text.text).toContain('20만원');
    expect((deps.composeHook as any).mock.calls[0][2]).toEqual({ main: result!.text.text });
  });

  it('text excluded → the plain AI image, nothing composed', async () => {
    const deps = makeDeps();
    const result = await runThumbnailDirector(makeInput({ textMode: 'exclude' }), deps);
    expect(result!.winner.kind).toBe('ai-full');
    expect(deps.composeHook).not.toHaveBeenCalled();
    expect(deps.composeTight).not.toHaveBeenCalled();
  });

  it('where text cannot be baked, nothing is baked (the legacy overlay adds the short phrase later)', async () => {
    const deps = makeDeps();
    const result = await runThumbnailDirector(makeInput({ allowBakedText: false, textMode: 'include' }), deps);
    expect(result!.winner.kind).toBe('ai-full');
    expect(result!.text.include).toBe(true);
    expect(deps.composeHook).not.toHaveBeenCalled();
  });

  it('a failed card keeps the plain AI image', async () => {
    const result = await runThumbnailDirector(makeInput(), makeDeps({ composeHook: vi.fn(async () => { throw new Error('svg'); }) }));
    expect(result!.winner.kind).toBe('ai-full');
  });

  it('real photos: no AI call; one composite (card when text applies)', async () => {
    const deps = makeDeps();
    const result = await runThumbnailDirector(makeInput({ realImages: ['C:/p/a.jpg', 'C:/p/b.jpg'] }), deps);
    expect(deps.generateBase).not.toHaveBeenCalled();
    expect(deps.judge).not.toHaveBeenCalled();
    expect(result!.base).toBeNull();
    expect(result!.winner).toMatchObject({ kind: 'real-hook', real: true, bakedText: true });
  });
});

describe('high mode: variants + one judge call', () => {
  it('AI path: plain, short-phrase card and tight crop go to the judge', async () => {
    const deps = makeDeps();
    const result = await runThumbnailDirector(makeInput({ qualityMode: 'high' }), deps);
    expect(result!.candidates.map((c) => c.kind)).toEqual(['ai-full', 'ai-hook', 'ai-tight']);
    expect(deps.judge).toHaveBeenCalledTimes(1);
    expect(result!.winner.kind).toBe('ai-hook');
  });

  it('real path: square, card, second photo', async () => {
    const result = await runThumbnailDirector(makeInput({ qualityMode: 'high', realImages: ['C:/p/a.jpg', 'C:/p/b.jpg'] }), makeDeps());
    expect(result!.candidates.map((c) => c.kind)).toEqual(['real-square', 'real-hook', 'real-square']);
  });

  it('a judge that cannot run keeps candidate 1', async () => {
    const result = await runThumbnailDirector(makeInput({ qualityMode: 'high' }), makeDeps({ toJudgeImage: vi.fn(async () => { throw new Error('read'); }) }));
    expect(result!.winner.kind).toBe('ai-full');
    expect(result!.verdict).toBeNull();
  });
});

describe('guards', () => {
  it('an engine that drew its own text gets no crop and no card', async () => {
    const deps = makeDeps();
    const result = await runThumbnailDirector(makeInput({ engineDrawsText: true, qualityMode: 'high' }), deps);
    expect(result!.candidates).toHaveLength(1);
    expect(deps.judge).not.toHaveBeenCalled();
  });

  it('returns null when the AI base is missing (caller reports it as before)', async () => {
    expect(await runThumbnailDirector(makeInput(), makeDeps({ generateBase: vi.fn(async () => null) }))).toBeNull();
  });

  it('falls back to AI when every real composition fails', async () => {
    const failing = vi.fn(async () => { throw new Error('decode'); });
    const deps = makeDeps({ composeSquare: failing, composeHook: failing });
    const result = await runThumbnailDirector(makeInput({ realImages: ['C:/p/a.jpg'] }), deps);
    expect(deps.generateBase).toHaveBeenCalledTimes(1);
    expect(result!.base).toBe(baseImage);
  });
});

describe('buildCoverItem', () => {
  it('replaces the slot name with the title and drops the slot-name prompt', () => {
    const cover = buildCoverItem(makeInput({ cardPromise: '월 20만원 1년' }), 'numeric', true);
    expect(cover.heading).toBe('청년월세 20만원 받는 법');
    expect(cover.englishPrompt).toBe('');
    expect(cover.isThumbnail).toBe(true);
    expect(cover.sectionContent).toContain('월 20만원 1년');
    expect(cover.coverDirection?.join(' ')).toContain('bottom third');
  });

  it('keeps a real heading and its prompt', () => {
    const cover = buildCoverItem(makeInput({ item: { heading: '청년월세 20만원 받는 법', prompt: 'p', englishPrompt: 'hint' } as ImageRequestItem }), 'numeric');
    expect(cover.englishPrompt).toBe('hint');
  });

  it("keepPrompt: the slot's own prompt stays (regeneration / saved manual prompt)", () => {
    const cover = buildCoverItem(makeInput({ keepPrompt: true }), 'numeric');
    expect(cover.heading).toBe('청년월세 20만원 받는 법');
    expect(cover.prompt).toBe('thumbnail');
    expect(cover.englishPrompt).toBe('thumbnail emoji prompt');
  });
});
