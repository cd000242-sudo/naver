import { describe, expect, it } from 'vitest';
import {
  prependDuplicatePatternRetryInstruction,
  prependFaithfulnessRetryInstruction,
  prependInvalidJsonResponseInstruction,
  prependJsonParseRetryInstruction,
  prependSectionDistinctnessRetryInstruction,
  prependValidationRetryInstruction,
} from '../contentRetryPromptPolicy';

describe('contentRetryPromptPolicy', () => {
  it('keeps invalid JSON refusal retries compact and JSON-only', () => {
    const instruction = prependInvalidJsonResponseInstruction('previous');

    expect(instruction).toContain('이전 응답이 올바른 JSON이 아니었습니다');
    expect(instruction).toContain('오직 JSON 객체만 반환하세요');
    expect(instruction).toContain('previous');
  });

  it('keeps parse-failure retries strict about JSON object boundaries', () => {
    const instruction = prependJsonParseRetryInstruction({ attempt: 1, previousInstruction: 'tail' });

    expect(instruction).toContain('JSON 파싱 실패 (시도 2)');
    expect(instruction).toContain('반드시 { 로 시작 } 로 끝나는 유효 JSON만 출력');
    expect(instruction).toContain('tail');
  });

  it('keeps duplicate and validation retry guidance short and specific', () => {
    expect(prependDuplicatePatternRetryInstruction({
      errors: '소제목 반복, 본문 반복',
      previousInstruction: 'base',
    })).toContain('중복/패턴 감지: 소제목 반복, 본문 반복');

    expect(prependValidationRetryInstruction('base')).toContain('소제목 순서와 중복을 확인');
  });

  it('keeps faithfulness and section-distinctness retries grounded', () => {
    const faithfulness = prependFaithfulnessRetryInstruction({
      matchedTriggers: '일반적으로, 대부분',
      previousInstruction: 'base',
    });
    expect(faithfulness).toContain('Faithfulness 강화 재생성');
    expect(faithfulness).toContain('[Article Content] 또는 <source>에 없는 수치/날짜/금액 작성 금지');
    expect(faithfulness).toContain('(자료 부족)');

    const distinctness = prependSectionDistinctnessRetryInstruction('base');
    expect(distinctness).toContain('섹션 중복 재생성');
    expect(distinctness).toContain('섹션마다 다른 구체 정보');
  });
});
