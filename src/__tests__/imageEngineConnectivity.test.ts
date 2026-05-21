/**
 * Stage 4 — 이미지 엔진 연동 회귀 가드 (사용자 요구사항 #8: "모든 파이프라인 정상 연동 확인")
 *
 * 목적: 그리드/드롭다운에서 고른 4개 엔진(나노바나나2/프로/나노바나나/덕테이프)이
 *   ① 카탈로그 → ② 모델 키 → ③ 실제 API 모델 ID → ④ 디스패치 분기까지
 *   끊김 없이 연결되는지 API 키 없이 정적으로 전수 검증한다.
 *   하나라도 끊기면 "선택했는데 생성 실패"가 발생하므로 이 테스트가 영구 차단한다.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  IMAGE_ENGINE_CATALOG,
  NANO_PROVIDER_TO_MODEL_KEY,
  getImageEngineSpec,
} from '../runtime/imageEngineCatalog.js';
import {
  VERIFIED_IMAGE_MODELS,
  isVerifiedImageModel,
  NANO_BANANA_USER_KEY_TO_MODEL,
} from '../runtime/modelRegistry.js';
import { ALLOWED_PROVIDER, assertProvider } from '../image/types.js';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

/** 사용자가 그리드/드롭다운에서 고를 수 있는 4개 AI 생성엔진 */
const ENGINE_VALUES = ['nano-banana-2', 'nano-banana-pro', 'nano-banana', 'openai-image'];
const NANO_VALUES = ['nano-banana', 'nano-banana-2', 'nano-banana-pro'];

describe('Stage 4 — 카탈로그 무결성', () => {
  it('카탈로그는 정확히 4개 엔진을 가진다', () => {
    expect(IMAGE_ENGINE_CATALOG.map((e) => e.value).sort()).toEqual(ENGINE_VALUES.slice().sort());
  });

  it('모든 엔진의 model ID는 VERIFIED_IMAGE_MODELS에 속한다 (가짜 ID 차단)', () => {
    for (const engine of IMAGE_ENGINE_CATALOG) {
      expect(isVerifiedImageModel(engine.model), `${engine.value} → ${engine.model}`).toBe(true);
    }
  });

  it('각 엔진은 라벨·가격·무료한도 안내를 갖춘다 (UI 노출 필수 필드)', () => {
    for (const engine of IMAGE_ENGINE_CATALOG) {
      expect(engine.label.length, engine.value).toBeGreaterThan(0);
      expect(engine.costKrw, engine.value).toBeGreaterThan(0);
      expect(engine.freeTierNote.length, engine.value).toBeGreaterThan(10);
    }
  });

  it('나노바나나 3종의 모델은 서로 다르다 (통합 회귀 차단)', () => {
    const models = NANO_VALUES.map((v) => getImageEngineSpec(v)!.model);
    expect(new Set(models).size).toBe(3);
  });
});

describe('Stage 4 — provider → 모델 키 → API 모델 ID 연동 체인', () => {
  it('나노바나나 3종 provider가 NANO_PROVIDER_TO_MODEL_KEY에 모두 매핑된다', () => {
    for (const v of NANO_VALUES) {
      expect(NANO_PROVIDER_TO_MODEL_KEY[v], v).toBeTruthy();
    }
  });

  it('각 나노 모델 키는 NANO_BANANA_USER_KEY_TO_MODEL에서 검증된 모델로 해석된다', () => {
    for (const v of NANO_VALUES) {
      const modelKey = NANO_PROVIDER_TO_MODEL_KEY[v];
      const resolved = NANO_BANANA_USER_KEY_TO_MODEL[modelKey];
      expect(resolved, `${v} → ${modelKey}`).toBeTruthy();
      expect(isVerifiedImageModel(resolved.model), `${modelKey} → ${resolved.model}`).toBe(true);
    }
  });

  it('카탈로그 forceModelKey와 NANO_PROVIDER_TO_MODEL_KEY가 일치한다 (SSOT 단일성)', () => {
    for (const v of NANO_VALUES) {
      expect(getImageEngineSpec(v)!.forceModelKey).toBe(NANO_PROVIDER_TO_MODEL_KEY[v]);
    }
  });

  it('카탈로그의 model과 모델 키 해석 결과가 일치한다', () => {
    for (const v of NANO_VALUES) {
      const spec = getImageEngineSpec(v)!;
      const resolved = NANO_BANANA_USER_KEY_TO_MODEL[spec.forceModelKey!];
      expect(resolved.model, v).toBe(spec.model);
    }
  });
});

