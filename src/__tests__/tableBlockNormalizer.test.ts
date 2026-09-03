import { describe, expect, it } from 'vitest';
import {
  closeUnterminatedRows,
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

  // [2026-09-03 생성 실측] 셀을 닫지 않고 빈 줄 + 외로운 파이프로 다음 행을 이었다 — 붙여넣기에서 표가 통째로 깨진다
  it('닫히지 않은 행 뒤에 빈 줄과 외로운 파이프가 오면 행을 닫고 파이프를 삼킨다', () => {
    const broken = [
      '| 구매 전 볼 항목 | 생활에서의 의미 |',
      '| --- | --- |',
      '| 모드 3개 | 선택지를 두고 싶은 경우에 맞습니다. |',
      '| 단계별·부위별 조절 | 그날 불편한 부위를 나눠 관리하려는 경우에 후보가 됩니다.',
      '',
      '|',
      '| 모드 ABC·방1-4 표기 | 설명서 이해가 중요한 사람에게는 답답함으로 남을 수 있습니다. |',
    ].join('\n');
    const fixed = normalizeTableBlocks(broken).split('\n');
    expect(fixed).toEqual([
      '| 구매 전 볼 항목 | 생활에서의 의미 |',
      '| --- | --- |',
      '| 모드 3개 | 선택지를 두고 싶은 경우에 맞습니다. |',
      '| 단계별·부위별 조절 | 그날 불편한 부위를 나눠 관리하려는 경우에 후보가 됩니다. |',
      '| 모드 ABC·방1-4 표기 | 설명서 이해가 중요한 사람에게는 답답함으로 남을 수 있습니다. |',
    ]);
  });

  it('닫히지 않은 행 다음이 산문이면 건드리지 않는다 — 그건 splitTrailingProse 의 몫', () => {
    const lines = ['| a | b |', '| c | d. 이어지는 문장입니다.', '', '다음 문단입니다.'];
    expect(closeUnterminatedRows(lines)).toEqual(lines);
  });

  // [2026-09-03 5차 실측] "…잘 맞아요. | 보관 상황 | 판단 |" — 표 머리행이 앞 문장에 붙었다
  it('산문 뒤에 붙은 표 행을 떼어 놓는다', () => {
    const text = ['쓸 때 꺼내고 접어 넣을 수 있는 사람에게 더 잘 맞아요. | 보관 상황 | 판단 |', '| --- | --- |', '| 접어 둘 공간이 있음 | 편합니다. |'].join('\n');
    expect(normalizeTableBlocks(text).split('\n')).toEqual([
      '쓸 때 꺼내고 접어 넣을 수 있는 사람에게 더 잘 맞아요.',
      '| 보관 상황 | 판단 |',
      '| --- | --- |',
      '| 접어 둘 공간이 있음 | 편합니다. |',
    ]);
    expect(normalizeTableBlocks('가격은 3만원. 45.5% 할인 | 아님')).toBe('가격은 3만원. 45.5% 할인 | 아님');
  });
});
