import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { auditTitleQuote, describeTitleQuote } from '../content/titleQuoteAudit';

/**
 * [2026-09-30] Title quote / demand-word audit (log-only).
 *
 * Source of the rules: the owner's hand-built 홈판 guideline (K02_TITLE §3/§8, K06 §2).
 *   - Quotation marks in a title may wrap only (A) an utterance that exists in the material
 *     or (B) a reader reaction ending in "?". A declarative sentence the writer made up and
 *     wrapped in quotes to look like speech is banned.
 *   - Titles that only *demand* curiosity ("눈길 간 건 따로", "먼저 봐야 할 게", "알려진 건
 *     여기까지") without a scene, condition or payoff were rejected by the owner repeatedly.
 *
 * The app's own 2,093-title measurement says quotes lift 홈판 1.28x but 44% of 홈판 titles
 * carry none, so this audit never requires a quote — it only reports fake ones.
 */

const SOURCE = [
  '뉴진스 멤버 민지는 인터뷰에서 "민지까지 다시 손잡았는데 아직 확정된 일정은 없다"고 말했다.',
  '이서진은 손예진을 보자마자 "예뻐서 놀랐다"고 했다.',
  '소속사 측은 "양측이 논의 중"이라고 밝혔다.',
].join('\n');

describe('titleQuoteAudit — fake declarative quote (K02 §3 A/B)', () => {
  it('flags a declarative quote that is not in the material', () => {
    const report = auditTitleQuote({
      title: '"이제는 돌아갈 수 없다" 뉴진스 4명, 그 뒤가 예상과 달랐다',
      sourceText: SOURCE,
    });
    expect(report.hits.map((h) => h.kind)).toContain('fabricated-quote');
    expect(report.hits[0].match).toBe('이제는 돌아갈 수 없다');
  });

  it('passes an utterance that exists in the material (A형)', () => {
    const report = auditTitleQuote({
      title: '"민지까지 다시 손잡았는데…" 2년 만에 모인 뉴진스 4명',
      sourceText: SOURCE,
    });
    expect(report.hits.filter((h) => h.kind === 'fabricated-quote')).toEqual([]);
  });

  it('passes a lightly paraphrased utterance (particles dropped, ellipsis added)', () => {
    const report = auditTitleQuote({
      title: '"양측 논의 중…" 소속사가 선을 그은 이유',
      sourceText: SOURCE,
    });
    expect(report.hits.filter((h) => h.kind === 'fabricated-quote')).toEqual([]);
  });

  it('passes a reader-reaction question in quotes (B형) even when absent from the material', () => {
    const report = auditTitleQuote({
      title: '"이게 진짜 가능해?" 청년도약계좌 중도해지 조건',
      sourceText: SOURCE,
    });
    expect(report.hits.filter((h) => h.kind === 'fabricated-quote')).toEqual([]);
  });

  it('does not judge quotes when no material is available', () => {
    const report = auditTitleQuote({ title: '"이제는 돌아갈 수 없다" 뉴진스 4명', sourceText: '' });
    expect(report.hits.filter((h) => h.kind === 'fabricated-quote')).toEqual([]);
  });

  it('handles curly and single quotes', () => {
    const curly = auditTitleQuote({ title: '“이제는 돌아갈 수 없다” 뉴진스 4명', sourceText: SOURCE });
    const single = auditTitleQuote({ title: "'이제는 돌아갈 수 없다' 뉴진스 4명", sourceText: SOURCE });
    expect(curly.hits.map((h) => h.kind)).toContain('fabricated-quote');
    expect(single.hits.map((h) => h.kind)).toContain('fabricated-quote');
  });

  it('ignores short emphasis quotes that are not sentences', () => {
    const report = auditTitleQuote({ title: "손예진 '그 눈빛' 하나에 촬영장이 멈춘 이유", sourceText: SOURCE });
    expect(report.hits.filter((h) => h.kind === 'fabricated-quote')).toEqual([]);
  });

  it('ignores apostrophes inside words', () => {
    const report = auditTitleQuote({ title: "McDonald's 신메뉴, 점심시간에 줄 선 이유", sourceText: SOURCE });
    expect(report.hits).toEqual([]);
  });
});

