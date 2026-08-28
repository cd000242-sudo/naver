import { describe, expect, it } from 'vitest';
import {
  normalizeContentTableBlocks,
  normalizeTableBlocks,
  splitTrailingProse,
} from '../content/tableBlockNormalizer';

describe('tableBlockNormalizer', () => {
  it('splits the measured defect: last table row fused with the next paragraph', () => {
    const line = "| 스트레이 키즈 | 해외 남성 아티스트 최초 단독 입성 | '해외 최초'라고만 쓴 글을 보고 트와이스 기록과 부딪힌다고 느끼셨다면, 성별 조건이 갈림길입니다.";
    expect(splitTrailingProse(line)).toEqual([
      '| 스트레이 키즈 | 해외 남성 아티스트 최초 단독 입성 |',
      "'해외 최초'라고만 쓴 글을 보고 트와이스 기록과 부딪힌다고 느끼셨다면, 성별 조건이 갈림길입니다.",
    ]);
  });

  it('leaves a well-formed table row alone', () => {
    const line = '| 공연 일자 | 29일~30일 (양일) |';
    expect(splitTrailingProse(line)).toEqual([line]);
  });

  it('leaves a three-column row alone — a short tail is a cell, not prose', () => {
    const line = '| 구분 | 내용 | 비고 |';
    expect(splitTrailingProse(line)).toEqual([line]);
  });

  it('ignores lines that are not table rows', () => {
    expect(splitTrailingProse('그냥 문장입니다. 파이프가 없습니다.')).toEqual(['그냥 문장입니다. 파이프가 없습니다.']);
  });

  it('returns the input untouched when there is nothing to fix', () => {
    const body = '| 구분 | 내용 |\n| --- | --- |\n| 장소 | 도쿄 |\n\n본문이 여기서 시작합니다.';
    expect(normalizeTableBlocks(body)).toBe(body);
    expect(normalizeTableBlocks('표가 없는 본문')).toBe('표가 없는 본문');
  });

  it('normalizes every body field without mutating the original content', () => {
    const original = {
      introduction: '| 발표 | 23일 |\n| 장소 | 도쿄 | 스트레이 키즈가 29일과 30일 공연을 엽니다.',
      conclusion: '마무리입니다.',
      headings: [{ title: '소제목', content: '| a | b | 이 문장은 표 뒤에 붙어 있었습니다.' }],
    };
    const snapshot = JSON.stringify(original);
    const fixed = normalizeContentTableBlocks(original);

    expect(fixed.introduction).toBe('| 발표 | 23일 |\n| 장소 | 도쿄 |\n스트레이 키즈가 29일과 30일 공연을 엽니다.');
    expect((fixed.headings[0] as { content: string }).content).toBe('| a | b |\n이 문장은 표 뒤에 붙어 있었습니다.');
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
