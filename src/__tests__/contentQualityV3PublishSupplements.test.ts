import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { StructuredContent } from '../contentGenerator.js';
import {
  DEFAULT_AFFILIATE_FTC_DISCLOSURE,
  FTC_DISCLOSURE_PRESETS,
  getFtcDisclosureTemplateId,
} from '../automation/ftcDisclosurePresets.js';
import {
  beginContentQualityV3Publication,
  enforceContentQualityV3PublicationBoundary,
  forkContentQualityV3PublicationTicket,
  registerContentQualityV3GeneratedContent,
} from '../contentQualityV3/publicationBoundary.js';
import { ContentQualityV3DurableProvenanceRegistry } from '../contentQualityV3/durableProvenanceRegistry.js';
import {
  ContentQualityV3PublishHandoffStore,
  enforceContentQualityV3PublishPayload,
} from '../contentQualityV3/publishHandoffStore.js';
import { resolveFtcSetting } from '../renderer/utils/ftcResolver.js';

const registryDirectories: string[] = [];

afterEach(() => {
  registryDirectories.splice(0).forEach(directory => {
    rmSync(directory, { recursive: true, force: true });
  });
});

function makeContent(): StructuredContent {
  const bodyPlain = (
    '투자 판단에는 원금 손실 가능성이 있습니다. '
    + '비교 기준의 상한 표시는 100%입니다. '
  ).repeat(80);
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: '투자 정보 안전 확인 가이드',
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml: bodyPlain,
    bodyPlain,
    content: bodyPlain,
    headings: [
      { title: '판단 기준', content: '원금 손실 가능성을 확인합니다.', summary: '', keywords: [], imagePrompt: '' },
      { title: '확인 사항', content: '제공된 자료를 비교합니다.', summary: '', keywords: [], imagePrompt: '' },
      { title: '주의 사항', content: '조건과 예외를 함께 확인합니다.', summary: '', keywords: [], imagePrompt: '' },
    ],
    hashtags: [],
    images: [],
    metadata: {
      category: 'finance',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: '3m',
      wordCount: bodyPlain.length,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      keywordStrategy: 'natural',
      publishTimeRecommend: '',
    },
    quality: {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      originalityScore: 90,
      readabilityScore: 90,
      warnings: [],
    },
  };
}

function makeBusinessContent(): StructuredContent {
  const content = makeContent();
  const bodyPlain = '서비스 범위와 이용 조건을 확인하고 필요한 경우 상담으로 안내합니다. '.repeat(80);
  return {
    ...content,
    selectedTitle: '지역 서비스 이용 안내',
    bodyHtml: bodyPlain,
    bodyPlain,
    content: bodyPlain,
    headings: Array.from({ length: 5 }, (_, index) => ({
      title: index === 4 ? '상담 안내' : `서비스 안내 ${index + 1}`,
      content: '제공 범위와 조건을 차분히 확인합니다.',
      summary: '',
      keywords: [],
      imagePrompt: '',
    })),
    metadata: { ...content.metadata, category: 'business', wordCount: bodyPlain.length },
  };
}

function makeAffiliateContent(): StructuredContent {
  const content = makeContent();
  const bodyPlain = 'Detailed product information helps compare fit, limits, and buying conditions. '
    .repeat(80);
  return {
    ...content,
    selectedTitle: 'Product buying guide',
    bodyHtml: bodyPlain,
    bodyPlain,
    content: bodyPlain,
    headings: [
      { title: 'Key features', content: 'Details', summary: '', keywords: [], imagePrompt: '' },
      { title: 'Who it suits', content: 'Details', summary: '', keywords: [], imagePrompt: '' },
      { title: 'Checks before buying', content: 'Details', summary: '', keywords: [], imagePrompt: '' },
    ],
    conclusion: '제휴커넥트 수수료가 발생할 수 있습니다.',
    metadata: { ...content.metadata, category: 'shopping', wordCount: bodyPlain.length },
  };
}

