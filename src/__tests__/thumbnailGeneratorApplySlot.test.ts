import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * [2026-08-23] 사용자 실측: 썸네일/배너 생성기에서 "적용하기"를 눌러도 썸네일이 안 바뀐다.
 *
 * 원인: applyToPost()가 resolveFirstHeadingTitleForThumbnail()이 돌려주는 **글 제목**을
 *   ImageManager 키로 썼다. 이미지 관리 탭의 썸네일 카드 키는 '🖼️ 썸네일'이라 어느 카드와도
 *   맞지 않는 새 버킷이 생겼고, 화면에는 아무것도 안 나타났다.
 *   '🖼️ 썸네일'은 발행 쪽(editorHelpers introImages / filterImagesForPublish)이 인식하는
 *   정본 키이기도 하므로 표시와 발행이 같은 키로 모여야 한다.
 */
describe('썸네일 생성기 적용 대상', () => {
  const source = readFileSync(
    resolve(__dirname, '../renderer/modules/thumbnailGenerator.ts'), 'utf8');

  it('썸네일 슬롯 키로 등록한다 — 글 제목을 키로 쓰지 않는다', () => {
    expect(source).toContain("resolveImageSlotTarget('thumbnail')");
    expect(source).toContain('ImageManager.setImage(thumbnailSlotKey, thumbnailImage);');
    expect(source).not.toContain('ImageManager.setImage(firstHeadingTitle, thumbnailImage);');
  });

  it('글 제목은 키가 아니라 표시용 프롬프트로만 쓴다', () => {
    expect(source).toContain('thumbnailImage.heading = thumbnailSlotKey;');
    expect(source).not.toContain('thumbnailImage.heading = firstHeadingTitle;');
  });

  it('대표 썸네일 플래그를 붙인다 (발행 서론 삽입이 이 플래그로 가려낸다)', () => {
    const at = source.indexOf('provider: \'thumbnail-generator\',');
    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at, at + 300)).toContain('isThumbnail: true');
  });

  it('슬롯 해석이 실패해도 정본 키로 떨어진다', () => {
    expect(source).toContain("return typeof THUMBNAIL_SLOT_TITLE === 'string' ? THUMBNAIL_SLOT_TITLE : '🖼️ 썸네일';");
  });
});

describe('카드 이미지 인덱스 폴백', () => {
  const renderer = readFileSync(resolve(__dirname, '../renderer/renderer.ts'), 'utf8');

  it('남의 카드에 속한 이미지는 끌어오지 않고, 주인 없는 것만 건진다', () => {
    expect(renderer).toContain('const owner = String(img?.heading || \'\').trim();');
    expect(renderer).toContain('return !owner || !slotTitleSet.has(owner);');
  });
});
