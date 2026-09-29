import { describe, expect, it } from 'vitest';

import { auditAttributionVoice, describeAttributionVoice } from '../content/attributionVoiceAudit';

/**
 * Policy: confirmed facts must be stated flat. Only actor-subject attribution is allowed
 * ("소속사 측은 ~라고 밝혔다", "국토교통부 발표에 따르면", "구매자 후기에서 반복해 나온 지적은").
 * Document-as-speaker forms ("~라고 적혀 있습니다", "읽는 편이 맞겠습니다") reveal the writer is
 * relaying a source document instead of stating the fact directly — this audit flags them.
 * LOG-ONLY: no repair, no LLM call, no publish block.
 */

describe('document-speaker forms are flagged', () => {
  it('라고 적혀 있습니다', () => {
    const report = auditAttributionVoice('가격이 3만 원이라고 적혀 있습니다.');
    expect(report.count).toBe(1);
    expect(report.kinds).toEqual(['document-speaker']);
  });

  it('라고 적혀있다 (no space)', () => {
    expect(auditAttributionVoice('가격표에는 3만 원이라고 적혀있다.').count).toBe(1);
  });

  it('라고 적혀 있어요', () => {
    expect(auditAttributionVoice('안내문에 배송비 무료라고 적혀 있어요.').count).toBe(1);
  });

  it('라고 나와 있습니다', () => {
    expect(auditAttributionVoice('택배 안내문에는 배송비 3천원이라고 나와 있습니다.').count).toBe(1);
  });

  it('라고 나와있다', () => {
    expect(auditAttributionVoice('공지에는 마감일이 10월 5일이라고 나와있다.').count).toBe(1);
  });

  it('라고 안내되어 있습니다', () => {
    expect(auditAttributionVoice('공지에는 마감일이 10월 5일이라고 안내되어 있습니다.').count).toBe(1);
  });

  it('라고 되어 있습니다', () => {
    expect(auditAttributionVoice('약관에는 환불이 불가라고 되어 있습니다.').count).toBe(1);
  });

  it('고 적혀 있 (bare)', () => {
    expect(auditAttributionVoice('메모지에 오늘 휴무라고 적혀 있다.').count).toBe(1);
  });

  it('라고 쓰여 있', () => {
    expect(auditAttributionVoice('메뉴판에는 오늘의 특선이라고 쓰여 있다.').count).toBe(1);
  });

  it('라고 명시되어 있습니다', () => {
    expect(auditAttributionVoice('약관에는 환불이 불가라고 명시되어 있습니다.').count).toBe(1);
  });

  it('라고 표기되어 있', () => {
    expect(auditAttributionVoice('가격표에는 3,280만원이라고 표기되어 있다.').count).toBe(1);
  });

  it('본문에는 ~라고', () => {
    const report = auditAttributionVoice('본문에는 환불 조건이 까다롭다고 설명한다.');
    expect(report.count).toBe(1);
    expect(report.kinds).toEqual(['document-speaker']);
  });

  it('해당 보도는 ~라고 전했다', () => {
    expect(auditAttributionVoice('해당 보도는 사망자가 3명이라고 전했다.').count).toBe(1);
  });

  it('해당 기사는 ~라고 전한다', () => {
    expect(auditAttributionVoice('해당 기사는 원인이 불명확하다고 전한다.').count).toBe(1);
  });

  it('기사에 따르면', () => {
    expect(auditAttributionVoice('기사에 따르면 사고 원인은 조사 중이다.').count).toBe(1);
  });

  it('자료에 따르면', () => {
    expect(auditAttributionVoice('자료에 따르면 이용자가 급증했다.').count).toBe(1);
  });

  it('공지에 따르면', () => {
    expect(auditAttributionVoice('공지에 따르면 접수가 마감됐다.').count).toBe(1);
  });

  it('안내문에 따르면', () => {
    expect(auditAttributionVoice('안내문에 따르면 주차는 불가하다.').count).toBe(1);
  });

  it('원문에 따르면', () => {
    expect(auditAttributionVoice('원문에 따르면 발표 시점이 다르다.').count).toBe(1);
  });

  it('보도 내용에 따르면', () => {
    expect(auditAttributionVoice('보도 내용에 따르면 피해 규모가 크다.').count).toBe(1);
  });

  it('기사를 보면', () => {
    expect(auditAttributionVoice('기사를 보면 세부 내용이 나온다.').count).toBe(1);
  });

  it('자료를 보면', () => {
    expect(auditAttributionVoice('자료를 보면 수치가 다르다.').count).toBe(1);
  });

  it('원문을 읽어보면', () => {
    expect(auditAttributionVoice('원문을 읽어보면 맥락이 분명하다.').count).toBe(1);
  });

  it('원문을 보면', () => {
    expect(auditAttributionVoice('원문을 보면 다른 해석이 가능하다.').count).toBe(1);
  });

  it('내용을 확인해보면', () => {
    expect(auditAttributionVoice('내용을 확인해보면 차이가 있다.').count).toBe(1);
  });
});

