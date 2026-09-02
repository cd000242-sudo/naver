import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { reconcileOpenaiImageModelSelection } from '../image/openaiImageModelReconcile';

/**
 * [2026-09-02 세 번째] "gpt-image-2 를 골랐는데 2 를 선택하라고 한다."
 *
 * 저장값이 두 계정으로 갈려 있었다.
 *   settings_acct1.json      openaiImageModel = gpt-image-1.5   (부팅이 먼저 복원하는 낡은 계정)
 *   settings_b52d….json      openaiImageModel = gpt-image-2     (진짜 계정, 사장님이 고른 값)
 * imageManagementTab 이 부팅 때 낡은 계정 값을 localStorage 에 도장 찍고, costAndAutoGen 은
 * localStorage 를 먼저 읽는다. 08-25 · 09-01 두 수정은 "비어 있으면 config" 였다 —
 * 오늘 값은 비어 있지 않고 틀렸다. P1(텍스트 모델) 과 같은 부류, 같은 실수다.
 *
 * 그래서 화면·localStorage 를 믿지 않는다. 그 순간의 config 가 SSOT 다.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('config 가 SSOT — 화면값이 어긋나면 config 로 맞춘다', () => {
  it('실측 조합: 화면 1.5 · config 2 → 2, corrected', () => {
    const r = reconcileOpenaiImageModelSelection('gpt-image-1.5', 'gpt-image-2');
    expect(r.model).toBe('gpt-image-2');
    expect(r.corrected).toBe(true);
    expect(r.reason).toContain('gpt-image-1.5');
    expect(r.reason).toContain('gpt-image-2');
  });

  it('화면이 비었으면 config 로 채운다 — 교정이 아니라 채움이다', () => {
    const r = reconcileOpenaiImageModelSelection('', 'gpt-image-2');
    expect(r).toEqual({ model: 'gpt-image-2', corrected: false });
  });

  it('config 가 비었으면 화면값 그대로 — 추측하지 않는다', () => {
    const r = reconcileOpenaiImageModelSelection('gpt-image-2', '');
    expect(r).toEqual({ model: 'gpt-image-2', corrected: false });
  });

  it('둘 다 비었으면 빈 값 — 기본값을 지어내지 않는다 (검사가 "선택되지 않음" 을 말하게 둔다)', () => {
    expect(reconcileOpenaiImageModelSelection('', '')).toEqual({ model: '', corrected: false });
    expect(reconcileOpenaiImageModelSelection(undefined, undefined)).toEqual({ model: '', corrected: false });
  });

  it('같으면 손대지 않는다', () => {
    expect(reconcileOpenaiImageModelSelection('gpt-image-2', 'gpt-image-2')).toEqual({ model: 'gpt-image-2', corrected: false });
  });

  it('공백은 값이 아니다', () => {
    const r = reconcileOpenaiImageModelSelection('  gpt-image-1.5 ', ' gpt-image-2 ');
    expect(r.model).toBe('gpt-image-2');
    expect(r.corrected).toBe(true);
  });
});

describe('배선: 발화 경로 셋이 전부 지난다 — 한 곳만 고치면 다음 경로에서 재발한다', () => {
  it('costAndAutoGen: localStorage 를 먼저 믿던 자리가 교정 결과를 받는다', () => {
    const src = read('renderer/modules/costAndAutoGen.ts');
    expect(src).toMatch(/reconcileOpenaiImageModelSelection\(/u);
    expect(src).toMatch(/options\.imageModel = imageModelFix\.model;/u);
    // 되돌린 흔적 — "비어 있을 때만 config" 가 다시 오면 안 된다
    expect(src).not.toMatch(/if \(!options\.imageModel && provider === 'openai-image'\)/u);
  });

  it('fullAutoFlow: formData 를 먼저 믿던 자리가 교정 결과를 받는다', () => {
    const src = read('renderer/modules/fullAutoFlow.ts');
    expect(src).toMatch(/reconcileOpenaiImageModelSelection\(/u);
    expect(src).toMatch(/imageModel = imageModelFix\.model;/u);
    expect(src).not.toMatch(/if \(!imageModel && \(imageSource === 'openai-image'/u);
  });

  it('main imageGenerator: 렌더러가 보낸 값을 검사 전에 config 로 맞춘다', () => {
    const src = read('imageGenerator.ts');
    const fixAt = src.indexOf('reconcileOpenaiImageModelSelection(');
    const assertAt = src.indexOf('assertShoppingReferenceGenerationSelectionSupported(normalizedProvider');
    expect(fixAt).toBeGreaterThan(0);
    expect(assertAt).toBeGreaterThan(fixAt);
  });

  it('렌더러 번들에 실린다 — 등록 빠지면 런타임에서만 터진다', () => {
    const cs = read('../scripts/copy-static.mjs');
    expect(cs).toContain("label: 'image/openaiImageModelReconcile.js'");
  });
});
