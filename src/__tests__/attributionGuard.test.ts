import { describe, expect, it } from 'vitest';
import { classifyAttributions, extractAttributions } from '../content/attributionGuard';

describe('extractAttributions', () => {
  it('detects a named attribution with 발표에 따르면 marker', () => {
    const attrs = extractAttributions('보건복지부 발표에 따르면 월 30만원을 지원한다.');
    expect(attrs.length).toBeGreaterThan(0);
    const hit = attrs.find((a) => a.orgName === '보건복지부');
    expect(hit).toBeDefined();
    expect(hit!.kind).toBe('named');
    expect(hit!.phrase).toContain('보건복지부');
  });

  it('detects a named attribution with 관계자는 marker', () => {
    const attrs = extractAttributions('금융위원회 관계자는 내년부터 시행한다고 밝혔다.');
    const hit = attrs.find((a) => a.orgName === '금융위원회');
    expect(hit).toBeDefined();
    expect(hit!.kind).toBe('named');
  });

  it('classifies source-less phrases as generic with no orgName', () => {
    const attrs = extractAttributions('기사에 따르면 내용이 바뀌었다.');
    expect(attrs.length).toBe(1);
    expect(attrs[0].kind).toBe('generic');
    expect(attrs[0].orgName).toBeNull();
  });

  it('returns an empty list for text with no attribution phrases', () => {
    expect(extractAttributions('오늘은 날씨가 맑았다.')).toEqual([]);
    expect(extractAttributions('')).toEqual([]);
  });

  // [2026-09-22 live] "겹쳐서 기준이 섞여" was read as org="겹쳐서" and stripped from a normal
  // sentence. Bare "<X> 기준/자료" is ordinary prose; only the explicit tail form is an attribution.
  it('does not treat bare "<X> 기준/자료" prose as an attribution', () => {
    const prose = '이름도 비슷하고 대상 나이도 겹쳐서 기준이 섞여 보이기 쉽다. 가입일 기준 만 19~34세, 총급여 기준 7,500만 원 이하. 소득 자료 준비.';
    expect(extractAttributions(prose)).toEqual([]);
    const tailed = extractAttributions('금융위원회 자료에 따르면 대상이 늘었다. 기아 공식 가격표 기준 3,200만 원이다.');
    expect(tailed.map((a) => a.orgName)).toEqual(['금융위원회', '기아']);
  });
});

describe('classifyAttributions', () => {
  it('marks a named attribution as supported when the org name is in evidence.sourceNames', () => {
    const { supported, unsupported } = classifyAttributions(
      '보건복지부 발표에 따르면 월 30만원을 지원한다.',
      { sourceNames: ['보건복지부'], corpus: '' },
    );
    expect(unsupported).toEqual([]);
    expect(supported.length).toBe(1);
    expect(supported[0].orgName).toBe('보건복지부');
  });

  it('marks a named attribution as unsupported when the org is absent from evidence', () => {
    const { supported, unsupported } = classifyAttributions(
      '금융위원회 관계자는 내년부터 시행한다고 밝혔다.',
      { sourceNames: ['국토교통부'], corpus: '주택 공급 정책 관련 자료' },
    );
    expect(supported).toEqual([]);
    expect(unsupported.length).toBe(1);
    expect(unsupported[0].orgName).toBe('금융위원회');
  });

  it('marks a generic attribution as supported when evidence.corpus is non-empty', () => {
    const { supported, unsupported } = classifyAttributions(
      '기사에 따르면 내용이 바뀌었다.',
      { sourceNames: [], corpus: '실제 수집된 자료 원문 일부' },
    );
    expect(unsupported).toEqual([]);
    expect(supported.length).toBe(1);
    expect(supported[0].kind).toBe('generic');
  });

  it('marks a generic attribution as unsupported when there is no corpus at all', () => {
    const { supported, unsupported } = classifyAttributions(
      '기사에 따르면 내용이 바뀌었다.',
      { sourceNames: [], corpus: '' },
    );
    expect(supported).toEqual([]);
    expect(unsupported.length).toBe(1);
  });

  it('matches org names via a 2-4 char Hangul prefix when evidence uses a longer form', () => {
    const { supported } = classifyAttributions(
      '국민건강보험공단에 따르면 보험료가 달라진다.',
      { sourceNames: [], corpus: '이번 국민건강보험공단 발표 자료에 따르면 기준이 개정됐다.' },
    );
    expect(supported.length).toBe(1);
  });
});
