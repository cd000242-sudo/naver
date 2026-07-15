import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { StructuredContent } from '../contentGenerator.js';
import {
  beginContentQualityV3Publication,
  enforceContentQualityV3PublicationBoundary,
  forkContentQualityV3PublicationTicket,
  registerContentQualityV3GeneratedContent,
} from '../contentQualityV3/publicationBoundary.js';
import {
  ContentQualityV3PublishHandoffStore,
  enforceContentQualityV3PublishPayload,
  hasContentQualityV3ProvenanceSignal,
  type ContentQualityV3PublishHandoff,
} from '../contentQualityV3/publishHandoffStore.js';
import { ContentQualityV3DurableProvenanceRegistry } from '../contentQualityV3/durableProvenanceRegistry.js';

const registryDirectories: string[] = [];

afterEach(() => {
  registryDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }));
});

function makeContent(overrides: Partial<StructuredContent> = {}): StructuredContent {
  const bodyPlain = '공식 자료에서 확인한 안전한 정보입니다. '.repeat(120);
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: '공식 자료 확인 가이드',
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml: bodyPlain,
    bodyPlain,
    content: bodyPlain,
    headings: [
      { title: '핵심 정보', content: '상세 정보', summary: '', keywords: [], imagePrompt: '' },
      { title: '확인 사항', content: '상세 정보', summary: '', keywords: [], imagePrompt: '' },
      { title: '이용 팁', content: '상세 정보', summary: '', keywords: [], imagePrompt: '' },
    ],
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

function prepareV3(content = makeContent()): Readonly<{
  initial: StructuredContent;
  publishTicket: NonNullable<ReturnType<typeof forkContentQualityV3PublicationTicket>>;
}> {
  registerContentQualityV3GeneratedContent(content, {
    source: {
      contentMode: 'seo',
      rawText: '공식 자료에서 확인한 안전한 정보입니다.',
    },
    minimumBodyChars: 1_500,
  });
  const generationTicket = beginContentQualityV3Publication(content);
  if (!generationTicket) throw new Error('expected generation ticket');
  const publishTicket = forkContentQualityV3PublicationTicket(generationTicket);
  if (!publishTicket) throw new Error('expected publish ticket');
  const initial = enforceContentQualityV3PublicationBoundary(content, generationTicket) as StructuredContent;
  return Object.freeze({ initial, publishTicket });
}

function createStore(nowRef = { value: 10_000 }): ContentQualityV3PublishHandoffStore {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'v3-handoff-store-'));
  registryDirectories.push(userDataPath);
  return new ContentQualityV3PublishHandoffStore({
    now: () => nowRef.value,
    ttlMs: 60_000,
    maxActiveRecords: 8,
    maxTombstones: 16,
    provenanceRegistry: new ContentQualityV3DurableProvenanceRegistry({
      userDataPath,
      now: () => nowRef.value,
    }),
  });
}

