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
  it('카탈로그는 API 엔진 4종 + dropshot(UI 자동화) = 5개 엔진을 가진다', () => {
    expect(IMAGE_ENGINE_CATALOG.map((e) => e.value).sort()).toEqual([...ENGINE_VALUES, 'dropshot'].sort());
  });

  it('모든 엔진의 model ID는 VERIFIED_IMAGE_MODELS에 속한다 (가짜 ID 차단)', () => {
    for (const engine of IMAGE_ENGINE_CATALOG) {
      if (engine.value === 'dropshot') continue; // UI 자동화 — 실 API 모델 ID 없음(검증 대상 아님)
      expect(isVerifiedImageModel(engine.model), `${engine.value} → ${engine.model}`).toBe(true);
    }
  });

  it('각 엔진은 라벨·가격·무료한도 안내를 갖춘다 (UI 노출 필수 필드)', () => {
    for (const engine of IMAGE_ENGINE_CATALOG) {
      expect(engine.label.length, engine.value).toBeGreaterThan(0);
      // dropshot=0 (구독자 무제한·한계비용 0원) 처럼 0도 허용
      expect(engine.costKrw, engine.value).toBeGreaterThanOrEqual(0);
      expect(engine.freeTierNote.length, engine.value).toBeGreaterThan(10);
    }
  });

  it('나노바나나 3종의 모델은 서로 다르다 (통합 회귀 차단)', () => {
    const models = NANO_VALUES.map((v) => getImageEngineSpec(v)!.model);
    expect(new Set(models).size).toBe(3);
  });
});

describe('Gemini image billing failures', () => {
  const genCode = read('image/nanoBananaProGenerator.ts');

  it('stops retry loops immediately when Gemini prepaid image credits are depleted', () => {
    expect(genCode).toContain('GEMINI_IMAGE_BILLING_REQUIRED');
    expect(genCode).toMatch(/prepayment credits are depleted/);
    expect(genCode).toMatch(/isGeminiImageBillingRequiredMessage/);
    expect(genCode).toMatch(/throw createGeminiImageBillingRequiredError/);
  });

  it('prevents prepaid billing failures from entering the failed-image retry rounds', () => {
    expect(genCode).toMatch(/new Promise<GeneratedImage \| null>\(\(resolve, reject\)/);
    expect(genCode).toMatch(/isGeminiImageBillingRequiredError\(error\)[\s\S]{0,120}?reject\(error\)/);
    expect(genCode).toMatch(/billingFailure[\s\S]{0,160}?throw \(billingFailure as PromiseRejectedResult\)\.reason/);
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
  it('[Stage 5 게이트] index.html 이미지 소스 드롭다운에 4개 엔진 value가 모두 존재한다', () => {
    const html = read('../public/index.html');
    // image-source-select 드롭다운 블록 추출
    const block = html.match(/id="image-source-select"[\s\S]{0,5000}?<\/select>/)?.[0] || '';
    for (const v of ENGINE_VALUES) {
      expect(block, `드롭다운 option value="${v}"`).toContain(`value="${v}"`);
    }
  });

  it('[Stage 5 게이트] HeadingImageSettings 엔진 선택 그리드에 4개 엔진 data-value가 모두 존재한다', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');
    const block = code.match(/id="image-source-submodal"[\s\S]{0,8000}?image-source-confirm/)?.[0] || '';
    for (const v of ENGINE_VALUES) {
      expect(block, `그리드 data-value="${v}"`).toContain(`data-value="${v}"`);
    }
  });

  it('그리드/드롭다운에 폐기 엔진(달리3)이 없다', () => {
    const html = read('../public/index.html');
    const dropdownBlock = html.match(/id="image-source-select"[\s\S]{0,5000}?<\/select>/)?.[0] || '';
    // 블록 추출 실패(빈 문자열) 시 vacuous pass 방지 — 블록이 실제로 잡혔는지 먼저 단언
    expect(dropdownBlock).toContain('id="image-source-select"');
    expect(dropdownBlock).not.toContain('value="dall-e-3"');
  });
});

describe('Stage 6 — 덕테이프 한글 네이티브 텍스트 + 이중 텍스트 차단', () => {
  const openaiCode = read('image/openaiImageGenerator.ts');

  it('네이티브 한글 텍스트는 allowText이면서 썸네일이 아닌 이미지에만 적용된다', () => {
    expect(openaiCode).toMatch(
      /wantsNativeKoreanText\s*=[\s\S]{0,120}?allowText === true[\s\S]{0,80}?isThumbnail !== true/,
    );
  });

  it('NO_TEXT_PREFIX가 보존된다 (allowText 아닌 본문 이미지는 텍스트 없음 — 회귀 차단)', () => {
    expect(openaiCode).toContain('NO_TEXT_PREFIX');
    expect(openaiCode).toMatch(/textDirective\s*=\s*wantsNativeKoreanText[\s\S]{0,400}?:\s*NO_TEXT_PREFIX/);
  });

  it('프롬프트 3개 분기가 textDirective를 사용한다 (NO_TEXT 직접 사용 제거)', () => {
    const branchUses = (openaiCode.match(/\$\{textDirective\}/g) || []).length;
    expect(branchUses).toBeGreaterThanOrEqual(3);
  });
});

describe('Stage 9 — 엔진 정확 연동 (모델 잠금 — 선택 엔진 그대로 작동)', () => {
  const genCode = read('image/nanoBananaProGenerator.ts');

  it('forceModelKey(사용자 명시 선택) → isModelLocked 잠금 플래그 설정', () => {
    expect(genCode).toMatch(/const isModelLocked\s*=\s*!!forceModelKey/);
  });

  it('사전 모델 교체(pickWorkingImageModel)가 isModelLocked로 차단된다', () => {
    expect(genCode).toMatch(/if \(isModelLocked\)[\s\S]{0,200}?pickWorkingImageModel/);
  });

  it('503/429 폴백 체인이 isModelLocked일 때 비활성된다 (다른 모델 교체 금지)', () => {
    expect(genCode).toMatch(/global503FallbackActive && !isModelLocked/);
  });

  it('400 모델 오류 시 isModelLocked면 silent 대체 없이 명시 안내한다', () => {
    expect(genCode).toMatch(/isBadModelError[\s\S]{0,200}?if \(isModelLocked\)/);
  });

  it('imageGenerator가 나노 3종에 forceModelKey를 전달한다 (→ 잠금 활성)', () => {
    const dispatch = read('imageGenerator.ts');
    expect(dispatch).toMatch(/forceModelKey = NANO_PROVIDER_TO_MODEL_KEY\[normalizedProvider\]/);
  });
});
