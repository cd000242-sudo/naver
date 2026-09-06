import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildThroughlineDirective,
  buildThroughlinePrompt,
  describeThroughline,
  isThroughlineJudgeEnabled,
  judgeThroughline,
  type ThroughlineRoute,
} from '../content/throughlineJudge';

/**
 * [2026-09-06 R3] 관통 판정 — 사장님 기준 "도입에서 던진 문제를 끝까지 붙잡는 구성".
 *
 * R2 가 스키마에 판단(finalVerdict)을 세웠다면, R3 는 글이 실제로 그 판단을 끝까지 들고
 * 갔는지를 서브모델에게 1회 묻는다. 어휘 겹침으로는 못 잰다(이 코드베이스에서 두 번 실측 실패).
 * 소비자는 기존 재생성/patch 뿐 — 새 재생성 트리거를 만들지 않는다(편당 비용).
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

const CONTENT = {
  selectedTitle: '9월 청약통장, 지금 해지하면 손해일까',
  __blueprintAngle: '금리 오른 지금 청약통장을 유지할지 해지할지',
  finalVerdict: '납입 2년 넘었으면 유지, 1년 미만이면 해지해도 잃는 게 거의 없다.',
  introduction: '청약통장 해지 검색이 늘었다. 나도 지난달 같은 고민을 했다.',
  headings: [
    { title: '납입 기간이 갈림길이다', content: '가점은 납입 기간으로 쌓인다. '.repeat(20) },
    { title: '금리만 보면 손해다', body: '예금 금리가 더 높다. '.repeat(20) },
    { title: '해지 전에 확인할 것', content: '청년 우대형 전환 여부. '.repeat(20) },
  ],
  conclusion: '결국 2년을 넘겼다면 붙들고, 아니면 미련 없이 정리해도 된다.',
};

function route(reply: string | (() => Promise<string>), extra: Partial<NonNullable<ThroughlineRoute>> = {}): NonNullable<ThroughlineRoute> {
  return {
    engine: 'test',
    callModel: vi.fn(async () => (typeof reply === 'string' ? reply : reply())),
    ...extra,
  };
}

afterEach(() => {
  delete process.env.THROUGHLINE_JUDGE_V1;
});

describe('isThroughlineJudgeEnabled — 기본 ON, 롤백 스위치', () => {
  it('미설정이면 ON', () => {
    expect(isThroughlineJudgeEnabled()).toBe(true);
  });
  it.each(['false', '0', 'off', ' OFF '])('%s 이면 OFF', (v) => {
    process.env.THROUGHLINE_JUDGE_V1 = v;
    expect(isThroughlineJudgeEnabled()).toBe(false);
  });
});

describe('buildThroughlinePrompt — 판정에 필요한 것만 싣는다', () => {
  it('제목·질문·판단·도입·소제목 첫 부분·결론이 마커 뒤에 실린다', () => {
    const p = buildThroughlinePrompt(CONTENT)!;
    const marker = p.indexOf('[원본 텍스트]');
    expect(marker).toBeGreaterThan(0);
    for (const needle of [CONTENT.selectedTitle, CONTENT.__blueprintAngle, CONTENT.finalVerdict, CONTENT.introduction, CONTENT.conclusion, '1. 납입 기간이 갈림길이다', '3. 해지 전에 확인할 것']) {
      expect(p.indexOf(needle)).toBeGreaterThan(marker);
    }
  });
  it('소제목 본문은 앞 160자만 싣는다', () => {
    const p = buildThroughlinePrompt(CONTENT)!;
    const full = CONTENT.headings[0].content as string;
    expect(p).toContain(full.slice(0, 160));
    expect(p).not.toContain(full.slice(0, 200));
  });
  it('어휘 겹침을 보지 말라고, 애매하면 통과라고 못 박는다', () => {
    const p = buildThroughlinePrompt(CONTENT)!;
    expect(p).toContain('단어 겹침');
    expect(p).toContain('애매하면 통과');
    expect(p).toMatch(/"holds"[^\n]*"breakAt"[^\n]*"reason"[^\n]*"fix"/);
  });
  it('질문·판단이 없어도 제목·결론만으로 판정 프롬프트를 만든다', () => {
    const p = buildThroughlinePrompt({ ...CONTENT, __blueprintAngle: undefined, finalVerdict: undefined })!;
    expect(p).not.toBeNull();
    expect(p).not.toContain('[도입이 받을 질문]');
    expect(p).not.toContain('[필자의 판단]');
  });
  it.each([
    ['제목 없음', { ...CONTENT, selectedTitle: '' }],
    ['결론 없음', { ...CONTENT, conclusion: '   ' }],
    ['소제목 없음', { ...CONTENT, headings: [] }],
  ])('%s 이면 null (판정 불가)', (_label, content) => {
    expect(buildThroughlinePrompt(content as never)).toBeNull();
  });
});

describe('judgeThroughline — fail-open 계약', () => {
  it('통과 응답은 judged=true holds=true patchable=false', async () => {
    const r = route('{"holds": true, "breakAt": "none", "reason": "결론이 판단으로 돌아옴", "fix": ""}');
    const j = await judgeThroughline(CONTENT, async () => r);
    expect(j).toMatchObject({ judged: true, holds: true, patchable: false, engine: 'test' });
    expect(r.callModel).toHaveBeenCalledTimes(1);
    expect((r.callModel as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ maxTokens: 500 });
  });
  it('결론 실패는 patchable — patch 가 본문+결론을 다시 쓸 수 있다', async () => {
    const r = route('```json\n{"holds": false, "breakAt": "conclusion", "reason": "본문 요약으로 끝남", "fix": "2년 기준 판단으로 돌아와 끝낼 것"}\n```');
    const j = await judgeThroughline(CONTENT, async () => r);
    expect(j).toMatchObject({ judged: true, holds: false, breakAt: 'conclusion', patchable: true });
    expect(j.reason).toBe('본문 요약으로 끝남');
    expect(j.fix).toBe('2년 기준 판단으로 돌아와 끝낼 것');
  });
  it('도입 실패는 patchable 아님 — patch 는 도입을 못 만진다', async () => {
    const j = await judgeThroughline(CONTENT, async () => route('{"holds": false, "breakAt": "intro", "reason": "일반론으로 시작", "fix": "제목 상황으로 시작"}'));
    expect(j).toMatchObject({ judged: true, holds: false, breakAt: 'intro', patchable: false });
  });
  it('모르는 breakAt 은 none 으로 정규화하고 실패면 patchable', async () => {
    const j = await judgeThroughline(CONTENT, async () => route('{"holds": false, "breakAt": "title", "reason": "x", "fix": "y"}'));
    expect(j).toMatchObject({ holds: false, breakAt: 'none', patchable: true });
  });
  it('라우트 없음(선택 엔진 키 없음) → 호출 없이 fail-open', async () => {
    const j = await judgeThroughline(CONTENT, async () => null);
    expect(j).toMatchObject({ judged: false, holds: true, patchable: false });
    expect(j.reason).toContain('생략');
  });
  it('구독 CLI 라우트는 생략(분 단위 호출) — 호출하지 않는다', async () => {
    const r = route('{"holds": false}', { subscription: true, engine: 'codex(구독)' });
    const j = await judgeThroughline(CONTENT, async () => r);
    expect(j).toMatchObject({ judged: false, holds: true });
    expect(j.reason).toContain('에이전트');
    expect(r.callModel).not.toHaveBeenCalled();
  });
  it('라우트 해석 자체가 던져도 fail-open', async () => {
    const j = await judgeThroughline(CONTENT, async () => { throw new Error('config boom'); });
    expect(j).toMatchObject({ judged: false, holds: true });
  });
  it('호출 실패·파싱 실패·holds 비불리언은 전부 fail-open', async () => {
    for (const r of [
      route(async () => { throw new Error('timeout'); }),
      route('죄송하지만 판단할 수 없습니다'),
      route('{"holds": "yes"}'),
    ]) {
      const j = await judgeThroughline(CONTENT, async () => r);
      expect(j).toMatchObject({ judged: false, holds: true, patchable: false });
    }
  });
  it('입력이 모자라면 호출 없이 생략', async () => {
    const r = route('{"holds": false}');
    const j = await judgeThroughline({ ...CONTENT, conclusion: '' }, async () => r);
    expect(j.judged).toBe(false);
    expect(r.callModel).not.toHaveBeenCalled();
  });
  it('reason·fix 는 길이를 자른다', async () => {
    const j = await judgeThroughline(CONTENT, async () => route(JSON.stringify({ holds: false, breakAt: 'body', reason: 'r'.repeat(500), fix: 'f'.repeat(900) })));
    expect(j.reason.length).toBeLessThanOrEqual(200);
    expect(j.fix.length).toBeLessThanOrEqual(300);
  });
});

describe('buildThroughlineDirective / describeThroughline', () => {
  it('통과·생략이면 지시가 비어 있다', async () => {
    const pass = await judgeThroughline(CONTENT, async () => route('{"holds": true, "breakAt": "none", "reason": "ok", "fix": ""}'));
    const skip = await judgeThroughline(CONTENT, async () => null);
    expect(buildThroughlineDirective(pass)).toBe('');
    expect(buildThroughlineDirective(skip)).toBe('');
  });
  it('실패면 어디서·왜·어떻게 + 결론 복귀 원칙이 들어간다', async () => {
    const miss = await judgeThroughline(CONTENT, async () => route('{"holds": false, "breakAt": "conclusion", "reason": "요약으로 끝남", "fix": "판단으로 돌아와 매듭"}'));
    const d = buildThroughlineDirective(miss);
    expect(d).toContain('결론');
    expect(d).toContain('요약으로 끝남');
    expect(d).toContain('판단으로 돌아와 매듭');
    expect(d).toContain('필자의 판단');
    expect(d.split('\n').length).toBeLessThanOrEqual(2);
  });
  it('로그 한 줄: ✅ / ⚠️ / 생략', async () => {
    const pass = await judgeThroughline(CONTENT, async () => route('{"holds": true, "breakAt": "none", "reason": "ok", "fix": ""}'));
    const miss = await judgeThroughline(CONTENT, async () => route('{"holds": false, "breakAt": "body", "reason": "판단 뒤집힘", "fix": "x"}'));
    const skip = await judgeThroughline(CONTENT, async () => null);
    expect(describeThroughline(pass)).toMatch(/^\[Throughline\] ✅/);
    expect(describeThroughline(miss)).toMatch(/^\[Throughline\] ⚠️ .*body.*판단 뒤집힘/);
    expect(describeThroughline(skip)).toMatch(/^\[Throughline\] 생략/);
  });
});

describe('contentGenerator 배선 — 소비자는 기존 재생성/patch 뿐', () => {
  const src = read('contentGenerator.ts');
  it('생성당 1회 가드 + 선택 엔진 라우트 + __throughline 스탬프', () => {
    expect(src).toContain('let _throughlineJudgeUsed = false;');
    expect(src).toContain('judgeThroughline(optimized as any, () => resolveSideTaskRoute(source))');
    expect(src).toContain('(optimized as any).__throughline = _throughline;');
  });
  it('costSaver 가 selfCritique 를 막으면 판정도 돌지 않는다(판정만 하고 못 고치는 호출 금지)', () => {
    const block = src.slice(src.indexOf('let _throughline:'), src.indexOf('_throughlineJudgeUsed = true;'));
    expect(block).toContain('costPolicy.allowQualityGateSelfCritique');
    expect(block).toContain('isThroughlineJudgeEnabled()');
  });
  it('재생성이 뜨면 지시만 얹는다 — 판정이 소유한 continue 는 없다', () => {
    const block = src.slice(src.indexOf('let _throughline:'), src.indexOf('_qualityGateRetryUsed = true;'));
    expect(block).not.toContain('continue;');
    expect(src).toMatch(/_throughlineDirective[^\n]*\n?[^\n]*\$\{_gateDirective\}\\n\$\{extraInstruction\}/);
  });
  it('patch 조건에 _throughlinePatch 가 들어가고 지시가 함께 넘어간다', () => {
    expect(src).toMatch(/_gateResult\.decision === 'patch' \|\| _humanFloorMiss \|\| _quality90HardMiss \|\| _throughlinePatch/);
    expect(src).toMatch(/const _patchDirective = \[_throughlineDirective, _quality90Assessment\?\.directive \|\| _gateResult\?\.retryDirective \|\| ''\]\.filter\(Boolean\)\.join\('\\n'\)/);
    expect(src).toMatch(/selfCritiqueAndRewrite\(\s*optimized\.bodyPlain,\s*_patchPersona,[^;]*_patchDirective,\s*_patchConclusion \|\| undefined,/);
  });
  it('지문 allowlist 에 등록돼 있다', () => {
    expect(read('contentQualityV3/candidateRuntimeFingerprint.ts')).toContain("'src/content/throughlineJudge.ts'");
  });
});
