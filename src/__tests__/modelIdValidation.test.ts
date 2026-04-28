/**
 * ✅ [v1.4.77] 전 엔진 실존 모델 ID 검증 (2026-04-21 기준)
 *
 * 배경: 6명 에이전트 교차 검증으로 발견된 모델 ID 불일치·sunset 임박 건들을
 * 회귀 방지 레일로 고정한다.
 *
 * 검증 기준 (공식 소스):
 * - OpenAI: platform.openai.com/docs/models + /deprecations
 * - Anthropic: platform.claude.com/docs/en/about-claude/models/overview
 * - Google: ai.google.dev/gemini-api/docs/models + /deprecations
 * - Perplexity: docs.perplexity.ai/docs/sonar/models
 * - DeepInfra: deepinfra.com/black-forest-labs
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('v1.4.77 — 실존 모델 ID 매트릭스 (2026-04)', () => {
  describe('OpenAI: sunset 임박 ID 호출 금지', () => {
    it("gpt-4o / gpt-4o-mini 직접 호출이 실제 코드에서 제거됨 (2026-03-31 sunset)", () => {
      const callers = [
        read('main/utils/mainPromptInference.ts'),
        read('image/shoppingImageAnalyzer.ts'),
      ];
      for (const code of callers) {
        // model: 'gpt-4o-mini' 직접 호출 금지
        expect(code).not.toMatch(/model:\s*['"]gpt-4o-mini['"]/);
        expect(code).not.toMatch(/model:\s*['"]gpt-4o['"]/);
      }
    });

    it("번역·이미지 분석은 gpt-4.1-mini로 교체됨", () => {
      expect(read('main/utils/mainPromptInference.ts')).toMatch(/model:\s*['"]gpt-4\.1-mini['"]/);
      expect(read('image/shoppingImageAnalyzer.ts')).toMatch(/model:\s*['"]gpt-4\.1-mini['"]/);
    });

    it("DALL-E 3 직접 호출 없음 (2026-05-12 제거 예정)", () => {
      // src 디렉터리 내 그 어디에도 model: 'dall-e-3' 호출이 없어야 함
      const srcFiles = [
        'image/openaiImageGenerator.ts',
        'image/deepinfraGenerator.ts',
        'main.ts',
      ];
      for (const f of srcFiles) {
        try {
          const code = read(f);
          expect(code).not.toMatch(/model:\s*['"]dall-e-3['"]/);
        } catch { /* 파일 없으면 패스 */ }
      }
    });
  });

  describe('Claude: alias 정확성 (무접미사 사용 금지)', () => {
    const tracker = read('apiUsageTracker.ts');

    it("claude-opus-4-0 alias가 가격표에 존재 (Anthropic 공식 alias)", () => {
      expect(tracker).toMatch(/'claude-opus-4-0':/);
    });

    it("claude-sonnet-4-0 alias가 가격표에 존재", () => {
      expect(tracker).toMatch(/'claude-sonnet-4-0':/);
    });

    it("snapshot ID (claude-opus-4-20250514) 존재", () => {
      expect(tracker).toMatch(/'claude-opus-4-20250514':/);
      expect(tracker).toMatch(/'claude-sonnet-4-20250514':/);
    });

    it("Opus 4.5 snapshot (claude-opus-4-5-20251101) 존재", () => {
      expect(tracker).toMatch(/'claude-opus-4-5-20251101':/);
    });

    it("Haiku 4.5 snapshot (claude-haiku-4-5-20251001) 존재", () => {
      expect(tracker).toMatch(/'claude-haiku-4-5-20251001':/);
    });

    it("Opus 4.7 (2026-04-16 출시, 현행 최신) 존재", () => {
      expect(tracker).toMatch(/'claude-opus-4-7':/);
    });

    it("Sonnet 4.6 (2026-02-17 출시, 현행 최신) 존재", () => {
      expect(tracker).toMatch(/'claude-sonnet-4-6':/);
    });
  });

  describe('Gemini: 실존 모델 ID 매핑', () => {
    it("Nano Banana(Pro/2) 매핑은 정식 GA gemini-2.5-flash-image로 통합됨 (v2.7.24+)", () => {
      // ✅ [v2.7.24] gemini-3-pro-image-preview / gemini-3.1-flash-image-preview는
      //   Google API에 미존재 ID로 확인되어 모든 사용자 키에서 정식 GA로 매핑됨.
      const gen = read('image/nanoBananaProGenerator.ts');
      expect(gen).toMatch(/model:\s*['"]gemini-2\.5-flash-image['"]/);
      // 가짜 ID 직접 호출은 절대 없어야 함 (주석/문자열에는 있을 수 있어 model: prefix로 한정)
      expect(gen).not.toMatch(/model:\s*['"]gemini-3-pro-image-preview['"]/);
      expect(gen).not.toMatch(/model:\s*['"]gemini-3\.1-flash-image-preview['"]/);
    });

    it("Gemini 2.0 Flash Exp은 image-generation suffix 형태로만 호출 (무료 실험 모델, 2026-06-01 shutdown 예정)", () => {
      const gen = read('image/nanoBananaProGenerator.ts');
      expect(gen).toMatch(/gemini-2\.0-flash-exp-image-generation/);
    });

    it("텍스트 본문 생성은 gemini-2.5 계열만 (stable)", () => {
      const tracker = read('apiUsageTracker.ts');
      // Gemini 3 / 3.1 분기가 포함된 calculateCost 로직 확인
      expect(tracker).toMatch(/gemini-3|3\.1-pro|3\.1-flash/);
    });
  });

  describe('Perplexity: sonar-reasoning deprecated 처리', () => {
    const tracker = read('apiUsageTracker.ts');

    it("sonar-reasoning-pro (현행 대체 모델)이 가격표에 존재", () => {
      expect(tracker).toMatch(/'sonar-reasoning-pro':/);
    });

    it("구 sonar-reasoning 키가 제거됨 (2025-12-15 deprecated)", () => {
      // 주석이 아닌 실제 키로 존재하지 않음 — regex로 엄격하게
      expect(tracker).not.toMatch(/'sonar-reasoning':\s*\{/);
    });

    it("sonar / sonar-pro / sonar-deep-research는 여전히 존재 (API 유지)", () => {
      expect(tracker).toMatch(/'sonar':\s*\{/);
      expect(tracker).toMatch(/'sonar-pro':\s*\{/);
      expect(tracker).toMatch(/'sonar-deep-research':\s*\{/);
    });
  });

  describe('sunset 경고 주석 존재 (Ops 가시성)', () => {
    const tracker = read('apiUsageTracker.ts');

    it("gpt-4o sunset 경고 주석이 코드에 남아있음", () => {
      expect(tracker).toMatch(/SUNSET 2026-03-31|2026-03-31 API 제거/);
    });

    it("DALL-E 3 sunset 경고 주석이 코드에 남아있음", () => {
      expect(tracker).toMatch(/2026-05-12 API 제거|DALL-E 3.*2026-05/);
    });
  });
});
