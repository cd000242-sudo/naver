import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  normalizeMcpRuntimeConnectionMaterial,
  type McpRuntimeConnectionMaterial,
} from './runtime.js';

const VAULT_VERSION = 1 as const;
const MAX_PROFILES = 32;

export type McpConnectionMaterialStoreErrorCode =
  | 'MCP_VAULT_INVALID'
  | 'MCP_VAULT_NOT_ENCRYPTED'
  | 'MCP_VAULT_ENCRYPTION_FAILED'
  | 'MCP_VAULT_DECRYPTION_FAILED'
  | 'MCP_VAULT_DUPLICATE_PROFILE';

const MESSAGES: Readonly<Record<McpConnectionMaterialStoreErrorCode, string>> = Object.freeze({
  MCP_VAULT_INVALID: 'MCP 보안 연결 저장소가 손상되었거나 올바르지 않습니다.',
  MCP_VAULT_NOT_ENCRYPTED: '평문 MCP 연결 저장소는 허용되지 않습니다. 연결 정보를 다시 저장해 주세요.',
  MCP_VAULT_ENCRYPTION_FAILED: 'OS 보안 저장소로 MCP 연결 정보를 암호화하지 못했습니다.',
  MCP_VAULT_DECRYPTION_FAILED: 'OS 보안 저장소에서 MCP 연결 정보를 복호화하지 못했습니다.',
  MCP_VAULT_DUPLICATE_PROFILE: '동일한 MCP 연결 프로필을 두 번 저장할 수 없습니다.',
});

export class McpConnectionMaterialStoreError extends Error {
  readonly code: McpConnectionMaterialStoreErrorCode;

  constructor(code: McpConnectionMaterialStoreErrorCode) {
    super(MESSAGES[code]);
    this.name = 'McpConnectionMaterialStoreError';
    this.code = code;
  }
}

export interface McpConnectionMaterialCodec {
  encryptString(plaintext: string): string;
  decryptString(stored: string): string;
  isEncrypted(stored: string): boolean;
}

export interface McpConnectionMaterialStore {
  loadAll(): Promise<readonly McpRuntimeConnectionMaterial[]>;
  saveAll(materials: readonly McpRuntimeConnectionMaterial[]): Promise<void>;
  get(profileId: string): Promise<McpRuntimeConnectionMaterial | undefined>;
  set(material: McpRuntimeConnectionMaterial): Promise<void>;
  remove(profileId: string): Promise<void>;
}

export interface CreateMcpConnectionMaterialStoreOptions {
  readonly filePath: string;
  readonly codec: McpConnectionMaterialCodec;
}

function cloneMaterials(input: unknown): readonly McpRuntimeConnectionMaterial[] {
  if (!Array.isArray(input) || input.length > MAX_PROFILES) {
    throw new McpConnectionMaterialStoreError('MCP_VAULT_INVALID');
  }
  const profileIds = new Set<string>();
  const materials = input.map((entry) => {
    const material = normalizeMcpRuntimeConnectionMaterial(
      entry as McpRuntimeConnectionMaterial,
    );
    if (profileIds.has(material.profileId)) {
      throw new McpConnectionMaterialStoreError('MCP_VAULT_DUPLICATE_PROFILE');
    }
    profileIds.add(material.profileId);
    return material;
  });
  return Object.freeze(materials);
}

function parseVaultEnvelope(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new McpConnectionMaterialStoreError('MCP_VAULT_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new McpConnectionMaterialStoreError('MCP_VAULT_INVALID');
  }
  const record = parsed as Record<string, unknown>;
  const fields = Object.keys(record).sort();
  if (fields.length !== 2
    || fields[0] !== 'encryptedPayload'
    || fields[1] !== 'version'
    || record.version !== VAULT_VERSION
    || typeof record.encryptedPayload !== 'string') {
    throw new McpConnectionMaterialStoreError('MCP_VAULT_INVALID');
  }
  return record.encryptedPayload;
}

export function createMcpConnectionMaterialStore(
  options: CreateMcpConnectionMaterialStoreOptions,
): McpConnectionMaterialStore {
  const filePath = path.resolve(options.filePath);

  const loadAll = async (): Promise<readonly McpRuntimeConnectionMaterial[]> => {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') return Object.freeze([]);
      throw new McpConnectionMaterialStoreError('MCP_VAULT_INVALID');
    }

    const encryptedPayload = parseVaultEnvelope(raw);
    if (!options.codec.isEncrypted(encryptedPayload)) {
      throw new McpConnectionMaterialStoreError('MCP_VAULT_NOT_ENCRYPTED');
    }

    let plaintext: string;
    try {
      plaintext = options.codec.decryptString(encryptedPayload);
    } catch {
      throw new McpConnectionMaterialStoreError('MCP_VAULT_DECRYPTION_FAILED');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      throw new McpConnectionMaterialStoreError('MCP_VAULT_INVALID');
    }
    return cloneMaterials(parsed);
  };

  const saveAll = async (input: readonly McpRuntimeConnectionMaterial[]): Promise<void> => {
    const materials = cloneMaterials(input);
    let encryptedPayload: string;
    try {
      encryptedPayload = options.codec.encryptString(JSON.stringify(materials));
    } catch {
      throw new McpConnectionMaterialStoreError('MCP_VAULT_ENCRYPTION_FAILED');
    }
    if (!options.codec.isEncrypted(encryptedPayload)) {
      throw new McpConnectionMaterialStoreError('MCP_VAULT_ENCRYPTION_FAILED');
    }

    const directory = path.dirname(filePath);
    const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.writeFile(
        temporaryPath,
        JSON.stringify({ version: VAULT_VERSION, encryptedPayload }),
        { encoding: 'utf8', mode: 0o600 },
      );
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  };

  const store: McpConnectionMaterialStore = {
    loadAll,
    saveAll,
    get: async (profileId) => {
      const materials = await loadAll();
      return materials.find((material) => material.profileId === profileId);
    },
    set: async (material) => {
      const normalized = normalizeMcpRuntimeConnectionMaterial(material);
      const materials = await loadAll();
      const next = materials.filter((entry) => entry.profileId !== normalized.profileId);
      await saveAll([...next, normalized]);
    },
    remove: async (profileId) => {
      const materials = await loadAll();
      const next = materials.filter((material) => material.profileId !== profileId);
      if (next.length !== materials.length) await saveAll(next);
    },
  };
  return Object.freeze(store);
}
