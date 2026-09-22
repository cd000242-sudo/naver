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

  // [2026-09-22 SPEC — attribution/후처리 원칙] '일반론 어휘 사용 금지' 목록과 "(자료 부족)"
  // 표기, "[자료] 인용 토큰 추가" 지시를 뺐다 — 본문 프롬프트가 이미 금지하는 토큰을 재생성
  // 프롬프트가 다시 요구하고, 후처리가 어차피 지우는 지시였다. 실제 검증 가능한 지시(수치
  // 작성 금지, 발언 인용)만 남는다.
  it('keeps faithfulness and section-distinctness retries grounded', () => {
    const faithfulness = prependFaithfulnessRetryInstruction({
      matchedTriggers: '일반적으로, 대부분',
      previousInstruction: 'base',
    });
    expect(faithfulness).toContain('Faithfulness 강화 재생성');
    expect(faithfulness).toContain('[Article Content] 또는 <source>에 없는 수치/날짜/금액 작성 금지');
    expect(faithfulness).not.toContain('일반론 어휘');
    expect(faithfulness).not.toContain('(자료 부족)');
    expect(faithfulness).not.toContain('[자료] 인용 토큰 추가');

    const distinctness = prependSectionDistinctnessRetryInstruction('base');
    expect(distinctness).toContain('섹션 중복 재생성');
    expect(distinctness).toContain('섹션마다 다른 구체 정보');
  });

  it('still includes quote candidates when provided', () => {
    const faithfulness = prependFaithfulnessRetryInstruction({
      matchedTriggers: '일반적으로',
      quoteCandidates: ['접수는 온라인으로만 받습니다'],
    });
    expect(faithfulness).toContain('따옴표 그대로 본문에 넣고');
    expect(faithfulness).toContain('접수는 온라인으로만 받습니다');
  });
});
