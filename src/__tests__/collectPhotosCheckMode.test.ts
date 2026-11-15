/**
 * 관련 사진 찾기 + photoCheckMode: the mode reaches the collector's deps, the daily post stays as it was,
 * and the main-process image IPC lets the field through and answers a stopped check in a structured way.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ routes: vi.fn(), harness: vi.fn() }));
vi.mock('../configManager.js', () => ({ loadConfig: async () => ({ marker: 'cfg' }), applyConfigToEnv: () => {} }));
vi.mock('../main/ipc/issueCollectHandlers.js', () => ({ resolveIssueCollectRoutes: mocks.routes }));
vi.mock('../crawler/issueHarness/harness.js', () => ({ collectIssueImages: mocks.harness }));

const { generateCollectedPhotos } = await import('../main/services/collectPhotosEngine.js');
const { createDailyCollectDeps } = await import('../main/services/dailyImageCollect.js');
const { buildImageCollectConsent } = await import('../runtime/collectPhotosPolicy.js');

import type { CollectPhotosRuntime } from '../main/services/collectPhotosEngine.js';
import type { DailyCollectDeps } from '../main/services/dailyImageCollect.js';
import type { GenerateImagesOptions } from '../image/types.js';

const items = [{ heading: '첫째 소제목', prompt: 'p1' }];
const consent = buildImageCollectConsent(new Date('2026-11-15T00:00:00Z'));

function fakeRuntime() {
  const buildDeps = vi.fn(() => ({} as DailyCollectDeps));
  const impl: CollectPhotosRuntime = {
    loadConsent: async () => consent, buildDeps, collect: async () => [], readPreview: async () => '', log: vi.fn(),
  };
  return { impl, buildDeps };
}
const optionsWith = (extra: Record<string, unknown> = {}) => ({ provider: 'collect-photos', items, postTitle: '글 제목', ...extra }) as unknown as GenerateImagesOptions;

describe('generateCollectedPhotos — photoCheckMode', () => {
  it('고른 값을 buildDeps 까지 넘긴다', async () => {
    for (const mode of ['caption', 'agent-codex', 'agent-claude', 'selected'] as const) {
      const { impl, buildDeps } = fakeRuntime();
      await generateCollectedPhotos(optionsWith({ photoCheckMode: mode }), undefined, impl);
      expect(buildDeps.mock.calls[0][0]).toMatchObject({ title: '글 제목', photoCheckMode: mode });
    }
  });

  it('값을 안 주면 기존과 같다 (buildDeps 에 photoCheckMode 가 없다)', async () => {
    const { impl, buildDeps } = fakeRuntime();
    await generateCollectedPhotos(optionsWith(), undefined, impl);
    expect(buildDeps.mock.calls[0][0]).not.toHaveProperty('photoCheckMode');
  });

  it('알 수 없는 값은 버린다', async () => {
    const { impl, buildDeps } = fakeRuntime();
    await generateCollectedPhotos(optionsWith({ photoCheckMode: 'gemini' }), undefined, impl);
    expect(buildDeps.mock.calls[0][0]).not.toHaveProperty('photoCheckMode');
  });
});

describe('createDailyCollectDeps — photoCheckMode', () => {
  const payload = { title: 't', headings: [{ title: 'h' }] };

  it('수집기를 부를 때 그 값으로 검사 경로를 정하게 한다', async () => {
    mocks.routes.mockReset().mockReturnValue({ visionRoute: null });
    mocks.harness.mockReset().mockResolvedValue({ images: {}, candidates: {} });
    await createDailyCollectDeps({ title: 't', photoCheckMode: 'agent-codex' }).collect(payload);
    expect(mocks.routes).toHaveBeenCalledTimes(1);
    expect(mocks.routes.mock.calls[0][0]).toEqual({ marker: 'cfg' });
    expect(mocks.routes.mock.calls[0][1]).toBe(false);
    expect(mocks.routes.mock.calls[0][2]).toBe('agent-codex');
  });

  it('매일 발행처럼 값이 없으면 기존 호출과 같다 (세 번째 인자 없음)', async () => {
    mocks.routes.mockReset().mockReturnValue({ visionRoute: null });
    mocks.harness.mockReset().mockResolvedValue({ images: {}, candidates: {} });
    const log = vi.fn();
    await createDailyCollectDeps({ title: 't', log }).collect(payload);
    expect(mocks.routes.mock.calls[0][2]).toBeUndefined();
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('무료 판정'));
  });

  it("'caption' 이면 진행 로그에 무료 판정 안내를 남긴다", async () => {
    mocks.routes.mockReset().mockReturnValue({ visionRoute: null });
    mocks.harness.mockReset().mockResolvedValue({ images: {}, candidates: {} });
    const log = vi.fn();
    await createDailyCollectDeps({ title: 't', log, photoCheckMode: 'caption' }).collect(payload);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('무료 판정(사진 설명 글 기준)으로 진행합니다'));
  });
});

describe('main.ts automation:generateImages — 소스 확인', () => {
  const src = readFileSync(resolve(__dirname, '../main.ts'), 'utf8');
  const start = src.indexOf("'automation:generateImages'");
  const handler = src.slice(start, src.indexOf("'automation:matchImages'", start));

  it('화면이 보낸 photoCheckMode 를 검증한 값만 옵션에 담아 이미지 생성으로 넘긴다', () => {
    expect(handler).toMatch(/imageOptions: GenerateImagesOptions = \{[\s\S]*photoCheckMode: normalizePhotoCheckMode\(options\.photoCheckMode\)[\s\S]*\};/);
  });

  it('사진 검사 엔진 사용 불가는 code 와 visionUnavailable 이 있는 실패로 돌려준다', () => {
    const catchPart = handler.slice(handler.lastIndexOf('} catch (error)'));
    const visionAt = catchPart.indexOf('isVisionEngineUnavailableError(error)');
    expect(visionAt).toBeGreaterThan(-1);
    expect(catchPart).toMatch(/success: false, message: error\.message, \.\.\.buildVisionUnavailableFields\(error\)/);
    // The structured answer comes before the generic transport-error mapping so the message stays the owner's text.
    expect(visionAt).toBeLessThan(catchPart.indexOf('isMappableImageTransportError('));
  });
});
