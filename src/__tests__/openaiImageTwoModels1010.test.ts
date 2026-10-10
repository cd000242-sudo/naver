// @vitest-environment happy-dom
/**
 * [2026-10-10] 덕트테이프(openai-image) 세부 모델은 gpt-image-2.5 Flare(기본)·Sunburst 둘만 남긴다.
 * 화면 옵션 삭제 + 저장값 이관 + 기본값/정규화 변경이 함께 유지되는지 못 박는다.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_MODEL_CHOICES,
  normalizeOpenaiImageModel,
} from '../runtime/modelRegistry.js';
import { migrateOpenaiImageTwoModels } from '../runtime/imageProviderMigration.js';
import { isShoppingReferenceGenerationSelectionSupported } from '../image/shoppingReferenceGeneration.js';
import { getOpenAIImageCostKRW } from '../renderer/utils/imageCostUtils.js';
import { DUCK_TAPE } from '../runtime/imageEngineCatalog.js';

const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const FLARE = 'gpt-image-2.5-flare';
const SUNBURST = 'gpt-image-2.5-sunburst';

function makeStore(init: Record<string, string>) {
  const data: Record<string, string> = { ...init };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
  };
}

describe('덕트테이프 화면 — 1.5 / 2 / 1 이 없다', () => {
  const html = read('../../public/index.html');
  const radios = [...html.matchAll(/<input[^>]*name="openai-image-model"[^>]*>/g)].map((m) => m[0]);

  it('이미지 관리 탭 모델 라디오는 Flare·Sunburst 두 개뿐이다', () => {
    const values = radios.map((r) => /value="([^"]+)"/.exec(r)?.[1]);
    expect(values).toEqual([FLARE, SUNBURST]);
  });

  it('Flare 가 기본 checked 이고 Sunburst 는 아니다', () => {
    expect(radios[0]).toContain('checked');
    expect(radios[1]).not.toContain('checked');
  });

  it('품질 xhigh/max 를 숨기는 data-v25-only 표시가 화면에 없다', () => {
    expect(html).not.toContain('data-v25-only');
  });

  it('덕트테이프 안내 문구에 옛 모델명이 남지 않았다', () => {
    expect(html).not.toMatch(/gpt-image-1\.5/);
    expect(html).not.toMatch(/gpt-image-2(?![.\d])/);
  });

  it('서브모달 OpenAI select 에 gpt-image-1 / 1.5 / 2 option 이 없다', () => {
    const src = read('../renderer/components/HeadingImageSettings.ts');
    expect(src).not.toMatch(/<option value="gpt-image-1(\.5)?">/);
    expect(src).not.toMatch(/<option value="gpt-image-2">/);
    expect(src).toContain(`<option value="${FLARE}">`);
    expect(src).toContain(`<option value="${SUNBURST}">`);
    // 목록 밖이면 Flare 로 복원
    expect(src).toMatch(/validModels\.includes\(savedModel\) \? savedModel : 'gpt-image-2\.5-flare'/);
  });

  it('이미지 생성 스튜디오·엔진 목록은 2.5 기준 표기이고 대표 모델이 Flare 다', () => {
    const studio = read('../renderer/modules/imageGenStudioCore.ts');
    expect(studio).not.toMatch(/gpt-image-2 \/ 2\.5/);
    expect(studio).toContain('gpt-image-2.5 Flare / Sunburst');
    expect(DUCK_TAPE.model).toBe(FLARE);
  });

  it('이미지 관리 탭 모델 목록·폴백이 Flare 기준이다', () => {
    const src = read('../renderer/modules/imageManagementTab.ts');
    expect(src).toContain(`const OPENAI_MODEL_VALUES = ['${FLARE}', '${SUNBURST}'];`);
    expect(src).not.toMatch(/'gpt-image-1\.5'/);
    expect(src).not.toMatch(/data-v25-only|v25Only/);
  });
});

describe('설정 정규화 — 옛 값·이상값은 Flare', () => {
  it.each(['gpt-image-1.5', 'gpt-image-2', 'gpt-image-1', '', '   ', 'dall-e-3', 'whatever'])(
    '%j → Flare',
    (v) => expect(normalizeOpenaiImageModel(v)).toBe(FLARE),
  );

  it.each([undefined, null, 0, {}, []])('문자열이 아닌 값 %j → Flare', (v) => {
    expect(normalizeOpenaiImageModel(v)).toBe(FLARE);
  });

  it('Flare·Sunburst 는 그대로 (앞뒤 공백만 정리)', () => {
    expect(normalizeOpenaiImageModel(FLARE)).toBe(FLARE);
    expect(normalizeOpenaiImageModel(SUNBURST)).toBe(SUNBURST);
    expect(normalizeOpenaiImageModel(` ${SUNBURST} `)).toBe(SUNBURST);
  });

  it('기본값과 선택지가 정책대로다', () => {
    expect(DEFAULT_OPENAI_IMAGE_MODEL).toBe(FLARE);
    expect([...OPENAI_IMAGE_MODEL_CHOICES]).toEqual([FLARE, SUNBURST]);
  });

  it('configManager 가 불러올 때 정책 함수를 쓰고 옛 허용 목록·1.5 기본값이 없다', () => {
    const src = read('../configManager.ts');
    expect(src).toMatch(/openaiImageModel: normalizeOpenaiImageModel\(parsed\.openaiImageModel\)/);
    expect(src).toMatch(/openaiImageModel\?: 'gpt-image-2\.5-flare' \| 'gpt-image-2\.5-sunburst'/);
    expect(src).not.toMatch(/: 'gpt-image-1\.5',/);
  });

  it('openaiImageGenerator 기본 모델이 Flare 이고 지정값은 정규화를 탄다', () => {
    const src = read('../image/openaiImageGenerator.ts');
    expect(src).not.toMatch(/DEFAULT_OPENAI_IMAGE_MODEL\s*=\s*'gpt-image-1\.5'/);
    expect(src).toMatch(/normalizeOpenaiImageModel\(overrideModel \|\| config\.openaiImageModel\)/);
    expect(src).toMatch(/normalizeOpenaiImageModel\(options\.model \|\| config\.openaiImageModel\)/);
  });
});

describe('localStorage 이관 — 멱등', () => {
  it.each(['gpt-image-1.5', 'gpt-image-2', 'gpt-image-1'])('%s → Flare 로 바뀐다', (old) => {
    const store = makeStore({ openaiImageModel: old });
    expect(migrateOpenaiImageTwoModels(store)).toBe(1);
    expect(store.data.openaiImageModel).toBe(FLARE);
  });

  it('두 번 돌려도 같은 결과이고 두 번째는 바꾼 게 없다', () => {
    const store = makeStore({ openaiImageModel: 'gpt-image-2' });
    migrateOpenaiImageTwoModels(store);
    expect(migrateOpenaiImageTwoModels(store)).toBe(0);
    expect(store.data.openaiImageModel).toBe(FLARE);
  });

  it('사용자가 고른 Sunburst 는 건드리지 않고, 값이 없으면 키를 만들지 않는다', () => {
    const picked = makeStore({ openaiImageModel: SUNBURST });
    expect(migrateOpenaiImageTwoModels(picked)).toBe(0);
    expect(picked.data.openaiImageModel).toBe(SUNBURST);
    const empty = makeStore({});
    expect(migrateOpenaiImageTwoModels(empty)).toBe(0);
    expect('openaiImageModel' in empty.data).toBe(false);
  });

  it('기동 때(renderer) 이관을 호출한다', () => {
    const src = read('../renderer/renderer.ts');
    expect(src).toMatch(/migrateOpenaiImageTwoModels\(\);/);
  });
});

describe('쇼핑 강제 모델 — Flare', () => {
  it('별칭 provider(gpt-image-2)는 Flare 로 승계되어 통과한다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('gpt-image-2')).toBe(true);
  });

  it('모델로서의 gpt-image-2 / 1.5 는 막고 2.5 두 모델은 통과한다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-2')).toBe(false);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-1.5')).toBe(false);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', FLARE)).toBe(true);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', SUNBURST)).toBe(true);
  });

  it('pipelineConfig 가 덕트테이프 별칭에 강제하는 모델은 Flare 다', () => {
    const src = read('../renderer/modules/pipelineConfig.ts');
    expect(src).not.toMatch(/\? 'gpt-image-2'\s*[:\r\n]/);
    expect(src.match(/\? 'gpt-image-2\.5-flare'/g)?.length).toBe(2);
  });
});

describe('단가표 — 모르는 모델은 Flare 단가', () => {
  it('옛 모델·이상값도 Flare 단가로 계산한다', () => {
    const flare = getOpenAIImageCostKRW(FLARE, 'medium', 1400);
    expect(flare).toBe(Math.round(0.0132 * 1400));
    for (const m of ['gpt-image-1.5', 'gpt-image-2', 'gpt-image-1', '', 'unknown']) {
      expect(getOpenAIImageCostKRW(m, 'medium', 1400)).toBe(flare);
    }
  });

  it('Sunburst 도 같은 5단계 단가표를 쓴다', () => {
    expect(getOpenAIImageCostKRW(SUNBURST, 'max', 1400)).toBe(Math.round(0.2107 * 1400));
  });
});
