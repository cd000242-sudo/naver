/**
 * [2026-10-10] 나노바나나 단일화 — 사용자에게는 나노바나나2(nano-banana-2)만 남긴다.
 *
 * 화면(index.html·HeadingImageSettings)에서 프로(nano-banana-pro)·2.5(nano-banana)를 내리고,
 * 저장값 이관·기본값·main 입구 별칭이 함께 바뀌었는지 확인한다.
 *
 * 제외 대상(남기는 것이 맞는 곳):
 *   - Leonardo 하위 모델 select 의 value="nano-banana-pro" (leonardoaiModel — 별개 키)
 *   - 백엔드 호환: ALLOWED_PROVIDER·NANO_PROVIDER_TO_MODEL_KEY·nanoBananaProGenerator 내부 표기·라우팅 분기
 *   - 별칭/이관 코드 자체(옛 값을 알아야 나노바나나2로 돌릴 수 있다)
 *   - dropshot·flow 안내 문구 속 모델 이름
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  migrateNanoBananaSingleEngine,
  normalizeRetiredNanoEngine,
  normalizeRetiredNanoSlotModel,
} from '../runtime/imageProviderMigration.js';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const html = read('../public/index.html');
const settings = read('renderer/components/HeadingImageSettings.ts');

/** 최소 Storage 대역 */
function fakeStorage(init: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(init));
  return {
    map,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

/** `<select id="...">` 블록 */
function selectBlock(source: string, id: string): string {
  return source.match(new RegExp(`id="${id}"[\\s\\S]{0,6000}?</select>`))?.[0] || '';
}

describe('화면 — 프로·2.5 옵션이 내려갔다', () => {
  it('메인 이미지 소스 select 에 nano-banana-2 만 남는다', () => {
    const block = selectBlock(html, 'image-source-select');
    expect(block).toContain('value="nano-banana-2"');
    expect(block).not.toContain('value="nano-banana-pro"');
    expect(block).not.toMatch(/value="nano-banana"/);
  });

  it('쇼핑 라디오 2곳(연속발행·다중계정)에서 프로 라디오가 빠지고 나노바나나2는 남는다', () => {
    for (const name of ['continuous-modal-shopping-subimage-source', 'ma-shopping-subimage-source']) {
      expect(html).toMatch(new RegExp(`name="${name}"\\s+value="nano-banana-2"`));
      expect(html).not.toMatch(new RegExp(`name="${name}"\\s+value="nano-banana-pro"`));
      expect(html).not.toMatch(new RegExp(`name="${name}"\\s+value="nano-banana"`));
    }
  });

  it('이미지 모델 슬롯 select 에 Gemini 2.5 / 3 Pro / 3 Pro 4K 옵션이 없다', () => {
    for (const id of ['nano-banana-main-model', 'nano-banana-sub-model']) {
      const block = selectBlock(html, id);
      expect(block, id).toContain('value="gemini-3-1-flash"');
      expect(block, id).not.toContain('gemini-2.5-flash');
      expect(block, id).not.toContain('gemini-3-pro');
    }
  });

  it('엔진 카드·테스트 엔진 select·내 폴더 부족분 select·서브모달 슬롯에 프로/2.5 가 없다', () => {
    const card = settings.match(/id="image-source-submodal"[\s\S]{0,8000}?image-source-confirm/)?.[0] || '';
    expect(card).toContain('data-value="nano-banana-2"');
    expect(card).not.toContain('data-value="nano-banana-pro"');
    expect(card).not.toContain('data-value="nano-banana"');

    for (const id of ['test-engine-select', 'local-folder-fallback-engine']) {
      const block = selectBlock(settings, id);
      expect(block, id).toContain('value="nano-banana-2"');
      expect(block, id).not.toContain('value="nano-banana-pro"');
      expect(block, id).not.toMatch(/value="nano-banana"/);
    }

    for (const id of ['submodal-nano-main-model', 'submodal-nano-sub-model']) {
      const block = selectBlock(settings, id);
      expect(block, id).toContain('value="gemini-3-1-flash"');
      expect(block, id).not.toContain('gemini-2.5-flash');
    }
  });

  it('Leonardo 하위 모델(nano-banana-pro)은 그대로 남아 있다', () => {
    expect(html).toContain('<option value="nano-banana-pro">🍌 Nano Banana Pro ($0.21/장');
    expect(settings).toContain('<option value="nano-banana-pro">🍌 Nano Banana Pro - $0.21');
  });
});

describe('renderer — 별칭·이관', () => {
  it('HeadingImageSettings 별칭 맵이 프로·2.5 를 나노바나나2로 돌린다', () => {
    expect(settings).toMatch(
      /IMAGE_SOURCE_ALIAS_MAP: Record<string, string> = \{[^}]*'nano-banana-pro': 'nano-banana-2'[^}]*'nano-banana': 'nano-banana-2'[^}]*\}/,
    );
  });

  it('UnifiedDOMCache 별칭 맵이 프로·2.5 를 나노바나나2로 돌리고 기본값이 나노바나나2다', () => {
    const udc = read('renderer/modules/unifiedDOMCache.ts');
    expect(udc).toMatch(/'nano-banana-pro': 'nano-banana-2',\s*'nano-banana': 'nano-banana-2'/);
    expect(udc).not.toMatch(/\|\| 'nano-banana-pro'/);
  });

  it('normalizeRetiredNanoEngine: 옛 값만 바꾸고 나머지는 그대로 둔다', () => {
    expect(normalizeRetiredNanoEngine('nano-banana-pro')).toBe('nano-banana-2');
    expect(normalizeRetiredNanoEngine('nano-banana')).toBe('nano-banana-2');
    expect(normalizeRetiredNanoEngine('nano-banana-2')).toBe('nano-banana-2');
    expect(normalizeRetiredNanoEngine('dropshot')).toBe('dropshot');
    expect(normalizeRetiredNanoEngine(undefined)).toBeUndefined();
    expect(normalizeRetiredNanoEngine(null)).toBeNull();
  });

  it('normalizeRetiredNanoSlotModel: 2.5 / 3 Pro / 3 Pro 4K 만 3.1 Flash 로 바꾼다', () => {
    for (const v of ['gemini-2.5-flash', 'gemini-3-pro', 'gemini-3-pro-4k']) {
      expect(normalizeRetiredNanoSlotModel(v)).toBe('gemini-3-1-flash');
    }
    expect(normalizeRetiredNanoSlotModel('gemini-3-1-flash')).toBe('gemini-3-1-flash');
    expect(normalizeRetiredNanoSlotModel('')).toBe('');
  });

  it('migrateNanoBananaSingleEngine: 엔진 키 5종과 슬롯 키 3종을 이관하고 멱등이다', () => {
    const store = fakeStorage({
      fullAutoImageSource: 'nano-banana-pro',
      globalImageSource: 'nano-banana',
      scAIImageEngine: 'nano-banana-pro',
      scSubImageSource: 'nano-banana-pro',
      localFolderFallbackEngine: 'nano-banana-pro',
      nanoBananaMainModel: 'gemini-3-pro-4k',
      nanoBananaSubModel: 'gemini-2.5-flash',
      nanoBananaModel: 'gemini-3-pro',
    });
    expect(migrateNanoBananaSingleEngine(store)).toBe(8);
    for (const key of ['fullAutoImageSource', 'globalImageSource', 'scAIImageEngine', 'scSubImageSource', 'localFolderFallbackEngine']) {
      expect(store.getItem(key), key).toBe('nano-banana-2');
    }
    for (const key of ['nanoBananaMainModel', 'nanoBananaSubModel', 'nanoBananaModel']) {
      expect(store.getItem(key), key).toBe('gemini-3-1-flash');
    }
    expect(migrateNanoBananaSingleEngine(store)).toBe(0);
  });

  it('migrateNanoBananaSingleEngine: 다른 엔진 선택과 빈 키는 건드리지 않는다', () => {
    const store = fakeStorage({ fullAutoImageSource: 'dropshot', globalImageSource: 'flow', nanoBananaMainModel: 'gemini-3-1-flash' });
    expect(migrateNanoBananaSingleEngine(store)).toBe(0);
    expect(store.getItem('fullAutoImageSource')).toBe('dropshot');
    expect(store.getItem('globalImageSource')).toBe('flow');
    expect(store.getItem('scAIImageEngine')).toBeNull();
  });

  it('기동 시 이관이 호출되고, 연속발행 큐·다중계정 설정은 읽을 때 정규화한다', () => {
    expect(read('renderer/renderer.ts')).toMatch(/migrateImageProviderStorage\(\);[\s\S]{0,200}?migrateNanoBananaSingleEngine\(\);/);
    expect(read('renderer/modules/continuousPublishing.ts')).toContain('normalizeRetiredNanoEngine(item.imageSource)');
    const multi = read('renderer/modules/multiAccountManager.ts');
    expect(multi).toContain('normalizeRetiredNanoEngine(account.settings?.imageSource)');
    expect(multi).toContain('normalizeRetiredNanoEngine(last.imageSource)');
    expect(multi).toContain('normalizeRetiredNanoEngine(queueItem.imageSource)');
  });

  it('연속발행 나노바나나2 라벨이 3.1 Flash ₩97 로 고쳐졌다 (기존 2.5 ₩54 오표기 버그)', () => {
    const cp = read('renderer/modules/continuousPublishing.ts');
    expect(cp).toContain("'nano-banana-2': '🍌 나노바나나2 (Gemini 3.1 Flash Image, ₩97/장) ★'");
    expect(cp).not.toContain('Gemini 2.5 Flash Image, ₩54/장');
  });
});

