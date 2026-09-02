import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { stripStoreTagBrackets } from '../contentTitleHelpers';
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
    expect(v.points).toBe(-20);
    expect(v.reason).toContain('꼬리표');
  });

  it('없으면 0', () => {
    expect(scoreOptionNoise('헬스헬퍼 맥스컷, 식후 혈당 관리하려는 사람이 볼 것', 'affiliate').points).toBe(0);
  });
});

describe('배선: 게이트 복구 체인이 꼬리표를 걷어낸다', () => {
  it('sanitize 직후 stripStoreTagBrackets 가 온다', () => {
    const src = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8').replace(/\r/g, '');
    expect(src).toMatch(/cleanupStartingTitleTokens\(stripStoreTagBrackets\(sanitizeTitleSpecialChars\(finalContent\.selectedTitle\)\)\)/u);
  });
});

describe('상품명 원천에서부터 꼬리표가 없다', () => {
  it('productInfo.name 의 꼬리표가 모델 입력·제목에 도달하지 않는다', () => {
    const name = getReviewProductName({ productInfo: { name: '헬스헬퍼 맥스컷 프로 크롬 [슈퍼적립+사은품 증정]' } } as never);
    expect(name).not.toContain('[');
    expect(name).not.toContain(']');
    expect(name).toContain('헬스헬퍼 맥스컷');
  });
});
