// 2026-11-03: Leonardo AI / DeepInfra / Prodia 가 빠졌다. 저장된 선택값은 조용히 다른 유료 엔진으로
// 바뀌면 안 된다 — 보류 표식에 옮기고, 사용자가 고르기 전에는 생성을 막고, 고르면 저장한다.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  assertNoRetiredImageEnginePending,
  isRetiredImageEngine,
  markRetiredImageEngines,
  pendingRetiredImageEngineLabels,
  readRetiredImageEnginePending,
  resolveRetiredImageEngineChoice,
  retiredImageEngineChoices,
} from '../runtime/retiredImageEngines';

const ROOT = resolve(__dirname, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf-8');

function fakeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    dump: () => Object.fromEntries(data),
  };
}

describe('isRetiredImageEngine', () => {
  it.each(['leonardoai', 'deepinfra', 'deepinfra-flux', 'prodia'])('%s 는 지원 종료', (v) => {
    expect(isRetiredImageEngine(v)).toBe(true);
  });
  it.each(['nano-banana-2', 'openai-image', 'flow', 'dropshot', 'genspark', '', null, undefined])('%s 는 아니다', (v) => {
    expect(isRetiredImageEngine(v)).toBe(false);
  });
});

describe('markRetiredImageEngines — 지우고 끝내지 않고 보류한다', () => {
  it('옛 값이 있던 키를 표식에 남기고 원래 자리는 비운다', () => {
    const store = fakeStore({ fullAutoImageSource: 'leonardoai', globalImageSource: 'prodia', scAIImageEngine: 'deepinfra-flux', other: 'x' });
    const pending = markRetiredImageEngines(store);
    expect(pending?.keys).toEqual({ fullAutoImageSource: 'leonardoai', globalImageSource: 'prodia', scAIImageEngine: 'deepinfra-flux' });
    expect(store.getItem('fullAutoImageSource')).toBeNull();
    expect(store.getItem('other')).toBe('x');
    expect(pendingRetiredImageEngineLabels(pending!).sort()).toEqual(['DeepInfra', 'Leonardo AI', 'Prodia']);
  });

  it('멀쩡한 선택값(덕트테이프·나노바나나2 등)은 건드리지 않고 표식도 만들지 않는다', () => {
    const store = fakeStore({ fullAutoImageSource: 'openai-image', globalImageSource: 'nano-banana-2' });
    expect(markRetiredImageEngines(store)).toBeNull();
    expect(store.dump()).toEqual({ fullAutoImageSource: 'openai-image', globalImageSource: 'nano-banana-2' });
  });

  it('여러 번 불러도 같은 결과이고, 낡은 큐가 옛 값을 다시 써도 다시 보류한다', () => {
    const store = fakeStore({ fullAutoImageSource: 'prodia' });
    markRetiredImageEngines(store);
    const again = markRetiredImageEngines(store);
    expect(again?.keys).toEqual({ fullAutoImageSource: 'prodia' });
    store.setItem('globalImageSource', 'leonardoai');
    expect(markRetiredImageEngines(store)?.keys).toEqual({ fullAutoImageSource: 'prodia', globalImageSource: 'leonardoai' });
  });

  it('계정별 마지막 설정(JSON)의 옛 엔진도 비운다', () => {
    const store = fakeStore({ 'multiAccount.lastSettings': JSON.stringify({ a1: { imageSource: 'deepinfra', keep: 1 }, a2: { imageSource: 'flow' } }) });
    const pending = markRetiredImageEngines(store);
    expect(pending?.keys).toEqual({ 'multiAccount.lastSettings#a1': 'deepinfra' });
    expect(JSON.parse(store.getItem('multiAccount.lastSettings') as string)).toEqual({ a1: { keep: 1 }, a2: { imageSource: 'flow' } });
  });
});

describe('보류 중에는 이미지 생성이 막힌다', () => {
  it('assertNoRetiredImageEnginePending 은 옛 엔진 이름을 담은 한국어 오류를 던진다', () => {
    const store = fakeStore({ fullAutoImageSource: 'leonardoai' });
    expect(() => assertNoRetiredImageEnginePending(store)).toThrow(/Leonardo AI 이미지 엔진은 지원이 끝났습니다.*다시 골라 주세요/);
  });
  it('보류가 없으면 통과한다', () => {
    expect(() => assertNoRetiredImageEnginePending(fakeStore({ fullAutoImageSource: 'flow' }))).not.toThrow();
  });
});

