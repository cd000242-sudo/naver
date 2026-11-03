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
  const flow = read('renderer/modules/agentConnectFlow.ts');

  // [2026-11-03] 설치 → 로그인 → 실제 답 확인은 agentConnectFlow 한 곳이 맡고, 화면 버튼은 그 흐름만 호출한다.
  it('미설치·미로그인 버튼이 같은 연결 흐름을 호출한다 (옛 bindAgentAction 은 없다)', () => {
    expect(ui).toMatch(/bindAgentConnect\(installBtn, t\.provider, el\)/);
    expect(ui).toMatch(/bindAgentConnect\(loginBtn, t\.provider, el\)/);
    expect(ui).toMatch(/await agentConnectRun\(\{/);
    expect(ui).not.toContain('bindAgentAction');
  });

  it('연결 흐름은 설치 뒤 미로그인이면 로그인으로 이어 가고 마지막에 실제 답을 확인한다', () => {
    expect(flow).toMatch(/runAgentLoginWithCodeFallback\(\{[\s\S]{0,260}startLogin: \(\) => ctx\.api\.agentLogin\(ctx\.provider\)/);
    expect(flow).toMatch(/agentConnectClassify\(current\.status\) === 'install'[\s\S]{0,200}agentConnectInstall\(ctx\)/);
    expect(flow).toMatch(/kind === 'login'[\s\S]{0,200}agentConnectLogin\(ctx\)/);
    expect(flow).toMatch(/mark\(4\);[\s\S]{0,60}agentConnectVerify\(ctx\)/);
  });

  it('버튼 문구가 연결하기(설치 → 로그인 → 확인) / 연결하기(로그인 → 확인) 이다', () => {
    expect(ui).toContain("installBtn.textContent = '⚡ 연결하기 (설치 → 로그인 → 확인)'");
    expect(ui).toContain("loginBtn.textContent = '🔑 연결하기 (로그인 → 확인)'");
  });
});

describe('감지·설치·세션 배선 (기존 유지 확인)', () => {
  // [v2.11.145] gemini provider는 agy(Antigravity CLI)로 이관. agy는 자격증명을 OS 키링에
  // 두므로 stat할 oauth_creds.json이 없고, 로그인 판정은 `agy models` 프로브로 바뀌었다.
  it('gemini 감지는 --version + models 프로브를 쓴다', () => {
    const detect = read('agentCli/detect.ts');
    expect(detect).toMatch(/args: \['--version'\]/);
    expect(detect).toMatch(/args: \['models'\]/);
    expect(detect).not.toContain('oauth_creds.json');
  });

  it('설치 제한 시간은 15분, 로그인 제한 시간은 10분이다', () => {
    const installer = read('agentCli/installer.ts');
    expect(installer).toMatch(/const INSTALL_TIMEOUT_MS = 900_000;/);
    expect(installer).toMatch(/const LOGIN_TIMEOUT_MS = 600_000;/);
  });

  it('Google 구독 경로는 실행 계약과 같은 agy 공식 바이너리를 설치한다', () => {
    const installer = read('agentCli/installer.ts');
    const start = installer.indexOf("if (provider === 'gemini') {", installer.indexOf('async function performInstall'));
    const branch = installer.slice(start, installer.indexOf('const pkg =', start));
    expect(branch).toContain('installAgyBinary(');
    expect(branch).not.toContain('resolveNpmInvocation');
  });
});
