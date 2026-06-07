import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('generated post list performance policy', () => {
  const code = read('renderer/modules/postListUI.ts');

  it('serializes refresh requests so repeated saves do not stack blob validation jobs', () => {
    expect(code).toContain('refreshInFlight');
    expect(code).toContain('refreshQueued');
    expect(code).toMatch(/if \(refreshInFlight\)[\s\S]{0,120}?refreshQueued = true/);
  });

  it('validates blob references after filtering and sorting, not before every saved post is narrowed', () => {
    const filterIndex = code.indexOf('if (filterSelect)');
    const sortIndex = code.indexOf('if (sortSelect)');
    const validateIndex = code.indexOf('const validated = await validateBlobReferences(posts)');

    expect(filterIndex).toBeGreaterThan(0);
    expect(sortIndex).toBeGreaterThan(filterIndex);
    expect(validateIndex).toBeGreaterThan(sortIndex);
  });

  it('does not render every post card inside collapsed category/account groups', () => {
    expect(code).toContain('collapsedBodyHtml');
    expect(code).toContain('접힌 글 ${g.items.length}개');
    expect(code).toContain('접힌 계정 글 ${acct.posts.length}개');
  });

  it('escapes search terms before building highlight regex', () => {
    expect(code).toContain('escapeRegExp');
    expect(code).toMatch(/new RegExp\(`\(\$\{escapeRegExp\(term\)\}\)`/);
  });
});

describe('Google web image engine speed policy', () => {
  const imageFx = read('image/imageFxGenerator.ts');
  const flow = read('image/flowGenerator.ts');

  it('keeps ImageFX human-like delay short but nonzero for bot-safety', () => {
    expect(imageFx).toMatch(/const baseMs = 3000/);
    expect(imageFx).toMatch(/Math\.random\(\) \* 4000/);
  });

  it('caps expensive duplicate regeneration loops for ImageFX and Flow', () => {
    expect(imageFx).toMatch(/const IMAGEFX_DUP_MAX_RETRIES = 2/);
    expect(flow).toMatch(/const FLOW_DUPLICATE_MAX_RETRIES = 2/);
  });

  it('keeps Flow strict fresh-project retry opt-in only', () => {
    expect(flow).toContain("process.env.FLOW_STRICT_DIVERSITY === '1'");
    expect(flow).toContain('FLOW_FORCE_FRESH_PROJECT_ON_DUPLICATE');
  });

  it('stops ImageFX immediately for fatal account or permission errors', () => {
    expect(imageFx).toContain('function isFatalImageFxSingleError');
    expect(imageFx).toContain("code === 'IMAGEFX_FORBIDDEN'");
    expect(imageFx).toContain("code === 'IMAGEFX_AUTH_EXPIRED'");
    expect(imageFx).toMatch(/if \(isFatalImageFxSingleError\(error\)\)[\s\S]{0,80}?throw error/);
  });
});
