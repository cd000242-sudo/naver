import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EditorCommitCandidate } from '../automation/publishCommitHook.js';
import { DEFAULT_AFFILIATE_FTC_DISCLOSURE } from '../automation/ftcDisclosurePresets.js';
import { buildMobileRichHtml } from '../automation/richTextPaste.js';
import type { StructuredContent } from '../contentGenerator.js';
import {
  assertContentQualityV3EditorCommitProjection,
  enforceContentQualityV3EditorCommit,
} from '../contentQualityV3/editorCommitBoundary.js';
import {
  beginContentQualityV3Publication,
  enforceContentQualityV3PublicationBoundary,
  forkContentQualityV3PublicationTicket,
  registerContentQualityV3GeneratedContent,
} from '../contentQualityV3/publicationBoundary.js';
import {
  ContentQualityV3PublishHandoffStore,
  enforceContentQualityV3PublishPayload,
} from '../contentQualityV3/publishHandoffStore.js';
import { ContentQualityV3DurableProvenanceRegistry } from '../contentQualityV3/durableProvenanceRegistry.js';

const registryDirectories: string[] = [];

afterEach(() => {
  registryDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }));
});

function makeContent(overrides: Partial<StructuredContent> = {}): StructuredContent {
  const introduction = (
    '공식 자료의 범위와 확인 시점을 먼저 살펴보는 안내입니다. '
    + '표현보다 조건과 근거를 차분히 비교합니다. '
  ).repeat(8).trim();
  const sectionContents = [
    (
      '공식 자료에서 확인한 핵심 정보와 적용 조건을 함께 정리합니다. '
      + '확인되지 않은 내용은 단정하지 않고 자료의 범위를 분명히 밝힙니다. '
    ).repeat(12).trim(),
    (
      '자료에서 확인한 비교 항목은 제공 시점과 적용 대상을 함께 읽어야 합니다. '
      + '조건이 다른 항목은 같은 기준처럼 합치지 않고 각각의 범위를 구분합니다. '
    ).repeat(12).trim(),
    (
      '이용 전에는 최신 공식 안내와 자신의 조건을 다시 대조하는 편이 안전합니다. '
      + '자료가 달라질 수 있는 항목은 실제 신청 또는 구매 시점에 재확인합니다. '
    ).repeat(12).trim(),
  ];
  const headings = [
    { title: '핵심 정보', content: sectionContents[0], summary: '', keywords: [], imagePrompt: '' },
    { title: '확인 사항', content: sectionContents[1], summary: '', keywords: [], imagePrompt: '' },
    { title: '이용 팁', content: sectionContents[2], summary: '', keywords: [], imagePrompt: '' },
  ];
  const conclusion = '마지막으로 공식 자료의 갱신 여부를 확인하고 자신의 상황에 맞게 판단합니다.';
  const bodyPlain = [
    introduction,
    ...headings.flatMap(heading => [heading.title, heading.content]),
    conclusion,
  ].join('\n\n');
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: '공식 자료 확인 가이드',
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml: bodyPlain,
    bodyPlain,
    content: bodyPlain,
    introduction,
    headings,
    conclusion,
    hashtags: [],
    images: [],
    metadata: {
      category: 'general',
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
    ...overrides,
  };
}

function createStore(now = () => 10_000): ContentQualityV3PublishHandoffStore {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'v3-editor-commit-'));
  registryDirectories.push(userDataPath);
  return new ContentQualityV3PublishHandoffStore({
    now,
    ttlMs: 60_000,
    maxActiveRecords: 8,
    maxTombstones: 16,
    provenanceRegistry: new ContentQualityV3DurableProvenanceRegistry({ userDataPath, now }),
  });
}

function makeVisibleBody(content: StructuredContent): string {
  const structuredSegments = [
    content.introduction ?? '',
    ...content.headings.flatMap(heading => [heading.title, heading.content ?? '']),
    content.conclusion ?? '',
  ].filter(Boolean);
  return [
    ...(structuredSegments.length > 0 ? structuredSegments : [content.bodyPlain]),
    ...content.hashtags.map(tag => `#${tag.replace(/^#+/u, '')}`),
  ].join('\n');
}

