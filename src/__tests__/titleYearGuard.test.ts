import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyKeywordPrefixToTitle as applyContentKeywordPrefix } from '../contentKeywordPrefix';
import { applyKeywordPrefixToTitle as applyRendererKeywordPrefix } from '../renderer/utils/titleUtils';

describe('duplicate leading year title guard', () => {
  it('protects content keyword-prefix titles when the keyword tokens are already present', () => {
    expect(
      applyContentKeywordPrefix('2026년 2026 꼼수장학금 신청 방법', '2026 꼼수장학금 신청 방법')
    ).toBe('2026년 꼼수장학금 신청 방법');
  });

  it('keeps the renderer year guard self-contained for public renderer inlining', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'renderer', 'utils', 'titleUtils.ts'), 'utf8');

    expect(source).not.toContain("from '../../contentTitleYearGuard.js'");
    expect(source).toContain('function collapseDuplicateLeadingYearTitle');
  });

  it('protects renderer keyword-prefix titles used by automation flows', () => {
    expect(
      applyRendererKeywordPrefix('2026년 2026 꼼수장학금 신청 방법', '2026 꼼수장학금 신청 방법')
    ).toBe('2026년 꼼수장학금 신청 방법');
  });
});
