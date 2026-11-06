// @vitest-environment happy-dom
/**
 * [2026-10-10] 덕트테이프(openai-image) 세부 모델은 gpt-image-2.5 Sunburst(기본)·Flare 둘만 남긴다.
 * 화면 옵션 삭제 + 저장값 이관 + 기본값/정규화 변경이 함께 유지되는지 못 박는다.
 *
 * [2026-11-06] GPT Image 2.6 추가: 기본값이 2.6 Sunburst 로 바뀌고 목록이 4개(2.6 Sunburst, 2.6 Flare, 2.5 Sunburst, 2.5 Flare)가 됐다.
 *   그래서 "기본값 = 2.5 Sunburst" · "목록 = 2개" 를 고정하던 단언만 새 결정에 맞게 고쳤다(각 줄에 이유 표기).
 *   옛 1 / 1.5 / 2 가 사라진 것, 사용자가 고른 2.5 값이 보존되는 것, 멱등 이관 등 나머지 단언은 그대로다.
 *   2.6 자체의 시험은 openaiImage26Support.test.ts.
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
import { studioEngineCostKrw } from '../renderer/modules/imageGenStudioCore.js';

const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const FLARE = 'gpt-image-2.5-flare';
const SUNBURST = 'gpt-image-2.5-sunburst';
const DEFAULT_MODEL = 'gpt-image-2.6-sunburst'; // [2026-11-06] 새 기본값
const FLARE26 = 'gpt-image-2.6-flare';

function makeStore(init: Record<string, string>) {
  const data: Record<string, string> = { ...init };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
  };
}

describe('덕트테이프 화면 — 1.5 / 2 / 1 이 없다 (2.6 Sunburst·Flare + 2.5 Sunburst·Flare 4개만)', () => {
  const html = read('../../public/index.html');
  const radios = [...html.matchAll(/<input[^>]*name="openai-image-model"[^>]*>/g)].map((m) => m[0]);

  it('이미지 관리 탭 모델 라디오는 2.6 Sunburst·2.6 Flare·2.5 Sunburst·2.5 Flare 네 개뿐이다', () => {
    // [2026-11-06] 두 개 → 네 개 (2.6 이 먼저)
    const values = radios.map((r) => /value="([^"]+)"/.exec(r)?.[1]);
    expect(values).toEqual([DEFAULT_MODEL, FLARE26, SUNBURST, FLARE]);
  });

  it('2.6 Sunburst 가 기본 checked 이고 나머지는 아니다', () => {
    // [2026-11-06] 기본 checked 가 두 번째 → 첫 번째(2.6 Sunburst) 로 이동
    expect(radios[0]).toContain('checked');
    for (const r of radios.slice(1)) expect(r).not.toContain('checked');
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
    // 목록 밖(옛 1 / 1.5 / 2·빈 값)이면 기본값으로 복원, 명시 선택한 2.5·2.6 값은 그대로
    // [2026-11-06] 기본값 2.5 Sunburst → 2.6 Sunburst
    expect(src).toMatch(/validModels\.includes\(restoredModel\) \? restoredModel : 'gpt-image-2\.6-sunburst'/);
    expect(src).toMatch(/\|\| localStorage\.getItem\('openaiImageModel'\) \|\| 'gpt-image-2\.6-sunburst'/);
    expect(src).not.toMatch(/savedModel === 'gpt-image-2'/);
    // 서브모달 select 의 첫 option(저장값이 없을 때 보이는 값)이 기본값 2.6 Sunburst 다
    expect(src.indexOf(`<option value="${DEFAULT_MODEL}">`)).toBeLessThan(src.indexOf(`<option value="${SUNBURST}">`));
    expect(src.indexOf(`<option value="${DEFAULT_MODEL}">`)).toBeLessThan(src.indexOf(`<option value="${FLARE}">`));
  });

  it('이미지 생성 스튜디오·엔진 목록은 2.6 기준 표기이고 대표 모델이 2.6 Sunburst 다', () => {
    // [2026-11-06] 표기 2.5 → 2.6, 대표 모델 2.5 Sunburst → 2.6 Sunburst
    const studio = read('../renderer/modules/imageGenStudioCore.ts');
    expect(studio).not.toMatch(/gpt-image-2 \/ 2\.5/);
    expect(studio).toContain('gpt-image-2.6 Flare / Sunburst');
    expect(DUCK_TAPE.model).toBe(DEFAULT_MODEL);
  });

  it('이미지 관리 탭 모델 목록·폴백이 2.6 Sunburst 기준이다', () => {
    const src = read('../renderer/modules/imageManagementTab.ts');
    // [2026-11-06] 목록 4개(2.6 먼저), 폴백 2.5 Sunburst → 2.6 Sunburst
    expect(src).toContain(`const OPENAI_MODEL_VALUES = ['${DEFAULT_MODEL}', '${FLARE26}', '${SUNBURST}', '${FLARE}'];`);
    expect(src).not.toMatch(/'gpt-image-1\.5'/);
    expect(src).toContain("getOpenAISel('openai-image-model', 'gpt-image-2.6-sunburst')");
    expect(src).not.toContain("getOpenAISel('openai-image-model', 'gpt-image-2.5-flare')");
    expect(src).not.toContain("getOpenAISel('openai-image-model', 'gpt-image-2.5-sunburst')");
    expect(src).not.toMatch(/data-v25-only|v25Only/);
  });
});

describe('설정 정규화 — 명시 선택은 그대로, 옛 1 / 1.5 / 2·빈 값·이상값은 기본값 2.6 Sunburst', () => {
  // [2026-11-06] 기본값 2.5 Sunburst → 2.6 Sunburst
  it.each(['gpt-image-1.5', 'gpt-image-1', 'gpt-image-2', '', '   ', 'dall-e-3', 'whatever'])(
    '%j → 2.6 Sunburst',
    (v) => expect(normalizeOpenaiImageModel(v)).toBe(DEFAULT_MODEL),
  );

  it('옛 gpt-image-2 도 2.6 Sunburst (공백 포함, 멱등)', () => {
    expect(normalizeOpenaiImageModel('gpt-image-2')).toBe(DEFAULT_MODEL);
    expect(normalizeOpenaiImageModel(' gpt-image-2 ')).toBe(DEFAULT_MODEL);
    expect(normalizeOpenaiImageModel(normalizeOpenaiImageModel('gpt-image-2'))).toBe(DEFAULT_MODEL);
  });

  it.each([undefined, null, 0, {}, []])('문자열이 아닌 값 %j → 2.6 Sunburst', (v) => {
    expect(normalizeOpenaiImageModel(v)).toBe(DEFAULT_MODEL);
  });

  it('사용자가 명시적으로 고른 Flare·Sunburst 는 그대로 (앞뒤 공백만 정리)', () => {
    expect(normalizeOpenaiImageModel(` ${FLARE} `)).toBe(FLARE);
    expect(normalizeOpenaiImageModel(FLARE)).toBe(FLARE);
    expect(normalizeOpenaiImageModel(SUNBURST)).toBe(SUNBURST);
    expect(normalizeOpenaiImageModel(` ${SUNBURST} `)).toBe(SUNBURST);
  });

  it('기본값과 선택지가 정책대로다', () => {
    // [2026-11-06] 기본값 2.6 Sunburst, 선택지 4개(2.6 먼저)
    expect(DEFAULT_OPENAI_IMAGE_MODEL).toBe(DEFAULT_MODEL);
    expect([...OPENAI_IMAGE_MODEL_CHOICES]).toEqual([DEFAULT_MODEL, FLARE26, SUNBURST, FLARE]);
  });

  it('configManager 가 불러올 때 정책 함수를 쓰고 옛 허용 목록·1.5 기본값이 없다', () => {
    const src = read('../configManager.ts');
    expect(src).toMatch(/openaiImageModel: normalizeOpenaiImageModel\(parsed\.openaiImageModel\)/);
    // [2026-11-06] 타입 유니언에 2.6 두 모델이 앞에 추가됨
    expect(src).toMatch(/openaiImageModel\?: 'gpt-image-2\.6-sunburst' \| 'gpt-image-2\.6-flare' \| 'gpt-image-2\.5-sunburst' \| 'gpt-image-2\.5-flare'/);
    expect(src).not.toMatch(/: 'gpt-image-1\.5',/);
  });

  it('openaiImageGenerator 기본 모델이 Sunburst 이고 지정값은 정규화를 탄다', () => {
    const src = read('../image/openaiImageGenerator.ts');
    expect(src).not.toMatch(/DEFAULT_OPENAI_IMAGE_MODEL\s*=\s*'gpt-image-1\.5'/);
    expect(src).toMatch(/normalizeOpenaiImageModel\(overrideModel \|\| config\.openaiImageModel\)/);
    expect(src).toMatch(/normalizeOpenaiImageModel\(options\.model \|\| config\.openaiImageModel\)/);
  });
});

describe('localStorage 이관 — 멱등', () => {
  // [2026-11-06] 이관 목적지가 2.5 Sunburst → 새 기본값 2.6 Sunburst
  it.each(['gpt-image-1.5', 'gpt-image-1'])('%s → 2.6 Sunburst 로 바뀐다', (old) => {
    const store = makeStore({ openaiImageModel: old });
    expect(migrateOpenaiImageTwoModels(store)).toBe(1);
    expect(store.data.openaiImageModel).toBe(DEFAULT_MODEL);
  });

  it('사용자가 명시적으로 고른 Flare 는 건드리지 않는다', () => {
    const picked = makeStore({ openaiImageModel: FLARE });
    expect(migrateOpenaiImageTwoModels(picked)).toBe(0);
    expect(picked.data.openaiImageModel).toBe(FLARE);
  });

  it('gpt-image-2 → 2.6 Sunburst 로 바뀌고 품질 값은 그대로다', () => {
    const store = makeStore({ openaiImageModel: 'gpt-image-2', openaiImageQuality: 'high' });
    expect(migrateOpenaiImageTwoModels(store)).toBe(1);
    expect(store.data.openaiImageModel).toBe(DEFAULT_MODEL);
    expect(store.data.openaiImageQuality).toBe('high');
  });

  it('두 번 돌려도 같은 결과이고 두 번째는 바꾼 게 없다', () => {
    const store = makeStore({ openaiImageModel: 'gpt-image-2' });
    migrateOpenaiImageTwoModels(store);
    expect(migrateOpenaiImageTwoModels(store)).toBe(0);
    expect(store.data.openaiImageModel).toBe(DEFAULT_MODEL);
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

describe('쇼핑 강제 모델 — 기본값 2.6 Sunburst', () => {
  it('별칭 provider(gpt-image-2)는 Sunburst 로 승계되어 통과한다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('gpt-image-2')).toBe(true);
  });

  it('모델로서의 gpt-image-2 / 1.5 는 막고 2.5 두 모델은 통과한다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-2')).toBe(false);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', 'gpt-image-1.5')).toBe(false);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', FLARE)).toBe(true);
    expect(isShoppingReferenceGenerationSelectionSupported('openai-image', SUNBURST)).toBe(true);
  });

  it('pipelineConfig 가 덕트테이프 별칭에 강제하는 모델은 기본값 2.6 Sunburst 다', () => {
    const src = read('../renderer/modules/pipelineConfig.ts');
    expect(src).not.toMatch(/\? 'gpt-image-2'\s*[:\r\n]/);
    // [2026-11-06] 기본값 2.5 → 2.6 Sunburst
    expect(src.match(/\? 'gpt-image-2\.6-sunburst'/g)?.length).toBe(2);
    // [2026-10-10] 쇼핑에서 덕트테이프를 골라도 모델을 강제하지 않는다(사용자가 고른 Flare 를 Sunburst 로 덮지 않음).
    expect(src).not.toContain('shoppingUiSelectsDucttape');
  });
});

describe('단가표 — 모르는 모델은 기본 모델(Sunburst) 단가', () => {
  it('옛 모델·이상값도 기본 모델 단가로 계산한다', () => {
    const flare = getOpenAIImageCostKRW(FLARE, 'medium', 1400);
    expect(flare).toBe(Math.round(0.0132 * 1400));
    for (const m of ['gpt-image-1.5', 'gpt-image-2', 'gpt-image-1', '', 'unknown']) {
      expect(getOpenAIImageCostKRW(m, 'medium', 1400)).toBe(flare);
    }
  });

  it('Sunburst 도 같은 5단계 단가표를 쓴다', () => {
    expect(getOpenAIImageCostKRW(SUNBURST, 'max', 1400)).toBe(Math.round(0.2107 * 1400));
  });

  it('스튜디오·카탈로그 덕트테이프 단가 = imageCostUtils 기본 모델(Sunburst) medium 단가 (옛 ₩280 고정 금지)', () => {
    const defaultMedium = getOpenAIImageCostKRW(SUNBURST, 'medium');
    expect(defaultMedium).toBe(18);
    expect(DUCK_TAPE.costKrw).toBe(defaultMedium);
    expect(studioEngineCostKrw('openai-image')).toBe(defaultMedium);
    expect(read('../renderer/modules/imageGenStudioCore.ts')).not.toMatch(/고가/);
  });
});

describe('사용자 노출 문구 — 옛 모델명·엇갈린 Org 안내 재발 방지', () => {
  // 검사 범위: src/renderer 와 src/imageGenerator.ts 의 .ts 소스 전체.
  // 제외: 줄 주석(// 또는 * 로 시작하는 줄), 이관 코드(imageProviderMigration 은 src/runtime 이라 범위 밖),
  //       기록용 단가표(apiUsageTracker 는 src/main 쪽이라 범위 밖), 로그에만 남는 console.* 줄.
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [full] : [];
    });
  const files = [...walk(path.resolve(__dirname, '../renderer')), path.resolve(__dirname, '../imageGenerator.ts')];
  const banned = [/gpt-image-1 \/ 1\.5 \/ 2/, /gpt-image-1\/1\.5\/2/, /gpt-image-2\(덕트테이프\)/, /📦 모델: gpt-image-1/];
  const offenders = files.flatMap((f) =>
    fs.readFileSync(f, 'utf-8').split(/\r?\n/).flatMap((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || /^console\./.test(t)) return [];
      return banned.some((re) => re.test(line)) ? [`${path.basename(f)}:${i + 1}`] : [];
    }),
  );

  it('금지 문구가 사용자 노출 문자열에 없다', () => {
    expect(offenders).toEqual([]);
  });

  it('진행 로그는 실제 선택 모델을 읽는다', () => {
    const src = read('../renderer/modules/headingImageGen.ts');
    expect(src.match(/_rawPipeline\.openaiImageModel/g)?.length).toBe(2);
  });
});
