// @vitest-environment happy-dom
/**
 * [2026-11-06] 덕트테이프(openai-image)에 GPT Image 2.6 (sunburst 품질형 / flare 속도형)을 추가하고 기본값으로 만든다.
 * 사장님 결정: 새로 쓰는 분·설정 안 한 분은 2.6 Sunburst. 이미 저장된 2.5 선택값은 그대로 둔다.
 * 옛 gpt-image-1 / 1.5 / 2 · 빈 값 · 이상값만 새 기본값으로 돌린다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_MODEL_CHOICES,
  OPENAI_IMAGE_MODELS,
  VERIFIED_IMAGE_MODELS,
  normalizeOpenaiImageModel,
} from '../runtime/modelRegistry.js';
import { isOpenAIImageModelV25, resolveOpenAIImageQuality } from '../image/openaiImageQuality.js';
import {
  getOpenAIImageCostKRW,
  getOpenAIImageQualities,
  isOpenAIImageModelFiveTier,
} from '../renderer/utils/imageCostUtils.js';
import { isShoppingReferenceGenerationSelectionSupported } from '../image/shoppingReferenceGeneration.js';
import { migrateOpenaiImageTwoModels, normalizeRetiredOpenaiImageModel } from '../runtime/imageProviderMigration.js';
import { DUCK_TAPE } from '../runtime/imageEngineCatalog.js';
import { resolvePipelineConfig } from '../renderer/modules/pipelineConfig';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, rel), 'utf-8').replace(/\r\n/g, '\n');

const S26 = 'gpt-image-2.6-sunburst';
const F26 = 'gpt-image-2.6-flare';
const S25 = 'gpt-image-2.5-sunburst';
const F25 = 'gpt-image-2.5-flare';
const QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

const makeStorage = (data: Record<string, string>) => ({
  getItem: (k: string) => (k in data ? data[k] : null),
  setItem: (k: string, v: string) => { data[k] = v; },
});

afterEach(() => {
  delete (globalThis as any).document;
  delete (globalThis as any).localStorage;
});

describe('레지스트리 — 기본값 2.6 Sunburst, 목록 4개(2.6 먼저)', () => {
  it('모델 상수와 검증 목록에 2.6 두 모델이 있다', () => {
    expect(OPENAI_IMAGE_MODELS.GPT_IMAGE_2_6_SUNBURST).toBe(S26);
    expect(OPENAI_IMAGE_MODELS.GPT_IMAGE_2_6_FLARE).toBe(F26);
    expect(VERIFIED_IMAGE_MODELS).toContain(S26);
    expect(VERIFIED_IMAGE_MODELS).toContain(F26);
  });

  it('기본값은 2.6 Sunburst 이고 선택지는 화면 순서대로 4개다', () => {
    expect(DEFAULT_OPENAI_IMAGE_MODEL).toBe(S26);
    expect([...OPENAI_IMAGE_MODEL_CHOICES]).toEqual([S26, F26, S25, F25]);
  });

  it.each([S26, F26, S25, F25])('목록 안의 값 %s 는 그대로 보존된다 (공백만 정리)', (m) => {
    expect(normalizeOpenaiImageModel(m)).toBe(m);
    expect(normalizeOpenaiImageModel(` ${m} `)).toBe(m);
  });

  it.each(['gpt-image-1', 'gpt-image-1.5', 'gpt-image-2', '', '   ', 'dall-e-3', 'whatever'])(
    '옛 값·이상값 %j → 2.6 Sunburst',
    (v) => expect(normalizeOpenaiImageModel(v)).toBe(S26),
  );

  it.each([undefined, null, 0, {}, []])('문자열이 아닌 값 %j → 2.6 Sunburst', (v) => {
    expect(normalizeOpenaiImageModel(v)).toBe(S26);
  });

  it('덕트테이프 카탈로그 대표 모델이 2.6 Sunburst 이고 문구에 2.6 이 보인다', () => {
    expect(DUCK_TAPE.model).toBe(S26);
    expect(DUCK_TAPE.tagline).toContain('2.6');
  });
});

describe('설정 파일 — 타입 유니언·기본값', () => {
  const src = read('../configManager.ts');
  it('openaiImageModel 타입에 2.6 두 모델과 2.5 두 모델이 모두 들어 있다', () => {
    const m = /openaiImageModel\?:([^;]+);/.exec(src);
    expect(m).not.toBeNull();
    for (const id of [S26, F26, S25, F25]) expect(m![1]).toContain(`'${id}'`);
  });
  it('불러올 때 정책 함수를 쓴다 (옛 허용 목록으로 되돌아가지 않는다)', () => {
    expect(src).toMatch(/openaiImageModel: normalizeOpenaiImageModel\(parsed\.openaiImageModel\)/);
  });
});

describe('5단계 품질 — 2.5 와 2.6 모두 xhigh/max 유지, 구모델은 high 강등', () => {
  it.each([S26, F26, S25, F25])('%s 는 xhigh / max 를 그대로 통과시킨다', (m) => {
    expect(isOpenAIImageModelV25(m)).toBe(true);
    expect(isOpenAIImageModelFiveTier(m)).toBe(true);
    expect(resolveOpenAIImageQuality(m, 'xhigh')).toBe('xhigh');
    expect(resolveOpenAIImageQuality(m, 'max')).toBe('max');
    expect(getOpenAIImageQualities(m)).toEqual([...QUALITIES]);
  });

  it.each(['gpt-image-1', 'gpt-image-1.5', 'gpt-image-2', ''])('구모델 %j 는 xhigh/max 가 high 로 내려간다', (m) => {
    expect(isOpenAIImageModelV25(m)).toBe(false);
    expect(isOpenAIImageModelFiveTier(m)).toBe(false);
    expect(resolveOpenAIImageQuality(m, 'xhigh')).toBe('high');
    expect(resolveOpenAIImageQuality(m, 'max')).toBe('high');
    expect(getOpenAIImageQualities(m)).toEqual(['low', 'medium', 'high']);
  });
});

describe('가격표 — 2.6 은 2.5 와 같은 추정치, 두 표가 같은 값', () => {
  const tracker = read('../apiUsageTracker.ts');
  const priceOf = (key: string): number | null => {
    const m = new RegExp(`'${key.replace(/\./g, '\\.')}'\\s*:\\s*([0-9.]+)`).exec(tracker);
    return m ? Number(m[1]) : null;
  };

  it.each([S26, F26])('%s: 렌더러 표시 단가 = 2.5 단가 = apiUsageTracker 기록 단가 (정사각 5단계 + 미지정)', (m) => {
    for (const q of QUALITIES) {
      const usd = priceOf(`${m}-${q}`);
      expect(usd, `${m}-${q} 키`).not.toBeNull();
      expect(getOpenAIImageCostKRW(m, q, 1400)).toBe(Math.round(usd! * 1400));
      expect(usd).toBe(priceOf(`${m.replace('2.6', '2.5')}-${q}`));
    }
    expect(priceOf(m)).toBe(priceOf(`${m}-medium`));
  });

  it.each([S26, F26])('%s: 비정사각(wide) 키도 2.5 와 같다', (m) => {
    for (const q of QUALITIES) {
      const usd = priceOf(`${m}-${q}-wide`);
      expect(usd, `${m}-${q}-wide 키`).not.toBeNull();
      expect(usd).toBe(priceOf(`${m.replace('2.6', '2.5')}-${q}-wide`));
    }
  });

  it('장당 공식 가격 미공개 추정치임을 주석으로 남겼다', () => {
    expect(tracker).toContain('공식 장당 가격 미공개 — 토큰 단가 기준 2.5 와 같은 값으로 둔 추정치');
    expect(read('../renderer/utils/imageCostUtils.ts')).toContain(
      '공식 장당 가격 미공개 — 토큰 단가 기준 2.5 와 같은 값으로 둔 추정치',
    );
  });

  it('기본 모델(2.6 Sunburst) medium 은 ₩18 이고 카탈로그와 같다', () => {
    expect(getOpenAIImageCostKRW(S26, 'medium')).toBe(18);
    expect(DUCK_TAPE.costKrw).toBe(18);
  });
});

describe('쇼핑 참조 이미지 게이트 — 2.6 도 통과', () => {
  it.each([S26, F26, S25, F25])('%s 통과', (m) => {
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', m)).toBe(true);
  });
  it('옛 별칭 provider(gpt-image-2)는 통과, 옛 모델 값은 여전히 차단', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('gpt-image-2')).toBe(true);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-2')).toBe(false);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-1.5')).toBe(false);
  });
});

describe('저장값 이관 — 2.5 선택은 보존, 옛 값만 2.6 Sunburst', () => {
  it.each(['gpt-image-1', 'gpt-image-1.5', 'gpt-image-2'])('%s → 2.6 Sunburst', (old) => {
    expect(normalizeRetiredOpenaiImageModel(old)).toBe(S26);
    const data: Record<string, string> = { openaiImageModel: old, openaiImageQuality: 'high' };
    expect(migrateOpenaiImageTwoModels(makeStorage(data))).toBe(1);
    expect(data.openaiImageModel).toBe(S26);
    expect(data.openaiImageQuality).toBe('high');
  });

  it.each([S25, F25, S26, F26])('사용자가 고른 %s 는 건드리지 않는다', (m) => {
    const data: Record<string, string> = { openaiImageModel: m };
    expect(migrateOpenaiImageTwoModels(makeStorage(data))).toBe(0);
    expect(data.openaiImageModel).toBe(m);
  });

  it('두 번 돌려도 같은 결과(멱등)', () => {
    const data: Record<string, string> = { openaiImageModel: 'gpt-image-2' };
    migrateOpenaiImageTwoModels(makeStorage(data));
    expect(migrateOpenaiImageTwoModels(makeStorage(data))).toBe(0);
    expect(data.openaiImageModel).toBe(S26);
  });
});

describe('파이프라인 설정 — 기본 2.6 Sunburst, 저장된 2.5/2.6 선택은 그대로', () => {
  const run = (stored: Record<string, string>) => {
    (globalThis as any).localStorage = makeStorage({ scSubImageMode: 'ai', ...stored });
    return resolvePipelineConfig('full-auto');
  };

  it('저장값이 없으면 쇼핑 모델은 2.6 Sunburst', () => {
    const cfg = run({});
    expect(cfg.shopping.aiImageEngine).toBe('openai-image');
    expect(cfg.shopping.aiImageModel).toBe(S26);
  });

  it('옛 gpt-image-1.5 저장값이면 쇼핑 모델은 2.6 Sunburst', () => {
    expect(run({ openaiImageModel: 'gpt-image-1.5' }).shopping.aiImageModel).toBe(S26);
  });

  it.each([F25, S25, F26, S26])('저장된 %s 는 쇼핑·이미지 모델 모두 그대로', (m) => {
    const cfg = run({ globalImageSource: 'openai-image', openaiImageModel: m });
    expect(cfg.shopping.aiImageModel).toBe(m);
    expect(cfg.image.imageModel).toBe(m);
  });

  it('옛 gpt-image-2 별칭은 2.6 Sunburst 로 승계', () => {
    const cfg = run({ fullAutoImageSource: 'gpt-image-2' });
    expect(cfg.shopping.aiImageEngine).toBe('openai-image');
    expect(cfg.shopping.aiImageModel).toBe(S26);
    expect(cfg.image.imageModel).toBe(S26);
  });
});

describe('화면 — 2.6 이 목록 맨 앞, 기본 선택, 라벨 노출', () => {
  const html = read('../../public/index.html');
  const radios = [...html.matchAll(/<input[^>]*name="openai-image-model"[^>]*>/g)].map((m) => m[0]);
  const valueOf = (tag: string) => /value="([^"]+)"/.exec(tag)?.[1];

  it('이미지 관리 탭 라디오는 2.6 Sunburst, 2.6 Flare, 2.5 Sunburst, 2.5 Flare 순서이고 2.6 Sunburst 만 기본 checked', () => {
    expect(radios.map(valueOf)).toEqual([S26, F26, S25, F25]);
    expect(radios.filter((r) => /\schecked/.test(r)).map(valueOf)).toEqual([S26]);
  });

  it('index.html 에 2.6 라벨과 기본 단가 문구가 보인다', () => {
    expect(html).toContain('gpt-image-2.6 Sunburst');
    expect(html).toContain('gpt-image-2.6 Flare');
    expect(html).toContain('한 장당 약 ₩18원 (gpt-image-2.6-sunburst / Medium)');
  });

  it('서브모달(HeadingImageSettings) select 는 2.6 이 먼저이고 저장값 복원 기본이 2.6 Sunburst', () => {
    const src = read('../renderer/components/HeadingImageSettings.ts');
    const order = [S26, F26, S25, F25].map((id) => src.indexOf(`<option value="${id}">`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(src).toContain("const validModels = ['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'];");
    expect(src).toMatch(/validModels\.includes\(restoredModel\) \? restoredModel : 'gpt-image-2\.6-sunburst'/);
    expect(src).toMatch(/\|\| localStorage\.getItem\('openaiImageModel'\) \|\| 'gpt-image-2\.6-sunburst'/);
    expect(src).toContain('gpt-image-2.6');
  });

  it('서브모달의 5단계 판정이 2.6 도 포함한다', () => {
    const src = read('../renderer/components/HeadingImageSettings.ts');
    expect(src).toMatch(/const isV25 = .*gpt-image-2\.6/);
  });

  it('이미지 관리 탭 모델 목록·폴백이 2.6 기준이다', () => {
    const src = read('../renderer/modules/imageManagementTab.ts');
    expect(src).toContain(`const OPENAI_MODEL_VALUES = ['${S26}', '${F26}', '${S25}', '${F25}'];`);
    expect(src).toContain("getOpenAISel('openai-image-model', 'gpt-image-2.6-sunburst')");
    expect(src).not.toContain("getOpenAISel('openai-image-model', 'gpt-image-2.5-sunburst')");
    expect(src).toContain('gpt-image-2.6');
  });

  it('설정 동기화 화면 목록에 4개 모두 있다', () => {
    const src = read('../renderer/modules/imageSettingsSyncUi.ts');
    expect(src).toContain(`const IMG_SYNC_OPENAI_MODELS = ['${S26}', '${F26}', '${S25}', '${F25}'];`);
  });

  it('이미지 엔진 로그의 모델 라벨이 선택 모델(2.6 포함)을 그대로 보여준다', () => {
    const src = read('../renderer/modules/headingImageGen.ts');
    expect(src).not.toMatch(/_oiRaw === 'gpt-image-2\.5-flare' \?/);
    expect(src.match(/_rawPipeline\.openaiImageModel/g)?.length).toBe(2);
    expect(src).toContain('gpt-image-2.6-sunburst');
  });

  it.each([
    ['../renderer/components/HeadingImageSettings.ts'],
    ['../renderer/modules/continuousPublishing.ts'],
    ['../renderer/modules/guideModals.ts'],
    ['../renderer/modules/imageGenStudioCore.ts'],
    ['../renderer/modules/openaiImageGuard.ts'],
    ['../renderer/utils/imageCostUtils.ts'],
    ['../runtime/imageEngineCatalog.ts'],
  ])('%s 의 덕트테이프 안내 문구에 2.6 이 보인다', (rel) => {
    expect(read(rel)).toContain('gpt-image-2.6');
  });

  it('덕트테이프 안내 문구에 "gpt-image-2.5" 만 단독으로 쓰는 곳이 없다 (표시 문자열 기준)', () => {
    const files = [
      '../renderer/modules/continuousPublishing.ts',
      '../renderer/modules/guideModals.ts',
      '../renderer/modules/imageGenStudioCore.ts',
      '../renderer/modules/openaiImageGuard.ts',
    ];
    for (const rel of files) {
      const lines = read(rel).split('\n').filter((l) => {
        const t = l.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
      });
      const bad = lines.filter((l) => /덕트테이프\(gpt-image-2\.5\)|덕트테이프 gpt-image-2\.5\(|OpenAI gpt-image-2\.5 Flare/.test(l));
      expect(bad, rel).toEqual([]);
    }
  });
});
