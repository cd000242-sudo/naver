import { describe, it, expect } from 'vitest';
import { resolveHomefeedIssueHint } from '../content/homefeedIssueHint';
import { resolveCategory, HOMEFEED_ISSUE_STORY_CATEGORIES } from '../promptLoader';

/**
 * [2026-09-17] 홈판 이슈 글에서 issue-story 골격이 조용히 빠지던 사고의 회귀 테스트.
 * 연예 이슈 자료인데 글 유형 미선택 → 'general' → 골격 미적용 → 설명형 제목·소제목 5개.
 */
const 연예이슈자료 = `
〈전현무계획4〉 촬영팀이 식당 오픈 전부터 대기했다는 목격담이 퍼졌다.
제작진은 사전 섭외나 상황 연출은 사실과 다르다고 밝혔다.
이 예능은 2024년 2월 첫 방송 이후 즉흥 탐방을 원칙으로 내세워 왔다.
시청률과 회차 구성에 대한 시청자 반응도 갈렸다.
`;

const 실용자료 = `
전기밥솥 내솥 코팅이 벗겨졌을 때 교체 비용과 자가 교체 방법을 정리했다.
내솥 규격은 모델명으로 확인해야 하고, 용량별로 가격이 다르다.
세척 시 금속 수세미를 쓰면 코팅이 빨리 상한다.
`;

describe('홈판 이슈 카테고리 보정', () => {
  it('글 유형 미선택 + 연예 이슈 자료면 연예로 보정한다', () => {
    const r = resolveHomefeedIssueHint('homefeed', undefined, true, 연예이슈자료);
    expect(r.upgraded).toBe(true);
    expect(r.hint).toBe('연예');
  });

  it('보정된 힌트는 실제로 issue-story 골격 게이트를 통과한다', () => {
    const r = resolveHomefeedIssueHint('homefeed', undefined, true, 연예이슈자료);
    expect(HOMEFEED_ISSUE_STORY_CATEGORIES.has(resolveCategory(r.hint))).toBe(true);
  });

  it('보정 전 상태는 골격 게이트를 통과하지 못한다 (사고 재현)', () => {
    expect(HOMEFEED_ISSUE_STORY_CATEGORIES.has(resolveCategory(undefined))).toBe(false);
  });

  it('정책·수사 자료면 사회로 보정한다', () => {
    const 사회자료 = `
      정부가 발표한 지원금 정책의 소득 기준을 두고 국회에서 법안 논의가 이어졌다.
      경찰은 관련 고발 건에 대해 수사에 착수했다고 밝혔다.
      금리와 세금 부담을 함께 봐야 한다는 지적도 나왔다.
    `;
    const r = resolveHomefeedIssueHint('homefeed', undefined, true, 사회자료);
    expect(r.upgraded).toBe(true);
    expect(r.hint).toBe('사회');
  });

  it('이미 고른 카테고리는 건드리지 않는다', () => {
    const r = resolveHomefeedIssueHint('homefeed', '맛집', false, 연예이슈자료);
    expect(r.upgraded).toBe(false);
    expect(r.hint).toBe('맛집');
  });

  it('실용 정보 자료는 보정하지 않는다', () => {
    const r = resolveHomefeedIssueHint('homefeed', undefined, true, 실용자료);
    expect(r.upgraded).toBe(false);
    expect(r.hint).toBeUndefined();
  });

  it('홈판이 아닌 모드는 보정하지 않는다', () => {
    const r = resolveHomefeedIssueHint('seo', undefined, true, 연예이슈자료);
    expect(r.upgraded).toBe(false);
  });

  it('자료가 너무 짧으면 판정을 보류한다', () => {
    const r = resolveHomefeedIssueHint('homefeed', undefined, true, '예능 논란');
    expect(r.upgraded).toBe(false);
  });
});
