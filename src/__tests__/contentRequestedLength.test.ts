import { describe, expect, it } from 'vitest';
import {
  appendRequestedLengthReminder,
  buildRequestedLengthContract,
  buildRequestedLengthReminder,
  describeRequestedLength,
  parseRequestedBodyLength,
  raiseMinCharsForRequest,
} from '../contentRequestedLength.js';
import { buildCustomPromptReminderBlock, DAILY_EDITORIAL_MARKER } from '../contentRequestSections.js';
import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat.js';

// Customer report 2026-11-25: "요청사항에 1500 ~ 2000자 이상 적어달라고 해도 900~1200자 이런식이네요".
// The app's length contract says "there is no character count to fill", and nothing read the number the user wrote.
describe('parseRequestedBodyLength', () => {
  it('reads the customer wording as "at least the lower number"', () => {
    expect(parseRequestedBodyLength('1500 ~ 2000자 이상 적어주세요')).toEqual({ kind: 'atLeast', min: 1500 });
    expect(parseRequestedBodyLength('본문은 2,000자 이상으로 써 주세요.')).toEqual({ kind: 'atLeast', min: 2000 });
    expect(parseRequestedBodyLength('글자수 3000자 넘게')).toEqual({ kind: 'atLeast', min: 3000 });
  });

  it('reads a range, a cap and a plain target', () => {
    expect(parseRequestedBodyLength('1500~2000자로 작성')).toEqual({ kind: 'range', min: 1500, max: 2000 });
    expect(parseRequestedBodyLength('1500자에서 2000자 사이')).toEqual({ kind: 'range', min: 1500, max: 2000 });
    expect(parseRequestedBodyLength('1000자 이내로 짧게')).toEqual({ kind: 'atMost', max: 1000 });
    expect(parseRequestedBodyLength('2000자 내외')).toEqual({ kind: 'around', target: 2000, min: 1800, max: 2200 });
    expect(parseRequestedBodyLength('2천자 정도로 써줘')).toEqual({ kind: 'around', target: 2000, min: 1800, max: 2200 });
    expect(parseRequestedBodyLength('공백 포함 1500 글자')).toEqual({ kind: 'around', target: 1500, min: 1350, max: 1650 });
  });

  it('ignores counts that are not about the body', () => {
    expect(parseRequestedBodyLength('제목은 30자 이내로')).toBeNull();
    expect(parseRequestedBodyLength('소제목 24자, 친근한 말투로')).toBeNull();
    expect(parseRequestedBodyLength('문단마다 300자 정도')).toBeNull();
    expect(parseRequestedBodyLength('도입부 400자 이내')).toBeNull();
    expect(parseRequestedBodyLength('친근한 말투로, 소제목 5개')).toBeNull();
    expect(parseRequestedBodyLength('2026년 3000명 모집')).toBeNull();
    expect(parseRequestedBodyLength('')).toBeNull();
    expect(parseRequestedBodyLength(undefined)).toBeNull();
  });

  it('skips a title count and still finds the body count after it', () => {
    expect(parseRequestedBodyLength('제목 30자 이내, 본문 1800자 이상')).toEqual({ kind: 'atLeast', min: 1800 });
  });

  it('refuses sizes no post body has', () => {
    expect(parseRequestedBodyLength('100자 이상')).toBeNull();
    expect(parseRequestedBodyLength('50000자 이상')).toBeNull();
  });
});

