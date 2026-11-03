import { describe, expect, it, vi } from 'vitest';
import {
  extractHarmonyPacket, verifyHarmonyPacket, measureAnswerPosition, payoffWindows,
  EFFECT_PROMISE_PATTERN, HARMONY_LIMITS, type HarmonyPacket, type ComplementItem,
} from '../content/agentHarmony/harmonyPacket';
import { parseTitleCandidates, titleCandidateKeys } from '../main/services/dailyPublishingTitleReviewContract';

const RAW = [
  '배우 김모씨(70)는 지난 3일 서울의 한 병원에 1억 원을 기부했다고 밝혔다.',
  '김씨는 "그냥 오래 전부터 하려던 일이었다"고 말했다.',
  '병원 관계자는 기부금이 소아 환자 치료비로 쓰인다고 전했다.',
  '코스 가격은 9,000원입니다.',
  '한 잔 가격은 따로 정해지지 않았다.',
].join('\n');
const B1 = '70세 배우 김모씨가 서울의 한 병원에 1억 원을 기부했다.';
const B2 = '김씨는 "그냥 오래 전부터 하려던 일이었다"고 말했다.';
const B3 = '기부금은 소아 환자 치료비로 쓰인다고 병원 관계자는 전했다.';
const B4 = '코스 가격은 9,000원입니다.';
const BODY = [B1, B2, B3, B4].join('\n');
const TASK = '[작업 명세] 제목의 약속은 도입부에서 첫 답을 준다. 자료에 없는 숫자를 쓰지 않는다. 소제목은 3~7개로 한다.';

const candidate = (id: string, title: string, question: string, src: string, body: string) => ({
  id, title, readerQuestion: question, expectedBelief: '통상 예상', surprisingFact: '자료 속 실제 행동', clickReason: '지금 확인할 이유',
  sourceAnchors: [src], bodyAnchors: [body],
});
const C1 = candidate('c1', '70세 배우가 1억 원을 병원에 건넨 이유', '왜 병원이었나', RAW.split('\n')[0], B1);
const C2 = candidate('c2', '"오래 전부터 하려던 일"이라는 말의 뒷이야기', '무슨 일을 하려던 건가', RAW.split('\n')[1], B2);
const C3 = candidate('c3', '소아 환자 치료비로 쓰이는 기부금의 행방', '돈은 어디에 쓰이나', RAW.split('\n')[2], B3);

function packet(overrides: Partial<{ chosenId: string; candidates: unknown[]; answerSentence: string }> = {}): HarmonyPacket {
  return {
    version: 1,
    material: { centralEvent: '배우 김모씨가 병원에 1억 원 기부', readerSituation: '기부 소식을 본 독자', notInSource: ['기부 시점의 동기'] },
    strategy: { readerQuestion: '왜 병원이었나', angle: '기부 행선지', exposureNote: '관측 자료 없음' },
    titles: { chosenId: overrides.chosenId ?? 'c1', candidates: (overrides.candidates ?? [C1, C2, C3]) as never, comparison: 'c1 이 가장 구체적, 차점 c3 은 질문이 약함' },
    payoff: { promise: '병원에 기부한 이유', answerSentence: overrides.answerSentence ?? B2 },
  };
}
const ITEM: ComplementItem = {
  kind: 'conflict', instructionQuote: '제목의 약속은 도입부에서 첫 답을 준다', otherQuote: '소제목은 3~7개로 한다',
  resolution: '자료가 받쳐 주는 5개로 맞춤', rule: 'payoff', affected: ['headings'],
};
const ctx = (over: Partial<{ rawText: string; body: string; title: string; systemPrompt: string }> = {}) => ({
  rawText: RAW, body: BODY, title: C1.title, systemPrompt: TASK, ...over,
});