function prepareV3(input: Readonly<{
  content?: StructuredContent;
  source?: Readonly<Record<string, unknown>>;
  minimumBodyChars?: number;
}> = {}): Readonly<{
  initial: StructuredContent;
  publishTicket: NonNullable<ReturnType<typeof forkContentQualityV3PublicationTicket>>;
}> {
  const content = input.content ?? makeContent();
  registerContentQualityV3GeneratedContent(content, {
    source: {
      contentMode: 'seo',
      rawText: `${content.bodyPlain}\n투자 정보입니다. 비교 범위의 상한은 100%로 표시됩니다.`,
      ...input.source,
    },
    minimumBodyChars: input.minimumBodyChars ?? 1_500,
  });
  const generationTicket = beginContentQualityV3Publication(content);
  if (!generationTicket) throw new Error('expected generation ticket');
  const publishTicket = forkContentQualityV3PublicationTicket(generationTicket);
  if (!publishTicket) throw new Error('expected publish ticket');
  const initial = enforceContentQualityV3PublicationBoundary(
    content,
    generationTicket,
  ) as StructuredContent;
  return Object.freeze({ initial, publishTicket });
}

function createStore(): ContentQualityV3PublishHandoffStore {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'v3-publish-supplements-'));
  registryDirectories.push(userDataPath);
  return new ContentQualityV3PublishHandoffStore({
    now: () => 10_000,
    provenanceRegistry: new ContentQualityV3DurableProvenanceRegistry({
      userDataPath,
      now: () => 10_000,
    }),
  });
}

