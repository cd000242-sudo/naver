/**
 * SPEC-EVENT-RETRIEVAL-2026 Phase 1 — 사건 동일성으로 곁가지를 가른다.
 *
 * 사장님 실측: 키워드 "김서현 류현진 평행이론" 으로 쓴 글에 류현진 평행이론 / 송영진 151km /
 * 김서현 플레이오프 세 사건이 조립됐다. 사람이라면 "김영웅" 이라는 다리 인물을 찾아
 * "이틀 연속 김영웅에게 스리런" 이라는 중심 사건에 도달한다.
 *
 * 지금 주제 게이트 4곳은 전부 **어휘 겹침**이라 같은 낱말을 쓰는 다른 사건을 구조적으로
 * 통과시킨다(supplementTopicGuard.ts:215 주석이 그 한계를 인정한다). 축을 바꾼다 —
 * 사건의 동일성은 낱말이 아니라 **(인물 집합 × 날짜)** 로 정해진다.
 *
 * Phase 0 실측으로 인물 추출은 정규식으로 불가함이 확정됐다(fabricationCheck 의 PEOPLE 은
 * 인원수 40명이고, 3자 토큰은 화장실·주차장을 뽑는다). 그래서 서명은 이미 도는 설계도
 * LLM 호출의 필드로 받고, **판정은 이 순수 함수가** 한다.
 */
import { describe, it, expect } from 'vitest';
import {
  materialEventSignature,
  isSameEvent,
  splitByCentralEvent,
  type EventSignature,
} from '../content/eventCohesion';

const central: EventSignature = {
  people: ['김서현', '김영웅'],
  dates: ['10월 22일'],
  eventType: '스리런 피홈런',
};

const sig = (people: string[], dates: string[] = []): EventSignature =>
  ({ people, dates, eventType: '' });

describe('isSameEvent — 인물이나 날짜가 하나라도 이어지면 같은 사건', () => {
  it('인물이 겹치면 같은 사건', () => {
    expect(isSameEvent(central, sig(['김영웅', '이재현']))).toBe(true);
  });

  it('날짜가 겹치면 같은 사건 (인물이 달라도 같은 날 같은 경기다)', () => {
    expect(isSameEvent(central, sig(['한화팬'], ['10월 22일']))).toBe(true);
  });

  it('인물 0명·날짜 0개 겹침이면 다른 사건', () => {
    expect(isSameEvent(central, sig(['송영진'], ['9월 3일']))).toBe(false);
  });

  it('서명이 비면 판정하지 않는다 — 근거 없이 버리지 않는다', () => {
    expect(isSameEvent(central, sig([], []))).toBe(true);
    expect(isSameEvent(sig([], []), sig(['송영진']))).toBe(true);
  });

  it('공백·표기 흔들림을 흡수한다', () => {
    expect(isSameEvent(central, sig([' 김영웅 ']))).toBe(true);
    expect(isSameEvent(central, sig([], ['10월22일']))).toBe(true);
  });
});

