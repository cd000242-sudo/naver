/**
 * [2026-10-09 outcome audit] The post-page check scanned the first 2000 characters of every frame's text for error
 * phrases. On the viewer page that text IS the article, so a post that merely mentions "권한이 없습니다" or
 * "로그인이 필요합니다" was held for 25s and then reported PUBLISH_UNCONFIRMED although it was published and rendered.
 */
import { describe, expect, it } from 'vitest';
import { resolvePublishedPostPageConfirmation } from '../automation/publishedPostPageConfirmation';

const postUrl = 'https://blog.naver.com/leader_248/224318800353';
const SOFT_PHRASES = ['권한이 없습니다', '삭제되었거나', '비공개 게시물', '로그인이 필요합니다'];
const articleAbout = (phrase: string) => `오늘은 ${phrase} 라는 안내문이 뜰 때 대처하는 방법을 정리했습니다. 먼저 계정 상태를 확인하고 차분히 따라 해 보세요. 그래도 해결되지 않으면 고객센터 문의 전에 아래 순서대로 한 번 더 점검해 보시기 바랍니다.`;

describe('article text that mentions an error phrase', () => {
  it.each(SOFT_PHRASES)('%s inside a rendered article does not hold the publish', (phrase) => {
    for (const evidence of [['.se-title-text'], ['.se-main-container'], ['.area_sympathy'], ['#postViewArea', 'meta[property="og:title"]']]) {
      expect(resolvePublishedPostPageConfirmation({
        currentUrl: postUrl,
        title: `${phrase} 대처법 : 네이버 블로그`,
        selectorEvidence: evidence,
        bodyText: articleAbout(phrase),
      })).toMatchObject({ ok: true });
    }
  });

  it.each(SOFT_PHRASES)('%s still blocks when there is no viewer evidence (a real error screen)', (phrase) => {
    for (const evidence of [[], ['meta[property="og:title"]', 'meta[property="og:url"]']]) {
      expect(resolvePublishedPostPageConfirmation({
        currentUrl: postUrl,
        selectorEvidence: evidence,
        bodyText: `${phrase}. 요청하신 페이지를 열 수 없습니다.`,
      })).toMatchObject({ ok: false, code: 'PUBLISH_POST_SCREEN_BLOCKED' });
    }
  });

  it.each([
    '작성중인 글이 있습니다',
    '서비스를 찾을 수 없습니다',
    '유효하지 않은 요청',
    '존재하지 않는 게시물',
  ])('the hard error phrase %s keeps blocking even with viewer evidence', (phrase) => {
    expect(resolvePublishedPostPageConfirmation({
      currentUrl: postUrl,
      selectorEvidence: ['.se-title-text', '#postViewArea'],
      bodyText: `${phrase}. 다시 시도해 주세요.`,
    })).toMatchObject({ ok: false, code: 'PUBLISH_POST_SCREEN_BLOCKED' });
  });

  it('a readable article with no phrase at all is unchanged', () => {
    expect(resolvePublishedPostPageConfirmation({
      currentUrl: postUrl,
      selectorEvidence: ['.se-title-text'],
      bodyText: '게시글 본문이 정상적으로 로드되었습니다.',
    })).toMatchObject({ ok: true, reason: 'POST_SCREEN_CONFIRMED' });
  });

  it('still requires a concrete URL first', () => {
    expect(resolvePublishedPostPageConfirmation({
      currentUrl: 'https://blog.naver.com/leader_248',
      selectorEvidence: ['.se-title-text'],
      bodyText: articleAbout('권한이 없습니다'),
    })).toMatchObject({ ok: false, code: 'PUBLISH_URL_NOT_CONCRETE' });
  });
});