describe('기본값 — 폴백이 더 이상 프로가 아니다', () => {
  const files = [
    'renderer/modules/unifiedDOMCache.ts',
    'renderer/modules/pipelineConfig.ts',
    'renderer/modules/publishingHandlers.ts',
    'renderer/modules/multiAccountManager.ts',
    'renderer/modules/imageSyncService.ts',
    'renderer/modules/localFolderImageLoader.ts',
    'renderer/modules/formUtilities.ts',
    'renderer/modules/titleGeneration.ts',
    'renderer/modules/thumbnailGenerator.ts',
    'renderer/modules/imageDisplayGrid.ts',
    'renderer/modules/headingImageGen.ts',
    'renderer/renderer.ts',
    'main/ipc/imageHandlers.ts',
  ];
  it.each(files)('%s 에 `|| \'nano-banana-pro\'` / `provider: \'nano-banana-pro\'` 기본값이 없다', (file) => {
    const code = read(file);
    expect(code).not.toMatch(/\|\|\s*'nano-banana-pro'/);
    expect(code).not.toMatch(/provider:\s*'nano-banana-pro'/);
  });

  it('main.ts 기본값(imageSource·결과 provider)이 나노바나나2다', () => {
    const main = read('main.ts');
    expect(main).toContain("options?.imageSource || 'nano-banana-2'");
    expect(main).toContain("img.provider || 'nano-banana-2'");
  });
});

