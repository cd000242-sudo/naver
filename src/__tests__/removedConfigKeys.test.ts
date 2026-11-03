// 2026-11-03 API 키 정리: 제품에서 빠진 서비스의 설정 키가 설정 파일에서 한 번 지워지고,
// 패키징 스크럽과 어긋나지 않으며, 남기기로 한 키는 건드리지 않는지 잠근다.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  REMOVED_CONFIG_KEYS,
  REMOVED_SECRET_CONFIG_KEYS,
  dropRemovedConfigKeysOnce,
  isRemovedConfigKey,
  stripRemovedConfigKeys,
} from '../security/removedConfigKeys';
import { getSensitiveFields } from '../security/encryptionMigrator';
import { validateDailyPlans } from '../scheduler/dailyPublishingModel';

const ROOT = resolve(__dirname, '..', '..');
const scrub = require(join(ROOT, 'scripts', 'reset-config-for-pack.js')) as {
  SENSITIVE_CONFIG_FIELDS: string[];
  REMOVED_SECRET_CONFIG_FIELDS: string[];
};
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf-8');

const KEPT_KEYS = [
  'geminiApiKey', 'geminiApiKeys', 'openaiApiKey', 'openaiImageApiKey', 'claudeApiKey', 'perplexityApiKey',
  'naverClientId', 'naverClientSecret', 'naverHubClientId', 'naverHubClientSecret',
  'naverDatalabClientId', 'naverDatalabClientSecret',
  'naverAdApiKey', 'naverAdSecretKey', 'naverAdCustomerId', 'primaryGeminiTextModel',
];

describe('REMOVED_CONFIG_KEYS — 삭제 대상과 남길 키', () => {
  it('사장님이 지운 키가 모두 들어 있다', () => {
    for (const key of [
      'leonardoaiApiKey', 'deepinfraApiKey', 'prodiaApiKey', 'prodiaToken',
      'pexelsApiKey', 'unsplashApiKey', 'pixabayApiKey', 'naverDatalabApiKey',
      'naverSearchClientId', 'naverSearchClientSecret', 'stabilityApiKey', 'falaiApiKey',
    ]) {
      expect(REMOVED_CONFIG_KEYS, key).toContain(key);
      expect(isRemovedConfigKey(key)).toBe(true);
    }
  });

  it('남기기로 한 키는 하나도 들어 있지 않다 (네이버 개발자센터 검색 키 포함)', () => {
    for (const key of KEPT_KEYS) expect(isRemovedConfigKey(key), key).toBe(false);
  });

  it('비밀 키 목록은 전체 목록의 부분집합이다', () => {
    for (const key of REMOVED_SECRET_CONFIG_KEYS) expect(REMOVED_CONFIG_KEYS).toContain(key);
  });
});

describe('stripRemovedConfigKeys', () => {
  const raw = {
    geminiApiKey: 'g', naverClientId: 'n', naverClientSecret: 's',
    leonardoaiApiKey: 'L', 'leonardoai-api-key': 'L', deepinfraApiKey: 'D', prodiaToken: 'P',
    pexelsApiKey: 'x', naverSearchClientId: 'y', leonardoaiModel: 'phoenix-1.0',
  };

  it('삭제 대상만 빼고 나머지는 그대로 둔다', () => {
    const { config, removed } = stripRemovedConfigKeys(raw);
    expect(Object.keys(config).sort()).toEqual(['geminiApiKey', 'naverClientId', 'naverClientSecret']);
    expect([...removed].sort()).toEqual(
      ['deepinfraApiKey', 'leonardoaiApiKey', 'leonardoai-api-key', 'leonardoaiModel', 'naverSearchClientId', 'pexelsApiKey', 'prodiaToken'].sort(),
    );
  });

  it('입력 객체를 바꾸지 않고 보고에 값이 들어가지 않는다', () => {
    const copy = JSON.parse(JSON.stringify(raw));
    const { removed } = stripRemovedConfigKeys(raw);
    expect(raw).toEqual(copy);
    expect(JSON.stringify(removed)).not.toMatch(/"(L|D|P|x|y)"/);
  });

  it('삭제할 게 없으면 같은 객체를 돌려준다', () => {
    const clean = { geminiApiKey: 'g' };
    expect(stripRemovedConfigKeys(clean).config).toBe(clean);
  });
});

