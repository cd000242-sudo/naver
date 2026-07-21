/**
 * [v2.11.135] 에이전트 원클릭 자동 설정(설치+로그인 연쇄) 배선 잠금.
 *
 * 사용자 요청: CLI 미감지 시 자동 설치 + 인증 UI 원클릭 + 세션 장기 유지.
 * 설치→로그인이 두 번 클릭이던 것을 설치 성공 직후 로그인으로 자동 연쇄해
 * 버튼 한 번으로 끝나게 한다(소스 잠금 — 렌더러 UI 로직).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('원클릭 자동 설정', () => {
  const ui = read('renderer/modules/priceInfoModal.ts');

  // 이 파일은 한글을 \uXXXX 이스케이프로 저장하므로 소스락은 식별자 기준.
  it('설치 성공 직후 미로그인이면 로그인 플로우로 자동 연쇄한다', () => {
    expect(ui).toMatch(/action === 'install'[\s\S]{0,400}postInstall/);
    expect(ui).toMatch(/postInstall\.status\?\.installed && !postInstall\.status\.loggedIn/);
    expect(ui).toMatch(/runAgentLoginWithCodeFallback\(\{[\s\S]{0,200}startLogin: \(\) => api\.agentLogin\(provider\)/);
  });

  it('미설치 카드가 원클릭 자동 설정 버튼을 노출한다 (설치+로그인 연쇄 라벨)', () => {
    // '⚡ 자동 설정 (설치 + 로그인)' → ⚡ 자동 설정 ...
    expect(ui).toMatch(/installBtn\.textContent = '\\u26A1 \\uC790\\uB3D9 \\uC124\\uC815/);
  });
});

describe('감지·설치·세션 배선 (기존 유지 확인)', () => {
  it('gemini 감지는 --version + oauth_creds.json 프로브를 쓴다', () => {
    const detect = read('agentCli/detect.ts');
    expect(detect).toContain("join(homedir(), '.gemini', 'oauth_creds.json')");
    expect(detect).toMatch(/args: \['--version'\]/);
  });

  it('gemini 자동 설치는 공식 npm 패키지를 쓴다', () => {
    const installer = read('agentCli/installer.ts');
    expect(installer).toMatch(/gemini: '@google\/gemini-cli'/);
  });
});
