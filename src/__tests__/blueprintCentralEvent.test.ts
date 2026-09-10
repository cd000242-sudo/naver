/**
 * SPEC-EVENT-RETRIEVAL-2026 Phase 1 — 사건 서명을 설계도 필드로 받는다.
 *
 * Phase 0 실측: 정규식으로 한국어 인물명을 뽑을 수 없다(fabricationCheck 의 PEOPLE 은
 * 인원수 "40명", 3자 토큰은 화장실·주차장). 그래서 "이 자료에 누가 나오는가" 는 이미 도는
 * 설계도 LLM 호출의 필드로 받는다 — 새 호출이 아니라 기존 요청의 필드 추가라 한계비용 0.
 *
 * 판정은 eventCohesion 의 순수 함수가 한다. 모델은 서명을 뽑을 뿐 무엇을 버릴지 정하지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { BLUEPRINT_JSON_SCHEMA, BLUEPRINT_LIMITS } from '../content/blueprint/blueprintSchema';
import { buildBlueprintPrompt } from '../content/blueprint/buildBlueprintPrompt';
import { parseBlueprint } from '../content/blueprint/parseBlueprint';

describe('설계도 스키마 — centralEvent', () => {
  it('JSON 스키마에 centralEvent 가 있다', () => {
    const props = (BLUEPRINT_JSON_SCHEMA as any).properties;
    expect(props.centralEvent).toBeTruthy();
    expect(props.centralEvent.properties.people).toBeTruthy();
    expect(props.centralEvent.properties.dates).toBeTruthy();
    expect(props.centralEvent.properties.eventType).toBeTruthy();
  });

  it('required 에는 넣지 않는다 — 옛 응답·다른 모드가 깨지면 안 된다', () => {
    expect((BLUEPRINT_JSON_SCHEMA as any).required).not.toContain('centralEvent');
  });

  it('상한이 정의돼 있다', () => {
    expect(BLUEPRINT_LIMITS.centralPeopleMax).toBeGreaterThan(0);
    expect(BLUEPRINT_LIMITS.centralDatesMax).toBeGreaterThan(0);
  });
});

describe('설계도 프롬프트 — centralEvent 지시', () => {
  const prompt = buildBlueprintPrompt({ keyword: '김서현 류현진 평행이론', mode: 'homefeed', material: '자료' });

  it('중심 사건의 인물·날짜를 뽑으라고 지시한다', () => {
    expect(prompt).toMatch(/centralEvent/);
    expect(prompt).toMatch(/people/);
    expect(prompt).toMatch(/dates/);
  });

  it('자료에 있는 것만 적으라고 못박는다 (환각 금지)', () => {
    expect(prompt).toMatch(/자료에 (있는|없는)/);
  });

  it('출력 형식 예시에도 centralEvent 가 들어 있다', () => {
    const format = prompt.slice(prompt.indexOf('[출력 형식]'), prompt.lastIndexOf('[자료]'));
    expect(format).toContain('centralEvent');
  });
});

describe('설계도 파서 — centralEvent', () => {
  const base = {
    angle: '무슨 일이 있었나', readerSituation: '경기를 놓친 사람이 결과를 찾는다',
    quotes: [], facts: [], skeleton: ['가', '나', '다'], offTopic: [],
  };

  it('centralEvent 를 읽어 온다', () => {
    const bp = parseBlueprint(JSON.stringify({
      ...base, centralEvent: { people: ['김서현', '김영웅'], dates: ['10월 22일'], eventType: '스리런' },
    }), '자료');
    expect(bp?.blueprint.centralEvent?.people).toEqual(['김서현', '김영웅']);
    expect(bp?.blueprint.centralEvent?.dates).toEqual(['10월 22일']);
    expect(bp?.blueprint.centralEvent?.eventType).toBe('스리런');
  });

  it('centralEvent 가 없어도 설계도는 성립한다 (옛 응답 호환)', () => {
    const bp = parseBlueprint(JSON.stringify(base), '자료');
    expect(bp).toBeTruthy();
    expect(bp?.blueprint.centralEvent).toBeUndefined();
  });

  it('빈 값·잘못된 타입은 걸러낸다', () => {
    const bp = parseBlueprint(JSON.stringify({
      ...base, centralEvent: { people: ['', '  ', '김영웅', 123], dates: null, eventType: 42 },
    }), '자료');
    expect(bp?.blueprint.centralEvent?.people).toEqual(['김영웅']);
    expect(bp?.blueprint.centralEvent?.dates).toEqual([]);
    expect(bp?.blueprint.centralEvent?.eventType).toBe('');
  });

  it('상한을 넘으면 자른다', () => {
    const many = Array.from({ length: 30 }, (_, i) => `인물${i}`);
    const bp = parseBlueprint(JSON.stringify({ ...base, centralEvent: { people: many, dates: [], eventType: '' } }), '자료');
    expect(bp!.blueprint.centralEvent!.people.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.centralPeopleMax);
  });
});
