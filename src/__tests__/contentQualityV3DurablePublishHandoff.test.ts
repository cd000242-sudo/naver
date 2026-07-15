import { promises as fs } from 'node:fs';
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
  CONTENT_QUALITY_V3_PROVENANCE_FILENAME,
  ContentQualityV3DurableProvenanceRegistry,
} from '../contentQualityV3/durableProvenanceRegistry.js';
import {
  ContentQualityV3PublishHandoffStore,
  enforceContentQualityV3PublishPayload,
} from '../contentQualityV3/publishHandoffStore.js';

const directories: string[] = [];

async function directory(): Promise<string> {
  const result = await fs.mkdtemp(path.join(os.tmpdir(), 'v3-durable-handoff-'));
  directories.push(result);
  return result;
}

function makeContent(): StructuredContent {
  const bodyPlain = 'Official source provides safe and accurate information. '.repeat(80);
  return {
    status: 'success', generationTime: '1s', selectedTitle: 'Official information guide',
    titleAlternatives: [], titleCandidates: [], bodyHtml: bodyPlain, bodyPlain, content: bodyPlain,
    headings: [
      { title: 'One', content: 'Detail', summary: '', keywords: [], imagePrompt: '' },
      { title: 'Two', content: 'Detail', summary: '', keywords: [], imagePrompt: '' },
      { title: 'Three', content: 'Detail', summary: '', keywords: [], imagePrompt: '' },
    ],
    hashtags: [], images: [],
    metadata: {
      category: 'general', targetAge: 'all', urgency: 'evergreen', estimatedReadTime: '3m',
      wordCount: bodyPlain.length, aiDetectionRisk: 'low', legalRisk: 'safe', seoScore: 90,
      keywordStrategy: 'natural', publishTimeRecommend: '',
    },
    quality: {
      aiDetectionRisk: 'low', legalRisk: 'safe', seoScore: 90, originalityScore: 90,
      readabilityScore: 90, warnings: [],
    },
  };
}

function prepare() {
  const generated = makeContent();
  registerContentQualityV3GeneratedContent(generated, {
    source: { contentMode: 'seo', rawText: generated.bodyPlain },
    minimumBodyChars: 1_500,
  });
  const generationTicket = beginContentQualityV3Publication(generated);
  const publishTicket = forkContentQualityV3PublicationTicket(generationTicket);
  if (!generationTicket || !publishTicket) throw new Error('expected tickets');
  const initial = enforceContentQualityV3PublicationBoundary(generated, generationTicket) as StructuredContent;
  return { initial, publishTicket };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(item => fs.rm(item, { recursive: true, force: true })));
});

