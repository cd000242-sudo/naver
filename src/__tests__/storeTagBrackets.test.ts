import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { stripStoreTagBrackets, stripOptionCombo } from '../contentTitleHelpers';
import { scoreOptionNoise } from '../content/titleModeObjective';
import { getReviewProductName } from '../contentReviewHelpers';

/**
 * [2026-09-03 라이브 — 헬스헬퍼 맥스컷] 최종 제목 "헬스헬퍼 맥스컷 프로 크롬 [슈퍼적립+사은품 증정]".
 * 스토어 상품명의 꼬리표가 후보 3개 전부와 최종 제목에 남았다. 대괄호 꼬리표는 프로모션·옵션 표기다 — 형태만 보고 걷어낸다.
 */
const LIVE = '헬스헬퍼 맥스컷 프로 크롬 [슈퍼적립+사은품 증정] 헬스헬퍼 맥스컷';

describe('스토어 꼬리표([…]) 제거', () => {
  it('실측 제목의 꼬리표를 걷어낸다', () => {
    expect(stripStoreTagBrackets(LIVE)).toBe('헬스헬퍼 맥스컷 프로 크롬 헬스헬퍼 맥스컷');
    expect(stripStoreTagBrackets('【무료배송】 종아리 마사지기, 부모님 선물')).toBe('종아리 마사지기, 부모님 선물');
  });

  it('소괄호는 내용일 수 있어 건드리지 않는다', () => {
    expect(stripStoreTagBrackets('크기 210x256(mm), 무게 1.5kg')).toBe('크기 210x256(mm), 무게 1.5kg');
  });
});

describe('채점: 꼬리표는 옵션 잡음이다', () => {
  it('대괄호 꼬리표만 있어도 -20', () => {
    const v = scoreOptionNoise('헬스헬퍼 맥스컷 프로 크롬 [사은품 증정]', 'affiliate');
    expect(v.points).toBe(-35);
    expect(v.reason).toContain('꼬리표');
  });

  it('없으면 0', () => {
    expect(scoreOptionNoise('헬스헬퍼 맥스컷, 식후 혈당 관리하려는 사람이 볼 것', 'affiliate').points).toBe(0);
  });
});

describe('배선: 게이트 복구 체인이 꼬리표를 걷어낸다', () => {
  // [2026-09-03] 체인에 stripOptionCombo(옵션 조합 제거)가 stripStoreTagBrackets 바깥에 한 겹 더 붙었다 — sanitize 직후 순서는 그대로다.
  it('sanitize 직후 stripStoreTagBrackets 가 온다', () => {
    const src = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8').replace(/\r/g, '');
    expect(src).toMatch(/cleanupStartingTitleTokens\(stripOptionCombo\(stripStoreTagBrackets\(sanitizeTitleSpecialChars\(finalContent\.selectedTitle\)\)\)/u);
  });
});

describe('상품명 원천에서부터 꼬리표가 없다', () => {
  it('productInfo.name 의 꼬리표가 모델 입력·제목에 도달하지 않는다', () => {
    const name = getReviewProductName({ productInfo: { name: '헬스헬퍼 맥스컷 프로 크롬 [슈퍼적립+사은품 증정]' } } as never);
    expect(name).not.toContain('[');
    expect(name).not.toContain(']');
    expect(name).toContain('헬스헬퍼 맥스컷');
  });

// [2026-09-03 4차 생성 실측] "닥터웰 종아리 마사지기 DR-5180 그레이 본체+다리, 운동 뒤 유선 괜찮을까" 가 최종 제목으로 나갔다
describe('stripOptionCombo — 스토어 옵션 조합 제거', () => {
  it('색상 + A+B 조합을 떼고 쉼표·공백을 정리한다', () => {
    expect(stripOptionCombo('닥터웰 종아리 마사지기 DR-5180 그레이 본체+다리, 운동 뒤 유선 괜찮을까')).toBe('닥터웰 종아리 마사지기 DR-5180, 운동 뒤 유선 괜찮을까');
    expect(stripOptionCombo('닥터웰 종아리 마사지기 DR-5180 본체+다리 소음은 괜찮을까')).toBe('닥터웰 종아리 마사지기 DR-5180 소음은 괜찮을까');
  });
  it("'+' 가 없거나 조합이 아니면 그대로 둔다", () => {
    expect(stripOptionCombo('닥터웰 종아리 마사지기, 유선인데 괜찮을까')).toBe('닥터웰 종아리 마사지기, 유선인데 괜찮을까');
  });
});
});
