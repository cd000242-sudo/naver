import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createPipelineFormDataSnapshot, resolvePipelineConfig } from '../renderer/modules/pipelineConfig';

/**
 * SPEC-STABILITY-2026 Phase 7.1 — PipelineConfig.
 * resolvePipelineConfig is the ONLY place that defines publish-pipeline
 * setting keys and defaults. Flow entries resolve once per publish item.
 * Static ratchets below lock the per-module direct-read debt so it can
 * only go DOWN as stages 7.1-b..h land.
 */
const read = (...seg: string[]): string => fs.readFileSync(path.join(process.cwd(), ...seg), 'utf-8');

const makeStorage = (data: Record<string, string>) => ({
  getItem: (k: string) => (k in data ? data[k] : null),
});

afterEach(() => {
  delete (globalThis as any).localStorage;
  delete (globalThis as any).document;
});

describe('resolvePipelineConfig — 기본값 동등성', () => {
  it('localStorage 부재 시 현행 직독 기본값과 동일하다', () => {
    const cfg = resolvePipelineConfig('full-auto');
    expect(cfg.flow).toBe('full-auto');
    expect(cfg.image).toEqual({
      headingImageMode: 'all',
      thumbnailTextInclude: false,
      textOnlyPublish: false,
      imageSource: 'nano-banana-pro',
      imageStyle: 'realistic',
      imageRatio: '1:1',
      thumbnailImageRatio: '1:1',
      subheadingImageRatio: '1:1',
      fallbackPolicy: 'engine-only',
    });
    expect(cfg.shopping).toEqual({
      subImageMode: 'collected',
      aiImageEngine: 'nano-banana-2',
      autoThumbnail: false,
    });
    expect(cfg.disclosure).toEqual({
      enabledSetting: null,
      text: '',
      defaultText: '[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.',
    });
    expect(cfg.safety).toEqual({
      adbIpChangeEnabled: false,
      adbIpChangeEvery: 1,
    });
  });

  it('저장된 값을 직독과 동일한 규칙으로 해석한다 (boolean은 === "true")', () => {
    (globalThis as any).localStorage = makeStorage({
      headingImageMode: 'thumbnail-only',
      thumbnailTextInclude: 'true',
      textOnlyPublish: 'false',
      imageStyle: 'illustration',
      imageRatio: '16:9',
      scSubImageMode: 'ai',
      scAIImageEngine: 'openai-image',
      scAutoThumbnailSetting: 'true',
      ftcDisclosureEnabled: 'true',
      ftcDisclosureText: '제휴 링크 안내 문구',
      adbIpChangeEnabled: 'true',
      adbIpChangeEvery: '3',
    });
    const cfg = resolvePipelineConfig('continuous');
    expect(cfg.image.headingImageMode).toBe('thumbnail-only');
    expect(cfg.image.thumbnailTextInclude).toBe(true);
    expect(cfg.image.textOnlyPublish).toBe(false); // 'false' 문자열 → false
    expect(cfg.image.imageStyle).toBe('illustration');
    expect(cfg.image.imageRatio).toBe('16:9');
    expect(cfg.image.thumbnailImageRatio).toBe('1:1'); // 미설정 → 기본값
    expect(cfg.shopping.subImageMode).toBe('ai');
    expect(cfg.shopping.aiImageEngine).toBe('openai-image');
    expect(cfg.shopping.autoThumbnail).toBe(true);
    expect(cfg.disclosure.enabledSetting).toBe(true);
    expect(cfg.disclosure.text).toBe('제휴 링크 안내 문구');
    expect(cfg.safety.adbIpChangeEnabled).toBe(true);
    expect(cfg.safety.adbIpChangeEvery).toBe(3);
  });

  it('쇼핑커넥트 legacy scSubImageSource에 엔진명이 남아도 ai 모드로 해석한다', () => {
    (globalThis as any).localStorage = makeStorage({
      scSubImageSource: 'openai-image',
    });
    expect(resolvePipelineConfig('full-auto').shopping.subImageMode).toBe('ai');
  });

  it('uses the checked continuous shopping engine instead of stale storage', () => {
    (globalThis as any).localStorage = makeStorage({
      scSubImageMode: 'collected',
      scSubImageSource: 'collected',
      scAIImageEngine: 'nano-banana-2',
    });
    (globalThis as any).document = {
      querySelector: (selector: string) => selector === 'input[name="continuous-modal-shopping-subimage-source"]:checked'
        ? { value: 'dropshot' }
        : null,
    };

    const config = resolvePipelineConfig('continuous');
    expect(config.shopping.subImageMode).toBe('ai');
    expect(config.shopping.aiImageEngine).toBe('dropshot');
  });

  it.each(['openai-image', 'dropshot', 'nano-banana-pro'])(
    '구버전 fullAutoImageSource의 참조 엔진 %s를 그대로 승계한다',
    (engine) => {
      (globalThis as any).localStorage = makeStorage({
        scSubImageMode: 'ai',
        fullAutoImageSource: engine,
      });

      expect(resolvePipelineConfig('full-auto').shopping.aiImageEngine).toBe(engine);
    },
  );

  it('명시 쇼핑 엔진이 무효면 유효한 구버전 엔진까지 계속 탐색한다', () => {
    (globalThis as any).localStorage = makeStorage({
      scSubImageMode: 'ai',
      scAIImageEngine: 'flow',
      fullAutoImageSource: 'dropshot',
    });

    expect(resolvePipelineConfig('continuous').shopping.aiImageEngine).toBe('dropshot');
  });

  it('구버전 gpt-image-2 이름은 실행 가능한 openai-image로 승계한다', () => {
    (globalThis as any).localStorage = makeStorage({
      scSubImageMode: 'ai',
      fullAutoImageSource: 'gpt-image-2',
    });

    expect(resolvePipelineConfig('multi-account').shopping.aiImageEngine).toBe('openai-image');
  });

  it('명시 쇼핑 엔진이 구버전 전역 엔진보다 우선한다', () => {
    (globalThis as any).localStorage = makeStorage({
      scSubImageMode: 'ai',
      scAIImageEngine: 'openai-image',
      fullAutoImageSource: 'dropshot',
    });

    expect(resolvePipelineConfig('full-auto').shopping.aiImageEngine).toBe('openai-image');
  });

  it.each([
    ['full-auto', 'input[name="sc-subimage-mode-inline-radio"]:checked'],
    ['continuous', 'input[name="continuous-modal-shopping-subimage-source"]:checked'],
    ['multi-account', 'input[name="ma-shopping-subimage-source"]:checked'],
  ] as const)('%s 발행 직전 화면에서 선택한 쇼핑 AI 모드가 오래된 저장값보다 우선한다', (flow, checkedSelector) => {
    (globalThis as any).localStorage = makeStorage({
      scSubImageMode: 'collected',
      scSubImageSource: 'collected',
      scAIImageEngine: 'dropshot',
    });
    (globalThis as any).document = {
      querySelector: (selector: string) => selector === checkedSelector
        ? { value: 'ai' }
        : null,
    };

    expect(resolvePipelineConfig(flow).shopping.subImageMode).toBe('ai');
  });

  it.each(['flow', 'prodia', 'imagefx'])('참조 이미지를 보장하지 못하는 저장 엔진 %s는 안전한 기본값으로 복구한다', (engine) => {
    (globalThis as any).localStorage = makeStorage({
      scSubImageMode: 'ai',
      scAIImageEngine: engine,
    });

    expect(resolvePipelineConfig('full-auto').shopping.aiImageEngine).toBe('nano-banana-2');
  });

  it('호출자가 넘긴 오래된 쇼핑 AI 엔진도 스냅샷 경계에서 복구한다', () => {
    const snapshot = createPipelineFormDataSnapshot('continuous', {
      scSubImageMode: 'ai',
      scAIImageEngine: 'flow',
    });

    expect(snapshot.scAIImageEngine).toBe('nano-banana-2');
  });

  it('스냅샷도 구버전 저장 엔진을 실행 시점까지 보존한다', () => {
    (globalThis as any).localStorage = makeStorage({
      scSubImageMode: 'ai',
      fullAutoImageSource: 'dropshot',
    });

    const snapshot = createPipelineFormDataSnapshot('continuous', {});
    expect(snapshot.scAIImageEngine).toBe('dropshot');
    expect(snapshot.pipelineConfigSnapshot.shopping.aiImageEngine).toBe('dropshot');
  });

  it('빈 문자열 저장값은 직독(|| 기본값)과 동일하게 기본값으로 떨어진다', () => {
    (globalThis as any).localStorage = makeStorage({ headingImageMode: '' });
    expect(resolvePipelineConfig('multi-account').image.headingImageMode).toBe('all');
  });
});

