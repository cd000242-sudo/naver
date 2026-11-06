// Shopping-connect AI image mode accepts the Codex subscription image engine (codex-image).
// The thumbnail rule, placement and block rules are untouched — only the allow-lists and the radios change.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SHOPPING_REFERENCE_IMAGE_ENGINES,
  SHOPPING_SELECTABLE_REFERENCE_ENGINES,
  assertShoppingReferenceGenerationSelectionSupported,
  isShoppingReferenceGenerationSelectionSupported,
  isShoppingReferenceImageEngine,
  isShoppingSelectableReferenceEngine,
} from '../image/shoppingReferenceGeneration.js';
import { IMG_SYNC_SHOPPING_ENGINES, imgSyncShoppingEngineFor } from '../runtime/imageSettingsSync.js';

const root = process.cwd();
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('Codex 구독 이미지 - 쇼핑 참고 사진 허용 목록', () => {
  it('두 허용 배열에 codex-image 가 있고 기존 4개는 그대로다', () => {
    expect(SHOPPING_REFERENCE_IMAGE_ENGINES).toEqual(['nano-banana-2', 'nano-banana-pro', 'openai-image', 'dropshot', 'codex-image']);
    expect(SHOPPING_SELECTABLE_REFERENCE_ENGINES).toEqual(['nano-banana-2', 'nano-banana-pro', 'openai-image', 'dropshot', 'codex-image']);
    expect(isShoppingReferenceImageEngine('codex-image')).toBe(true);
    expect(isShoppingReferenceImageEngine(' codex-image ')).toBe(true);
    expect(isShoppingSelectableReferenceEngine('codex-image')).toBe(true);
  });

  it('선택 판정은 모델과 상관없이 통과하고, 막힌 엔진은 그대로 막힌다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('codex-image')).toBe(true);
    expect(isShoppingReferenceGenerationSelectionSupported('codex-image', 'gpt-image-1')).toBe(true);
    expect(() => assertShoppingReferenceGenerationSelectionSupported('codex-image', undefined)).not.toThrow();
    for (const engine of ['genspark', 'flow', 'imagefx', 'prodia', 'collect-photos']) {
      expect(isShoppingReferenceGenerationSelectionSupported(engine)).toBe(false);
    }
  });

  it('막힌 엔진의 오류 문구는 Codex 구독 이미지도 고를 수 있다고 알려준다', () => {
    expect(() => assertShoppingReferenceGenerationSelectionSupported('flow')).toThrow(
      /SHOPPING_REFERENCE_PROVIDER_UNSUPPORTED[\s\S]*Codex 구독 이미지/,
    );
  });

  it('이 파일은 렌더러 인라인 번들 대상이라 다른 모듈을 새로 import 하지 않는다 (문자열 codex-image 만 추가)', () => {
    const source = read('src', 'image', 'shoppingReferenceGeneration.ts');
    const imports = source.match(/^import[\s\S]*?from '[^']+';/gm) ?? [];
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain("'./referenceImagePolicy.js'");
    expect(source).not.toMatch(/codexImagePolicy/);
  });
});

describe('Codex 구독 이미지 - 쇼핑 엔진 목록 미러', () => {
  it('IMG_SYNC_SHOPPING_ENGINES 와 imgSyncShoppingEngineFor 가 codex-image 를 받는다', () => {
    expect(IMG_SYNC_SHOPPING_ENGINES).toEqual(['nano-banana-2', 'openai-image', 'dropshot', 'codex-image']);
    expect(imgSyncShoppingEngineFor('codex-image')).toBe('codex-image');
    expect(imgSyncShoppingEngineFor('flow')).toBeNull();
  });

  it('pipelineConfig 의 쇼핑 AI 엔진 이름 집합에 codex-image 가 있다', () => {
    const source = read('src', 'renderer', 'modules', 'pipelineConfig.ts');
    const block = source.slice(source.indexOf('const SHOPPING_AI_ENGINE_NAMES'), source.indexOf(']);', source.indexOf('const SHOPPING_AI_ENGINE_NAMES')));
    expect(block).toContain("'codex-image'");
  });
});

