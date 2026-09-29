/**
 * [2026-09-29] Per-heading "AI 활용" 3-state toggle (auto / on / off).
 *
 * Precedence at publish time: card OFF > card ON > global aiMarkAllImages > provenance auto.
 * Reason: the global checkbox marks *every* image, so a real photo the user inserted
 * by hand on one heading would be AI-marked. The card override wins over the global.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeAiMarkOverride,
  recordImageProvenance,
  readImageProvenance,
  resolveAiMarkTarget,
} from '../automation/imageProvenance';

const readSrc = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

describe('normalizeAiMarkOverride', () => {
  it('accepts on/off only; everything else is "" (auto)', () => {
    expect(normalizeAiMarkOverride('on')).toBe('on');
    expect(normalizeAiMarkOverride('off')).toBe('off');
    expect(normalizeAiMarkOverride('auto')).toBe('');
    expect(normalizeAiMarkOverride(undefined)).toBe('');
    expect(normalizeAiMarkOverride(null)).toBe('');
    expect(normalizeAiMarkOverride(true)).toBe('');
  });
});

describe('resolveAiMarkTarget precedence', () => {
  const base = { aiMarkAllImages: false, ledger: undefined, attrAi: '', attrProvider: '' };

  it('card OFF beats the global checkbox and an AI ledger entry', () => {
    expect(resolveAiMarkTarget({
      ...base,
      aiMarkAllImages: true,
      ledger: { ai: '1', provider: 'openai-image', override: 'off' },
    })).toBe(false);
  });

  it('card ON marks even a collected/real photo when the global is off', () => {
    expect(resolveAiMarkTarget({
      ...base,
      ledger: { ai: '0', provider: '', override: 'on' },
    })).toBe(true);
  });

  it('auto keeps the previous behaviour: global → ledger → DOM attr → provider allowlist', () => {
    expect(resolveAiMarkTarget({ ...base, aiMarkAllImages: true })).toBe(true);
    expect(resolveAiMarkTarget({ ...base, ledger: { ai: '1', provider: 'dropshot', override: '' } })).toBe(true);
    expect(resolveAiMarkTarget({ ...base, ledger: { ai: '0', provider: '', override: '' }, attrAi: '1' })).toBe(true);
    expect(resolveAiMarkTarget({ ...base, attrAi: '', attrProvider: 'nano-banana' })).toBe(true);
    // Ledger present and non-AI: the provider allowlist fallback must NOT resurrect the mark.
    expect(resolveAiMarkTarget({ ...base, ledger: { ai: '0', provider: '', override: '' }, attrProvider: 'nano-banana' })).toBe(false);
    expect(resolveAiMarkTarget(base)).toBe(false);
  });
});

describe('ledger carries the override', () => {
  it('recordImageProvenance stores a normalised override next to the AI verdict', () => {
    const host: Record<string, unknown> = {};
    recordImageProvenance(host, 0, { provider: 'openai-image', aiMarkOverride: 'off' });
    recordImageProvenance(host, 1, { provider: 'collected', aiMarkOverride: 'on' });
    recordImageProvenance(host, 2, { provider: 'openai-image' });
    expect(readImageProvenance(host, 0)).toEqual({ ai: '1', provider: 'openai-image', override: 'off' });
    expect(readImageProvenance(host, 1)).toEqual({ ai: '0', provider: 'collected', override: 'on' });
    expect(readImageProvenance(host, 2)).toEqual({ ai: '1', provider: 'openai-image', override: '' });
  });
});

describe('ImageManager card toggle (renderer half)', () => {
  // Renderer module relies on copy-static globals; stub the ones the toggle path touches.
  const loadImageManager = async () => {
    const g = globalThis as any;
    g.generatedImages = [];
    g.currentStructuredContent = null;
    g.currentPostId = null;
    g.appendLog = () => {};
    g.syncGlobalImagesFromImageManager = () => {};
    g.normalizeHeadingKeyForVideoCache = (t: string) => String(t || '').replace(/\s+/g, '').toLowerCase();
    g.getStableImageKey = (h: any) => String(h?.title || h || '');
    g.toFileUrlMaybe = (p: string) => p;
    g.escapeHtml = (s: string) => s;
    g.ensureKenBurnsStyles = () => {};
    g.setVeoProgressOverlay = () => {};
    g.showVeoProgressOverlay = () => {};
    // syncAllPreviews() walks the DOM; an empty document makes every preview a no-op.
    g.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    const mod = await import('../renderer/modules/imageManagerCore');
    mod.ImageManager.clearAll();
    mod.ImageManager.headings = [];
    return mod.ImageManager as any;
  };

  it('setAiMarkOverride re-stamps stored images and getAllImages carries the value', async () => {
    const im = await loadImageManager();
    im.addImage('소제목 A', { filePath: 'a1.png', provider: 'openai-image' });
    im.addImage('소제목 A', { filePath: 'a2.png', provider: 'collected' });
    im.addImage('소제목 B', { filePath: 'b1.png', provider: 'openai-image' });
    expect(im.getAiMarkOverride('소제목 A')).toBe('');

    im.setAiMarkOverride('소제목 A', 'off');
    expect(im.getAiMarkOverride('소제목 A')).toBe('off');
    expect(im.getAiMarkOverride('소제목 B')).toBe('');
    const all = im.getAllImages();
    expect(all.filter((i: any) => i.heading === '소제목 A').map((i: any) => i.aiMarkOverride)).toEqual(['off', 'off']);
    expect(all.find((i: any) => i.heading === '소제목 B').aiMarkOverride).toBe('');
  });

  it('a later image added to a toggled heading inherits the card choice; unknown values fall back to auto', async () => {
    const im = await loadImageManager();
    im.setAiMarkOverride('소제목 C', 'on');
    im.addImage('소제목 C', { filePath: 'c1.png', provider: 'collected' });
    im.setImage('소제목 C', { filePath: 'c2.png', provider: 'collected' });
    expect(im.getImages('소제목 C').every((i: any) => i.aiMarkOverride === 'on')).toBe(true);

    im.setAiMarkOverride('소제목 C', 'weird');
    expect(im.getAiMarkOverride('소제목 C')).toBe('');
    expect(im.getImages('소제목 C').every((i: any) => i.aiMarkOverride === '')).toBe(true);
  });

  it('clearAll/clear forget card choices', async () => {
    const im = await loadImageManager();
    im.setAiMarkOverride('소제목 D', 'off');
    im.clearAll();
    expect(im.getAiMarkOverride('소제목 D')).toBe('');
    im.setAiMarkOverride('소제목 D', 'off');
    im.clear();
    expect(im.getAiMarkOverride('소제목 D')).toBe('');
  });
});

describe('heading card wires the toggle button', () => {
  it('renders ai-mark-toggle-btn in the button row and cycles 자동 → 켬 → 끔 in the delegated handler', () => {
    const code = readSrc('renderer/modules/headingImageGen.ts');
    expect(code).toMatch(/class="ai-mark-toggle-btn" data-heading-index="\$\{index\}"/);
    expect(code).toMatch(/aiMarkOverrideLabel\(currentAiMarkOverride\(heading\.title \|\| ''\)\)/);
    expect(code).toMatch(/typeof ImageManager\?\.getAiMarkOverride === 'function' \? ImageManager\.getAiMarkOverride\(headingTitle\)/);
    expect(code).toMatch(/AI_MARK_OVERRIDE_CYCLE: readonly string\[\] = \['', 'on', 'off'\]/);
    expect(code).toMatch(/target\.closest\('\.ai-mark-toggle-btn'\)/);
    expect(code).toMatch(/ImageManager\.setAiMarkOverride\(headingTitle, next\)/);
  });

  it('preload and main payload types declare aiMarkOverride', () => {
    expect(readSrc('preload.ts')).toMatch(/blobId\?: string; aiMarkOverride\?: string \}>/);
    expect(readSrc('main.ts')).toMatch(/type AutomationImagePayload = \{[\s\S]{0,300}?aiMarkOverride\?: string;/);
  });
});

describe('aiMarkOverride survives every whitelist between the card and the ledger', () => {
  it('renderer payload whitelist (formAndAutomation) forwards it', () => {
    const code = readSrc('renderer/modules/formAndAutomation.ts');
    expect(code).toMatch(/isIntro: img\.isIntro \|\| false,\s*\n\s*aiMarkOverride: img\.aiMarkOverride/);
  });

  it('BlogExecutor forwards it on all four processedImages pushes', () => {
    const code = readSrc('main/services/BlogExecutor.ts');
    const pushes = code.split('processedImages.push({').length - 1;
    expect(pushes).toBe(4);
    const forwarded = (code.match(/aiMarkOverride: \(image as any\)\.aiMarkOverride/g) || []).length;
    expect(forwarded).toBe(pushes);
  });

  it('thumbnail overlay insert passes the intro image override', () => {
    const code = readSrc('automation/editorHelpers.ts');
    expect(code).toMatch(/isCollected: firstIntroImage\?\.isCollected,\s*\n\s*aiMarkOverride: firstIntroImage\?\.aiMarkOverride/);
  });

  it('publish Step 4 decides through resolveAiMarkTarget', () => {
    const code = readSrc('naverBlogAutomation.ts');
    const start = code.indexOf('// Step 4: AI 활용 마크 일괄 활성화');
    const loop = code.slice(start, code.indexOf('[AI 마크] AI 마크 활성화 오류', start));
    expect(loop).toMatch(/const isAiTarget = resolveAiMarkTarget\(\{/);
    expect(loop).toMatch(/aiMarkAllImages,\s*\n\s*ledger,/);
    expect(loop).not.toMatch(/const isAiTarget = aiMarkAllImages\s*\|\|/);
  });
});
