/**
 * ✅ [v1.4.80] 이미지 엔진 라우팅 회귀 방지 매트릭스
 *
 * 배경: 10명 에이전트 교차 검증으로 Flow 엔진이 4중 봉인 상태(types/cache/labels/import)였던 버그 발견.
 * 과거 "ImageFX만 실행" 버그와 동일한 SSOT 부재 문제.
 *
 * 본 테스트는 허용된 모든 엔진 값이 6곳 이상의 분산된 화이트리스트에 정확히 등록되어 있는지 정적 검증.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('v1.4.80 — 이미지 엔진 라우팅 매트릭스', () => {
  // 모든 활성 엔진이 반드시 등록되어야 하는 위치 7곳
  // ✅ [v2.8.2] 'dall-e-3' 추가 — UI 옵션은 v2.7.15부터 있었으나 화이트리스트에 누락되어 폴백되던 회귀 차단
  const ENGINES = ['nano-banana-pro', 'deepinfra', 'openai-image', 'dall-e-3', 'leonardoai', 'imagefx', 'flow'];

  describe('P0-1: types.ts — ImageProvider / ALLOWED_PROVIDER', () => {
    const code = read('image/types.ts');

    for (const engine of ENGINES) {
      it(`'${engine}' ImageProvider 유니온에 포함`, () => {
        expect(code).toMatch(new RegExp(`'${engine.replace(/[-/]/g, '\\$&')}'`));
      });
      it(`'${engine}' ALLOWED_PROVIDER 배열에 포함`, () => {
        // ALLOWED_PROVIDER 선언 후 배열 내 존재 확인
        const allowedBlock = code.match(/ALLOWED_PROVIDER[\s\S]{0,2000}?\];/)?.[0] || '';
        expect(allowedBlock).toMatch(new RegExp(`'${engine.replace(/[-/]/g, '\\$&')}'`));
      });
    }
  });

  describe('P0-2: unifiedDOMCache.ts — VALID_AI_SOURCES', () => {
    const code = read('renderer/modules/unifiedDOMCache.ts');

    for (const engine of ENGINES) {
      it(`'${engine}' VALID_AI_SOURCES에 포함 (오염값 판정 방지)`, () => {
        const block = code.match(/VALID_AI_SOURCES\s*=\s*\[[\s\S]{0,500}?\]/)?.[0] || '';
        expect(block).toMatch(new RegExp(`'${engine.replace(/[-/]/g, '\\$&')}'`));
      });
    }
  });

  describe('P0-3: HeadingImageSettings.ts — GlobalImageSource + VALID_SOURCES', () => {
    const code = read('renderer/components/HeadingImageSettings.ts');

    for (const engine of ENGINES) {
      it(`'${engine}' GlobalImageSource 타입 유니온에 포함`, () => {
        const typeDecl = code.match(/export type GlobalImageSource\s*=[\s\S]{0,500}?;/)?.[0] || '';
        expect(typeDecl).toMatch(new RegExp(`'${engine.replace(/[-/]/g, '\\$&')}'`));
      });
      it(`'${engine}' VALID_SOURCES 배열에 포함`, () => {
        const block = code.match(/VALID_SOURCES:\s*GlobalImageSource\[\]\s*=\s*\[[\s\S]{0,500}?\]/)?.[0] || '';
        expect(block).toMatch(new RegExp(`'${engine.replace(/[-/]/g, '\\$&')}'`));
      });
    }

    it("SOURCE_NAMES Record에 'flow' 라벨 존재 (Nano Banana 시리즈)", () => {
      // ✅ [v2.7.34] v2.7.25에서 라벨 'Nano Banana Pro' → 'Nano Banana 2'로 통합 변경 반영
      expect(code).toMatch(/'flow':\s*['"][^'"]*Nano Banana[^'"]*['"]/);
    });
  });

  describe('P0-4: imageFxGenerator.ts — ensureImageFxBrowserPage export', () => {
    const code = read('image/imageFxGenerator.ts');

    it('ensureImageFxBrowserPage export 함수 존재 (Flow 엔진이 import 가능)', () => {
      expect(code).toMatch(/export async function ensureImageFxBrowserPage\(\):\s*Promise<Page>/);
    });
  });

  describe('P0-5: headingImageGen.ts 개별 재생성 — flow/deepinfra 분기 존재', () => {
    const code = read('renderer/modules/headingImageGen.ts');

    it("imageSource === 'flow' 분기 존재", () => {
      expect(code).toMatch(/imageSource === 'flow'[\s\S]{0,500}?provider:\s*'flow'/);
    });

    it("imageSource === 'deepinfra' 분기 존재", () => {
      expect(code).toMatch(/imageSource === 'deepinfra'[\s\S]{0,500}?provider:\s*'deepinfra'/);
    });
  });

  // ✅ [v2.7.51] flowGenerator.ts v2.7.x 신 구조 회귀 가드 재작성
  //   기존 토큰(ImageFX 공유 패턴) → 자체 launchWithStealthFallback로 변경
  describe('P1: flowGenerator.ts — v2.7.x 신 구조 안정성', () => {
    const code = read('image/flowGenerator.ts');

    it('자체 launchWithStealthFallback (System Chrome/Edge/Chromium 폴백 체인)', () => {
      expect(code).toMatch(/async function launchWithStealthFallback/);
    });

    it('cachedContext/cachedPage 세션 캐싱 변수', () => {
      expect(code).toMatch(/let cachedContext/);
      expect(code).toMatch(/let cachedPage/);
    });

    it('헤드리스 false (사용자 로그인 필요)', () => {
      expect(code).toMatch(/headless:\s*false/);
    });

    it('webdriver 자동화 플래그 위장', () => {
      expect(code).toMatch(/Object\.defineProperty\(navigator,\s*['"]webdriver['"]/);
    });
  });

  describe('P2: 한글 텍스트 엔진 등록 + 라벨 통일', () => {
    it("isKoreanTextSupportedEngine에 'flow' 포함 (Nano Banana Pro 기반)", () => {
      const code = read('imageGenerator.ts');
      expect(code).toMatch(/isKoreanTextSupportedEngine[\s\S]{0,500}?engine\s*===\s*'flow'/);
    });

    it("providerDisplayNames에 'flow' 라벨 존재", () => {
      const code = read('imageGenerator.ts');
      expect(code).toMatch(/providerDisplayNames[\s\S]{0,500}?'flow':/);
    });

    it("continuousPublishing imageSourceNames에 'flow' 라벨", () => {
      const code = read('renderer/modules/continuousPublishing.ts');
      expect(code).toMatch(/'flow':\s*['"][^'"]*['"]/);
    });

    it("headingImageGen imageSourceNames에 'flow' 라벨", () => {
      const code = read('renderer/modules/headingImageGen.ts');
      const declBlock = code.match(/const imageSourceNames[\s\S]{0,1500}?\};/)?.[0] || '';
      expect(declBlock).toMatch(/'flow':/);
    });

    it("fullAutoFlow sourceNames에 'flow' 라벨", () => {
      const code = read('renderer/modules/fullAutoFlow.ts');
      expect(code).toMatch(/'flow':\s*['"][^'"]*Nano Banana Pro[^'"]*['"]/);
    });
  });

  describe('회귀 방지 — local-folder 폴백 오작동 차단', () => {
    const code = read('imageGenerator.ts');

    it("'local-folder'가 generateImages에 전달되면 명시적 throw", () => {
      expect(code).toMatch(/normalizedProvider === 'local-folder'[\s\S]{0,300}?throw new Error/);
    });
  });

  describe('회귀 방지 — imageGenerator if 분기 독립성', () => {
    const code = read('imageGenerator.ts');

    it("'flow' 분기가 imagefx 이후, deepinfra 이전에 존재", () => {
      const flowIdx = code.indexOf("normalizedProvider === 'flow'");
      const imagefxIdx = code.indexOf("normalizedProvider === 'imagefx'");
      const deepinfraIdx = code.indexOf("normalizedProvider === 'deepinfra'");
      expect(flowIdx).toBeGreaterThan(imagefxIdx);
      expect(flowIdx).toBeLessThan(deepinfraIdx);
    });
  });
});
