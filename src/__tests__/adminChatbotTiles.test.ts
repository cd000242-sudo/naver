import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM helpers shared with the public site
import { decryptLink } from '../../spa/src/lib/protectedLink.mjs';
// @ts-expect-error plain ESM helpers shared with the public site
import { isSealedPayload, resolveProtectedTile, resolvePublicTile } from '../../spa/src/lib/chatbotTiles.mjs';

// Browser-safe helpers loaded by admin/index.html (same pattern as shell-tools / structured-editor-tools).
const tiles = require('../../admin/chatbot-tiles-tools.js') as any;
const sealer = require('../../admin/protected-link-tools.js') as any;

const root = process.cwd();
const html = readFileSync(join(root, 'admin', 'index.html'), 'utf8');
const FAKE_LINK = 'https://example.invalid/admin-private-7f3a';
const PASSWORD = 'correct-horse-battery';

const row = (values: Record<string, string>, extra: Record<string, unknown> = {}) => ({ extra, values });

describe('admin chatbot lists - JSON-free list editing', () => {
  const savedBots = [
    { category: '글쓰기', title: '첫 번째', subtitle: '부제', desc: '설명 1', bestFor: ['초보', '시간 없는 분'], url: 'https://example.invalid/a', accent: '#44d7b6', futureFlag: true },
    { title: '두 번째', url: 'https://example.invalid/b' },
  ];

  it('round-trips what the site saved without losing fields the editor does not show', () => {
    const items = tiles.listFromContent('bots', savedBots);
    expect(items).toHaveLength(2);
    expect(items[0].values.title).toBe('첫 번째');
    expect(items[0].values.bestFor).toBe('초보\n시간 없는 분');
    expect(tiles.listToContent('bots', items)).toEqual(savedBots);
  });

  it('turns edited text fields back into the site field names', () => {
    const items = tiles.listFromContent('skills', [{ title: '옛 이름', desc: '옛 설명', url: 'https://example.invalid/s' }]);
    items[0].values.title = '  새 이름  ';
    items[0].values.desc = '';
    expect(tiles.listToContent('skills', items)).toEqual([{ title: '새 이름', url: 'https://example.invalid/s' }]);
  });

  it('splits "recommended for" lines into an array and drops blank lines', () => {
    const out = tiles.listToContent('bots', [row({ title: 'A', bestFor: ' 하나 \n\n 둘\r\n' })]);
    expect(out).toEqual([{ title: 'A', bestFor: ['하나', '둘'] }]);
  });

  it('drops completely blank rows and returns undefined for an empty list so the site default applies', () => {
    expect(tiles.listToContent('bots', [row({}), row({ title: '   ' })])).toBeUndefined();
    expect(tiles.listToContent('skills', [])).toBeUndefined();
    expect(tiles.listFromContent('bots', undefined)).toEqual([]);
    expect(tiles.listFromContent('bots', 'not a list')).toEqual([]);
    expect(tiles.listFromContent('bots', [null, 5, 'x', { title: 'ok' }])).toHaveLength(1);
  });

  it('flags a missing required field next to that field and ignores blank rows', () => {
    const issues = tiles.validateList('bots', [row({ title: 'A', url: 'https://example.invalid/a' }), row({ desc: '이름 없음' }), row({})]);
    expect(issues).toEqual([{ index: 1, key: 'title', message: expect.stringContaining('이름') }]);
  });

  it('rejects links that are not https and colours that are not hex', () => {
    for (const bad of ['javascript:alert(1)', 'http://example.invalid/a', 'ftp://example.invalid', 'example.com', 'https://']) {
      expect(tiles.validateList('skills', [row({ title: 'A', url: bad })]), bad).toEqual([{ index: 0, key: 'url', message: expect.stringContaining('https://') }]);
    }
    expect(tiles.validateList('bots', [row({ title: 'A', accent: 'red' })])).toEqual([{ index: 0, key: 'accent', message: expect.stringContaining('#') }]);
    expect(tiles.validateList('bots', [row({ title: 'A', accent: '#44D7B6', url: 'https://example.invalid/ok' })])).toEqual([]);
  });

  it('exposes a clear Korean label for every field of both lists', () => {
    for (const key of ['skills', 'bots']) {
      for (const field of tiles.LISTS[key].fields) {
        expect(field.label, `${key}.${field.key}`).toMatch(/[가-힣]/);
        expect(field.label).not.toMatch(/json/i);
      }
    }
  });
});