describe('reading-advice forms are flagged', () => {
  it('읽는 편이 맞겠습니다', () => {
    const report = auditAttributionVoice('원문을 직접 읽는 편이 맞겠습니다.');
    expect(report.count).toBe(1);
    expect(report.kinds).toEqual(['reading-advice']);
  });

  it('읽어 보는 편이 좋겠다', () => {
    expect(auditAttributionVoice('자료를 직접 읽어 보는 편이 좋겠다.').count).toBe(1);
  });

  it('참고하는 편이 맞겠습니다', () => {
    expect(auditAttributionVoice('공식 발표를 참고하는 편이 맞겠습니다.').count).toBe(1);
  });

  it('확인해 보시는 편이 좋습니다', () => {
    expect(auditAttributionVoice('세부 내용은 직접 확인해 보시는 편이 좋습니다.').count).toBe(1);
  });

  it('원문을 참고하시기 바랍니다', () => {
    expect(auditAttributionVoice('원문을 참고하시기 바랍니다.').count).toBe(1);
  });

  it('직접 확인해 보시기 바랍니다', () => {
    expect(auditAttributionVoice('직접 확인해 보시기 바랍니다.').count).toBe(1);
  });
});

describe('source-relay forms are flagged', () => {
  it('라고 전해집니다', () => {
    const report = auditAttributionVoice('업계에서는 신제품 출시가 임박했다고 전해집니다.');
    expect(report.count).toBe(1);
    expect(report.kinds).toEqual(['source-relay']);
  });

  it('라고 알려져 있습니다', () => {
    expect(auditAttributionVoice('소문에는 배우 캐스팅이 확정됐다고 알려져 있습니다.').count).toBe(1);
  });

  it('라고 소개되어 있습니다', () => {
    expect(auditAttributionVoice('홈페이지에는 이 제품이 베스트셀러라고 소개되어 있습니다.').count).toBe(1);
  });

  it('로 소개됐다', () => {
    expect(auditAttributionVoice('이 제품은 올해의 혁신상으로 소개됐다.').count).toBe(1);
  });

  it('라고 언급되어 있다', () => {
    expect(auditAttributionVoice('공지에는 후속 이벤트가 예정되어 있다고 언급되어 있다.').count).toBe(1);
  });
});