describe('durable V3 publish handoff integration', () => {
  it('persists provenance before returning a main-issued postId and handoff', async () => {
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: await directory() });
    const store = new ContentQualityV3PublishHandoffStore({ provenanceRegistry: registry });
    const prepared = prepare();

    const issued = await store.issue('renderer:1:frame:1', prepared.initial, prepared.publishTicket);

    expect(issued.postId).toMatch(/^v3d_/);
    expect(issued.handoff.handle).toMatch(/^v3h_/);
    await expect(store.previewAtPublish({
      ownerKey: 'renderer:1:frame:1',
      postId: issued.postId,
      required: true,
      handoff: issued.handoff,
      candidate: structuredClone(prepared.initial),
    })).resolves.toEqual(prepared.initial);
  });

  it('blocks marker+descriptor stripping with a retained postId even when the body changed', async () => {
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: await directory() });
    const store = new ContentQualityV3PublishHandoffStore({ provenanceRegistry: registry });
    const prepared = prepare();
    const issued = await store.issue('renderer:2:frame:1', prepared.initial, prepared.publishTicket);

    await expect(enforceContentQualityV3PublishPayload(store, {
      title: prepared.initial.selectedTitle,
      content: 'Renderer changed body and removed both V3 keys.',
      structuredContent: { ...prepared.initial, _contentQualityV3PostId: issued.postId },
      _contentQualityV3PublishOwnerKey: 'renderer:2:frame:1',
      publishMode: 'publish',
    }, { consume: false })).rejects.toThrow('missing_provenance');
  });

  it('blocks a stale descriptor after restart through the durable registry', async () => {
    const userDataPath = await directory();
    const firstRegistry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath });
    const firstStore = new ContentQualityV3PublishHandoffStore({ provenanceRegistry: firstRegistry });
    const prepared = prepare();
    const issued = await firstStore.issue('renderer:3:frame:1', prepared.initial, prepared.publishTicket);
    const restarted = new ContentQualityV3PublishHandoffStore({
      provenanceRegistry: new ContentQualityV3DurableProvenanceRegistry({ userDataPath }),
    });

    await expect(restarted.previewAtPublish({
      ownerKey: 'renderer:restart:frame:1',
      postId: issued.postId,
      required: true,
      handoff: issued.handoff,
      candidate: structuredClone(prepared.initial),
    })).rejects.toThrow('expired_provenance');
  });

  it('serializes concurrent same-owner issuance and durably supersedes every stale result', async () => {
    const userDataPath = await directory();
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath,
      maxActiveEntries: 1,
      maxConsumedEntries: 8,
    });
    const store = new ContentQualityV3PublishHandoffStore({
      maxActiveRecords: 1,
      provenanceRegistry: registry,
    });
    const firstPrepared = prepare();
    const secondPrepared = prepare();

    const [stale, current] = await Promise.all([
      store.issue('renderer:race:frame:1', firstPrepared.initial, firstPrepared.publishTicket),
      store.issue('renderer:race:frame:1', secondPrepared.initial, secondPrepared.publishTicket),
    ]);

    await expect(store.previewAtPublish({
      ownerKey: 'renderer:race:frame:1',
      postId: stale.postId,
      required: true,
      handoff: stale.handoff,
      candidate: firstPrepared.initial,
    })).rejects.toThrow('superseded_handoff');
    await expect(store.previewAtPublish({
      ownerKey: 'renderer:race:frame:1',
      postId: current.postId,
      required: true,
      handoff: current.handoff,
      candidate: secondPrepared.initial,
    })).resolves.toEqual(secondPrepared.initial);

    const persisted = JSON.parse(await fs.readFile(
      path.join(userDataPath, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    ));
    expect(persisted.entries.map((entry: { state: string }) => entry.state)).toEqual([
      'superseded',
      'active',
    ]);
  });

  it('rejects owner-capacity overflow before durable registration so no orphan is persisted', async () => {
    const userDataPath = await directory();
    const store = new ContentQualityV3PublishHandoffStore({
      maxOwnerStates: 1,
      provenanceRegistry: new ContentQualityV3DurableProvenanceRegistry({ userDataPath }),
    });
    const firstPrepared = prepare();
    const rejectedPrepared = prepare();

    await store.issue('renderer:owner:a', firstPrepared.initial, firstPrepared.publishTicket);
    await expect(store.issue(
      'renderer:owner:b',
      rejectedPrepared.initial,
      rejectedPrepared.publishTicket,
    )).rejects.toThrow('invalid_handoff_state');

    const persisted = JSON.parse(await fs.readFile(
      path.join(userDataPath, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    ));
    expect(persisted.entries).toHaveLength(1);
    expect(persisted.entries[0].state).toBe('active');
  });

  it('durably cancels an explicitly released owner and keeps it blocked after restart', async () => {
    const userDataPath = await directory();
    const store = new ContentQualityV3PublishHandoffStore({
      provenanceRegistry: new ContentQualityV3DurableProvenanceRegistry({ userDataPath }),
    });
    const prepared = prepare();
    const issued = await store.issue('renderer:release:frame:1', prepared.initial, prepared.publishTicket);

    await store.releaseOwner('renderer:release:frame:1');

    const restarted = new ContentQualityV3DurableProvenanceRegistry({ userDataPath });
    await expect(restarted.inspectPublish({
      postId: issued.postId,
      required: true,
      handoff: issued.handoff,
      content: {
        title: prepared.initial.selectedTitle,
        body: prepared.initial.bodyPlain,
      },
    })).rejects.toMatchObject({ issueCode: 'cancelled_provenance' });
  });

  it('keeps a draft active, then consumes it once only when the same V3 draft is published', async () => {
    const userDataPath = await directory();
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath });
    const store = new ContentQualityV3PublishHandoffStore({ provenanceRegistry: registry });
    const prepared = prepare();
    const issued = await store.issue('renderer:draft:frame:1', prepared.initial, prepared.publishTicket);

    await expect(store.previewAtPublish({
      ownerKey: 'renderer:draft:frame:1',
      postId: issued.postId,
      required: true,
      handoff: issued.handoff,
      candidate: prepared.initial,
      publishMode: 'draft',
    })).resolves.toEqual(prepared.initial);
    const persistedDraft = JSON.parse(await fs.readFile(
      path.join(userDataPath, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    ));
    expect(persistedDraft.entries).toContainEqual(expect.objectContaining({
      postId: issued.postId,
      state: 'active',
    }));

    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:draft:frame:1',
      postId: issued.postId,
      required: true,
      handoff: issued.handoff,
      candidate: prepared.initial,
      publishMode: 'publish',
    })).resolves.toEqual(prepared.initial);
    await expect(store.enforceAtPublish({
      ownerKey: 'renderer:draft:frame:1',
      postId: issued.postId,
      required: true,
      handoff: issued.handoff,
      candidate: prepared.initial,
      publishMode: 'publish',
    })).rejects.toThrow('replayed_provenance');
  });
});
