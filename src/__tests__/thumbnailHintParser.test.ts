import { describe, it, expect } from 'vitest';
import {
  extractThumbnailHint,
  stripThumbnailHint,
  buildThumbnailRequest,
  CATEGORY_TONE_PRESETS,
} from '../image/thumbnailHintParser';

const FULL_BLOCK = `
글 본문 마지막 문단입니다.

===THUMBNAIL_HINT===
구도: 인물 1명 클로즈업, 얼굴 중심
톤: 따뜻한 자연광, 포인트 컬러 노랑
텍스트 오버레이: "3주 써보니"
위치: 하단
===END_THUMBNAIL_HINT===
`;

describe('extractThumbnailHint — valid blocks', () => {
  it('parses a full block with all four fields', () => {
    const hint = extractThumbnailHint(FULL_BLOCK);
    expect(hint).not.toBeNull();
    expect(hint!.composition).toBe('인물 1명 클로즈업, 얼굴 중심');
    expect(hint!.tone).toBe('따뜻한 자연광, 포인트 컬러 노랑');
    expect(hint!.overlayText).toBe('3주 써보니');
    expect(hint!.overlayPosition).toBe('하단');
  });

  it('strips surrounding straight quotes from overlay text', () => {
    const hint = extractThumbnailHint(
      `===THUMBNAIL_HINT===
구도: 제품 단독컷
톤: 미니멀 배경
텍스트 오버레이: "진짜일까?"
위치: 상단
===END_THUMBNAIL_HINT===`,
    );
    expect(hint!.overlayText).toBe('진짜일까?');
  });

  it('strips surrounding curly quotes from overlay text', () => {
    const hint = extractThumbnailHint(
      `===THUMBNAIL_HINT===
구도: 제품 단독컷
톤: 미니멀
텍스트 오버레이: “미쳤다”
위치: 하단
===END_THUMBNAIL_HINT===`,
    );
    expect(hint!.overlayText).toBe('미쳤다');
  });

  it('accepts Korean fullwidth colon "："', () => {
    const hint = extractThumbnailHint(
      `===THUMBNAIL_HINT===
구도：풍경 광각
톤：따뜻한 자연광
텍스트 오버레이："환상적"
위치：하단
===END_THUMBNAIL_HINT===`,
    );
    expect(hint).not.toBeNull();
    expect(hint!.composition).toBe('풍경 광각');
    expect(hint!.overlayText).toBe('환상적');
  });

  it('falls back to defaults when non-critical fields are missing', () => {
    const hint = extractThumbnailHint(
      `===THUMBNAIL_HINT===
구도: 음식 클로즈업
텍스트 오버레이: "바로 이 맛"
===END_THUMBNAIL_HINT===`,
    );
    expect(hint).not.toBeNull();
    expect(hint!.tone).toContain('밝고');
    expect(hint!.overlayPosition).toBe('하단');
  });
});

describe('extractThumbnailHint — invalid or absent blocks', () => {
  it('returns null when no block exists', () => {
    expect(extractThumbnailHint('일반 블로그 본문. 썸네일 힌트 없음.')).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(extractThumbnailHint('')).toBeNull();
  });

  it('returns null when composition is missing (critical field)', () => {
    const hint = extractThumbnailHint(
      `===THUMBNAIL_HINT===
톤: 밝은 톤
텍스트 오버레이: "안녕"
위치: 하단
===END_THUMBNAIL_HINT===`,
    );
    expect(hint).toBeNull();
  });

  it('returns null when overlay text is missing (critical field)', () => {
    const hint = extractThumbnailHint(
      `===THUMBNAIL_HINT===
구도: 인물
톤: 밝은 톤
위치: 하단
===END_THUMBNAIL_HINT===`,
    );
    expect(hint).toBeNull();
  });

  it('picks the first block when multiple are present', () => {
    const hint = extractThumbnailHint(
      `===THUMBNAIL_HINT===
구도: FIRST
텍스트 오버레이: "첫번째"
===END_THUMBNAIL_HINT===

===THUMBNAIL_HINT===
구도: SECOND
텍스트 오버레이: "두번째"
===END_THUMBNAIL_HINT===`,
    );
    expect(hint!.composition).toBe('FIRST');
  });
});

describe('stripThumbnailHint', () => {
  it('removes the block from the LLM output', () => {
    const cleaned = stripThumbnailHint(FULL_BLOCK);
    expect(cleaned).not.toContain('THUMBNAIL_HINT');
    expect(cleaned).toContain('글 본문 마지막 문단입니다.');
  });

  it('is a no-op when no block exists', () => {
    const input = '본문만 있는 텍스트';
    expect(stripThumbnailHint(input)).toBe(input);
  });

  it('trims trailing whitespace but preserves body indentation', () => {
    const body = '본문입니다.\n  들여쓰기 유지';
    const block = `===THUMBNAIL_HINT===\n구도: X\n텍스트 오버레이: "Y"\n===END_THUMBNAIL_HINT===\n`;
    const result = stripThumbnailHint(`${body}\n\n${block}`);
    expect(result.endsWith(body)).toBe(true);
  });
});

describe('buildThumbnailRequest', () => {
  it('produces an ImageRequestItem with isThumbnail=true and allowText=true', () => {
    const hint = extractThumbnailHint(FULL_BLOCK)!;
    const req = buildThumbnailRequest(hint, '블로그 제목 예시', 'it');
    expect(req.isThumbnail).toBe(true);
    expect(req.allowText).toBe(true);
    expect(req.category).toBe('it');
    expect(req.prompt).toContain('인물 1명 클로즈업');
    expect(req.prompt).toContain('3주 써보니');
    expect(req.prompt).toContain('하단');
    expect(req.prompt).toContain('블로그 제목 예시');
  });

  it('omits post title section when empty', () => {
    const hint = extractThumbnailHint(FULL_BLOCK)!;
    const req = buildThumbnailRequest(hint, '');
    expect(req.prompt).not.toContain('글 주제:');
  });
});

describe('CATEGORY_TONE_PRESETS', () => {
  it('covers the main homefeed categories from SECTION 7', () => {
    const required = ['entertainment', 'health', 'it', 'food', 'travel', 'life'];
    for (const cat of required) {
      expect(CATEGORY_TONE_PRESETS[cat]).toBeDefined();
      expect(CATEGORY_TONE_PRESETS[cat].length).toBeGreaterThan(0);
    }
  });
});
