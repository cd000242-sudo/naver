import { app } from 'electron';
import path from 'path';
import type { AppConfig } from '../../configManager.js';
import {
  createMcpConnectionMaterialStore,
  createMcpRuntimeService,
  createOfficialMcpRuntimeClientFactory,
  type McpConnectionMaterialStore,
  type McpRuntimeConnectionMaterial,
  type McpRuntimeManager,
  type McpRuntimeService,
} from '../../generation/mcp/index.js';
import {
  decryptString,
  encryptString,
  isEncrypted,
} from '../../security/safeStorageWrapper.js';

let materialStore: McpConnectionMaterialStore | undefined;
let runtimeService: McpRuntimeService | undefined;

function getMaterialStore(): McpConnectionMaterialStore {
  if (!materialStore) {
    materialStore = createMcpConnectionMaterialStore({
      filePath: path.join(app.getPath('userData'), 'mcp-connections.secure.json'),
      codec: { encryptString, decryptString, isEncrypted },
    });
  }
  return materialStore;
}

function getRuntimeService(): McpRuntimeService {
  if (!runtimeService) {
    runtimeService = createMcpRuntimeService({
      materialStore: getMaterialStore(),
      clientFactory: createOfficialMcpRuntimeClientFactory(),
    });
  }
  return runtimeService;
}

export async function getMcpRuntimeForConfig(config: AppConfig): Promise<McpRuntimeManager> {
  return getRuntimeService().getRuntime(config.mcpConnectionProfiles ?? []);
}

export async function listConfiguredMcpProfileIds(): Promise<readonly string[]> {
  const materials = await getMaterialStore().loadAll();
  return Object.freeze(materials.map((material) => material.profileId));
}

export async function getMcpConnectionMaterial(
  profileId: string,
): Promise<McpRuntimeConnectionMaterial | undefined> {
  return getMaterialStore().get(profileId);
}

export async function saveMcpConnectionMaterial(
  material: McpRuntimeConnectionMaterial,
): Promise<void> {
  await getMaterialStore().set(material);
  await getRuntimeService().invalidate();
}

export async function removeMcpConnectionMaterial(profileId: string): Promise<void> {
  await getMaterialStore().remove(profileId);
  await getRuntimeService().invalidate();
}

export async function closeMcpRuntimeHost(): Promise<void> {
  if (runtimeService) await runtimeService.close();
}