describe('Content Quality V3 publish supplements and FTC preservation', () => {
  it('blocks the exact visible CTA guarantee before consume and leaves the handoff active', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const ownerKey = 'renderer:supplement:frame:1';
    const { postId, handoff } = await store.issue(
      ownerKey,
      prepared.initial,
      prepared.publishTicket,
    );
    const input = {
      ownerKey,
      postId,
      required: true,
      handoff,
      candidate: structuredClone(prepared.initial),
      publishMode: 'publish',
    } as const;

    await expect(store.previewAtPublish({
      ...input,
      userSupplements: [{ kind: 'cta', text: '근거 없는 100% 보장 문구' }],
    })).rejects.toThrow('[content-quality-v3-publication] factual_high_risk_guarantee');

    await expect(store.previewAtPublish({
      ...input,
      userSupplements: [],
    })).resolves.toEqual(prepared.initial);
  });

  it('preserves an exact deterministic FTC preset while canonicalizing the V3 payload', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const ownerKey = 'renderer:ftc:frame:1';
    const { postId, handoff } = await store.issue(
      ownerKey,
      prepared.initial,
      prepared.publishTicket,
    );
    const payload = {
      title: prepared.initial.selectedTitle,
      content: prepared.initial.bodyPlain,
      lines: prepared.initial.bodyPlain.split('\n'),
      structuredContent: {
        ...structuredClone(prepared.initial),
        ftcDisclosure: FTC_DISCLOSURE_PRESETS.affiliate,
      },
      publishMode: 'publish',
      _contentQualityV3PublishOwnerKey: ownerKey,
      _contentQualityV3PostId: postId,
      _contentQualityV3Required: true,
      _contentQualityV3PublishHandoff: handoff,
    };

    const canonical = await enforceContentQualityV3PublishPayload(store, payload, {
      consume: false,
    });

    expect(canonical.structuredContent.ftcDisclosure).toBe(FTC_DISCLOSURE_PRESETS.affiliate);
    expect(Object.isFrozen(canonical.structuredContent)).toBe(true);
  });

  it('factual-validates custom FTC text without copying it into the canonical article', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const ownerKey = 'renderer:custom-ftc:frame:1';
    const { postId, handoff } = await store.issue(
      ownerKey,
      prepared.initial,
      prepared.publishTicket,
    );
    const input = {
      ownerKey,
      postId,
      required: true,
      handoff,
      candidate: structuredClone(prepared.initial),
      publishMode: 'publish',
    } as const;

    await expect(store.previewAtPublish({
      ...input,
      userSupplements: [{ kind: 'custom-ftc', text: 'OUTPUT_CONTRACT 내부 지시' }],
    })).rejects.toThrow('[content-quality-v3-publication] factual_prompt_leakage');

    const canonical = await store.previewAtPublish({
      ...input,
      userSupplements: [{ kind: 'custom-ftc', text: '제휴 링크가 포함되어 있습니다.' }],
    });
    expect(canonical).toEqual(prepared.initial);
    expect(JSON.stringify(canonical)).not.toContain('제휴 링크가 포함되어 있습니다.');
  });

  it('re-runs the business guard on visible CTA text and leaves the handoff active', async () => {
    const content = makeBusinessContent();
    const prepared = prepareV3({
      content,
      source: { contentMode: 'business', rawText: content.bodyPlain },
    });
    const store = createStore();
    const ownerKey = 'renderer:business-supplement:frame:1';
    const { postId, handoff } = await store.issue(
      ownerKey,
      prepared.initial,
      prepared.publishTicket,
    );
    const input = {
      ownerKey,
      postId,
      required: true,
      handoff,
      candidate: structuredClone(prepared.initial),
      publishMode: 'publish',
    } as const;

    await expect(store.previewAtPublish({
      ...input,
      userSupplements: [{ kind: 'cta', text: '최저가 상담 바로가기' }],
    })).rejects.toThrow('[content-quality-v3-publication] business_safety_failed');
    await expect(store.previewAtPublish({
      ...input,
      userSupplements: [],
      inspectionTexts: ['최저가 상담 신청'],
    })).rejects.toThrow('[content-quality-v3-publication] business_safety_failed');
    await expect(store.previewAtPublish({ ...input, userSupplements: [] }))
      .resolves.toEqual(prepared.initial);
  });

  it('re-runs the affiliate authenticity guard on visible CTA text and leaves the handoff active', async () => {
    const content = makeAffiliateContent();
    const prepared = prepareV3({
      content,
      source: {
        contentMode: 'affiliate',
        rawText: content.bodyPlain,
        productSpec: 'weight 680g',
      },
    });
    const store = createStore();
    const ownerKey = 'renderer:affiliate-supplement:frame:1';
    const { postId, handoff } = await store.issue(
      ownerKey,
      prepared.initial,
      prepared.publishTicket,
    );
    const input = {
      ownerKey,
      postId,
      required: true,
      handoff,
      candidate: structuredClone(prepared.initial),
      publishMode: 'publish',
    } as const;

    await expect(store.previewAtPublish({
      ...input,
      userSupplements: [{ kind: 'cta', text: '무조건 구매하세요' }],
    })).rejects.toThrow('[content-quality-v3-publication] affiliate_authenticity_failed');
    await expect(store.previewAtPublish({
      ...input,
      userSupplements: [],
      inspectionTexts: ['고민 말고 바로 구매하세요'],
    })).rejects.toThrow('[content-quality-v3-publication] affiliate_authenticity_failed');
    await expect(store.previewAtPublish({ ...input, userSupplements: [] }))
      .resolves.toEqual(prepared.initial);
  });

  it('joins whitespace inside one visible paragraph for factual claim inspection', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const ownerKey = 'renderer:newline-claim:frame:1';
    const { postId, handoff } = await store.issue(
      ownerKey,
      prepared.initial,
      prepared.publishTicket,
    );
    const input = {
      ownerKey,
      postId,
      required: true,
      handoff,
      candidate: structuredClone(prepared.initial),
      publishMode: 'publish',
    } as const;

    await expect(store.previewAtPublish({
      ...input,
      userSupplements: [{ kind: 'cta', text: '수익\n확정을 보장' }],
    })).rejects.toThrow('[content-quality-v3-publication] factual_high_risk_guarantee');
  });

  it('also blocks a hard-risk claim split across a blank-line paragraph boundary', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const ownerKey = 'renderer:paragraph-claim:frame:1';
    const { postId, handoff } = await store.issue(
      ownerKey,
      prepared.initial,
      prepared.publishTicket,
    );

    await expect(store.previewAtPublish({
      ownerKey,
      postId,
      required: true,
      handoff,
      candidate: structuredClone(prepared.initial),
      publishMode: 'publish',
      userSupplements: [{ kind: 'cta', text: '수익\n\n확정을 보장' }],
    })).rejects.toThrow('[content-quality-v3-publication] factual_high_risk_guarantee');
  });

  it('keeps the FTC preset classifier and renderer defaults byte-exact', () => {
    expect(getFtcDisclosureTemplateId(FTC_DISCLOSURE_PRESETS.affiliate)).toBe('affiliate');
    expect(getFtcDisclosureTemplateId(DEFAULT_AFFILIATE_FTC_DISCLOSURE)).toBe('affiliate-default');
    expect(getFtcDisclosureTemplateId(` ${FTC_DISCLOSURE_PRESETS.affiliate}`)).toBeUndefined();
    expect(resolveFtcSetting({
      contentMode: 'affiliate',
      uiCheckboxChecked: true,
    }).text).toBe(DEFAULT_AFFILIATE_FTC_DISCLOSURE);

    const rendererSource = readFileSync(
      path.resolve(process.cwd(), 'src/renderer/renderer.ts'),
      'utf8',
    );
    for (const preset of Object.values(FTC_DISCLOSURE_PRESETS)) {
      expect(rendererSource.split(preset).length - 1).toBeGreaterThanOrEqual(2);
    }
  });
});
