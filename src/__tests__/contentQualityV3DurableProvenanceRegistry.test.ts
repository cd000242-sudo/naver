import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME,
  CONTENT_QUALITY_V3_PROVENANCE_FILENAME,
  ContentQualityV3DurableProvenanceError,
  ContentQualityV3DurableProvenanceRegistry,
  hashContentQualityV3CanonicalTitleBody,
} from '../contentQualityV3/durableProvenanceRegistry.js';

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'content-quality-v3-provenance-'));
  tempDirectories.push(directory);
  return directory;
}

function handoff(seed = 'a') {
  const shaSeed = (seed.charCodeAt(0) % 16).toString(16);
  return Object.freeze({
    handle: `v3h_${seed.repeat(43)}`,
    publicationIdentity: `v3p_${seed.repeat(43)}`,
    originalContentSha256: shaSeed.repeat(64),
  });
}

function content(seed = 'A') {
  return Object.freeze({
    selectedTitle: `${seed} title`,
    bodyPlain: `${seed} body\r\nsecond line`,
  });
}

function indexedToken(index: number): string {
  return index.toString(36).padStart(43, '0');
}

function indexedHandoff(index: number) {
  const token = indexedToken(index);
  return Object.freeze({
    handle: `v3h_${token}`,
    publicationIdentity: `v3p_${token}`,
    originalContentSha256: index.toString(16).padStart(64, '0'),
  });
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(directory => (
    fs.rm(directory, { recursive: true, force: true })
  )));
});

