/** SPEC-BLUEPRINT-2026 Phase 1 — 설계도 → 재료 블록 렌더 계약. */
import { describe, expect, it } from 'vitest';
import { renderBlueprintMaterial } from '../content/blueprint/renderBlueprintMaterial';
import type { Blueprint } from '../content/blueprint/blueprintSchema';

const BP: Blueprint = {
  angle: '청년월세지원 2차, 나는 대상이고 어떻게 신청하나',
  readerSituation: '복지로에 들어갔는데 내가 대상인지 몰라 화면을 닫은 상황',
  quotes: [
    { text: '접수 첫 주에는 접속이 몰리니 오후 시간대를 권한다', speaker: '담당자' },
    { text: '서류는 온라인으로 다 낼 수 있다', speaker: '' },
    { text: '주민센터에서도 접수한다', speaker: '구청' },
  ],
  facts: [{ claim: '월 최대 20만원, 12개월', snippet: '월 최대 20만원을 12개월간 지원한다' }],
  skeleton: ['지원 대상 조건', '신청 방법과 접수처'],
  offTopic: ['도심 공공주택 후보지 발표'],
};

describe('renderBlueprintMaterial', () => {
  it('재료 블록에 상황·각도·소제목·제외·인용(최소 개수)·사실(근거)이 담긴다', () => {
    const out = renderBlueprintMaterial(BP, { quoteFloor: 2 });
    expect(out.startsWith('[설계도 — 이 글은 아래 재료로 쓴다]')).toBe(true);
    expect(out).toContain('독자 상황(도입부 첫 문장은 이 장면에서 시작한다): 복지로에');
    expect(out).toContain('소제목 후보(각각 다른 질문 축, 순서·표현은 다듬어도 된다): 지원 대상 조건 / 신청 방법과 접수처');
    expect(out).toContain('본문에서 뺄 주제(자료에 있어도 이 글의 질문이 아니다): 도심 공공주택 후보지 발표');
    // [2026-09-11] 소제목↔재료 배정 계약 — 재료를 못 받은 칸이 감상 반복으로 채워지던 것을 막는다.
    expect(out).toContain('서로 다른 것을 최소 하나씩');
    expect(out).toContain('앞 소제목이 이미 쓴 사실을 다른 말로 다시 설명하지 않는다');
    // 하한이 환각을 부르지 않도록 빠져나갈 문을 같이 준다.
    expect(out).toContain('맡을 재료가 없는 소제목은 감상으로 채우지 말고 지운다');
    expect(out).toContain('최소 2개를 본문에 큰따옴표로 그대로 싣고');
    expect(out).toContain('1. "접수 첫 주에는 접속이 몰리니 오후 시간대를 권한다" — 담당자');
    expect(out).toContain('2. "서류는 온라인으로 다 낼 수 있다"\n');
    expect(out).toContain('1. 월 최대 20만원, 12개월 (근거: "월 최대 20만원을 12개월간 지원한다")');
  });

  it('인용 최소 개수는 설계도가 가진 개수를 넘지 않고, 빈 항목은 블록을 만들지 않는다', () => {
    const one = renderBlueprintMaterial({ ...BP, quotes: [BP.quotes[0]] }, { quoteFloor: 3 });
    expect(one).toContain('최소 1개');
    const bare = renderBlueprintMaterial({ ...BP, quotes: [], facts: [], offTopic: [] });
    expect(bare).not.toContain('[당사자 발언');
    expect(bare).not.toContain('[핵심 사실');
    expect(bare).not.toContain('본문에서 뺄 주제');
  });

  it('같은 설계도는 항상 같은 문자열(캐시 접두 안정)', () => {
    expect(renderBlueprintMaterial(BP)).toBe(renderBlueprintMaterial(BP));
  });
});

describe('renderBlueprintMaterial — 최소선 문구', () => {
  it('설계도가 상한이 아니라 최소선임을 첫 줄 다음에 밝힌다', () => {
    const out = renderBlueprintMaterial(BP);
    const lines = out.split('\n');
    expect(lines[1]).toContain('이 설계도는 최소선이다');
    expect(lines[1]).toContain('요청 분량을 채운다');
  });
});

describe('소제목 배정 계약', () => {
  it('소제목이 없으면 배정 줄도 내보내지 않는다 — 맡을 칸이 없는데 계약만 남으면 혼선이다', () => {
    const none = renderBlueprintMaterial({ ...BP, skeleton: [] });
    expect(none).not.toContain('소제목 배정');
  });
});
