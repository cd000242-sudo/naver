// @vitest-environment happy-dom
/**
 * [2026-11-04] 사장님: "조화모드를 모든 사용자 기본값으로 해주고 둘다 가능하게 해줘 지금 방법을 선택형으로 바꿔줘".
 * 환경설정의 '에이전트 글 검수 방식' 두 칸(조화 모드 기본 / 기존 검수 방식)이 config.agentHarmonyMode 하나로 저장되고
 * 다시 열면 그대로 채워진다. 키가 없는 기존 사용자도 조화 모드로 보인다(손으로 넣은 true 가 저장 때 사라졌던 사고).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { agentHarmonyChoiceLoad, agentHarmonyChoiceValue } from '../renderer/modules/agentHarmonyChoice.js';
import { resolveAgentHarmonyFlag } from '../content/agentHarmony/harmonyRuntime.js';

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8').replace(/\r\n/g, '\n');
const html = read('public/index.html');
const modal = read('src/renderer/modules/priceInfoModal.ts');
const copyStatic = read('scripts/copy-static.mjs');

const block = () => {
  const start = html.indexOf('<div id="agent-harmony-choice"');
  return html.slice(start, html.indexOf('<!-- 에이전트 모드 고지', start));
};

describe('settings: 에이전트 글 검수 방식', () => {
  beforeEach(() => { document.body.innerHTML = block(); });

  it('shows two choices, harmony first and checked in the markup', () => {
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="agentHarmonyChoice"]')];
    expect(radios.map((r) => r.value)).toEqual(['harmony', 'classic']);
    expect(radios[0].checked).toBe(true);
    expect(document.body.textContent).toContain('조화 모드 (기본');
    expect(document.body.textContent).toContain('기존 검수 방식');
  });

  it('load → save round trip: missing key and true show harmony, only false shows the classic review', () => {
    for (const [saved, expected] of [[undefined, true], [true, true], [false, false]] as const) {
      agentHarmonyChoiceLoad(saved === undefined ? {} : { agentHarmonyMode: saved });
      expect(agentHarmonyChoiceValue(), String(saved)).toBe(expected);
      expect(resolveAgentHarmonyFlag({ agentHarmonyMode: agentHarmonyChoiceValue() }, {}), String(saved)).toBe(expected);
    }
  });

  it('picking a choice is what gets saved', () => {
    document.querySelector<HTMLInputElement>('input[value="classic"]')!.checked = true;
    expect(agentHarmonyChoiceValue()).toBe(false);
    document.querySelector<HTMLInputElement>('input[value="harmony"]')!.checked = true;
    expect(agentHarmonyChoiceValue()).toBe(true);
  });

  it('without the choice on screen nothing is saved (no accidental overwrite)', () => {
    document.body.innerHTML = '';
    expect(agentHarmonyChoiceValue()).toBeUndefined();
  });

  it('text colors come from theme tokens only (readable on dark, light, green and blue)', () => {
    const colors = [...block().matchAll(/(?:^|[;"\s])color:\s*([^;"]+)/g)].map((m) => m[1].trim());
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) expect(color).toMatch(/^var\(--nv-[a-z0-9-]+\)$/);
  });
});

describe('wiring', () => {
  it('the settings modal fills the choice on open and sends agentHarmonyMode on save', () => {
    expect(modal).toContain("import { agentHarmonyChoiceLoad, agentHarmonyChoiceValue } from './agentHarmonyChoice.js';");
    expect(modal).toContain('agentHarmonyChoiceLoad(config as any);');
    expect(modal).toContain('const agentHarmonyModeValue = agentHarmonyChoiceValue();');
    expect(modal).toContain('...(agentHarmonyModeValue !== undefined ? { agentHarmonyMode: agentHarmonyModeValue } : {}),');
  });

  it('the module is inlined into the renderer bundle', () => {
    expect(copyStatic).toContain("'agentHarmonyChoice.js',");
  });
});
