import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolvePipelineConfig } from '../renderer/modules/pipelineConfig';

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
});

describe('resolvePipelineConfig — 기본값 동등성', () => {
  it('localStorage 부재 시 현행 직독 기본값과 동일하다', () => {
    const cfg = resolvePipelineConfig('full-auto');
    expect(cfg.flow).toBe('full-auto');
    expect(cfg.image).toEqual({
      headingImageMode: 'all',
      thumbnailTextInclude: false,
      textOnlyPublish: false,
      imageStyle: 'realistic',
      imageRatio: '1:1',
      thumbnailImageRatio: '1:1',
      subheadingImageRatio: '1:1',
    });
  });

  it('저장된 값을 직독과 동일한 규칙으로 해석한다 (boolean은 === "true")', () => {
    (globalThis as any).localStorage = makeStorage({
      headingImageMode: 'thumbnail-only',
      thumbnailTextInclude: 'true',
      textOnlyPublish: 'false',
      imageStyle: 'illustration',
      imageRatio: '16:9',
    });
    const cfg = resolvePipelineConfig('continuous');
    expect(cfg.image.headingImageMode).toBe('thumbnail-only');
    expect(cfg.image.thumbnailTextInclude).toBe(true);
    expect(cfg.image.textOnlyPublish).toBe(false); // 'false' 문자열 → false
    expect(cfg.image.imageStyle).toBe('illustration');
    expect(cfg.image.imageRatio).toBe('16:9');
    expect(cfg.image.thumbnailImageRatio).toBe('1:1'); // 미설정 → 기본값
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
    // 잔여 부채 (mainSettings 블록 — 7.1-e/g에서 이관): 늘어나면 FAIL
    expect(count('thumbnailTextInclude')).toBeLessThanOrEqual(1);
    expect(count('thumbnailImageRatio')).toBeLessThanOrEqual(1);
    expect(count('subheadingImageRatio')).toBeLessThanOrEqual(1);
    // 진입점 1회 해석이 존재
    expect(ph).toContain("const pipelineCfg = resolvePipelineConfig('full-auto')");
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
    // 잔여 부채 (아이템 생성 시점 UI 수집 2곳 — 후속 단계 이관): 늘어나면 FAIL
    expect(count('textOnlyPublish')).toBeLessThanOrEqual(1);
    expect(count('thumbnailTextInclude')).toBeLessThanOrEqual(1);
    // V2 루프 per-item 해석 + Enhanced per-publish 해석이 존재
    expect(cp).toContain("const itemPipelineCfg = resolvePipelineConfig('continuous')");
    expect(cp).toContain("const pipelineCfg = resolvePipelineConfig('continuous')");
  });
});

describe('직독 래칫 — multiAccountManager (7.1-c)', () => {
  it('다중계정 이미지 모드 클러스터 직독이 단일 해석처로 이관되었다', () => {
    const mam = read('src', 'renderer', 'modules', 'multiAccountManager.ts');
    const count = (key: string) =>
      (mam.match(new RegExp(`localStorage\\.getItem\\('${key}'\\)`, 'g')) || []).length;
    // 코어의 경고 동반 전환기 폴백 1곳만 허용 (R13 1차)
    expect(count('headingImageMode')).toBeLessThanOrEqual(1);
    expect(count('thumbnailTextInclude')).toBe(0);
    // 큐 루프 per-item 해석이 존재
    expect(mam).toContain("const itemPipelineCfg = resolvePipelineConfig('multi-account')");
  });
});
