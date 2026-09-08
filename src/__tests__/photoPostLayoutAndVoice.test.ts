import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-09 사장님 실측] 발행글 세 가지 지적.
 *   1) 썸네일과 1번 소제목 첫 이미지가 같은 사진으로 두 번 나온다.
 *   2) "이미지 4장 → 글 3덩이" 가 아니라 이미지와 글이 번갈아 나와야 읽힌다.
 *   3) "~했어요/~했습니다" 만 있고 감정이 없다. 감탄사·반응이 있어야 사람 글로 읽힌다.
 */

describe('1) 이미지 중복 삽입 방지', () => {
  const editor = read('automation/editorHelpers.ts');

  it('ImageManager 경로에도 usedImagePaths 필터가 있다', () => {
    // 폴백 경로에만 있고 ImageManager 경로에는 등록만 있던 것이 중복의 뿌리였다.
    expect(editor).toMatch(/headingImages = headingImages\.filter\(\(img: any\) => \{[\s\S]*?usedImagePaths\.has\(imgPath\)/);
  });

  it('필터가 등록보다 먼저 온다 (등록 후 걸러내면 아무 효과가 없다)', () => {
    const filterIdx = editor.indexOf('headingImages = headingImages.filter');
    const registerIdx = editor.indexOf('이 소제목에서 사용하기로 한 이미지를 usedImagePaths에 등록');
    expect(filterIdx).toBeGreaterThan(-1);
    expect(registerIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeLessThan(registerIdx);
  });

  it('제외된 장수를 로그로 남긴다 (조용히 사라지면 진단 불가)', () => {
    expect(editor).toMatch(/중복제거.*이미 삽입된 이미지/);
  });
});

describe('2) 이미지·본문 교차 배치 배선', () => {
  const editor = read('automation/editorHelpers.ts');

  it('교차 계획기를 쓴다', () => {
    expect(editor).toMatch(/import \{ planImageTextInterleave \} from '\.\/imageTextInterleavePlan\.js';/);
    expect(editor).toMatch(/const interleaveSteps = planImageTextInterleave<any>\(allSectionImages, cleanBody\);/);
  });

  it('첫 삽입이 전체가 아니라 첫 묶음만 넣는다 (회귀 잠금)', () => {
    expect(editor).toMatch(/await self\.insertImagesAtCurrentCursor\(firstStepImages, page, imageFrame/);
    // 예전처럼 allSectionImages 를 통째로 넣는 호출이 남아 있으면 교차가 무의미해진다.
    expect(editor).not.toMatch(/await self\.insertImagesAtCurrentCursor\(allSectionImages, page, imageFrame/);
  });

  it('단계가 1개면 기존 경로를 그대로 탄다', () => {
    // 사진 1장 이하 / 문단 1개 이하에서는 예전 동작이 유지되어야 한다.
    expect(editor).toMatch(/if \(interleaveSteps\.length > 1\) \{/);
    expect(editor).toMatch(/이미지 뒤에 리치 입력 처리/);
  });

  it('본문 사이 이미지 삽입 뒤에도 캐럿을 다시 잡는다', () => {
    // 이미지 직후 캐럿 유실은 이 앱에서 본문 누락의 단골 원인이다.
    const block = editor.slice(editor.indexOf('번째 묶음'), editor.indexOf('번째 조각 입력'));
    expect(block).toMatch(/ensureTailTypingReady/);
    expect(block).toMatch(/focusLastEditableLine/);
  });
});

describe('3) 감정이 담긴 문장 요구', () => {
  const builder = read('imageNarrative/narrativeBuilder/builder.ts');

  it('감정 반응을 섹션마다 요구한다', () => {
    expect(builder).toMatch(/\[감정 반응\]/);
    expect(builder).toMatch(/섹션마다 최소 1번/);
  });

  it('좋았던 것만 쓰지 못하게 막는다', () => {
    expect(builder).toMatch(/아쉬웠던 점·망설였던 순간·예상과 달랐던 부분/);
  });

  it('감탄사 남용도 함께 막는다', () => {
    expect(builder).toMatch(/3번 넘게 쓰지 않는다/);
  });

  it('감정 때문에 없는 사실을 지어내지 못하게 한다', () => {
    expect(builder).toMatch(/감정을 위해 없는 사실을 만들지 말 것/);
  });
});
