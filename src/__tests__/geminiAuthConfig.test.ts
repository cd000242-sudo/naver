/**
 * [v2.11.140] Gemini 에이전트 auth 방식(oauth-personal) 설정 잠금.
 *
 * 배경: gemini CLI는 전용 login 명령/oauth-personal env가 없어, auth 방식을
 * ~/.gemini/settings.json(security.auth.selectedType)로만 고를 수 있다. GCA를 강제하면
 * 개인 계정이 IneligibleTierError로 생성 실패 → 개인 구독 정식 경로 oauth-personal을
 * settings.json에 병합 기록한다. 이 테스트가 그 병합/멱등/보존을 잠근다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const homeMock = vi.hoisted(() => ({ dir: '' }));
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => homeMock.dir };
});

import { ensureGeminiOAuthPersonalConfig } from '../agentCli/geminiAuthConfig';

const settingsPath = (): string => join(homeMock.dir, '.gemini', 'settings.json');
const readSettings = (): any => JSON.parse(readFileSync(settingsPath(), 'utf-8'));

beforeEach(() => {
  homeMock.dir = mkdtempSync(join(tmpdir(), 'gemini-auth-cfg-'));
});
afterEach(() => {
  try { rmSync(homeMock.dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('ensureGeminiOAuthPersonalConfig', () => {
  it('settings.json이 없으면 oauth-personal로 생성한다', async () => {
    await ensureGeminiOAuthPersonalConfig();
    expect(existsSync(settingsPath())).toBe(true);
    expect(readSettings().security.auth.selectedType).toBe('oauth-personal');
  });

  it('기존 설정 키를 보존하며 auth 방식만 병합한다', async () => {
    mkdirSync(join(homeMock.dir, '.gemini'), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify({
      theme: 'dark',
      security: { someOther: true, auth: { selectedType: 'gemini-api-key', extra: 1 } },
    }), 'utf-8');

    await ensureGeminiOAuthPersonalConfig();

    const s = readSettings();
    expect(s.theme).toBe('dark'); // 기존 키 보존
    expect(s.security.someOther).toBe(true); // security 내 기타 키 보존
    expect(s.security.auth.extra).toBe(1); // auth 내 기타 키 보존
    expect(s.security.auth.selectedType).toBe('oauth-personal'); // 방식만 교체
  });

  it('이미 oauth-personal이면 파일을 다시 쓰지 않는다 (멱등)', async () => {
    mkdirSync(join(homeMock.dir, '.gemini'), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify({
      security: { auth: { selectedType: 'oauth-personal' } },
    }), 'utf-8');
    const before = readFileSync(settingsPath(), 'utf-8');

    await ensureGeminiOAuthPersonalConfig();

    // 이미 올바르면 조기 반환 → 재작성(재포맷) 없음
    expect(readFileSync(settingsPath(), 'utf-8')).toBe(before);
  });

  it('깨진 settings.json이어도 던지지 않고 oauth-personal로 복구한다', async () => {
    mkdirSync(join(homeMock.dir, '.gemini'), { recursive: true });
    writeFileSync(settingsPath(), '{ this is not json', 'utf-8');

    await expect(ensureGeminiOAuthPersonalConfig()).resolves.toBeUndefined();
    expect(readSettings().security.auth.selectedType).toBe('oauth-personal');
  });
});
