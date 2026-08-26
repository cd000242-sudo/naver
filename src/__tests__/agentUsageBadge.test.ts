import { describe, it, expect } from 'vitest';
import { buildAgentUsageBadge, formatRemainingTime, agentProviderLabel } from '../agentCli/usageBadge';

const NOW = 1_800_000_000_000;

describe('에이전트 사용량 배찌 (2026-08-26 사장님 요청)', () => {
  it('한 번도 안 막혀 봤으면 남은 편수를 추정하지 않는다', () => {
    const b = buildAgentUsageBadge({ provider: 'claude', callsInWindow: 4 }, NOW);
    expect(b.headline).toBe('클로드코드 4편 사용');
    expect(b.detail).toMatch(/추정하지 않습니다/);
    expect(b.headline).not.toMatch(/약 \d+편/);
  });

  it('막혀 본 적이 있으면 그 실측을 근거로 남은 편수를 말한다', () => {
    const b = buildAgentUsageBadge(
      { provider: 'codex', callsInWindow: 7, observedLimit: 12, estimatedRemaining: 5 },
      NOW,
    );
    expect(b.headline).toBe('코덱스 약 5편');
    expect(b.detail).toMatch(/실측 한도 12편 기준 추정/);
    expect(b.tone).toBe('ok');
  });

  it('두 편 이하로 남으면 경고 톤으로 바뀐다', () => {
    expect(
      buildAgentUsageBadge({ provider: 'gemini', callsInWindow: 10, observedLimit: 12, estimatedRemaining: 2 }, NOW).tone,
    ).toBe('warn');
  });

  it('지금 막혀 있으면 추정 대신 풀리는 시각을 말한다', () => {
    const b = buildAgentUsageBadge(
      { provider: 'claude', callsInWindow: 12, observedLimit: 12, rateLimitResetAt: NOW + 80 * 60 * 1000 },
      NOW,
    );
    expect(b.tone).toBe('blocked');
    expect(b.headline).toMatch(/한도 도달/);
    expect(b.detail).toMatch(/1시간 20분 뒤/);
    expect(b.detail).not.toMatch(/추정/);
  });

  it('아직 안 썼으면 왜 모르는지 설명한다', () => {
    const b = buildAgentUsageBadge({ provider: 'claude', callsInWindow: 0 }, NOW);
    expect(b.tone).toBe('idle');
    expect(b.detail).toMatch(/남은 양을 알려주지 않습니다/);
  });

  it('남은 시간 표기', () => {
    expect(formatRemainingTime(NOW + 30_000, NOW)).toBe('곧');
    expect(formatRemainingTime(NOW + 45 * 60_000, NOW)).toBe('45분');
    expect(formatRemainingTime(NOW + 120 * 60_000, NOW)).toBe('2시간');
    expect(formatRemainingTime(NOW + 145 * 60_000, NOW)).toBe('2시간 25분');
  });

  it('세 공급자 이름을 한국어로 보여준다', () => {
    expect(agentProviderLabel('claude')).toBe('클로드코드');
    expect(agentProviderLabel('codex')).toBe('코덱스');
    expect(agentProviderLabel('gemini')).toBe('안티그래비티');
  });
});