describe('admin chatbot tiles - what gets saved and what the site reads', () => {
  const simple = {
    chatgpt: { title: '', desc: '' },
    gemini: { title: ' 제미나이 ', desc: '설명 G', url: 'https://example.invalid/g', cta: '가기' },
    naverFree: { title: '네이버', desc: '설명 N', url: 'https://example.invalid/n', cta: '보기', badge: '추천' },
    claude: { title: '', desc: '' },
    cafe: { title: '', desc: '', url: '' },
    homefeedLocked: { title: '잠금', desc: '설명 L' },
  };

  it('omits blank fields (site default applies) and keeps filled ones trimmed', () => {
    const out = tiles.buildChatbots({ simple, skills: [], bots: [], payload: null });
    expect(out.gemini).toEqual({ title: '제미나이', desc: '설명 G', url: 'https://example.invalid/g', cta: '가기' });
    expect(out.chatgpt).toEqual({});
    expect(out.claude).toEqual({});
    expect(out.skills ?? out.claude.skills).toBeUndefined();
    expect(out.bots).toBeUndefined();
    expect(out.homefeedLocked).toEqual({ title: '잠금', desc: '설명 L' });
  });

  it('the site resolves exactly the values the admin collected (field names agree end to end)', () => {
    const out = tiles.buildChatbots({ simple, skills: [], bots: [], payload: null });
    const gemini = resolvePublicTile({ title: 'x', desc: 'x', url: 'https://example.invalid/x', cta: 'x', badge: '바로 사용' }, out.gemini);
    expect(gemini).toEqual({ title: '제미나이', desc: '설명 G', url: 'https://example.invalid/g', cta: '가기', badge: '바로 사용' });
    const naver = resolvePublicTile({ title: 'x', desc: 'x', url: 'https://example.invalid/x', cta: 'x', badge: '무료' }, out.naverFree);
    expect(naver).toEqual({ title: '네이버', desc: '설명 N', url: 'https://example.invalid/n', cta: '보기', badge: '추천' });
    const locked = resolveProtectedTile({ title: 'x', desc: 'x' }, out.homefeedLocked, { v: 1 });
    expect(locked.title).toBe('잠금');
    expect(locked.desc).toBe('설명 L');
  });

  it('validates the public tile links next to their field', () => {
    expect(tiles.validateTile({ title: 'a', url: 'https://example.invalid/ok' })).toEqual([]);
    expect(tiles.validateTile({ url: '' })).toEqual([]);
    expect(tiles.validateTile({ url: 'javascript:alert(1)' })).toEqual([{ key: 'url', message: expect.stringContaining('https://') }]);
  });

  it('stores only the ciphertext object for the protected tile', async () => {
    const payload = await sealer.seal(FAKE_LINK, PASSWORD);
    const out = tiles.buildChatbots({ simple, skills: [], bots: [], payload });
    expect(out.homefeedLocked.payload).toEqual(payload);
    const text = JSON.stringify(out);
    expect(text).not.toContain('example.invalid/admin-private');
    expect(text).not.toContain(PASSWORD);
  });
});