async function prepare(
  sourceOverrides: Readonly<Record<string, unknown>> = {},
  contentOverrides: Partial<StructuredContent> = {},
): Promise<Readonly<{
  store: ContentQualityV3PublishHandoffStore;
  payload: Record<string, unknown>;
  initial: StructuredContent;
}>> {
  const generated = makeContent(contentOverrides);
  registerContentQualityV3GeneratedContent(generated, {
    source: {
      contentMode: 'seo',
      ...sourceOverrides,
      rawText: `${generated.bodyPlain}\n${
        typeof sourceOverrides.rawText === 'string'
          ? sourceOverrides.rawText
          : '비교 범위의 상한은 100%로 표시됩니다.'
      }`,
    },
    minimumBodyChars: 1_500,
  });
  const generationTicket = beginContentQualityV3Publication(generated);
  if (!generationTicket) throw new Error('expected generation ticket');
  const publishTicket = forkContentQualityV3PublicationTicket(generationTicket);
  if (!publishTicket) throw new Error('expected publish ticket');
  const initial = enforceContentQualityV3PublicationBoundary(
    generated,
    generationTicket,
  ) as StructuredContent;
  const store = createStore();
  const ownerKey = 'renderer:editor-commit:frame:1';
  const issued = await store.issue(ownerKey, initial, publishTicket);
  return Object.freeze({
    store,
    initial,
    payload: {
      title: initial.selectedTitle,
      content: initial.bodyPlain,
      structuredContent: structuredClone(initial),
      publishMode: 'publish',
      _contentQualityV3PublishOwnerKey: ownerKey,
      _contentQualityV3PostId: issued.postId,
      _contentQualityV3Required: true,
      _contentQualityV3PublishHandoff: issued.handoff,
    },
  });
}

function makeCandidate(
  initial: StructuredContent,
  overrides: Partial<Pick<
    StructuredContent,
    'selectedTitle' | 'bodyPlain' | 'introduction' | 'headings' | 'conclusion' | 'hashtags'
  >> = {},
  userSupplements: EditorCommitCandidate['userSupplements'] = [],
  deterministicAdornments: EditorCommitCandidate['deterministicAdornments'] = [],
  externalLinkCards: EditorCommitCandidate['externalLinkCards'] = [],
  visibleSnapshot: Readonly<Record<string, unknown>> | undefined = undefined,
  sourceHeadingTitles: readonly string[] = initial.headings.map(heading => heading.title),
): EditorCommitCandidate {
  const structured = {
    ...structuredClone(initial),
    ...overrides,
  };
  structured.content = structured.bodyPlain;
  return Object.freeze({
    validatedArticle: Object.freeze({
      title: structured.selectedTitle,
      bodyPlain: structured.bodyPlain,
      introduction: structured.introduction ?? '',
      headings: Object.freeze(structured.headings.map(heading => Object.freeze({
        title: heading.title,
        content: heading.content,
      }))),
      conclusion: structured.conclusion ?? '',
      hashtags: Object.freeze([...structured.hashtags]),
    }),
    sourceHeadingTitles: Object.freeze([...sourceHeadingTitles]),
    structuredContent: Object.freeze(structured) as unknown as Readonly<Record<string, unknown>>,
    userSupplements: Object.freeze([...userSupplements]),
    deterministicAdornments: Object.freeze([...deterministicAdornments]),
    externalLinkCards: Object.freeze([...externalLinkCards]),
    visibleSnapshot: visibleSnapshot ?? Object.freeze({
      title: structured.selectedTitle,
      bodyText: makeVisibleBody(structured),
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    }),
  }) as unknown as EditorCommitCandidate;
}

