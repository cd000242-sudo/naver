import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALLOWED_PROVIDER, assertProvider, type GenerateImagesOptions } from '../image/types.js';
import { getImageEngineSpec, IMAGE_ENGINE_CATALOG } from '../runtime/imageEngineCatalog.js';
import { retiredImageEngineChoices } from '../runtime/retiredImageEngines.js';
import { isAiGeneratedImage } from '../automation/imageProvenance.js';
import { drawsKoreanTextItself } from '../image/director/koreanTextEngines.js';
import { resolveStylePreviewEngine } from '../image/stylePreviewEnginePolicy.js';
import { AGENT_IMAGE_PROFILES, AGENT_TIER_PROFILES, resolveAgentImageProfile } from '../agentCli/agentModelDefaults.js';
import { CODEX_IMAGE_ENGINE, CODEX_IMAGE_ENGINE_LABEL, isCodexImageEngine } from '../runtime/codexImagePolicy.js';
import { DAILY_IMAGE_PROVIDERS } from '../main/ldb-daily-publishing.js';

const SRC = path.join(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(SRC, relative), 'utf-8');
const readRoot = (relative: string) => fs.readFileSync(path.join(SRC, '..', relative), 'utf-8');

describe('Codex 구독 이미지 - 엔진 등록', () => {
  it('엔진 값과 라벨이 정해져 있다', () => {
    expect(CODEX_IMAGE_ENGINE).toBe('codex-image');
    expect(CODEX_IMAGE_ENGINE_LABEL).toBe('Codex 구독 이미지 (GPT 이미지 · 별도 비용 없음)');
    expect(isCodexImageEngine(' codex-image ')).toBe(true);
    expect(isCodexImageEngine('openai-image')).toBe(false);
  });

  it('제공자 화이트리스트에 있고 AI 생성엔진 카탈로그(모델 ID 고정 시험)에는 없으며 비용은 0원이다', () => {
    expect(ALLOWED_PROVIDER).toContain('codex-image');
    expect(() => assertProvider('codex-image')).not.toThrow();
    expect(IMAGE_ENGINE_CATALOG.map(e => e.value)).not.toContain('codex-image');
    const spec = getImageEngineSpec('codex-image');
    expect(spec?.costKrw).toBe(0);
    expect(spec?.koreanText).toBe(true);
    expect(spec?.model).toBe('codex/gpt-6-luna');
  });

  it('옛 엔진 재선택 목록에 들어 있다 (동의가 필요 없는 엔진)', () => {
    expect(retiredImageEngineChoices()).toContain('codex-image');
  });

  it('AI 생성 이미지로 판정돼 AI 표시 대상이 된다 (수집 사진과 반대)', () => {
    expect(isAiGeneratedImage({ provider: 'codex-image' })).toBe(true);
    expect(isAiGeneratedImage({ provider: 'codex-image', isCollected: true })).toBe(false);
    expect(isAiGeneratedImage({ provider: 'collect-photos' })).toBe(false);
  });

  it('엔진이 한글 문구를 직접 그리는 목록에 있어 앱 오버레이를 입히지 않는다', () => {
    expect(drawsKoreanTextItself('codex-image')).toBe(true);
  });

  it('모델과 추론 강도는 한 곳(agentModelDefaults)에서 정하고, 글 생성 기본값은 그대로다', () => {
    expect(AGENT_IMAGE_PROFILES.codex).toEqual({ model: 'gpt-6-luna', effort: 'low' });
    expect(resolveAgentImageProfile('codex')).toEqual({ model: 'gpt-6-luna', effort: 'low' });
    expect(resolveAgentImageProfile('codex', ' gpt-x ')).toEqual({ model: 'gpt-x', effort: 'low' });
    expect(AGENT_TIER_PROFILES.codex.main.model).toBe('gpt-6.1-terra');
    expect(AGENT_TIER_PROFILES.codex.light.model).toBe('gpt-6.1-terra');
  });

  it('스타일 미리보기는 지원하지 않는다 (구독 한도를 쓰는 느린 외부 실행이라 미리보기용으로 부르지 않는다)', () => {
    expect(resolveStylePreviewEngine('codex-image')).toBeNull();
  });

  it('매일 예약발행 이미지 엔진 목록에 있되, 무료 보충 엔진 목록(조용한 한도 소모)에는 넣지 않는다', () => {
    expect(DAILY_IMAGE_PROVIDERS).toContain('codex-image');
    expect(read('main/ldb-daily-publishing.ts')).toContain("id: 'codex-image'");
    expect(read('main/services/dailyImageRefill.ts')).not.toContain('codex-image');
  });
});

