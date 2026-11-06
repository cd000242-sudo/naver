// @vitest-environment happy-dom
/**
 * [2026-11-06] 사장님 화면 두 건.
 *  1. 이미지 탭에서 '관련 사진 찾기' 를 고르면 "알 수 없는 이미지 엔진 \"collect-photos\"" 로 멈췄다 —
 *     엔진을 고르는 분기(일괄 생성 · 개별 재생성)에 이 엔진이 빠져 있었다. 수집기(main)는 이미 있었다.
 *  2. 엔진 고르기 창에서 "관련 사진 찾기" 카드의 닫는 태그가 빠져 아래 카드 4개가 그 안에 들어갔다
 *     (큰 상자 하나로 보이고, 4개 중 하나를 눌러도 바깥 카드가 선택됐다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('엔진 고르기 창 카드는 서로 겹쳐 들어가지 않는다', () => {
  const settings = read('renderer/components/HeadingImageSettings.ts');
  const start = settings.indexOf('<div id="image-source-submodal"');
  const end = settings.indexOf('<!-- ✅ [2026-01-27] 이미지 스타일 선택 서브 모달');
  const html = settings.slice(start, end);
  const mount = (): Element[] => {
    document.body.innerHTML = html;
    return Array.from(document.querySelectorAll('.source-option'));
  };

  it('창 조각을 찾았고 템플릿 식(${})이 섞여 있지 않다', () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(html).not.toContain('${');
  });

  it('카드 8장 모두 다른 카드 안에 들어 있지 않다', () => {
    const cards = mount();
    expect(cards.map(card => card.getAttribute('data-value'))).toEqual([
      'genspark', 'codex-image', 'collect-photos', 'nano-banana-2', 'openai-image', 'flow', 'dropshot', 'local-folder',
    ]);
    for (const card of cards) {
      expect(card.parentElement?.closest('.source-option'), `${card.getAttribute('data-value')} 가 다른 카드 안에 있다`).toBeNull();
    }
  });

  it('카드를 누르면 그 카드의 값이 선택된다 (바깥 카드로 번지지 않는다)', () => {
    const cards = mount();
    let selected = '';
    // 앱과 같은 배선: 카드마다 click 으로 값을 정한다.
    cards.forEach(card => card.addEventListener('click', () => { selected = card.getAttribute('data-value') || ''; }));
    for (const card of cards) {
      card.dispatchEvent(new Event('click', { bubbles: true }));
      expect(selected).toBe(card.getAttribute('data-value'));
    }
  });
});

describe('이미지 탭 엔진 분기는 관련 사진 찾기를 안다', () => {
  const gen = read('renderer/modules/headingImageGen.ts');

  it('"알 수 없는 이미지 엔진" 으로 떨어지는 분기 두 곳 앞에 모두 collect-photos 분기가 있다', () => {
    const marker = '알 수 없는 이미지 엔진';
    let from = 0;
    let found = 0;
    for (;;) {
      const at = gen.indexOf(marker, from);
      if (at < 0) break;
      found += 1;
      expect(gen.slice(Math.max(0, at - 6000), at)).toContain("imageSource === 'collect-photos'");
      from = at + marker.length;
    }
    expect(found).toBe(2);
  });

  it('소제목 전체를 수집기에 한 번에 보낸다 (칸마다 따로 부르지 않는다)', () => {
    const at = gen.indexOf("imageSource === 'collect-photos' && !isShoppingConnectForCurrentPost()");
    expect(at).toBeGreaterThan(0);
    const block = gen.slice(at, at + 2600);
    expect(block).toContain("provider: 'collect-photos'");
    expect(block).toContain('items: collectRequestItems');
    expect(block).toContain('gsPrefetchMatchImages(');
    // 수집기가 오류를 돌려주면 다른 엔진으로 대체하지 않고 멈춘다.
    expect(block).toContain('throw new Error(String(collectResult.message');
  });

  it('썸네일도 같은 요청에 넣어 수집기가 소제목 사진과 중복을 거른다 (따로 찾지 않는다)', () => {
    expect(gen).toContain("const collectThumbnailWithBody = imageSource === 'collect-photos'");
    expect(gen).toContain('if (!hasManualThumbnailInTab && !hasThumbnailHeading && !collectThumbnailWithBody) {');
    const at = gen.indexOf('const collectRequestItems = collectThumbnailWithBody');
    expect(at).toBeGreaterThan(0);
    expect(gen.slice(at, at + 500)).toContain('isThumbnail: true,');
    const reg = gen.slice(gen.indexOf("const collectThumb = (Array.isArray(collectResult?.images)"));
    expect(reg.slice(0, 900)).toContain("ImageManager.setImage('🖼️ 썸네일'");
    expect(reg.slice(0, 900)).toContain('...headingCollectPhotoMeta(collectThumb),');
  });

  it('맞는 사진이 없는 칸은 실패가 아니라 건너뜀(빈 칸)으로 처리한다', () => {
    expect(gen.match(/new Error\('관련 사진 찾기: 맞는 사진이 없어 비워 둡니다'\)/g)?.length).toBe(2);
    expect(gen).toContain('/맞는 사진이 없어 비워 둡니다/.test(');
    const skip = gen.slice(gen.indexOf('/맞는 사진이 없어 비워 둡니다/.test('));
    expect(skip.slice(0, 700)).toContain("liveImagePreview.updateItem(i, 'pending')");
    expect(skip.slice(0, 700)).toContain('return null;');
  });

  it('출처 캡션과 원본 주소가 결과 정리에서 버려지지 않는다', () => {
    expect(gen).toContain('...(img?.caption ? { caption: img.caption } : {}),');
    expect(gen).toContain('...(img?.sourceUrl ? { sourceUrl: img.sourceUrl } : {}),');
    const helper = gen.slice(gen.indexOf('function headingCollectPhotoMeta('));
    expect(helper.slice(0, 500)).toContain("provider: 'collected'");
    expect(helper.slice(0, 500)).toContain('isCollected: true');
    expect(helper.slice(0, 500)).toContain('disableTextOverlay: true');
    expect(helper.slice(0, 500)).toContain('caption: photo.caption');
    expect(helper.slice(0, 500)).toContain('sourceUrl: photo.sourceUrl');
  });

  it('칸 하나 다시 만들기도 같은 꼬리표를 저장한다', () => {
    expect(gen).toMatch(/prompt,\s*\.\.\.collectedMeta,/);
    expect(gen).toContain('collectedMeta = headingCollectPhotoMeta(collectedPhoto);');
  });

  it('새 식별자는 인라인 번들에서 한 번만 정의된다', () => {
    expect(gen.match(/function headingCollectPhotoMeta\(/g)?.length).toBe(1);
  });
});
