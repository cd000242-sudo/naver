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

/**
 * [2026-09-08 사용자 실측] 화면에 "검색 기능이 이 버전에 없습니다"만 떴다.
 *
 * 원인: searchPlaces 는 preload 의 exposeInMainWorld('api', ...) 안에만 있는데
 * placePicker 는 window.electronAPI 에서 찾았다. electronAPI 는 "동일 API 노출"이라는
 * 주석과 달리 손으로 다시 나열한 별도 객체다. global.d.ts 가
 * electronAPI?: Partial<AutomationAPI> 라서 타입 검사도 못 잡는다 — 컴파일은
 * 깨끗한데 런타임에만 죽는다. v2.11.206 도입 이후 한 번도 동작한 적이 없었다.
 *
 * 그래서 문자열 매칭이 아니라 "호출부가 읽는 전역에 그 메서드가 실제로 있는지"를 잠근다.
 */
describe('placePicker — preload 브릿지 일치', () => {
  const preload = read('preload.ts');
  const picker = read('renderer/modules/placePicker.ts');

  /** preload 에서 해당 멤버를 노출하는 전역 이름들 ('api' / 'electronAPI'). */
  function exposedGlobalsWith(member: string): string[] {
    const blocks: Array<{ name: string; index: number }> = [];
    const re = /exposeInMainWorld\('([^']+)'/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(preload)) !== null) {
      blocks.push({ name: match[1], index: match.index });
    }
    return blocks
      .filter((block, i) => {
        const end = i + 1 < blocks.length ? blocks[i + 1].index : preload.length;
        return preload
          .slice(block.index, end)
          .split('\n')
          .some((line) => line.trim().startsWith(`${member}:`));
      })
      .map((block) => block.name);
  }

  it('placePicker 가 읽는 전역에 searchPlaces 가 실제로 노출돼 있다', () => {
    const exposed = exposedGlobalsWith('searchPlaces');
    expect(exposed.length).toBeGreaterThan(0);

    // 호출부가 어떤 전역을 읽는지 소스에서 뽑는다.
    const readsGlobals = Array.from(picker.matchAll(/\(window as any\)\.(\w+)/g))
      .map((m) => m[1]);
    expect(readsGlobals.length).toBeGreaterThan(0);

    // 읽는 전역 중 최소 하나는 searchPlaces 를 실제로 가진 전역이어야 한다.
    expect(readsGlobals.some((name) => exposed.includes(name))).toBe(true);
  });

  it('electronAPI 단독 참조로 되돌아가지 않는다 (회귀 잠금)', () => {
    expect(picker).not.toMatch(/const api = \(window as any\)\.electronAPI;/);
  });
});