describe('titleQuoteAudit — demand-only titles (K02 §8 실제 거절 제목)', () => {
  const REJECTED = [
    '효민 남편 공개되자 더 궁금해진 직업, 알려진 건 여기까지였다',
    '효민이 남편 얘기하며 꺼낸 한마디…직업보다 더 눈길 간 건 따로 있었다',
    '함평 꽃무릇축제 이번 주 갈까? 날짜보다 먼저 봐야 할 게 있었다',
  ];

  it.each(REJECTED)('flags: %s', (title) => {
    const report = auditTitleQuote({ title, sourceText: '' });
    expect(report.hits.map((h) => h.kind)).toContain('demand-only');
  });

  it('flags the K06 §2 phrasings verbatim', () => {
    for (const title of ['직업보다 눈길 간 건 따로', '날짜보다 먼저 봐야 할 것', '알려진 건 여기까지']) {
      expect(auditTitleQuote({ title, sourceText: '' }).hits.map((h) => h.kind), title).toContain('demand-only');
    }
  });

  it('does not flag titles that carry the actual scene, condition or payoff', () => {
    const fine = [
      '함평 꽃무릇축제, 해설은 밤 10시 끝나는데 셔틀 막차는 9시 40분',
      '2026 추석 기차표 예매, 올해는 앱 접속 순번이 아니라 사전 추첨이다',
      '청년도약계좌 5년 채우면 5,000만 원, 3년 차 해지하면 이자만 남는다',
      '"예뻐서 놀랐다" 이서진이 손예진 보자마자 한 말',
      '따로 살던 부모님과 합가 6개월, 생활비가 달라진 지점',
    ];
    for (const title of fine) {
      expect(auditTitleQuote({ title, sourceText: SOURCE }).hits, title).toEqual([]);
    }
  });
});

describe('titleQuoteAudit — candidates and description', () => {
  it('audits every candidate and reports which one hit', () => {
    const report = auditTitleQuote({
      title: '"예뻐서 놀랐다" 이서진이 손예진 보자마자 한 말',
      candidates: ['"이제는 돌아갈 수 없다" 뉴진스 4명', '알려진 건 여기까지였다, 효민 남편 직업'],
      sourceText: SOURCE,
    });
    expect(report.hits.map((h) => [h.kind, h.slot])).toEqual([
      ['fabricated-quote', 'candidate#1'],
      ['demand-only', 'candidate#2'],
    ]);
  });

  it('describes hits in one warn line and stays silent when clean', () => {
    const clean = auditTitleQuote({ title: '"예뻐서 놀랐다" 이서진이 손예진 보자마자 한 말', sourceText: SOURCE });
    expect(describeTitleQuote(clean)).toBe('');

    const dirty = auditTitleQuote({ title: '"이제는 돌아갈 수 없다" 뉴진스 4명', sourceText: SOURCE });
    const line = describeTitleQuote(dirty);
    expect(line).toMatch(/^\[TitleQuote\] ⚠️ /);
    expect(line).toContain('fabricated-quote');
    expect(line).toContain('이제는 돌아갈 수 없다');
  });
});

describe('titleQuoteAudit — wiring and prompt', () => {
  it('contentGenerator logs the audit once per finalized draft (record only)', () => {
    const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
    expect(generator).toMatch(/from '\.\/content\/titleQuoteAudit\.js'/);
    expect(generator).toMatch(/describeTitleQuote\(auditTitleQuote\(/);
  });

  it('the shared title contract carries the three K02 rules without contradicting category prompts', () => {
    const contract = readFileSync(
      new URL('../prompts/title/shared/title-final-contract.prompt', import.meta.url), 'utf8',
    );
    expect(contract).toMatch(/따옴표/);
    expect(contract).toMatch(/물음표로 끝나는 독자 반응/);
    expect(contract).toMatch(/앞 15자/);
    expect(contract).toMatch(/눈길 간 건 따로/);
    expect(contract).toMatch(/충돌하는 지시는 없다/);
    // The contract must not turn the quote device into a requirement — 44% of 홈판 titles carry none.
    expect(contract).not.toMatch(/따옴표(?:로|를)\s*(?:반드시|필수)/);
  });
});
