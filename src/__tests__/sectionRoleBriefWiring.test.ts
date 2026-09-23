// SPEC-NAVER-IMAGE-2026 — a planned section role reaches the final brief and the engines.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { buildContextualImagePrompt } from '../image/contextualImagePrompt';
import {
  ANTI_CLICHE_LINE,
  REALISM_LINE,
  ROLE_DIRECTIVES,
  engineHonorsVisualRole,
  toBriefVisualRole,
} from '../image/director/roleDirectives';

const base = {
  articleTitle: '전세보증보험 가입 조건 총정리',
  globalSubject: '전세보증보험',
  sectionHeading: '가입 방법',
  sectionContent: 'HUG 앱에서 서류를 올리고 보증료를 낸다.',
  existingPrompt: 'person using a laptop at a desk',
};

describe('contextual brief with a visual role', () => {
  it('adds the role composition, the role camera, and the anti-cliché/realism constraints', () => {
    const brief = buildContextualImagePrompt({ ...base, viewpointIndex: 0, visualRole: toBriefVisualRole('procedure', { realistic: true }) });
    expect(brief).toContain(`VISUAL ROLE (procedure): ${ROLE_DIRECTIVES.procedure.composition}`);
    expect(brief).toContain(`- ${ROLE_DIRECTIVES.procedure.camera}`);
    // the ordinal rotation line is replaced, not added next to it
    expect(brief).not.toContain('Camera: eye-level medium shot, natural daylight, neutral background.');
    expect(brief).toContain(`- ${ANTI_CLICHE_LINE}`);
    expect(brief).toContain(`- ${REALISM_LINE}`);
  });

  it('stylised images keep the anti-cliché line but not the photo-realism line', () => {
    const brief = buildContextualImagePrompt({ ...base, visualRole: toBriefVisualRole('closeup', { realistic: false }) });
    expect(brief).toContain(ANTI_CLICHE_LINE);
    expect(brief).not.toContain(REALISM_LINE);
  });

  it('an engine that owns its camera gets the composition but no camera line', () => {
    const brief = buildContextualImagePrompt({ ...base, engineOwnsCamera: true, visualRole: toBriefVisualRole('place', { realistic: true }) });
    expect(brief).toContain('VISUAL ROLE (place)');
    expect(brief).not.toContain(ROLE_DIRECTIVES.place.camera);
  });

  it('thumbnails ignore a section role', () => {
    const brief = buildContextualImagePrompt({ ...base, isThumbnail: true, visualRole: toBriefVisualRole('criteria', { realistic: true }) });
    expect(brief).not.toContain('VISUAL ROLE');
    expect(brief).not.toContain(REALISM_LINE);
  });

  it('without a role the brief is unchanged', () => {
    const withUndefined = buildContextualImagePrompt({ ...base, viewpointIndex: 2, visualRole: undefined });
    const plain = buildContextualImagePrompt({ ...base, viewpointIndex: 2 });
    expect(withUndefined).toBe(plain);
    expect(plain).not.toContain('VISUAL ROLE');
  });
});

describe('engines drop their own rotation only for a planned role (source guards)', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

  it('only openai honors the role — the one engine that sends the brief itself', () => {
    expect(engineHonorsVisualRole('openai-image')).toBe(true);
    // deepinfra / leonardo replace the brief with a short English wrapper (no role lines) whenever the
    // translated hint is usable, so they keep their own camera rotation.
    expect(engineHonorsVisualRole('deepinfra')).toBe(false);
    expect(engineHonorsVisualRole('leonardoai')).toBe(false);
    expect(engineHonorsVisualRole('flow')).toBe(false);
    expect(engineHonorsVisualRole('nano-banana-pro')).toBe(false);
  });

  it('openai branches on item.visualRole; deepinfra and leonardo keep their rotation', () => {
    expect(read('image/openaiImageGenerator.ts')).toMatch(/\(item as any\)\.visualRole\s*\?/);
    for (const file of ['image/leonardoAIGenerator.ts', 'image/deepinfraGenerator.ts']) {
      expect(read(file)).not.toMatch(/\(item as any\)\.visualRole/);
      expect(read(file)).toMatch(/buildSafeEnglishProviderImagePrompt\(/);
    }
  });

  it('imageGenerator plans roles and hands the camera to the role only for honoring engines', () => {
    const src = read('imageGenerator.ts');
    // [NAVER FULL AUTO] The same plan, now with each item's earlier roles for the previous-images note.
    expect(src).toMatch(/assignSectionRolesWithHistory\(generationSourceItems/);
    expect(src).toMatch(/previousRoles: sectionRoleHistory\[idx\]\?\.previousRoles/);
    expect(src).toMatch(/engineOwnsCamera: engineRotatesViewpoint\(normalizedProvider\) && !engineHonorsRole/);
    expect(src).toMatch(/visualRole: engineHonorsRole \? visualRole/);
    expect(src).toMatch(/kind: articleVisualKind,\s*regenerate: options\.regenerate === true,/);
  });

  it('the renderer wrapper sends the full heading list only for the bound article', () => {
    const src = read('renderer/modules/costAndAutoGen.ts');
    expect(src).toMatch(/canUseStructuredContext && !Array\.isArray\(options\.sectionPlanHeadings\)/);
    expect(src).toMatch(/sectionPlanHeadings: structuredHeadings/);
  });
});
