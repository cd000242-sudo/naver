import { afterEach, describe, expect, it, vi } from 'vitest';
import { callNaverSearch, describeMissingHubKey, resetNaverModeMemo } from '../naver/apiClient.js';
import { describeNaverFailure } from '../naver/apiEndpoints.js';
import type { NaverCredential } from '../naver/apiCredentials.js';

/**
 * [2026-09-15 실측] API HUB 이관은 코드·UI·가이드·토스·테스트까지 전부 갖춰져 있었는데,
 * 사장님 설정에는 **HUB 키가 비어 있었다**(legacy 키만). 그래서 검색이 한 번도 HUB 로 나가지 않았고,
 * 그 사실을 알려 주는 곳이 아무 데도 없었다(`hasBothNaverModes` 는 만들어만 두고 아무도 안 썼다).
 *
 * 함께: 429 문구가 "일일 쿼터를 넘겼습니다" 라고 단정해 오진을 만들었다. 72회를 몰아 부르자 429 가 났고
 * 몇 분 뒤 같은 키로 전 엔드포인트가 200 이었다 — 즉 순간 호출 속도로도 429 가 난다.
 */

const cred = (mode: 'hub' | 'legacy'): NaverCredential =>
  ({ mode, clientId: `${mode}-id`, clientSecret: `${mode}-secret`, label: mode } as NaverCredential);

afterEach(() => {
  resetNaverModeMemo();
  vi.restoreAllMocks();
});

describe('① HUB 키가 없으면 알린다', () => {
  it('⭐ legacy 만 있으면 무엇을 해야 하는지까지 말한다', () => {
    const message = describeMissingHubKey([cred('legacy')]);
    expect(message).toBeTruthy();
    expect(message).toContain('API HUB 키 미입력');
    expect(message).toContain('2027-06-30');                 // 기존 방식 종료일
    expect(message).toContain('서비스 선택');                  // 미선택 시 429 — 실제로 지적받았던 단계
    expect(message).toContain('설정 → API 키');
  });

  it('⭐ HUB 키가 있으면 잠잠하다 — 잔소리는 읽히지 않는다', () => {
    expect(describeMissingHubKey([cred('hub')])).toBeNull();
    expect(describeMissingHubKey([cred('hub'), cred('legacy')])).toBeNull();
  });

  it('키가 아예 없으면 이 경고는 안 한다 (키 없음 안내가 따로 있다)', () => {
    expect(describeMissingHubKey([])).toBeNull();
  });

  it('⭐ 실제 호출에서 프로세스당 한 번만 찍는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ items: [] }),
    })) as any;

    for (let i = 0; i < 3; i += 1) {
      await callNaverSearch('blog', { query: '테스트' }, { credentials: [cred('legacy')], fetchImpl });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const notices = warn.mock.calls.filter((args) => String(args[0]).includes('API HUB 키 미입력'));
    expect(notices).toHaveLength(1);
  });

  it('HUB 키가 있으면 호출해도 경고가 없다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as any;
    await callNaverSearch('blog', { query: '테스트' }, { credentials: [cred('hub')], fetchImpl });
    expect(warn.mock.calls.filter((a) => String(a[0]).includes('API HUB 키 미입력'))).toHaveLength(0);
  });
});

describe('② 429 를 단정하지 않는다', () => {
  it('⭐ legacy 429 는 속도·한도 둘 다 말하고 가리는 법을 준다', () => {
    const message = describeNaverFailure(429, 'legacy');
    expect(message).toContain('순간 호출');
    expect(message).toContain('하루 한도');
    expect(message).toContain('잠시 뒤');
    // 오진을 만든 옛 단정이 돌아오지 않게 잠근다
    expect(message).not.toContain('일일 쿼터를 넘겼습니다');
  });

  it('HUB 429 는 서비스 미선택을 먼저 짚는다 (원인이 다르다)', () => {
    expect(describeNaverFailure(429, 'hub')).toContain('서비스를 선택하지 않아도');
  });

  it('종료된 검색(404)·인증(401) 처방은 그대로다', () => {
    expect(describeNaverFailure(404, 'legacy')).toContain('2026-07-31');
    expect(describeNaverFailure(401, 'legacy')).toContain('API HUB');
  });
});
