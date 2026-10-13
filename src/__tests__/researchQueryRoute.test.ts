// [2026-10-13 심층 리서치 A3] 질문 분해 호출 — 선택 엔진 그대로, 구독 CLI 는 생략, 실패는 "추가 라운드 없음".
import { describe, expect, it, vi } from 'vitest';
import { resolveResearchQueries } from '../content/researchQueryRoute';

function deps(generator: string | undefined, route: any, replyOrError: string | Error = '{"queries":["가입 조건","정부기여금 금액","중도해지 불이익","신청 기간","은행별 금리 비교"]}') {
  const logs: string[] = [];
  const callModel = vi.fn(async () => { if (replyOrError instanceof Error) throw replyOrError; return replyOrError; });
  return {
    logs,
    callModel,
    deps: {
      loadConfig: async () => (generator === undefined ? null : { defaultAiProvider: generator }),
      resolveRoute: vi.fn(() => (route === null ? null : { engine: 'gpt-4.1-mini', ...route, callModel })),
      log: (m: string) => { logs.push(m); },
      timeoutMs: 5_000,
    },
  };
}

describe('resolveResearchQueries', () => {
  it('선택 엔진의 저비용 경로로 1회 호출하고 검색어 목록을 돌려준다', async () => {
    const f = deps('openai', {});
    const q = await resolveResearchQueries('청년도약계좌 조건', 'seo', f.deps);
    expect(q).toEqual(['가입 조건', '정부기여금 금액', '중도해지 불이익', '신청 기간', '은행별 금리 비교']);
    expect(f.callModel).toHaveBeenCalledTimes(1);
    expect(f.callModel.mock.calls[0][1]).toMatchObject({ maxTokens: 300, timeoutMs: 5_000 });
    expect(f.logs.join('\n')).toContain('질문 분해(gpt-4.1-mini) 5개');
  });

  it('구독 CLI 엔진은 건너뛰고(호출 0), 엔진 미선택·경로 없음도 건너뛴다', async () => {
    const sub = deps('agent-codex', { engine: 'codex(구독)', subscription: true });
    expect(await resolveResearchQueries('k', 'seo', sub.deps)).toEqual([]);
    expect(sub.callModel).not.toHaveBeenCalled();
    expect(sub.logs.join('\n')).toContain('구독 CLI');
    expect(await resolveResearchQueries('k', 'seo', deps(undefined, {}).deps)).toEqual([]);
    expect(await resolveResearchQueries('k', 'seo', deps('', {}).deps)).toEqual([]);
    const noRoute = deps('claude', null);
    expect(await resolveResearchQueries('k', 'seo', noRoute.deps)).toEqual([]);
    expect(noRoute.logs.join('\n')).toContain('키 없음');
  });

  it('호출이 실패하면 던지지 않고 빈 목록(기본 수집만)', async () => {
    const f = deps('openai', {}, new Error('timeout'));
    expect(await resolveResearchQueries('k', 'seo', f.deps)).toEqual([]);
    expect(f.logs.join('\n')).toContain('질문 분해 실패');
    expect(await resolveResearchQueries('', 'seo', deps('openai', {}).deps)).toEqual([]);
  });
});
