import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-08 사용자 실측] 업데이트를 취소했더니 "Better Life Naver / 시작하는 중..."
 * 스플래시가 백그라운드에서 계속 돌았다. 작업관리자로만 끌 수 있었다.
 *
 * 근본 원인: main.ts 의 부팅 시퀀스가 업데이트를 발견하면 `return` 으로 끝났다.
 * 재시작 다이얼로그에서 "나중에"를 고르는 시점에는 인증창/메인창을 만드는 코드가 이미
 * 지나간 뒤라, splash 를 닫아 줄 주체가 아무도 없었다. splash 는 frame:false 라 사용자가
 * 직접 닫을 수도 없었다.
 *
 * 수정 두 갈래:
 *   (1) splash 에 닫기 버튼 — 언제든 빠져나올 수 있는 탈출구. splash 가 마지막 창이므로
 *       닫으면 window-all-closed 가 프로세스를 정상 종료시킨다.
 *   (2) 업데이트를 멈추는 모든 경로가 보류 신호를 보내고, 부팅은 return 대신 그 신호를
 *       기다렸다가 이어간다.
 */
describe('splash — 닫기 버튼(탈출구)', () => {
  const main = read('main.ts');

  it('splash HTML 에 닫기 버튼이 있다', () => {
    expect(main).toMatch(/id="splash-close"/);
    expect(main).toMatch(/#splash-close \{[^}]*position: absolute/);
  });

  it('닫기 버튼이 실제로 창을 닫는다', () => {
    expect(main).toMatch(/getElementById\('splash-close'\)\.addEventListener\('click'[\s\S]{0,80}window\.close\(\)/);
  });

  it('버튼이 드래그 영역에 먹히지 않는다 (클릭 가능)', () => {
    expect(main).toMatch(/#splash-close \{[^}]*-webkit-app-region: no-drag/);
  });

  it('마지막 창을 닫으면 프로세스가 종료된다 (유령 프로세스 방지)', () => {
    expect(main).toMatch(/app\.on\('window-all-closed'[\s\S]{0,200}app\.quit\(\)/);
  });
});

describe('업데이트 보류 시 부팅 재개', () => {
  const main = read('main.ts');
  const updater = read('updater.ts');

  it('부팅이 업데이트 발견 시 return 으로 끝나지 않는다 (회귀 잠금)', () => {
    const boot = main.slice(main.indexOf('const hasUpdate = await waitForUpdateCheck()'));
    const branch = boot.slice(0, boot.indexOf('}') + 1);
    expect(branch).not.toMatch(/^\s*return;\s*$/m);
    expect(branch).toMatch(/await waitForUpdateDeferral\(\)/);
  });

  it('updater 가 보류 신호를 노출한다', () => {
    expect(updater).toMatch(/export function waitForUpdateDeferral\(\): Promise<void>/);
    expect(updater).toMatch(/function notifyUpdateDeferred\(reason: string\): void/);
  });

  it('"나중에" 두 경로 모두 보류를 알린다', () => {
    const defers = updater.match(/notifyUpdateDeferred\('사용자 "나중에" 선택'\)/g) ?? [];
    expect(defers).toHaveLength(2);
  });

  it('다이얼로그 실패·업데이트 오류도 부팅을 풀어준다 (splash 고착 차단)', () => {
    expect(updater).toMatch(/notifyUpdateDeferred\('다이얼로그 에러'\)/);
    expect(updater).toMatch(/notifyUpdateDeferred\('다이얼로그 실패'\)/);
    expect(updater).toMatch(/notifyUpdateDeferred\('GitHub 일시 오류 — 재시도 예약'\)/);
    expect(updater).toMatch(/notifyUpdateDeferred\(`업데이트 오류: /);
  });

  it('"나중에" 신호는 반드시 취소 분기 안에서만 난다 (재시작 선택 시 부팅 부활 차단)', () => {
    // 보류 신호가 재시작 분기로 새면 앱이 종료되는 도중 인증창이 떠 창이 겹친다.
    // 각 신호 바로 앞에 "사용자가 0번(재시작)을 고르지 않았다"는 가드가 있어야 한다.
    const lines = updater.split('\n');
    const signalLines = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes(`notifyUpdateDeferred('사용자 "나중에" 선택')`));

    expect(signalLines).toHaveLength(2);
    for (const { i } of signalLines) {
      const guard = lines.slice(Math.max(0, i - 6), i).join('\n');
      expect(guard, `가드 없는 보류 신호 (line ${i + 1})`).toMatch(/result\.response !== 0/);
    }
  });

  it('대기자가 없으면 조용히 지나간다 (세션 중 업데이트는 영향 없음)', () => {
    expect(updater).toMatch(/if \(updateDeferredResolvers\.length === 0\) return;/);
  });
});
