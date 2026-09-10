/**
 * [2026-09-10 사장님 실측] "썸네일로 썼던 이미지를 1번 소제목의 첫 번째 이미지로 또 쓴다."
 *
 * 뿌리는 **이미지 신원 공간이 두 개**라는 것이다(2026-09-09 발행 로그로 확정):
 *   - 서론 썸네일: resolved.thumbnailPath = data: URL (로그 `thumbnailPath=data:(5033643자)`)
 *   - 1번 소제목: global.ImageManager 가 준 같은 사진의 **data URL 사본**, 또는 저장된 .jpg 파일
 * 중복 제거는 `filePath || url` 한 개 키만 비교하므로 공간이 다르면 그냥 통과한다.
 *
 * 그래서 "같은 사진인가"는 한 개 문자열이 아니라 **그 이미지가 가진 모든 신원 키**로 봐야 한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  imageIdentityKeys,
  isImageAlreadyUsed,
  registerUsedImage,
  seedThumbnailIdentity,
} from '../automation/imageIdentity';

describe('imageIdentityKeys — 한 사진이 가진 모든 신원', () => {
  it('filePath·url·savedToLocal·previewDataUrl 을 모두 신원으로 본다', () => {
    const keys = imageIdentityKeys({
      filePath: 'C:/a/b.jpg',
      url: 'https://x/y.jpg',
      savedToLocal: 'C:/saved/b.jpg',
      previewDataUrl: 'data:image/jpeg;base64,AAA',
    });
    expect(keys).toEqual(['C:/a/b.jpg', 'https://x/y.jpg', 'C:/saved/b.jpg', 'data:image/jpeg;base64,AAA']);
  });

  it('빈 값과 중복은 버린다', () => {
    expect(imageIdentityKeys({ filePath: 'C:/a/s.jpg', url: 'C:/a/s.jpg', savedToLocal: '' }))
      .toEqual(['C:/a/s.jpg']);
  });

  it('위치처럼 생기지 않은 값은 신원이 아니다', () => {
    expect(imageIdentityKeys({ filePath: 'same', url: 'local' })).toEqual([]);
  });

  it('이미지가 아니면 빈 배열', () => {
    expect(imageIdentityKeys(null)).toEqual([]);
    expect(imageIdentityKeys({})).toEqual([]);
  });
});

describe('isImageAlreadyUsed — 공간이 달라도 같은 사진을 잡는다', () => {
  it('data URL 로 등록된 사진을 파일 경로 사본으로 다시 넣으려 하면 잡는다', () => {
    const used = new Set<string>();
    registerUsedImage(used, { previewDataUrl: 'data:image/jpeg;base64,ZZZ', filePath: 'C:/tmp/naver-blog-img-1.jpg' });
    expect(isImageAlreadyUsed(used, { url: 'data:image/jpeg;base64,ZZZ' })).toBe(true);
  });

  it('키가 하나도 안 겹치면 다른 사진이다', () => {
    const used = new Set<string>();
    registerUsedImage(used, { filePath: 'C:/a.jpg' });
    expect(isImageAlreadyUsed(used, { filePath: 'C:/b.jpg' })).toBe(false);
  });

  it('신원이 없는 이미지는 막지 않는다 — 근거 없이 버리면 글에서 사진이 사라진다', () => {
    const used = new Set<string>(['C:/a.jpg']);
    expect(isImageAlreadyUsed(used, {})).toBe(false);
  });
});

describe('seedThumbnailIdentity — 서론에 들어간 대표사진을 미리 등록', () => {
  it('thumbnailPath 와, images 중 isThumbnail 인 항목의 모든 키를 등록한다', () => {
    const used = new Set<string>();
    seedThumbnailIdentity(used, {
      thumbnailPath: 'data:image/jpeg;base64,TTT',
      images: [
        { isThumbnail: true, filePath: 'C:/saved/1번 소제목_1788.jpg', previewDataUrl: 'data:image/jpeg;base64,TTT' },
        { heading: '2번', filePath: 'C:/saved/2.jpg' },
      ],
    });
    expect(isImageAlreadyUsed(used, { filePath: 'C:/saved/1번 소제목_1788.jpg' })).toBe(true);
    expect(isImageAlreadyUsed(used, { url: 'data:image/jpeg;base64,TTT' })).toBe(true);
    expect(isImageAlreadyUsed(used, { filePath: 'C:/saved/2.jpg' })).toBe(false);
  });

  it('대표사진이 본문에 없는 전용 파일이면 본문 사진은 하나도 안 걸린다', () => {
    const used = new Set<string>();
    seedThumbnailIdentity(used, {
      thumbnailPath: 'C:/thumb/only-thumb.png',
      images: [{ heading: '1번', filePath: 'C:/saved/1.jpg' }, { heading: '2번', filePath: 'C:/saved/2.jpg' }],
    });
    expect(isImageAlreadyUsed(used, { filePath: 'C:/saved/1.jpg' })).toBe(false);
    expect(isImageAlreadyUsed(used, { filePath: 'C:/saved/2.jpg' })).toBe(false);
  });

  it('썸네일이 없으면 아무것도 등록하지 않는다', () => {
    const used = new Set<string>();
    seedThumbnailIdentity(used, { images: [{ filePath: 'C:/a.jpg' }] });
    expect(used.size).toBe(0);
  });
});

describe('editorHelpers 배선 핀', () => {
  const code = () => readFileSync(new URL('../automation/editorHelpers.ts', import.meta.url), 'utf8');
  /*
   * 주석 처리된 호출까지 통과시키는 핀은 회귀를 못 잡는다(실측: 시드를 주석으로 지웠는데
   * 핀 3개가 그대로 GREEN 이었다). 살아 있는 코드 줄만 센다.
   */
  const liveCalls = (fn: string): number => code()
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .filter((line) => line.includes(fn))
    .length;

  it('usedImagePaths 를 대표사진 신원으로 시드한다 (주석 아님)', () => {
    expect(liveCalls('seedThumbnailIdentity(usedImagePaths, resolved)')).toBeGreaterThan(0);
  });

  it('ImageManager 경로 중복 제거가 한 개 키가 아니라 신원 전체를 본다', () => {
    expect(liveCalls('isImageAlreadyUsed(usedImagePaths, img)')).toBeGreaterThan(0);
  });

  it('사용 등록도 신원 전체로 한다', () => {
    expect(liveCalls('registerUsedImage(usedImagePaths, img)')).toBeGreaterThan(0);
  });
});