describe('직독 래칫 — publishingHandlers (7.1-a)', () => {
  it('풀오토 이미지 클러스터 직독이 단일 해석처로 이관되었다', () => {
    const ph = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    const count = (key: string) =>
      (ph.match(new RegExp(`localStorage\\.getItem\\('${key}'\\)`, 'g')) || []).length;
    expect(count('headingImageMode')).toBe(0);
    expect(count('textOnlyPublish')).toBe(0);
    expect(count('imageStyle')).toBe(0);
    expect(count('imageRatio')).toBe(0);
    // [7.1-e] mainSettings 블록 이관 완료 — 이미지 클러스터 직독 0 잠금
    expect(count('thumbnailTextInclude')).toBe(0);
    expect(count('thumbnailImageRatio')).toBe(0);
    expect(count('subheadingImageRatio')).toBe(0);
    // 진입점 1회 해석이 존재 (풀오토 + 다중계정 메인 수집)
    expect(ph).toContain("const pipelineCfg = resolvePipelineConfig('full-auto')");
    expect(ph).toContain("const maPipelineCfg = resolvePipelineConfig('multi-account')");
  });
});

describe('직독 래칫 — continuousPublishing (7.1-b)', () => {
  it('연속발행 이미지 클러스터 직독이 단일 해석처로 이관되었다', () => {
    const cp = read('src', 'renderer', 'modules', 'continuousPublishing.ts');
    const count = (key: string) =>
      (cp.match(new RegExp(`localStorage\\.getItem\\('${key}'\\)`, 'g')) || []).length;
    expect(count('headingImageMode')).toBe(0);
    expect(count('imageStyle')).toBe(0);
    expect(count('imageRatio')).toBe(0);
    expect(count('thumbnailImageRatio')).toBe(0);
    expect(count('subheadingImageRatio')).toBe(0);
    // [7.1-e] 아이템 생성 시점 수집 2곳 이관 완료 — 직독 0 잠금
    expect(count('textOnlyPublish')).toBe(0);
    expect(count('thumbnailTextInclude')).toBe(0);
    // V2 루프 per-item 해석 + Enhanced per-publish 해석이 존재
    expect(cp).toContain("const itemPipelineCfg = resolvePipelineConfig('continuous')");
    expect(cp).toContain("const pipelineCfg = resolvePipelineConfig('continuous')");
  });
});

