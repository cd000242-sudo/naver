import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-09 사장님 실측] 이미지 수집 URL 두 가지 지적.
 *   "잘 되는데 맨 아래 추천 다른 글 이미지까지 가져오네요."
 *   "예비 이미지로 폴더만 저장해야 되는데 생성된 이미지에 같이 배치가 되어 있어요.
 *    소제목 분석을 했으니까 그 소제목에 맞게 넣어주고 나머지는 같이 두지 마세요."
 */

describe('URL 이미지 수집 — 본문 영역만 긁는다', () => {
  const crawler = read('crawler/googleImageSearch.ts');

  it('document 전체가 아니라 본문 영역을 먼저 찾는다', () => {
    expect(crawler).toMatch(/const CONTENT_ROOTS = \[/);
    expect(crawler).toMatch(/'\.se-main-container'/);   // 네이버 스마트에디터
    expect(crawler).toMatch(/scope\.querySelectorAll\('img'\)/);
    // 예전처럼 document 전체를 긁으면 추천글이 다시 들어온다.
    expect(crawler).not.toMatch(/document\.querySelectorAll\('img'\)\.forEach/);
  });

  it('추천·관련·댓글 묶음은 본문 안이어도 제외한다', () => {
    expect(crawler).toMatch(/EXCLUDE_CONTAINERS/);
    expect(crawler).toMatch(/\[class\*="related"\]/);
    expect(crawler).toMatch(/\[class\*="recommend"\]/);
  });

  it('본문 영역을 못 찾으면 예전처럼 전체를 쓴다 (한 장도 못 가져오면 더 나쁘다)', () => {
    expect(crawler).toMatch(/let scope: ParentNode = document;/);
  });
});

describe('예비 이미지는 폴더에만 둔다', () => {
  const gen = read('renderer/modules/headingImageGen.ts');

  it('소제목 수만큼만 배치한다', () => {
    expect(gen).toMatch(/const placeableCount = hasRealHeadings/);
    expect(gen).toMatch(/Math\.min\(allImages\.length, realHeadingTitles\.length\)/);
  });

  it('넘치는 사진은 ImageManager 에 넣지 않는다', () => {
    expect(gen).toMatch(/const isSpareCollectedImage = i >= placeableCount;/);
    expect(gen).toMatch(/if \(isSpareCollectedImage\) continue;/);
  });

  it('폴더 저장은 예비 사진에도 그대로 한다 (건너뛰기가 저장보다 뒤에 온다)', () => {
    const saveAt = gen.indexOf('downloadAndSaveImage(imgUrl, heading, postTitle, postId)');
    const skipAt = gen.indexOf('if (isSpareCollectedImage) continue;');
    expect(saveAt).toBeGreaterThan(-1);
    expect(skipAt).toBeGreaterThan(saveAt);
  });

  it('몇 장을 예비로 뒀는지 사용자에게 알린다', () => {
    expect(gen).toMatch(/예비로 폴더에만 저장합니다/);
  });

  it('소제목이 아예 없으면 예전처럼 가상 헤딩으로 보여 준다', () => {
    // 그 경우까지 감추면 수집한 사진을 꺼낼 방법이 사라진다.
    expect(gen).toMatch(/const hasRealHeadings = realHeadingTitles\.length > 0;/);
    expect(gen).toMatch(/: allImages\.map\(\(_, i\) => `🔗 URL 이미지 \$\{i \+ 1\}`\)/);
  });
});
