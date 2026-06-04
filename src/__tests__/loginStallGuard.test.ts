/**
 * loginStallGuard.test.ts
 *
 * 자동 로그인 클릭이 실제 챌린지 없이 응답하지 않는 경우를
 * 10분 보안인증 대기와 분리한다. 사용자는 이 케이스를 "멍때림"으로 느낀다.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.resolve(__dirname, '../naverBlogAutomation.ts');
const code = fs.readFileSync(FILE, 'utf-8');

describe('자동 로그인 generic stall guard', () => {
  it('generic login stall timeout은 90초로 제한한다', () => {
    expect(code).toMatch(/GENERIC_LOGIN_STALL_TIMEOUT\s*=\s*90000/);
  });

  it('genericLoginStallDetected 상태 플래그가 존재한다', () => {
    expect(code).toMatch(/let\s+genericLoginStallDetected\s*=\s*false/);
    expect(code).toMatch(/genericLoginStallDetected\s*=\s*true/);
  });

  it('캡차/2FA가 아닌 로그인 페이지 정체는 명확한 오류로 종료된다', () => {
    expect(code).toMatch(/stuckDuration\s*>\s*GENERIC_LOGIN_STALL_TIMEOUT/);
    expect(code).toMatch(/자동 로그인 응답 없음/);
  });

  it('캡차와 2FA는 기존 10분 보안인증 대기 경로를 보존한다', () => {
    expect(code).toMatch(/const\s+LOGIN_TOTAL_TIMEOUT\s*=\s*600000/);
    expect(code).toMatch(/캡차\/보안문자 감지/);
    expect(code).toMatch(/2단계 인증 승인 대기/);
  });
});