describe('extractHarmonyPacket', () => {
  it('removes both fields from the parsed article and returns them validated', () => {
    const parsed: Record<string, unknown> = { selectedTitle: C1.title, harmonyPacket: packet(), complementReport: { version: 1, items: [ITEM] } };
    const out = extractHarmonyPacket(parsed);
    expect(out.present).toBe(true);
    expect(out.packet?.titles.chosenId).toBe('c1');
    expect(out.report?.items).toHaveLength(1);
    expect(out.issues).toEqual([]);
    expect('harmonyPacket' in parsed).toBe(false);
    expect('complementReport' in parsed).toBe(false);
    expect(JSON.stringify(parsed)).not.toMatch(/harmonyPacket|complementReport/);
  });

  it('leaves an article without either field untouched', () => {
    const parsed = { selectedTitle: 't', headings: [{ title: 'h' }] };
    const before = JSON.stringify(parsed);
    expect(extractHarmonyPacket(parsed)).toEqual({ present: false, packet: null, report: null, issues: [] });
    expect(JSON.stringify(parsed)).toBe(before);
  });

  it('strips the fields even when they are malformed, and never throws', () => {
    for (const bad of [null, 'text', 42, [], { version: 2 }, { version: 1 }]) {
      const parsed: Record<string, unknown> = { harmonyPacket: bad, complementReport: bad };
      const out = extractHarmonyPacket(parsed);
      expect(out.present).toBe(true);
      expect(out.packet).toBeNull();
      expect(out.report).toBeNull();
      expect(out.issues.length).toBeGreaterThan(0);
      expect(Object.keys(parsed)).toEqual([]);
    }
    for (const notArticle of [null, undefined, 'x', 3, []]) expect(() => extractHarmonyPacket(notArticle)).not.toThrow();
  });

  it('requires exactly the 8 DailyTitleCandidate keys and rejects score fields anywhere', () => {
    expect(titleCandidateKeys).toHaveLength(8);
    const extraKey = { ...C1, score: 91 };
    expect(extractHarmonyPacket({ harmonyPacket: packet({ candidates: [extraKey, C2, C3] }) }).issues[0]).toMatch(/unexpected key score/);
    const { clickReason: _omit, ...missing } = C1;
    expect(extractHarmonyPacket({ harmonyPacket: packet({ candidates: [missing, C2, C3] }) }).issues[0]).toMatch(/missing key clickReason/);
    expect(extractHarmonyPacket({ harmonyPacket: { ...packet(), score: 88 } }).issues[0]).toMatch(/unexpected key score/);
    expect(extractHarmonyPacket({ complementReport: { version: 1, items: [], score: 1 } }).issues[0]).toMatch(/unexpected key score/);
  });

  it('enforces candidate count 3-5, size caps and control characters', () => {
    expect(extractHarmonyPacket({ harmonyPacket: packet({ candidates: [C1, C2] }) }).packet).toBeNull();
    expect(extractHarmonyPacket({ harmonyPacket: packet({ candidates: [C1, C2, C3, { ...C3, id: 'c4' }, { ...C3, id: 'c5' }, { ...C3, id: 'c6' }] }) }).packet).toBeNull();
    const huge = { ...packet(), material: { ...packet().material, centralEvent: 'x'.repeat(HARMONY_LIMITS.short + 1) } };
    expect(extractHarmonyPacket({ harmonyPacket: huge }).issues[0]).toMatch(/centralEvent/);
    const control = { ...packet(), strategy: { ...packet().strategy, angle: 'bad\u0007angle' } };
    expect(extractHarmonyPacket({ harmonyPacket: control }).issues[0]).toMatch(/control character/);
    const oversized = { ...packet(), material: { ...packet().material, notInSource: Array.from({ length: 8 }, () => 'y'.repeat(300)) } };
    const padded = { harmonyPacket: { ...oversized, titles: { ...packet().titles, comparison: 'z'.repeat(1200) } } };
    expect(extractHarmonyPacket(padded).packet).not.toBeNull();
    const tooBig = { harmonyPacket: { ...packet(), titles: { ...packet().titles, candidates: [C1, C2, { ...C3, sourceAnchors: Array.from({ length: 6 }, () => 'a'.repeat(900)), bodyAnchors: Array.from({ length: 6 }, () => 'b'.repeat(900)) }] } } };
    expect(extractHarmonyPacket(tooBig).packet).not.toBeNull();
    const overBudget = { harmonyPacket: { ...packet(), titles: { ...packet().titles, candidates: [1, 2, 3, 4, 5].map(n => ({ ...C1, id: `c${n}`, sourceAnchors: Array.from({ length: 6 }, () => 'a'.repeat(900)), bodyAnchors: Array.from({ length: 6 }, () => 'b'.repeat(900)) })) } } };
    expect(extractHarmonyPacket(overBudget).issues[0]).toMatch(/larger than/);
  });

  it('drops a bad report item but keeps the others; rejects more than 8 items', () => {
    const items = [ITEM, { ...ITEM, kind: 'invented' }, { ...ITEM, instructionQuote: 'short' }, { ...ITEM, rule: 'vibes' }, ITEM];
    const out = extractHarmonyPacket({ complementReport: { version: 1, items } });
    expect(out.report?.items).toHaveLength(2);
    expect(out.issues).toHaveLength(3);
    expect(extractHarmonyPacket({ complementReport: { version: 1, items: Array.from({ length: 9 }, () => ITEM) } }).report).toBeNull();
    expect(extractHarmonyPacket({ complementReport: { version: 1, items: [] } }).report?.items).toEqual([]);
  });

  it('allows an empty otherQuote for gaps but not a too-short non-empty one', () => {
    expect(extractHarmonyPacket({ complementReport: { version: 1, items: [{ ...ITEM, kind: 'gap', otherQuote: '' }] } }).report?.items).toHaveLength(1);
    expect(extractHarmonyPacket({ complementReport: { version: 1, items: [{ ...ITEM, otherQuote: 'tiny' }] } }).report?.items).toHaveLength(0);
  });
});

