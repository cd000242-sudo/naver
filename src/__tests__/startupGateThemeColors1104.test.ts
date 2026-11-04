// @vitest-environment happy-dom
/**
 * [2026-11-04] 사장님: "텍스트 색상이 배경과 전부 대비되어야합니다". 기동 엔진 선택 창의 이미지 엔진 이름이
 * 인라인 color:#111827 로 박혀 다크 화면에서 거의 안 보였다(실측 대비 1.06:1). 다크 시트의 보정 규칙은
 * "color: #111827"(띄어쓰기 있음)만 잡아서 붙여 쓴 값은 그대로 새었다. 이 창의 글자 색은 테마 토큰에서만 온다.
 */
import { describe, expect, it } from 'vitest';
import { startupGateViewRender } from '../renderer/modules/startupEngineGateView.js';
import { startupImageGateHtml } from '../renderer/modules/startupImageEngineGate.js';

const image = startupImageGateHtml({
  options: [
    { value: 'genspark', title: '젠스파크', price: '로그인 필요 · 모델 선택' },
    { value: 'codex-image', title: 'Codex 구독 이미지', price: '' },
  ],
  checked: 'genspark',
});
const text = [{ value: 'agent-codex', title: '에이전트 모드 (Codex 구독)', badge: '별도 API 키 불필요', description: 'Codex CLI 글생성' }];
const plans = [
  { name: '에이전트 기본 선택', checked: 'agent-codex', saved: '', agentDefault: true },
  { name: '저장된 엔진 없음', checked: '', saved: '', agentDefault: false },
  { name: '저장된 엔진 있음', checked: 'agent-codex', saved: 'agent-codex', agentDefault: false },
];

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const styleValue = (style: string, prop: 'color' | 'background') =>
  new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(style)?.[1]?.trim() || '';

/**
 * Text colors that can lose contrast on a theme: a hardcoded `color:` is allowed only when the same element paints
 * its own background (a self-contained chip) and that pair reaches 4.5:1. background-/border-/accent-color are not text.
 */
const unsafeTextColors = (root: Element): string[] =>
  [...root.querySelectorAll<HTMLElement>('[style]')].flatMap((el) => {
    const style = el.getAttribute('style') || '';
    const color = styleValue(style, 'color');
    if (!color || /^var\(--nv-[a-z0-9-]+\)$/.test(color)) return [];
    const background = styleValue(style, 'background');
    const paired = /^#[0-9a-f]{6}$/i.test(color) && /^#[0-9a-f]{6}$/i.test(background) && contrast(color, background) >= 4.5;
    return paired ? [] : [`${color} on ${background || '(theme background)'}: ${el.textContent?.trim().slice(0, 30)}`];
  });

describe('startup engine gate: every text color comes from the theme', () => {
  it.each(plans)('$name: no text color that depends on the background it happens to sit on', ({ name: _name, ...plan }) => {
    const overlay = startupGateViewRender('g', text, { ...plan, imageHtml: image, ready: true });
    expect(unsafeTextColors(overlay)).toEqual([]);
  });

  it('image engine titles inherit the card ink; intro and price lines use the themed note class', () => {
    const overlay = startupGateViewRender('g', text, { ...plans[0], imageHtml: image, ready: true });
    const section = overlay.querySelector('#startup-engine-gate-image')!;
    const titles = [...section.querySelectorAll('[data-image-engine-option] div[style*="font-weight:800"]')];
    expect(titles.map((t) => t.textContent)).toEqual(['젠스파크', 'Codex 구독 이미지']);
    expect(section.querySelector('.nv-gate-col__head + .nv-modal__note')?.textContent).toContain('이미지 탭의 생성 엔진');
    expect([...section.querySelectorAll('[data-image-engine-option] .nv-modal__note')].map((n) => n.textContent))
      .toEqual(['로그인 필요 · 모델 선택']);
  });

  it('the warning line uses the theme amber (readable on dark, light, green and blue)', () => {
    const overlay = startupGateViewRender('g', text, { ...plans[1], imageHtml: image, ready: true });
    const warning = [...overlay.querySelectorAll<HTMLElement>('div')].find((d) => d.textContent?.startsWith('저장된 엔진이 없습니다'));
    expect(warning?.getAttribute('style')).toContain('color:var(--nv-amber)');
  });
});
