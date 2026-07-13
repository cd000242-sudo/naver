import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * 쇼핑커넥트 소제목 이미지 방식(수집/AI) 선택 UI — 초보자 가시성.
 * 메인 풀오토 이미지 설정 깊숙이 있던 선택지를 쇼핑커넥트 설정(장단점 표/
 * CTA 배너 체크박스) 바로 아래에 노출. 저장소는 기존 scSubImageMode를
 * 공유해야 발행 플로우(IPC scSubImageSource)와 자동 연동된다.
 */
describe('쇼핑커넥트 소제목 이미지 방식 인라인 UI', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'renderer.ts'), 'utf-8');

  it('인라인 선택 블록 생성 함수가 존재하고 호출된다', () => {
    expect(src).toContain('function addShoppingConnectSubImageModeOption');
    expect(src).toContain('addShoppingConnectSubImageModeOption();');
  });

  it('기존 scSubImageMode 저장소(window.setSubImageMode)를 공유한다', () => {
    const fn = src.slice(src.indexOf('function addShoppingConnectSubImageModeOption'));
    expect(fn).toContain('setSubImageMode');
    expect(fn).toContain("'scSubImageMode'");
    expect(fn).toContain("'collected'");
    expect(fn).toContain("'ai'");
  });

  it('체크박스 컨테이너(shopping-connect-ai-image-options) 아래에 배치된다', () => {
    const fn = src.slice(src.indexOf('function addShoppingConnectSubImageModeOption'));
    expect(fn).toContain('shopping-connect-ai-image-options');
    expect(fn).toContain('insertAdjacentElement');
  });
});

// 2026-06-12 라운드2: 선택지를 쇼핑커넥트 설정으로 이설했으므로 메인 풀오토
// 이미지 설정 모달의 "쇼핑커넥트 전용" 섹션은 제거 — 동일 설정 이중 노출 방지.
// 자동 썸네일 체크박스는 인라인 섹션으로 이설 (scAutoThumbnailSetting 저장소 유지).
describe('메인 이미지 설정 쇼핑커넥트 섹션 제거 (이설 완료)', () => {
  it('메인 모달에 쇼핑커넥트 전용 섹션이 없다', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'components', 'HeadingImageSettings.ts'), 'utf-8');
    expect(src).not.toContain('shopping-connect-options');
    expect(src).not.toContain('sc-sub-image-source');
    expect(src).not.toContain('sc-auto-thumbnail-setting');
  });

  it('자동 썸네일 체크박스가 인라인 섹션에 있고 같은 저장소를 쓴다', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'renderer.ts'), 'utf-8');
    expect(src).toContain('sc-auto-thumbnail-inline');
    expect(src).toContain("localStorage.setItem('scAutoThumbnailSetting'");
  });

  it('연동 체인: 발행 플로우가 getSubImageMode를 읽고 IPC로 전달한다', () => {
    const ph = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'modules', 'publishingHandlers.ts'), 'utf-8');
    const store = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'utils', 'subImageMode.ts'), 'utf-8');
    expect(ph).toContain('getSubImageMode');
    expect(ph).toContain('scSubImageSource');
    expect(store).toContain("(window as any).setSubImageMode = setSubImageMode");
  });

  it('풀오토 생성기는 숨은 체크박스가 아니라 스냅샷의 쇼핑 이미지 모드와 엔진을 따른다', () => {
    const fullAuto = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'modules', 'fullAutoFlow.ts'), 'utf-8');

    expect(fullAuto).toContain("formData.scSubImageMode === 'ai'");
    expect(fullAuto).toContain('formData.scAIImageEngine || formData.imageSource');
    expect(fullAuto).not.toContain("document.getElementById('unified-use-ai-image')?.checked ?? true");
  });
});