describe('resolveRetiredImageEngineChoice — 사용자가 고르면 그때 저장한다', () => {
  it('고를 수 없는 값(옛 엔진·모르는 값)은 아무것도 바꾸지 않는다', () => {
    const store = fakeStore({ fullAutoImageSource: 'prodia' });
    markRetiredImageEngines(store);
    expect(resolveRetiredImageEngineChoice('leonardoai', store)).toBe(false);
    expect(resolveRetiredImageEngineChoice('nope', store)).toBe(false);
    expect(readRetiredImageEnginePending(store)).not.toBeNull();
    expect(store.getItem('fullAutoImageSource')).toBeNull();
  });

  it('고른 엔진을 메인 키 3개에 저장하고 표식을 지운다 — 이후 생성 차단도 풀린다', () => {
    const store = fakeStore({ globalImageSource: 'deepinfra' });
    markRetiredImageEngines(store);
    expect(resolveRetiredImageEngineChoice('nano-banana-2', store)).toBe(true);
    expect(store.dump()).toEqual({ fullAutoImageSource: 'nano-banana-2', globalImageSource: 'nano-banana-2', scAIImageEngine: 'nano-banana-2' });
    expect(() => assertNoRetiredImageEnginePending(store)).not.toThrow();
  });

  it('다른 키에 사용자가 직접 고른 엔진은 덮어쓰지 않는다 (옛 값 자리·빈 자리만 채움)', () => {
    const store = fakeStore({ scAIImageEngine: 'leonardoai', globalImageSource: 'flow' });
    markRetiredImageEngines(store);
    expect(resolveRetiredImageEngineChoice('openai-image', store)).toBe(true);
    expect(store.getItem('scAIImageEngine')).toBe('openai-image');
    expect(store.getItem('globalImageSource')).toBe('flow');
    expect(store.getItem('fullAutoImageSource')).toBe('openai-image');
  });

  it('폴더 부족분 엔진은 옛 값이 있던 경우에만 새 선택으로 바꾼다', () => {
    const had = fakeStore({ localFolderFallbackEngine: 'prodia' });
    markRetiredImageEngines(had);
    resolveRetiredImageEngineChoice('openai-image', had);
    expect(had.getItem('localFolderFallbackEngine')).toBe('openai-image');

    const none = fakeStore({ fullAutoImageSource: 'prodia' });
    markRetiredImageEngines(none);
    resolveRetiredImageEngineChoice('openai-image', none);
    expect(none.getItem('localFolderFallbackEngine')).toBeNull();
  });

  it('고를 수 있는 엔진은 화면에 남은 5종과 같다', () => {
    expect([...retiredImageEngineChoices()].sort()).toEqual(['dropshot', 'flow', 'genspark', 'nano-banana-2', 'openai-image']);
  });
});

describe('화면 · 배선 계약', () => {
  const html = read('public/index.html');

  it('옛 엔진 키 입력칸 · 검증 버튼 · 모델 칸이 화면에 없다', () => {
    for (const id of ['leonardoai-api-key', 'deepinfra-api-key', 'prodia-token', 'prodia-model-select', 'leonardoai-model-select', 'adspower-api-key-input', 'adspower-save-apikey-btn']) {
      expect(html, id).not.toContain(`id="${id}"`);
    }
  });

  it('이미지 엔진 드롭다운 · 설정 그리드 어디에도 옛 엔진 선택지가 없다', () => {
    const settings = read('src/renderer/components/HeadingImageSettings.ts');
    for (const source of [html, settings]) {
      expect(source).not.toMatch(/<option value="(leonardoai|deepinfra|prodia)"/);
      expect(source).not.toMatch(/data-value="(leonardoai|deepinfra|prodia)"/);
    }
    expect(read('src/renderer/renderer.ts')).not.toContain('injectDeepInfraImageSourceOption');
    expect(read('src/runtime/imageEngineCatalog.ts')).not.toMatch(/value: 'prodia'/);
    expect(read('src/renderer/modules/imageGenStudioCore.ts')).not.toMatch(/value: 'prodia'/);
  });

  it('Gemini 라벨은 필수가 아니라 실제 쓰임을 말한다', () => {
    expect(html).not.toMatch(/Gemini API 키\s*\(필수\)/);
    expect(html).toContain('사진으로 글쓰기 · 나노바나나 이미지에 사용');
  });

  it('AdsPower 키는 저장하지 않고 옛 저장값을 한 번 지운다 (연동 기능은 유지)', () => {
    const src = read('src/renderer/utils/settingsModal.ts');
    expect(src).not.toMatch(/localStorage\.setItem\('adspower_api_key'/);
    expect(src).toContain("localStorage.removeItem('adspower_api_key')");
    expect(src).toContain("'adspower-test-btn'");
  });

  it('기동 때 보류하고, 기동 엔진 창 뒤에 재선택 안내를 띄우고, 생성 직전에 막는다', () => {
    const renderer = read('src/renderer/renderer.ts');
    expect(renderer).toContain('markRetiredImageEngines();');
    expect(renderer.indexOf('initStartupEngineGate()')).toBeLessThan(renderer.indexOf('initRetiredImageEngineGate()'));
    expect(read('src/renderer/modules/multiAccountManager.ts')).toContain('assertNoRetiredImageEnginePending()');
  });

  it('새 모듈이 인라인 목록과 지문 목록에 등록돼 있다', () => {
    const copyStatic = read('scripts/copy-static.mjs');
    expect(copyStatic).toContain("'retiredImageEngines.js'");
    expect(copyStatic).toContain("'retiredImageEngineGate.js'");
    const fp = read('src/contentQualityV3/candidateRuntimeFingerprint.ts');
    expect(fp).toContain("'src/runtime/retiredImageEngines.ts'");
    expect(fp).toContain("'src/renderer/modules/retiredImageEngineGate.ts'");
    expect(fp).toContain("'src/security/removedConfigKeys.ts'");
  });

  it('계정별 저장 엔진도 한 번 비운다', () => {
    expect(read('src/account/blogAccountManager.ts')).toContain('dropRetiredImageEngines');
  });
});
