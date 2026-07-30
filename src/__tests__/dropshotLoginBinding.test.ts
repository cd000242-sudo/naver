import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-31] 사용자 신고: "리더스 나노바나나프로 무제한 로그인 확인을 눌러도
 * 아무 반응이 없다."
 *
 * 원인: index.html에는 로그인 UI가 4세트(mgmt-ds / mgmt-flow / imgstudio-ds /
 * imgstudio-flow) 있는데, bindDropshotLogin의 유일한 호출부가 소제목 이미지
 * 설정 모달의 동적 생성 요소(hsettings-*)만 배선했다. 정적 4세트에는 리스너가
 * 한 번도 붙지 않았고, bindFlowLogin은 호출부가 0건이었다.
 */
describe('dropshot login button binding', () => {
  const html = read('../public/index.html');
  const ui = read('renderer/modules/dropshotLoginUi.ts');
  const tab = read('renderer/modules/imageManagementTab.ts');

  it('index.html의 로그인 UI 4세트가 모두 존재한다 (회귀 시 ID 변경 감지)', () => {
    for (const id of [
      'mgmt-ds-check-btn', 'mgmt-ds-login-btn', 'mgmt-ds-status',
      'mgmt-flow-check-btn', 'mgmt-flow-login-btn', 'mgmt-flow-status',
      'imgstudio-ds-check-btn', 'imgstudio-ds-login-btn', 'imgstudio-ds-status',
      'imgstudio-flow-check-btn', 'imgstudio-flow-login-btn', 'imgstudio-flow-status',
    ]) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it('정적 4세트를 전부 배선하는 함수가 있고 ID가 HTML과 일치한다', () => {
    expect(ui).toContain('export function bindAllStaticDropshotLoginUis');
    for (const id of [
      'mgmt-ds-login-btn', 'mgmt-ds-check-btn', 'mgmt-ds-status',
      'imgstudio-ds-login-btn', 'imgstudio-ds-check-btn', 'imgstudio-ds-status',
      'mgmt-flow-login-btn', 'mgmt-flow-check-btn', 'mgmt-flow-status',
      'imgstudio-flow-login-btn', 'imgstudio-flow-check-btn', 'imgstudio-flow-status',
    ]) {
      expect(ui, id).toContain(`'${id}'`);
    }
    // dropshot/flow 각각 올바른 bind 함수를 쓴다
    expect(ui).toMatch(/for \(const ids of dropshotSets\)[\s\S]{0,140}bindDropshotLogin\(ids\)/);
    expect(ui).toMatch(/for \(const ids of flowSets\)[\s\S]{0,140}bindFlowLogin\(ids\)/);
  });

  it('이미지 관리 탭 초기화에서 실제로 호출된다 (죽은 함수 재발 방지)', () => {
    expect(tab).toContain("import { bindAllStaticDropshotLoginUis } from './dropshotLoginUi.js'");
    expect(tab).toMatch(/initImageManagementTab\(\): Promise<void> \{[\s\S]{0,300}bindAllStaticDropshotLoginUis\(\)/);
  });

  it('요소가 없으면 조용히 건너뛴다 (다른 화면에서 예외 금지)', () => {
    expect(ui).toMatch(/if \(document\.getElementById\(ids\.checkBtnId\)\) \{/);
  });
});