describe('Content Quality V3 actual editor commit boundary', () => {
  it('blocks SAFE original → UNSAFE semi-auto editor body, leaves the handoff active, then consumes once', async () => {
    const prepared = await prepare();
    const unsafeClaim = '투자 수익은 100% 보장됩니다.';
    const unsafeBody = `${prepared.initial.bodyPlain}\n\n${unsafeClaim}`;
    const unsafe = makeCandidate(prepared.initial, {
      bodyPlain: unsafeBody,
      conclusion: `${prepared.initial.conclusion}\n\n${unsafeClaim}`,
    });

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      unsafe,
    )).rejects.toThrow('[content-quality-v3-publication] factual_high_risk_guarantee');

    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });

    const safe = makeCandidate(prepared.initial);
    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      safe,
    )).resolves.toBeUndefined();
    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      safe,
    )).rejects.toThrow(/replayed/);
  });

  it('fails closed if an unreachable CTA supplement reaches the strict editor boundary', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [
      { kind: 'cta', text: '근거 없는 100% 보장 문구' },
    ]);

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] invalid_candidate');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('fails a canonical projection change before consume and keeps the handoff active', async () => {
    const prepared = await prepare();
    const validCandidate = makeCandidate(prepared.initial);
    const candidate = Object.freeze({
      ...validCandidate,
      structuredContent: Object.freeze({
        ...validCandidate.structuredContent,
        conclusion: '검증된 writer ledger와 일치하지 않는 구조화 결론',
      }),
    }) as EditorCommitCandidate;

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] candidate_mismatch');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('uses only NFC and CRLF normalization, preserving all other visible differences', () => {
    const article = makeCandidate(makeContent()).validatedArticle;
    const equivalent = {
      title: article.title.normalize('NFD'),
      content: article.bodyPlain.replace(/\n/g, '\r\n'),
      structuredContent: {
        selectedTitle: article.title.normalize('NFD'),
        bodyPlain: article.bodyPlain.replace(/\n/g, '\r\n'),
        introduction: article.introduction,
        headings: article.headings,
        conclusion: article.conclusion,
        hashtags: article.hashtags,
      },
    };
    expect(() => assertContentQualityV3EditorCommitProjection(article, equivalent)).not.toThrow();

    const changed = {
      ...equivalent,
      structuredContent: {
        ...equivalent.structuredContent,
        headings: equivalent.structuredContent.headings.map((heading, index) => (
          index === 0 ? { ...heading, content: `${heading.content} ` } : heading
        )),
      },
    };
    expect(() => assertContentQualityV3EditorCommitProjection(article, changed))
      .toThrow('[content-quality-v3-publish-commit] candidate_mismatch');
  });

  it('rejects an unknown deterministic adornment before consume and leaves the handoff active', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [
      { kind: 'enhanced-cta', templateId: 'untrusted-template' },
    ], []);

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] invalid_candidate');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it.each(['affiliate', 'experience', 'sponsored', 'collab'] as const)(
    'blocks an exact %s FTC preset without trusted transaction evidence',
    async templateId => {
      const prepared = await prepare();
      const candidate = makeCandidate(prepared.initial, {}, [], [
        { kind: 'ftc-preset', templateId },
      ], []);

      await expect(enforceContentQualityV3EditorCommit(
        prepared.store,
        prepared.payload,
        candidate,
      )).rejects.toThrow('[content-quality-v3-publish-commit] invalid_candidate');
      await expect(enforceContentQualityV3PublishPayload(
        prepared.store,
        prepared.payload,
        { consume: false },
      )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
    },
  );

  it('allows only the non-transactional affiliate-default FTC preset', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [
      { kind: 'ftc-preset', templateId: 'affiliate-default' },
    ], [], Object.freeze({
      title: prepared.initial.selectedTitle,
      bodyText: `${DEFAULT_AFFILIATE_FTC_DISCLOSURE}\n${makeVisibleBody(prepared.initial)}`,
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).resolves.toBeUndefined();
  });

  it('rejects duplicate affiliate-default adornments before consume', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [
      { kind: 'ftc-preset', templateId: 'affiliate-default' },
      { kind: 'ftc-preset', templateId: 'affiliate-default' },
    ]);

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] invalid_candidate');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('requires the exact default FTC disclosure at the beginning of the final DOM body', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [
      { kind: 'ftc-preset', templateId: 'affiliate-default' },
    ]);

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] visible_body_mismatch');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('rejects a custom FTC supplement before comparing its punctuation variant', async () => {
    const prepared = await prepare();
    const customFtc = '이 글에는 사용자 지정 광고 고지 문구가 포함됩니다.';
    const candidate = makeCandidate(prepared.initial, {}, [
      { kind: 'custom-ftc', text: `${customFtc}!` },
    ], [], [], Object.freeze({
      title: prepared.initial.selectedTitle,
      bodyText: `${makeVisibleBody(prepared.initial)}\n${customFtc}!`,
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] invalid_candidate');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('fails closed when an expected link card timed out or disappeared before the final click', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [], [
      {
        kind: 'enhanced-cta',
        label: '상품 정보 보기',
        url: 'https://example.test/product',
        cardReady: true,
      },
    ]);

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] visible_link_card_mismatch');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('factual-validates remote link-card metadata from the final visible snapshot', async () => {
    const prepared = await prepare({
      rawText: '금융 투자 수익률을 비교하며 자료에는 비교 수치 100%가 있습니다.',
      categoryHint: '금융',
    });
    const candidate = makeCandidate(prepared.initial, {}, [], [], [
      {
        kind: 'enhanced-cta',
        label: '상품 정보 보기',
        url: 'https://example.test/product',
        cardReady: true,
      },
    ], Object.freeze({
      title: prepared.initial.selectedTitle,
      bodyText: makeVisibleBody(prepared.initial),
      linkCards: Object.freeze([Object.freeze({
        text: '수익 100% 보장 상품',
        urls: Object.freeze(['https://example.test/product']),
        transformed: true,
      })]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publication] factual_high_risk_guarantee');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('rejects a single-newline claim appended outside the exact canonical body', async () => {
    const prepared = await prepare({
      rawText: '금융 투자 수익률을 비교하는 자료입니다.',
      categoryHint: '금융',
    });
    const candidate = makeCandidate(prepared.initial, {}, [], [], [], Object.freeze({
      title: prepared.initial.selectedTitle,
      bodyText: `${makeVisibleBody(prepared.initial)}\n수익\n100% 보장`,
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] visible_body_mismatch');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('blocks a bare URL that never transformed into its expected card', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [], [
      {
        kind: 'enhanced-cta',
        label: '상품 정보 보기',
        url: 'https://example.test/untransformed',
        cardReady: true,
      },
    ], Object.freeze({
      title: prepared.initial.selectedTitle,
      bodyText: `${makeVisibleBody(prepared.initial)}\nhttps://example.test/untransformed`,
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze(['https://example.test/untransformed']),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] visible_bare_url');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('blocks a safe but incomplete final DOM body and keeps the handoff active', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [], [], Object.freeze({
      title: prepared.initial.selectedTitle,
      bodyText: '짧지만 안전한 문장입니다.',
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] visible_body_mismatch');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('blocks any opaque visual remaining in the final editor DOM', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [], [], Object.freeze({
      title: prepared.initial.selectedTitle,
      bodyText: makeVisibleBody(prepared.initial),
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 1,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] visible_opaque_visual');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('blocks a label-only external anchor that contains no visible URL text', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [], [], Object.freeze({
      title: prepared.initial.selectedTitle,
      bodyText: makeVisibleBody(prepared.initial),
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze(['https://example.test/hidden-destination']),
      opaqueVisualCount: 0,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] visible_external_anchor');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('accepts canonically equivalent NFC/NFD text while preserving exact body equality', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [], [], Object.freeze({
      title: prepared.initial.selectedTitle.normalize('NFD'),
      bodyText: makeVisibleBody(prepared.initial).normalize('NFD'),
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).resolves.toBeUndefined();
  });

  it('blocks extra or duplicated safe-looking DOM text outside the canonical article', async () => {
    const prepared = await prepare();
    const candidate = makeCandidate(prepared.initial, {}, [], [], [], Object.freeze({
      title: prepared.initial.selectedTitle,
      bodyText: `${makeVisibleBody(prepared.initial)}\nAI가 작성했습니다. `.repeat(100),
      linkCards: Object.freeze([]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      candidate,
    )).rejects.toThrow('[content-quality-v3-publish-commit] visible_body_mismatch');
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('accepts the real V3 empty-heading-content contract after lossless writer extraction', async () => {
    const base = makeContent();
    const sourceTitles = ['1. 핵심 정보', 'STEP 2 확인 사항', '③ 이용 팁'];
    const sourceHeadings = base.headings.map((heading, index) => ({
      ...heading,
      title: sourceTitles[index],
      content: '',
    }));
    const bodyPlain = [
      base.introduction,
      ...sourceHeadings.flatMap((heading, index) => [
        heading.title,
        base.headings[index].content,
      ]),
      base.conclusion,
    ].join('\n\n');
    const prepared = await prepare({}, {
      bodyPlain,
      bodyHtml: bodyPlain,
      content: bodyPlain,
      headings: sourceHeadings,
      metadata: { ...base.metadata, wordCount: bodyPlain.length },
    });
    const writerHeadings = base.headings.map((heading, index) => ({
      ...heading,
      title: ['핵심 정보', '확인 사항', '이용 팁'][index],
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      makeCandidate(prepared.initial, { headings: writerHeadings }),
    )).resolves.toBeUndefined();
  });

  it('compares canonical prose through the same Markdown-to-visible writer semantics', async () => {
    const base = makeContent();
    const rawIntroduction = `**확인 기준**\n\n${base.introduction}`;
    const rawSections = [
      `**핵심 근거**\n\n${base.headings[0].content}`,
      `> 비교할 때의 주의점\n\n${base.headings[1].content}`,
      `1. 공식 안내 재확인\n2. 적용 조건 대조\n\n${base.headings[2].content}`,
    ];
    const sourceTitles = ['1. 핵심 정보', 'STEP 2 확인 사항', '③ 이용 팁'];
    const bodyLabels = ['## 1. 핵심 정보', '## STEP 2 확인 사항', '## ③ 이용 팁'];
    const sourceHeadings = base.headings.map((heading, index) => ({
      ...heading,
      title: sourceTitles[index],
      content: '',
    }));
    const bodyPlain = [
      rawIntroduction,
      ...bodyLabels.flatMap((label, index) => [label, rawSections[index]]),
    ].join('\n\n');
    const prepared = await prepare({}, {
      bodyPlain,
      bodyHtml: bodyPlain,
      content: bodyPlain,
      introduction: rawIntroduction,
      headings: sourceHeadings,
      conclusion: '',
      metadata: { ...base.metadata, wordCount: bodyPlain.length },
    });
    const writerHeadings = base.headings.map((heading, index) => ({
      ...heading,
      title: ['핵심 정보', '확인 사항', '이용 팁'][index],
      content: buildMobileRichHtml(rawSections[index]).plainText,
    }));

    await expect(enforceContentQualityV3EditorCommit(
      prepared.store,
      prepared.payload,
      makeCandidate(prepared.initial, {
        introduction: buildMobileRichHtml(rawIntroduction).plainText,
        headings: writerHeadings,
        conclusion: '',
      }),
    )).resolves.toBeUndefined();
  });

  it('rejects writer sentence loss or duplication before consuming the handoff', async () => {
    const prepared = await prepare();
    const original = prepared.initial.headings[1].content;
    const variants = [
      original.slice(0, Math.max(1, original.length - 40)),
      `${original}\n\n${original}`,
    ];

    for (const content of variants) {
      const headings = prepared.initial.headings.map((heading, index) => (
        index === 1 ? { ...heading, content } : heading
      ));
      await expect(enforceContentQualityV3EditorCommit(
        prepared.store,
        prepared.payload,
        makeCandidate(prepared.initial, { headings }),
      )).rejects.toThrow('[content-quality-v3-publish-commit] visible_body_mismatch');
    }
    await expect(enforceContentQualityV3PublishPayload(
      prepared.store,
      prepared.payload,
      { consume: false },
    )).resolves.toMatchObject({ title: prepared.initial.selectedTitle });
  });

  it('strips only an exact standalone duplicate title line, never a prose prefix', async () => {
    const base = makeContent();
    const selectedTitle = '비용 정리';
    const introduction = `비용 정리는 조건에 따라 달라집니다. ${base.introduction}`;
    const bodyWithoutDuplicateTitle = [
      introduction,
      ...base.headings.flatMap(heading => [heading.title, heading.content]),
      base.conclusion,
    ].join('\n\n');
    const prefixPrepared = await prepare({}, {
      selectedTitle,
      introduction,
      bodyPlain: bodyWithoutDuplicateTitle,
      bodyHtml: bodyWithoutDuplicateTitle,
      content: bodyWithoutDuplicateTitle,
      metadata: { ...base.metadata, wordCount: bodyWithoutDuplicateTitle.length },
    });

    await expect(enforceContentQualityV3EditorCommit(
      prefixPrepared.store,
      prefixPrepared.payload,
      makeCandidate(prefixPrepared.initial),
    )).resolves.toBeUndefined();

    const bodyWithDuplicateTitle = `${selectedTitle}\n\n${bodyWithoutDuplicateTitle}`;
    const duplicatePrepared = await prepare({}, {
      selectedTitle,
      introduction,
      bodyPlain: bodyWithDuplicateTitle,
      bodyHtml: bodyWithDuplicateTitle,
      content: bodyWithDuplicateTitle,
      metadata: { ...base.metadata, wordCount: bodyWithDuplicateTitle.length },
    });
    await expect(enforceContentQualityV3EditorCommit(
      duplicatePrepared.store,
      duplicatePrepared.payload,
      makeCandidate(duplicatePrepared.initial),
    )).resolves.toBeUndefined();
  });
});
