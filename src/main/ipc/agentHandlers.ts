// src/main/ipc/agentHandlers.ts
// Agent CLI IPC handlers — the renderer cannot spawn processes, so it reaches the
// codex/claude/gemini CLIs through these main-process channels.

import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { fileURLToPath } from 'url';
import { isAbsolute, resolve } from 'path';
import { randomUUID } from 'crypto';
import {
  normalizeAgentGenerateOptions,
  requireAgentProvider,
} from '../../agentCli/validation.js';
import { isAllowedAgentLoginUrl } from '../../agentCli/loginUrl.js';
import type { AgentProvider } from '../../agentCli/types.js';
import {
  assertAgentProviderAllowed,
  createAgentProductPolicyContext,
  getDisabledAgentStatus,
} from '../../agentCli/productPolicy.js';
import { sanitizeUserVisibleError } from '../../runtime/userVisibleError.js';

interface AgentGeneratePayload {
  provider: unknown;
  prompt: string;
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
}

interface RegisterAgentHandlerOptions {
  readonly trustedRendererPath: string;
  /** Explicitly true only for local development/tests. Omitted means fail-closed. */
  readonly allowClaudeSubscription?: boolean;
}

let activeAuthActions: Readonly<Record<AgentProvider, boolean>> = Object.freeze({
  codex: false,
  claude: false,
  gemini: false,
});

interface ActiveLoginSession {
  readonly sessionId: string;
  readonly ownerWebContentsId: number;
  readonly writeLine: (value: string) => Promise<'accepted' | 'busy' | 'closed'>;
  readonly cancel: () => void;
  readonly loginUrl?: string;
  readonly browserState: 'unavailable' | 'ready' | 'opening' | 'opened';
  readonly promptAttempt: number;
  readonly acceptedPromptAttempt: number;
  readonly writingPromptAttempt?: number;
}

let activeLoginSessions: Readonly<Partial<Record<AgentProvider, ActiveLoginSession>>> = Object.freeze({});

function setActiveLoginSession(
  provider: AgentProvider,
  session: ActiveLoginSession | undefined,
): void {
  const next = { ...activeLoginSessions };
  if (session) next[provider] = session;
  else delete next[provider];
  activeLoginSessions = Object.freeze(next);
}

function updateActiveLoginSession(
  provider: AgentProvider,
  sessionId: string,
  update: (session: ActiveLoginSession) => ActiveLoginSession,
): ActiveLoginSession | undefined {
  const current = activeLoginSessions[provider];
  if (!current || current.sessionId !== sessionId) return undefined;
  const next = Object.freeze(update(current));
  setActiveLoginSession(provider, next);
  return next;
}

function requireSessionId(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 128
    || /[\u0000-\u001F\u007F]/.test(value)
  ) {
    throw codedError('invalid_input', '로그인 세션 정보가 올바르지 않습니다.');
  }
  return value;
}

function requireLoginCode(value: unknown): string {
  if (typeof value !== 'string' || /[\u0000-\u001F\u007F]/.test(value)) {
    throw codedError('invalid_input', '인증 코드는 한 줄의 텍스트여야 합니다.');
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 4_096) {
    throw codedError('invalid_input', '인증 코드 길이가 올바르지 않습니다.');
  }
  return normalized;
}

function requirePromptAttempt(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 10_000) {
    throw codedError('invalid_input', '로그인 코드 시도 정보가 올바르지 않습니다.');
  }
  return Number(value);
}

