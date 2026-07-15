import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';

export const BASELINE_MANIFEST_SCHEMA_VERSION = 1 as const;
export const BASELINE_MANIFEST_ALGORITHM = 'sha256' as const;

export type BaselineManifestErrorCode =
  | 'BASELINE_INVALID_ROOT'
  | 'BASELINE_ROOT_NOT_DIRECTORY'
  | 'BASELINE_EMPTY_ALLOWLIST'
  | 'BASELINE_INVALID_PATH'
  | 'BASELINE_PATH_OUTSIDE_ROOT'
  | 'BASELINE_DUPLICATE_PATH'
  | 'BASELINE_FILE_MISSING'
  | 'BASELINE_NOT_A_FILE'
  | 'BASELINE_SYMLINK_NOT_ALLOWED'
  | 'BASELINE_FILE_READ_FAILED'
  | 'BASELINE_INVALID_METADATA'
  | 'BASELINE_INVALID_MANIFEST';

export class BaselineManifestError extends Error {
  readonly code: BaselineManifestErrorCode;

  constructor(code: BaselineManifestErrorCode) {
    super(code);
    this.name = 'BaselineManifestError';
    this.code = code;
  }
}

export interface BaselineManifestMetadata {
  readonly repositoryHead?: string;
  readonly nodeVersion?: string;
  readonly platform?: NodeJS.Platform;
}

export interface BaselineManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface BaselineManifest {
  readonly schemaVersion: typeof BASELINE_MANIFEST_SCHEMA_VERSION;
  readonly algorithm: typeof BASELINE_MANIFEST_ALGORITHM;
  readonly files: readonly BaselineManifestFile[];
  readonly metadata?: BaselineManifestMetadata;
}

export interface CreateBaselineManifestInput {
  readonly workspaceRoot: string;
  readonly relativePaths: readonly string[];
  readonly metadata?: BaselineManifestMetadata;
}

export type BaselineManifestDiffCode =
  | 'BASELINE_FILE_ADDED'
  | 'BASELINE_FILE_REMOVED'
  | 'BASELINE_FILE_CHANGED';

export interface BaselineManifestDiffEntry {
  readonly path: string;
  readonly code: BaselineManifestDiffCode;
}

export interface BaselineManifestComparison {
  readonly matches: boolean;
  readonly code: 'BASELINE_MATCH' | 'BASELINE_DRIFT';
  readonly added: readonly BaselineManifestDiffEntry[];
  readonly removed: readonly BaselineManifestDiffEntry[];
  readonly changed: readonly BaselineManifestDiffEntry[];
}

const ALLOWED_METADATA_KEYS = Object.freeze(['nodeVersion', 'platform', 'repositoryHead'] as const);
const ALLOWED_PLATFORMS = new Set<NodeJS.Platform>([
  'aix',
  'android',
  'darwin',
  'freebsd',
  'haiku',
  'linux',
  'openbsd',
  'sunos',
  'win32',
  'cygwin',
  'netbsd',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REPOSITORY_HEAD_PATTERN = /^[a-f0-9]{7,64}$/i;
const NODE_VERSION_PATTERN = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const WINDOWS_FORBIDDEN_PATH_CHARACTER_PATTERN = /[<>:"|?*]/;
const WINDOWS_RESERVED_PATH_SEGMENT_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function fail(code: BaselineManifestErrorCode): never {
  throw new BaselineManifestError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && allowedKeys.includes(key));
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function portablePathIdentity(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

function isAbnormalPathSegment(segment: string): boolean {
  const windowsDeviceBase = segment.split('.', 1)[0].replace(/[ .]+$/g, '');
  return segment.length === 0
    || segment === '.'
    || segment !== segment.trim()
    || segment.endsWith('.')
    || WINDOWS_FORBIDDEN_PATH_CHARACTER_PATTERN.test(segment)
    || WINDOWS_RESERVED_PATH_SEGMENT_PATTERN.test(windowsDeviceBase);
}

function isDenseArray(values: readonly unknown[]): boolean {
  return Array.from(
    { length: values.length },
    (_, index) => Object.prototype.hasOwnProperty.call(values, index),
  ).every(Boolean);
}

function normalizeRelativePath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || CONTROL_CHARACTER_PATTERN.test(value)) {
    fail('BASELINE_INVALID_PATH');
  }

  if (
    isAbsolute(value)
    || win32.isAbsolute(value)
    || /^[A-Za-z]:/.test(value)
    || value.startsWith('/')
  ) {
    fail('BASELINE_PATH_OUTSIDE_ROOT');
  }

  const posixPath = value.replace(/\\/g, '/');
  const segments = posixPath.split('/');

  if (segments.some(segment => segment === '..')) {
    fail('BASELINE_PATH_OUTSIDE_ROOT');
  }
  if (segments.some(isAbnormalPathSegment)) {
    fail('BASELINE_INVALID_PATH');
  }

  return segments.join('/');
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot.length > 0 && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function isMissingFileError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.code === 'ENOENT' || error.code === 'ENOTDIR';
}

async function validateWorkspaceRoot(workspaceRoot: unknown): Promise<{ root: string; realRoot: string }> {
  if (
    typeof workspaceRoot !== 'string'
    || workspaceRoot.length === 0
    || CONTROL_CHARACTER_PATTERN.test(workspaceRoot)
    || !isAbsolute(workspaceRoot)
  ) {
    fail('BASELINE_INVALID_ROOT');
  }

  const root = resolve(workspaceRoot);
  let rootStats;
  try {
    rootStats = await lstat(root);
  } catch {
    fail('BASELINE_INVALID_ROOT');
  }

  if (rootStats.isSymbolicLink()) fail('BASELINE_SYMLINK_NOT_ALLOWED');
  if (!rootStats.isDirectory()) fail('BASELINE_ROOT_NOT_DIRECTORY');

  try {
    return { root, realRoot: await realpath(root) };
  } catch {
    fail('BASELINE_INVALID_ROOT');
  }
}

function normalizeMetadata(value: unknown): BaselineManifestMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasOnlyKeys(value, ALLOWED_METADATA_KEYS)) {
    fail('BASELINE_INVALID_METADATA');
  }

  const repositoryHead = value.repositoryHead;
  const nodeVersion = value.nodeVersion;
  const platform = value.platform;

  if (repositoryHead !== undefined && (
    typeof repositoryHead !== 'string' || !REPOSITORY_HEAD_PATTERN.test(repositoryHead)
  )) {
    fail('BASELINE_INVALID_METADATA');
  }
  if (nodeVersion !== undefined && (
    typeof nodeVersion !== 'string' || !NODE_VERSION_PATTERN.test(nodeVersion)
  )) {
    fail('BASELINE_INVALID_METADATA');
  }
  if (platform !== undefined && (
    typeof platform !== 'string' || !ALLOWED_PLATFORMS.has(platform as NodeJS.Platform)
  )) {
    fail('BASELINE_INVALID_METADATA');
  }

  const metadata = {
    ...(repositoryHead === undefined ? {} : { repositoryHead }),
    ...(nodeVersion === undefined ? {} : { nodeVersion }),
    ...(platform === undefined ? {} : { platform: platform as NodeJS.Platform }),
  };

  return Object.keys(metadata).length === 0 ? undefined : Object.freeze(metadata);
}

