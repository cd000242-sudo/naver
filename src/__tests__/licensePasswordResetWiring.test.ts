import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * [2026-09-05] 본인인증 상시 버튼 + 비밀번호 변경 — 배선 계약.
 *
 * 사장님 지적 4가지를 잠근다:
 *   ① 본인인증 버튼이 화면에 없다 — 성공 박스가 뜨고 10초 뒤에야 창이 스쳐 지나갔다.
 *   ② 비밀번호 변경 수단이 아예 없다 — 잊으면 관리자 문의 말고는 길이 없었다.
 *   ③ 올인원인데 라이선스 행 하나에만 인증이 찍혀 다른 제품에서 또 물었다.
 *   ④ 같은 아이디로 코드를 여러 장 받은 사용자가 자기 번호에 "이미 등록된 번호"로 막혔다.
 *
 * 서버(GAS)는 사장님이 손으로 붙여넣어 배포한다 — 앱만 고쳐서는 ③④가 안 풀린다.
 * 그래서 라이브 소스 파일까지 같이 잠근다.
 */
function read(rel: string): string {
  return readFileSync(join(__dirname, '..', '..', rel), 'utf8');
}

const GAS = 'payment-page/.gas-license-backend/Code.js.live-2026-09-04-fixed';

describe('본인인증 상시 버튼', () => {
  it('로그인 화면에 버튼이 있고, 눌러서 인증창을 연다', () => {
    const login = read('public/login.html');

    expect(login).toContain('id="open-phone-verify-btn"');
    expect(login).toMatch(/open-phone-verify-btn'\)\?\.addEventListener\('click'/);
    expect(login).toContain('await runPhoneVerification()');
  });

  it('성공 화면보다 먼저 인증을 묻는다 — 10초 대기 뒤로 밀지 않는다', () => {
    const login = read('public/login.html');

    expect(login).toContain('async function maybePhoneVerify()');
    // finishLogin(성공 직전) 말고도 성공 화면 앞에서 최소 2곳이 먼저 부른다.
    expect((login.match(/await maybePhoneVerify\(\)/g) || []).length).toBeGreaterThanOrEqual(3);

    // 재인증 성공 경로: 인증 호출이 초록 성공 박스 생성보다 앞에 있어야 한다.
    const verifyAt = login.indexOf('await maybePhoneVerify();\n\n            // 성공 메시지');
    const boxAt = login.indexOf('축하합니다 인증되셨습니다');
    expect(verifyAt).toBeGreaterThan(0);
    expect(verifyAt).toBeLessThan(boxAt);
  });

  it('로그인 전/이미 인증됨을 구분해 말한다 — needed:false 하나로 뭉개지 않는다', () => {
    const main = read('src/main.ts');
    const status = main.slice(main.indexOf("ipcMain.handle('license:phoneStatus'"), main.indexOf("ipcMain.handle('license:phoneRequestCode'"));

    expect(status).toMatch(/loggedIn:\s*false/);
    expect(status).toMatch(/loggedIn:\s*true/);
    expect(status).toMatch(/verified/);
  });
});

describe('비밀번호 변경', () => {
  it('로그인 화면에서 세션 없이 열 수 있다', () => {
    const login = read('public/login.html');

    expect(login).toContain('id="open-password-reset-btn"');
    expect(login).toContain('id="pw-reset-backdrop"');
    expect(login).toContain("invoke('license:passwordResetRequest'");
    expect(login).toContain("invoke('license:passwordResetConfirm'");
    // 새 비밀번호는 두 번 받아 오타를 거른다.
    expect(login).toContain('id="pw-reset-new2"');
  });

  it('IPC 는 세션이 아니라 등록된 번호로 본인을 증명한다', () => {
    const main = read('src/main.ts');

    expect(main).toContain("ipcMain.handle('license:passwordResetRequest'");
    expect(main).toContain("ipcMain.handle('license:passwordResetConfirm'");
    expect(main).toContain("callLicenseResetGas('license-password-reset-request'");
    expect(main).toContain("callLicenseResetGas('license-password-reset-confirm'");
    // 비번을 잊은 사람은 로그인이 안 된다 — 세션을 요구하는 통로를 타면 안 된다.
    const reset = main.slice(main.indexOf('async function callLicenseResetGas'), main.indexOf("ipcMain.handle('license:passwordResetConfirm'"));
    expect(reset).not.toContain('callLicensePhoneGas');
    expect(reset).not.toContain('sessionToken');
  });

  it('저장해 둔 자동 로그인 비밀번호도 같이 갱신한다', () => {
    const main = read('src/main.ts');
    const confirm = main.slice(main.indexOf("ipcMain.handle('license:passwordResetConfirm'"));

    expect(confirm.slice(0, 2000)).toContain('savedLicensePassword: newPassword');
  });

  it('서버가 번호 일치를 확인하고, 같은 아이디의 모든 행에 새 해시를 쓴다', () => {
    const gas = read(GAS);

    expect(gas).toContain("case 'license-password-reset-request':");
    expect(gas).toContain("case 'license-password-reset-confirm':");
    expect(gas).toContain("'license-password-reset-request', 'license-password-reset-confirm'");
    expect(gas).toContain('function passwordResetRowsFor_(');
    expect(gas).toContain('function handleLicensePasswordResetConfirm(');

    const confirm = gas.slice(gas.indexOf('function handleLicensePasswordResetConfirm('), gas.indexOf('[2026-09-03] set-user-phone'));
    // 평문 저장 금지.
    expect(confirm).toContain('var hashed = hashPassword(newPassword);');
    expect(confirm).not.toMatch(/setValue\(newPassword\)/);
    // 한 행이 아니라 그 사람의 모든 행.
    expect(confirm).toMatch(/for \(var i = 0; i < rows\.length; i\+\+\)/);
  });
});

describe('올인원·다중 코드 (한 사람 = 한 번 인증)', () => {
  it('본인인증을 같은 아이디의 모든 라이선스 행에 찍는다', () => {
    const gas = read(GAS);

    expect(gas).toContain('function licenseRowsForUserId_(');
    const confirm = gas.slice(gas.indexOf('function handleLicensePhoneConfirm('), gas.indexOf('비밀번호 재설정 (2026-09-05)'));
    expect(confirm).toContain('licenseRowsForUserId_(sheet, headers, data.userId)');
    expect(confirm).toMatch(/for \(var t = 0; t < targetRows\.length; t\+\+\)/);
    // 세션이 걸린 행 하나에만 찍던 옛 동작은 남아 있으면 안 된다.
    expect(confirm).not.toMatch(/sheet\.getRange\(rowNum, phoneCol\)\.setValue/);
  });

  it('중복 번호 판정이 아이디 단위다 — 본인의 다른 코드 행에 막히지 않는다', () => {
    const gas = read(GAS);
    const owner = gas.slice(gas.indexOf('function licensePhoneOwner_('), gas.indexOf('function licensePhoneJson_('));

    expect(owner).toContain('ownerUserId');
    expect(owner).toContain("var owner = String(ownerUserId || '').trim();");
    expect(owner).toMatch(/if \(owner && ids && String\(ids\[i\]\[0\] \|\| ''\)\.trim\(\) === owner\) continue;/);

    // 호출부가 아이디를 넘겨야 실제로 효과가 있다.
    expect((gas.match(/licensePhoneOwner_\(sheet, headers, phone, rowNum, data\.userId\)/g) || []).length).toBe(2);
    expect(gas).not.toMatch(/licensePhoneOwner_\(sheet, headers, phone, rowNum\)/);
  });
});
