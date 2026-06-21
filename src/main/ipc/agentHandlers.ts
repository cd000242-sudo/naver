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

  // 자동 설치 (npm i -g) — 사용자 옵트인. 완료까지 대기 후 결과 반환.
  ipcMain.handle('agent:install', async (_event, provider: AgentProvider) => {
    try {
      const { installAgent } = await import('../../agentCli/installer.js');
      const result = await installAgent(provider);
      return { success: true, ...result };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return { success: false, code: e?.code, message: e?.message ?? '설치 중 오류가 발생했습니다.' };
    }
  });

  // 구독 로그인 (브라우저 OAuth) — 완료까지 대기 후 결과 반환.
  ipcMain.handle('agent:login', async (_event, provider: AgentProvider) => {
    try {
      const { loginAgent } = await import('../../agentCli/installer.js');
      await loginAgent(provider);
      return { success: true };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return { success: false, code: e?.code, message: e?.message ?? '로그인 중 오류가 발생했습니다.' };
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
