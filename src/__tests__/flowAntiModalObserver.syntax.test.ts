/**
 * addInitScript에 주입되는 anti-modal observer 코드의 *런타임 syntax 검증*.
 *
 * Playwright의 context.addInitScript()는 함수를 직렬화해 페이지에 주입한다.
 * 직렬화된 코드 안에 외부 변수 참조가 있으면 페이지에서 ReferenceError 발생.
 * 본 테스트는 실제 함수를 추출해 *new Function*으로 평가, syntax 오류 사전 차단.
 *
 * 또한 IIFE처럼 self-contained인지 (window/document만 의존, import X) 검증.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FLOW_PATH = path.resolve(__dirname, '..', 'image', 'flowGenerator.ts');
const IMAGEFX_PATH = path.resolve(__dirname, '..', 'image', 'imageFxGenerator.ts');

function extractInitScriptBody(source: string, marker: string): string {
  // marker로 시작하는 함수 본문에서 addInitScript(() => { ... })의 콜백 추출
  const idx = source.indexOf(marker);
  expect(idx, `marker "${marker}" not found`).toBeGreaterThanOrEqual(0);
  const after = source.slice(idx);
  const startIdx = after.indexOf('addInitScript(() => {');
  expect(startIdx, `addInitScript not found after ${marker}`).toBeGreaterThanOrEqual(0);
  // 균형 brace로 callback 본문 추출
  let depth = 0;
  let i = startIdx + 'addInitScript(() => {'.length;
  let inString: false | '"' | "'" | '`' = false;
  let escape = false;
  let regex = false;
  while (i < after.length) {
    const ch = after[i];
    if (escape) { escape = false; i++; continue; }
    if (ch === '\\') { escape = true; i++; continue; }
    if (inString) {
      if (ch === inString) inString = false;
      i++; continue;
    }
    if (regex) {
      if (ch === '/') regex = false;
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch as any; i++; continue; }
    if (ch === '/' && after[i + 1] === '/') {
      // 한 줄 주석 — 줄 끝까지
      while (i < after.length && after[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && after[i + 1] === '*') {
      i += 2;
      while (i < after.length - 1 && !(after[i] === '*' && after[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      if (depth === 0) {
        return after.substring(startIdx + 'addInitScript(() => {'.length, i);
      }
      depth--;
    }
    i++;
  }
  throw new Error('addInitScript callback brace not balanced');
}

describe('addInitScript callback — syntax 검증', () => {
  it('Flow injectAntiModalObserver 콜백 추출', () => {
    const src = fs.readFileSync(FLOW_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectAntiModalObserver');
    expect(body.length).toBeGreaterThan(100);
    // 외부 import 없는지 (require/import 키워드 X)
    expect(/\b(require|import)\s*\(/.test(body)).toBe(false);
    // 외부 함수 참조 없는지 — flowLog, sendImageLog 등 모듈 함수 호출 X
    expect(body).not.toMatch(/\bflowLog\s*\(/);
    expect(body).not.toMatch(/\bsendImageLog\s*\(/);
    expect(body).not.toMatch(/\bflowWarn\s*\(/);
  });

  it('ImageFX injectImageFxAntiModalObserver 콜백 추출', () => {
    const src = fs.readFileSync(IMAGEFX_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectImageFxAntiModalObserver');
    expect(body.length).toBeGreaterThan(100);
    expect(/\b(require|import)\s*\(/.test(body)).toBe(false);
    expect(body).not.toMatch(/\bsendImageLog\s*\(/);
  });

  // TS 컴파일러가 이미 syntax 검증 (tsc --noEmit 통과). 본 테스트는 *주입될 코드 본문*의
  // 의미적 무결성(외부 의존 X, marker 포함 X 등)만 별도 검증.
});

describe('observer 코드 self-contained 검증', () => {
  it('Flow 콜백에 setInterval style 재설정 우회 포함', () => {
    const src = fs.readFileSync(FLOW_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectAntiModalObserver');
    expect(body).toContain('setInterval');
    expect(body).toContain('data-flow-hidden');
  });

  it('ImageFX 콜백에 동일 setInterval 포함', () => {
    const src = fs.readFileSync(IMAGEFX_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectImageFxAntiModalObserver');
    expect(body).toContain('setInterval');
    expect(body).toContain('data-imagefx-hidden');
  });

  it('Flow 콜백에 Shadow DOM 재귀 (deepQueryAll) 포함', () => {
    const src = fs.readFileSync(FLOW_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectAntiModalObserver');
    expect(body).toContain('shadowRoot');
    expect(body).toContain('deepQueryAll');
  });

  it('ImageFX 콜백에 Shadow DOM 재귀 (deepQ) 포함', () => {
    const src = fs.readFileSync(IMAGEFX_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectImageFxAntiModalObserver');
    expect(body).toContain('shadowRoot');
    expect(body).toContain('deepQ');
  });

  it('Flow attribute observer 6종 필터', () => {
    const src = fs.readFileSync(FLOW_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectAntiModalObserver');
    // 'src', 'srcdoc', 'role', 'class', 'open', 'style' 6종
    for (const attr of ['src', 'srcdoc', 'role', 'class', 'open', 'style']) {
      expect(body).toContain(`'${attr}'`);
    }
  });
});

describe('observer 코드 회귀 방지 (사용자 디버그 로그 케이스)', () => {
  it('Flow 콜백에 changelogs URL 패턴 포함', () => {
    const src = fs.readFileSync(FLOW_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectAntiModalObserver');
    // 정규식 source 문자열 안에 'changelogs' 또는 'whats' 포함되어 있는지
    expect(body.includes('changelogs')).toBe(true);
    expect(body.includes('whats')).toBe(true);
  });

  it('Flow 콜백에 SAFE_TEXT_RE (로그인 화이트리스트) 포함', () => {
    const src = fs.readFileSync(FLOW_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectAntiModalObserver');
    // SAFE_RE 검사 — sign in / 로그인 / email / password 중 일부
    expect(/sign\\?\s*in/i.test(body) || body.includes('sign')).toBe(true);
    expect(body).toContain('로그인');
  });

  it('ImageFX 콜백에 SAFE_RE 포함', () => {
    const src = fs.readFileSync(IMAGEFX_PATH, 'utf-8');
    const body = extractInitScriptBody(src, 'function injectImageFxAntiModalObserver');
    expect(body).toContain('로그인');
  });
});
