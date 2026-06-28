import { describe, expect, it } from 'vitest';
import { evaluateOfficialExposure } from '../content/officialExposureRubric';

const evidenceRichBody = `
I tested this process for three weeks and compared the same checklist across 12 cases.

The short answer is simple: the result changes when the user can verify dates, limits, and exceptions in one place.
In the 2026 update, the important point is not keyword repetition. The useful part is the exact condition, the exception, and the next action.

For example, the first case took 3 days, the second case took 5 days, and the delayed case needed one extra document.
That pattern matters because readers can decide what to check before they leave the page.

Table summary:
case | condition | action
normal | document ready | submit online
delayed | name mismatch | correct account first

Q. What should readers check first?
A. They should check the official date, the required document, and the exception before applying.
`.trim();

const keywordStuffedBody = `
support fund support fund support fund support fund support fund.
support fund is important because support fund support fund support fund.
This article is about support fund and support fund and support fund.
Read this support fund guide for support fund details.
`.trim();

describe('officialExposureRubric', () => {
  it('rewards evidence, answer fit, readable structure, and freshness over keyword stuffing', () => {
    const rich = evaluateOfficialExposure({
      body: evidenceRichBody,
      title: '지원금 계좌 오류 확인 기준과 처리 순서',
      headings: [
        { title: '결론부터 보면 무엇이 달라지나요' },
        { title: '처리 기간과 예외는 어디서 갈리나요' },
        { title: '신청 전 확인할 체크리스트' },
      ],
      primaryKeyword: '지원금',
      secondaryKeywords: ['계좌 오류', '처리 기간'],
      mode: 'seo',
    });

    const stuffed = evaluateOfficialExposure({
      body: keywordStuffedBody,
      title: 'support fund support fund support fund',
      headings: [{ title: 'support fund' }],
      primaryKeyword: 'support fund',
      mode: 'seo',
    });

    expect(rich.score).toBeGreaterThan(stuffed.score);
    expect(rich.details.evidenceExperience).toBeGreaterThan(stuffed.details.evidenceExperience);
    expect(stuffed.issues.join('\n')).toContain('keyword repetition');
  });

  it('gives mate mode extra credit for citeable answer atoms and FAQ/table blocks', () => {
    const result = evaluateOfficialExposure({
      body: evidenceRichBody,
      title: 'AI briefing ready answer',
      headings: [
        { title: 'What changed first' },
        { title: 'How to check the exception' },
        { title: 'FAQ' },
      ],
      primaryKeyword: 'AI briefing',
      mode: 'mate',
    });

    expect(result.details.citeableAnswerAtoms).toBeGreaterThan(0);
    expect(result.details.structuredBlocks).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });
});
