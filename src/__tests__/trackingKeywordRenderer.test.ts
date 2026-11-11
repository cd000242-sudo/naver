// @vitest-environment happy-dom
/**
 * [2026-11-08] Step 1 — what the renderer attaches as the keyword provenance claim, and what main derives
 * from a source it picked itself. The title fallback used for generation must never become a claim.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRendererContentPolicyContext } from '../renderer/utils/contentPolicyContext';
import { trackingFactFromContentSource } from '../analytics/trackingKeyword';

const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } as unknown as Storage;
const build = (over: Record<string, unknown> = {}) => buildRendererContentPolicyContext({
  title: '전기요금이 갑자기 올랐을 때 먼저 확인할 세 가지', content: '본문', keywords: ['전기요금 폭탄'], ...over,
}, storage);

beforeEach(() => { document.body.innerHTML = '<input id="unified-keywords" />'; });

describe('buildRendererContentPolicyContext — trackingKeyword claim', () => {
  it('a keyword the user supplied is claimed as user-input', () => {
    expect(build().trackingKeyword).toEqual({ value: '전기요금 폭탄', source: 'user-input' });
  });

  it('a fallback built from the title (keywordsFromUserInput=false) is never claimed', () => {
    expect(build({ keywords: ['전기요금이 갑자기 올랐을 때'], keywordsFromUserInput: false }).trackingKeyword).toBeUndefined();
  });

  it('a keyword identical to the title is never claimed', () => {
    const title = '전기요금 폭탄';
    expect(build({ title, keywords: [title] }).trackingKeyword).toBeUndefined();
  });

  it('no keywords, no claim — the title is not substituted', () => {
    const context = build({ keywords: [] });
    expect(context.trackingKeyword).toBeUndefined();
    expect(JSON.stringify(context.trackingKeyword ?? null)).not.toContain('전기요금이 갑자기');
  });

  it('the claim made at generation time (embedded in the structured content) wins at publish time', () => {
    const context = build({
      keywords: [],
      structuredContent: { contentPolicyContext: { trackingKeyword: { value: '가상자산 과세 유예', source: 'leword' } } },
    });
    expect(context.trackingKeyword).toEqual({ value: '가상자산 과세 유예', source: 'leword' });
  });

  it('an embedded claim with an unknown source is ignored', () => {
    const context = build({
      keywords: [],
      structuredContent: { contentPolicyContext: { trackingKeyword: { value: '가상자산', source: 'title' } } },
    });
    expect(context.trackingKeyword).toBeUndefined();
  });

  it('a LEWORD pick is labelled leword only while the field still holds that exact value', () => {
    const field = document.getElementById('unified-keywords') as HTMLInputElement;
    field.dataset.keywordOrigin = 'leword';
    field.dataset.keywordOriginValue = '전기요금 폭탄';
    expect(build().trackingKeyword?.source).toBe('leword');
    expect(build({ keywords: ['전기요금 폭탄 환급'] }).trackingKeyword?.source).toBe('user-input');
  });
});

describe('trackingFactFromContentSource — sources main picked itself', () => {
  it('a keyword job carries its keyword as schedule-job', () => {
    expect(trackingFactFromContentSource({ type: 'keyword', value: ' 근로장려금 ' })).toEqual({ value: '근로장려금', source: 'schedule-job' });
  });

  it('a URL source or an empty keyword has no keyword', () => {
    expect(trackingFactFromContentSource({ type: 'url', value: 'https://news.example/a' })).toBeUndefined();
    expect(trackingFactFromContentSource({ type: 'keyword', value: '  ' })).toBeUndefined();
    expect(trackingFactFromContentSource(undefined)).toBeUndefined();
  });
});