describe('dropRemovedConfigKeysOnce — 설정 파일에서 1회 제거', () => {
  it('키가 있으면 정리본을 한 번 쓰고, 정리된 파일은 다시 쓰지 않는다', async () => {
    const write = vi.fn(async (_path: string, _text: string) => undefined);
    const first = await dropRemovedConfigKeysOnce('settings.json', { geminiApiKey: 'g', leonardoaiApiKey: 'L' }, { write });
    expect(first).toEqual({ geminiApiKey: 'g' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0][1])).toEqual({ geminiApiKey: 'g' });

    await dropRemovedConfigKeysOnce('settings.json', first, { write });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('파일 쓰기가 실패해도 메모리 값은 정리해서 돌려준다', async () => {
    const write = vi.fn(async (_path: string, _text: string) => { throw new Error('EPERM'); });
    const out = await dropRemovedConfigKeysOnce('settings.json', { prodiaApiKey: 'P', claudeApiKey: 'c' }, { write });
    expect(out).toEqual({ claudeApiKey: 'c' });
  });
});

describe('패키징 스크럽 · 암호화 목록과 어긋나지 않는다', () => {
  it('스크럽 스크립트의 삭제 키 목록이 REMOVED_SECRET_CONFIG_KEYS 와 같은 집합이다', () => {
    expect([...scrub.REMOVED_SECRET_CONFIG_FIELDS].sort()).toEqual([...REMOVED_SECRET_CONFIG_KEYS].sort());
  });

  it('암호화 대상(SENSITIVE_FIELDS)에는 삭제된 키가 없다', () => {
    const sensitive = new Set(getSensitiveFields());
    for (const key of REMOVED_CONFIG_KEYS) expect(sensitive.has(key), key).toBe(false);
  });

  it('스크럽의 빈 값 초기화 목록에도 삭제된 키가 없다 (삭제 키는 키째로 지운다)', () => {
    for (const key of scrub.SENSITIVE_CONFIG_FIELDS) expect(isRemovedConfigKey(key), key).toBe(false);
  });

  it('남기는 키는 스크럽 목록에 그대로 있다', () => {
    for (const key of ['naverClientId', 'naverClientSecret', 'naverHubClientId', 'naverAdApiKey', 'geminiApiKey', 'openaiApiKey']) {
      expect(scrub.SENSITIVE_CONFIG_FIELDS).toContain(key);
    }
  });
});

describe('보존 목록 · 환경변수 역주입에서 삭제 키가 빠졌다', () => {
  const gone = /leonardoai|deepinfraApiKey|prodiaApiKey|prodiaToken|pexelsApiKey|unsplashApiKey|pixabayApiKey|stabilityApiKey|falaiApiKey/;

  it('configManager 는 삭제 키를 읽지도 env 로 주입하지도 않는다', () => {
    expect(read('src/configManager.ts')).not.toMatch(gone);
    expect(read('src/configManager.ts')).toContain('dropRemovedConfigKeysOnce(filePath, parsed)');
  });

  it('userDataMigration 보존 목록에 삭제 키가 없다', () => {
    expect(read('src/main/userDataMigration.ts')).not.toMatch(gone);
  });

  it('main.ts 업그레이드 보존 목록(PRESERVE_FIELDS)에 삭제 키가 없다', () => {
    const src = read('src/main.ts');
    const start = src.indexOf('const PRESERVE_FIELDS = [');
    const block = src.slice(start, src.indexOf('] as const;', start));
    expect(block).not.toMatch(gone);
    expect(block).toContain("'naverClientId'");
  });

  it('설정 화면 저장 코드에 삭제 키가 없다', () => {
    expect(read('src/renderer/modules/priceInfoModal.ts')).not.toMatch(/leonardoaiApiKey|deepinfraApiKey|prodiaApiKey|prodiaToken|unsplashApiKey|pixabayApiKey/);
    expect(read('src/renderer/utils/settingsModal.ts')).not.toMatch(/leonardoai|deepinfra/);
  });
});

describe('매일 예약발행 계획 — 삭제된 엔진 값이 있어도 계획이 사라지지 않는다', () => {
  const plan = { accountId: 'a', categoryId: '1', enabled: false, mode: 'draft', slots: [{ time: '20:00', count: 1 }], generator: 'app-settings', topic: 't' };

  it.each(['leonardoai', 'deepinfra', 'prodia'])('imageSource=%s 인 기존 계획도 읽힌다', (imageSource) => {
    const [loaded] = validateDailyPlans([{ ...plan, imageSource }]);
    expect(loaded).toMatchObject({ accountId: 'a', imageSource });
  });

  it('실행 직전 검증은 허용 목록에서 막는다 — 조용히 다른 엔진으로 가지 않는다', () => {
    const src = read('src/main/ldb-daily-publishing.ts');
    const line = src.match(/DAILY_IMAGE_PROVIDERS = \[[^\]]*\]/)?.[0] ?? '';
    expect(line).not.toMatch(/leonardoai|deepinfra|prodia/);
    expect(read('src/main/services/dailyPublishingRuntime.ts')).toContain("throw Error('DAILY_IMAGE_PROVIDER_REQUIRED')");
  });
});
