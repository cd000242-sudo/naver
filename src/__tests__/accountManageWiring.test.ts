/**
 * Wiring of the account management window: a "⚙️ 계정 관리" button beside BOTH "➕ 계정 추가" buttons, and the two
 * new renderer modules registered everywhere a bundled module must be (inline list, runtime closure manifest,
 * identifier uniqueness). The window reuses the existing IPC only and never types a password.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const html = read('public', 'index.html');
const copyStatic = read('scripts', 'copy-static.mjs');
const manifest = read('src', 'contentQualityV3', 'candidateRuntimeFingerprint.ts');
const windowSource = read('src', 'renderer', 'modules', 'accountManageWindow.ts');
const formSource = read('src', 'renderer', 'modules', 'accountManageForm.ts');
const buttonTag = (id: string) => html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>[^<]*</button>`))?.[0] || '';

describe('buttons in index.html', () => {
  it('main publish screen: ⚙️ 계정 관리 sits right after ➕ 계정 추가 in the account row', () => {
    const tag = buttonTag('main-manage-accounts-btn');
    expect(tag).toContain('⚙️ 계정 관리');
    expect(tag).toContain('type="button"');
    const add = html.indexOf('id="main-add-account-btn"');
    const manage = html.indexOf('id="main-manage-accounts-btn"');
    expect(manage).toBeGreaterThan(add);
    expect(manage - add).toBeLessThan(1600);
    expect(html.slice(add, manage)).not.toContain('id="main-account-selector"');
  });

  it('multi-account tab: ⚙️ 계정 관리 sits beside ➕ 계정 추가', () => {
    const tag = buttonTag('ma-manage-accounts-inline');
    expect(tag).toContain('⚙️ 계정 관리');
    expect(tag).toContain('type="button"');
    const add = html.indexOf('id="ma-add-account-inline"');
    const manage = html.indexOf('id="ma-manage-accounts-inline"');
    expect(manage).toBeGreaterThan(add);
    expect(manage - add).toBeLessThan(1600);
  });

  it('uses the same look as the add buttons', () => {
    for (const [manage, add] of [['main-manage-accounts-btn', 'main-add-account-btn'], ['ma-manage-accounts-inline', 'ma-add-account-inline']]) {
      const style = (id: string) => buttonTag(id).match(/style="([^"]*)"/)?.[1].replace(/\s+/g, ' ') || '';
      expect(style(manage), manage).toBe(style(add).replace(/\s+/g, ' '));
    }
  });

  it('is wired by the module, not by an inline handler that could be missing', () => {
    expect(buttonTag('main-manage-accounts-btn')).not.toContain('onclick');
    expect(buttonTag('ma-manage-accounts-inline')).not.toContain('onclick');
    expect(windowSource).toContain("'main-manage-accounts-btn'");
    expect(windowSource).toContain("'ma-manage-accounts-inline'");
  });
});

describe('bundle registration', () => {
  it('inlines the form before the window, and both after the pause panel they use', () => {
    const at = (name: string) => copyStatic.indexOf(`'${name}'`);
    expect(at('accountManageForm.js')).toBeGreaterThan(0);
    expect(at('accountPauseModal.js')).toBeLessThan(at('accountManageForm.js'));
    expect(at('accountManageForm.js')).toBeLessThan(at('accountManageWindow.js'));
  });

  it('adds both modules to the runtime closure manifest', () => {
    expect(manifest).toContain("'src/renderer/modules/accountManageForm.ts'");
    expect(manifest).toContain("'src/renderer/modules/accountManageWindow.ts'");
  });

  it('keeps every top-level identifier unique across the renderer sources', () => {
    const topOf = (source: string) => [...source.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    const mine = [...topOf(formSource), ...topOf(windowSource)];
    expect(mine.length).toBeGreaterThan(10);
    expect(mine.every(name => /^(accountManage|AccountManage|ACCOUNT_MANAGE)/.test(name))).toBe(true);
    expect(new Set(mine).size).toBe(mine.length);
    const files = (base: string): string[] => readdirSync(base, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(base, entry.name)) : entry.name.endsWith('.ts') ? [join(base, entry.name)] : []);
    for (const file of files(join(root, 'src', 'renderer')).filter(f => !/accountManage(Form|Window)\.ts$/.test(f))) {
      const text = readFileSync(file, 'utf8');
      for (const name of mine) expect(text, `${name} declared in ${file}`).not.toMatch(new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function|const|let|class)\\s+${name}\\b`, 'm'));
    }
  });
});

describe('scope', () => {
  it('uses only existing IPC calls and never handles a password beyond the typed edit field', () => {
    for (const source of [windowSource, formSource]) {
      expect(source).not.toMatch(/page\.keyboard|\.type\(|\.fill\(|getAccountCredentials|naverPassword/);
      expect(source).not.toMatch(/ipcRenderer|invoke\(/);
    }
    expect(formSource).toContain('updateBlogAccount');
    expect(formSource).toContain('updateAccountCredentials');
    expect(windowSource).toContain('removeBlogAccount');
    expect(windowSource).toContain('getAllBlogAccounts');
    expect(windowSource).toContain('accountSafety');
  });

  it('stays within the 300 line limit', () => {
    for (const source of [windowSource, formSource]) expect(source.split('\n').length).toBeLessThanOrEqual(300);
  });
});
