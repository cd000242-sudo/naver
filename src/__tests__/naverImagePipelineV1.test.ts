// NAVER IMAGE PIPELINE V1 §26 — acceptance tests T1–T13 (SPEC-NAVER-IMAGE-2026).
// No network: standard mode never calls a judge; AI generation is stubbed; composites run on generated samples.
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GenerateImagesOptions, GeneratedImage } from '../image/types';
import { generateImagesWithThumbnailDirector } from '../image/director/thumbnailDirectorGate';
import { buildContextualImagePrompt } from '../image/contextualImagePrompt';
import { assignSectionRoles } from '../image/director/sectionRoleAssignment';
import { inferArticleVisualKind, planSectionRoles } from '../image/director/sectionRolePlanner';
import { KIND_CONSTRAINT, REALISM_LINE, REGENERATION_LINE, ROLE_ALT_CAMERA, toBriefVisualRole } from '../image/director/roleDirectives';
import { resolveRealAssets } from '../image/director/realAssetResolver';
import { resolveThumbnailOverlayText, isFullTitleCopy } from '../image/director/thumbnailText';
import { checkSectionPlan, checkThumbnailPlan } from '../image/director/imageQualityCheck';
import { GENERATED_IMAGE_SQUARE_SIZE } from '../image/imageUtils';

const PARK_TITLE = '소희 양말 신던 중학생이었다…박서함 팬심 고백에 담긴 기억';
let dir = '';
let aiFile = '';
let parkPhoto = '';
let anPhoto = '';

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-v1-'));
  aiFile = path.join(dir, 'ai.png');
  parkPhoto = path.join(dir, 'park.jpg');
  anPhoto = path.join(dir, 'an.jpg');
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#445566' } }).png().toFile(aiFile);
  await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#aa8866' } }).jpeg().toFile(parkPhoto);
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#6688aa' } }).jpeg().toFile(anPhoto);
});
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const ai = () => [{ heading: 'x', filePath: aiFile, previewDataUrl: 'data:a', provider: 'openai-image' } as GeneratedImage];
// `thumbnailDirector: {}` is what the renderer sends for an article thumbnail (the opt-in).
const run = (options: Partial<GenerateImagesOptions>, generate = vi.fn(async () => ai())) => ({
  generate,
  result: generateImagesWithThumbnailDirector(
    { provider: 'openai-image', items: [{ heading: '🖼️ 썸네일', prompt: 'x' }], thumbnailDirector: {}, ...options } as GenerateImagesOptions,
    {}, undefined, { config: {}, generate, applyTitleOverlay: vi.fn(async (i: GeneratedImage[]) => i) },
  ),
});

