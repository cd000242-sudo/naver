import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import type { AppConfig } from '../../configManager.js';
import {
  createMcpConnectionRegistry,
  normalizeMcpRuntimeConnectionMaterial,
  type McpConnectionProfile,
  type McpRuntimeConnectionMaterial,
  type McpRouteSelection,
} from '../../generation/mcp/index.js';
import { sanitizeUserVisibleError } from '../../runtime/userVisibleError.js';
import {
  getMcpConnectionMaterial,
  getMcpRuntimeForConfig,
  listConfiguredMcpProfileIds,
  removeMcpConnectionMaterial,
  saveMcpConnectionMaterial,
} from '../services/mcpRuntimeHost.js';

export interface McpHandlerContext {
  readonly trustedRendererPath: string;
  readonly loadConfig: () => Promise<AppConfig>;
  readonly saveConfig: (config: AppConfig) => Promise<AppConfig>;
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function assertTrustedSender(event: IpcMainInvokeEvent, trustedRendererPath: string): void {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender?.mainFrame) {
    throw codedError('MCP_UNTRUSTED_SENDER', '신뢰할 수 없는 화면의 MCP 요청을 차단했습니다.');
  }
  try {
    const url = new URL(frame.url || event.sender.getURL());
    if (url.protocol !== 'file:') throw new Error('non-file renderer');
    const senderPath = path.normalize(fileURLToPath(url)).toLowerCase();
    if (senderPath !== path.normalize(trustedRendererPath).toLowerCase()) throw new Error('unexpected path');
  } catch {
    throw codedError('MCP_UNTRUSTED_SENDER', '신뢰할 수 없는 화면의 MCP 요청을 차단했습니다.');
  }
}

function validatePair(payload: unknown): {
  profile: McpConnectionProfile;
  material: McpRuntimeConnectionMaterial;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw codedError('MCP_INVALID_INPUT', 'MCP 연결 정보가 올바르지 않습니다.');
  }
  const record = payload as Record<string, unknown>;
  const registry = createMcpConnectionRegistry([record.profile]);
  const profile = registry.profiles[0];
  const material = normalizeMcpRuntimeConnectionMaterial(
    record.material as McpRuntimeConnectionMaterial,
  );
  if (profile.profileId !== material.profileId || profile.transport !== material.transport) {
    throw codedError('MCP_INVALID_INPUT', 'MCP 공개 설정과 보안 연결 정보가 일치하지 않습니다.');
  }
  return { profile, material };
}

function isConnectorInUse(config: AppConfig, connectorId: string): boolean {
  const routes = config.generationConnectionSettings;
  return [routes?.text, routes?.image, routes?.vision]
    .some((route) => route?.mode === 'mcp' && route.connectorId === connectorId);
}

function failure(error: unknown) {
  return {
    success: false as const,
    code: typeof (error as any)?.code === 'string' ? (error as any).code : 'MCP_OPERATION_FAILED',
    message: sanitizeUserVisibleError(error),
  };
}

export function registerMcpHandlers(context: McpHandlerContext): void {
  const trustedRendererPath = path.resolve(context.trustedRendererPath);

  ipcMain.handle('mcp:list-connections', async (event) => {
    try {
      assertTrustedSender(event, trustedRendererPath);
      const config = await context.loadConfig();
      const configuredProfileIds = await listConfiguredMcpProfileIds();
      return {
        success: true,
        profiles: config.mcpConnectionProfiles ?? [],
        configuredProfileIds,
      };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('mcp:save-connection', async (event, payload: unknown) => {
    try {
      assertTrustedSender(event, trustedRendererPath);
      const { profile, material } = validatePair(payload);
      const config = await context.loadConfig();
      const previousMaterial = await getMcpConnectionMaterial(profile.profileId);
      const currentProfiles = config.mcpConnectionProfiles ?? [];
      const nextProfiles = currentProfiles.filter((entry) => (
        entry.profileId !== profile.profileId && entry.connectorId !== profile.connectorId
      ));
      const validatedProfiles = createMcpConnectionRegistry([...nextProfiles, profile]).profiles;

      await saveMcpConnectionMaterial(material);
      try {
        await context.saveConfig({ ...config, mcpConnectionProfiles: validatedProfiles });
      } catch (error) {
        if (previousMaterial) await saveMcpConnectionMaterial(previousMaterial);
        else await removeMcpConnectionMaterial(profile.profileId);
        throw error;
      }
      return { success: true, profile };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('mcp:test-connection', async (event, route: McpRouteSelection) => {
    try {
      assertTrustedSender(event, trustedRendererPath);
      const config = await context.loadConfig();
      const runtime = await getMcpRuntimeForConfig(config);
      const result = await runtime.checkRoute(route);
      return { success: true, ...result, paidToolInvoked: false };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('mcp:remove-connection', async (event, profileId: unknown) => {
    try {
      assertTrustedSender(event, trustedRendererPath);
      if (typeof profileId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(profileId)) {
        throw codedError('MCP_INVALID_INPUT', 'MCP 프로필 ID가 올바르지 않습니다.');
      }
      const config = await context.loadConfig();
      const profile = (config.mcpConnectionProfiles ?? []).find((entry) => entry.profileId === profileId);
      if (!profile) return { success: true, removed: false };
      if (isConnectorInUse(config, profile.connectorId)) {
        throw codedError(
          'MCP_CONNECTION_IN_USE',
          '현재 선택된 MCP 경로입니다. 먼저 글·이미지 경로를 직접 변경한 뒤 삭제해 주세요.',
        );
      }
      const nextProfiles = (config.mcpConnectionProfiles ?? []).filter((entry) => entry.profileId !== profileId);
      await context.saveConfig({ ...config, mcpConnectionProfiles: nextProfiles });
      await removeMcpConnectionMaterial(profileId);
      return { success: true, removed: true };
    } catch (error) {
      return failure(error);
    }
  });
}
