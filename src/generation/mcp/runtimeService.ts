import type { McpConnectionProfile } from './contracts.js';
import { createMcpConnectionRegistry } from './registry.js';
import {
  createMcpRuntimeManager,
  type McpRuntimeClientFactory,
  type McpRuntimeManager,
} from './runtime.js';
import type { McpConnectionMaterialStore } from './connectionMaterialStore.js';

export interface McpRuntimeService {
  getRuntime(profiles: readonly McpConnectionProfile[]): Promise<McpRuntimeManager>;
  invalidate(): Promise<void>;
  close(): Promise<void>;
}

export function createMcpRuntimeService(options: {
  readonly materialStore: McpConnectionMaterialStore;
  readonly clientFactory: McpRuntimeClientFactory;
}): McpRuntimeService {
  let active: { fingerprint: string; runtime: McpRuntimeManager } | undefined;

  const closeActive = async (): Promise<void> => {
    const previous = active;
    active = undefined;
    if (previous) await previous.runtime.close();
  };

  const service: McpRuntimeService = {
    getRuntime: async (profiles) => {
      const registry = createMcpConnectionRegistry(profiles);
      const fingerprint = JSON.stringify(registry.profiles);
      if (active?.fingerprint === fingerprint) return active.runtime;

      await closeActive();
      const runtime = createMcpRuntimeManager({
        registry,
        clientFactory: options.clientFactory,
        getConnectionMaterial: (profileId) => options.materialStore.get(profileId),
      });
      active = { fingerprint, runtime };
      return runtime;
    },
    invalidate: closeActive,
    close: closeActive,
  };
  return Object.freeze(service);
}
