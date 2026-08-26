import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  describeUngroundedNumbers,
  extractMeasurements,
  findUngroundedNumbers,
} from '../content/numericGroundingCheck';

/**
 * [2026-08-27 실측 3편] 사실 보존은 100%인데 그 사실들이 잘못 조합된다.
 *
 * 서인영 글 두 편에서 같은 병이 보였다.
 *   1편  자료의 "16시간 공복" 과 "파운드" 가 한 문장으로 엮여
 *        "약 16파운드 안팎의 체지방 감량" 이 됐다. 자료엔 그런 말이 없다.
 *   2편  "16파운드"·"16시간" 은 근거가 있는데 "최소 16개월 동안" 이 옆에 끼어들었다.
 *        어디서 온 기준인지 알 수 없다.
 *
 * 모델이 한 숫자를 붙잡으면 다른 맥락에 재사용한다. 근거 게이트는 "자료에 있는가"만
 * 보고 "자료에서 그렇게 쓰였는가"는 아무도 보지 않았다.
 *
 * 수치는 단위까지 같아야 같은 사실이다. "16시간" 이 있다고 "16개월" 이 근거를 얻지 않는다.
 * 경고만 낸다 — 계산해서 쓴 값(16파운드 ≈ 7.2kg)은 자료에 없어도 정당할 수 있다.
 */
describe('수치 뽑기', () => {
  it('숫자와 단위를 붙여 뽑는다', () => {
    const m = extractMeasurements('15kg을 감량해 46kg이 됐고 7개월간 탄수화물을 끊었다.');
    expect(m).toContain('15kg');
    expect(m).toContain('46kg');
    expect(m).toContain('7개월');
  });

  it('단위 없는 맨 숫자는 뽑지 않는다 — 오탐이 너무 많다', () => {
    expect(extractMeasurements('번호는 12345 이고 코드는 77 이다')).toEqual([]);
  });

  it('공백이 끼어도 같은 수치로 본다', () => {
    expect(extractMeasurements('16 시간 공복')).toContain('16시간');
  });

  it('소수점을 살린다', () => {
    expect(extractMeasurements('복합연비는 10.8km 수준')).toContain('10.8km');
  });

  it('같은 수치는 한 번만', () => {
    const m = extractMeasurements('46kg에서 46kg으로 유지했다');
    expect(m.filter((x) => x === '46kg')).toHaveLength(1);
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => extractMeasurements(null as never)).not.toThrow();
  });
});

describe('자료에 없는 수치 찾기', () => {
  // 실제 수집 자료는 8,000자대다. 하한(500자)을 넘겨야 판정이 돈다 —
  // 얇은 자료로는 "자료에 없다"를 근거로 삼을 수 없기 때문이다.
  const SOURCE = [
    '서인영이 워터밤 속초 무대를 위해 15kg을 감량해 46kg이 됐다고 밝혔다.',
    '구운 달걀과 채소가루 생식을 주식으로 삼고 7개월간 탄수화물을 끊었다고 한다.',
    '늦은 식사가 대사에 미치는 영향은 16시간 공복 연구에서도 확인됐다.',
    '헬스장에서 가장 무거운 볼링공은 16파운드 정도다.',
    '무대에서는 대표곡 신데렐라와 땡큐를 선보였고 관객 반응이 이어졌다.',
    '소속사는 무대 준비 과정에서 체력 관리에 집중했다고 전했다.',
    '팔뚝 부위는 식단만으로 정리되지 않아 시술을 병행했다고 밝혔다.',
    '새벽 시간대의 야식 습관을 끊은 것이 변화의 계기가 됐다고 한다.',
  ].join(' ').repeat(3);

  it('자료에 있는 수치는 통과한다', () => {
    const r = findUngroundedNumbers('15kg을 빼서 46kg이 됐고 7개월간 절제했다.', SOURCE);
    expect(r).toEqual([]);
  });

  it('자료에 없는 수치를 잡는다 — 실측된 "16개월"', () => {
    const r = findUngroundedNumbers('최소 16개월 동안 유지하지 못하면 요요가 온다.', SOURCE);
    expect(r).toContain('16개월');
  });

  it('숫자가 같아도 단위가 다르면 근거가 아니다', () => {
    // 자료에 "16시간"·"16파운드"가 있다고 "16개월"이 근거를 얻지는 않는다.
    expect(findUngroundedNumbers('16개월', SOURCE)).toContain('16개월');
    expect(findUngroundedNumbers('16시간', SOURCE)).toEqual([]);
  });

  it('실측된 "13곡"도 잡는다', () => {
    expect(findUngroundedNumbers('총 13곡의 후보 중 엄선했다.', SOURCE)).toContain('13곡');
  });

  it('자료가 얇으면 판정하지 않는다 — 없는 근거로 경고하지 않는다', () => {
    expect(findUngroundedNumbers('16개월 동안', '짧다')).toEqual([]);
  });

  it('빈 글은 조용하다', () => {
    expect(findUngroundedNumbers('', SOURCE)).toEqual([]);
  });

  it('보고 개수를 제한한다 — 로그가 읽을 수 있어야 한다', () => {
    const many = Array.from({ length: 30 }, (_, i) => `${i + 100}개월`).join(' ');
    expect(findUngroundedNumbers(many, SOURCE).length).toBeLessThanOrEqual(8);
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => findUngroundedNumbers(null as never, undefined as never)).not.toThrow();
  });

  it('경고 문구가 무엇을 확인하라는지 말한다', () => {
    const msg = describeUngroundedNumbers(['16개월', '13곡']);
    expect(msg).toContain('16개월');
    expect(msg).toContain('자료에');
  });

  it('문제가 없으면 빈 문구', () => {
    expect(describeUngroundedNumbers([])).toBe('');
  });
});

describe('본선 배선', () => {
  const src = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf-8');

  it('사후 검증기가 수치를 대조한다', () => {
    expect(src).toMatch(/findUngroundedNumbers\(/);
  });

  it('던지지 않는다 — 발행을 막을 수 없다', () => {
    expect(src).not.toMatch(/throw[^\n]{0,60}Ungrounded/i);
  });
});