describe('Codex 구독 이미지 - 화면 등록 목록', () => {
  it('이미지 엔진 드롭다운에 옵션이 한 줄 있다', () => {
    const html = readRoot('public/index.html');
    expect(html.match(/<option value="codex-image"/g)?.length).toBe(1);
    expect(html).toMatch(/<option value="codex-image"[^>]*>Codex 구독 이미지 \(GPT 이미지 · 별도 비용 없음\)/);
  });

  it('이미지 설정 모달: 타입 유니온, 라벨, 유효값 두 곳, 카드', () => {
    const settings = read('renderer/components/HeadingImageSettings.ts');
    expect(settings).toContain("| 'codex-image'");
    expect(settings).toContain("'codex-image': '🐙 Codex 구독 이미지");
    expect(settings.match(/'collect-photos', 'codex-image', 'local-folder'/g)?.length).toBe(2);
    expect(settings).toContain('data-value="codex-image"');
  });

  it('저장값 검증 · 개별 재생성 · 라벨 맵에 모두 있다', () => {
    expect(read('renderer/modules/unifiedDOMCache.ts')).toContain("'collect-photos', 'codex-image'");
    expect(read('renderer/modules/imageDisplayGrid.ts')).toMatch(/IMAGE_REGENERATE_ENGINES = new Set\(\[[^\]]*'codex-image'/);
    expect(read('renderer/modules/continuousPublishing.ts')).toContain("'codex-image': '🐙 Codex 구독 이미지");
    expect(read('renderer/modules/fullAutoFlow.ts')).toContain("'codex-image': 'Codex 구독 이미지'");
    expect(read('renderer/modules/headingImageGen.ts')).toContain("'codex-image': 'Codex 구독 이미지'");
    // The image tab dispatch chain stops on an unlisted engine ("알 수 없는 이미지 엔진"), so both its branches must name this one.
    expect(read('renderer/modules/headingImageGen.ts').match(/imageSource === 'codex-image'/g)?.length).toBe(2);
  });

  it('비용 표시: 비용 위험 동의 대상이 아니고(0원) 라벨은 별도 비용 없음을 말한다', () => {
    const source = read('renderer/utils/imageCostUtils.ts');
    const riskFn = source.slice(source.indexOf('export function isCostRiskImageProvider'), source.indexOf('export function getCostRiskProviderLabel'));
    expect(riskFn).not.toContain('codex-image');
    expect(source).toContain("if (p === 'codex-image') return 'Codex 구독 이미지 (GPT 이미지 · 별도 비용 없음)'");
    expect(read('renderer/modules/costAndAutoGen.ts')).toMatch(/SLOW_IMAGE_PROVIDERS = new Set\(\[[^\]]*'codex-image'/);
  });

  it('쇼핑커넥트 참고 사진 허용 목록(shoppingReferenceGeneration)에는 있고, 판정 함수 파일(shoppingConnectUtils)에는 이름을 적지 않는다', () => {
    // 2026-11-05: the shopping AI mode now accepts this engine (product photo as reference) — see codexShoppingReferencePolicy.test.ts.
    expect(read('renderer/utils/shoppingConnectUtils.ts')).not.toContain('codex-image');
    expect(read('image/shoppingReferenceGeneration.ts')).toContain("'codex-image'");
  });
});

describe('generateImages 분기', () => {
  const options = {
    provider: 'codex-image', postTitle: '글 제목', stopCheck: () => false,
    items: [
      { heading: '썸네일 제목', prompt: '썸네일 프롬프트', englishPrompt: 'thumbnail prompt', isThumbnail: true },
      { heading: '첫째 소제목', prompt: '첫째 프롬프트', englishPrompt: 'first prompt' },
    ],
  } as unknown as GenerateImagesOptions;

  it('이 엔진은 Codex 이미지 생성기로 보내고, 만든 프롬프트를 그대로 넘기며, 결과에 엔진 표시를 단다', async () => {
    vi.resetModules();
    const spy = vi.fn(async (items: Array<{ heading: string }>) => items.map(item => ({
      heading: item.heading, filePath: `C:/img/${item.heading}.png`, previewDataUrl: 'data:image/png;base64,AA', provider: 'codex-image',
    })));
    vi.doMock('../image/codex/codexImageGenerator.js', () => ({ generateWithCodexImage: spy }));
    const { generateImages } = await import('../imageGenerator.js');
    const images = await generateImages(options);
    expect(spy).toHaveBeenCalledTimes(1);
    const sent = (spy.mock.calls[0] as unknown[])[0] as Array<{ heading: string; prompt: string }>;
    expect(sent.map(item => item.heading)).toEqual(['썸네일 제목', '첫째 소제목']);
    expect(sent.every(item => item.prompt.length > 0)).toBe(true);
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ provider: 'codex-image', requestedProvider: 'codex-image', actualProvider: 'codex-image', fallbackUsed: false });
    vi.doUnmock('../image/codex/codexImageGenerator.js');
  });

  it('실패하면 [Codex 구독 이미지] 오류로 멈추고 다른 엔진으로 넘기지 않는다', async () => {
    vi.resetModules();
    const spy = vi.fn(async () => { throw new Error('3번 이미지를 받지 못함'); });
    vi.doMock('../image/codex/codexImageGenerator.js', () => ({ generateWithCodexImage: spy }));
    const { generateImages } = await import('../imageGenerator.js');
    await expect(generateImages(options)).rejects.toThrow(/\[Codex 구독 이미지\][\s\S]*3번 이미지를 받지 못함/);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.doUnmock('../image/codex/codexImageGenerator.js');
  });
});