describe('actor-subject attribution and flat facts are NOT flagged', () => {
  const CLEAN_SENTENCES = [
    '소속사 측은 11월 복귀설을 확인해 준 바 없다고 밝혔다.',
    '국토교통부 발표에 따르면 청약통장 금리는 2.8%로 오른다.',
    '기아 공식 가격표 기준 시작가는 3,280만 원이다.',
    '구매자 후기에서 반복해 나온 지적은 설치 안내였다.',
    '티빙은 11월 30일 편성을 확정하지 않았다.',
    'A씨의 법률대리인은 사실무근이라고 밝혔다.',
    '청약통장 금리가 2.8%로 오른다.',
    '저는 이 제품을 두 달째 쓰고 있어요.',
    '설명서를 읽는 데 10분이 걸렸다.',
    'tvN 관계자는 확정된 바 없다고 전했다.',
    // Writer's own advice / ordinary state — not document voice.
    '가족이 넷 이상이면 대용량을 사는 편이 좋다.',
    '지금 계약하는 편이 낫겠습니다.',
    '거치대가 벽에 잘 고정되어 있어서 흔들림이 없다.',
  ];

  it.each(CLEAN_SENTENCES)('flags nothing: %s', (sentence) => {
    expect(auditAttributionVoice(sentence).count).toBe(0);
  });
});

describe('aggregation, dedupe, and formatting', () => {
  it('counts and aggregates kinds across a mixed body', () => {
    const body = [
      '가격이 3만 원이라고 적혀 있습니다.',
      '원문을 참고하시기 바랍니다.',
      '업계에서는 신제품 출시가 임박했다고 전해집니다.',
    ].join(' ');
    const report = auditAttributionVoice(body);
    expect(report.count).toBe(3);
    expect(report.kinds).toEqual(
      expect.arrayContaining(['document-speaker', 'reading-advice', 'source-relay']),
    );
    expect(report.kinds).toHaveLength(3);
  });

  it('dedupes identical sentence+kind pairs', () => {
    const sentence = '가격이 3만 원이라고 적혀 있습니다.';
    const body = `${sentence} ${sentence}`;
    const report = auditAttributionVoice(body);
    expect(report.count).toBe(1);
  });

  it('strips HTML tags before scanning', () => {
    const report = auditAttributionVoice('<p>가격이 3만 원이라고 적혀 있습니다.</p>');
    expect(report.count).toBe(1);
    expect(report.hits[0].kind).toBe('document-speaker');
  });

  it('handles empty/undefined input without throwing', () => {
    expect(auditAttributionVoice('').count).toBe(0);
    expect(describeAttributionVoice(auditAttributionVoice(''))).toBe('');
    expect(() => auditAttributionVoice(undefined as unknown as string)).not.toThrow();
    expect(auditAttributionVoice(undefined as unknown as string).count).toBe(0);
  });

  it('describes zero hits as an empty string', () => {
    const report = auditAttributionVoice('청약통장 금리가 2.8%로 오른다.');
    expect(describeAttributionVoice(report)).toBe('');
  });

  it('reports at most 5 sentences even when more are found', () => {
    const sentences = [
      '가격이 3만 원이라고 적혀 있습니다.',
      '공지에는 마감일이 10월 5일이라고 안내되어 있습니다.',
      '메뉴판에는 오늘의 특선이라고 쓰여 있다.',
      '기사에 따르면 사고 원인은 조사 중이다.',
      '자료를 보면 수치가 다르다.',
      '원문을 보면 다른 해석이 가능하다.',
      '내용을 확인해보면 차이가 있다.',
    ];
    const report = auditAttributionVoice(sentences.join(' '));
    expect(report.count).toBe(sentences.length);
    const description = describeAttributionVoice(report);
    const quoteCount = (description.match(/"/g) || []).length / 2;
    expect(quoteCount).toBe(5);
  });

  it('truncates long sentences in the description to 120 chars', () => {
    const longFiller = '아'.repeat(150);
    const sentence = `${longFiller} 가격이 3만 원이라고 적혀 있습니다.`;
    const report = auditAttributionVoice(sentence);
    const description = describeAttributionVoice(report);
    expect(description).toContain('…');
    const quoted = description.match(/"([^"]*)"/);
    expect(quoted).not.toBeNull();
    expect((quoted as RegExpMatchArray)[1].length).toBeLessThanOrEqual(121);
  });

  it('includes the total count in the description', () => {
    const report = auditAttributionVoice('가격이 3만 원이라고 적혀 있습니다.');
    const description = describeAttributionVoice(report);
    expect(description).toMatch(/1/);
  });
});
