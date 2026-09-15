/**
 * [2026-09-15 사장님 실측] "너가 띄운 크롬창 로그인되어 있는데도
 * '⚠️ Flow 로그인 또는 연결이 진행 중입니다' 이렇게 떠."
 *
 * 뿌리: isLoggedInToFlow 가 주소만 보고 workspace 가 아니면 세션을 보지도 않고 false 를
 * 돌려줬다. 로그인 직후 창은 accounts.google.com 에 서 있는 일이 흔해서, 멀쩡한 로그인이
 * "안 됨"으로 뭉개졌다. 그리고 checkActiveFlowLogin 은 탭을 옮기지 않으므로 영영 그 상태였다.
 *
 * 드롭샷에서 세운 계약과 같다 — **판정 불가는 로그아웃이 아니다.**
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isFlowWorkspaceUrl } from '../image/flowWorkspaceEntryPolicy';

const src = readFileSync(resolve(__dirname, '../image/flowGenerator.ts'), 'utf8');
const region = (from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

describe('workspace 주소 판정 — 오탐의 출발점', () => {
  it('로그인 직후 머무는 구글 인증 주소는 workspace 가 아니다', () => {
    expect(isFlowWorkspaceUrl('https://accounts.google.com/signin/v2/challenge')).toBe(false);
    expect(isFlowWorkspaceUrl('https://myaccount.google.com/')).toBe(false);
  });

  it('workspace 주소는 참으로 본다', () => {
    expect(isFlowWorkspaceUrl('https://labs.google/fx/tools/flow')).toBe(true);
    expect(isFlowWorkspaceUrl('https://flow.google.com/')).toBe(true);
  });
});

describe('세 갈래 판정이 생겼다', () => {
  const fn = () => region('async function classifyFlowPageLogin', '\n// ✅ [v2.7.68]');

  it('workspace 가 아니면 logged-out 이 아니라 unknown 이다', () => {
    expect(fn()).toMatch(/isFlowWorkspaceUrl\(page\.url\(\)\) \? 'logged-out' : 'unknown'/);
  });

  it('로그인 판정은 기존 함수를 먼저 쓴다 — 주소로 가로채지 않는다', () => {
    const body = fn();
    const loginAt = body.indexOf('isLoggedInToFlow(page)');
    const urlAt = body.indexOf('isFlowWorkspaceUrl');
    expect(loginAt).toBeGreaterThan(-1);
    expect(loginAt).toBeLessThan(urlAt);
  });

  it('예외도 unknown 이다 — 못 읽은 걸 로그아웃으로 적지 않는다', () => {
    expect(fn()).toMatch(/catch \{[\s\S]*return 'unknown'/);
  });

  it('workspace 에서 신호가 없을 때만 logged-out', () => {
    expect(fn()).toMatch(/if \(await isLoggedInToFlow\(page\)\) return 'logged-in'/);
  });
});

describe('판정 불가일 때 배경 탭으로 한 번 더 확인한다', () => {
  const check = () => region('async function checkActiveFlowLogin', '\nasync function checkFlowLoginInner');

  it('사용자가 로그인 중인 탭은 옮기지 않는다 — 새 탭에서 본다', () => {
    const probe = region('async function probeFlowLoginInBackgroundTab', '\n/** Inspect the connection owner');
    expect(probe).toMatch(/context\.newPage\(\)/);
    expect(probe).toMatch(/labs\.google\/fx\/tools\/flow/);
    // 확인용 탭은 반드시 닫는다.
    expect(probe).toMatch(/probe\.close\(\)/);
  });

  it('진짜 로그아웃과 판정 불가의 안내가 다르다', () => {
    const body = check();
    expect(body).toMatch(/anyLoggedOut/);
    expect(body).toMatch(/Flow 로그인이 필요합니다/);
    expect(body).toMatch(/아직 확인하지 못했습니다/);
  });

  it('배경 탭이 로그인을 확인하면 그대로 성공으로 돌려준다', () => {
    const body = check();
    expect(body).toMatch(/probeTab = await probeFlowLoginInBackgroundTab/);
    expect(body).toMatch(/if \(probeTab\)[\s\S]*loggedIn: true/);
  });

  it('확인 탭은 끝나면 닫는다', () => {
    expect(check()).toMatch(/finally \{[\s\S]*probeTab\.close\(\)/);
  });

  it('옛 오탐 문구는 더 이상 쓰지 않는다', () => {
    expect(check()).not.toMatch(/로그인 또는 연결이 진행 중입니다/);
  });
});