describe('requested length wording', () => {
  it('states the request the way the user would', () => {
    expect(describeRequestedLength({ kind: 'atLeast', min: 1500 })).toBe('1,500자 이상');
    expect(describeRequestedLength({ kind: 'atMost', max: 1000 })).toBe('1,000자 이내');
    expect(describeRequestedLength({ kind: 'range', min: 1500, max: 2000 })).toBe('1,500~2,000자');
    expect(describeRequestedLength({ kind: 'around', target: 2000, min: 1800, max: 2200 })).toBe('2,000자 안팎(1,800~2,200자)');
  });

  it('the contract overrides "no count to fill" but still forbids padding and invented facts', () => {
    const contract = buildRequestedLengthContract({ kind: 'atLeast', min: 1500 });
    expect(contract).toContain('1,500자 이상');
    expect(contract).toMatch(/R0-5.*보다 우선/);
    expect(contract).toMatch(/같은 말.*반복/);
    expect(contract).toMatch(/자료에 없는 사실/);
    expect(buildRequestedLengthReminder({ kind: 'atLeast', min: 1500 })).toContain('본문 분량: 1,500자 이상');
  });
});

describe('raiseMinCharsForRequest', () => {
  it('raises the working target to the requested minimum and never lowers it', () => {
    expect(raiseMinCharsForRequest(2000, '3000자 이상')).toBe(3000);
    expect(raiseMinCharsForRequest(2500, '1500자 이상')).toBe(2500);
    expect(raiseMinCharsForRequest(2000, '1000자 이내')).toBe(2000);
    expect(raiseMinCharsForRequest(2000, '4000자 내외')).toBe(3600);
    expect(raiseMinCharsForRequest(2000, '친근하게')).toBe(2000);
  });

  it('reads only what the user wrote, not the app editorial block', () => {
    expect(raiseMinCharsForRequest(2000, `친근하게\n${DAILY_EDITORIAL_MARKER}\n본문 5000자 이상`)).toBe(2000);
  });
});

describe('prompt wiring', () => {
  const format = (customPrompt?: string) => buildContentJsonOutputFormat({
    contentMode: 'seo', mode: 'seo', source: { customPrompt } as never, title: '위축성위염 관리법', rawText: '원본',
    primaryKeyword: '위축성위염', subKeywords: [], metrics: undefined as never, minChars: 2000, plainRegister: false,
  } as never);

  it('keeps "length is a result" when the user gave no count', () => {
    const text = format('친근한 말투로');
    expect(text).toContain('분량은 목표가 아니라 결과다');
    expect(text).not.toContain('사용자가 본문 분량을 직접 지정했다');
  });

  it('replaces it with the user count when one is given', () => {
    const text = format('1500 ~ 2000자 이상 적어주세요');
    expect(text).toContain('사용자가 본문 분량을 직접 지정했다: 1,500자 이상');
    // The app's own sentence is gone; the user contract only quotes R0-5 to say it is overridden.
    expect(text).not.toContain('분량은 목표가 아니라 결과다(seo R0-5)');
    expect(text).not.toContain('약속한 질문에 근거를 갖고 답했으면 거기서 끝낸다');
  });

  it('repeats the count in the reminder at the very end of the prompt', () => {
    const remind = (prompt: string) => appendRequestedLengthReminder(buildCustomPromptReminderBlock(prompt), prompt);
    const block = remind('1500 ~ 2000자 이상 적어주세요');
    expect(block.split('\n').pop()).toContain('본문 분량: 1,500자 이상');
    expect(remind('친근한 말투로')).not.toContain('본문 분량:');
    expect(remind(`친근하게\n${DAILY_EDITORIAL_MARKER}\n본문 5000자 이상`)).not.toContain('본문 분량:');
    expect(appendRequestedLengthReminder('', '2000자 이상')).toBe('');
  });
});

describe('adherence check', () => {
  it('does not treat the length request as a word the body must contain', async () => {
    const { assessCustomPromptAdherence } = await import('../contentPromptAdherence.js');
    const report = assessCustomPromptAdherence(
      { selectedTitle: '위축성위염 관리법', bodyPlain: '위축성위염 관리법과 추적 내시경 시기를 정리합니다.' },
      { customPrompt: '위축성위염 관리법을 1500자 이상, 2,000자 안팎으로 적어주세요' },
    );
    expect(report.requiredTerms.join(' ')).not.toMatch(/\d\s*자/);
    expect(report.missingTerms.join(' ')).not.toMatch(/\d\s*자/);
  });
});
