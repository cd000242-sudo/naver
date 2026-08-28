import { describe, expect, it } from 'vitest';
import {
  appendPublicInfoFactTable,
  buildPublicInfoFactTableBlock,
  isPublicInfoTopic,
  shouldRequireFactTable,
} from '../content/publicInfoFactTable';

const material = '가'.repeat(400);

describe('publicInfoFactTable', () => {
  it('detects public-information topics from title and keywords', () => {
    expect(isPublicInfoTopic({ title: '민생회복 소비쿠폰 신청 방법' })).toBe(true);
    expect(isPublicInfoTopic({ keywords: ['청년 월세 지원금'] })).toBe(true);
    expect(isPublicInfoTopic({ title: '가을 캠핑 준비물 추천' })).toBe(false);
  });

  it('requires the table only when there is material to fill it from', () => {
    expect(shouldRequireFactTable({ title: '지원금 신청', rawText: material })).toBe(true);
    expect(shouldRequireFactTable({ title: '지원금 신청', rawText: '짧은 자료' })).toBe(false);
    expect(shouldRequireFactTable({ title: '캠핑 준비물', rawText: material })).toBe(false);
  });

  it('carries the blank-cell contract and the source tier ranking', () => {
    const block = buildPublicInfoFactTableBlock();
    expect(block).toContain('주민등록 기준일');
    expect(block).toContain('비운 칸의 사실은 본문에 한 글자도 쓰지 않는다');
    expect(block).toContain('블로그·요약글만 근거인 수치·날짜는 표에서 제외한다');
    expect(block).toContain('표는 본문에 출력하지 않는다');
  });

  it('appends only for qualifying sources and leaves others untouched', () => {
    const base = 'SYSTEM';
    expect(appendPublicInfoFactTable(base, { title: '캠핑', rawText: material })).toBe(base);
    const applied = appendPublicInfoFactTable(base, { title: '재난지원금', rawText: material });
    expect(applied.startsWith(base)).toBe(true);
    expect(applied).toContain('사실표부터 채운다');
  });
});
