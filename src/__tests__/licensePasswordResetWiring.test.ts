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
    expect(login).toMatch(/await runPhoneVerification\(status\.userId\)/);
  });

  it('성공 화면보다 먼저 인증을 묻는다 — 10초 대기 뒤로 밀지 않는다', () => {
    const login = read('public/login.html');

    expect(login).toContain('async function maybePhoneVerify()');
    // finishLogin(성공 직전) 말고도 성공 화면 앞에서 최소 2곳이 먼저 부른다.
    expect((login.match(/await maybePhoneVerify\(\)/g) || []).length).toBeGreaterThanOrEqual(3);

    // 재인증 성공 경로: 인증 호출이 초록 성공 박스 생성보다 앞에 있어야 한다.
    // 줄끝(CRLF/LF)에 기대지 않는다 — 릴리즈가 파일을 재체크아웃하면 줄끝이 바뀐다.
    const flat = login.replace(/\r\n/g, '\n');
    const verifyAt = flat.indexOf('await maybePhoneVerify();\n\n            // 성공 메시지');
    const boxAt = flat.indexOf('축하합니다 인증되셨습니다');
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

/*
 * [2026-09-05] preload 화이트리스트 계약.
 *
 * 로그인창은 contextIsolation 아래서 preloadLogin 의 electronAPI 로만 IPC 를 부른다.
 * 목록에 없는 채널은 메인에 핸들러가 있어도 "Channel not allowed" 로 거절된다.
 * 본인인증(2026-09-04)이 정확히 이것 때문에 배포 후 한 번도 동작하지 않았고,
 * finishLogin 이 예외를 console.warn 으로 삼켜 아무도 모른 채 지나갔다.
 *
 * 그래서 채널 하나하나를 세지 않고 **login.html 이 실제로 부르는 전부**를 훑는다.
 * 새 채널을 추가하면서 preload 등록을 빠뜨리면 여기서 잡힌다.
 */
describe('preload 채널 화이트리스트', () => {
  it('login.html 이 부르는 invoke 채널이 모두 preloadLogin 에 등록돼 있다', () => {
    const login = read('public/login.html');
    const preload = read('src/preloadLogin.ts');

    const allowed = preload.slice(
      preload.indexOf('const ALLOWED_INVOKE_CHANNELS'),
      preload.indexOf('const ALLOWED_SEND_CHANNELS'),
    );
    const used = Array.from(new Set(
      (login.match(/invoke\('([^']+)'/g) || []).map((m) => m.slice("invoke('".length, -1)),
    ));

    expect(used.length).toBeGreaterThan(10);
    const missing = used.filter((channel) => !allowed.includes(`'${channel}'`));
    expect(missing).toEqual([]);
  });

  it('본인인증·비밀번호 변경 채널이 명시적으로 들어 있다', () => {
    const preload = read('src/preloadLogin.ts');

    for (const channel of [
      'license:phoneStatus',
      'license:phoneRequestCode',
      'license:phoneConfirm',
      'license:passwordResetRequest',
      'license:passwordResetConfirm',
    ]) {
      expect(preload).toContain(`'${channel}'`);
    }
  });
});

/*
 * [2026-09-05] 로그인 화면 구조 계약.
 *
 * 사장님 지시: 매일 쓰는 사람 기준으로 짜라. 로그인이 기본이고, 라이선스코드 등록은
 * 평생 한 번이니 모달로 빼라. 자동 로그인은 하지 말고 채워만 둬라.
 *
 * 이 계약이 없으면 "등록 화면이 기본" 구조로 조용히 되돌아갈 수 있다.
 */
describe('로그인 화면 구조', () => {
  it('기본 화면은 로그인이다 — 등록 화면이 아니다', () => {
    const login = read('public/login.html');

    expect(login).toContain('let isReauthMode = true;');
    // 로그인 칸이 숨겨진 채로 시작하면 안 된다.
    expect(login).toContain('<div id="reauth-section">');
    expect(login).not.toContain('id="reauth-section" style="display: none;"');
    // 등록 칸은 폼이 아니라 모달 안에 있다.
    expect(login).not.toContain('id="initial-auth-section"');
    expect(login).toContain('id="license-register-backdrop"');
  });

  it('하단 버튼 4개가 있고, 없앤 진입점은 남지 않는다', () => {
    const login = read('public/login.html');

    for (const id of [
      'open-license-register-btn',
      'open-purchase-btn',
      'open-phone-verify-btn',
      'open-password-reset-btn',
    ]) {
      expect(login).toContain(`id="${id}"`);
    }
    // 토글 링크와 삭제 버튼은 버튼·체크박스가 대체했다.
    expect(login).not.toContain('toggle-auth-mode');
    expect(login).not.toContain('clear-credentials-btn');
  });

  it('등록은 검증된 기존 분기를 그대로 탄다 — 제출 로직을 복제하지 않는다', () => {
    const login = read('public/login.html');

    expect(login).toContain("document.getElementById('login-form')?.requestSubmit()");
    // 모달을 열면 등록 분기로, 닫으면 로그인으로 되돌아간다.
    expect(login).toContain('isReauthMode = !open;');
    // register IPC 를 모달이 직접 부르면 분기가 두 벌이 된다.
    expect((login.match(/invoke\('license:register'/g) || []).length).toBe(1);
  });

  it('자동 로그인은 하지 않는다 — 채우기만 한다', () => {
    const login = read('public/login.html');

    expect(login).toContain('async function prefillSavedCredentials()');
    expect(login).not.toContain('switchToReauthModeAndAutoLogin');
    expect(login).not.toContain('loadSavedCredentials');

    // 채우기 함수 안에서 로그인 IPC 를 부르면 자동 로그인이 되살아난다.
    const flat = login.replace(/\r\n/g, '\n');
    const start = flat.indexOf('async function prefillSavedCredentials()');
    const body = flat.slice(start, flat.indexOf('\n    }', start));
    expect(body).not.toContain('license:verifyWithCredentials');

    // 기억하기를 끄면 저장분이 지워진다 — 그래서 삭제 버튼이 없어도 된다.
    expect(login).toContain("document.getElementById('remember-credentials')?.addEventListener('change'");
    expect(login).toContain('await clearSavedCredentials();');
  });

  it('본인인증 모달은 어느 계정인지 보여준다 (읽기전용)', () => {
    const login = read('public/login.html');

    expect(login).toContain('id="phone-verify-userid"');
    expect(login).toMatch(/id="phone-verify-userid"[^>]*readonly/);
    expect(login).toContain('function runPhoneVerification(loggedInUserId)');
    expect(login).toContain("userIdField.value = loggedInUserId || ''");
  });
});
