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
