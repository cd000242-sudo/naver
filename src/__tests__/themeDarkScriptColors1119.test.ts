/**
 * [2026-11-19] Owner: "검은색상으로 하면 텍스트색상도 검은색이라서 환경설정 텍스트가 안 보여요".
 * Root cause: the dark sheet repaints inline colours by attribute text ([style*="color: #1f2937"]), but a colour set
 * from a script (el.style.color = '#1f2937') is written back as "color: rgb(31, 41, 55)", so dark ink stayed on the
 * repainted dark surface (measured 1.06-1.32:1 in a headless window). Section 3b adds the rgb() spellings.
 * Source assertions only (no build, no live window).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dark = readFileSync(resolve(__dirname, '../..', 'public/theme-naver-dark.css'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule (selector text + body) whose selector list contains the given fragment. */
const rulesWith = (fragment: string) => dark.split('}').filter((rule) => rule.split('{')[0].includes(fragment));

describe('dark mode: colours set from scripts (rgb() spelling)', () => {
  it.each(['31, 41, 55', '17, 24, 39', '26, 26, 26', '0, 0, 0', '51, 51, 51'])('dark ink rgb(%s) becomes light ink', (rgb) => {
    const rules = rulesWith(`color: rgb(${rgb})`);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((rule) => rule.includes('color: var(--nv-ink) !important'))).toBe(true);
  });

  it.each(['75, 85, 99', '55, 65, 81', '107, 114, 128'])('mid gray rgb(%s) becomes the readable gray', (rgb) => {
    expect(rulesWith(`color: rgb(${rgb})`).some((rule) => rule.includes('color: var(--nv-ink-3) !important'))).toBe(true);
  });

  it('text selectors are anchored so background-color / border-color do not match', () => {
    const selectors = rulesWith('color: rgb(31, 41, 55)').map((rule) => rule.split('{')[0]).join(' ');
    expect(selectors).toContain('[style^="color: rgb(31, 41, 55)"]');
    expect(selectors).toContain('[style*="; color: rgb(31, 41, 55)"]');
    expect(selectors).not.toMatch(/\[style\*="color: rgb\(31, 41, 55\)"\]/);
  });

  it.each(['249, 250, 251', '243, 244, 246', '248, 249, 250'])('light surface rgb(%s) is repainted with light ink', (rgb) => {
    const rules = rulesWith(`background: rgb(${rgb})`);
    expect(rules.some((rule) => rule.includes('background: var(--nv-card) !important') && rule.includes('color: var(--nv-ink) !important'))).toBe(true);
  });

  it('every added rule stays inside the dark scope', () => {
    for (const rule of [...rulesWith('color: rgb('), ...rulesWith('.gemini-model-card')]) {
      expect(rule.split('{')[0]).toContain(':root[data-theme="dark"]');
    }
  });

  it('settings engine cards take the dark surface', () => {
    expect(rulesWith('#settings-modal .gemini-model-card').some((rule) => rule.includes('background: var(--nv-card) !important'))).toBe(true);
  });
});