describe('Content Quality V3 durable provenance registry', () => {
  it('persists an exact bounded v1 record without source, evidence, ticket, title, or body', async () => {
    const directory = await createTempDirectory();
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });

    const issued = await registry.registerIssued({ handoff: handoff(), content: content() });
    const raw = await fs.readFile(path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME), 'utf8');
    const parsed = JSON.parse(raw);

    expect(issued.postId).toMatch(/^v3d_[A-Za-z0-9_-]{43}$/);
    expect(Object.keys(parsed)).toEqual(['version', 'sequence', 'entries']);
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toHaveLength(1);
    expect(Object.keys(parsed.entries[0])).toEqual([
      'postId',
      'publicationIdentity',
      'originalContentSha256',
      'canonicalTitleBodySha256',
      'state',
      'revision',
      'createdAtMs',
      'updatedAtMs',
    ]);
    expect(raw).not.toContain('A title');
    expect(raw).not.toContain('A body');
    expect(raw).not.toContain('rawText');
    expect(raw).not.toContain('evidence');
    expect(raw).not.toContain('ticket');
    expect(await fs.readFile(
      path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME),
      'utf8',
    )).toBe(raw);
  });

  it('normalizes only NFC and CRLF before hashing length-prefixed title/body bytes', () => {
    const composed = hashContentQualityV3CanonicalTitleBody({
      title: '\u00e9',
      body: 'line 1\r\nline 2',
    });
    const decomposed = hashContentQualityV3CanonicalTitleBody({
      title: 'e\u0301',
      body: 'line 1\nline 2',
    });
    const whitespaceChanged = hashContentQualityV3CanonicalTitleBody({
      title: ' \u00e9',
      body: 'line 1\nline 2',
    });

    expect(composed).toBe(decomposed);
    expect(whitespaceChanged).not.toBe(composed);
  });

  it('recognizes deleted renderer metadata by postId or unchanged canonical reverse hash', async () => {
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: await createTempDirectory(),
    });
    const sourceHandoff = handoff('b');
    const sourceContent = content('B');
    const issued = await registry.registerIssued({ handoff: sourceHandoff, content: sourceContent });

    await expect(registry.inspectPublish({
      postId: issued.postId,
      required: false,
      content: { title: 'changed title', body: 'changed body' },
    })).rejects.toMatchObject({ issueCode: 'missing_provenance' });

    await expect(registry.inspectPublish({
      required: true,
      handoff: sourceHandoff,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'missing_provenance' });

    await expect(registry.inspectPublish({
      required: false,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'missing_provenance' });
  });

  it('documents the information limit: all signals plus changed content is a reference-exact legacy miss', async () => {
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: await createTempDirectory(),
    });
    await registry.registerIssued({ handoff: handoff('c'), content: content('C') });
    const legacyPayload = Object.freeze({ title: 'unrelated legacy title', body: 'unrelated legacy body' });

    const result = await registry.inspectPublish({ required: false, content: legacyPayload });

    expect(result.kind).toBe('legacy');
    expect(result.content).toBe(legacyPayload);
  });

  it('requires every known signal to match and consumes its main-only permit once', async () => {
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: await createTempDirectory(),
    });
    const sourceHandoff = handoff('d');
    const sourceContent = content('D');
    const issued = await registry.registerIssued({ handoff: sourceHandoff, content: sourceContent });
    const validInput = {
      postId: issued.postId,
      required: true,
      handoff: sourceHandoff,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    } as const;

    await expect(registry.inspectPublish({ ...validInput, postId: `v3d_${'x'.repeat(43)}` }))
      .rejects.toMatchObject({ issueCode: 'provenance_mismatch' });
    await expect(registry.inspectPublish({
      ...validInput,
      handoff: { ...sourceHandoff, publicationIdentity: `v3p_${'e'.repeat(43)}` },
    })).rejects.toMatchObject({ issueCode: 'provenance_mismatch' });

    const permit = await registry.inspectPublish(validInput);
    expect(permit.kind).toBe('permit');
    await registry.beginPublish(permit);
    await expect(registry.beginPublish(permit)).rejects.toMatchObject({ issueCode: 'replayed_provenance' });
    await expect(registry.inspectPublish(validInput)).rejects.toMatchObject({
      issueCode: 'replayed_provenance',
    });
  });

  it('recovers a missing or corrupt primary from a strict backup and ignores leftover temp files', async () => {
    const directory = await createTempDirectory();
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });
    const sourceHandoff = handoff('f');
    const sourceContent = content('F');
    const issued = await registry.registerIssued({ handoff: sourceHandoff, content: sourceContent });
    const primaryPath = path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME);
    await fs.writeFile(primaryPath, '{broken', 'utf8');
    await fs.writeFile(path.join(directory, `${CONTENT_QUALITY_V3_PROVENANCE_FILENAME}.orphan.tmp`), '{broken', 'utf8');

    const restarted = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });
    await expect(restarted.inspectPublish({
      postId: issued.postId,
      required: true,
      handoff: sourceHandoff,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'expired_provenance' });

    expect(JSON.parse(await fs.readFile(primaryPath, 'utf8')).version).toBe(1);
    expect((await fs.readdir(directory)).some(name => name.endsWith('.tmp'))).toBe(false);
  });

  it('recovers the higher-sequence backup after an interrupted primary replacement', async () => {
    const directory = await createTempDirectory();
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });
    await registry.registerIssued({ handoff: handoff('n'), content: content('N') });
    const primaryPath = path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME);
    const olderPrimary = await fs.readFile(primaryPath, 'utf8');
    const latestHandoff = handoff('o');
    const latestContent = content('O');
    const latest = await registry.registerIssued({ handoff: latestHandoff, content: latestContent });
    await fs.writeFile(primaryPath, olderPrimary, 'utf8');

    const restarted = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });
    await expect(restarted.inspectPublish({
      postId: latest.postId,
      required: true,
      handoff: latestHandoff,
      content: { title: latestContent.selectedTitle, body: latestContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'expired_provenance' });
    expect(JSON.parse(await fs.readFile(primaryPath, 'utf8')).sequence).toBe(3);
  });

  it('fails closed when primary and backup have the same sequence but different canonical states', async () => {
    const firstDirectory = await createTempDirectory();
    const secondDirectory = await createTempDirectory();
    await new ContentQualityV3DurableProvenanceRegistry({ userDataPath: firstDirectory })
      .registerIssued({ handoff: handoff('u'), content: content('U') });
    await new ContentQualityV3DurableProvenanceRegistry({ userDataPath: secondDirectory })
      .registerIssued({ handoff: handoff('v'), content: content('V') });
    const primary = await fs.readFile(
      path.join(firstDirectory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    );
    const conflictingBackup = await fs.readFile(
      path.join(secondDirectory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    );
    expect(JSON.parse(primary).sequence).toBe(JSON.parse(conflictingBackup).sequence);
    await fs.writeFile(
      path.join(firstDirectory, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME),
      conflictingBackup,
      'utf8',
    );

    const restarted = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: firstDirectory,
    });
    await expect(restarted.inspectPublish({
      required: false,
      content: { title: 'legacy', body: 'legacy' },
    })).rejects.toMatchObject({ issueCode: 'invalid_registry' });
  });

  it('fails closed when existing primary and backup are both invalid or recovery is unavailable', async () => {
    const directory = await createTempDirectory();
    await fs.writeFile(path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME), '{broken', 'utf8');
    await fs.writeFile(path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME), '{}', 'utf8');
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });

    await expect(registry.inspectPublish({ required: false, content: content() }))
      .rejects.toBeInstanceOf(ContentQualityV3DurableProvenanceError);
    await expect(registry.inspectPublish({ required: false, content: content() }))
      .rejects.toMatchObject({ issueCode: 'invalid_registry' });
  });

  it('remains degraded and fail-closed after a caller contains corrupt startup recovery', async () => {
    const directory = await createTempDirectory();
    await Promise.all([
      fs.writeFile(path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME), '{broken', 'utf8'),
      fs.writeFile(path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME), '{}', 'utf8'),
    ]);
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });
    let bootContinued = false;
    try {
      await registry.beginSession();
    } catch {
      bootContinued = true;
    }

    expect(bootContinued).toBe(true);
    await expect(registry.inspectPublish({
      required: false,
      content: { title: 'legacy title', body: 'legacy body' },
    })).rejects.toMatchObject({ issueCode: 'invalid_registry' });
  });

  it('rejects sequence overflow before mutation and leaves both canonical files unchanged', async () => {
    const directory = await createTempDirectory();
    const raw = JSON.stringify({ version: 1, sequence: Number.MAX_SAFE_INTEGER, entries: [] });
    const primaryPath = path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME);
    const backupPath = path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME);
    await Promise.all([
      fs.writeFile(primaryPath, raw, 'utf8'),
      fs.writeFile(backupPath, raw, 'utf8'),
    ]);
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });

    await expect(registry.registerIssued({ handoff: handoff('z'), content: content('overflow') }))
      .rejects.toMatchObject({ issueCode: 'registry_capacity' });
    expect(await fs.readFile(primaryPath, 'utf8')).toBe(raw);
    expect(await fs.readFile(backupPath, 'utf8')).toBe(raw);
  });

  it('rejects active revision overflow during startup retirement without corrupting the registry', async () => {
    const directory = await createTempDirectory();
    const sourceHandoff = handoff('y');
    const sourceContent = content('revision-overflow');
    const raw = JSON.stringify({
      version: 1,
      sequence: 1,
      entries: [{
        postId: `v3d_${indexedToken(900)}`,
        publicationIdentity: sourceHandoff.publicationIdentity,
        originalContentSha256: sourceHandoff.originalContentSha256,
        canonicalTitleBodySha256: hashContentQualityV3CanonicalTitleBody({
          title: sourceContent.selectedTitle,
          body: sourceContent.bodyPlain,
        }),
        state: 'active',
        revision: Number.MAX_SAFE_INTEGER,
        createdAtMs: 1_000,
        updatedAtMs: 1_000,
      }],
    });
    const primaryPath = path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME);
    const backupPath = path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME);
    await Promise.all([
      fs.writeFile(primaryPath, raw, 'utf8'),
      fs.writeFile(backupPath, raw, 'utf8'),
    ]);
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      now: () => 2_000,
    });

    await expect(registry.beginSession())
      .rejects.toMatchObject({ issueCode: 'registry_capacity' });
    await expect(registry.inspectPublish({
      postId: `v3d_${indexedToken(900)}`,
      required: true,
      handoff: sourceHandoff,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'registry_capacity' });
    expect(await fs.readFile(primaryPath, 'utf8')).toBe(raw);
    expect(await fs.readFile(backupPath, 'utf8')).toBe(raw);
  });

  it('rejects future schemas, extra or missing keys, duplicate identities, and non-canonical JSON', async () => {
    const mutations: Array<(value: any) => string> = [
      value => JSON.stringify({ ...value, version: 2 }),
      value => JSON.stringify({ ...value, unexpected: true }),
      value => {
        const { sequence: _sequence, ...missing } = value;
        return JSON.stringify(missing);
      },
      value => JSON.stringify({ ...value, entries: [...value.entries, value.entries[0]] }),
      value => ` ${JSON.stringify(value)}`,
    ];

    for (const [index, mutate] of mutations.entries()) {
      const directory = await createTempDirectory();
      const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });
      await registry.registerIssued({ handoff: handoff(String(index + 1)), content: content(String(index + 1)) });
      const primaryPath = path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME);
      const backupPath = path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME);
      const parsed = JSON.parse(await fs.readFile(primaryPath, 'utf8'));
      const invalid = mutate(parsed);
      await Promise.all([
        fs.writeFile(primaryPath, invalid, 'utf8'),
        fs.writeFile(backupPath, invalid, 'utf8'),
      ]);

      const restarted = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });
      await expect(restarted.inspectPublish({ required: false, content: content('legacy') }))
        .rejects.toMatchObject({ issueCode: 'invalid_registry' });
    }
  });

  it('treats missing primary and backup as fresh only for a signal-free legacy control', async () => {
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: await createTempDirectory(),
    });
    const legacy = Object.freeze({ title: 'Fresh legacy', body: 'Fresh legacy body' });

    await expect(registry.inspectPublish({ required: false, content: legacy }))
      .resolves.toMatchObject({ kind: 'legacy', content: legacy });
    await expect(registry.inspectPublish({
      postId: `v3d_${'z'.repeat(43)}`,
      required: false,
      content: legacy,
    })).rejects.toMatchObject({ issueCode: 'provenance_mismatch' });
  });

  it('serializes concurrent immutable writes without dropping an entry', async () => {
    const directory = await createTempDirectory();
    let nextNow = 10_000;
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      now: () => nextNow++,
    });

    const issued = await Promise.all(Array.from({ length: 20 }, (_, index) => {
      const seed = String.fromCharCode(65 + index);
      return registry.registerIssued({ handoff: handoff(seed), content: content(seed) });
    }));
    const parsed = JSON.parse(await fs.readFile(
      path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    ));

    expect(new Set(issued.map(item => item.postId)).size).toBe(20);
    expect(parsed.entries).toHaveLength(20);
  });

  it('fails at active capacity without evicting any trusted record', async () => {
    const directory = await createTempDirectory();
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      maxActiveEntries: 2,
    });
    const first = await registry.registerIssued({ handoff: handoff('g'), content: content('G') });
    const second = await registry.registerIssued({ handoff: handoff('h'), content: content('H') });

    await expect(registry.registerIssued({ handoff: handoff('i'), content: content('I') }))
      .rejects.toMatchObject({ issueCode: 'registry_capacity' });
    const raw = JSON.parse(await fs.readFile(
      path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    ));
    expect(raw.entries.map((entry: { postId: string }) => entry.postId)).toEqual([
      first.postId,
      second.postId,
    ]);
  });

  it('retires prior-process active records on first load and immediately frees the active slot', async () => {
    const directory = await createTempDirectory();
    const first = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      maxActiveEntries: 1,
      maxConsumedEntries: 2,
    });
    const staleHandoff = handoff('p');
    const staleContent = content('P');
    const stale = await first.registerIssued({ handoff: staleHandoff, content: staleContent });

    const restarted = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      maxActiveEntries: 1,
      maxConsumedEntries: 2,
    });
    const current = await restarted.registerIssued({ handoff: handoff('q'), content: content('Q') });

    await expect(restarted.inspectPublish({
      postId: stale.postId,
      required: true,
      handoff: staleHandoff,
      content: { title: staleContent.selectedTitle, body: staleContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'expired_provenance' });
    await expect(restarted.inspectPublish({
      postId: current.postId,
      required: true,
      handoff: handoff('q'),
      content: { title: content('Q').selectedTitle, body: content('Q').bodyPlain },
    })).resolves.toMatchObject({ kind: 'permit' });
  });

  it('atomically compacts a saturated 4096-entry replay window and keeps publishing available', async () => {
    const directory = await createTempDirectory();
    const inactiveEntries = Array.from({ length: 4_096 }, (_, index) => ({
      postId: `v3d_${indexedToken(index)}`,
      publicationIdentity: indexedHandoff(index).publicationIdentity,
      originalContentSha256: indexedHandoff(index).originalContentSha256,
      canonicalTitleBodySha256: index.toString(16).padStart(64, '0'),
      state: 'consumed',
      revision: 2,
      createdAtMs: 1_000,
      updatedAtMs: 1_000,
    }));
    const staleIndex = 4_096;
    const staleHandoff = indexedHandoff(staleIndex);
    const staleContent = content('stale');
    const staleEntry = {
      postId: `v3d_${indexedToken(staleIndex)}`,
      publicationIdentity: staleHandoff.publicationIdentity,
      originalContentSha256: staleHandoff.originalContentSha256,
      canonicalTitleBodySha256: hashContentQualityV3CanonicalTitleBody({
        title: staleContent.selectedTitle,
        body: staleContent.bodyPlain,
      }),
      state: 'active',
      revision: 1,
      createdAtMs: 1_000,
      updatedAtMs: 1_000,
    };
    const raw = JSON.stringify({ version: 1, sequence: 7, entries: [...inactiveEntries, staleEntry] });
    await Promise.all([
      fs.writeFile(path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME), raw, 'utf8'),
      fs.writeFile(path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME), raw, 'utf8'),
    ]);

    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      now: () => 2_000,
    });
    await expect(registry.expireIssued(staleEntry.postId)).resolves.toBeUndefined();

    for (let index = 4_097; index < 4_103; index += 1) {
      const nextHandoff = indexedHandoff(index);
      const nextContent = content(String(index));
      const issued = await registry.registerIssued({ handoff: nextHandoff, content: nextContent });
      const permit = await registry.inspectPublish({
        postId: issued.postId,
        required: true,
        handoff: nextHandoff,
        content: { title: nextContent.selectedTitle, body: nextContent.bodyPlain },
      });
      if (permit.kind !== 'permit') throw new Error('expected permit');
      await expect(registry.beginPublish(permit)).resolves.toBeUndefined();
    }

    const evictedHandoff = indexedHandoff(0);
    await expect(registry.inspectPublish({
      postId: `v3d_${indexedToken(0)}`,
      required: true,
      handoff: evictedHandoff,
      content: { title: 'evicted', body: 'evicted' },
    })).rejects.toMatchObject({ issueCode: 'provenance_mismatch' });
    const persisted = JSON.parse(await fs.readFile(
      path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    ));
    expect(persisted.entries).toHaveLength(4_096);
    expect(persisted.entries.every((entry: { state: string }) => entry.state !== 'active')).toBe(true);
  });

  it('uses a locale-independent postId code-unit tie-breaker for equal-age compaction', async () => {
    const directory = await createTempDirectory();
    const tiedEntries = [10, 11].map(index => ({
      postId: `v3d_${indexedToken(index)}`,
      publicationIdentity: indexedHandoff(index).publicationIdentity,
      originalContentSha256: indexedHandoff(index).originalContentSha256,
      canonicalTitleBodySha256: index.toString(16).padStart(64, '0'),
      state: 'consumed',
      revision: 2,
      createdAtMs: 1_000,
      updatedAtMs: 1_000,
    }));
    const staleIndex = 12;
    const staleContent = content('tie-stale');
    const staleEntry = {
      postId: `v3d_${indexedToken(staleIndex)}`,
      publicationIdentity: indexedHandoff(staleIndex).publicationIdentity,
      originalContentSha256: indexedHandoff(staleIndex).originalContentSha256,
      canonicalTitleBodySha256: hashContentQualityV3CanonicalTitleBody({
        title: staleContent.selectedTitle,
        body: staleContent.bodyPlain,
      }),
      state: 'active',
      revision: 1,
      createdAtMs: 1_000,
      updatedAtMs: 1_000,
    };
    const raw = JSON.stringify({ version: 1, sequence: 1, entries: [...tiedEntries, staleEntry] });
    await Promise.all([
      fs.writeFile(path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME), raw, 'utf8'),
      fs.writeFile(path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_BACKUP_FILENAME), raw, 'utf8'),
    ]);
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      now: () => 2_000,
      maxActiveEntries: 1,
      maxConsumedEntries: 2,
    });
    await registry.beginSession();

    await expect(registry.inspectPublish({
      postId: `v3d_${indexedToken(10)}`,
      required: true,
      handoff: indexedHandoff(10),
      content: { title: 'evicted tie', body: 'evicted tie' },
    })).rejects.toMatchObject({ issueCode: 'provenance_mismatch' });
    await expect(registry.inspectPublish({
      postId: `v3d_${indexedToken(11)}`,
      required: true,
      handoff: indexedHandoff(11),
      content: { title: 'retained tie', body: 'retained tie' },
    })).rejects.toMatchObject({ issueCode: 'replayed_provenance' });
    await expect(registry.inspectPublish({
      postId: staleEntry.postId,
      required: true,
      handoff: indexedHandoff(staleIndex),
      content: { title: staleContent.selectedTitle, body: staleContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'expired_provenance' });
  });

  it('clamps mutation time across a clock rollback so a consumed registry restarts strictly', async () => {
    const directory = await createTempDirectory();
    const nowRef = { value: 10_000 };
    const sourceHandoff = handoff('a');
    const sourceContent = content('clock');
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      now: () => nowRef.value,
    });
    const issued = await registry.registerIssued({ handoff: sourceHandoff, content: sourceContent });
    const permit = await registry.inspectPublish({
      postId: issued.postId,
      required: true,
      handoff: sourceHandoff,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    });
    if (permit.kind !== 'permit') throw new Error('expected permit');
    nowRef.value = 1_000;
    await registry.beginPublish(permit);

    const restarted = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      now: () => nowRef.value,
    });
    await expect(restarted.inspectPublish({
      postId: issued.postId,
      required: true,
      handoff: sourceHandoff,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'replayed_provenance' });
  });

  it('retains the just-consumed tombstone when a rollback meets saturated capacity', async () => {
    const directory = await createTempDirectory();
    const nowRef = { value: 10_000 };
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      now: () => nowRef.value,
      maxActiveEntries: 1,
      maxConsumedEntries: 1,
    });
    const firstHandoff = handoff('b');
    const firstContent = content('first-clock');
    const first = await registry.registerIssued({ handoff: firstHandoff, content: firstContent });
    const firstPermit = await registry.inspectPublish({
      postId: first.postId,
      required: true,
      handoff: firstHandoff,
      content: { title: firstContent.selectedTitle, body: firstContent.bodyPlain },
    });
    if (firstPermit.kind !== 'permit') throw new Error('expected permit');
    await registry.beginPublish(firstPermit);

    nowRef.value = 1_000;
    const latestHandoff = handoff('c');
    const latestContent = content('latest-clock');
    const latest = await registry.registerIssued({ handoff: latestHandoff, content: latestContent });
    const latestPermit = await registry.inspectPublish({
      postId: latest.postId,
      required: true,
      handoff: latestHandoff,
      content: { title: latestContent.selectedTitle, body: latestContent.bodyPlain },
    });
    if (latestPermit.kind !== 'permit') throw new Error('expected permit');
    await registry.beginPublish(latestPermit);

    await expect(registry.inspectPublish({
      postId: latest.postId,
      required: true,
      handoff: latestHandoff,
      content: { title: latestContent.selectedTitle, body: latestContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'replayed_provenance' });
    await expect(registry.inspectPublish({
      postId: first.postId,
      required: true,
      handoff: firstHandoff,
      content: { title: firstContent.selectedTitle, body: firstContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'provenance_mismatch' });
  });

  it('atomically supersedes the previous active record while replacing at the active cap', async () => {
    const directory = await createTempDirectory();
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      maxActiveEntries: 1,
      maxConsumedEntries: 2,
    });
    const firstHandoff = handoff('q');
    const firstContent = content('Q');
    const first = await registry.registerIssued({ handoff: firstHandoff, content: firstContent });

    const secondHandoff = handoff('r');
    const secondContent = content('R');
    const second = await registry.replaceIssued({
      handoff: secondHandoff,
      content: secondContent,
      supersedePostId: first.postId,
    });

    const parsed = JSON.parse(await fs.readFile(
      path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    ));
    expect(parsed.entries.map((entry: { postId: string; state: string }) => ({
      postId: entry.postId,
      state: entry.state,
    }))).toEqual([
      { postId: first.postId, state: 'superseded' },
      { postId: second.postId, state: 'active' },
    ]);
    await expect(registry.inspectPublish({
      postId: first.postId,
      required: true,
      handoff: firstHandoff,
      content: { title: firstContent.selectedTitle, body: firstContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'superseded_provenance' });
    await expect(registry.inspectPublish({
      postId: second.postId,
      required: true,
      handoff: secondHandoff,
      content: { title: secondContent.selectedTitle, body: secondContent.bodyPlain },
    })).resolves.toMatchObject({ kind: 'permit' });
  });

  it('persists explicit cancellation and expiry as replay-protecting tombstones', async () => {
    const directory = await createTempDirectory();
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: directory });
    const cancelledHandoff = handoff('s');
    const expiredHandoff = handoff('t');
    const cancelledContent = content('S');
    const expiredContent = content('T');
    const cancelled = await registry.registerIssued({
      handoff: cancelledHandoff,
      content: cancelledContent,
    });
    const expired = await registry.registerIssued({
      handoff: expiredHandoff,
      content: expiredContent,
    });

    await registry.cancelIssued(cancelled.postId);
    await registry.expireIssued(expired.postId);

    await expect(registry.inspectPublish({
      postId: cancelled.postId,
      required: true,
      handoff: cancelledHandoff,
      content: { title: cancelledContent.selectedTitle, body: cancelledContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'cancelled_provenance' });
    await expect(registry.inspectPublish({
      postId: expired.postId,
      required: true,
      handoff: expiredHandoff,
      content: { title: expiredContent.selectedTitle, body: expiredContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'expired_provenance' });
  });

  it('compacts the oldest inactive record at capacity and prunes the remainder after retention', async () => {
    const directory = await createTempDirectory();
    const nowRef = { value: 1_000 };
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      now: () => nowRef.value,
      maxActiveEntries: 1,
      maxConsumedEntries: 1,
      consumedTtlMs: 100,
    });
    const firstHandoff = handoff('w');
    const firstContent = content('W');
    const first = await registry.registerIssued({ handoff: firstHandoff, content: firstContent });
    const firstPermit = await registry.inspectPublish({
      postId: first.postId,
      required: true,
      handoff: firstHandoff,
      content: { title: firstContent.selectedTitle, body: firstContent.bodyPlain },
    });
    if (firstPermit.kind !== 'permit') throw new Error('expected permit');
    await registry.beginPublish(firstPermit);

    const secondHandoff = handoff('x');
    const secondContent = content('X');
    const second = await registry.registerIssued({ handoff: secondHandoff, content: secondContent });
    const retainedPermit = await registry.inspectPublish({
      postId: second.postId,
      required: true,
      handoff: secondHandoff,
      content: { title: secondContent.selectedTitle, body: secondContent.bodyPlain },
    });
    if (retainedPermit.kind !== 'permit') throw new Error('expected permit');
    await expect(registry.beginPublish(retainedPermit)).resolves.toBeUndefined();
    const evictedRecord = { issued: first, handoff: firstHandoff, content: firstContent };
    const retainedRecord = { issued: second, handoff: secondHandoff, content: secondContent };
    await expect(registry.inspectPublish({
      postId: evictedRecord.issued.postId,
      required: true,
      handoff: evictedRecord.handoff,
      content: {
        title: evictedRecord.content.selectedTitle,
        body: evictedRecord.content.bodyPlain,
      },
    })).rejects.toMatchObject({ issueCode: 'provenance_mismatch' });
    await expect(registry.inspectPublish({
      postId: retainedRecord.issued.postId,
      required: true,
      handoff: retainedRecord.handoff,
      content: {
        title: retainedRecord.content.selectedTitle,
        body: retainedRecord.content.bodyPlain,
      },
    })).rejects.toMatchObject({ issueCode: 'replayed_provenance' });

    nowRef.value += 200;
    await expect(registry.registerIssued({ handoff: handoff('y'), content: content('Y') }))
      .resolves.toMatchObject({ postId: expect.stringMatching(/^v3d_/) });
    await expect(registry.inspectPublish({
      postId: retainedRecord.issued.postId,
      required: true,
      handoff: retainedRecord.handoff,
      content: {
        title: retainedRecord.content.selectedTitle,
        body: retainedRecord.content.bodyPlain,
      },
    })).rejects.toMatchObject({ issueCode: 'provenance_mismatch' });

    const parsed = JSON.parse(await fs.readFile(
      path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    ));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries.map((entry: { state: string }) => entry.state)).toEqual(['active']);
    expect(parsed.entries.some((entry: { postId: string }) => entry.postId === first.postId)).toBe(false);
  });

  it('turns expired records into bounded tombstones and never downgrades their postId or hash', async () => {
    const directory = await createTempDirectory();
    const nowRef = { value: 1_000 };
    const registry = new ContentQualityV3DurableProvenanceRegistry({
      userDataPath: directory,
      now: () => nowRef.value,
      activeTtlMs: 100,
      maxActiveEntries: 1,
      maxConsumedEntries: 1,
    });
    const sourceHandoff = handoff('k');
    const sourceContent = content('K');
    const issued = await registry.registerIssued({ handoff: sourceHandoff, content: sourceContent });
    nowRef.value += 102;

    await expect(registry.inspectPublish({
      postId: issued.postId,
      required: true,
      handoff: sourceHandoff,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'expired_provenance' });
    await expect(registry.inspectPublish({
      required: false,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'expired_provenance' });

    const second = await registry.registerIssued({ handoff: handoff('l'), content: content('L') });
    nowRef.value += 102;
    const third = await registry.registerIssued({ handoff: handoff('m'), content: content('M') });
    const parsed = JSON.parse(await fs.readFile(
      path.join(directory, CONTENT_QUALITY_V3_PROVENANCE_FILENAME),
      'utf8',
    ));
    expect(parsed.entries.map((entry: { state: string }) => entry.state)).toEqual([
      'expired',
      'active',
    ]);
    expect(parsed.entries.map((entry: { postId: string }) => entry.postId)).toEqual([
      second.postId,
      third.postId,
    ]);
    await expect(registry.inspectPublish({
      postId: issued.postId,
      required: true,
      handoff: sourceHandoff,
      content: { title: sourceContent.selectedTitle, body: sourceContent.bodyPlain },
    })).rejects.toMatchObject({ issueCode: 'provenance_mismatch' });
  });

  it('does not complete issuance when the atomic registry write fails', async () => {
    const directory = await createTempDirectory();
    const blocker = path.join(directory, 'not-a-directory');
    await fs.writeFile(blocker, 'block', 'utf8');
    const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath: blocker });

    await expect(registry.registerIssued({ handoff: handoff('j'), content: content('J') }))
      .rejects.toMatchObject({ issueCode: 'registry_io_failure' });
  });
});
