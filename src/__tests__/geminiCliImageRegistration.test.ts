import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALLOWED_PROVIDER, assertProvider, type GenerateImagesOptions } from '../image/types.js';
import { getImageEngineSpec, IMAGE_ENGINE_CATALOG } from '../runtime/imageEngineCatalog.js';
import { retiredImageEngineChoices } from '../runtime/retiredImageEngines.js';
import { isAiGeneratedImage } from '../automation/imageProvenance.js';
import { drawsKoreanTextItself } from '../image/director/koreanTextEngines.js';
import { resolveStylePreviewEngine } from '../image/stylePreviewEnginePolicy.js';
import { AGENT_IMAGE_PROFILES } from '../agentCli/agentModelDefaults.js';
import { GEMINI_CLI_IMAGE_ENGINE, GEMINI_CLI_IMAGE_ENGINE_LABEL, isGeminiCliImageEngine } from '../runtime/geminiCliImagePolicy.js';
import { DAILY_IMAGE_PROVIDERS } from '../main/ldb-daily-publishing.js';
import { gsPrefetchBatchProvider, gsPrefetchBodyIndexes, gsPrefetchLabel } from '../image/fullAuto/gensparkBodyPrefetch.js';

const SRC = path.join(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(SRC, relative), 'utf-8');
const readRoot = (relative: string) => fs.readFileSync(path.join(SRC, '..', relative), 'utf-8');

describe('Gemini 구독 이미지 - 엔진 등록', () => {
  it('엔진 값과 라벨이 정해져 있다', () => {
    expect(GEMINI_CLI_IMAGE_ENGINE).toBe('gemini-cli-image');
    expect(GEMINI_CLI_IMAGE_ENGINE_LABEL).toBe('Gemini 구독 이미지 (Gemini CLI · 별도 비용 없음)');
    expect(isGeminiCliImageEngine(' gemini-cli-image ')).toBe(true);
    expect(isGeminiCliImageEngine('codex-image')).toBe(false);
  });

  it('제공자 화이트리스트에 있고 AI 생성엔진 카탈로그(모델 ID 고정 시험)에는 없으며 비용은 0원이다', () => {
    expect(ALLOWED_PROVIDER).toContain('gemini-cli-image');
    expect(() => assertProvider('gemini-cli-image' as never)).not.toThrow();
    expect(IMAGE_ENGINE_CATALOG.map(e => e.value)).not.toContain('gemini-cli-image');
    const spec = getImageEngineSpec('gemini-cli-image');
    expect(spec?.label).toBe(GEMINI_CLI_IMAGE_ENGINE_LABEL);
    expect(spec?.costKrw).toBe(0);
    expect(spec?.koreanText).toBe(true);
    expect(spec?.forceModelKey).toBeNull();
    expect(spec?.model).toBe('agy/gemini-3.8-flash-low');
    expect(spec?.model).toBe(`agy/${AGENT_IMAGE_PROFILES.gemini.model}`);
  });

  it('옛 엔진 재선택 목록에 들어 있다 (동의가 필요 없는 엔진)', () => {
    expect(retiredImageEngineChoices()).toContain('gemini-cli-image');
  });

  it('AI 생성 이미지로 판정돼 AI 표시 대상이 된다 (수집 사진과 반대)', () => {
    expect(isAiGeneratedImage({ provider: 'gemini-cli-image' })).toBe(true);
    expect(isAiGeneratedImage({ provider: 'gemini-cli-image', isCollected: true })).toBe(false);
  });

  it('엔진이 한글 문구를 직접 그리는 목록에 있어 앱 오버레이를 입히지 않는다', () => {
    expect(drawsKoreanTextItself('gemini-cli-image')).toBe(true);
  });

  it('스타일 미리보기는 지원하지 않는다 (구독 한도를 쓰는 느린 외부 실행이라 미리보기용으로 부르지 않는다)', () => {
    expect(resolveStylePreviewEngine('gemini-cli-image')).toBeNull();
  });

  it('매일 예약발행 이미지 엔진 목록에 있되, 무료 보충 엔진 목록(조용한 한도 소모)에는 넣지 않는다', () => {
    expect(DAILY_IMAGE_PROVIDERS).toContain('gemini-cli-image');
    expect(read('main/ldb-daily-publishing.ts')).toContain("id: 'gemini-cli-image'");
    expect(read('main/services/dailyImageRefill.ts')).not.toContain('gemini-cli-image');
  });

  it('main 이 진행 로그 싱크를 등록한다', () => {
    const main = read('main.ts');
    expect(main).toContain("import { setGeminiCliImageLogSink } from './image/geminiCli/geminiCliImageGenerator.js'");
    expect(main).toContain('setGeminiCliImageLogSink(sendLog)');
  });
});