async function hashAllowlistedFile(
  root: string,
  realRoot: string,
  normalizedPath: string,
): Promise<BaselineManifestFile> {
  const segments = normalizedPath.split('/');
  const resolvedPath = resolve(root, ...segments);
  if (!isPathInsideRoot(root, resolvedPath)) fail('BASELINE_PATH_OUTSIDE_ROOT');

  let currentPath = root;
  for (const [index, segment] of segments.entries()) {
    currentPath = join(currentPath, segment);
    let stats;
    try {
      stats = await lstat(currentPath);
    } catch (error) {
      if (isMissingFileError(error)) fail('BASELINE_FILE_MISSING');
      fail('BASELINE_FILE_READ_FAILED');
    }

    if (stats.isSymbolicLink()) fail('BASELINE_SYMLINK_NOT_ALLOWED');
    const isFinalSegment = index === segments.length - 1;
    if ((!isFinalSegment && !stats.isDirectory()) || (isFinalSegment && !stats.isFile())) {
      fail('BASELINE_NOT_A_FILE');
    }
  }

  let canonicalPath: string;
  try {
    canonicalPath = await realpath(resolvedPath);
  } catch {
    fail('BASELINE_FILE_READ_FAILED');
  }
  if (!isPathInsideRoot(realRoot, canonicalPath)) fail('BASELINE_PATH_OUTSIDE_ROOT');

  let content: Buffer;
  try {
    content = await readFile(canonicalPath);
  } catch {
    fail('BASELINE_FILE_READ_FAILED');
  }

  return Object.freeze({
    path: normalizedPath,
    sha256: createHash(BASELINE_MANIFEST_ALGORITHM).update(content).digest('hex'),
    bytes: content.byteLength,
  });
}

function invalidManifest(): never {
  fail('BASELINE_INVALID_MANIFEST');
}

