import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

function readRoot(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-09 사장님 실측] "네이버 API HUB는 저장을 계속하는데도 업데이트만 하면 초기화되네."
 *
 * 설정 파일 3개(settings.json / settings_acct1.json / settings_cd00242.json)를 열어보니
 * naverHubClientId·naverHubClientSecret 이 **한 번도 저장된 적이 없었다**. legacy naverClientId 는 있었다.
 *
 * 뿌리: HUB 입력칸을 읽는 코드는 utils/settingsModal.ts 에 있는데, 그 저장 핸들러가
 * 존재하지 않는 버튼(#settings-modal-save)에 묶여 있어 한 번도 실행되지 않는다.
 * 실제로 동작하는 저장 루틴은 priceInfoModal 의 saveSettingsHandler 인데 HUB 칸을 읽지 않았다.
 * 장소 검색 preload 사고와 같은 계열 — 화면은 있는데 배선이 죽어 있었다.
 */
describe('네이버 API HUB 키 저장', () => {
  const html = readRoot('public/index.html');
  const live = read('renderer/modules/priceInfoModal.ts');
  const dead = read('renderer/utils/settingsModal.ts');

  it('입력칸은 화면에 있다 (전제)', () => {
    expect(html).toMatch(/id="naver-hub-client-id"/);
    expect(html).toMatch(/id="naver-hub-client-secret"/);
  });

  it('실제로 동작하는 저장 루틴이 HUB 칸을 읽는다', () => {
    expect(live).toMatch(/getElementById\('naver-hub-client-id'\)/);
    expect(live).toMatch(/readSecretInputValue\(\s*'naver-hub-client-secret'/);
  });

  it('읽은 값을 저장 payload 에 싣는다', () => {
    expect(live).toMatch(/naverHubClientId: naverHubClientIdValue/);
    expect(live).toMatch(/naverHubClientSecret: naverHubClientSecretValue/);
  });

  it('빈 값이면 키를 아예 넣지 않는다 (기존 저장분을 지우지 않도록)', () => {
    // saveConfig 는 병합이라, 빈 문자열을 실어 보내면 저장돼 있던 키를 덮어써 지운다.
    expect(live).toMatch(/\.\.\.\(naverHubClientIdValue \? \{ naverHubClientId: naverHubClientIdValue \} : \{\}\)/);
    expect(live).toMatch(/\.\.\.\(naverHubClientSecretValue \? \{ naverHubClientSecret: naverHubClientSecretValue \} : \{\}\)/);
  });

  it('불러올 때 입력칸을 채운다 (안 채우면 "또 지워졌다"로 보인다)', () => {
    expect(live).toMatch(/naverHubClientIdEl\.value = \(config as any\)\.naverHubClientId \|\| ''/);
    expect(live).toMatch(/naverHubClientSecretEl\.value = \(config as any\)\.naverHubClientSecret \|\| ''/);
  });

  it('죽은 저장 핸들러가 되살아나 두 경로가 다투지 않는지 확인한다', () => {
    // settingsModal.ts 의 saveSettings 는 존재하지 않는 버튼에 묶여 있어 실행되지 않는다.
    // 그 버튼이 HTML 에 생기면 두 저장 루틴이 같은 설정을 서로 다르게 쓰게 되므로 알아채야 한다.
    expect(dead).toMatch(/getElementById\('settings-modal-save'\)/);
    expect(html).not.toMatch(/id="settings-modal-save"/);
  });

  it('설정 계층은 이미 HUB 키를 보존한다 (전제 확인)', () => {
    const config = read('configManager.ts');
    expect(config).toMatch(/'naverHubClientId', 'naverHubClientSecret',/);
    const migrator = read('security/encryptionMigrator.ts');
    expect(migrator).toMatch(/'naverHubClientId',/);
  });
});