describe('Gemini 구독 이미지 - 화면 등록 목록', () => {
  it('이미지 엔진 드롭다운에 옵션이 한 줄 있다', () => {
    const html = readRoot('public/index.html');
    expect(html.match(/<option value="gemini-cli-image"/g)?.length).toBe(1);
    expect(html).toMatch(/<option value="gemini-cli-image"[^>]*>Gemini 구독 이미지 \(Gemini CLI · 별도 비용 없음\)/);
    // The new option sits right after the Codex one.
    expect(html).toMatch(/<option value="codex-image"[^\n]*\n\s*<option value="gemini-cli-image"/);
  });

  it('이미지 설정 모달: 타입 유니온, 라벨, 유효값 두 곳, 카드', () => {
    const settings = read('renderer/components/HeadingImageSettings.ts');
    expect(settings).toContain("| 'gemini-cli-image'");
    expect(settings).toContain("'gemini-cli-image': '✨ Gemini 구독 이미지 (Gemini CLI · 별도 비용 없음)'");
    expect(settings.match(/'local-folder', 'gemini-cli-image'\]/g)?.length).toBe(2);
    expect(settings).toContain('data-value="gemini-cli-image"');
  });

  it('저장값 검증 · 개별 재생성 · 라벨 맵에 모두 있다', () => {
    expect(read('renderer/modules/unifiedDOMCache.ts')).toContain("'gemini-cli-image'");
    expect(read('renderer/modules/imageDisplayGrid.ts')).toMatch(/IMAGE_REGENERATE_ENGINES = new Set\(\[[^\]]*'gemini-cli-image'/);
    expect(read('renderer/modules/continuousPublishing.ts')).toContain("'gemini-cli-image': '✨ Gemini 구독 이미지");
    expect(read('renderer/modules/fullAutoFlow.ts')).toContain("'gemini-cli-image': 'Gemini 구독 이미지'");
    expect(read('renderer/modules/headingImageGen.ts')).toContain("'gemini-cli-image': 'Gemini 구독 이미지'");
    // The image tab dispatch chain stops on an unlisted engine ("알 수 없는 이미지 엔진"), so both its branches must name this one.
    expect(read('renderer/modules/headingImageGen.ts').match(/imageSource === 'gemini-cli-image'/g)?.length).toBe(2);
  });

  it('비용 표시: 비용 위험 동의 대상이 아니고(0원) 라벨은 별도 비용 없음을 말한다', () => {
    const source = read('renderer/utils/imageCostUtils.ts');
    const riskFn = source.slice(source.indexOf('export function isCostRiskImageProvider'), source.indexOf('export function getCostRiskProviderLabel'));
    expect(riskFn).not.toContain('gemini-cli-image');
    expect(source).toContain("if (p === 'gemini-cli-image') return 'Gemini 구독 이미지 (Gemini CLI · 별도 비용 없음)'");
    // The Set body holds dated comments with brackets, so cut it at the closing "]);" instead of the first "]".
    const slowSource = read('renderer/modules/costAndAutoGen.ts');
    const slowStart = slowSource.indexOf('SLOW_IMAGE_PROVIDERS = new Set([');
    expect(slowStart).toBeGreaterThan(-1);
    expect(slowSource.slice(slowStart, slowSource.indexOf(']);', slowStart))).toContain("'gemini-cli-image'");
  });

  it('쇼핑 대표 상품 사진 목록에는 들어 있고(2026-11-21), 사용자 참고 사진 목록(Codex 전용)과 쇼핑 유틸에는 넣지 않는다', () => {
    expect(read('image/shoppingReferenceGeneration.ts')).toContain("'gemini-cli-image'");
    expect(read('runtime/imageSettingsSync.ts')).toContain("'gemini-cli-image'");
    expect(read('renderer/utils/codexReferenceImageList.ts')).not.toContain('gemini-cli-image');
    expect(read('renderer/utils/shoppingConnectUtils.ts')).not.toContain('gemini-cli-image');
  });

  it('발행 전 점검은 Gemini 도 점검하고(2026-11-21), 기동 기본값은 Codex 그대로 둔다', () => {
    expect(read('renderer/modules/publishStartPreflight.ts')).toContain('gemini-cli-image');
    expect(read('renderer/modules/startupImageEngineGate.ts')).not.toContain('gemini-cli-image');
  });
});