describe('Stage 4 — ALLOWED_PROVIDER / assertProvider 통과', () => {
  for (const v of ENGINE_VALUES) {
    it(`'${v}'는 ALLOWED_PROVIDER에 포함되고 assertProvider를 통과한다`, () => {
      expect(ALLOWED_PROVIDER).toContain(v);
      expect(() => assertProvider(v)).not.toThrow();
    });
  }
});

describe('Stage 4 — imageGenerator 디스패치 분기 존재', () => {
  const dispatchCode = read('imageGenerator.ts');

  it('나노바나나 3종이 단일 nano 분기 조건에 모두 포함된다', () => {
    expect(dispatchCode).toMatch(
      /normalizedProvider === 'nano-banana'[\s\S]{0,160}?'nano-banana-2'[\s\S]{0,160}?'nano-banana-pro'/,
    );
  });

  it("덕테이프(openai-image) 분기가 generateWithOpenAIImage로 라우팅된다", () => {
    expect(dispatchCode).toMatch(
      /normalizedProvider === 'openai-image'[\s\S]{0,300}?generateWithOpenAIImage/,
    );
  });

  it('나노 분기가 NANO_PROVIDER_TO_MODEL_KEY로 forceModelKey를 결정한다', () => {
    expect(dispatchCode).toMatch(/NANO_PROVIDER_TO_MODEL_KEY\[normalizedProvider\]/);
  });
});

describe('Stage 4 — nanoBananaProGenerator MODEL_MAP 연동', () => {
  const genCode = read('image/nanoBananaProGenerator.ts');

  it('3개 모델 키가 MODEL_MAP에서 카탈로그와 동일한 API 모델로 매핑된다', () => {
    for (const v of NANO_VALUES) {
      const spec = getImageEngineSpec(v)!;
      const key = spec.forceModelKey!;
      // MODEL_MAP 항목: 'key': { model: 'modelId' ...
      const re = new RegExp(`'${key.replace(/[.\-]/g, '\\$&')}':\\s*\\{\\s*model:\\s*'${spec.model.replace(/[.\-]/g, '\\$&')}'`);
      expect(genCode, `${key} → ${spec.model}`).toMatch(re);
    }
  });
});

// ⚠️ 이 describe의 UI 일치 테스트는 Stage 5(UI 4표면 개편) 완료 후 .skip을 제거해 활성화한다.
//    Stage 5의 GREEN 게이트 = 아래 테스트들이 통과하는 것.
describe('Stage 4 — UI 표면 ↔ 카탈로그 일치 (그리드/드롭다운)', () => {
  it.skip('[Stage 5 게이트] index.html 이미지 소스 드롭다운에 4개 엔진 value가 모두 존재한다', () => {
    const html = read('../public/index.html');
    // image-source-select 드롭다운 블록 추출
    const block = html.match(/id="image-source-select"[\s\S]{0,2000}?<\/select>/)?.[0] || '';
    for (const v of ENGINE_VALUES) {
      expect(block, `드롭다운 option value="${v}"`).toContain(`value="${v}"`);
    }
  });

  it.skip('[Stage 5 게이트] HeadingImageSettings 엔진 선택 그리드에 4개 엔진 data-value가 모두 존재한다', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');
    const block = code.match(/id="image-source-submodal"[\s\S]{0,3000}?image-source-confirm/)?.[0] || '';
    for (const v of ENGINE_VALUES) {
      expect(block, `그리드 data-value="${v}"`).toContain(`data-value="${v}"`);
    }
  });

  it('그리드/드롭다운에 폐기 엔진(달리3)이 없다', () => {
    const html = read('../public/index.html');
    const dropdownBlock = html.match(/id="image-source-select"[\s\S]{0,2000}?<\/select>/)?.[0] || '';
    expect(dropdownBlock).not.toContain('value="dall-e-3"');
  });
});