/*
 * [2026-09-10 사장님 실측 회귀] "3번 소제목부터 이미지가 삽입이 안 되는데?"
 *
 * 위 신원 비교가 과잉 차단했다. ImageManager 항목의 `savedToLocal` 은 경로가 아니라
 * **불리언 true** 다(headingImageGen.ts: `savedToLocal: true`). String(true) = "true" 가
 * 모든 이미지의 공통 신원 키가 되어, 먼저 등록된 소제목 이후로는 전부 "이미 삽입됨"으로
 * 걸렸다. 실측: 2번 소제목 2장 삽입 → 3번 3장 전부 제외 → 4번 2장 전부 제외.
 *
 * 계약: 신원 키는 **그 이미지 한 장을 가리키는 위치**여야 한다. 플래그·불리언·빈 값은
 * 신원이 아니다. 가릴 수 없으면 키를 버린다 — 신원이 없으면 막지 않으므로,
 * 최악이라도 중복이 생길 뿐 사진이 사라지지는 않는다.
 */
describe('신원 키는 이미지 한 장을 가리키는 위치여야 한다', () => {
  it('savedToLocal 이 불리언이면 신원이 아니다 (실측 회귀)', () => {
    expect(imageIdentityKeys({ filePath: 'C:/a/1.jpg', savedToLocal: true })).toEqual(['C:/a/1.jpg']);
  });

  it('불리언 플래그를 공유하는 서로 다른 사진은 중복이 아니다', () => {
    const used = new Set<string>();
    registerUsedImage(used, { filePath: 'C:/dl/IMG_5076.jpg', savedToLocal: true, url: 'file:///C:/dl/IMG_5076.jpg' });
    expect(isImageAlreadyUsed(used, { filePath: 'C:/dl/38F77.png', savedToLocal: true })).toBe(false);
    expect(isImageAlreadyUsed(used, { filePath: 'C:/dl/1F87E.png', savedToLocal: true })).toBe(false);
  });

  it('여러 사진이 같은 출처 페이지 url 을 물고 있어도 중복이 아니다', () => {
    const used = new Set<string>();
    const source = 'https://blog.naver.com/someone/223456789';
    registerUsedImage(used, { filePath: 'C:/dl/a.jpg', url: source });
    expect(isImageAlreadyUsed(used, { filePath: 'C:/dl/b.jpg', url: source })).toBe(false);
  });

  it('같은 사진은 여전히 잡는다 — file:/// url 과 파일 경로', () => {
    const used = new Set<string>();
    registerUsedImage(used, { filePath: 'C:/dl/IMG_5076.jpg', url: 'file:///C:/dl/IMG_5076.jpg' });
    expect(isImageAlreadyUsed(used, { url: 'file:///C:/dl/IMG_5076.jpg' })).toBe(true);
  });

  it('대표사진 data URL 은 여전히 신원이다 (원래 고치려던 것)', () => {
    const used = new Set<string>();
    seedThumbnailIdentity(used, { thumbnailPath: 'data:image/jpeg;base64,TTT', images: [] });
    expect(isImageAlreadyUsed(used, { url: 'data:image/jpeg;base64,TTT' })).toBe(true);
  });

  it('실측 시나리오: 2번 소제목 뒤에도 3번·4번 사진이 살아남는다', () => {
    const used = new Set<string>();
    seedThumbnailIdentity(used, {
      thumbnailPath: 'C:/posts/논란의 핵심-1788998278923.png',
      images: [{ isThumbnail: true, filePath: 'C:/posts/논란의 핵심-1788998278923.png' }],
    });
    const h2 = [
      { filePath: 'C:/dl/IMG_5076.jpg', savedToLocal: true, url: 'file:///C:/dl/IMG_5076.jpg' },
      { filePath: 'C:/dl/IMG_5060.jpg', savedToLocal: true, url: 'file:///C:/dl/IMG_5060.jpg' },
    ];
    h2.forEach((img) => registerUsedImage(used, img));

    const h3 = [
      { filePath: 'C:/dl/27만4천.jpg', savedToLocal: true },
      { filePath: 'C:/dl/38F77.png', savedToLocal: true },
      { filePath: 'C:/dl/1F87E.png', savedToLocal: true },
    ];
    expect(h3.filter((img) => !isImageAlreadyUsed(used, img))).toHaveLength(3);
  });
});
