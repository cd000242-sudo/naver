import { describe, expect, it } from 'vitest';

// Browser-safe helper loaded by admin/index.html.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tools = require('../../admin/structured-editor-tools.js') as {
  createChangedPatch(base: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown>;
  findConflictingPaths(
    base: Record<string, unknown>,
    latest: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): string[];
  mergeContent(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown>;
  mergeRecordArray(
    base: Array<Record<string, unknown>>,
    patch: Array<Record<string, unknown>>,
    options?: { keys?: string[]; replaceMembership?: boolean },
  ): Array<Record<string, unknown>>;
  normalizeLegacyContent(content: Record<string, unknown>): Record<string, unknown>;
  summarizeContent(content: Record<string, unknown>): {
    products: number;
    plans: number;
    downloads: number;
    proofs: number;
  };
};

describe('admin structured content helpers', () => {
  it('creates a sparse patch so stale untouched form values cannot overwrite the latest server data', () => {
    const loadedForm = {
      hero: { title: '기존 제목', desc: '기존 설명' },
      theme: { gold: '#FFD700' },
      productsPage: { guideCards: [['기준', '제품', '설명', '/detail', 'future-cell']] },
    };
    const currentForm = {
      hero: { title: '기존 제목', desc: '기존 설명' },
      theme: { gold: '' },
      productsPage: { guideCards: [['기준', '제품', '설명', '/detail', 'future-cell']] },
    };

    expect(tools.createChangedPatch(loadedForm, currentForm)).toEqual({
      theme: { gold: '' },
    });
  });

  it('represents removed form fields and deletes them from the latest server snapshot', () => {
    const loadedForm = {
      pricing: { plans: { monthly: { amount: 100000, name: '1개월' } } },
      theme: { music: { startSec: 16, title: '배경음악' } },
    };
    const currentForm = {
      pricing: { plans: { monthly: { name: '1개월' } } },
      theme: { music: { title: '배경음악' } },
    };
    const latestServer = {
      pricing: { plans: { monthly: { amount: 120000, name: '서버 최신 이름', future: true } } },
      theme: { music: { startSec: 32, title: '서버 최신 음악', future: true } },
      futureSection: { keep: true },
    };

    const patch = tools.createChangedPatch(loadedForm, currentForm);
    expect(tools.mergeContent(latestServer, patch)).toEqual({
      pricing: { plans: { monthly: { name: '서버 최신 이름', future: true } } },
      theme: { music: { title: '서버 최신 음악', future: true } },
      futureSection: { keep: true },
    });
  });

  it('blocks same-field and same-array concurrent edits while allowing unrelated server changes', () => {
    const loaded = {
      hero: {
        title: '기존 제목',
        proofs: [{ id: 'proof-a', src: '/a.jpg', title: 'A' }],
      },
      theme: { gold: '#FFD700' },
    };
    const current = {
      hero: {
        title: '내 제목',
        proofs: [{ id: 'proof-a', src: '/a.jpg', title: 'A 수정' }],
      },
      theme: { gold: '#FFD700' },
    };
    const patch = tools.createChangedPatch(loaded, current);

    expect(tools.findConflictingPaths(loaded, {
      hero: {
        title: '다른 탭 제목',
        proofs: [
          { id: 'proof-a', src: '/a.jpg', title: 'A' },
          { id: 'proof-b', src: '/b.jpg', title: 'B 동시 추가' },
        ],
      },
      theme: { gold: '#C9A84C' },
    }, patch)).toEqual(['hero.title', 'hero.proofs']);

    expect(tools.findConflictingPaths(loaded, {
      ...loaded,
      theme: { gold: '#C9A84C' },
    }, patch)).toEqual([]);

    expect(tools.findConflictingPaths(loaded, current, patch)).toEqual([]);
  });
  it('preserves server fields unknown to the current form while applying edits', () => {
    const base = {
      hero: { title: '기존 제목', futureHeroField: 'keep' },
      pricing: {
        plans: {
          'all-in-one-monthly': { name: '올인원 1개월', amount: 100000, futurePlanField: true },
        },
      },
      products: { futureProduct: { name: '다음 제품' } },
      downloads: { futurePlatform: { url: '/future.exe' } },
      theme: { music: { enabled: true } },
      futureSection: { enabled: true },
    };

    const merged = tools.mergeContent(base, {
      hero: { title: '수정한 제목' },
      pricing: { plans: { 'all-in-one-monthly': { amount: 120000 } } },
    });

    expect(merged).toMatchObject({
      hero: { title: '수정한 제목', futureHeroField: 'keep' },
      pricing: {
        plans: {
          'all-in-one-monthly': {
            name: '올인원 1개월',
            amount: 120000,
            futurePlanField: true,
          },
        },
      },
      products: { futureProduct: { name: '다음 제품' } },
      downloads: { futurePlatform: { url: '/future.exe' } },
      theme: { music: { enabled: true } },
      futureSection: { enabled: true },
    });
    expect(base.hero.title).toBe('기존 제목');
  });

  it('preserves intentional blank values and empty lists instead of restoring defaults', () => {
    const defaults = {
      hero: { title: '기본 제목', desc: '기본 설명', proofs: [{ id: 'default', src: '/default.jpg' }] },
      productsPage: { guideCards: [['기본', '제품', '설명', '/detail']] },
    };

    expect(tools.mergeContent(defaults, {
      hero: { title: '', proofs: [] },
      productsPage: { guideCards: [] },
    })).toEqual({
      hero: { title: '', desc: '기본 설명', proofs: [] },
      productsPage: { guideCards: [] },
    });
  });

  it('replaces edited arrays without mutating the loaded snapshot', () => {
    const base = {
      hero: {
        proofs: [
          { id: 'proof-a', src: '/a.jpg', title: '기존', futureAssetField: 'keep' },
          { id: 'proof-b', src: '/b.jpg', title: '삭제 대상' },
        ],
      },
    };
    const merged = tools.mergeContent(base, {
      hero: { proofs: [{ id: 'proof-a', src: '/a.jpg', title: '신규' }] },
    });

    expect(merged).toEqual({
      hero: {
        proofs: [{ id: 'proof-a', src: '/a.jpg', title: '신규', futureAssetField: 'keep' }],
      },
    });
    expect(base.hero.proofs).toHaveLength(2);
    expect(base.hero.proofs[0]).toMatchObject({ title: '기존', futureAssetField: 'keep' });
  });

  it('merges record arrays by src then id, retaining omissions until deletion is explicit', () => {
    const base = [
      { id: 'proof-a', src: '/a.jpg', title: 'A', futureA: true },
      { id: 'proof-b', src: '/old-b.jpg', title: 'B', futureB: true },
      { id: 'proof-c', src: '/c.jpg', title: 'C' },
    ];
    const patch = [
      { id: 'different-id', src: '/a.jpg', title: 'A edited' },
      { id: 'proof-b', src: '/new-b.jpg', title: 'B edited' },
      { id: 'proof-d', src: '/d.jpg', title: 'D new' },
    ];

    expect(tools.mergeRecordArray(base, patch)).toEqual([
      { id: 'different-id', src: '/a.jpg', title: 'A edited', futureA: true },
      { id: 'proof-b', src: '/new-b.jpg', title: 'B edited', futureB: true },
      { id: 'proof-c', src: '/c.jpg', title: 'C' },
      { id: 'proof-d', src: '/d.jpg', title: 'D new' },
    ]);

    expect(tools.mergeRecordArray(base, patch, { replaceMembership: true })).toEqual([
      { id: 'different-id', src: '/a.jpg', title: 'A edited', futureA: true },
      { id: 'proof-b', src: '/new-b.jpg', title: 'B edited', futureB: true },
      { id: 'proof-d', src: '/d.jpg', title: 'D new' },
    ]);
    expect(base[0]).toEqual({ id: 'proof-a', src: '/a.jpg', title: 'A', futureA: true });
  });

  it('migrates mixed legacy content and combines canonical and legacy plans without data loss', () => {
    const source = {
      heroTitle: 'legacy title',
      heroDesc: 'legacy description',
      notice: 'legacy notice',
      hero: { title: 'canonical title', futureHeroField: 'keep' },
      downloadUrls: { naver: '/legacy-naver.exe', futurePlatform: '/future.exe' },
      downloads: {
        naver: {
          futureDownloadField: true,
          downloads: { windows: { detail: 'Windows x64' } },
        },
      },
      pricing: {
        futurePricingField: 'keep',
        plans: {
          'disabled-license-bundle-monthly': {
            name: 'legacy monthly',
            amount: 50000,
            futureLegacyPlanField: 'keep legacy',
          },
          'all-in-one-monthly': {
            name: 'canonical monthly',
            futureCanonicalPlanField: 'keep canonical',
          },
          'future-plan': { name: 'future plan', futureOnly: true },
        },
      },
      futureTopLevelSection: { enabled: true },
    };

    const normalized = tools.normalizeLegacyContent(source);

    expect(normalized).toMatchObject({
      hero: {
        title: 'canonical title',
        desc: 'legacy description',
        notice: 'legacy notice',
        futureHeroField: 'keep',
      },
      downloads: {
        naver: {
          futureDownloadField: true,
          downloads: {
            windows: { url: '/legacy-naver.exe', detail: 'Windows x64' },
          },
        },
      },
      pricing: {
        futurePricingField: 'keep',
        plans: {
          'all-in-one-monthly': {
            name: 'canonical monthly',
            amount: 50000,
            futureLegacyPlanField: 'keep legacy',
            futureCanonicalPlanField: 'keep canonical',
          },
          'future-plan': { name: 'future plan', futureOnly: true },
        },
      },
      futureTopLevelSection: { enabled: true },
    });
    expect((normalized.pricing as { plans: Record<string, unknown> }).plans)
      .not.toHaveProperty('disabled-license-bundle-monthly');
    expect(source.pricing.plans).toHaveProperty('disabled-license-bundle-monthly');
  });

  it('blocks prototype-pollution keys during array merge and legacy normalization', () => {
    const malicious = JSON.parse('{"id":"proof-a","__proto__":{"polluted":true}}');
    const merged = tools.mergeRecordArray([{ id: 'proof-a', future: 'keep' }], [malicious], {
      replaceMembership: true,
    });
    const normalized = tools.normalizeLegacyContent(JSON.parse(
      '{"heroTitle":"safe","__proto__":{"polluted":true},"pricing":{"plans":{"constructor":{"bad":true}}}}',
    ));

    expect(merged).toEqual([{ id: 'proof-a', future: 'keep' }]);
    expect(normalized).not.toHaveProperty('__proto__.polluted');
    expect(Object.prototype.hasOwnProperty.call(
      (normalized.pricing as { plans: Record<string, unknown> }).plans,
      'constructor',
    )).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
