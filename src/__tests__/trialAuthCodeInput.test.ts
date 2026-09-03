import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * [2026-09-03] 무료 체험 문자 인증의 앱 절반.
 *
 * 서버(GAS)는 이미 완성돼 있다 — 솔라피 스크립트 속성이 채워지면
 * `isTrialSmsEnabled_()` 가 켜지고, 앱 버전 2.11.204 이상에는 `authCode` 를
 * **필수**로 요구한다(handleTrialActivate).
 *
 * 그런데 앱에는 인증번호 입력칸이 없었고 `free:activate` 를 { nickname, phone }
 * 만으로 호출했다. 즉 솔라피를 켜는 순간 신규·기존 체험 등록이 **전부** 거부된다
 * ('인증번호가 올바르지 않거나 만료되었습니다').
 *
 * 이 테스트는 그 구멍이 다시 열리지 않게 막는다.
 */
const root = join(__dirname, '..', '..');
const login = readFileSync(join(root, 'public', 'login.html'), 'utf-8');
const mainSource = readFileSync(join(root, 'src', 'main.ts'), 'utf-8');

describe('무료 체험 문자 인증 — 앱 입력 경로', () => {
  it('체험 모달에 인증번호 입력칸이 있다', () => {
    expect(login).toMatch(/id="trial-auth-code"/);
  });

  it('free:activate 호출에 authCode 를 실어 보낸다', () => {
    // { nickname, phone } 만 보내던 것이 원인이었다.
    expect(login).toMatch(/invoke\('free:activate',\s*\{[^}]*authCode/);
  });

  it('인증번호 칸은 문자가 실제로 나간 뒤에만 열린다', () => {
    // 발송 성공 응답을 받은 뒤에만 trialCodeRequired 가 켜지고 칸이 열린다.
    // 솔라피가 꺼져 있으면 발송 버튼째 숨어 예전 흐름 그대로 진행된다.
    expect(login).toMatch(/trialCodeRequired = true;/);
    expect(login).toMatch(/trial-auth-code-group[\s\S]{0,80}display: none/);
  });

  it('[인증번호 받기] 버튼이 [인증하기] 와 분리돼 있다', () => {
    // [2026-09-03 사장님 지시] 예전에는 [인증하기] 하나가 자격확인과 문자발송을
    // 겸했다. 단계를 나눠, 자격이 확인된 뒤 눌러서 문자를 받게 한다.
    expect(login).toMatch(/id="trial-send-code-btn"/);
    expect(login).toMatch(/invoke\('free:requestCode'/);
  });

  it('인증번호 요구 여부는 서버(smsRequired)가 정한다', () => {
    // 솔라피가 꺼져 있으면 서버가 코드를 요구하지 않는다 — 그때는 버튼도 숨긴다.
    expect(login).toMatch(/smsRequired/);
    expect(mainSource).toMatch(/smsRequired:\s*result\.smsRequired === true/);
  });

  it('인증번호 발송은 이메일 없이 전화번호만으로 된다', () => {
    // main.ts 가 이메일을 필수로 검사해, 이메일 칸을 없앤 뒤로 이 경로가 막혀 있었다.
    expect(mainSource).toMatch(/requestTrialCode\(userInfo\?: \{ email\?:/);
    // 서버의 중복·이름 검사가 닉네임을 보므로 함께 보낸다.
    expect(mainSource).toMatch(/action: 'trial-request-code'[\s\S]{0,160}nickname/);
  });

  it('verifyTrialEligibility 가 codeSent 를 화면까지 전달한다', () => {
    // 서버가 보낸 codeSent 를 main.ts 가 버리면 화면이 칸을 띄울 수 없다.
    expect(mainSource).toMatch(/codeSent:\s*result\.codeSent === true/);
  });
});
