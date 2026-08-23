import { describe, expect, it } from 'vitest';
import { removeDuplicateHeadings } from '../contentDuplicateCleanup';
import {
  checkDuplicateHeadings,
  removeRepeatedFullContent,
} from '../contentDuplicateHeuristics';
import { recoverLooseStructuredContentFields } from '../contentStructuredRecovery';

// [2026-08-23] Regression guard for the agent-gemini (agy) post that died with
// "Cannot read properties of undefined (reading 'replace')": the CLI answered with a `body`
// field and headings that carried no `title`, and every downstream heading consumer read
// `heading.title` directly.

const BODY = '첫 문단입니다.\n\n소제목 하나\n본문 내용이 이어집니다.\n\n소제목 둘\n다른 내용입니다.';

describe('title 없는 소제목 방어', () => {
  it('removeDuplicateHeadings는 title이 없는 항목에서 던지지 않는다', () => {
    const headings = [{ heading: '소제목 하나' } as any, '소제목 둘' as any, { title: '소제목 하나' }];
    expect(() => removeDuplicateHeadings(BODY, headings)).not.toThrow();
    expect(typeof removeDuplicateHeadings(BODY, headings)).toBe('string');
  });

  it('removeRepeatedFullContent / checkDuplicateHeadings도 던지지 않는다', () => {
    const headings = [{ name: '소제목 하나' } as any, {} as any];
    expect(() => removeRepeatedFullContent(BODY, headings)).not.toThrow();
    expect(() => checkDuplicateHeadings(BODY, headings)).not.toThrow();
    expect(checkDuplicateHeadings(BODY, headings).valid).toBe(true);
  });

  it('문자열 배열 headings를 title 객체로 정규화한다', () => {
    const content: any = {
      selectedTitle: '테스트 제목입니다',
      body: BODY,
      headings: ['소제목 하나', '소제목 둘'],
    };

    const result = recoverLooseStructuredContentFields(content);

    expect(result.bodyRecovered).toBe(true);
    expect(result.headingsRecovered).toBe(true);
    expect(content.headings).toHaveLength(2);
    expect(content.headings[0].title).toBe('소제목 하나');
    expect(content.headings[1].title).toBe('소제목 둘');
    expect(() => removeDuplicateHeadings(content.bodyPlain, content.headings)).not.toThrow();
  });

  it('title 별칭(heading/name)을 title로 채운다', () => {
    const content: any = {
      selectedTitle: '테스트 제목입니다',
      bodyPlain: BODY,
      headings: [
        { heading: '별칭 소제목', content: '내용 A' },
        { title: '정상 소제목', content: '내용 B' },
      ],
    };

    const result = recoverLooseStructuredContentFields(content);

    expect(result.headingsRecovered).toBe(true);
    expect(content.headings[0].title).toBe('별칭 소제목');
    expect(content.headings[0].content).toBe('내용 A');
    expect(content.headings[1]).toEqual({ title: '정상 소제목', content: '내용 B' });
  });

  it('정상 headings는 손대지 않는다', () => {
    const headings = [{ title: '소제목 하나', content: '내용' }];
    const content: any = { selectedTitle: '제목', bodyPlain: BODY, headings };

    const result = recoverLooseStructuredContentFields(content);

    expect(result.headingsRecovered).toBe(false);
    expect(content.headings).toBe(headings);
  });
});
