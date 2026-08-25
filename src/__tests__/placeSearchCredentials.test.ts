import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { resolveAllNaverCredentials } from '../naver/apiCredentials';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-25 사용자 실측] 장소(지도) 넣기에서 "검색 실패: 알 수 없는 오류".
 *
 * 원인: place:search 핸들러만 callNaverSearch 를 payload 없이 불렀다. 그러면 자격증명
 * 해석이 process.env 에만 의존한다. 같은 검색어로 실측하면
 *   payload 없이 -> 자격증명 0개 -> status 412
 *   payload 전달 -> 200 OK ("한꼬막두꼬막" 2건)
 *
 * 게다가 applyConfigToEnv 는 legacy 키만 env 로 올린다. HUB 키만 가진 사용자는
 * env 경로로는 검색이 영원히 안 된다. 설정을 직접 넘기면 두 모드 모두 산다.
 */
describe('place:search — 자격증명 배선', () => {
  const handler = read('main/ipc/placeSearchHandlers.ts');

  it('설정을 읽어 자격증명을 직접 넘긴다 (env 의존 제거)', () => {
    expect(handler).toMatch(/import \{ loadConfig \}/);
    expect(handler).toMatch(/resolveAllNaverCredentials\(/);
    expect(handler).toMatch(/credentials: credentials\.length > 0 \? credentials : undefined/);
  });

  it('payload 없이 호출하던 형태로 되돌아가지 않는다 (회귀 잠금)', () => {
    // 인자 3개짜리 호출이어야 한다. 옵션 객체가 빠지면 env 전용으로 되돌아간 것이다.
    expect(handler).toMatch(/callNaverSearch<\{ items\?: NaverLocalItem\[\] \}>\([\s\S]*?\}, \{/);
  });

  it('쿼터 초과 시 같은 모드의 다른 키로 넘어간다 (다른 호출부와 동일)', () => {
    expect(handler).toMatch(/rotateOnQuota: true/);
  });

  it('실패 메시지를 절대 비우지 않는다', () => {
    // 비면 화면에 "알 수 없는 오류"만 남아 원인을 못 가린다.
    expect(handler).toMatch(/const detail = result\.error/);
    expect(handler).toMatch(/status \$\{result\.status\}/);
    expect(handler).toMatch(/장소 검색 중 예기치 못한 오류/);
  });
});

describe('placePicker — 실패 원인 분기', () => {
  const picker = read('renderer/modules/placePicker.ts');

  it('IPC 부재 / 응답 없음 / 서버 실패를 구분한다', () => {
    expect(picker).toMatch(/typeof api\?\.searchPlaces !== 'function'/);
    expect(picker).toMatch(/검색 기능이 이 버전에 없습니다/);
    expect(picker).toMatch(/검색 응답이 오지 않았습니다/);
  });

  it('빈 메시지를 그대로 흘리지 않는다', () => {
    expect(picker).toMatch(/원인 미상 \(앱 로그를 확인해주세요\)/);
    expect(picker).not.toMatch(/response\?\.message \|\| '알 수 없는 오류'/);
  });
});

describe('자격증명 해석 — payload 우선', () => {
  it('설정 객체에서 legacy 키를 읽는다', () => {
    const creds = resolveAllNaverCredentials({
      naverClientId: 'abcdefghij0123456789',
      naverClientSecret: 'ABCDEfghij',
    });
    expect(creds.some((c) => c.mode === 'legacy')).toBe(true);
  });

  it('설정 객체에서 HUB 키도 읽는다 (env 는 HUB 를 올리지 않는다)', () => {
    const creds = resolveAllNaverCredentials({
      naverHubClientId: 'hubidhubidhubid00000',
      naverHubClientSecret: 'hubsecrethubsecret00',
    });
    expect(creds.some((c) => c.mode === 'hub')).toBe(true);
  });

  it('마스킹된 값은 자격증명으로 쓰지 않는다 (헤더 크래시 차단)', () => {
    const creds = resolveAllNaverCredentials({
      naverClientId: '••••••••••••••••••••',
      naverClientSecret: '••••••••••',
    });
    expect(creds).toHaveLength(0);
  });
});
