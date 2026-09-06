import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildContextualImagePrompt,
  enrichImageItemsWithArticleContext,
  prepareProviderContextualImagePrompt,
} from '../image/contextualImagePrompt';
import { IMAGE_VIEWPOINT_HINTS, engineRotatesViewpoint } from '../image/imageViewpointRotation';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * R-A (2026-09-06): "every image comes from the same angle".
 *
 * The viewpoint hint lived only in the semi-auto/legacy renderer path
 * (fullAutoFlow generateOne). The normal full-auto button path and the batched
 * block never rotated, and main's mappedItems dropped `diversityIndex` while
 * `main.ts` rewrites `originalIndex` to the array position — with one item per
 * IPC call every index collapsed to 0. The brief builder in main is now the
 * single owner: producers send `diversityIndex`, the brief renders the camera
 * line, engines that rotate on their own are skipped.
 */
const GENERIC_COMPOSITION = 'Choose the clearest viewpoint for the section action';

const baseInput = {
  articleTitle: '가을 이불 세탁 방법',
  globalSubject: '이불 세탁',
  sectionHeading: '세탁기 용량 확인',
  sectionContent: '세탁조에 이불을 넣고 3분의 2 이하로 차는지 본다.',
  existingPrompt: 'a duvet inside a washing machine drum',
};

describe('이미지 시점 단일 소유자 — main 브리프', () => {
  it('viewpointIndex 가 있으면 COMPOSITION 첫 줄이 해당 카메라 힌트로 바뀐다', () => {
    const prompt = buildContextualImagePrompt({ ...baseInput, viewpointIndex: 3 });
    expect(prompt).toContain(`- ${IMAGE_VIEWPOINT_HINTS[3]}`);
    expect(prompt).not.toContain(GENERIC_COMPOSITION);
    expect(prompt.length).toBeLessThanOrEqual(4_000);
  });

  it('인덱스는 8 로 순환한다 (11 → 3)', () => {
    const prompt = buildContextualImagePrompt({ ...baseInput, viewpointIndex: 11 });
    expect(prompt).toContain(`- ${IMAGE_VIEWPOINT_HINTS[3]}`);
  });

  it('인덱스가 없거나 썸네일이면 일반 구도 줄을 유지한다', () => {
    expect(buildContextualImagePrompt({ ...baseInput })).toContain(GENERIC_COMPOSITION);
    expect(buildContextualImagePrompt({ ...baseInput, viewpointIndex: 2, isThumbnail: true }))
      .toContain(GENERIC_COMPOSITION);
    for (const hint of IMAGE_VIEWPOINT_HINTS) {
      expect(buildContextualImagePrompt({ ...baseInput, isThumbnail: true, viewpointIndex: 2 })).not.toContain(hint);
    }
  });

  it('imagefx 컴팩트 브리프도 카메라 줄을 넣되 텍스트 정책이 잘리지 않는다', () => {
    const prompt = prepareProviderContextualImagePrompt('imagefx', {
      ...baseInput,
      existingPrompt: 'x'.repeat(1_700),
      viewpointIndex: 2,
    });
    expect(prompt).toContain(IMAGE_VIEWPOINT_HINTS[2]);
    expect(prompt).toMatch(/text-free image|explicitly requested title text/);
    expect(prompt.length).toBeLessThanOrEqual(1_800);
  });

  it('자체 회전 엔진(flow/openai/deepinfra/leonardo)은 건너뛰고 나머지는 브리프가 맡는다', () => {
    for (const engine of ['flow', 'google-flow', 'openai-image', 'gpt-image-2', 'deepinfra', 'leonardo']) {
      expect(engineRotatesViewpoint(engine), engine).toBe(true);
    }
    for (const engine of ['imagefx', 'nano-banana-pro', 'nano-banana', 'dropshot', '', undefined]) {
      expect(engineRotatesViewpoint(engine), String(engine)).toBe(false);
    }
  });

  it('렌더러 컨텍스트 보강이 diversityIndex 를 보존한다', () => {
    const [item] = enrichImageItemsWithArticleContext(
      [{ heading: '세탁기 용량 확인', prompt: 'p', diversityIndex: 4 }],
      { articleTitle: 't', globalSubject: 's', articleContext: 'c', sections: [] },
    );
    expect((item as { diversityIndex?: number }).diversityIndex).toBe(4);
  });
});

describe('이미지 시점 배선 — 소스 잠금', () => {
  it('main mappedItems 가 diversityIndex 를 넘기고 viewpointIndex 를 계산한다', () => {
    const code = read('imageGenerator.ts');
    expect(code).toMatch(/viewpointIndex/);
    expect(code).toMatch(/diversityIndex:\s*(?:item\.)?diversityIndex/);
    expect(code).toMatch(/engineRotatesViewpoint\(/);
  });

  it('렌더러는 더 이상 시점을 덧붙이지 않고 diversityIndex 만 보낸다', () => {
    const fullAuto = read('renderer/modules/fullAutoFlow.ts');
    expect(fullAuto).not.toMatch(/appendViewpointHint\(/);
    expect(fullAuto).toMatch(/diversityIndex:\s*i\b/);
    expect(fullAuto).toMatch(/diversityIndex:\s*slot\.originalIndex/);
    const multi = read('renderer/modules/multiAccountManager.ts');
    expect(multi).toMatch(/diversityIndex:\s*headingIdx/);
  });

  it('leonardo 는 openai 처럼 item.diversityIndex 를 우선 쓴다', () => {
    const code = read('image/leonardoAIGenerator.ts');
    expect(code).toMatch(/getImageDiversityHints\(\s*item\.diversityIndex\s*\?\?\s*i\s*\)/);
  });
});