describe('Codex 구독 이미지 - 쇼핑 소제목 이미지 소스 라디오', () => {
  const html = read('public', 'index.html');
  for (const name of ['continuous-modal-shopping-subimage-source', 'ma-shopping-subimage-source']) {
    it(`${name}: codex-image 라디오가 한 줄 있고 기본 선택(checked)이 아니다`, () => {
      const radio = new RegExp(`name="${name}"\\s+value="codex-image"`, 'g');
      expect(html.match(radio)?.length).toBe(1);
      expect(html).not.toMatch(new RegExp(`name="${name}"\\s+value="codex-image"[^>]*\\schecked`));
      const at = html.search(radio);
      const label = html.slice(at, html.indexOf('</label>', at));
      expect(label).toContain('🐙 Codex 구독 이미지 (AI · 별도 비용 없음)');
    });
  }

  it('두 곳의 안내 문구가 Codex 구독 이미지를 포함한 엔진 목록을 말한다', () => {
    const hint = 'AI: 나노바나나2·덕트테이프(gpt-image-2.6)·리더스 무제한·Codex 구독 이미지만 대표 상품 이미지 기반 생성';
    expect(html.split(hint).length - 1).toBe(2);
    expect(html).not.toContain('AI: 나노바나나2·덕트테이프(gpt-image-2.6)·리더스 무제한만 대표 상품 이미지 기반 생성');
  });

  it('연속발행 · 다중계정 라디오 처리는 하드코딩 대신 imgSyncShoppingEngineFor 로 판정한다', () => {
    const continuous = read('src', 'renderer', 'modules', 'continuousPublishing.ts');
    const multi = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    expect(continuous).toMatch(/imgSyncShoppingEngineFor\(normalizedValue\)/);
    expect(multi).toMatch(/imgSyncShoppingEngineFor\(value\)/);
    expect(continuous).toMatch(/import \{[^}]*imgSyncShoppingEngineFor[^}]*\} from '\.\.\/\.\.\/runtime\/imageSettingsSync\.js'/);
    expect(multi).toMatch(/import \{[^}]*imgSyncShoppingEngineFor[^}]*\} from '\.\.\/\.\.\/runtime\/imageSettingsSync\.js'/);
    expect(continuous).not.toMatch(/normalizedValue === 'nano-banana-2' \|\| normalizedValue === 'openai-image'/);
    expect(multi).not.toMatch(/value === 'nano-banana-2' \|\| value === 'openai-image'/);
  });

  it('반자동 안내 문구는 지원 엔진 5종과 Codex 구독 이미지를 말한다', () => {
    const renderer = read('src', 'renderer', 'renderer.ts');
    expect(renderer).toContain('지원 엔진 5종 · Codex 구독 이미지 포함');
    expect(renderer).not.toContain('지원 엔진 4종만');
  });

  it('이미지 탭 엔진 선택 목록(쇼핑 모드를 ai 로 강제 전환)은 바꾸지 않았다 — Codex 를 고를 때마다 구독 사용량이 나가면 안 된다', () => {
    const tab = read('src', 'renderer', 'modules', 'imageManagementTab.ts');
    expect(tab).toContain("selectedSource === 'nano-banana-2' || selectedSource === 'openai-image' || selectedSource === 'dropshot'");
    expect(tab).not.toMatch(/selectedSource === 'codex-image'/);
  });

  it('shoppingConnectUtils.ts 는 엔진 이름을 직접 적지 않는다 (판정은 허용 목록 함수가 한다)', () => {
    expect(read('src', 'renderer', 'utils', 'shoppingConnectUtils.ts')).not.toContain('codex-image');
  });
});
