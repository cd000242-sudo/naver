import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * [2026-09-04] 유료 라이선스 휴대폰 본인인증 — 배선 계약.
 *
 * 왜 필요한가: 비밀번호를 잊은 고객을 되살리려면 "이 사람이 본인"임을 증명할 수단이
 * 있어야 하고, 그 번호는 계정에 붙어 있어야 쓸모가 있다. 지금 유료 계정에는 번호가
 * 사실상 비어 있다(356행 중 1건, 2026-09-04 실측).
 *
 * 사장님 결정: 유료는 **강제하지 않는다** — [나중에 하기]로 넘어갈 수 있다.
 * 대신 인증을 마치면 그 뒤로는 다시 묻지 않는다(서버가 phoneVerified 를 내려준다).
 *
 * 무료 체험자는 대상이 아니다 — 아이디·세션 자체가 없으므로 창이 뜨면 안 된다.
 */
function read(rel: string): string {
  return readFileSync(join(__dirname, '..', '..', rel), 'utf8');
}

describe('유료 라이선스 휴대폰 본인인증 배선', () => {
  it('로그인 응답의 phoneVerified 를 라이선스에 저장한다 — 이게 있어야 "다시 안 묻기"가 성립한다', () => {
    const manager = read('src/licenseManager.ts');

    expect(manager).toContain('phoneVerified?: boolean');
    expect(manager).toContain('phoneVerified: result.phoneVerified === true');
  });

  it('인증번호 발송·확정 IPC 가 서버 액션을 부른다', () => {
    const main = read('src/main.ts');

    expect(main).toContain("ipcMain.handle('license:phoneStatus'");
    expect(main).toContain("ipcMain.handle('license:phoneRequestCode'");
    expect(main).toContain("ipcMain.handle('license:phoneConfirm'");
    expect(main).toContain("callLicensePhoneGas('license-phone-request-code'");
    expect(main).toContain("callLicensePhoneGas('license-phone-confirm'");
    // 본인 증명은 세션이다 — 앱에 관리자 토큰을 심을 수 없다.
    expect(main).toContain('sessionToken: license.sessionToken');
    // 확정에 성공하면 로컬에도 적어 다음 실행에서 다시 묻지 않는다.
    expect(main).toContain('phoneVerified: true');
  });

  it('세션이 없는 사용자(무료 체험)에게는 인증 창을 띄우지 않는다', () => {
    const main = read('src/main.ts');
    const status = main.slice(main.indexOf("ipcMain.handle('license:phoneStatus'"));
    expect(status.slice(0, 1200)).toMatch(/needed:\s*false/);
    expect(status.slice(0, 1200)).toMatch(/sessionToken/);
  });

  it('로그인창은 login:success 전에 인증 기회를 한 번 준다 — 직접 호출은 남기지 않는다', () => {
    const login = read('public/login.html');

    expect(login).toContain('async function finishLogin()');
    expect(login).toContain("invoke('license:phoneStatus')");
    expect(login).toContain("invoke('license:phoneRequestCode'");
    expect(login).toContain("invoke('license:phoneConfirm'");
    // [나중에 하기] — 사장님 결정: 유료는 강제하지 않는다.
    expect(login).toContain('나중에 하기');
    // 모든 성공 경로가 finishLogin 을 지나야 한다 — 남은 직접 호출은 finishLogin 안의 1개뿐.
    expect(login.match(/ipcRenderer\.invoke\('login:success'\)/g)?.length).toBe(1);
    expect(login.match(/await finishLogin\(\)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('앱 버전이 2.11.222 다', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.version).toBe('2.11.222');
  });
});
