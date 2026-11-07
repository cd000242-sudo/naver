import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const html = readFileSync(join(root, 'admin', 'index.html'), 'utf8');
const inventory = JSON.parse(
  readFileSync(join(root, 'src', '__tests__', 'fixtures', 'admin-legacy-inventory.json'), 'utf8'),
) as { ids: string[]; onclickHandlers: string[]; functions: string[]; navTabs: string[]; editorSubtabs: string[] };

const navTabs = [...html.matchAll(/class="nav-item[^"]*"[^>]*\sdata-tab="([^"]+)"/g)].map((m) => m[1]);

describe('admin shell - menu mapping (nothing from the old admin may disappear)', () => {
  it('offers the agreed menu in the agreed order', () => {
    expect(navTabs).toEqual([
      'dashboard',
      'notices', 'editor', 'reviews', 'income', 'tips',
      'analytics', 'orders', 'bank',
      'licenses', 'trial', 'leads',
      'leword-settings',
    ]);
  });

  it('reaches every screen the old sidebar reached', () => {
    for (const tab of inventory.navTabs) expect(navTabs).toContain(tab);
  });

  it('has a panel behind every menu entry (leword-settings is built at runtime)', () => {
    for (const tab of navTabs) {
      if (tab === 'leword-settings') {
        expect(html).toContain('id="editor-sub-admin-ai"');
        expect(html).toContain('function installLewordSettingsPanel()');
        continue;
      }
      expect(html, `panel for ${tab}`).toContain(`id="tab-${tab}"`);
    }
  });

  it('keeps every DOM id, handler and function of the old screens', () => {
    for (const id of inventory.ids) expect(html, `id ${id}`).toContain(`id="${id}"`);
    for (const fn of inventory.functions) expect(html, `function ${fn}`).toMatch(new RegExp(`function\\s+${fn}\\s*\\(`));
    for (const fn of inventory.onclickHandlers) expect(html, `handler ${fn}`).toContain(`${fn}(`);
  });

  it('keeps the seven site-editor chips and the trial export shortcuts', () => {
    for (const name of inventory.editorSubtabs) expect(html).toContain(`data-editor-subtab="${name}"`);
    expect(html).toContain("focusTrialExport('phones')");
    expect(html).toContain("focusTrialExport('emails')");
  });

  it('does not build the community menu yet (server side is stage 4)', () => {
    expect(navTabs.filter((t) => /communit|posts|report/.test(t))).toEqual([]);
    expect(html).not.toMatch(/nav-gt">\s*커뮤니티/);
  });

  it('opens on the dashboard and keeps the sidebar footer controls', () => {
    expect(html).toMatch(/document\.getElementById\('dashboard'\)\.classList\.add\('active'\);\s*switchTab\('dashboard'\)/);
    expect(html).toContain('id="sidebar-license-count"');
    expect(html).toContain('onclick="handleLogout()"');
  });

  it('loads the shell scripts before the main script', () => {
    const tools = html.indexOf('<script src="/admin/shell-tools.js"></script>');
    const shell = html.indexOf('<script src="/admin/shell.js"></script>');
    const main = html.indexOf('const GAS_URL');
    expect(tools).toBeGreaterThan(0);
    expect(shell).toBeGreaterThan(tools);
    expect(main).toBeGreaterThan(shell);
  });

  it('wires the new screens to the existing functions', () => {
    expect(html).toContain('id="leads-table-body"');
    expect(html).toContain('id="leads-count"');
    expect(html).toContain('id="codes-table-body"');
    expect(html).toContain('id="code-search"');
    expect(html).toMatch(/onclick="openIssueModal\(\)"/);
  });
});

describe('admin shell - security hygiene of the new files', () => {
  const shell = readFileSync(join(root, 'admin', 'shell.js'), 'utf8');
  const tools = readFileSync(join(root, 'admin', 'shell-tools.js'), 'utf8');

  it('never logs and never stores anything but the theme choice', () => {
    for (const src of [shell, tools]) {
      expect(src).not.toMatch(/console\.(log|info|debug)/);
      expect(src).not.toMatch(/adminToken|ADMIN_TOKEN|password/i);
    }
    const writes = [...shell.matchAll(/(?:local|session)Storage\.setItem\(([^,]+),/g)].map((m) => m[1].trim());
    expect(writes.every((w) => w === 'THEME_KEY')).toBe(true);
    expect(shell).toContain("const THEME_KEY = 'lp_admin_theme'");
  });

  it('keeps each new source file under the 300 line limit', () => {
    for (const name of ['shell.js', 'shell-tools.js', 'shell.css', 'shell-theme.css', 'shell-compat.css']) {
      const lines = readFileSync(join(root, 'admin', name), 'utf8').split('\n').length;
      expect(lines, name).toBeLessThanOrEqual(300);
    }
  });
});