describe('Content Quality V3 main-process publish handoff', () => {
  it('keeps strict provenance when required markers are stripped but postId/handoff remain', () => {
    expect(hasContentQualityV3ProvenanceSignal({
      _contentQualityV3Required: false,
      _contentQualityV3PostId: 'post-id-still-present',
      _contentQualityV3PublishHandoff: Object.freeze({ handle: 'opaque' }),
      structuredContent: { _contentQualityV3Required: false },
    })).toBe(true);
    expect(hasContentQualityV3ProvenanceSignal({
      title: 'legacy',
      content: 'legacy body',
    })).toBe(false);
  });

  it('re-runs the trusted factual boundary over the renderer-edited final content', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const { postId, handoff } = await store.issue('renderer:1:frame:1', prepared.initial, prepared.publishTicket);
    const mutated = {
      ...prepared.initial,
      bodyPlain: '외부 변조된 현재 가격은 USD 999입니다.',
      content: '외부 변조된 현재 가격은 USD 999입니다.',
    };

    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1',
      postId,
      required: true,
      handoff,
      candidate: mutated,
      publishMode: 'publish',
    })).rejects.toThrow('[content-quality-v3-publication] factual_unsupported_important_number');
  });

  it('accepts a valid unchanged V3 candidate once and freezes the canonical result', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const { postId, handoff } = await store.issue('renderer:1:frame:1', prepared.initial, prepared.publishTicket);

    const result = await store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1',
      postId,
      required: true,
      handoff,
      candidate: structuredClone(prepared.initial),
      publishMode: 'publish',
    });

    expect(result).toEqual(prepared.initial);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('blocks handle and marker stripping instead of downgrading an outstanding V3 owner to legacy', async () => {
    const prepared = prepareV3();
    const store = createStore();
    await store.issue('renderer:1:frame:1', prepared.initial, prepared.publishTicket);

    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1',
      candidate: structuredClone(prepared.initial),
      publishMode: 'publish',
    })).rejects.toThrow('missing_provenance');
  });

  it('rejects forged, owner-swapped, identity-mismatched, replayed, and expired handoffs', async () => {
    const nowRef = { value: 10_000 };
    const prepared = prepareV3();
    const store = createStore(nowRef);
    const { postId, handoff } = await store.issue('renderer:1:frame:1', prepared.initial, prepared.publishTicket);
    const forged = {
      handle: 'v3h_forged',
      publicationIdentity: handoff.publicationIdentity,
      originalContentSha256: handoff.originalContentSha256,
    } as ContentQualityV3PublishHandoff;

    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1', postId, required: true, handoff: forged, candidate: prepared.initial, publishMode: 'publish',
    })).rejects.toThrow('[content-quality-v3-publish-handoff] untrusted_handoff');
    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:2:frame:1', postId, required: true, handoff, candidate: prepared.initial, publishMode: 'publish',
    })).rejects.toThrow('[content-quality-v3-publish-handoff] owner_mismatch');
    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1',
      postId,
      required: true,
      handoff: { ...handoff, publicationIdentity: `${handoff.publicationIdentity}x` },
      candidate: prepared.initial,
      publishMode: 'publish',
    })).rejects.toThrow('provenance_mismatch');
    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1',
      postId,
      required: true,
      handoff: { ...handoff, originalContentSha256: '0'.repeat(64) },
      candidate: prepared.initial,
      publishMode: 'publish',
    })).rejects.toThrow('provenance_mismatch');

    await store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1', postId, required: true, handoff, candidate: prepared.initial, publishMode: 'publish',
    });
    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1', postId, required: true, handoff, candidate: prepared.initial, publishMode: 'publish',
    })).rejects.toThrow('replayed_provenance');

    const next = prepareV3();
    const expiring = await store.issue('renderer:3:frame:1', next.initial, next.publishTicket);
    nowRef.value += 60_001;
    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:3:frame:1', postId: expiring.postId, required: true, handoff: expiring.handoff, candidate: next.initial, publishMode: 'publish',
    })).rejects.toThrow('[content-quality-v3-publish-handoff] expired_handoff');
  });

  it('marks a superseded owner handle stale instead of silently overwriting it', async () => {
    const first = prepareV3();
    const second = prepareV3(makeContent({ selectedTitle: '두 번째 가이드' }));
    const store = createStore();
    const stale = await store.issue('renderer:1:frame:1', first.initial, first.publishTicket);
    const current = await store.issue('renderer:1:frame:1', second.initial, second.publishTicket);

    expect(current.handoff.handle).not.toBe(stale.handoff.handle);
    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1', postId: stale.postId, required: true, handoff: stale.handoff, candidate: first.initial, publishMode: 'publish',
    })).rejects.toThrow('[content-quality-v3-publish-handoff] superseded_handoff');
  });

  it('supports account-specific child handoffs without sharing a one-shot capability', async () => {
    const first = prepareV3();
    const second = prepareV3();
    const store = createStore();
    const accountA = await store.issue('multi:run-1:account-a', first.initial, first.publishTicket);
    const accountB = await store.issue('multi:run-1:account-b', second.initial, second.publishTicket);

    await expect(store.enforceAtPublish({
      ownerKey: 'multi:run-1:account-a', postId: accountA.postId, required: true, handoff: accountA.handoff, candidate: first.initial, publishMode: 'publish',
    })).resolves.toEqual(first.initial);
    await expect(store.enforceAtPublish({
      ownerKey: 'multi:run-1:account-b', postId: accountB.postId, required: true, handoff: accountB.handoff, candidate: second.initial, publishMode: 'publish',
    })).resolves.toEqual(second.initial);
  });

  it('fails closed for local app scheduling but leaves pure legacy payloads reference-exact', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const { postId, handoff } = await store.issue('renderer:1:frame:1', prepared.initial, prepared.publishTicket);
    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:1:frame:1',
      postId,
      required: true,
      handoff,
      candidate: prepared.initial,
      publishMode: 'schedule',
      scheduleType: 'app-schedule',
    })).rejects.toThrow('[content-quality-v3-publish-handoff] app_schedule_unsupported');

    const legacyBody = 'Distinct legacy content that never passed through V3. '.repeat(80);
    const legacy = makeContent({
      selectedTitle: 'Distinct legacy title',
      bodyPlain: legacyBody,
      content: legacyBody,
    });
    await expect(store.enforceAtPublish({
      ownerKey: 'legacy:renderer', candidate: legacy, publishMode: 'publish',
    })).resolves.toBe(legacy);
  });

  it('keeps a plain legacy title/content payload reference-exact when structuredContent is absent', async () => {
    const store = createStore();
    const payload = {
      title: 'Plain legacy title',
      content: 'Plain legacy body that did not originate from V3.',
      structuredContent: undefined,
      publishMode: 'publish',
      _contentQualityV3PublishOwnerKey: 'renderer:legacy-plain:frame:1',
    };

    await expect(enforceContentQualityV3PublishPayload(store, payload, { consume: false }))
      .resolves.toBe(payload);
  });

  it('guards the exact final top-level publish body and canonicalizes all duplicated payload fields', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const ownerKey = 'renderer:1:frame:1';
    const { postId, handoff } = await store.issue(ownerKey, prepared.initial, prepared.publishTicket);
    const payload = {
      title: prepared.initial.selectedTitle,
      content: '외부 변조된 현재 가격은 USD 999입니다.',
      lines: ['외부 변조된 현재 가격은 USD 999입니다.'],
      structuredContent: structuredClone(prepared.initial),
      publishMode: 'publish',
      _contentQualityV3PublishOwnerKey: ownerKey,
      _contentQualityV3PostId: postId,
      _contentQualityV3Required: true,
      _contentQualityV3PublishHandoff: handoff,
    };

    await expect(enforceContentQualityV3PublishPayload(store, payload))
      .rejects.toThrow('[content-quality-v3-publication] factual_unsupported_important_number');
  });

  it('rejects renderer accessors without invoking them', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const ownerKey = 'renderer:accessor:frame:1';
    const { postId, handoff } = await store.issue(ownerKey, prepared.initial, prepared.publishTicket);
    let getterCalls = 0;
    const malicious = { ...structuredClone(prepared.initial) } as Record<string, unknown>;
    Object.defineProperty(malicious, 'bodyPlain', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return '외부 변조';
      },
    });

    await expect(enforceContentQualityV3PublishPayload(store, {
      title: prepared.initial.selectedTitle,
      content: prepared.initial.bodyPlain,
      structuredContent: malicious,
      publishMode: 'publish',
      _contentQualityV3PublishOwnerKey: ownerKey,
      _contentQualityV3PostId: postId,
      _contentQualityV3Required: true,
      _contentQualityV3PublishHandoff: handoff,
    })).rejects.toThrow('[content-quality-v3-publish-handoff] untrusted_handoff');
    expect(getterCalls).toBe(0);
  });

  it('keeps downgrade protection after consume until a trusted legacy generation releases the owner', async () => {
    const prepared = prepareV3();
    const store = createStore();
    const ownerKey = 'renderer:lifecycle:frame:1';
    const { postId, handoff } = await store.issue(ownerKey, prepared.initial, prepared.publishTicket);
    await store.enforceAtPublish({ ownerKey, postId, required: true, handoff, candidate: prepared.initial, publishMode: 'publish' });

    const legacyBody = 'Trusted legacy generation after the V3 lifecycle. '.repeat(80);
    const legacy = makeContent({
      selectedTitle: 'Trusted legacy lifecycle title',
      bodyPlain: legacyBody,
      content: legacyBody,
    });
    await expect(store.enforceAtPublish({ ownerKey, candidate: legacy, publishMode: 'publish' }))
      .rejects.toThrow('[content-quality-v3-publish-handoff] missing_handoff');
    await store.releaseOwner(ownerKey);
    await expect(store.enforceAtPublish({ ownerKey, candidate: legacy, publishMode: 'publish' }))
      .resolves.toBe(legacy);
  });

  it('fails closed on a durable V3-required marker when the persisted descriptor is missing', async () => {
    const store = createStore();
    const legacyShapedPayload = {
      title: 'Reloaded title',
      content: '외부 변조된 현재 가격은 USD 999입니다.',
      structuredContent: {
        ...makeContent(),
        _contentQualityV3Required: true,
      },
      publishMode: 'publish',
      _contentQualityV3PublishOwnerKey: 'renderer:restart:frame:1',
    };

    await expect(enforceContentQualityV3PublishPayload(store, legacyShapedPayload))
      .rejects.toThrow('provenance_mismatch');
  });
});