describe('main 입구 — 옛 provider 가 와도 나노바나나2 경로로 간다', () => {
  const gen = read('imageGenerator.ts');

  it('프로·2.5 provider 는 디스패치 전에 nano-banana-2 로 바뀐다', () => {
    const aliasAt = gen.search(
      /if \(normalizedProvider === 'nano-banana-pro' \|\| normalizedProvider === 'nano-banana'\) \{[\s\S]{0,260}?normalizedProvider = 'nano-banana-2';/,
    );
    const requestedAt = gen.indexOf('const requestedProvider = normalizedProvider;');
    expect(aliasAt).toBeGreaterThan(-1);
    expect(aliasAt).toBeLessThan(requestedAt);
  });

  it('나노 분기는 NANO_PROVIDER_TO_MODEL_KEY 로 forceModelKey 를 정해 3.1 Flash 가 된다', () => {
    expect(gen).toMatch(/NANO_PROVIDER_TO_MODEL_KEY\[normalizedProvider\]/);
  });

  it('지원 안 하는 provider 폴백도 프로가 아니라 나노바나나2 + 3.1 Flash 모델 키다', () => {
    expect(gen).not.toContain("normalizedProvider = 'nano-banana-pro';");
    expect(gen).toContain("normalizedProvider = 'nano-banana-2';");
    expect(gen).toContain("NANO_PROVIDER_TO_MODEL_KEY['nano-banana-2']");
  });

  it('카탈로그 목록에서 프로·2.5 가 빠지고 모델 키 매핑은 남는다', async () => {
    const cat = await import('../runtime/imageEngineCatalog.js');
    const values = cat.IMAGE_ENGINE_CATALOG.map((e) => e.value);
    expect(values).toContain('nano-banana-2');
    expect(values).not.toContain('nano-banana-pro');
    expect(values).not.toContain('nano-banana');
    expect(cat.NANO_PROVIDER_TO_MODEL_KEY['nano-banana-2']).toBe('gemini-3-1-flash');
    expect(cat.NANO_PROVIDER_TO_MODEL_KEY['nano-banana-pro']).toBe('gemini-3-pro');
  });
});
