import { describe, expect, it } from 'vitest';

import { evaluateTitleQuality } from '../contentTitleEvaluator';

/**
 * [2026-08-05] 제목 채점기가 이슈픽 승자 공식을 죽이던 문제.
 *
 * 사용자 관찰: "홈판 제목이 클릭률이 엄청날 것 같지 않은데."
 * 구조 확정: issue-story 골격(실측 승자, 60021a64)의 제목 3공식 중
 *   1공식 인용 훅형 — 따옴표 필수 → 채점기 :139 "따옴표 포함 -20점"에 자동 탈락
 *   2·3공식 어휘("진짜 이유·알고보니·반전") → :108 자극어 감점
 * 그리고 contentGenerator :891 이 후보 3개 중 채점 최고점으로 교체하므로,
 * 프롬프트가 훅 후보를 만들어도 항상 밋밋한 정보형이 이겼다.
 * 프롬프트가 만든 것을 코드가 되돌리는 R1~R5 와 동일 패턴.
 *
 * 수정: 이슈픽 조합(homefeed + 연예/시사 계열 힌트)에서만
 *   - 따옴표 감점 해제 (인용 실재 여부는 H7·골격 :21·evidence 층이 담당)
 *   - 정체 숨김·추측형 핵심 어휘 3종(진짜 이유·알고보니·반전) 감점 해제
 * 클릭베이트(충격·소름·난리·대박·폭로 등)는 이슈픽에서도 감점 유지 —
 * 홈판 제목 조건 3이 명시 금지하는 어휘다.
 */

const issueArgs = ['homefeed', '연예'] as const;
const plainHomefeed = ['homefeed', '반려동물'] as const;
const seoArgs = ['seo', '연예'] as const;

function score(title: string, [mode, hint]: readonly [string, string]): number {
  return evaluateTitleQuality(title, '재벌X형사2 박지현 하차', mode as never, hint).score;
}

describe('이슈픽 — 승자 공식이 감점되지 않는다', () => {
  it('인용 훅형이 따옴표로 감점되지 않는다', () => {
    const hook = '"우리 팀을 떠나주세요" 팬들이 감독 경질을 원하는 이유';
    const flat = '감독 경질 요구 상황과 팬 반응 정리';
    expect(score(hook, issueArgs), '인용 훅형은 이슈픽 1공식이다')
      .toBeGreaterThanOrEqual(score(flat, issueArgs));
  });

  it('"진짜 이유·알고보니·반전"이 이슈픽에서 감점되지 않는다', () => {
    const base = score('시즌2에서 팀장이 교체된 배경과 새 인물', issueArgs);
    expect(score('시즌2에서 팀장이 사라진 진짜 이유', issueArgs)).toBeGreaterThanOrEqual(base - 5);
  });

  it('클릭베이트는 이슈픽에서도 계속 감점된다', () => {
    const clean = score('시즌2 팀장 교체 배경 정리', issueArgs);
    expect(score('충격 소름 시즌2 팀장 교체 난리', issueArgs)).toBeLessThan(clean);
  });
});

describe('비이슈 — 기존 채점 유지 (회귀)', () => {
  it('일반 홈판에서 따옴표는 여전히 감점된다', () => {
    const withQuote = score('"정말 좋았어요" 후기가 반복된 사료의 조건', plainHomefeed);
    const without = score('후기가 반복된 사료의 조건과 확인 지점', plainHomefeed);
    expect(withQuote).toBeLessThan(without);
  });

  it('SEO 에서 "진짜 이유"는 여전히 자극어가 아니다? — SEO 목록은 홈판 전용이므로 무감점 유지 확인', () => {
    // :108 조건이 mode === 'homefeed' 한정임을 회귀로 잠근다.
    const a = score('박지현 하차 배경과 시즌2 변화', seoArgs);
    const b = score('박지현 하차 진짜 이유와 시즌2 변화', seoArgs);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(5);
  });
});
