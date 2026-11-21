// Gemini subscription image (gemini-cli-image) joins the shopping-connect AI mode: the product photo is attached as the
// reference (geminiCliImageShoppingWiring.test.ts), so the allow-lists, the two sub-image radios and the engine mirror
// list accept it. Codex stays where it was; the image tab's engine list (no forced switch to shopping 'ai') is untouched.
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

describe('Gemini 구독 이미지 - 쇼핑 참고 사진 허용 목록', () => {
  it('두 허용 배열에 gemini-cli-image 가 Codex 바로 뒤에 있고 앞의 다섯 개는 그대로다', () => {
    const expected = ['nano-banana-2', 'nano-banana-pro', 'openai-image', 'dropshot', 'codex-image', 'gemini-cli-image'];
    expect(SHOPPING_REFERENCE_IMAGE_ENGINES).toEqual(expected);
    expect(SHOPPING_SELECTABLE_REFERENCE_ENGINES).toEqual(expected);
    expect(isShoppingReferenceImageEngine('gemini-cli-image')).toBe(true);
    expect(isShoppingReferenceImageEngine(' gemini-cli-image ')).toBe(true);
    expect(isShoppingSelectableReferenceEngine('gemini-cli-image')).toBe(true);
  });

  it('선택 판정은 모델과 상관없이 통과하고, 막힌 엔진은 그대로 막힌다', () => {
    expect(isShoppingReferenceGenerationSelectionSupported('gemini-cli-image')).toBe(true);
    expect(isShoppingReferenceGenerationSelectionSupported('gemini-cli-image', 'gpt-image-1')).toBe(true);
    expect(() => assertShoppingReferenceGenerationSelectionSupported('gemini-cli-image', undefined)).not.toThrow();
    for (const engine of ['genspark', 'flow', 'imagefx', 'prodia', 'collect-photos', 'gemini', 'gemini-image']) {
      expect(isShoppingReferenceGenerationSelectionSupported(engine)).toBe(false);
    }
  });

  it('막힌 엔진의 오류 문구는 Gemini 구독 이미지도 고를 수 있다고 알려주고, Codex 안내는 그대로다', () => {
    expect(() => assertShoppingReferenceGenerationSelectionSupported('flow')).toThrow(
      /SHOPPING_REFERENCE_PROVIDER_UNSUPPORTED[\s\S]*Codex 구독 이미지[\s\S]*Gemini 구독 이미지/,
    );
  });

  it('이 파일은 렌더러 인라인 번들 대상이라 다른 모듈을 새로 import 하지 않는다 (문자열만 추가)', () => {
    const source = read('src', 'image', 'shoppingReferenceGeneration.ts');
    const imports = source.match(/^import[\s\S]*?from '[^']+';/gm) ?? [];
    expect(imports).toHaveLength(1);
    expect(source).not.toMatch(/geminiCliImagePolicy/);
  });
});

describe('Gemini 구독 이미지 - 쇼핑 엔진 목록 미러', () => {
  it('IMG_SYNC_SHOPPING_ENGINES 와 imgSyncShoppingEngineFor 가 gemini-cli-image 를 받는다', () => {
    expect(IMG_SYNC_SHOPPING_ENGINES).toEqual(['nano-banana-2', 'openai-image', 'dropshot', 'codex-image', 'gemini-cli-image']);
    expect(imgSyncShoppingEngineFor('gemini-cli-image')).toBe('gemini-cli-image');
    expect(imgSyncShoppingEngineFor('codex-image')).toBe('codex-image');
    expect(imgSyncShoppingEngineFor('flow')).toBeNull();
  });

  it('pipelineConfig 의 쇼핑 AI 엔진 이름 집합에 gemini-cli-image 가 있다', () => {
    const source = read('src', 'renderer', 'modules', 'pipelineConfig.ts');
    const start = source.indexOf('const SHOPPING_AI_ENGINE_NAMES');
    const block = source.slice(start, source.indexOf(']);', start));
    expect(block).toContain("'gemini-cli-image'");
    expect(block).toContain("'codex-image'");
  });
});

describe('Gemini 구독 이미지 - 쇼핑 소제목 이미지 소스 라디오', () => {
  const html = read('public', 'index.html');
  for (const name of ['continuous-modal-shopping-subimage-source', 'ma-shopping-subimage-source']) {
    it(`${name}: gemini-cli-image 라디오가 Codex 라디오 바로 아래에 한 줄 있고 기본 선택(checked)이 아니다`, () => {
      const radio = new RegExp(`name="${name}"\\s+value="gemini-cli-image"`, 'g');
      expect(html.match(radio)?.length).toBe(1);
      expect(html).not.toMatch(new RegExp(`name="${name}"\\s+value="gemini-cli-image"[^>]*\\schecked`));
      const at = html.search(radio);
      const label = html.slice(at, html.indexOf('</label>', at));
      expect(label).toContain('✨ Gemini 구독 이미지 (AI · 별도 비용 없음)');
      expect(label.length).toBeLessThan(400); // same short shape as the other radios, no extra explanation
      // Right after the Codex radio, before the collected-image radio.
      const codexAt = html.search(new RegExp(`name="${name}"\\s+value="codex-image"`));
      const collectedAt = html.search(new RegExp(`name="${name}"\\s+value="collected"`));
      expect(codexAt).toBeGreaterThan(-1);
      expect(at).toBeGreaterThan(codexAt);
      expect(at).toBeLessThan(collectedAt);
      // Only the Gemini radio's own opening tag sits between the two names: no other radio in between.
      expect(html.slice(codexAt, at).match(/<input type="radio"/g)?.length ?? 0).toBe(1);
    });
  }

  it('두 곳의 안내 문구가 두 구독 이미지를 말하고 한 줄 길이를 유지한다 (긴 설명 없음)', () => {
    const hint = 'AI: 나노바나나2·덕트테이프(gpt-image-2.6)·리더스 무제한·Codex·Gemini 구독 이미지만 대표 상품 이미지 기반 생성';
    expect(html.split(hint).length - 1).toBe(2);
    const second = '🐙 Codex·Gemini 구독 이미지: 구독 사용량으로 소제목 이미지만 새로 그립니다 (썸네일은 원본 그대로)';
    expect(html.split(second).length - 1).toBe(2);
    expect(html).not.toContain('리더스 무제한·Codex 구독 이미지만 대표 상품 이미지 기반 생성');
  });

  it('반자동 안내 문구는 지원 엔진 6종과 구독 이미지 둘을 말한다', () => {
    const renderer = read('src', 'renderer', 'renderer.ts');
    expect(renderer).toContain('지원 엔진 6종 · Codex·Gemini 구독 이미지 포함');
    expect(renderer).not.toContain('지원 엔진 5종');
  });

  it('이미지 탭 엔진 선택 목록(쇼핑 모드를 ai 로 강제 전환)은 바꾸지 않았다 — 고를 때마다 구독 사용량이 나가면 안 된다', () => {
    const tab = read('src', 'renderer', 'modules', 'imageManagementTab.ts');
    expect(tab).toContain("selectedSource === 'nano-banana-2' || selectedSource === 'openai-image' || selectedSource === 'dropshot'");
    expect(tab).not.toMatch(/selectedSource === 'gemini-cli-image'/);
  });
});
