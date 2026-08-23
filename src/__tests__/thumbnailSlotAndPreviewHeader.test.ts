import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * [v2.11.141] 사용자 요청 2건 소스 계약.
 * 1) 이미지 관리탭 '이미지 불러오기' 배치(순서/일반)에 🖼️ 썸네일 슬롯 포함 —
 *    첫 슬롯이 썸네일이고 ImageManager 키('🖼️ 썸네일')·isThumbnail 플래그가 발행
 *    서론 삽입 경로와 일치해야 한다.
 * 2) 반자동 편집 위 구조 미리보기에 글 제목·도입부 헤더 표시.
 */
describe('thumbnail placement slot + preview header (v2.11.141)', () => {
  const localImageModals = readFileSync(
    resolve(__dirname, '../renderer/modules/localImageModals.ts'), 'utf8');
  const fullAutoFlow = readFileSync(
    resolve(__dirname, '../renderer/modules/fullAutoFlow.ts'), 'utf8');

  it('배치 대상 첫 슬롯 = 🖼️ 썸네일 (ImageManager 키 일치)', () => {
    expect(localImageModals).toContain("{ title: '🖼️ 썸네일', isThumbnail: true }");
    // placementTargets가 순서/일반 모드 양쪽에서 사용된다
    expect(localImageModals).toContain('placementTargets[nextHeadingIndex]');
    expect(localImageModals).toContain('placementTargets[headingIndex]');
    // 배치 이미지에 isThumbnail 플래그 전달 (발행 시 서론 대표로 인식)
    expect(localImageModals).toContain('isThumbnail: target.isThumbnail === true');
    expect(localImageModals).toContain('isThumbnail: isThumbnailTarget');
  });

  it("[2026-08-23] '저장된 이미지' 교체는 숫자가 아니라 제목으로 대상을 지정한다", () => {
    // 이전 계약(v2.11.141b)은 "썸네일이면 'thumbnail', 아니면 headingIndex 해석"이었고
    // 그 headingIndex 해석이 바로 이번 버그의 통로였다: ImageManager.headings가
    // AI 생성 경로에선 썸네일을 포함하고 글 불러오기 경로에선 안 해서, 같은 숫자가
    // 서로 다른 소제목을 가리켰다(썸네일→소제목 1, 1번→2번).
    // 따라서 옛 단언을 명시적으로 교체하고, 숫자 해석은 .not으로 잠가 재발을 막는다.
    const imageDisplayGrid = readFileSync(
      resolve(__dirname, '../renderer/modules/imageDisplayGrid.ts'), 'utf8');
    const imageManagerCore = readFileSync(
      resolve(__dirname, '../renderer/modules/imageManagerCore.ts'), 'utf8');
    const renderer = readFileSync(
      resolve(__dirname, '../renderer/renderer.ts'), 'utf8');

    // 그리드: 썸네일은 썸네일 슬롯으로, 나머지는 이미지가 들고 있는 제목으로.
    expect(imageDisplayGrid).toContain("showSavedImagesForReplace('thumbnail'");
    expect(imageDisplayGrid).toContain('showSavedImagesForReplace({ title: imageHeadingKey }');
    expect(imageDisplayGrid).not.toContain('Number(image?.headingIndex ?? -1)');

    // 이미지 관리 모달의 폴더 교체 버튼도 같은 계약.
    expect(imageManagerCore).toContain('showSavedImagesForReplace({ title: headingTitle }');
    expect(imageManagerCore).not.toMatch(/showSavedImagesForReplace\(idx >= 0/);

    // 픽커: 대상은 이미 확정된 슬롯 객체로 들어온다 — 여기서 숫자를 다시 풀지 않는다.
    expect(renderer).toContain('async function showLocalImagePickerForReplace(folderName: string, slot: ImageSlotTarget)');
    expect(renderer).toContain('const isThumbnailTarget = slot.isThumbnail;');
    expect(renderer).toContain('isThumbnail: isThumbnailTarget');
    expect(renderer).not.toContain("const isThumbnailTarget = targetIndex === 'thumbnail'");
  });

  it('구조 미리보기 상단에 제목·도입부 헤더가 렌더된다', () => {
    const fnAt = fullAutoFlow.indexOf('function updateUnifiedImagePreview');
    expect(fnAt).toBeGreaterThan(-1);
    const fnBody = fullAutoFlow.slice(fnAt, fnAt + 6000);
    expect(fnBody).toContain('previewTitle');
    expect(fnBody).toContain('introductionText');
    expect(fnBody).toContain('✍️ 도입부');
    // 헤더가 소제목 카드들보다 앞에 합쳐진다
    expect(fullAutoFlow).toContain('integratedPreview.innerHTML = headerHtml + (integratedHtml');
  });
});
