import { describe, expect, it } from 'vitest';
import { buildFactVerificationReport } from '../content/factVerificationReport';

const source = `경기도 A시는 1인당 25만원을 지역화폐로 지급한다. 신청 기간은 9월 7일부터 10월 2일까지다. ${'상세 안내 '.repeat(120)}`;

describe('factVerificationReport', () => {
  it('skips when there is no material to compare against', () => {
    const report = buildFactVerificationReport('본문입니다.', '짧은 자료');
    expect(report.checked).toBe(false);
    expect(report.summaryLine).toBe('');
  });

  it('reports a clean article with no issues', () => {
    const report = buildFactVerificationReport('A시는 1인당 25만원을 9월 7일부터 지급한다.', source);
    expect(report.checked).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.summaryLine).toContain('확인 필요 0건');
  });

  it('flags relative dates, unsupported quantifiers and invented outlooks', () => {
    const body = '전국 모든 지자체가 이달 말까지 신청을 받는다. 소비 진작을 노린 것으로 보인다.';
    const report = buildFactVerificationReport(body, source);
    const kinds = report.issues.map((i) => i.kind);
    expect(kinds).toContain('RELATIVE_DATE');
    expect(kinds).toContain('UNGROUNDED_QUANTIFIER');
    expect(kinds).toContain('SPECULATION');
    expect(report.summaryLine).toContain('확인 필요');
  });

  it('flags a number the material does not contain', () => {
    const report = buildFactVerificationReport('1인당 40만원을 지급한다.', source);
    expect(report.issues.map((i) => i.kind)).toContain('UNGROUNDED_NUMBER');
  });

  it('never produces a body footer — the summary is report-only text', () => {
    const report = buildFactVerificationReport('전국 모든 곳에서 받는다.', source);
    expect(report.summaryLine.startsWith('✅')).toBe(false);
    expect(report.summaryLine).not.toContain('출처:');
  });
});

describe('factVerificationReport — 2026-08-28 실측 결함', () => {
  const material = `스트레이 키즈는 8월 29일과 30일 도쿄 국립경기장에서 공연한다. ${'상세 안내 '.repeat(120)}`;

  it('flags a day written without its month', () => {
    const report = buildFactVerificationReport('23일 0시 포스터가 공개됐습니다.', material);
    const issue = report.issues.find((i) => i.kind === 'DAY_WITHOUT_MONTH');
    expect(issue?.examples).toContain('23일');
  });

  it('accepts a day that a month already governs in the same sentence', () => {
    const report = buildFactVerificationReport('9월 5일과 6일 나고야 공연이 이어집니다.', material);
    expect(report.issues.map((i) => i.kind)).not.toContain('DAY_WITHOUT_MONTH');
  });

  it('does not mistake a duration for a date', () => {
    const report = buildFactVerificationReport('30일간 진행되고 3일째 이어집니다.', material);
    expect(report.issues.map((i) => i.kind)).not.toContain('DAY_WITHOUT_MONTH');
  });

  it('flags narrating unverified material to the reader', () => {
    const body = '2025년 10월과 관련한 언급도 자료에 함께 나오는데, 공식 공지에서 확인하시는 편이 확실해요.';
    const report = buildFactVerificationReport(body, material);
    expect(report.issues.map((i) => i.kind)).toContain('UNVERIFIED_NARRATION');
  });

  it('leaves a clean sentence with a full date alone', () => {
    const report = buildFactVerificationReport('8월 29일과 30일 도쿄 국립경기장에서 공연합니다.', material);
    expect(report.issues).toHaveLength(0);
  });
});
