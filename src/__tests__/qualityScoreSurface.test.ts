import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-06] 모드별 품질 점수 가시화 — 사용자 요청 "점수를 보고 이 글이 좋은지
 * 확인할 수 있게". 점수 데이터는 contentGenerator 가 quality.qualityGate 로 동봉하고
 * (v2.11.171 이전부터 "UI 가시화는 다음 릴리즈" 예고), renderer 의 품질 점수 카드가
 * 종합/모드/안전/사람다움 + 90점 목표 상태를 표시한다. 점수는 표시 전용 —
 * 게이트 판정(경고-only)은 바꾸지 않는다.
 */
describe('quality score surface wiring', () => {
  const renderer = readFileSync(new URL('../renderer/renderer.ts', import.meta.url), 'utf8');
  const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');

  it('contentGenerator 가 qualityGate 에 4축 점수와 90 목표 상태를 동봉한다', () => {
    expect(generator).toMatch(/qualityGate = \{[\s\S]{0,400}finalScore/);
    expect(generator).toMatch(/modeScore: _gateResult\.modeScore\.score/);
    expect(generator).toMatch(/safetyScore: _gateResult\.safetyScore\.score/);
    expect(generator).toMatch(/humanlikeScore: _gateResult\.humanlikeScore\.score/);
    expect(generator).toMatch(/quality90TargetReached/);
  });

  it('renderer 품질 점수 카드가 모드 이름과 세부 4축을 표시한다', () => {
    expect(renderer).toContain('updateQualityBreakdownLine');
    expect(renderer).toMatch(/homefeed: '홈판'/);
    expect(renderer).toMatch(/안전 \$\{_gate\.safetyScore\}/);
    expect(renderer).toMatch(/사람다움 \$\{_gate\.humanlikeScore\}/);
    expect(renderer).toMatch(/90 달성|90 근접|90 미달/);
  });

  it('점수 없는 글(옛 글 불러오기)에서는 세부 줄을 지운다', () => {
    expect(renderer).toMatch(/updateQualityBreakdownLine\(riskSeoValue, ''\)/);
  });
});
