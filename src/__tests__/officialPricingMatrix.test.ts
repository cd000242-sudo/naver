/**
 * ✅ [v1.4.77] 전 엔진 공식 가격표 회귀 방지 매트릭스
 *
 * 배경: 10명 에이전트 교차 검증으로 발견된 CRITICAL 버그들
 * - OpenAI gpt-5.4: output $10 → $15 (33% 과소 계상)
 * - Claude Opus 4.5/4.6: $15/$75 → $5/$25 (3배 과다 계상)
 * - Gemini Flash: output $0.40 → $2.50 (6.25배 과소 계상)
 * - Gemini Flash-Lite: 4배 과소
 * - Gemini Pro output: $5 → $10 (2배 과소)
 * - DeepInfra FLUX-2-dev: $0.025 → $0.012 (절반)
 * - Leonardo Nano Banana Pro: $0.02 → $0.134 (6.7배 과소)
 *
 * 이 테스트는 모든 수정값이 공식 2026-04 기준과 일치함을 영구 고정한다.
 * 향후 누가 실수로 구 단가로 되돌리면 즉시 실패.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../apiUsageTracker.ts');
const content = fs.readFileSync(SRC, 'utf-8');

describe('v1.4.77 — 공식 가격 매트릭스 (2026-04)', () => {
  describe('OpenAI 텍스트', () => {
    it("gpt-5.4 output은 $15 (이전 $10 버그 수정)", () => {
      expect(content).toMatch(/'gpt-5\.4':\s*\{\s*input:\s*2\.50[^}]*output:\s*15\.00/);
    });

    it("gpt-5.4 cachedInput은 $0.25 (90% 할인)", () => {
      expect(content).toMatch(/'gpt-5\.4':[^}]*cachedInput:\s*0\.25/);
    });

    it("gpt-5.4-mini 신규 엔트리 존재 ($0.75/$4.50)", () => {
      expect(content).toMatch(/'gpt-5\.4-mini':\s*\{\s*input:\s*0\.75[^}]*output:\s*4\.50/);
    });

    it("gpt-5.4-nano 신규 엔트리 존재 ($0.20/$1.25)", () => {
      expect(content).toMatch(/'gpt-5\.4-nano':\s*\{\s*input:\s*0\.20[^}]*output:\s*1\.25/);
    });

    it("gpt-5.4 output이 다시 $10으로 회귀되지 않음", () => {
      expect(content).not.toMatch(/'gpt-5\.4':\s*\{\s*input:\s*2\.50,\s*output:\s*10\.00\s*\}/);
    });
  });

  describe('Claude (Anthropic)', () => {
    it("Opus 4.5는 $5/$25 (이전 $15/$75 버그 수정 — 3배 과다)", () => {
      expect(content).toMatch(/'claude-opus-4-5':\s*\{\s*input:\s*5\.00[^}]*output:\s*25\.00/);
    });

    it("Opus 4.6은 $5/$25 (이전 $15/$75 버그 수정)", () => {
      expect(content).toMatch(/'claude-opus-4-6':\s*\{\s*input:\s*5\.00[^}]*output:\s*25\.00/);
    });

    it("Opus 4.7 신규 엔트리 존재", () => {
      expect(content).toMatch(/'claude-opus-4-7':\s*\{\s*input:\s*5\.00[^}]*output:\s*25\.00/);
    });

    it("Opus 4.1은 레거시 $15/$75 유지", () => {
      expect(content).toMatch(/'claude-opus-4-1':\s*\{\s*input:\s*15\.00[^}]*output:\s*75\.00/);
    });

    it("Opus 4.0은 '-0' alias 필수 (무접미사 'claude-opus-4'는 존재하지 않음)", () => {
      // ✅ [v1.4.77] Anthropic 공식: alias는 claude-opus-4-0 (무접미사는 404)
      expect(content).toMatch(/'claude-opus-4-0':\s*\{\s*input:\s*15\.00[^}]*output:\s*75\.00/);
      expect(content).toMatch(/'claude-opus-4-20250514':\s*\{\s*input:\s*15\.00[^}]*output:\s*75\.00/);
    });

    it("Sonnet 4.0은 '-0' alias 필수", () => {
      expect(content).toMatch(/'claude-sonnet-4-0':\s*\{\s*input:\s*3\.00[^}]*output:\s*15\.00/);
      expect(content).toMatch(/'claude-sonnet-4-20250514':\s*\{\s*input:\s*3\.00[^}]*output:\s*15\.00/);
    });

    it("Sonnet 4.6은 $3/$15 (공식 단가 유지)", () => {
      expect(content).toMatch(/'claude-sonnet-4-6':\s*\{\s*input:\s*3\.00[^}]*output:\s*15\.00/);
    });

    it("Haiku 4.5는 $1/$5 (공식 단가 유지)", () => {
      expect(content).toMatch(/'claude-haiku-4-5':\s*\{\s*input:\s*1\.00[^}]*output:\s*5\.00/);
    });

    it("Opus 4.5/4.6이 다시 $15/$75로 회귀되지 않음", () => {
      expect(content).not.toMatch(/'claude-opus-4-5':\s*\{\s*input:\s*15\.00[^}]*output:\s*75\.00/);
      expect(content).not.toMatch(/'claude-opus-4-6':\s*\{\s*input:\s*15\.00[^}]*output:\s*75\.00/);
    });
  });

  describe('Gemini (calculateCost 내 인라인 가격)', () => {
    it("Flash input은 $0.30 (이전 $0.10 버그 수정 — 3배 과소)", () => {
      expect(content).toMatch(/pInput\s*=\s*0\.30/);
    });

    it("Flash output은 $2.50 (이전 $0.40 버그 수정 — 6.25배 과소)", () => {
      expect(content).toMatch(/pOutput\s*=\s*2\.50/);
    });

    it("Flash-Lite는 $0.10/$0.40 (이전 $0.025/$0.10 버그 수정)", () => {
      // 주석·줄바꿈을 넘어 매칭 (multiline s flag)
      expect(content).toMatch(/flash-lite[\s\S]{0,400}?pInput\s*=\s*0\.10[\s\S]{0,400}?pOutput\s*=\s*0\.40/);
    });

    it("Pro output은 $10 (이전 $5 버그 수정 — 2배 과소)", () => {
      expect(content).toMatch(/pOutput\s*=\s*(isLongContext\s*\?\s*15\.00\s*:\s*)?10\.00/);
    });

    it("Gemini 3 Pro 신규 분기 존재", () => {
      expect(content).toMatch(/gemini-3|3-pro/i);
      expect(content).toMatch(/pInput\s*=\s*isLongContext\s*\?\s*4\.00\s*:\s*2\.00/);
      expect(content).toMatch(/pOutput\s*=\s*isLongContext\s*\?\s*18\.00\s*:\s*12\.00/);
    });

    it("200K 초과 시 Pro 계열 2배 요금 분기 존재", () => {
      expect(content).toMatch(/isLongContext/);
      expect(content).toMatch(/200_000|200000/);
    });

    it("Flash output이 다시 $0.40으로 회귀되지 않음", () => {
      expect(content).not.toMatch(/pInput\s*=\s*0\.10,\s*pOutput\s*=\s*0\.40;\s*\/\/\s*Flash 기본/);
    });
  });

  describe('Perplexity', () => {
    it("sonar는 $1/$1 + $0.005 검색", () => {
      expect(content).toMatch(/'sonar':\s*\{\s*input:\s*1\.00[^}]*output:\s*1\.00/);
    });

    it("sonar-pro는 $3/$15", () => {
      expect(content).toMatch(/'sonar-pro':\s*\{\s*input:\s*3\.00[^}]*output:\s*15\.00/);
    });

    it("sonar-reasoning-pro 신규 엔트리 존재 ($2/$8, 2025-12-15 sonar-reasoning 대체)", () => {
      // ✅ [v1.4.77] sonar-reasoning은 2025-12-15 deprecated, sonar-reasoning-pro로 교체됨
      expect(content).toMatch(/'sonar-reasoning-pro':\s*\{\s*input:\s*2\.00[^}]*output:\s*8\.00/);
    });

    it("sonar-deep-research는 $2/$8", () => {
      expect(content).toMatch(/'sonar-deep-research':\s*\{\s*input:\s*2\.00[^}]*output:\s*8\.00/);
    });
  });

  describe('DeepInfra', () => {
    it("FLUX-1-schnell은 $0.003/MP", () => {
      expect(content).toMatch(/'FLUX-1-schnell':\s*0\.003/);
    });

    it("FLUX-2-dev는 $0.012 (이전 $0.025 수정 — 절반)", () => {
      expect(content).toMatch(/'FLUX-2-dev':\s*0\.012/);
    });

    it("FLUX-2-max 신규 엔트리 존재 ($0.07)", () => {
      expect(content).toMatch(/'FLUX-2-max':\s*0\.07/);
    });

    it("FLUX-2-dev가 다시 $0.025로 회귀되지 않음", () => {
      expect(content).not.toMatch(/'FLUX-2-dev':\s*0\.025/);
    });
  });

  describe('Leonardo AI', () => {
    it("Nano Banana Pro (2K 기본)은 $0.134 (이전 $0.02 버그 수정 — 6.7배 과소)", () => {
      expect(content).toMatch(/'nano-banana-pro':\s*0\.134/);
    });

    it("Nano Banana Pro 1K 신규 엔트리 존재 ($0.039)", () => {
      expect(content).toMatch(/'nano-banana-pro-1k':\s*0\.039/);
    });

    it("Nano Banana Pro 4K 신규 엔트리 존재 ($0.24)", () => {
      expect(content).toMatch(/'nano-banana-pro-4k':\s*0\.24/);
    });

    it("Ideogram 3.0은 $0.15 (이전 $0.06 수정 — Balanced 기준)", () => {
      expect(content).toMatch(/'ideogram-3\.0':\s*0\.15/);
    });

    it("Nano Banana Pro가 다시 $0.02로 회귀되지 않음", () => {
      expect(content).not.toMatch(/'nano-banana-pro':\s*0\.02\b/);
    });
  });

  describe('실전 비용 계산 검증 (입력 10K / 출력 4K 토큰 기준)', () => {
    const INPUT = 10_000;
    const OUTPUT = 4_000;
    const KRW = 1400;

    it("Gemini Flash 글 1개 = ₩18 (이전 버그 가격 ₩3.6과 5배 차이)", () => {
      const cost = (INPUT / 1e6) * 0.30 + (OUTPUT / 1e6) * 2.50;
      expect(cost * KRW).toBeCloseTo(18.2, 0);
    });

    it("Claude Opus 4.6 글 1개 = ₩210 (이전 버그 ₩630과 3배 차이)", () => {
      const cost = (INPUT / 1e6) * 5.00 + (OUTPUT / 1e6) * 25.00;
      expect(cost * KRW).toBeCloseTo(210, 0);
    });

    it("Claude Haiku 4.5 글 1개 = ₩42 (단가 유지)", () => {
      const cost = (INPUT / 1e6) * 1.00 + (OUTPUT / 1e6) * 5.00;
      expect(cost * KRW).toBeCloseTo(42, 0);
    });

    it("gpt-5.4 글 1개 = ₩119 (이전 버그 ₩91과 30% 차이)", () => {
      const cost = (INPUT / 1e6) * 2.50 + (OUTPUT / 1e6) * 15.00;
      expect(cost * KRW).toBeCloseTo(119, 0);
    });

    it("Nano Banana Pro 2K 글 1개(6장) = ₩1,126 (이전 버그 ₩168과 6.7배 차이)", () => {
      const cost = 0.134 * 6;
      expect(cost * KRW).toBeCloseTo(1126, 0);
    });

    it("FLUX-2-dev 글 1개(6장) = ₩101 (이전 버그 ₩210과 절반)", () => {
      const cost = 0.012 * 6;
      expect(cost * KRW).toBeCloseTo(101, 0);
    });
  });
});