describe('한꺼번에 요청 경로 (gensparkBodyPrefetch)', () => {
  it('새 엔진도 소제목 이미지를 한 번에 보내고, 진행 로그 이름은 세 엔진을 구분한다', () => {
    expect(gsPrefetchBatchProvider('gemini-cli-image')).toBe(true);
    expect(gsPrefetchBatchProvider('codex-image')).toBe(true);
    expect(gsPrefetchBatchProvider('genspark')).toBe(true);
    expect(gsPrefetchBatchProvider('dropshot')).toBe(false);
    expect(gsPrefetchLabel('gemini-cli-image')).toBe('Gemini 구독 이미지');
    expect(gsPrefetchLabel('codex-image')).toBe('Codex 구독 이미지');
    expect(gsPrefetchLabel('genspark')).toBe('젠스파크');
    expect(gsPrefetchBodyIndexes('gemini-cli-image', [{ heading: 'a', isThumbnail: true }, { heading: 'b' }, { heading: 'c' }])).toEqual([1, 2]);
  });
});

describe('generateImages 분기', () => {
  const options = {
    provider: 'gemini-cli-image', postTitle: '글 제목', stopCheck: () => false,
    items: [
      { heading: '썸네일 제목', prompt: '썸네일 프롬프트', englishPrompt: 'thumbnail prompt', isThumbnail: true },
      { heading: '첫째 소제목', prompt: '첫째 프롬프트', englishPrompt: 'first prompt' },
    ],
  } as unknown as GenerateImagesOptions;

  it('이 엔진은 Gemini 이미지 생성기로 보내고, 만든 프롬프트를 그대로 넘기며, 결과에 엔진 표시를 단다', async () => {
    vi.resetModules();
    const spy = vi.fn(async (items: Array<{ heading: string }>) => items.map(item => ({
      heading: item.heading, filePath: `C:/img/${item.heading}.png`, previewDataUrl: 'data:image/png;base64,AA', provider: 'gemini-cli-image',
    })));
    vi.doMock('../image/geminiCli/geminiCliImageGenerator.js', () => ({ generateWithGeminiCliImage: spy }));
    const { generateImages } = await import('../imageGenerator.js');
    const images = await generateImages(options);
    expect(spy).toHaveBeenCalledTimes(1);
    const sent = (spy.mock.calls[0] as unknown[])[0] as Array<{ heading: string; prompt: string }>;
    expect(sent.map(item => item.heading)).toEqual(['썸네일 제목', '첫째 소제목']);
    expect(sent.every(item => item.prompt.length > 0)).toBe(true);
    expect((spy.mock.calls[0] as unknown[])[5]).toEqual({ allowPartial: false });
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ provider: 'gemini-cli-image', requestedProvider: 'gemini-cli-image', actualProvider: 'gemini-cli-image', fallbackUsed: false });
    vi.doUnmock('../image/geminiCli/geminiCliImageGenerator.js');
  });

  it('실패하면 [Gemini 구독 이미지] 오류로 멈추고 다른 엔진으로 넘기지 않는다', async () => {
    vi.resetModules();
    const spy = vi.fn(async () => { throw new Error('3번 이미지를 받지 못함'); });
    vi.doMock('../image/geminiCli/geminiCliImageGenerator.js', () => ({ generateWithGeminiCliImage: spy }));
    const { generateImages } = await import('../imageGenerator.js');
    await expect(generateImages(options)).rejects.toThrow(/\[Gemini 구독 이미지\][\s\S]*3번 이미지를 받지 못함/);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.doUnmock('../image/geminiCli/geminiCliImageGenerator.js');
  });

  it('0건이 돌아오면 연결/구독 한도 확인 안내로 멈춘다', async () => {
    vi.resetModules();
    const spy = vi.fn(async () => []);
    vi.doMock('../image/geminiCli/geminiCliImageGenerator.js', () => ({ generateWithGeminiCliImage: spy }));
    const { generateImages } = await import('../imageGenerator.js');
    await expect(generateImages(options)).rejects.toThrow(/Gemini 구독 이미지 0건 반환 — Gemini CLI 연결\/구독 한도 확인 필요/);
    vi.doUnmock('../image/geminiCli/geminiCliImageGenerator.js');
  });
});
