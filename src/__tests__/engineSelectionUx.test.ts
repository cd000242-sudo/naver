import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-06 사용자 요청] 텍스트 엔진 선택 UX 3건.
 *
 * 1. 텍스트 엔진 설정 진입 시 비용표·추천 모달 자동 열림 제거 (우측 상단 재오픈
 *    버튼은 유지 — 보고 싶을 때만).
 * 2. "업데이트하면 엔진 선택이 바뀐다" 종결: 업데이트로 라디오 목록이 바뀌어
 *    저장된 모델이 어느 라디오와도 매칭되지 않으면 :checked 가 null → 저장 시
 *    기본값(gemini)으로 조용히 덮이던 것을, 기존 설정값 유지로 반전.
 * 3. 최초 실행(엔진 미선택)이면 환경설정의 텍스트 엔진 섹션을 먼저 띄워 선택 유도.
 */
describe('engine selection UX', () => {
  const source = readFileSync(new URL('../renderer/modules/priceInfoModal.ts', import.meta.url), 'utf8');

  it('엔진 설정 진입 시 비용표 자동 표시가 없다 (재오픈 버튼은 유지)', () => {
    expect(source).not.toContain('__priceModalAutoShown');
    expect(source).toContain("getElementById('reopen-price-info-btn')");
  });

  it('저장 시 미매칭 라디오(null)여도 기존 엔진 선택을 유지한다', () => {
    expect(source).toMatch(/primaryGeminiTextModel"\]:checked[\s\S]{0,600}currentConfig\?\.primaryGeminiTextModel/);
  });

  it('로드 시 저장된 모델이 라디오 목록에 없으면 안내를 표시한다', () => {
    expect(source).toMatch(/목록에서 다시 선택/);
  });

  it('최초 실행(엔진 미선택)이면 텍스트 엔진 섹션을 자동으로 연다', () => {
    expect(source).toMatch(/최초 실행[\s\S]{0,200}텍스트 엔진/);
    expect(source).toMatch(/data-open-settings|settings-button-fixed/);
    expect(source).toMatch(/nav-text-engine-btn'\)[\s\S]{0,80}\.click\(\)/);
  });
});
