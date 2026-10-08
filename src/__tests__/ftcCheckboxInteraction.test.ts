import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FTC_DISCLOSURE_PRESETS } from '../automation/ftcDisclosurePresets.js';
import { resolveFtcModeTransition } from '../renderer/utils/ftcModeTransition.js';

// Execute both production initialization blocks, including local and bubbling
// listeners: mocking syncAllFtc alone would miss the original click rollback.
const source = ts.createSourceFile('renderer.ts', readFileSync(resolve('src/renderer/renderer.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const init = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'initUnifiedTab');
const blocks = init?.body?.statements.filter(node => ts.isBlock(node) && /const (ftcCheckbox|FTC_PRESETS_SYNC) =/.test(node.statements[0]?.getText(source) || ''));
if (blocks?.length !== 2) throw new Error('Missing production FTC initialization blocks');
const compiled = ts.transpileModule(blocks.map(node => node.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const initialize = new Function('document', 'localStorage', 'setTimeout', 'RENDERER_FTC_PRESETS', 'resolveFtcModeTransition', compiled);
const forms = [
  { prefix: 'unified', panel: 'ftc-options-panel' },
  { prefix: 'continuous', panel: 'continuous-ftc-panel' },
  { prefix: 'ma', panel: 'ma-ftc-panel' },
] as const;
const presets = { ...FTC_DISCLOSURE_PRESETS, custom: '' };

function harness(mode: string, saved: Record<string, string> = {}) {
  const browser = new Window({ url: 'https://app.test/' });
  const document = browser.document;
  document.body.innerHTML = `<input id="unified-content-mode" value="${mode}">
    <span id="ftc-status-badge"></span><div id="ftc-disclosure-section"></div>
    <button id="ftc-reset-btn">Reset</button>` + forms.map(({ prefix, panel }) => `
      <input type="checkbox" id="${prefix}-ftc-disclosure">
      <div id="${panel}"></div>
      <select id="${prefix}-ftc-preset">${Object.keys(presets).map(key => `<option value="${key}">${key}</option>`).join('')}</select>
      <textarea id="${prefix}-ftc-text"></textarea>`).join('');
  for (const [key, value] of Object.entries(saved)) browser.localStorage.setItem(key, value);
  initialize(document, browser.localStorage, setTimeout, presets, resolveFtcModeTransition);
  const checkbox = (prefix = 'unified') => document.getElementById(`${prefix}-ftc-disclosure`) as unknown as HTMLInputElement;
  const change = (id: string, value: string) => {
    const element = document.getElementById(id) as unknown as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new browser.Event('change', { bubbles: true }) as unknown as Event);
  };
  const assertEnabled = (enabled: boolean) => {
    expect(browser.localStorage.getItem('ftcDisclosureEnabled')).toBe(String(enabled));
    for (const { prefix, panel } of forms) {
      expect(checkbox(prefix).checked, prefix).toBe(enabled);
      expect(document.getElementById(panel)?.style.display, panel).toBe(enabled ? 'block' : 'none');
    }
    expect(document.getElementById('ftc-status-badge')?.style.display).toBe(enabled ? 'inline-block' : 'none');
  };
  return { browser, document, checkbox, change, assertEnabled };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('FTC checkbox user interaction', () => {
  it.each(['seo', 'homefeed'])('keeps manual ON and OFF after native clicks in %s', mode => {
    const h = harness(mode);
    h.checkbox().click();
    h.assertEnabled(true);
    vi.advanceTimersByTime(300);
    h.assertEnabled(true);
    h.checkbox().click();
    h.assertEnabled(false);
  });

  it('allows manual OFF in affiliate mode, including delayed initialization sync', () => {
    const h = harness('affiliate');
    h.checkbox().click();
    h.assertEnabled(false);
    vi.advanceTimersByTime(300);
    h.assertEnabled(false);
  });

  it.each(['continuous', 'ma'])('syncs a native %s checkbox click to every form', prefix => {
    const h = harness('seo');
    vi.advanceTimersByTime(300);
    h.checkbox(prefix).click();
    h.assertEnabled(true);
    h.checkbox(prefix).click();
    h.assertEnabled(false);
  });

  it.each(['seo', 'homefeed', 'affiliate'])('preserves mode defaults on initialization in %s despite stale saved state', mode => {
    const h = harness(mode, { ftcDisclosureEnabled: String(mode !== 'affiliate') });
    vi.advanceTimersByTime(300);
    h.assertEnabled(mode === 'affiliate');
  });

  it.each(['seo', 'affiliate'])('preserves manual choice while editing presets, text and resetting in %s', mode => {
    const h = harness(mode);
    h.checkbox().click();
    const enabled = mode !== 'affiliate';
    for (const { prefix } of forms) {
      h.change(`${prefix}-ftc-preset`, 'custom');
      h.assertEnabled(enabled);
      const text = h.document.getElementById(`${prefix}-ftc-text`)!;
      (text as unknown as HTMLTextAreaElement).value = `My disclosure from ${prefix}`;
      text.dispatchEvent(new h.browser.Event('input', { bubbles: true }));
      h.assertEnabled(enabled);
      for (const target of forms) {
        expect((h.document.getElementById(`${target.prefix}-ftc-text`) as unknown as HTMLTextAreaElement).value).toBe(`My disclosure from ${prefix}`);
      }
    }
    h.change('unified-ftc-preset', 'sponsored');
    h.assertEnabled(enabled);
    h.document.getElementById('ftc-reset-btn')!.click();
    h.assertEnabled(enabled);
    expect(h.browser.localStorage.getItem('ftcDisclosureText')).toBe(presets.sponsored);
  });

  it('applies mode defaults on actual mode changes while retaining the user wording', () => {
    const h = harness('seo', { ftcDisclosurePreset: 'custom', ftcDisclosureText: 'My own disclosure' });
    for (const mode of ['affiliate', 'homefeed', 'affiliate', 'seo']) {
      h.change('unified-content-mode', mode);
      h.assertEnabled(mode === 'affiliate');
      expect(h.browser.localStorage.getItem('ftcDisclosurePreset')).toBe('custom');
      expect(h.browser.localStorage.getItem('ftcDisclosureText')).toBe('My own disclosure');
    }
  });
});
