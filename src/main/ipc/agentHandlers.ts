// src/main/ipc/agentHandlers.ts
// Agent CLI IPC handlers — the renderer cannot spawn processes, so it reaches the
// codex/claude CLIs through these main-process channels.

import { ipcMain } from 'electron';
import type { AgentProvider } from '../../agentCli/types.js';

interface AgentGeneratePayload {
  provider: AgentProvider;
  prompt: string;
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
}

/**
 * Register agent:status and agent:generate.
 * Dynamic import keeps the CLI service out of the startup path (loaded only on first use).
 */
export function registerAgentHandlers(): void {
  // Install / login status for the engine-selector badge.
  ipcMain.handle('agent:status', async (_event, provider: AgentProvider) => {
    try {
      const { detectAgent } = await import('../../agentCli/index.js');
      const status = await detectAgent(provider);
      return { success: true, status };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  });

  // One-shot generation. Errors carry a stable code so the renderer can show the right modal.
  ipcMain.handle('agent:generate', async (_event, payload: AgentGeneratePayload) => {
    try {
      const { generateWithAgent } = await import('../../agentCli/index.js');
      const result = await generateWithAgent({
        provider: payload?.provider,
        prompt: payload?.prompt,
        schema: payload?.schema,
        model: payload?.model,
        timeoutMs: payload?.timeoutMs,
      });
      return { success: true, ...result };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return { success: false, code: e?.code, message: e?.message ?? '에이전트 생성 중 오류가 발생했습니다.' };
    }
  });
}