describe('verifyHarmonyPacket', () => {
  it('passes an honest packet and reports anchor stats, chosen title, payoff position', () => {
    const v = verifyHarmonyPacket({ packet: packet(), report: { version: 1, items: [ITEM] } }, ctx());
    expect(v.candidates.map(c => c.ok)).toEqual([true, true, true]);
    expect(v.sourceAnchors).toEqual({ matched: 3, total: 3 });
    expect(v.bodyAnchors).toEqual({ matched: 3, total: 3 });
    expect(v.chosen).toMatchObject({ found: true, titleMatchesSelected: true, grounded: true });
    expect(v.payoff?.found).toBe(true);
    expect(v.report).toHaveLength(1);
    expect(v.report[0].quoteVerified).toBe(true);
    expect(v.issues).toEqual([]);
  });

  it('flags an invented anchor (92세) that is not in the source', () => {
    const invented = candidate('c1', '92세 배우가 1억 원을 병원에 건넨 이유', '왜 병원이었나', '배우 김모씨(92)는 지난 3일 서울의 한 병원에 1억 원을 기부했다고 밝혔다.', B1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const v = verifyHarmonyPacket({ packet: packet({ candidates: [invented, C2, C3] }), report: null }, ctx());
    warn.mockRestore();
    expect(v.candidates[0]).toMatchObject({ id: 'c1', ok: false, code: 'DAILY_TITLE_EVIDENCE' });
    expect(v.sourceAnchors).toEqual({ matched: 2, total: 3 });
  });

  it('flags a title number that is missing from the body anchors', () => {
    const noNumber = candidate('c1', '70세 배우가 1억 원을 병원에 건넨 이유', '왜 병원이었나', RAW.split('\n')[0], B3);
    const v = verifyHarmonyPacket({ packet: packet({ candidates: [noNumber, C2, C3] }), report: null }, ctx());
    expect(v.candidates[0]).toMatchObject({ ok: false, code: 'DAILY_TITLE_NUMBER' });
  });

  it('flags a price-basis swap (코스 가격 -> 한 잔 가격)', () => {
    const swapped = candidate('c1', '한 잔 9,000원이라는 가격의 비밀', '왜 그 가격인가', RAW.split('\n')[3], B4);
    const v = verifyHarmonyPacket({ packet: packet({ candidates: [swapped, C2, C3] }), report: null }, ctx({ title: swapped.title }));
    expect(v.candidates[0]).toMatchObject({ ok: false, code: 'DAILY_TITLE_PRICE_BASIS' });
    expect(v.chosen?.grounded).toBe(false);
  });

  it('flags a forged quote in a title', () => {
    const forged = candidate('c1', '"모든 걸 걸었다"는 말의 속사정', '무슨 뜻인가', RAW.split('\n')[1], B2);
    const v = verifyHarmonyPacket({ packet: packet({ candidates: [forged, C2, C3] }), report: null }, ctx({ title: forged.title }));
    expect(v.candidates[0]).toMatchObject({ ok: false, code: 'DAILY_TITLE_QUOTE' });
  });

  it('flags duplicate reader questions across candidates (same contract as the outer review)', () => {
    const v = verifyHarmonyPacket({ packet: packet({ candidates: [C1, { ...C3, readerQuestion: C1.readerQuestion }, C2] }), report: null }, ctx());
    expect(v.candidates.filter(c => !c.ok).map(c => c.code)).toEqual(['DAILY_TITLE_DIVERSITY']);
  });

  it('flags a chosen id that is not the selectedTitle, or not among the candidates', () => {
    const mismatch = verifyHarmonyPacket({ packet: packet({ chosenId: 'c2' }), report: null }, ctx());
    expect(mismatch.chosen).toMatchObject({ found: true, titleMatchesSelected: false });
    expect(mismatch.issues).toContain('chosen title differs from selectedTitle');
    const missing = verifyHarmonyPacket({ packet: packet({ chosenId: 'c9' }), report: null }, ctx());
    expect(missing.chosen).toMatchObject({ found: false });
    expect(missing.issues).toContain('chosen id is not among the candidates');
  });

  it('measures the answer sentence position and the two payoff windows', () => {
    const answer = '그가 병원을 고른 이유는 어머니가 그곳에서 치료를 받았기 때문이라고 밝혔다.';
    const at = (pct: number) => {
      const prefix = '가'.repeat(Math.round(pct * 10));
      return `${prefix}${answer}${'나'.repeat(Math.max(0, 1000 - Math.round(pct * 10) - answer.replace(/\s/g, '').length))}`;
    };
    const near = (value: number | null, expected: number) => expect(Math.abs((value ?? 0) - expected)).toBeLessThan(1);
    near(measureAnswerPosition(at(15), answer), 15);
    expect(payoffWindows(15)).toEqual({ inHiddenSubjectWindow: true, inStandardWindow: true });
    expect(payoffWindows(30)).toEqual({ inHiddenSubjectWindow: false, inStandardWindow: true });
    expect(payoffWindows(5)).toEqual({ inHiddenSubjectWindow: false, inStandardWindow: false });
    expect(payoffWindows(50)).toEqual({ inHiddenSubjectWindow: false, inStandardWindow: false });
    expect(payoffWindows(null)).toEqual({ inHiddenSubjectWindow: false, inStandardWindow: false });
    expect(measureAnswerPosition(BODY, '본문에 없는 문장이라서 찾을 수 없다')).toBeNull();

    const late = verifyHarmonyPacket({ packet: packet({ answerSentence: answer }), report: null }, ctx({ body: at(60) }));
    expect(late.payoff).toMatchObject({ found: true, inHiddenSubjectWindow: false, inStandardWindow: false });
    expect(late.issues.some(i => i.startsWith('answer sentence comes late'))).toBe(true);
    const mid = verifyHarmonyPacket({ packet: packet({ answerSentence: answer }), report: null }, ctx({ body: at(25) }));
    expect(mid.payoff).toMatchObject({ found: true, inHiddenSubjectWindow: false, inStandardWindow: true });
    const absent = verifyHarmonyPacket({ packet: packet({ answerSentence: '본문에 없는 문장이라서 찾을 수 없다' }), report: null }, ctx());
    expect(absent.payoff).toMatchObject({ found: false, positionPct: null });
    expect(absent.issues).toContain('answer sentence is not in the body');
  });

  it('marks quoteVerified only when both quotes occur in the task prompt (whitespace ignored)', () => {
    const items: ComplementItem[] = [
      ITEM,
      { ...ITEM, instructionQuote: '제목의   약속은 도입부에서\n첫 답을 준다' },
      { ...ITEM, instructionQuote: '이 문장은 작업 명세에 없다 지어낸 인용' },
      { ...ITEM, otherQuote: '이 문장도 작업 명세에 없다 지어낸 인용' },
      { ...ITEM, kind: 'gap', otherQuote: '' },
    ];
    const v = verifyHarmonyPacket({ packet: null, report: { version: 1, items } }, ctx());
    expect(v.report.map(item => item.quoteVerified)).toEqual([true, true, false, false, true]);
  });

  it('drops report items that promise an effect', () => {
    expect(EFFECT_PROMISE_PATTERN.test('노출이 30% 상승한다')).toBe(true);
    expect(EFFECT_PROMISE_PATTERN.test('클릭 2배 기대')).toBe(true);
    expect(EFFECT_PROMISE_PATTERN.test('유입이 크게 증가')).toBe(true);
    expect(EFFECT_PROMISE_PATTERN.test('소제목 배치를 5개로 맞춤')).toBe(false);
    expect(EFFECT_PROMISE_PATTERN.test('노출 관측은 참고만 하고 제목을 베끼지 않음')).toBe(false);
    const items: ComplementItem[] = [ITEM, { ...ITEM, resolution: '이렇게 하면 노출이 30% 상승한다' }, { ...ITEM, affected: ['클릭 증가'] }];
    const v = verifyHarmonyPacket({ packet: null, report: { version: 1, items } }, ctx());
    expect(v.report).toHaveLength(1);
    expect(v.droppedEffectPromises).toBe(2);
  });

  it('does not drop an item just because the QUOTED instruction mentions an effect', () => {
    const quoted = { ...ITEM, instructionQuote: '노출이 30% 상승한다고 쓰지 않는다 항목', otherQuote: '' };
    const v = verifyHarmonyPacket({ packet: null, report: { version: 1, items: [quoted] } }, ctx({ systemPrompt: '노출이 30% 상승한다고 쓰지 않는다 항목' }));
    expect(v.report).toHaveLength(1);
    expect(v.report[0].quoteVerified).toBe(true);
  });

  it('never throws on garbage input', () => {
    expect(() => verifyHarmonyPacket({ packet: null, report: null }, ctx())).not.toThrow();
    expect(() => verifyHarmonyPacket(undefined as never, undefined as never)).not.toThrow();
    const v = verifyHarmonyPacket({ packet: packet(), report: null }, { rawText: '', body: '', title: '', systemPrompt: '' });
    expect(v.candidates.every(c => !c.ok)).toBe(true);
  });
});

describe('verifyTitleCandidate extraction keeps parseTitleCandidates unchanged', () => {
  const input = { title: C1.title, body: BODY, sourceGrounding: RAW };
  it('still accepts three honest candidates', () => {
    expect(parseTitleCandidates(JSON.stringify({ candidates: [C1, C2, C3] }), input).map(c => c.id)).toEqual(['c1', 'c2', 'c3']);
  });
  it('still rejects the same contract violations with the same codes', () => {
    const code = (candidates: unknown[]) => { try { parseTitleCandidates(JSON.stringify({ candidates }), input); return 'OK'; } catch (e) { return (e as { code: string }).code; } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(code([C1, C2])).toBe('DAILY_TITLE_CONTRACT');
    expect(code([C1, C1, C3])).toBe('DAILY_TITLE_CONTRACT');
    expect(code([C1, { ...C3, readerQuestion: C1.readerQuestion }, C2])).toBe('DAILY_TITLE_DIVERSITY');
    expect(code([{ ...C1, sourceAnchors: ['원문에 없는 문장입니다 정말로'] }, C2, C3])).toBe('DAILY_TITLE_EVIDENCE');
    warn.mockRestore();
  });
});
