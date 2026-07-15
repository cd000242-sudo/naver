import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BaselineManifestError,
  compareBaselineManifests,
  createBaselineManifest,
  serializeBaselineManifest,
  type BaselineManifest,
} from '../contentQualityV3/baselineManifest';

const tempRoots: string[] = [];

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'content-quality-baseline-'));
  tempRoots.push(root);
  return root;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function expectBaselineError(error: unknown, code: string): boolean {
  expect(error).toBeInstanceOf(BaselineManifestError);
  expect((error as BaselineManifestError).code).toBe(code);
  expect((error as Error).message).toBe(code);
  return true;
}

function makeManifest(files: BaselineManifest['files']): BaselineManifest {
  return {
    schemaVersion: 1,
    algorithm: 'sha256',
    files,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

describe('createBaselineManifest', () => {
  it('hashes bytes, normalizes paths, sorts entries, and deeply freezes the manifest', async () => {
    const root = await createWorkspace();
    await mkdir(join(root, 'prompts'));
    await writeFile(join(root, 'zeta.ts'), '한글');
    await writeFile(join(root, 'prompts', 'alpha.md'), 'alpha\n');
    const allowlist = Object.freeze(['zeta.ts', 'prompts\\alpha.md']);

    const manifest = await createBaselineManifest({ workspaceRoot: root, relativePaths: allowlist });

    expect(manifest).toEqual({
      schemaVersion: 1,
      algorithm: 'sha256',
      files: [
        { path: 'prompts/alpha.md', sha256: sha256('alpha\n'), bytes: 6 },
        { path: 'zeta.ts', sha256: sha256('한글'), bytes: Buffer.byteLength('한글') },
      ],
    });
    expect(allowlist).toEqual(['zeta.ts', 'prompts\\alpha.md']);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.files)).toBe(true);
    expect(manifest.files.every(Object.isFrozen)).toBe(true);
  });

  it('includes only explicitly injected, frozen provenance metadata', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'prompt.md'), 'safe');

    const withoutMetadata = await createBaselineManifest({
      workspaceRoot: root,
      relativePaths: ['prompt.md'],
    });
    const withMetadata = await createBaselineManifest({
      workspaceRoot: root,
      relativePaths: ['prompt.md'],
      metadata: {
        repositoryHead: '0123456789abcdef0123456789abcdef01234567',
        nodeVersion: 'v22.7.4',
        platform: 'win32',
      },
    });

    expect(withoutMetadata).not.toHaveProperty('metadata');
    expect(withMetadata.metadata).toEqual({
      repositoryHead: '0123456789abcdef0123456789abcdef01234567',
      nodeVersion: 'v22.7.4',
      platform: 'win32',
    });
    expect(Object.isFrozen(withMetadata.metadata)).toBe(true);
  });

  it.each([
    ['', 'BASELINE_INVALID_PATH'],
    ['.', 'BASELINE_INVALID_PATH'],
    ['alpha//beta.ts', 'BASELINE_INVALID_PATH'],
    ['alpha/./beta.ts', 'BASELINE_INVALID_PATH'],
    [' alpha.ts', 'BASELINE_INVALID_PATH'],
    ['alpha.ts.', 'BASELINE_INVALID_PATH'],
    ['NUL.txt', 'BASELINE_INVALID_PATH'],
    ['nested/COM1', 'BASELINE_INVALID_PATH'],
    ['../secret.txt', 'BASELINE_PATH_OUTSIDE_ROOT'],
    ['alpha/../../secret.txt', 'BASELINE_PATH_OUTSIDE_ROOT'],
    ['/absolute.txt', 'BASELINE_PATH_OUTSIDE_ROOT'],
    ['C:\\secret.txt', 'BASELINE_PATH_OUTSIDE_ROOT'],
    ['C:secret.txt', 'BASELINE_PATH_OUTSIDE_ROOT'],
    ['\\\\server\\share\\secret.txt', 'BASELINE_PATH_OUTSIDE_ROOT'],
    ['alpha\0beta.ts', 'BASELINE_INVALID_PATH'],
  ])('fails closed for abnormal allowlist path %j', async (relativePath, code) => {
    const root = await createWorkspace();

    await expect(
      createBaselineManifest({ workspaceRoot: root, relativePaths: [relativePath] }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, code));
  });

  it('rejects duplicates after POSIX normalization', async () => {
    const root = await createWorkspace();
    await mkdir(join(root, 'prompts'));
    await writeFile(join(root, 'prompts', 'seo.md'), 'seo');

    await expect(
      createBaselineManifest({
        workspaceRoot: root,
        relativePaths: ['prompts/seo.md', 'prompts\\seo.md'],
      }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_DUPLICATE_PATH'));
  });

  it('rejects case aliases as non-portable duplicate paths', async () => {
    const root = await createWorkspace();

    await expect(
      createBaselineManifest({ workspaceRoot: root, relativePaths: ['Prompt.md', 'prompt.md'] }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_DUPLICATE_PATH'));
  });

  it('rejects missing files and directories without leaking an absolute path', async () => {
    const root = await createWorkspace();
    await mkdir(join(root, 'directory'));

    await expect(
      createBaselineManifest({ workspaceRoot: root, relativePaths: ['missing.md'] }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_FILE_MISSING'));
    await expect(
      createBaselineManifest({ workspaceRoot: root, relativePaths: ['directory'] }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_NOT_A_FILE'));
  });

  it('rejects a symlink in any allowlisted path component', async () => {
    const root = await createWorkspace();
    const target = join(root, 'target');
    await mkdir(target);
    await writeFile(join(target, 'prompt.md'), 'prompt');
    await symlink(target, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');

    await expect(
      createBaselineManifest({ workspaceRoot: root, relativePaths: ['linked/prompt.md'] }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_SYMLINK_NOT_ALLOWED'));
  });

  it('rejects a symlink workspace root', async () => {
    const parent = await createWorkspace();
    const target = join(parent, 'target');
    const linkedRoot = join(parent, 'linked-root');
    await mkdir(target);
    await writeFile(join(target, 'prompt.md'), 'prompt');
    await symlink(target, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');

    await expect(
      createBaselineManifest({ workspaceRoot: linkedRoot, relativePaths: ['prompt.md'] }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_SYMLINK_NOT_ALLOWED'));
  });

  it('rejects invalid roots, empty allowlists, and malformed metadata with stable codes', async () => {
    const root = await createWorkspace();
    const fileRoot = join(root, 'file.txt');
    await writeFile(fileRoot, 'not a directory');

    await expect(
      createBaselineManifest({ workspaceRoot: 'relative-root', relativePaths: ['a.ts'] }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_INVALID_ROOT'));
    await expect(
      createBaselineManifest({ workspaceRoot: fileRoot, relativePaths: ['a.ts'] }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_ROOT_NOT_DIRECTORY'));
    await expect(
      createBaselineManifest({ workspaceRoot: root, relativePaths: [] }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_EMPTY_ALLOWLIST'));
    await expect(
      createBaselineManifest({
        workspaceRoot: root,
        relativePaths: ['a.ts'],
        metadata: { repositoryHead: 'definitely-not-a-git-hash' },
      }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_INVALID_METADATA'));
  });

  it.each([
    [{ extra: 'not-allowed' }, 'unknown key'],
    [{ nodeVersion: 'latest' }, 'invalid Node version'],
    [{ platform: 'windows' }, 'invalid Node platform'],
    [{ repositoryHead: 123 }, 'non-string repository HEAD'],
  ])('rejects malformed metadata (%s: %s)', async (metadata) => {
    const root = await createWorkspace();

    await expect(
      createBaselineManifest({
        workspaceRoot: root,
        relativePaths: ['prompt.md'],
        metadata: metadata as any,
      }),
    ).rejects.toSatisfy((error: unknown) => expectBaselineError(error, 'BASELINE_INVALID_METADATA'));
  });

  it('omits an explicitly empty metadata object', async () => {
    const root = await createWorkspace();
    await writeFile(join(root, 'prompt.md'), 'prompt');

    const manifest = await createBaselineManifest({
      workspaceRoot: root,
      relativePaths: ['prompt.md'],
      metadata: {},
    });

    expect(manifest).not.toHaveProperty('metadata');
  });
});

describe('serializeBaselineManifest', () => {
  it('produces deterministic canonical JSON and excludes content, absolute paths, and ambient secrets', async () => {
    const root = await createWorkspace();
    const secret = 'TOP_SECRET_DO_NOT_SERIALIZE';
    await writeFile(join(root, 'prompt.md'), secret);
    const previous = process.env.BASELINE_MANIFEST_TEST_SECRET;
    process.env.BASELINE_MANIFEST_TEST_SECRET = 'ENV_SECRET_DO_NOT_SERIALIZE';

    try {
      const manifest = await createBaselineManifest({ workspaceRoot: root, relativePaths: ['prompt.md'] });
      const serialized = serializeBaselineManifest(manifest);

      expect(serialized).toBe(
        `{"algorithm":"sha256","files":[{"bytes":27,"path":"prompt.md","sha256":"${sha256(secret)}"}],"schemaVersion":1}`,
      );
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain('ENV_SECRET_DO_NOT_SERIALIZE');
    } finally {
      if (previous === undefined) delete process.env.BASELINE_MANIFEST_TEST_SECRET;
      else process.env.BASELINE_MANIFEST_TEST_SECRET = previous;
    }
  });

  it('canonicalizes file and metadata key order regardless of caller object order', () => {
    const manifest = {
      files: [{ sha256: 'a'.repeat(64), path: 'z.ts', bytes: 3 }],
      metadata: { platform: 'linux', repositoryHead: 'b'.repeat(40), nodeVersion: 'v22.7.4' },
      algorithm: 'sha256',
      schemaVersion: 1,
    } as BaselineManifest;

    expect(serializeBaselineManifest(manifest)).toBe(
      `{"algorithm":"sha256","files":[{"bytes":3,"path":"z.ts","sha256":"${'a'.repeat(64)}"}],"metadata":{"nodeVersion":"v22.7.4","platform":"linux","repositoryHead":"${'b'.repeat(40)}"},"schemaVersion":1}`,
    );
  });

  it('fails closed for a malformed manifest instead of serializing unexpected fields', () => {
    const malformed = {
      schemaVersion: 1,
      algorithm: 'sha256',
      files: [{ path: '../secret', sha256: 'x', bytes: -1 }],
      secret: 'must-not-serialize',
    } as unknown as BaselineManifest;

    expect(() => serializeBaselineManifest(malformed)).toThrowError(BaselineManifestError);
    try {
      serializeBaselineManifest(malformed);
    } catch (error) {
      expectBaselineError(error, 'BASELINE_INVALID_MANIFEST');
    }
  });

  it.each([
    [{ schemaVersion: 2, algorithm: 'sha256', files: [] }, 'invalid schema'],
    [{ schemaVersion: 1, algorithm: 'md5', files: [] }, 'invalid algorithm'],
    [{ schemaVersion: 1, algorithm: 'sha256', files: [] }, 'empty files'],
    [{
      schemaVersion: 1,
      algorithm: 'sha256',
      files: [{ path: 'prompt.md', sha256: 'short', bytes: 1 }],
    }, 'invalid hash'],
    [{ schemaVersion: 1, algorithm: 'sha256', files: [null] }, 'invalid file record'],
    [{
      schemaVersion: 1,
      algorithm: 'sha256',
      files: [{ path: 'prompt.md', sha256: 'a'.repeat(64), bytes: -1 }],
    }, 'invalid byte count'],
    [{
      schemaVersion: 1,
      algorithm: 'sha256',
      files: [{ path: 'prompt.md', sha256: 'a'.repeat(64), bytes: -0 }],
    }, 'negative zero byte count'],
    [{
      schemaVersion: 1,
      algorithm: 'sha256',
      files: [{ path: '../secret.md', sha256: 'a'.repeat(64), bytes: 1 }],
    }, 'escaping path'],
    [{
      schemaVersion: 1,
      algorithm: 'sha256',
      files: [{ path: 'prompt.md', sha256: 'a'.repeat(64), bytes: 1 }],
      metadata: { platform: 'windows' },
    }, 'invalid metadata'],
  ])('rejects %s (%s) with one stable manifest code', (malformed) => {
    try {
      serializeBaselineManifest(malformed as unknown as BaselineManifest);
      throw new Error('expected serialization to fail');
    } catch (error) {
      expectBaselineError(error, 'BASELINE_INVALID_MANIFEST');
    }
  });

  it('rejects sparse file arrays instead of serializing holes as null', () => {
    const files = new Array(1) as BaselineManifest['files'];
    const sparse = { schemaVersion: 1, algorithm: 'sha256', files } as BaselineManifest;

    try {
      serializeBaselineManifest(sparse);
      throw new Error('expected serialization to fail');
    } catch (error) {
      expectBaselineError(error, 'BASELINE_INVALID_MANIFEST');
    }
  });
});

describe('compareBaselineManifests', () => {
  it('reports sorted added, removed, and changed paths using stable codes without raw hashes', () => {
    const expected = makeManifest([
      { path: 'changed.ts', sha256: 'a'.repeat(64), bytes: 1 },
      { path: 'removed.ts', sha256: 'b'.repeat(64), bytes: 2 },
    ]);
    const actual = makeManifest([
      { path: 'added.ts', sha256: 'c'.repeat(64), bytes: 3 },
      { path: 'changed.ts', sha256: 'd'.repeat(64), bytes: 1 },
    ]);

    const comparison = compareBaselineManifests(expected, actual);

    expect(comparison).toEqual({
      matches: false,
      code: 'BASELINE_DRIFT',
      added: [{ path: 'added.ts', code: 'BASELINE_FILE_ADDED' }],
      removed: [{ path: 'removed.ts', code: 'BASELINE_FILE_REMOVED' }],
      changed: [{ path: 'changed.ts', code: 'BASELINE_FILE_CHANGED' }],
    });
    expect(JSON.stringify(comparison)).not.toContain('a'.repeat(64));
    expect(Object.isFrozen(comparison)).toBe(true);
    expect(Object.isFrozen(comparison.added)).toBe(true);
    expect(comparison.added.every(Object.isFrozen)).toBe(true);
  });

  it('returns an immutable match and ignores optional provenance metadata', () => {
    const files = [{ path: 'same.ts', sha256: 'a'.repeat(64), bytes: 1 }] as const;
    const expected: BaselineManifest = {
      ...makeManifest(files),
      metadata: { repositoryHead: 'b'.repeat(40), nodeVersion: 'v20.1.0', platform: 'linux' },
    };
    const actual: BaselineManifest = {
      ...makeManifest(files),
      metadata: { repositoryHead: 'c'.repeat(40), nodeVersion: 'v22.7.4', platform: 'win32' },
    };

    expect(compareBaselineManifests(expected, actual)).toEqual({
      matches: true,
      code: 'BASELINE_MATCH',
      added: [],
      removed: [],
      changed: [],
    });
  });

  it('treats a byte-count difference as changed even if a forged hash matches', () => {
    const hash = 'a'.repeat(64);
    const expected = makeManifest([{ path: 'same.ts', sha256: hash, bytes: 1 }]);
    const actual = makeManifest([{ path: 'same.ts', sha256: hash, bytes: 2 }]);

    expect(compareBaselineManifests(expected, actual).changed).toEqual([
      { path: 'same.ts', code: 'BASELINE_FILE_CHANGED' },
    ]);
  });

  it('fails closed when either compared manifest is malformed', () => {
    const valid = makeManifest([{ path: 'same.ts', sha256: 'a'.repeat(64), bytes: 1 }]);
    const malformed = makeManifest([
      { path: 'same.ts', sha256: 'a'.repeat(64), bytes: 1 },
      { path: 'same.ts', sha256: 'b'.repeat(64), bytes: 1 },
    ]);

    expect(() => compareBaselineManifests(valid, malformed)).toThrowError(BaselineManifestError);
    try {
      compareBaselineManifests(valid, malformed);
    } catch (error) {
      expectBaselineError(error, 'BASELINE_INVALID_MANIFEST');
    }
  });
});
