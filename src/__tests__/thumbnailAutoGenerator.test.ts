import { describe, it, expect } from 'vitest';
import { previewThumbnailRequest, generateThumbnailFromBody } from '../services/thumbnailAutoGenerator';

const BODY_WITH_HINT = `
이 제품은 정말 좋아요. 써보니 만족스럽더라고요.

여러분도 써보세요.

===THUMBNAIL_HINT===
구도: 제품 단독컷, 미니멀 배경
톤: 따뜻한 조명
텍스트 오버레이: "진짜일까?"
위치: 하단
===END_THUMBNAIL_HINT===
`;

const BODY_WITHOUT_HINT = '힌트 없는 일반 본문';

describe('previewThumbnailRequest — pure synchronous preview', () => {
  it('returns hint + request when block is present', () => {
    const result = previewThumbnailRequest(BODY_WITH_HINT, '블로그 제목', 'it');
    expect(result).not.toBeNull();
    expect(result!.hint.composition).toBe('제품 단독컷, 미니멀 배경');
    expect(result!.request.isThumbnail).toBe(true);
    expect(result!.request.allowText).toBe(true);
    expect(result!.request.category).toBe('it');
    expect(result!.cleanedBody).not.toContain('THUMBNAIL_HINT');
  });

  it('returns null when no hint block exists', () => {
    expect(previewThumbnailRequest(BODY_WITHOUT_HINT, 'Title')).toBeNull();
  });
});

describe('generateThumbnailFromBody — fallback contract (no hint)', () => {
  it('returns ok=false with reason=no_hint when block is absent', async () => {
    const result = await generateThumbnailFromBody(BODY_WITHOUT_HINT, {
      postTitle: 'Some title',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_hint');
    expect(result.hint).toBeNull();
    expect(result.cleanedBody).toBe(BODY_WITHOUT_HINT);
  });

  it('cleanedBody strips the hint block even when generation is not attempted', async () => {
    // When there's no hint, cleanedBody should still equal the stripped input
    // (which equals the original when no block exists).
    const result = await generateThumbnailFromBody(BODY_WITHOUT_HINT, {
      postTitle: 'x',
    });
    expect(result.cleanedBody).toBe(BODY_WITHOUT_HINT);
  });
});

// Note: the happy-path test (hint present → nanoBananaProGenerator called)
// requires mocking the Gemini API surface. That is covered by a separate
// integration test under __tests__/smoke/ with an injected fake generator.
// This unit file asserts only the contract of the adapter itself.
