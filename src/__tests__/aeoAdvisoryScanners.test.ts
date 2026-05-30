import { describe, it, expect } from 'vitest';
import { scanComparisonBlocks } from '../validators/seo/comparisonBlockScanner';
import { scanSourceFooter } from '../validators/seo/sourceFooterScanner';
import { scanImageRatio } from '../validators/seo/imageRatioScanner';
import { scanCuriosityHooks } from '../validators/seo/curiosityHookScanner';
import { scanH2QuestionRatio } from '../validators/seo/h2QuestionRatioScanner';
import type { CheckableContent } from '../contentQualityChecker';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SPEC-AEO-EXPOSURE-2026 R1 — advisory (soft-score) scanners.
// 측정만 한다. 강제(hard gate) 아님 — 발행 파이프라인 미연결.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scanComparisonBlocks', () => {
  it('detects a markdown table via its separator row', () => {
    const body = '도입\n\n| 항목 | A | B |\n| --- | --- | --- |\n| 가격 | 1 | 2 |\n';
    const r = scanComparisonBlocks(body);
    expect(r.tableCount).toBe(1);
    expect(r.hasAny).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });

  it('detects an HTML table', () => {
    expect(scanComparisonBlocks('<table><tr><td>a</td></tr></table>').tableCount).toBe(1);
  });

  it('counts a bullet list as one group', () => {
    const body = '설명\n\n- 첫째\n- 둘째\n- 셋째\n\n마무리';
    const r = scanComparisonBlocks(body);
    expect(r.listCount).toBe(1);
    expect(r.hasAny).toBe(true);
  });

  it('counts checklist markers', () => {
    const r = scanComparisonBlocks('준비물\n✅ 신분증\n✅ 통장');
    expect(r.checklistCount).toBe(2);
    expect(r.hasAny).toBe(true);
  });

  it('warns (advisory) when no comparison structure exists', () => {
    const r = scanComparisonBlocks('그냥 평범한 줄글 문단입니다. 표도 목록도 없습니다.');
    expect(r.hasAny).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('scanSourceFooter', () => {
  it('detects a source token in the conclusion', () => {
    const content: CheckableContent = { conclusion: '출처: 정부24 공식 안내입니다.' };
    const r = scanSourceFooter(content);
    expect(r.hasSourceFooter).toBe(true);
    expect(r.matchedTokens).toContain('출처');
  });

  it('falls back to the last heading body when no conclusion', () => {
    const content: CheckableContent = {
      headings: [
        { title: '본론', body: '내용이 이어집니다.' },
        { title: '정리', body: '자세한 기준은 보건복지부 자료를 참고하세요.' },
      ],
    };
    expect(scanSourceFooter(content).hasSourceFooter).toBe(true);
  });

  it('warns when no source footer present', () => {
    const content: CheckableContent = { conclusion: '오늘은 여기까지입니다. 다음에 또 만나요.' };
    const r = scanSourceFooter(content);
    expect(r.hasSourceFooter).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('scanImageRatio', () => {
  const sixParagraphs = ['가', '나', '다', '라', '마', '바'].join('\n\n');

  it('meets the recommended ratio at ~1 image per 3 paragraphs', () => {
    const r = scanImageRatio(sixParagraphs, 2);
    expect(r.paragraphCount).toBe(6);
    expect(r.ratio).toBeCloseTo(1 / 3, 5);
    expect(r.meetsRecommended).toBe(true);
  });

  it('warns when there are no images', () => {
    const r = scanImageRatio(sixParagraphs, 0);
    expect(r.ratio).toBe(0);
    expect(r.meetsRecommended).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('does not divide by zero on empty body', () => {
    const r = scanImageRatio('', 0);
    expect(r.paragraphCount).toBe(0);
    expect(Number.isFinite(r.ratio)).toBe(true);
  });
});

describe('scanCuriosityHooks', () => {
  it('counts connective hooks and meets the minimum at 2', () => {
    const r = scanCuriosityHooks('그런데 여기서 끝이 아닙니다. 하지만 주의할 점도 있어요.');
    expect(r.hookCount).toBeGreaterThanOrEqual(2);
    expect(r.meetsRecommended).toBe(true);
  });

  it('warns when fewer than the minimum hooks', () => {
    const r = scanCuriosityHooks('담백하게 사실만 나열하는 문단입니다.');
    expect(r.hookCount).toBeLessThan(2);
    expect(r.meetsRecommended).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('scanH2QuestionRatio', () => {
  it('computes the ratio and meets the 60% threshold', () => {
    const content: CheckableContent = {
      headings: [
        { title: '신청 방법은?' },
        { title: '얼마나 받을 수 있나요?' },
        { title: '대상 정리' },
      ],
    };
    const r = scanH2QuestionRatio(content);
    expect(r.totalHeadings).toBe(3);
    expect(r.questionHeadingCount).toBe(2);
    expect(r.questionRatio).toBeCloseTo(2 / 3, 5);
    expect(r.meetsMinRatio).toBe(true);
  });

  it('warns when below 60% question headings', () => {
    const content: CheckableContent = {
      headings: [{ title: '신청 방법은?' }, { title: '대상' }, { title: '금액' }],
    };
    const r = scanH2QuestionRatio(content);
    expect(r.questionRatio).toBeCloseTo(1 / 3, 5);
    expect(r.meetsMinRatio).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('handles no headings without dividing by zero', () => {
    const r = scanH2QuestionRatio({});
    expect(r.totalHeadings).toBe(0);
    expect(r.questionRatio).toBe(0);
    expect(r.meetsMinRatio).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// R2 — configurable thresholds (optional param, DEFAULT preserves behavior).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('configurable thresholds', () => {
  it('scanImageRatio honors an overridden minRatio', () => {
    const sixParagraphs = ['가', '나', '다', '라', '마', '바'].join('\n\n');
    // 0 images normally fails; with minRatio 0 it should pass.
    expect(scanImageRatio(sixParagraphs, 0, 0).meetsRecommended).toBe(true);
    // a strict threshold makes a passing ratio fail.
    expect(scanImageRatio(sixParagraphs, 2, 0.9).meetsRecommended).toBe(false);
  });

  it('scanCuriosityHooks honors an overridden minHooks', () => {
    const text = '그런데 끝이 아닙니다. 하지만 주의할 점도 있어요.';
    expect(scanCuriosityHooks(text, 5).meetsRecommended).toBe(false);
    expect(scanCuriosityHooks(text, 1).meetsRecommended).toBe(true);
  });

  it('scanH2QuestionRatio honors an overridden minRatio', () => {
    const content: CheckableContent = {
      headings: [{ title: '신청 방법은?' }, { title: '대상' }, { title: '금액' }],
    };
    // 1/3 ratio: passes a low threshold, fails a high one.
    expect(scanH2QuestionRatio(content, 0.3).meetsMinRatio).toBe(true);
    expect(scanH2QuestionRatio(content, 0.6).meetsMinRatio).toBe(false);
  });
});
