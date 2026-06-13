import { describe, expect, it } from 'vitest';
import { removeDuplicateHeadings } from '../contentDuplicateCleanup.js';

describe('contentDuplicateCleanup', () => {
  it('keeps the first duplicated heading and removes later duplicate heading blocks', () => {
    const body = [
      '소제목 A',
      '첫 번째 내용입니다. 충분히 긴 문단으로 남겨둡니다.',
      '',
      '소제목 A',
      '두 번째 중복 내용입니다. 이 문단은 제거되어야 합니다.',
    ].join('\n');

    const result = removeDuplicateHeadings(body, [{ title: '소제목 A' }]);

    expect(result).toContain('첫 번째 내용입니다');
    expect(result).not.toContain('두 번째 중복 내용입니다');
  });

  it('removes repeated closing paragraphs after the first one', () => {
    const result = removeDuplicateHeadings(
      [
        '본문 내용입니다. 이 문단은 충분히 길어서 유지됩니다.',
        '',
        '도움이 되었으면 좋겠습니다.',
        '',
        '도움이 되었으면 좋겠습니다.',
      ].join('\n'),
      [{ title: '본문' }],
    );

    expect((result.match(/도움이 되었으면 좋겠습니다/g) || [])).toHaveLength(0);
  });

  it('removes inline CTA leftovers from generated body text', () => {
    const result = removeDuplicateHeadings(
      '본문 내용입니다. 이 문단은 충분히 길어서 유지됩니다.\n\n자세히 보기',
      [{ title: '본문' }],
    );

    expect(result).toBe('본문 내용입니다. 이 문단은 충분히 길어서 유지됩니다.');
  });
});
