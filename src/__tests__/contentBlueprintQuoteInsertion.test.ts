/** SPEC-BLUEPRINT-2026 Phase 3 — 인용 삽입 보정 계약: 발언 원문은 글자 단위로 지켜져야만 들어간다. */
import { describe, expect, it } from 'vitest';
import { applyQuoteInsertions, buildQuoteInsertionPrompt, runQuoteInsertionPatch } from '../content/blueprint/quoteInsertionPatch';

const HEADINGS = [
  { title: '지원 대상 조건', content: '만 19세부터 34세까지 무주택 청년이 대상이다.\n\n소득 기준은 중위소득 60% 이하다.' },
  { title: '신청 방법', content: '복지로 누리집 또는 주민센터에서 신청한다.' },
];
const QUOTES = [
  { text: '접수 첫 주에는 복지로 사이트 접속이 몰리니 오후 시간대를 권한다', speaker: '담당자' },
  { text: '서류는 온라인으로 다 낼 수 있다', speaker: '' },
];

describe('buildQuoteInsertionPrompt', () => {
  it('문단 번호·발언 목록·형식을 담는다', () => {
    const p = buildQuoteInsertionPrompt({ headings: HEADINGS, quotes: QUOTES });
    expect(p).toContain('[0] 지원 대상 조건');
    expect(p).toContain('(1) 소득 기준은 중위소득 60% 이하다.');
    expect(p).toContain('0. "접수 첫 주에는 복지로 사이트 접속이 몰리니 오후 시간대를 권한다" — 담당자');
    expect(p).toContain('한 글자도 바꾸지 않고');
    expect(p).toContain('{"insertions":[');
  });
});

describe('applyQuoteInsertions', () => {
  it('원문 그대로 든 문장만 지정 문단 뒤에 새 문단으로 넣는다', () => {
    const raw = JSON.stringify({ insertions: [
      { quote: 0, heading: 1, afterParagraph: 0, sentence: '담당자는 "접수 첫 주에는 복지로 사이트 접속이 몰리니 오후 시간대를 권한다"고 말했다.' },
    ] });
    const r = applyQuoteInsertions({ headings: HEADINGS, quotes: QUOTES }, raw);
    expect(r.inserted).toBe(1);
    expect(r.headings[1].content.split('\n\n')).toEqual([
      '복지로 누리집 또는 주민센터에서 신청한다.',
      '담당자는 "접수 첫 주에는 복지로 사이트 접속이 몰리니 오후 시간대를 권한다"고 말했다.',
    ]);
    expect(r.headings[0].content).toBe(HEADINGS[0].content);
  });

  it('발언을 바꿔 쓰거나, 없는 소제목이거나, 연결이 너무 길면 버린다 · 같은 발언 두 번 금지 · 최대 2개', () => {
    const long = '담당자는 "' + QUOTES[0].text + '"고 ' + '설명을 아주 길게 덧붙였다. '.repeat(12);
    const raw = JSON.stringify({ insertions: [
      { quote: 0, heading: 0, afterParagraph: 0, sentence: '담당자는 "접수 첫 주에는 복지로 접속이 몰리니 오후를 권한다"고 말했다.' },
      { quote: 0, heading: 5, afterParagraph: 0, sentence: '담당자는 "' + QUOTES[0].text + '"고 말했다.' },
      { quote: 0, heading: 0, afterParagraph: 0, sentence: long },
      { quote: 1, heading: 0, afterParagraph: 1, sentence: '안내문에는 “서류는 온라인으로 다 낼 수 있다”고 적혀 있다.' },
      { quote: 1, heading: 1, afterParagraph: 0, sentence: '“서류는 온라인으로 다 낼 수 있다”는 말도 있다.' },
      { quote: 0, heading: 1, afterParagraph: 0, sentence: '담당자는 "' + QUOTES[0].text + '"고 말했다.' },
      { quote: 0, heading: 1, afterParagraph: 0, sentence: '담당자는 "' + QUOTES[0].text + '"고 말했다.' },
    ] });
    const r = applyQuoteInsertions({ headings: HEADINGS, quotes: QUOTES }, raw);
    expect(r.inserted).toBe(2);
    expect(r.headings[0].content).toContain('안내문에는 "서류는 온라인으로 다 낼 수 있다"고 적혀 있다.');
    expect(r.headings[1].content).toContain('담당자는 "' + QUOTES[0].text + '"고 말했다.');
    expect(r.headings[1].content).not.toContain('는 말도 있다');
  });

  it('JSON 이 아니면 parsed=false, 빈 insertions 는 0', () => {
    expect(applyQuoteInsertions({ headings: HEADINGS, quotes: QUOTES }, '못 넣겠습니다').parsed).toBe(false);
    expect(applyQuoteInsertions({ headings: HEADINGS, quotes: QUOTES }, '{"insertions":[]}').inserted).toBe(0);
  });
});

describe('runQuoteInsertionPatch', () => {
  it('정상 응답은 ok, 해석 불가·거부·타임아웃은 원본 그대로 돌려준다', async () => {
    const ok = await runQuoteInsertionPatch({ headings: HEADINGS, quotes: QUOTES }, { complete: async (_p, o) => {
      expect(o?.maxTokens).toBe(1024);
      return JSON.stringify({ insertions: [{ quote: 1, heading: 1, afterParagraph: 0, sentence: '"서류는 온라인으로 다 낼 수 있다"는 안내도 있다.' }] });
    } });
    expect(ok.reason).toBe('ok');
    expect(ok.inserted).toBe(1);
    const bad = await runQuoteInsertionPatch({ headings: HEADINGS, quotes: QUOTES }, { complete: async () => 'no json' });
    expect(bad).toMatchObject({ reason: 'unparsable', inserted: 0 });
    expect(bad.headings).toEqual(HEADINGS);
    const rejected = await runQuoteInsertionPatch({ headings: HEADINGS, quotes: QUOTES }, { complete: async () => '{"insertions":[{"quote":0,"heading":0,"afterParagraph":0,"sentence":"발언을 바꿨다"}]}' });
    expect(rejected.reason).toBe('rejected');
    const timeout = await runQuoteInsertionPatch({ headings: HEADINGS, quotes: QUOTES }, { complete: () => new Promise(() => undefined), timeoutMs: 20 });
    expect(timeout.reason).toBe('timeout');
    const empty = await runQuoteInsertionPatch({ headings: HEADINGS, quotes: [] }, { complete: async () => '' });
    expect(empty.reason).toBe('no-input');
  });
});
