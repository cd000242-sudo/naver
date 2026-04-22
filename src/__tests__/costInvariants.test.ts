/**
 * ✅ [v1.4.77] 소스 코드 불변식 검증 — 이번 수정사항이 회귀되지 않도록 고정
 *
 * 검증 목표:
 * - contentGenerator.ts의 출력 토큰 상한 축소 유지
 * - OpenAI 모델 매핑이 UI 라벨과 1:1 일치
 * - 이미지 기본 엔진이 schnell(저가)로 유지
 * - Gemini 캐싱 조건이 "무료/유료 구분 없음"으로 유지
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

describe('v1.4.77 — 비용 최적화 소스 불변식', () => {
  describe('출력 토큰 상한 축소 유지', () => {
    const content = read('contentGenerator.ts');

    it('Gemini maxOutputTokens는 8192 이하', () => {
      const match = content.match(/maxOutputTokens:\s*(\d+),?\s*\n\s*\.\.\.\(modelName\.includes\('2\.5'\)/);
      expect(match).toBeTruthy();
      const value = parseInt(match![1], 10);
      expect(value).toBeLessThanOrEqual(8192);
    });

    it('OpenAI max_completion_tokens는 8192 이하', () => {
      const match = content.match(/max_completion_tokens:\s*(\d+),/);
      expect(match).toBeTruthy();
      expect(parseInt(match![1], 10)).toBeLessThanOrEqual(8192);
    });

    it('Claude max_tokens는 8192 이하', () => {
      // buildRequest 블록의 max_tokens 추출
      const match = content.match(/buildRequest\s*=\s*\(withCache:[\s\S]{0,200}?max_tokens:\s*(\d+)/);
      expect(match).toBeTruthy();
      expect(parseInt(match![1], 10)).toBeLessThanOrEqual(8192);
    });

    it('60000 같은 과대 상한이 본문 생성 경로에 남아있지 않음', () => {
      // 주석 외부에서 maxOutputTokens: 60000이 있는지 검사
      const lines = content.split('\n');
      const violations = lines.filter((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) return false;
        if (trimmed.startsWith('*')) return false;
        return /maxOutputTokens:\s*60000/.test(line);
      });
      expect(violations).toHaveLength(0);
    });
  });

  describe('OpenAI 모델 매핑 — UI 라벨 = 실제 호출 1:1', () => {
    const content = read('contentGenerator.ts');

    it("'openai-gpt41' 분기는 gpt-4.1 호출", () => {
      expect(content).toMatch(/openai-gpt41[\s\S]{0,300}openAIModels\s*=\s*\[\s*['"]gpt-4\.1['"]\s*\]/);
    });

    it("'openai-gpt4o-mini' 분기는 gpt-4.1-mini 호출", () => {
      expect(content).toMatch(/openai-gpt4o-mini[\s\S]{0,300}openAIModels\s*=\s*\[\s*['"]gpt-4\.1-mini['"]\s*\]/);
    });

    it("'openai-gpt4o' 분기는 gpt-4o 호출", () => {
      expect(content).toMatch(/openai-gpt4o'[\s\S]{0,300}openAIModels\s*=\s*\[\s*['"]gpt-4o['"]\s*\]/);
    });

    it('OpenAI 폴백 배열은 단일 모델만 허용 (크로스 모델 폴백 금지)', () => {
      // 각 분기의 openAIModels 배열 원소가 1개여야 함
      const matches = content.match(/openAIModels\s*=\s*\[([^\]]+)\]/g) || [];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        const inner = m.match(/\[([^\]]+)\]/)![1];
        const elements = inner.split(',').filter((s) => s.trim().length > 0);
        expect(elements.length).toBe(1);
      }
    });
  });

  describe('이미지 기본 엔진 — schnell(저가) 고정', () => {
    const content = read('image/deepinfraGenerator.ts');

    it('DEFAULT_DEEPINFRA_MODEL은 FLUX-1-schnell', () => {
      expect(content).toMatch(/DEFAULT_DEEPINFRA_MODEL\s*=\s*['"]black-forest-labs\/FLUX-1-schnell['"]/);
    });

    it('DEFAULT_DEEPINFRA_MODEL은 FLUX-2-dev가 아님 (회귀 방지)', () => {
      expect(content).not.toMatch(/DEFAULT_DEEPINFRA_MODEL\s*=\s*['"]black-forest-labs\/FLUX-2-dev['"]/);
    });
  });

  describe('Gemini 캐싱 — 무료/유료 구분 없음 + 자동 학습', () => {
    const content = read('contentGenerator.ts');

    it('cacheEnabled 조건이 "paid 플랜 한정"으로 하드코딩되지 않음', () => {
      // 4/18 장애 원인이었던 false && 패턴이 남아있지 않음
      expect(content).not.toMatch(/const\s+cacheEnabled\s*=\s*false\s*&&/);
      // 이전 버전: geminiPlanType === 'paid' 단독 조건이 아님
      expect(content).not.toMatch(/cacheEnabled\s*=\s*!cacheDisabledEnv\s*\n?\s*&&\s*\(config as any\)\?\.geminiPlanType === 'paid'\s*\n?\s*&&/);
    });

    it('isCacheSupportedForKey 기반 세션 학습 구조 사용', () => {
      expect(content).toMatch(/isCacheSupportedForKey\s*\(\s*trimmedKey\s*\)/);
    });

    it('markCacheUnsupported 실패 기록 로직 존재', () => {
      expect(content).toMatch(/function\s+markCacheUnsupported/);
    });

    it('캐시 호출 실패 시 일반 모델 재시도 보호막 존재', () => {
      expect(content).toMatch(/invokeStream[\s\S]{0,800}generateContentStream[\s\S]{0,400}markCacheUnsupported/);
    });

    it('GEMINI_CACHE_DISABLED ENV 비상 탈출구 유지', () => {
      expect(content).toMatch(/GEMINI_CACHE_DISABLED/);
    });
  });

  describe('OpenAI 재시도 — 단일 모델이므로 2회로 충분', () => {
    const content = read('contentGenerator.ts');

    it('maxRetriesPerModel은 2 (이전 3에서 축소)', () => {
      const match = content.match(/const\s+maxRetriesPerModel\s*=\s*(\d+);/);
      expect(match).toBeTruthy();
      expect(parseInt(match![1], 10)).toBeLessThanOrEqual(2);
    });
  });

  describe('UI 기본값 — Claude Haiku가 디폴트 선택', () => {
    const html = fs.readFileSync(path.resolve(ROOT, '../public/index.html'), 'utf-8');

    it('claude-haiku 라디오 버튼에 checked 속성', () => {
      expect(html).toMatch(/value="claude-haiku"\s*\n\s*checked/);
    });

    it('gemini-2.5-flash 라디오 버튼은 더 이상 checked 아님', () => {
      // 회귀 방지: 이전 디폴트가 다시 붙지 않도록
      expect(html).not.toMatch(/value="gemini-2\.5-flash"\s*\n\s*checked/);
    });
  });
});
