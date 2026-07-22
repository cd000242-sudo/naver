import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * [v2.11.141] 이미지 엔진 선택 무시 버그 회귀 잠금.
 *
 * 실측(사용자 보고): 메인 풀오토 이미지 설정에서 어떤 엔진을 골라도 dropshot
 * (리더스 나노바나나 무제한)으로 생성. 메커니즘:
 *  1. #image-source-select(이미지 관리탭)의 HTML 기본 selected가 dropshot →
 *     앱 시작마다 드롭다운이 dropshot으로 리셋.
 *  2. getImageSource()는 이 드롭다운을 localStorage(모달 저장값)보다 먼저 읽고,
 *     드롭다운은 항상 값이 있어 모달 선택이 영원히 무시 + 역으로 덮어씀.
 *
 * 수정 계약: (a) 시작 시 저장된 엔진으로 드롭다운 복원, (b) 모달 확인 시
 * setGlobalImageSource가 드롭다운을 미러 동기화.
 */
describe('image engine selection sync (v2.11.141)', () => {
  it('앱 시작 시 저장된 엔진으로 #image-source-select를 복원한다', () => {
    const src = readFileSync(
      resolve(__dirname, '../renderer/modules/imageManagementTab.ts'), 'utf8');
    const restoreAt = src.indexOf("localStorage.getItem('globalImageSource')");
    const changeListenerAt = src.indexOf("imageSourceSelect.addEventListener('change'");
    expect(restoreAt).toBeGreaterThan(-1);
    expect(changeListenerAt).toBeGreaterThan(-1);
    // 복원이 change 리스너 등록보다 먼저 (초기 상태 확정 후 배선)
    expect(restoreAt).toBeLessThan(changeListenerAt);
    expect(src).toContain('저장된 엔진으로 드롭다운 복원');
  });

  it('setGlobalImageSource가 #image-source-select를 미러 동기화한다', () => {
    const src = readFileSync(
      resolve(__dirname, '../renderer/components/HeadingImageSettings.ts'), 'utf8');
    const fnAt = src.indexOf('export function setGlobalImageSource');
    expect(fnAt).toBeGreaterThan(-1);
    const fnBody = src.slice(fnAt, fnAt + 2500);
    expect(fnBody).toContain("document.getElementById('image-source-select')");
    expect(fnBody).toContain('mirrorSelect.value = normalized');
  });
});
