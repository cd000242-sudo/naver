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
  const ENGINES = ['nano-banana-pro', 'deepinfra', 'openai-image', 'leonardoai', 'imagefx', 'flow'];

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

    it("SOURCE_NAMES Record에 'flow' 라벨 존재", () => {
      expect(code).toMatch(/'flow':\s*['"][^'"]*Nano Banana Pro[^'"]*['"]/);
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

  describe('P1: flowGenerator.ts — 무한 루프 방지 + import 안정성', () => {
    const code = read('image/flowGenerator.ts');

    it('_discoveryAttemptedThisSession 플래그 존재', () => {
      expect(code).toMatch(/_discoveryAttemptedThisSession/);
    });

    it('ensureImageFxBrowserPage 직접 import (동적 캐스팅 제거)', () => {
      expect(code).toMatch(/import\('\.\/imageFxGenerator\.js'\)/);
      expect(code).not.toMatch(/import\('\.\/imageFxGenerator\.js'\)\s*as\s*any/);
    });

    it('폴백 chromium.launch 경로 제거됨 (ImageFX 세션 공유 강제)', () => {
      expect(code).not.toMatch(/chromium\.launch\(\{ headless:\s*false \}\)/);
    });

    it('세션당 1회 재학습 제한 로직', () => {
      expect(code).toMatch(/이번 세션 1회 시도 완료|세션당 1회/);
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
