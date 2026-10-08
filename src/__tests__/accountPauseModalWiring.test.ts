/**
 * Wiring of the main-screen account stop panel: every publish started from the main screen goes through
 * executeBlogPublishing, so the panel hangs there (plus the continuous stop as a safety net), and the new
 * renderer module is registered everywhere a bundled module must be (inline list, identifier uniqueness,
 * runtime closure manifest).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const fullAuto = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
const continuous = read('src', 'renderer', 'modules', 'continuousPublishing.ts');
const copyStatic = read('scripts', 'copy-static.mjs');
const modalSource = read('src', 'renderer', 'modules', 'accountPauseModal.ts');
const publishFn = fullAuto.slice(fullAuto.indexOf('async function executeBlogPublishing('));

describe('executeBlogPublishing hooks', () => {
  it('imports the panel module', () => {
    expect(fullAuto).toContain("from './accountPauseModal.js'");
    expect(fullAuto).toMatch(/import \{[^}]*noteAccountPauseDispatch[^}]*\} from '\.\/accountPauseModal\.js'/);
    expect(fullAuto).toMatch(/import \{[^}]*showAccountPauseModal[^}]*\} from '\.\/accountPauseModal\.js'/);
  });

  it('notes the dispatch (Naver ID + title) right before the automation call', () => {
    const noteAt = publishFn.indexOf('noteAccountPauseDispatch(naverId, structuredContent?.selectedTitle)');
    const callAt = publishFn.indexOf("apiClient.call('runAutomation', [payload]");
    expect(noteAt).toBeGreaterThan(0);
    expect(callAt).toBeGreaterThan(noteAt);
  });

  it('shows the panel on both failure exits before the error is rethrown', () => {
    const exits = publishFn.split('if (blockPostContentAppliedPublishRetry(errorMsg)) {').slice(1);
    expect(exits).toHaveLength(2);
    for (const exit of exits) {
      expect(exit.slice(0, 320)).toMatch(/void showAccountPauseModal\(errorMsg, \{ naverId \}\);\s*throw new Error\(errorMsg\);/);
    }
  });
});

describe('continuous stop', () => {
  it('shows the same panel when the queue stops for an account stop', () => {
    expect(continuous).toMatch(/import \{ showAccountPauseModal \} from '\.\/accountPauseModal\.js';/);
    const branch = continuous.slice(continuous.indexOf('if (requiresAccountStop(error)) {'));
    expect(branch.slice(0, 900)).toContain('void showAccountPauseModal(error);');
  });
});

describe('bundle registration', () => {
  it('is inlined before both modules that import it', () => {
    const at = (name: string) => copyStatic.indexOf(`'${name}'`);
    expect(at('accountPauseModal.js')).toBeGreaterThan(0);
    expect(at('accountPauseModal.js')).toBeLessThan(at('continuousPublishing.js'));
    expect(at('accountPauseModal.js')).toBeLessThan(at('fullAutoFlow.js'));
  });

  it('keeps every top-level identifier unique across the renderer sources', () => {
    const top = [...modalSource.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    expect(top.length).toBeGreaterThan(10);
    expect(top.every(name => /^(accountPauseModal|AccountPauseModal|ACCOUNT_PAUSE_MODAL|noteAccountPauseDispatch$|showAccountPauseModal$)/.test(name))).toBe(true);
    const dir = join(root, 'src', 'renderer');
    const files = (base: string): string[] => readdirSync(base, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(base, entry.name)) : entry.name.endsWith('.ts') ? [join(base, entry.name)] : []);
    for (const file of files(dir).filter(f => !f.endsWith('accountPauseModal.ts'))) {
      const text = readFileSync(file, 'utf8');
      for (const name of top) expect(text, `${name} declared in ${file}`).not.toMatch(new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function|const|let|class)\\s+${name.replace(/\$/g, '\\$')}\\b`, 'm'));
    }
  });
});

describe('credentials', () => {
  it('the panel never handles a password or types into Naver', () => {
    expect(modalSource).not.toMatch(/naverPassword|naver-password|type=.password|page\.keyboard|\.type\(|\.fill\(/i);
  });
});
