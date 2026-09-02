import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { toCollectedImagePreview, toCollectedImagePreviews } from '../renderer/modules/collectedImagePreview';

/**
 * [2026-09-02 사장님 화면] 수집 8장 → 모달 "1개" + "Image preview unavailable".
 * 객체 원소를 문자열로 취급해 { url: <객체> } 로 감싼 것이 뿌리다. "[object Object]" 가 한 번이라도
 * 새면 중복 제거가 전부를 하나로 뭉갠다.
 */

describe('수집 이미지 원소의 형태를 보고 감싼다', () => {
  it('객체 원소는 url·filePath 를 그대로 넘긴다 — 실측 형태', () => {
    const out = toCollectedImagePreview(
      { url: 'https://shop.example/a.jpg', filePath: 'C:/x/a.jpg', heading: '제품 이미지 1', provider: 'collected', isRepresentative: true },
      0,
    );
    expect(out).toEqual({ url: 'https://shop.example/a.jpg', filePath: 'C:/x/a.jpg', heading: '대표 이미지' });
  });

  it('문자열 원소도 받는다', () => {
    expect(toCollectedImagePreview(' https://shop.example/b.jpg ', 2)).toEqual({ url: 'https://shop.example/b.jpg', heading: '이미지 2' });
  });

  it('첫 장이 대표다 — 썸네일 자리는 대표 상품 이미지', () => {
    const out = toCollectedImagePreviews([{ url: 'https://a' }, { url: 'https://b' }, { url: 'https://c' }]);
    expect(out.map((e) => e.heading)).toEqual(['대표 이미지', '이미지 1', '이미지 2']);
  });

  it('[object Object] 가 절대 새지 않는다 — 새면 8장이 1장으로 뭉개진다', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ url: `https://shop.example/${i}.jpg`, filePath: `C:/x/${i}.jpg` }));
    const out = toCollectedImagePreviews(eight);
    expect(out).toHaveLength(8);
    expect(new Set(out.map((e) => e.filePath)).size).toBe(8);
    expect(JSON.stringify(out)).not.toContain('[object Object]');
  });

  it('주소가 없는 원소는 버린다 — 빈 타일을 만들지 않는다', () => {
    expect(toCollectedImagePreviews([null, {}, 42, '', { heading: 'x' }] as unknown[])).toEqual([]);
  });

  it('limit 만큼만 넘긴다', () => {
    const many = Array.from({ length: 14 }, (_, i) => `https://shop.example/${i}.jpg`);
    expect(toCollectedImagePreviews(many, 10)).toHaveLength(10);
  });
});

describe('배선: 발행 핸들러가 형태 변환을 거쳐 모달에 넘긴다', () => {
  const src = readFileSync(resolve(__dirname, '..', 'renderer', 'modules', 'publishingHandlers.ts'), 'utf-8').replace(/\r/g, '');

  it('문자열 취급 매핑이 사라지고 변환 함수를 쓴다', () => {
    expect(src).not.toMatch(/collectedImages\.slice\(0, 10\)\.map\(\(url: string/u);
    expect(src).toMatch(/toCollectedImagePreviews\(collectedImages, 10\)/u);
  });
});