function requireOwnedLoginSession(
  event: IpcMainInvokeEvent,
  provider: AgentProvider,
  sessionId: string,
): ActiveLoginSession {
  const session = activeLoginSessions[provider];
  if (
    !session
    || session.sessionId !== sessionId
    || session.ownerWebContentsId !== event.sender.id
  ) {
    throw codedError('invalid_session', '진행 중인 로그인 세션과 일치하지 않습니다.');
  }
  return session;
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function rendererSafeErrorMessage(
  error: { message?: string } | undefined,
  fallback: string,
): string {
  return error?.message ? sanitizeUserVisibleError(error.message) : fallback;
}

function normalizeFilePath(filePath: string): string {
  const normalized = resolve(filePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function assertTrustedAgentSender(
  event: IpcMainInvokeEvent,
  trustedRendererPath: string,
): void {
  const senderFrame = event?.senderFrame;
  if (!senderFrame || senderFrame !== event.sender?.mainFrame) {
    throw codedError('untrusted_sender', 'Agent 요청이 신뢰할 수 없는 하위 프레임에서 차단되었습니다.');
  }

  try {
    const senderUrl = new URL(senderFrame.url || event.sender.getURL());
    if (senderUrl.protocol !== 'file:') throw new Error('non-file renderer');
    const senderPath = normalizeFilePath(fileURLToPath(senderUrl));
    if (senderPath !== trustedRendererPath) throw new Error('unexpected renderer path');
  } catch {
    throw codedError('untrusted_sender', 'Agent 요청이 신뢰할 수 없는 화면에서 차단되었습니다.');
  }
}

async function runExclusiveAuthAction<T>(
  provider: AgentProvider,
  operation: () => Promise<T>,
): Promise<T> {
  if (activeAuthActions[provider]) {
    throw codedError('busy', `${provider} 계정 작업이 이미 진행 중입니다.`);
  }
  activeAuthActions = Object.freeze({ ...activeAuthActions, [provider]: true });
  try {
    return await operation();
  } finally {
    activeAuthActions = Object.freeze({ ...activeAuthActions, [provider]: false });
  }
}

/**
 * Register agent:status and agent:generate.
 * Dynamic import keeps the CLI service out of the startup path (loaded only on first use).
 */
export function registerAgentHandlers(options: RegisterAgentHandlerOptions): void {
  if (!isAbsolute(options.trustedRendererPath)) {
    throw new Error('trustedRendererPath must be absolute');
  }
  const trustedRendererPath = normalizeFilePath(options.trustedRendererPath);
  const productPolicyContext = createAgentProductPolicyContext({
    allowClaudeSubscription: options.allowClaudeSubscription === true,
  });

  // Install / login status for the engine-selector badge.
  ipcMain.handle('agent:status', async (
    event,
    provider: unknown,
    options?: { forceRefresh?: boolean },
  ) => {
    try {
      assertTrustedAgentSender(event, trustedRendererPath);
      const validatedProvider = requireAgentProvider(provider);
      const disabledStatus = getDisabledAgentStatus(validatedProvider, productPolicyContext);
      if (disabledStatus) return { success: true, status: disabledStatus };
      const { detectAgent } = await import('../../agentCli/index.js');
      const status = await detectAgent(validatedProvider, { forceRefresh: options?.forceRefresh === true });
      return { success: true, status };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return {
        success: false,
        code: e?.code,
        message: rendererSafeErrorMessage(e, 'Agent 상태 확인 중 오류가 발생했습니다.'),
      };
    }
  });

  // 자동 설치 (npm i -g) — 사용자 옵트인. 완료까지 대기 후 결과 반환.
  ipcMain.handle('agent:install', async (event, provider: unknown) => {
    try {
      assertTrustedAgentSender(event, trustedRendererPath);
      const validatedProvider = requireAgentProvider(provider);
      assertAgentProviderAllowed(validatedProvider, productPolicyContext);
      const result = await runExclusiveAuthAction(validatedProvider, async () => {
        const { installAgent } = await import('../../agentCli/installer.js');
        return installAgent(validatedProvider);
      });
      return { success: true, ...result };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return {
        success: false,
        code: e?.code,
        message: rendererSafeErrorMessage(e, '설치 중 오류가 발생했습니다.'),
      };
    }
  });

  // 구독 로그인 (브라우저 OAuth) — 완료까지 대기 후 결과 반환.
  ipcMain.handle('agent:login', async (event, provider: unknown) => {
    let cleanupProvider: AgentProvider | undefined;
    let cleanupSessionId: string | undefined;
    let cleanupDestroyedListener: (() => void) | undefined;
    try {
      assertTrustedAgentSender(event, trustedRendererPath);
      const validatedProvider = requireAgentProvider(provider);
      assertAgentProviderAllowed(validatedProvider, productPolicyContext);
      const sessionId = randomUUID();
      cleanupProvider = validatedProvider;
      cleanupSessionId = sessionId;
      let rendererDestroyed = false;
      let pendingLoginUrl: string | undefined;
      let pendingPromptAttempt = 0;
      const sendProgress = (
        phase: 'manual-url-ready' | 'code-required',
        attempt?: number,
      ): void => {
        const session = activeLoginSessions[validatedProvider];
        if (
          rendererDestroyed
          || !session
          || session.sessionId !== sessionId
          || event.sender.isDestroyed?.()
        ) return;
        const progress = phase === 'code-required'
          ? Object.freeze({ provider: validatedProvider, sessionId, phase, attempt })
          : Object.freeze({ provider: validatedProvider, sessionId, phase });
        try { event.sender.send('agent:login-progress', progress); } catch { /* renderer closed */ }
      };
      const onRendererDestroyed = (): void => {
        rendererDestroyed = true;
        const session = activeLoginSessions[validatedProvider];
        if (session?.sessionId === sessionId) session.cancel();
      };
      cleanupDestroyedListener = onRendererDestroyed;
      event.sender.once?.('destroyed', onRendererDestroyed);
      const status = await runExclusiveAuthAction(validatedProvider, async () => {
        const { loginAgent } = await import('../../agentCli/installer.js');
        try {
          return await loginAgent(validatedProvider, {
            onLoginUrl: (url) => {
              if (!isAllowedAgentLoginUrl(validatedProvider, url)) return;
              pendingLoginUrl = url;
              const updated = updateActiveLoginSession(
                validatedProvider,
                sessionId,
                (session) => Object.freeze({
                  ...session,
                  loginUrl: url,
                  browserState: 'ready' as const,
                }),
              );
              if (updated) sendProgress('manual-url-ready');
            },
            onSessionReady: (controls) => {
              if (rendererDestroyed || event.sender.isDestroyed?.()) {
                controls.cancel();
                return;
              }
              setActiveLoginSession(validatedProvider, Object.freeze({
                sessionId,
                ownerWebContentsId: event.sender.id,
                writeLine: controls.writeLine,
                cancel: controls.cancel,
                loginUrl: pendingLoginUrl,
                browserState: pendingLoginUrl ? 'ready' : 'unavailable',
                promptAttempt: pendingPromptAttempt,
                acceptedPromptAttempt: 0,
              }));
              if (pendingLoginUrl) sendProgress('manual-url-ready');
              if (pendingPromptAttempt > 0) sendProgress('code-required', pendingPromptAttempt);
            },
            onCodeRequired: (attempt) => {
              if (!Number.isSafeInteger(attempt) || attempt <= pendingPromptAttempt) return;
              pendingPromptAttempt = attempt;
              const updated = updateActiveLoginSession(
                validatedProvider,
                sessionId,
                (session) => Object.freeze({
                  ...session,
                  promptAttempt: attempt,
                  writingPromptAttempt: undefined,
                }),
              );
              if (updated) sendProgress('code-required', attempt);
            },
            onSessionClosed: () => {
              const current = activeLoginSessions[validatedProvider];
              if (current?.sessionId === sessionId) setActiveLoginSession(validatedProvider, undefined);
            },
          });
        } finally {
          const current = activeLoginSessions[validatedProvider];
          if (current?.sessionId === sessionId) setActiveLoginSession(validatedProvider, undefined);
        }
      });
      return status.loginAction
        ? { success: true, status, authState: status.loginAction }
        : { success: true, status };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return {
        success: false,
        code: e?.code,
        message: rendererSafeErrorMessage(e, '로그인 중 오류가 발생했습니다.'),
      };
    } finally {
      if (cleanupProvider && cleanupSessionId) {
        const current = activeLoginSessions[cleanupProvider];
        if (current?.sessionId === cleanupSessionId) {
          setActiveLoginSession(cleanupProvider, undefined);
        }
      }
      if (cleanupDestroyedListener) {
        try {
          event.sender.removeListener?.('destroyed', cleanupDestroyedListener);
        } catch {
          // Renderer teardown cleanup must not replace the login result.
        }
      }
    }
  });

  ipcMain.handle('agent:login-open-browser', async (
    event,
    provider: unknown,
    sessionId: unknown,
  ) => {
    try {
      assertTrustedAgentSender(event, trustedRendererPath);
      const validatedProvider = requireAgentProvider(provider);
      assertAgentProviderAllowed(validatedProvider, productPolicyContext);
      const validatedSessionId = requireSessionId(sessionId);
      const session = requireOwnedLoginSession(
        event,
        validatedProvider,
        validatedSessionId,
      );
      if (!session.loginUrl || session.browserState === 'unavailable') {
        throw codedError('url_not_ready', '로그인 주소가 아직 준비되지 않았습니다.');
      }
      if (session.browserState === 'opening') {
        return { success: false, code: 'busy', state: 'opening' as const };
      }
      if (!isAllowedAgentLoginUrl(validatedProvider, session.loginUrl)) {
        throw codedError('invalid_login_url', '로그인 주소를 안전하게 확인하지 못했습니다.');
      }

      updateActiveLoginSession(
        validatedProvider,
        validatedSessionId,
        (current) => Object.freeze({ ...current, browserState: 'opening' as const }),
      );
      try {
        await shell.openExternal(session.loginUrl);
      } catch {
        updateActiveLoginSession(
          validatedProvider,
          validatedSessionId,
          (current) => Object.freeze({ ...current, browserState: 'ready' as const }),
        );
        return {
          success: false,
          code: 'open_failed',
          state: 'retryable' as const,
          message: '브라우저를 열지 못했습니다. 다시 시도해주세요.',
        };
      }
      updateActiveLoginSession(
        validatedProvider,
        validatedSessionId,
        (current) => Object.freeze({ ...current, browserState: 'opened' as const }),
      );
      return { success: true, state: 'opened' as const };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return {
        success: false,
        code: e?.code,
        message: rendererSafeErrorMessage(e, '브라우저를 열지 못했습니다.'),
      };
    }
  });

  ipcMain.handle('agent:login-submit-code', async (
    event,
    provider: unknown,
    sessionId: unknown,
    attempt: unknown,
    code: unknown,
  ) => {
    try {
      assertTrustedAgentSender(event, trustedRendererPath);
      const validatedProvider = requireAgentProvider(provider);
      assertAgentProviderAllowed(validatedProvider, productPolicyContext);
      const validatedSessionId = requireSessionId(sessionId);
      const validatedAttempt = requirePromptAttempt(attempt);
      const validatedCode = requireLoginCode(code);
      const session = requireOwnedLoginSession(event, validatedProvider, validatedSessionId);
      if (session.promptAttempt !== validatedAttempt) {
        throw codedError('stale_attempt', '현재 로그인 코드 입력 단계와 일치하지 않습니다.');
      }
      if (
        session.acceptedPromptAttempt >= validatedAttempt
        || session.writingPromptAttempt === validatedAttempt
      ) {
        throw codedError('attempt_already_submitted', '이 로그인 코드 단계는 이미 전송되었습니다.');
      }
      const locked = updateActiveLoginSession(
        validatedProvider,
        validatedSessionId,
        (current) => Object.freeze({
          ...current,
          writingPromptAttempt: validatedAttempt,
        }),
      );
      if (!locked) {
        throw codedError('session_closed', '로그인 코드 입력 창이 닫혔습니다. 다시 로그인해주세요.');
      }
      let writeStatus: 'accepted' | 'busy' | 'closed';
      try {
        writeStatus = await locked.writeLine(validatedCode);
      } catch {
        writeStatus = 'closed';
      }
      updateActiveLoginSession(
        validatedProvider,
        validatedSessionId,
        (current) => Object.freeze({
          ...current,
          acceptedPromptAttempt: writeStatus === 'accepted'
            ? Math.max(current.acceptedPromptAttempt, validatedAttempt)
            : current.acceptedPromptAttempt,
          writingPromptAttempt: current.writingPromptAttempt === validatedAttempt
            ? undefined
            : current.writingPromptAttempt,
        }),
      );
      if (writeStatus === 'busy') {
        throw codedError('stdin_busy', '로그인 코드 전송이 진행 중입니다. 잠시 후 다시 시도해주세요.');
      }
      if (writeStatus === 'closed') {
        throw codedError('session_closed', '로그인 입력 창이 이미 닫혔습니다. 다시 로그인해주세요.');
      }
      return { success: true };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return {
        success: false,
        code: e?.code,
        message: rendererSafeErrorMessage(e, '인증 코드 전달 중 오류가 발생했습니다.'),
      };
    }
  });

  ipcMain.handle('agent:login-cancel', async (
    event,
    provider: unknown,
    sessionId: unknown,
  ) => {
    try {
      assertTrustedAgentSender(event, trustedRendererPath);
      const validatedProvider = requireAgentProvider(provider);
      assertAgentProviderAllowed(validatedProvider, productPolicyContext);
      const validatedSessionId = requireSessionId(sessionId);
      const session = requireOwnedLoginSession(event, validatedProvider, validatedSessionId);
      session.cancel();
      return { success: true };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return {
        success: false,
        code: e?.code,
        message: rendererSafeErrorMessage(e, '로그인 취소 중 오류가 발생했습니다.'),
      };
    }
  });

  // 계정 전환용 로그아웃 — 기존 구독 인증을 비워 다른 계정으로 로그인할 수 있게 함.
  ipcMain.handle('agent:logout', async (event, provider: unknown) => {
    try {
      assertTrustedAgentSender(event, trustedRendererPath);
      const validatedProvider = requireAgentProvider(provider);
      assertAgentProviderAllowed(validatedProvider, productPolicyContext);
      await runExclusiveAuthAction(validatedProvider, async () => {
        const { logoutAgent } = await import('../../agentCli/installer.js');
        return logoutAgent(validatedProvider);
      });
      return { success: true };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return {
        success: false,
        code: e?.code,
        message: rendererSafeErrorMessage(e, '로그아웃 중 오류가 발생했습니다.'),
      };
    }
  });

  // One-shot generation. Errors carry a stable code so the renderer can show the right modal.
  ipcMain.handle('agent:generate', async (event, payload: AgentGeneratePayload) => {
    try {
      assertTrustedAgentSender(event, trustedRendererPath);
      const validated = normalizeAgentGenerateOptions(payload as unknown as Record<string, unknown>);
      assertAgentProviderAllowed(validated.provider, productPolicyContext);
      const { generateWithAgent } = await import('../../agentCli/index.js');
      const result = await generateWithAgent(validated, productPolicyContext);
      return { success: true, ...result };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return {
        success: false,
        code: e?.code,
        message: rendererSafeErrorMessage(e, '에이전트 생성 중 오류가 발생했습니다.'),
      };
    }
  });
}