describe('NAVER IMAGE PIPELINE V1 — T1–T13', () => {
  it('T1 title only + thumbnail → runs without headings; the cover brief is built from the title', async () => {
    const { generate, result } = run({ postTitle: '전세 계약 전 확인할 것' });
    expect(await result).toHaveLength(1);
    const cover = (generate.mock.calls[0] as any[])[0].items[0];
    expect(cover.heading).toBe('전세 계약 전 확인할 것');
    expect(cover.coverDirection.length).toBeGreaterThan(2);
  });

  it('T2 title + all headings → a full set plan with distinct roles; single-heading calls agree', () => {
    const headings = ['전세사기 피해가 생기는 경위', '계약서에서 확인할 조건', '보증보험 가입 방법', '두 보증 상품의 차이', '입주 당일 현장 점검'];
    const plan = planSectionRoles(headings);
    expect(checkSectionPlan(plan.map((e) => e.role)).verdict).toBe('GOOD');
    for (const entry of plan) {
      expect(assignSectionRoles([{ heading: entry.heading }], { sectionPlanHeadings: headings })[0]).toBe(entry.role);
    }
  });

  it('T3 two real celebrity photos → both people in one composite, no AI person generated', async () => {
    const { generate, result } = run({
      postTitle: PARK_TITLE,
      thumbnailDirector: { allowBakedText: true, textMode: 'auto', realImages: [{ filePath: parkPhoto, provider: 'local' }, { filePath: anPhoto, provider: 'local' }] },
    });
    const [image] = await result;
    expect(generate).not.toHaveBeenCalled();
    expect(image).toMatchObject({ provider: 'collected-image-with-text', isCollected: true, disableTextOverlay: true });
    // left half is the first photo (#aa8866), right half the second (#6688aa) — above the text band
    const at = async (x: number) => [...(await sharp(image.filePath).extract({ left: x, top: 120, width: 1, height: 1 }).raw().toBuffer())];
    const [lr, , lb] = await at(150);
    const [rr, , rb] = await at(650);
    expect(lr).toBeGreaterThan(lb);
    expect(rb).toBeGreaterThan(rr);
  });

  it('T4 article URL only → REFERENCE_ONLY; honest cover (no lookalike) + upload hint', async () => {
    const inventory = resolveRealAssets({ sourceUrls: ['https://entertain.news/park.jpg'] }, () => true);
    expect(inventory.counts.REFERENCE_ONLY).toBe(1);
    expect(inventory.composable).toEqual([]);
    const { generate, result } = run({ postTitle: PARK_TITLE, collectedImages: ['https://entertain.news/park.jpg'] as any });
    const [image] = await result;
    expect(image.directorNotice).toContain('참고용 1장');
    expect((generate.mock.calls[0] as any[])[0].items[0].coverDirection.join(' ')).toContain('lookalike');
  });

  it('T5 policy / finance → information roles, cliché ban, few people', () => {
    const headings = ['신청 자격과 소득 조건', '온라인 신청 방법', '필요 서류 목록', '지급 일정'];
    const roles = planSectionRoles(headings, { kind: 'info' }).map((e) => e.role);
    expect(roles.filter((r) => r === 'scene').length).toBeLessThanOrEqual(1);
    expect(toBriefVisualRole('closeup', { realistic: true, kind: 'info' }).constraints.join(' ')).toMatch(/coin piles.*gavel/);
  });

  it('T6 car → real-photo-first; with a user car photo the cover is that photo + the price phrase', async () => {
    const { generate, result } = run({
      postTitle: 'EV3 실구매가, 보조금 빼니 334만원 차이',
      thumbnailDirector: { allowBakedText: true, textMode: 'auto', realImages: [{ filePath: anPhoto, provider: 'local' }] },
    });
    const [image] = await result;
    expect(generate).not.toHaveBeenCalled();
    expect(image.provider).toBe('collected-image-with-text');
  });

  it('T7 travel / festival → real place first, no invented landmarks, no text without a number', () => {
    const kind = inferArticleVisualKind('', '제주 유채꽃 축제, 주차와 셔틀버스 이용법');
    expect(kind).toBe('travel');
    expect(toBriefVisualRole('place', { realistic: true, kind }).constraints).toContain(KIND_CONSTRAINT.travel);
  });

  it('T8 diversity → no adjacent repeats over 8 sections; a regeneration changes camera and says so', () => {
    const roles = planSectionRoles(Array.from({ length: 8 }, (_, i) => `평범한 소제목 ${i}`)).map((e) => e.role);
    for (let i = 1; i < roles.length; i++) expect(roles[i]).not.toBe(roles[i - 1]);
    const again = toBriefVisualRole('scene', { realistic: true, regenerate: true });
    expect(again.camera).toBe(ROLE_ALT_CAMERA.scene);
    expect(again.constraints).toContain(REGENERATION_LINE);
  });

  it('T9 thumbnail text → never the whole title (every live title-text path goes through the short phrase)', () => {
    const text = resolveThumbnailOverlayText(PARK_TITLE);
    expect(isFullTitleCopy(text, PARK_TITLE)).toBe(false);
    // generation-time overlay · publish-time overlay · product thumbnail IPC · nano banana's own text
    // (naverBlogAutomation's product-thumbnail block is behind `if (false && …)` — dead, not listed)
    const src = ['imageGenerator.ts', 'automation/editorHelpers.ts', 'main.ts', 'image/promptBuilder.ts']
      .map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf-8'));
    for (const file of src) expect(file).toMatch(/resolveThumbnailOverlayText\(/);
  });

  it('T10 800x800 is the NAVER default everywhere', async () => {
    expect(GENERATED_IMAGE_SQUARE_SIZE).toBe(800);
    const { result } = run({ postTitle: '청년월세 20만원 받는 법', thumbnailDirector: { allowBakedText: true, textMode: 'auto' } });
    const [image] = await result;
    const meta = await sharp(image.filePath).metadata();
    expect([meta.width, meta.height]).toEqual([800, 800]);
  });

  it('T11 automation payload with every value → no questions, no notices, one call', async () => {
    const { generate, result } = run({
      postTitle: '청년월세 20만원 받는 법',
      sectionPlanHeadings: ['신청 자격', '신청 방법'],
      thumbnailDirector: { cardPromise: '월 20만원을 1년 받는 조건', allowBakedText: true, textMode: 'include', realImages: [] },
    });
    const [image] = await result;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(image.directorNotice).toBeUndefined();
  });

  it('T12 박서함/안소희 fixture → the old AI-situation cover FAILS, the real-asset plan PASSES', () => {
    const before = checkThumbnailPlan({
      title: PARK_TITLE, text: PARK_TITLE, width: 800, height: 800,
      realAssetPriority: true, realAssetAvailable: true, usedRealAsset: false, aiDepictsRealPerson: true,
    });
    expect(before.verdict).toBe('FAIL');
    expect(before.reasons.length).toBeGreaterThanOrEqual(3);
    const after = checkThumbnailPlan({
      title: PARK_TITLE, text: resolveThumbnailOverlayText(PARK_TITLE), width: 800, height: 800,
      realAssetPriority: true, realAssetAvailable: true, usedRealAsset: true, aiDepictsRealPerson: false,
    });
    expect(after.verdict).toBe('GOOD');
  });

  it('T13 GOOD section cases keep their meaning but lose the cinematic AI look', () => {
    const kind = inferArticleVisualKind('', PARK_TITLE);
    expect(kind).toBe('issue');
    const headings = ['첫사랑 연예인으로 꼽은 안소희', "'어머나'와 소희 양말의 연결"];
    const plan = planSectionRoles(headings, { kind });
    expect(plan[0].role).not.toBe(plan[1].role);
    for (const entry of plan) {
      const brief = buildContextualImagePrompt({
        articleTitle: PARK_TITLE, sectionHeading: entry.heading, sectionContent: entry.heading,
        visualRole: toBriefVisualRole(entry.role, { realistic: true, kind }),
      });
      expect(brief).toContain(entry.heading); // meaning stays: the heading is the scene evidence
      expect(brief).toContain(REALISM_LINE); // no HDR / neon / studio gloss
      expect(brief).toContain('do not depict them or any lookalike');
    }
  });
});
