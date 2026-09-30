// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initCredentialsSave } from '../renderer/modules/credentialsSave.js';

/**
 * [2026-09-30] "발행계정선택에서 비밀번호 눈클릭하면 스키마가 풀려야되는데 안풀리네요"
 *
 * The eye button had a handler since v2.7.69 — in credentialsSave.ts. A stale copy of
 * initCredentialsSave in formUtilities.ts (no eye handler) was inlined AFTER it into the
 * single-scope renderer bundle and silently won, so the handler never shipped.
 * Two locks: the toggle works on the real module, and only one definition exists.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) =>
  readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('naver password eye toggle', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input type="checkbox" id="remember-credentials" />
      <input type="text" id="naver-id" />
      <input type="password" id="naver-password" />
      <button type="button" id="toggle-naver-password">👁️</button>`;
    (window as any).api = {
      getConfig: vi.fn(async () => ({ savedNaverId: 'abc', savedNaverPassword: 'secret' })),
      saveConfig: vi.fn(async (c: unknown) => c),
    };
  });

  it('click reveals the password, second click hides it again', async () => {
    vi.useFakeTimers();
    const ready = initCredentialsSave();
    await vi.advanceTimersByTimeAsync(250);
    await ready;
    vi.useRealTimers();

    const input = document.getElementById('naver-password') as HTMLInputElement;
    const eye = document.getElementById('toggle-naver-password') as HTMLButtonElement;
    expect(input.value).toBe('secret');
    expect(input.type).toBe('password');

    eye.click();
    expect(input.type).toBe('text');
    expect(eye.textContent).toBe('🙈');

    eye.click();
    expect(input.type).toBe('password');
    expect(eye.textContent).toBe('👁️');
  });
});

describe('single definition lock', () => {
  it('initCredentialsSave is defined exactly once under src/renderer — the copy in formUtilities is gone', () => {
    const formUtilities = read('renderer/modules/formUtilities.ts');
    expect(formUtilities).not.toMatch(/function initCredentialsSave/);
    const credentialsSave = read('renderer/modules/credentialsSave.ts');
    expect(credentialsSave).toMatch(/export async function initCredentialsSave/);
    expect(credentialsSave).toContain("getElementById('toggle-naver-password')");
  });

  it('the identifier baseline no longer shelters initCredentialsSave (ratchet only shrinks)', () => {
    const baseline = JSON.parse(read('../scripts/bundle-identifier-baseline.json'));
    expect(baseline.legacyDuplicateFunctions).not.toContain('initCredentialsSave');
  });
});
