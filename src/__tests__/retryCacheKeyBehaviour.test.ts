import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// [2026-09-22 P1] Behavioural test for the generation-reuse cache: the REAL key/cache functions
// from both renderer modules run in a sandbox with a fake window. A cached article must never be
// replayed for a different account, a different day, a different keyword or a different mode.

function extractFunction(src: string, fnName: string): string {
  const start = src.indexOf(`function ${fnName}(`);
  if (start < 0) throw new Error(`missing ${fnName}`);
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unterminated ${fnName}`);
}

interface Sandbox {
  window: Record<string, unknown>;
  Date: DateConstructor;
  JSON: typeof JSON;
  String: typeof String;
  Array: typeof ArrayConstructor;
  Number: typeof Number;
  Boolean: typeof Boolean;
  getCurrentNaverId?: () => string;
  console: Console;
}

function loadFullAuto(sandbox: Sandbox) {
  const src = readFileSync(resolve(__dirname, '../renderer/modules/fullAutoFlow.ts'), 'utf8');
  const names = ['normalizeReuseString', 'normalizeReuseStringList', 'getManualTitleOverride', 'buildFullAutoContentReuseKey',
    'resolveReuseAccountId', 'cloneFullAutoContentForRetry', 'hasReusableFullAutoContent', 'getFullAutoContentRetryCache', 'saveFullAutoContentRetryCache'];
  const consts = src.split('\n').filter((l) => /^const FULL_AUTO_CONTENT_RETRY_(CACHE_KEY|MAX_AGE_MS)/.test(l)).join('\n');
  const code = `${consts}\n${names.map((n) => extractFunction(src, n)).join('\n')}\nthis.api = { buildKey: buildFullAutoContentReuseKey, get: getFullAutoContentRetryCache, save: saveFullAutoContentRetryCache };`;
  vm.runInNewContext(code, sandbox);
  return (sandbox as unknown as { api: { buildKey: (f: unknown) => string; get: (f: unknown) => unknown; save: (f: unknown, c: unknown) => void } }).api;
}

function loadPublishing(sandbox: Sandbox) {
  const src = readFileSync(resolve(__dirname, '../renderer/modules/publishingHandlers.ts'), 'utf8')
    .replace(/\(window as any\)/g, 'window')
    .replace(/: any\b/g, '')
    .replace(/: string\[\]/g, '')
    .replace(/: string\b/g, '')
    .replace(/\| null\b/g, '');
  const names = ['normalizePublishReuseString', 'normalizePublishReuseStringList', 'buildPublishContentReuseKey'];
  const code = `${names.map((n) => extractFunction(src, n)).join('\n')}\nthis.buildKey = buildPublishContentReuseKey;`;
  vm.runInNewContext(code, sandbox);
  return (sandbox as unknown as { buildKey: (f: unknown) => string }).buildKey;
}

function makeSandbox(naverId: string): Sandbox {
  return { window: { currentNaverId: naverId }, Date, JSON, String, Array: Array as unknown as ArrayConstructor, Number, Boolean, console };
}

const article = { selectedTitle: '제목', bodyPlain: '본문 '.repeat(200), headings: [{ title: 'h', content: 'c' }] };
const form = (over: Record<string, unknown> = {}) => ({ keywords: '청약통장 금리', contentMode: 'seo', generator: 'openai', urls: [], ...over });

describe('generation reuse cache — real key builders in a sandbox', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('same account/day/keyword/mode → cache hit', () => {
    const sb = makeSandbox('acct-A');
    const api = loadFullAuto(sb);
    api.save(form(), article);
    (sb.window.__leaderFullAutoContentRetryCache as Record<string, unknown>).imageRetryPending = true;
    expect(api.get(form())).not.toBeNull();
  });

  it('different account → miss (never replays someone else\'s article)', () => {
    const sb = makeSandbox('acct-A');
    const api = loadFullAuto(sb);
    api.save(form(), article);
    (sb.window.__leaderFullAutoContentRetryCache as Record<string, unknown>).imageRetryPending = true;
    sb.window.currentNaverId = 'acct-B';
    expect(api.get(form())).toBeNull();
  });

  it('next local day → miss even inside the 6h TTL (no yesterday\'s search results on a fresh issue)', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 22, 23, 50, 0) }); // local 2026-09-22 23:50
    const sb = makeSandbox('acct-A'); // captures the fake Date
    const api = loadFullAuto(sb);
    api.save(form({ contentMode: 'homefeed' }), article);
    (sb.window.__leaderFullAutoContentRetryCache as Record<string, unknown>).imageRetryPending = true;
    vi.setSystemTime(new Date(2026, 8, 23, 0, 10, 0)); // local 2026-09-23 00:10 (20 min later)
    expect(api.get(form({ contentMode: 'homefeed' }))).toBeNull();
  });

  it('different keyword or mode → miss', () => {
    const sb = makeSandbox('acct-A');
    const api = loadFullAuto(sb);
    api.save(form(), article);
    (sb.window.__leaderFullAutoContentRetryCache as Record<string, unknown>).imageRetryPending = true;
    expect(api.get(form({ keywords: '청년도약계좌 조건' }))).toBeNull();
    expect(api.get(form({ contentMode: 'homefeed' }))).toBeNull();
  });

  it('publishingHandlers key changes with account, date, keyword and mode exactly like fullAutoFlow', () => {
    const sbA = makeSandbox('acct-A');
    const keyA = loadPublishing(sbA)(form());
    const sbB = makeSandbox('acct-B');
    expect(loadPublishing(sbB)(form())).not.toBe(keyA);
    expect(loadPublishing(makeSandbox('acct-A'))(form({ keywords: '다른 키워드' }))).not.toBe(keyA);
    expect(loadPublishing(makeSandbox('acct-A'))(form({ contentMode: 'homefeed' }))).not.toBe(keyA);
    vi.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z') });
    expect(loadPublishing(makeSandbox('acct-A'))(form())).not.toBe(keyA);
    vi.useRealTimers();
    // both builders agree on the same input (the two caches are read with OR)
    const full = loadFullAuto(makeSandbox('acct-A')).buildKey(form());
    expect(JSON.parse(full)).toMatchObject({ accountId: 'acct-A', keywords: '청약통장 금리', contentMode: 'seo' });
    expect(JSON.parse(loadPublishing(makeSandbox('acct-A'))(form()))).toMatchObject({ accountId: 'acct-A', keywords: '청약통장 금리', contentMode: 'seo' });
  });
});
