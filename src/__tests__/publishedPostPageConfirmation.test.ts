import { describe, expect, it } from 'vitest';
import { resolvePublishedPostPageConfirmation } from '../automation/publishedPostPageConfirmation';

describe('resolvePublishedPostPageConfirmation', () => {
  it('confirms a concrete Naver post URL with a published-post DOM signal', () => {
    expect(resolvePublishedPostPageConfirmation({
      currentUrl: 'https://blog.naver.com/leader_248/224318800353',
      selectorEvidence: ['#postViewArea'],
      bodyText: '게시글 본문이 정상적으로 로드되었습니다.',
    })).toMatchObject({
      ok: true,
      reason: 'POST_SCREEN_CONFIRMED',
    });
  });

  it('confirms a concrete post URL with enough readable body text as a fallback', () => {
    expect(resolvePublishedPostPageConfirmation({
      currentUrl: 'https://blog.naver.com/leader_248/224318800353',
      selectorEvidence: [],
      bodyText: '네이버 블로그 게시글 본문이 충분히 길게 로드되어 실제 게시글 화면으로 볼 수 있습니다. 댓글과 공감 영역은 늦게 뜰 수 있지만 본문 제목과 문단이 정상적으로 표시된다면 발행 완료 화면으로 판단할 수 있습니다.',
    })).toMatchObject({
      ok: true,
      reason: 'POST_SCREEN_TEXT_FALLBACK',
    });
  });

  it('rejects editor or non-post URLs even when body text exists', () => {
    expect(resolvePublishedPostPageConfirmation({
      currentUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=leader_248',
      selectorEvidence: ['.se-main-container'],
      bodyText: '작성중인 글이 있습니다.',
    })).toMatchObject({
      ok: false,
      code: 'PUBLISH_URL_NOT_CONCRETE',
    });
  });

  it('rejects Naver error or missing-service screens', () => {
    expect(resolvePublishedPostPageConfirmation({
      currentUrl: 'https://blog.naver.com/leader_248/224318800353',
      selectorEvidence: ['#postViewArea'],
      bodyText: '서비스를 찾을 수 없습니다. 존재하지 않는 게시물입니다.',
    })).toMatchObject({
      ok: false,
      code: 'PUBLISH_POST_SCREEN_BLOCKED',
    });
  });

  it('rejects a concrete URL when the post screen is still blank', () => {
    expect(resolvePublishedPostPageConfirmation({
      currentUrl: 'https://blog.naver.com/leader_248/224318800353',
      selectorEvidence: [],
      bodyText: ' ',
    })).toMatchObject({
      ok: false,
      code: 'PUBLISH_POST_SCREEN_NOT_READY',
    });
  });
});