describe('splitByCentralEvent — 실측 사례 재현', () => {
  const materials = [
    { id: 'a', text: '김서현이 10월 22일 김영웅에게 스리런을 맞았다.' },
    { id: 'b', text: '류현진은 10월 21일 김영웅에게 스리런을 허용했다.' },
    { id: 'c', text: '송영진이 151km 강속구를 던졌다. 9월 3일 경기였다.' },
  ];
  const signatures = new Map<string, EventSignature>([
    ['a', sig(['김서현', '김영웅'], ['10월 22일'])],
    ['b', sig(['류현진', '김영웅'], ['10월 21일'])],
    ['c', sig(['송영진'], ['9월 3일'])],
  ]);

  it('송영진 자료만 강등된다', () => {
    const r = splitByCentralEvent(materials, central, (m) => signatures.get(m.id)!);
    expect(r.demoted.map((m) => m.id)).toEqual(['c']);
    expect(r.kept.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('강등 사유가 남는다 — 근거 없는 제외는 진단이 불가능하다', () => {
    const r = splitByCentralEvent(materials, central, (m) => signatures.get(m.id)!);
    expect(r.reasons.get('c')).toMatch(/인물|날짜/);
  });

  it('중심 사건이 비면 아무것도 강등하지 않는다', () => {
    const r = splitByCentralEvent(materials, sig([], []), (m) => signatures.get(m.id)!);
    expect(r.demoted).toHaveLength(0);
    expect(r.kept).toHaveLength(3);
  });

  it('전부 강등될 상황이면 강등을 포기한다 — 자료가 마르면 도구의 강점이 사라진다', () => {
    const r = splitByCentralEvent(materials, sig(['전혀다른사람'], ['1월 1일']), (m) => signatures.get(m.id)!);
    expect(r.demoted).toHaveLength(0);
    expect(r.kept).toHaveLength(3);
  });
});

describe('materialEventSignature — 설계도 실패 시 날짜 폴백', () => {
  it('날짜는 정규식으로 뽑는다 (Phase 0 에서 동작 확인된 유일한 축)', () => {
    const s = materialEventSignature('행사는 8월 3일에 열렸고 2026년 9월 4일에 발표됐다.');
    expect(s.dates.length).toBeGreaterThanOrEqual(2);
    expect(s.dates.join(' ')).toMatch(/8\s*월\s*3\s*일/);
  });

  it('인물은 비운다 — 정규식으로 인물명을 못 뽑는다는 것이 Phase 0 결론이다', () => {
    expect(materialEventSignature('김서현이 김영웅에게 스리런을 맞았다.').people).toEqual([]);
  });
});

/**
 * [2026-09-10 설계 진전] 문서마다 인물을 뽑을 필요가 없다.
 *
 * 자료는 `\n\n---\n\n` 로 문서 단위로 이어 붙는다(sourceAssembler.ts:8183).
 * 중심 사건의 인물·날짜는 설계도가 주므로, 각 문서에 대해서는 **그 이름이 나오는지**만
 * 보면 된다. 인물명 추출이 불가능하다는 Phase 0 장벽을 통째로 우회한다.
 */
describe('splitByCentralMention — 중심 인물·날짜가 언급되지 않는 문서를 강등', () => {
  const material = [
    '김서현이 10월 22일 김영웅에게 스리런을 맞았다. 한화는 그대로 무너졌다.',
    '류현진도 하루 전 김영웅에게 스리런을 허용했다. 이틀 연속이다.',
    '송영진이 151km 강속구를 던졌다. 구속이 화제가 됐다.',
  ].join('\n\n---\n\n');

  it('실측 사례: 송영진 문서만 강등된다', async () => {
    const { splitByCentralMention } = await import('../content/eventCohesion');
    const r = splitByCentralMention(material, central);
    expect(r.demoted).toHaveLength(1);
    expect(r.demoted[0]).toContain('송영진');
    expect(r.kept).toHaveLength(2);
  });

  it('강등 사유가 남는다', async () => {
    const { splitByCentralMention } = await import('../content/eventCohesion');
    const r = splitByCentralMention(material, central);
    expect(r.reasons[0]).toMatch(/김서현|김영웅|10월 22일/);
  });

  it('중심 서명이 약하면(단서 1개 이하) 판정하지 않는다', async () => {
    const { splitByCentralMention } = await import('../content/eventCohesion');
    expect(splitByCentralMention(material, sig(['김영웅'], [])).demoted).toHaveLength(0);
  });

  it('전부 강등될 상황이면 강등을 포기한다', async () => {
    const { splitByCentralMention } = await import('../content/eventCohesion');
    expect(splitByCentralMention(material, sig(['전혀', '다른사람'], ['1월 1일'])).demoted).toHaveLength(0);
  });

  it('문서가 하나뿐이면 판정하지 않는다 — 비교 대상이 없다', async () => {
    const { splitByCentralMention } = await import('../content/eventCohesion');
    expect(splitByCentralMention('김서현 단독 자료', central).demoted).toHaveLength(0);
  });

  it('날짜 표기가 달라도 언급으로 친다', async () => {
    const { splitByCentralMention } = await import('../content/eventCohesion');
    const m = ['다른 이야기 하나입니다.', '10월22일 경기 기록입니다.'].join('\n\n---\n\n');
    const r = splitByCentralMention(m, central);
    expect(r.kept.join(' ')).toContain('10월22일');
  });
});

describe('contentGenerator 배선 핀', () => {
  const live = (needle: string): number => {
    const fs = require('fs') as typeof import('fs');
    return fs.readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8')
      .split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .filter((line) => line.includes(needle))
      .length;
  };

  it('설계도 결과에서 centralEvent 를 읽어 강등 판정을 돈다', () => {
    expect(live('splitByCentralMention(')).toBeGreaterThan(0);
  });

  it('강등된 자료를 offTopic 으로 넘긴다 (버리지 않는다)', () => {
    expect(live('blueprintOffTopic = [...new Set(')).toBeGreaterThan(0);
  });

  it('강등 사유를 로그에 남긴다', () => {
    expect(live('[EventCohesion] ⬇️ 강등')).toBeGreaterThan(0);
  });
});
