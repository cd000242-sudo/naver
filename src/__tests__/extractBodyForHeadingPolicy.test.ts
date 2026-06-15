import { extractBodyForHeading } from '../automation/editorHelpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('extractBodyForHeading', () => {
  const self = { log: vi.fn() };

  beforeEach(() => {
    self.log.mockClear();
  });

  it('uses the edited full body before stale heading.content fallback', () => {
    const headings = [
      {
        title: '첫 번째 소제목',
        content: '오래된 heading.content 본문입니다. 사용자가 수정하기 전 내용이라 그대로 쓰면 안 됩니다.',
      },
      {
        title: '두 번째 소제목',
        content: '두 번째 오래된 본문입니다.',
      },
    ];

    const editedBody = [
      '첫 번째 소제목: 사용자가 미리보기에서 직접 고친 최신 본문입니다. 이 문장이 실제로 붙어야 합니다.',
      '',
      '두 번째 소제목: 다음 소제목 본문입니다. 첫 번째 소제목에 섞이면 안 됩니다.',
    ].join('\n');

    expect(extractBodyForHeading(self, editedBody, '첫 번째 소제목', 0, 2, headings)).toContain(
      '사용자가 미리보기에서 직접 고친 최신 본문입니다',
    );
    expect(extractBodyForHeading(self, editedBody, '첫 번째 소제목', 0, 2, headings)).not.toContain(
      '오래된 heading.content',
    );
  });
});