describe('admin protected link sealing - same cipher as the site', () => {
  it('produces a payload the site code opens with the right password only', async () => {
    const payload = await sealer.seal(FAKE_LINK, PASSWORD);
    expect(await decryptLink(payload, PASSWORD)).toBe(FAKE_LINK);
    await expect(decryptLink(payload, `${PASSWORD}x`)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(isSealedPayload(payload)).toBe(true);
  }, 20000);

  it('uses the agreed parameters and random salt/iv, with no secret in the payload', async () => {
    const a = await sealer.seal(FAKE_LINK, PASSWORD);
    const b = await sealer.seal(FAKE_LINK, PASSWORD);
    expect(a.v).toBe(1);
    expect(a.kdf).toBe('PBKDF2-SHA256');
    expect(a.iter).toBe(600000);
    expect(Buffer.from(a.salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(a.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(a.ct, 'base64')).toHaveLength(Buffer.byteLength(FAKE_LINK) + 16);
    expect(Object.keys(a).sort()).toEqual(['ct', 'iter', 'iv', 'kdf', 'salt', 'v']);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(JSON.stringify(a)).not.toContain('example.invalid');
    expect(JSON.stringify(a)).not.toContain(PASSWORD);
  }, 20000);

  it('treats Korean passwords the way the site does (NFC + trim)', async () => {
    const payload = await sealer.seal(FAKE_LINK, '  리더남비밀번호12345'.normalize('NFD'));
    expect(await decryptLink(payload, '리더남비밀번호12345')).toBe(FAKE_LINK);
  }, 20000);

  it('refuses a bad link or an empty password before doing any work', async () => {
    for (const bad of ['http://example.invalid/a', 'javascript:alert(1)', 'not a url', '']) {
      await expect(sealer.seal(bad, PASSWORD), bad).rejects.toThrow();
      expect(sealer.checkLink(bad), bad).not.toBe('');
    }
    await expect(sealer.seal(FAKE_LINK, '')).rejects.toThrow();
    await expect(sealer.seal(FAKE_LINK, '   ')).rejects.toThrow();
    expect(sealer.checkLink(FAKE_LINK)).toBe('');
  });

  it('warns about passwords shorter than 12 characters without blocking', () => {
    expect(sealer.MIN_PASSWORD_LENGTH).toBe(12);
    expect(sealer.passwordWarning('short')).toContain('12');
    expect(sealer.passwordWarning('exactly-12chr')).toBe('');
    expect(sealer.passwordWarning('')).toBe('');
    expect(sealer.samePassword('abc', ' abc ')).toBe(true);
    expect(sealer.samePassword('abc', 'abd')).toBe(false);
  });
});

describe('admin page wiring - no JSON anywhere in the free chatbot editor', () => {
  const card = html.slice(html.indexOf('id="chatbot-editor-card"'), html.indexOf('id="home-keyword-briefing-editor"'));

  it('keeps every legacy id but no JSON textarea, label or parser is left', () => {
    expect(card.length).toBeGreaterThan(500);
    expect(html).toContain('id="edit-cb-bots"');
    expect(html).toContain('id="edit-cb-claude-skills"');
    expect(html).not.toMatch(/<textarea[^>]*id="edit-cb-(bots|claude-skills)"/);
    expect(card).not.toMatch(/JSON/i);
    expect(html).not.toContain('JSON 형식을 확인해주세요');
    expect(html).not.toMatch(/function collectChatbotsTiles\(\)\s*\{[^}]*JSON\.parse/s);
  });

  it('loads the new scripts before the main script and routes load/collect/validate through them', () => {
    const main = html.indexOf('const GAS_URL');
    for (const file of ['protected-link-tools.js', 'chatbot-tiles-tools.js', 'chatbot-seal-ui.js', 'chatbot-editor.js']) {
      const at = html.indexOf(`<script src="/admin/${file}"></script>`);
      expect(at, file).toBeGreaterThan(0);
      expect(at, file).toBeLessThan(main);
    }
    expect(html).toContain('AdminChatbotEditor.load(');
    expect(html).toContain('AdminChatbotEditor.collect()');
    expect(html).toContain('AdminChatbotEditor.validate()');
    expect(html).toContain('AdminChatbotEditor.markSaved()');
    expect(html).toContain('href="/admin/chatbot-editor.css"');
  });

  it('offers editors for the two new tiles', () => {
    for (const id of ['edit-cb-naver-title', 'edit-cb-naver-desc', 'edit-cb-naver-url', 'edit-cb-naver-cta', 'edit-cb-naver-badge', 'edit-cb-locked-title', 'edit-cb-locked-desc']) {
      expect(card, id).toContain(`id="${id}"`);
    }
    expect(card).toContain('type="password"');
    expect(card).toContain('autocomplete="off"');
  });
});
