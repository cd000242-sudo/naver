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

  it('[v2.11.141b] 썸네일 카드의 "저장된 이미지" 교체는 썸네일 슬롯으로 라우팅된다', () => {
    // 실측 버그: 수동 썸네일의 headingIndex=0이 소제목 1로 해석돼 교체 이미지가
    // 소제목 1의 그리드/미리보기에 들어가고 정작 썸네일은 안 바뀌었다.
    const imageDisplayGrid = readFileSync(
      resolve(__dirname, '../renderer/modules/imageDisplayGrid.ts'), 'utf8');
    const renderer = readFileSync(
      resolve(__dirname, '../renderer/renderer.ts'), 'utf8');
    // 그리드: 썸네일 카드 감지 → 'thumbnail' 타깃 호출 (headingIndex 해석보다 먼저)
    const guardAt = imageDisplayGrid.indexOf("showSavedImagesForReplace('thumbnail'");
    const indexResolveAt = imageDisplayGrid.indexOf('Number(image?.headingIndex ?? -1)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(indexResolveAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(indexResolveAt);
    // 픽커: 썸네일 타깃은 '🖼️ 썸네일' 키 + isThumbnail로 직접 등록
    expect(renderer).toContain("targetIndex: number | 'thumbnail'");
    expect(renderer).toContain("const isThumbnailTarget = targetIndex === 'thumbnail'");
    expect(renderer).toContain('isThumbnail: isThumbnailTarget');
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
