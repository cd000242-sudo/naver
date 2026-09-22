import { describe, expect, it } from 'vitest';

import { callNaverSearch, resetNaverModeMemo } from '../naver/apiClient';
import type { NaverCredential } from '../naver/apiEndpoints';

const legacyCred: NaverCredential = { id: 'test-id', secret: 'test-secret', mode: 'legacy', label: 'test' };

function mockFetch(status: number, body: unknown) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('callNaverSearch searchStatus classification', () => {
  it('marks a 429 response as SEARCH_RATE_LIMITED, distinct from an empty result', async () => {
    resetNaverModeMemo();
    const result = await callNaverSearch('blog', { query: 'q' }, {
      credentials: [legacyCred],
      fetchImpl: mockFetch(429, {}) as any,
      maxAttempts: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.searchStatus).toBe('SEARCH_RATE_LIMITED');
  });

  it('marks a 200 response with 0 items as SEARCH_EMPTY', async () => {
    resetNaverModeMemo();
    const result = await callNaverSearch('blog', { query: 'q' }, {
      credentials: [legacyCred],
      fetchImpl: mockFetch(200, { items: [] }) as any,
    });

    expect(result.ok).toBe(true);
    expect(result.searchStatus).toBe('SEARCH_EMPTY');
  });

  it('marks a 200 response with items as SEARCH_OK (successful path shape unchanged)', async () => {
    resetNaverModeMemo();
    const result = await callNaverSearch('blog', { query: 'q' }, {
      credentials: [legacyCred],
      fetchImpl: mockFetch(200, { items: [{ title: 'A' }, { title: 'B' }] }) as any,
    });

    expect(result.ok).toBe(true);
    expect(result.searchStatus).toBe('SEARCH_OK');
    expect(result.data).toEqual({ items: [{ title: 'A' }, { title: 'B' }] });
  });

  it('marks a 403 response as SEARCH_BLOCKED', async () => {
    resetNaverModeMemo();
    const result = await callNaverSearch('blog', { query: 'q' }, {
      credentials: [legacyCred],
      fetchImpl: mockFetch(403, {}) as any,
      maxAttempts: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.searchStatus).toBe('SEARCH_BLOCKED');
  });

  it('keeps the HUB/legacy failover logic intact: auth failure tries the other mode', async () => {
    resetNaverModeMemo();
    const hubCred: NaverCredential = { id: 'hub-id', secret: 'hub-secret', mode: 'hub', label: 'hub' };
    let callCount = 0;
    const fetchImpl = async () => {
      callCount += 1;
      // First (hub) attempt fails auth, second (legacy) attempt succeeds.
      if (callCount === 1) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ items: [{ title: 'A' }] }) };
    };

    const result = await callNaverSearch('blog', { query: 'q' }, {
      credentials: [hubCred, legacyCred],
      fetchImpl: fetchImpl as any,
    });

    expect(callCount).toBe(2);
    expect(result.ok).toBe(true);
    expect(result.searchStatus).toBe('SEARCH_OK');
    expect(result.mode).toBe('legacy');
  });

  it('retired search types return without calling fetch, tagged SEARCH_ERROR', async () => {
    let called = false;
    const result = await callNaverSearch('shop' as any, { query: 'q' }, {
      credentials: [legacyCred],
      fetchImpl: (async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; }) as any,
    });

    expect(called).toBe(false);
    expect(result.status).toBe(410);
    expect(result.searchStatus).toBe('SEARCH_ERROR');
  });
});