function canonicalizeManifest(value: unknown): BaselineManifest {
  try {
    if (!isRecord(value) || !hasOnlyKeys(value, ['algorithm', 'files', 'metadata', 'schemaVersion'])) {
      return invalidManifest();
    }
    if (
      value.schemaVersion !== BASELINE_MANIFEST_SCHEMA_VERSION
      || value.algorithm !== BASELINE_MANIFEST_ALGORITHM
      || !Array.isArray(value.files)
      || value.files.length === 0
      || !isDenseArray(value.files)
    ) {
      return invalidManifest();
    }

    const seenPaths = new Set<string>();
    const files = value.files.map(file => {
      if (!isRecord(file) || !hasOnlyKeys(file, ['bytes', 'path', 'sha256'])) {
        return invalidManifest();
      }
      const normalizedPath = normalizeRelativePath(file.path);
      const pathIdentity = portablePathIdentity(normalizedPath);
      if (normalizedPath !== file.path || seenPaths.has(pathIdentity)) return invalidManifest();
      if (
        typeof file.sha256 !== 'string'
        || !SHA256_PATTERN.test(file.sha256)
        || typeof file.bytes !== 'number'
        || !Number.isSafeInteger(file.bytes)
        || file.bytes < 0
        || Object.is(file.bytes, -0)
      ) {
        return invalidManifest();
      }

      seenPaths.add(pathIdentity);
      return Object.freeze({ path: normalizedPath, sha256: file.sha256, bytes: file.bytes });
    }).sort((left, right) => compareText(left.path, right.path));

    let metadata: BaselineManifestMetadata | undefined;
    try {
      metadata = normalizeMetadata(value.metadata);
    } catch {
      return invalidManifest();
    }

    return Object.freeze({
      schemaVersion: BASELINE_MANIFEST_SCHEMA_VERSION,
      algorithm: BASELINE_MANIFEST_ALGORITHM,
      files: Object.freeze(files),
      ...(metadata === undefined ? {} : { metadata }),
    });
  } catch (error) {
    if (error instanceof BaselineManifestError && error.code === 'BASELINE_INVALID_MANIFEST') {
      throw error;
    }
    return invalidManifest();
  }
}

export async function createBaselineManifest(
  input: Readonly<CreateBaselineManifestInput>,
): Promise<BaselineManifest> {
  if (!isRecord(input)) fail('BASELINE_INVALID_ROOT');
  if (!Array.isArray(input.relativePaths) || input.relativePaths.length === 0) {
    fail('BASELINE_EMPTY_ALLOWLIST');
  }

  const metadata = normalizeMetadata(input.metadata);
  const { root, realRoot } = await validateWorkspaceRoot(input.workspaceRoot);
  const normalizedPaths = input.relativePaths.map(normalizeRelativePath);
  const seenPaths = new Set<string>();
  for (const normalizedPath of normalizedPaths) {
    const pathIdentity = portablePathIdentity(normalizedPath);
    if (seenPaths.has(pathIdentity)) fail('BASELINE_DUPLICATE_PATH');
    seenPaths.add(pathIdentity);
  }

  const files: BaselineManifestFile[] = [];
  for (const normalizedPath of normalizedPaths) {
    files.push(await hashAllowlistedFile(root, realRoot, normalizedPath));
  }
  files.sort((left, right) => compareText(left.path, right.path));

  return Object.freeze({
    schemaVersion: BASELINE_MANIFEST_SCHEMA_VERSION,
    algorithm: BASELINE_MANIFEST_ALGORITHM,
    files: Object.freeze(files),
    ...(metadata === undefined ? {} : { metadata }),
  });
}

export function serializeBaselineManifest(manifest: BaselineManifest): string {
  const canonical = canonicalizeManifest(manifest);
  const serializable = {
    algorithm: canonical.algorithm,
    files: canonical.files.map(file => ({
      bytes: file.bytes,
      path: file.path,
      sha256: file.sha256,
    })),
    ...(canonical.metadata === undefined ? {} : {
      metadata: {
        ...(canonical.metadata.nodeVersion === undefined ? {} : {
          nodeVersion: canonical.metadata.nodeVersion,
        }),
        ...(canonical.metadata.platform === undefined ? {} : {
          platform: canonical.metadata.platform,
        }),
        ...(canonical.metadata.repositoryHead === undefined ? {} : {
          repositoryHead: canonical.metadata.repositoryHead,
        }),
      },
    }),
    schemaVersion: canonical.schemaVersion,
  };

  return JSON.stringify(serializable);
}

function freezeDiffEntry(path: string, code: BaselineManifestDiffCode): BaselineManifestDiffEntry {
  return Object.freeze({ path, code });
}

export function compareBaselineManifests(
  expectedManifest: BaselineManifest,
  actualManifest: BaselineManifest,
): BaselineManifestComparison {
  const expected = canonicalizeManifest(expectedManifest);
  const actual = canonicalizeManifest(actualManifest);
  const expectedByPath = new Map(expected.files.map(file => [file.path, file]));
  const actualByPath = new Map(actual.files.map(file => [file.path, file]));

  const added = actual.files
    .filter(file => !expectedByPath.has(file.path))
    .map(file => freezeDiffEntry(file.path, 'BASELINE_FILE_ADDED'));
  const removed = expected.files
    .filter(file => !actualByPath.has(file.path))
    .map(file => freezeDiffEntry(file.path, 'BASELINE_FILE_REMOVED'));
  const changed = expected.files
    .filter(expectedFile => {
      const actualFile = actualByPath.get(expectedFile.path);
      return actualFile !== undefined && (
        expectedFile.sha256 !== actualFile.sha256 || expectedFile.bytes !== actualFile.bytes
      );
    })
    .map(file => freezeDiffEntry(file.path, 'BASELINE_FILE_CHANGED'));
  const matches = added.length === 0 && removed.length === 0 && changed.length === 0;

  return Object.freeze({
    matches,
    code: matches ? 'BASELINE_MATCH' : 'BASELINE_DRIFT',
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    changed: Object.freeze(changed),
  });
}