describe('직독 래칫 — 공유 헬퍼/풀오토 위임부 (7.1-d)', () => {
  it('costAndAutoGen은 localStorage 직독 0건 (raw 접근자 경유)', () => {
    const src = read('src', 'renderer', 'modules', 'costAndAutoGen.ts');
    expect((src.match(/localStorage\.getItem\(/g) || []).length).toBe(0);
    expect(src).toContain('const rawPipeline = readRawPipelineSettings()');
  });

  it('headingImageGen은 localStorage 직독 0건 (raw 접근자 경유)', () => {
    const src = read('src', 'renderer', 'modules', 'headingImageGen.ts');
    expect((src.match(/localStorage\.getItem\(/g) || []).length).toBe(0);
  });

  it('fullAutoFlow는 ftc 2건(7.1-h 대상) + 앱상태 1건만 잔존', () => {
    const src = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    const count = (key: string) =>
      (src.match(new RegExp(`localStorage\\.getItem\\('${key}'\\)`, 'g')) || []).length;
    for (const key of ['headingImageMode', 'textOnlyPublish', 'thumbnailTextInclude', 'imageStyle', 'imageRatio', 'thumbnailImageRatio', 'subheadingImageRatio', 'imageFallbackPolicy']) {
      expect(count(key)).toBe(0);
    }
    expect(count('ftcDisclosureEnabled')).toBe(0);
    expect(count('ftcDisclosureText')).toBe(0);
    // 직접 UI 진입점(collectFullAutoFormData)의 1회 해석 존재
    expect(src).toContain("const pipelineCfg = resolvePipelineConfig('full-auto')");
  });

  it('raw 접근자는 pipelineConfig에만 정의되고 null 보존 규칙을 갖는다', () => {
    const src = read('src', 'renderer', 'modules', 'pipelineConfig.ts');
    expect(src).toContain('function readRawPipelineSettings()');
    expect(src).toContain("pipelineReadRaw('thumbnailImageRatio')");
  });

  it('[7.1-f] 발행 보조 경로(provider/동기화)도 직독 0 — raw 접근자 경유', () => {
    const lf = read('src', 'renderer', 'modules', 'localFolderImageLoader.ts');
    const sync = read('src', 'renderer', 'modules', 'imageSyncService.ts');
    const cp = read('src', 'renderer', 'modules', 'continuousPublishing.ts');
    const ph = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    const count = (src: string, key: string) =>
      (src.match(new RegExp(`localStorage\\.getItem\\('${key}'\\)`, 'g')) || []).length;
    expect(count(lf, 'fullAutoImageSource')).toBe(0);
    // localFolderFallbackEngine은 플로우 고유 키 — 직독 1 허용
    expect(count(lf, 'localFolderFallbackEngine')).toBe(1);
    for (const key of ['fullAutoImageSource', 'globalImageSource', 'imageStyle', 'imageRatio', 'thumbnailImageRatio', 'subheadingImageRatio', 'headingImageMode', 'imageFallbackPolicy', 'thumbnailTextInclude', 'textOnlyPublish']) {
      expect(count(sync, key)).toBe(0);
    }
    expect(count(cp, 'fullAutoImageSource')).toBe(0);
    expect(count(cp, 'globalImageSource')).toBe(0);
    expect(count(ph, 'fullAutoImageSource')).toBe(0);
    expect(count(ph, 'globalImageSource')).toBe(0);
  });

  it('[7.1-g] 쇼핑커넥트 sc* 설정 읽기는 pipelineConfig 경유로 잠근다', () => {
    const cp = read('src', 'renderer', 'modules', 'continuousPublishing.ts');
    const mam = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    const ph = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    const faf = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    const imt = read('src', 'renderer', 'modules', 'imageManagementTab.ts');
    const count = (src: string, key: string) =>
      (src.match(new RegExp(`localStorage\\.getItem\\('${key}'\\)`, 'g')) || []).length;
    for (const src of [cp, mam, ph, faf, imt]) {
      expect(count(src, 'scSubImageMode')).toBe(0);
      expect(count(src, 'scSubImageSource')).toBe(0);
      expect(count(src, 'scAIImageEngine')).toBe(0);
      expect(count(src, 'scAutoThumbnailSetting')).toBe(0);
    }
    const pipeline = read('src', 'renderer', 'modules', 'pipelineConfig.ts');
    expect(pipeline).toContain("pipelineReadRaw('scSubImageMode')");
    expect(pipeline).toContain('function normalizeShoppingSubImageMode');
  });

  it('[7.1-h] 발행 경로의 공시/안전 설정 읽기는 pipelineConfig 경유로 잠근다', () => {
    const mam = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    const ph = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    const faf = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    const count = (src: string, key: string) =>
      (src.match(new RegExp(`localStorage\\.getItem\\('${key}'\\)`, 'g')) || []).length;
    for (const src of [mam, ph, faf]) {
      expect(count(src, 'ftcDisclosureEnabled')).toBe(0);
      expect(count(src, 'ftcDisclosureText')).toBe(0);
      expect(count(src, 'adbIpChangeEnabled')).toBe(0);
      expect(count(src, 'adbIpChangeEvery')).toBe(0);
    }
    const pipeline = read('src', 'renderer', 'modules', 'pipelineConfig.ts');
    expect(pipeline).toContain("pipelineReadRaw('ftcDisclosureEnabled')");
    expect(pipeline).toContain("pipelineReadRaw('adbIpChangeEvery')");
  });
});

describe('직독 래칫 — multiAccountManager (7.1-c)', () => {
  it('다중계정 이미지 모드 클러스터 직독이 단일 해석처로 이관되었다', () => {
    const mam = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    const count = (key: string) =>
      (mam.match(new RegExp(`localStorage\\.getItem\\('${key}'\\)`, 'g')) || []).length;
    // [7.1-f] 코어 경고 폴백도 raw 접근자 경유 — 직독 0 잠금
    expect(count('headingImageMode')).toBe(0);
    expect(count('thumbnailTextInclude')).toBe(0);
    expect(count('fullAutoImageSource')).toBe(0);
    expect(count('globalImageSource')).toBe(0);
    // 큐 루프 per-item 해석이 존재
    expect(mam).toContain("const itemPipelineCfg = resolvePipelineConfig('multi-account')");
  });
});
