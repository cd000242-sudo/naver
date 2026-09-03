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

  it('인증번호 칸은 문자가 실제로 발송됐을 때만(codeSent) 나타난다', () => {
    // 솔라피가 꺼져 있는 동안에는 예전 흐름 그대로여야 한다 — 과도기 보호.
    expect(login).toMatch(/codeSent/);
  });

  it('verifyTrialEligibility 가 codeSent 를 화면까지 전달한다', () => {
    // 서버가 보낸 codeSent 를 main.ts 가 버리면 화면이 칸을 띄울 수 없다.
    expect(mainSource).toMatch(/codeSent:\s*result\.codeSent === true/);
  });
});
