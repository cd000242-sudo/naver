// @vitest-environment happy-dom
/**
 * [2026-11-03] 사장님 요청: 기동 선택 창의 글생성 엔진과 이미지 엔진을 위아래가 아니라 좌우로 같이 보이게.
 * With an image section the gate lays the two lists out as two columns (text left, image right), each scrolling
 * on its own; without one it stays the single text list.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startupGateViewRender } from '../renderer/modules/startupEngineGateView.js';
import { startupImageGateHtml } from '../renderer/modules/startupImageEngineGate.js';

const text = [{ value: 'agent-codex', title: 'Codex', badge: '', description: '' }];
const image = startupImageGateHtml({ options: [{ value: 'codex-image', title: 'Codex 이미지', price: '' }], checked: '' });
const css = readFileSync(resolve(__dirname, '../../public/theme-naver-components.css'), 'utf8').replace(/\r\n/g, '\n');

describe('startup gate: text and image engine lists side by side', () => {
  it('two columns inside one row, text list first and image section second', () => {
    const overlay = startupGateViewRender('g', text, { checked: '', saved: '', agentDefault: true, imageHtml: image, ready: false });
    const modal = overlay.querySelector('.nv-modal')!;
    expect(modal.classList.contains('nv-gate--two')).toBe(true);
    const cols = [...overlay.querySelectorAll('.nv-gate-cols > .nv-gate-col')];
    expect(cols).toHaveLength(2);
    expect(cols[0].querySelector('#g-list')).not.toBeNull();
    expect(cols[1].id).toBe('startup-engine-gate-image');
    expect(cols.every((col) => col.querySelector('.nv-gate-col__list'))).toBe(true);
  });

  it('without an image section it stays one narrow column', () => {
    const overlay = startupGateViewRender('g', text, { checked: '', saved: '', agentDefault: true, imageHtml: '', ready: false });
    expect(overlay.querySelector('.nv-modal')!.classList.contains('nv-gate--two')).toBe(false);
    expect(overlay.querySelectorAll('.nv-gate-cols > .nv-gate-col')).toHaveLength(1);
  });

  it('the theme makes it a two-column grid with scrolling lists, stacked again on narrow windows', () => {
    expect(css).toMatch(/\.nv-gate--two \.nv-gate-cols \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.nv-gate-col__list \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/@media \(max-width: 760px\) \{[^@]*\.nv-gate--two \.nv-gate-cols \{ display: flex;/);
  });
});
