import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-06 사용자 실측] 썸네일 생성기 3건.
 *
 * 1. 미리보기 확대/축소(마우스 휠 줌) — 필요 없고 확대하면 잔상이 남는다. 제거.
 * 2. "적용하기" 후 이미지관리탭의 영어 프롬프트 이미지 미리보기에 안 뜬다
 *    (아래 "생성된 이미지 미리보기"에는 뜸) — 소제목 카드 렌더
 *    (displayImageHeadingsWithPrompts)를 호출하지 않아서다.
 * 3. 이전에 넣었던 썸네일이 그대로 남는다 — sync 병합이 ImageManager 에 없는
 *    기존 항목을 보충하면서 구 썸네일까지 되살린다.
 */
describe('thumbnail generator — 확대축소 제거', () => {
  const gen = readFileSync(new URL('../renderer/modules/thumbnailGenerator.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

  it('휠 줌 핸들러가 없다', () => {
    expect(gen).not.toMatch(/addEventListener\('wheel'/);
    expect(gen).not.toMatch(/private onWheel/);
  });

  it('줌 활성화 체크박스와 안내 문구가 없다', () => {
    expect(html).not.toContain('thumb-bg-zoom-enable');
    expect(html).not.toMatch(/마우스 휠<\/b>로 확대\/축소/);
  });

  it('드래그 이동은 유지된다 (위치 조정은 필요)', () => {
    expect(gen).toMatch(/addEventListener\('mousedown'/);
    expect(gen).toMatch(/addEventListener\('mousemove'/);
  });
});

describe('thumbnail generator — 적용 후 UI 반영', () => {
  const gen = readFileSync(new URL('../renderer/modules/thumbnailGenerator.ts', import.meta.url), 'utf8');

  it('적용 시 소제목 카드(영어 프롬프트 미리보기)를 다시 그린다', () => {
    expect(gen).toMatch(/displayImageHeadingsWithPrompts/);
  });

  it('적용 시 이전 썸네일을 먼저 제거한다', () => {
    expect(gen).toMatch(/removePreviousThumbnailImages|이전 썸네일/);
  });

  it('반영 실패 시에도 예외로 흐름이 끊기지 않는다', () => {
    expect(gen).toMatch(/displayImageHeadingsWithPrompts[\s\S]{0,400}catch/);
  });

  it('렌더 함수가 window 에 노출된다 (번들 스코프 무관 호출)', () => {
    const renderer = readFileSync(new URL('../renderer/renderer.ts', import.meta.url), 'utf8');
    expect(renderer).toMatch(/window as any\)\.displayImageHeadingsWithPrompts = displayImageHeadingsWithPrompts/);
    expect(gen).toMatch(/window as any\)\.displayImageHeadingsWithPrompts/);
  });
});

describe('image sync — 구 썸네일 되살리기 차단', () => {
  const sync = readFileSync(new URL('../renderer/modules/imageSyncService.ts', import.meta.url), 'utf8');

  it('병합 보충 단계가 썸네일 생성기 산출물을 되살리지 않는다', () => {
    expect(sync).toMatch(/thumbnail-generator/);
    expect(sync).toMatch(/이전 썸네일|구 썸네일/);
  });
});
