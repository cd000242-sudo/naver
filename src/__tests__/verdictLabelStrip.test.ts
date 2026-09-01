import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml } from '../automation/richTextPaste';

/**
 * [2026-09-01] 제거기가 하필 우리가 지시한 형태만 정확히 못 잡았다.
 *
 * normalizeKoreanVerdictLabels 의 여는 대괄호 앵커가 `^\s*\[\s*` 라
 * 대괄호 직후 공백만 허용하는데, 프롬프트는 "[▶ 한 줄 판정: …]" 처럼
 * 선행 기호를 붙이라고 못박고 있었다(promptLoader:647).
 *
 * 실측:
 *   "[ 한 줄 판정: … ]"   단독 줄  -> 제거됨
 *   "[▶ 한 줄 판정: "…"]"  <- 우리가 시킨 그 형태  -> 그대로 남음
 *
 * 프롬프트에서 지시를 걷어냈지만 모델이 학습된 관성으로 쓸 수 있으므로
 * 제거기도 함께 넓힌다. 다만 라벨 키워드 매칭은 반드시 유지한다 —
 * 무차별로 대괄호를 먹으면 자료 라벨과 표 기호까지 지운다.
 */
/*
 * 실제 발행이 타는 경로로 검사한다.
 * [2026-09-01] buildPastePreviewText(미리보기)는 normalizeMateReadableText 를 타지 않아
 * 라벨이 그대로 남는다 — 미리보기와 발행 결과가 갈리는 지점이라 따로 기록해 둔다.
 */
const strip = (text: string) => buildMobileRichHtml(text).html.replace(/<[^>]+>/gu, '');

describe('판정 라벨을 벗긴다', () => {
  it('선행 기호가 붙은 형태도 벗긴다 — 우리가 지시했던 그 형태', () => {
    const out = strip('[▶ 한 줄 판정: "습도는 45~60% 사이에 두면 됩니다."]');
    expect(out).not.toContain('[▶');
    expect(out).toContain('습도는 45~60%');
  });

  it('기존 형태도 계속 벗긴다 — 회귀 방지', () => {
    const out = strip('[ 한 줄 판정: 전원을 끄고 천천히 녹이는 편이 안전합니다. ]');
    expect(out).not.toContain('[');
    expect(out).toContain('전원을 끄고');
  });

  it('다른 라벨 낱말도 함께 본다', () => {
    for (const label of ['한 줄 결론', '한줄 정리']) {
      const out = strip(`[■ ${label}: 이 조건부터 확인하세요.]`);
      expect(out).not.toContain('[■');
      expect(out).toContain('이 조건부터');
    }
  });
});

describe('라벨이 아닌 대괄호는 건드리지 않는다', () => {
  it('라벨이 아닌 대괄호는 내용을 잃지 않는다', () => {
    // 표는 HTML 로 렌더되므로 원문 그대로가 아니라 내용이 남는지를 본다.
    expect(strip('| 구분 | 내용 |')).toContain('구분');
    expect(strip('[자료 1 — 삼성 안내]')).toContain('삼성 안내');
    expect(strip('[참고] 이 값은 모델마다 다릅니다.')).toContain('모델마다 다릅니다');
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(() => strip('')).not.toThrow();
  });
});
