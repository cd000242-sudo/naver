import type { AgentProvider } from '../../agentCli/types.js';

export type AgentLoginProgress = Readonly<{
  provider: AgentProvider;
  sessionId: string;
  phase: 'manual-url-ready';
} | {
  provider: AgentProvider;
  sessionId: string;
  phase: 'code-required';
  attempt: number;
}>;

interface AgentLoginActionResult {
  readonly success: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly state?: 'opening' | 'opened' | 'retryable';
}

export interface AgentLoginCodeBridge {
  readonly onAgentLoginProgress?: (
    listener: (progress: AgentLoginProgress) => void,
  ) => () => void;
  readonly agentLoginOpenBrowser?: (
    provider: AgentProvider,
    sessionId: string,
  ) => Promise<AgentLoginActionResult>;
  readonly agentLoginSubmitCode?: (
    provider: AgentProvider,
    sessionId: string,
    attempt: number,
    code: string,
  ) => Promise<AgentLoginActionResult>;
  readonly agentLoginCancel?: (
    provider: AgentProvider,
    sessionId: string,
  ) => Promise<AgentLoginActionResult>;
}

interface LoginCodeFallbackOptions<T> {
  readonly provider: AgentProvider;
  readonly mountElement: HTMLElement;
  readonly statusElement: HTMLElement;
  readonly api: AgentLoginCodeBridge;
  readonly startLogin: () => Promise<T>;
}

interface CodePromptOptions {
  readonly provider: AgentProvider;
  readonly sessionId: string;
  readonly mountElement: HTMLElement;
  readonly statusElement: HTMLElement;
  readonly api: Required<Pick<AgentLoginCodeBridge, 'agentLoginSubmitCode' | 'agentLoginCancel'>>;
  readonly dismiss: () => void;
}

interface CodePromptController {
  readonly activateAttempt: (attempt: number) => void;
  readonly remove: () => void;
}

const SESSION_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const RAW_URL_RE = /^https?:\/\//i;
const MAX_LOGIN_ATTEMPT = 10_000;

function isMatchingProgress(
  value: unknown,
  provider: AgentProvider,
): value is AgentLoginProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as Partial<AgentLoginProgress>;
  if (
    progress.provider !== provider
    || typeof progress.sessionId !== 'string'
    || !SESSION_ID_RE.test(progress.sessionId)
  ) return false;
  if (progress.phase === 'manual-url-ready') return true;
  return progress.phase === 'code-required'
    && Number.isSafeInteger(progress.attempt)
    && Number(progress.attempt) >= 1
    && Number(progress.attempt) <= MAX_LOGIN_ATTEMPT;
}

function setPromptBusy(
  input: HTMLInputElement,
  submitButton: HTMLButtonElement,
  cancelButton: HTMLButtonElement,
  busy: boolean,
): void {
  input.disabled = busy;
  submitButton.disabled = busy;
  cancelButton.disabled = busy;
}

function createBrowserPrompt(options: {
  readonly provider: AgentProvider;
  readonly sessionId: string;
  readonly mountElement: HTMLElement;
  readonly statusElement: HTMLElement;
  readonly openBrowser: NonNullable<AgentLoginCodeBridge['agentLoginOpenBrowser']>;
}): () => void {
  const panel = document.createElement('div');
  panel.setAttribute('data-agent-login-browser-prompt', '');
  panel.style.display = 'flex';
  panel.style.alignItems = 'center';
  panel.style.gap = '0.4rem';
  panel.style.padding = '0.5rem';

  const guidance = document.createElement('span');
  guidance.textContent = '로그인 페이지를 여는 중입니다...';
  guidance.style.fontSize = '0.78rem';
  guidance.style.color = '#374151';
  guidance.style.flex = '1';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.textContent = '브라우저 여는 중...';
  openButton.setAttribute('data-agent-login-open-browser', '');

  let removed = false;
  const requestBrowserOpen = async (): Promise<void> => {
    if (removed || openButton.disabled) return;
    openButton.disabled = true;
    openButton.textContent = '브라우저 여는 중...';
    options.statusElement.textContent = '⏳ 로그인 브라우저 여는 중...';
    try {
      const result = await options.openBrowser(options.provider, options.sessionId);
      if (removed) return;
      if (result?.success && result.state === 'opened') {
        guidance.textContent = '브라우저에서 로그인을 완료해주세요. 창이 보이지 않으면 다시 열 수 있습니다.';
        openButton.textContent = '브라우저 다시 열기';
        openButton.disabled = false;
        options.statusElement.textContent = '⏳ 브라우저에서 로그인 진행 중...';
        return;
      }
    } catch {
      // Renderer copy is intentionally fixed so raw OAuth URLs can never be reflected.
    }
    if (removed) return;
    guidance.textContent = '브라우저를 열지 못했습니다. 버튼을 눌러 다시 시도해주세요.';
    openButton.textContent = '브라우저 다시 열기';
    openButton.disabled = false;
    options.statusElement.textContent = '⏳ 로그인 진행 중...';
    openButton.focus();
  };

  openButton.addEventListener('click', () => {
    void requestBrowserOpen();
  });

  panel.append(guidance, openButton);
  options.mountElement.appendChild(panel);
  // The original login button is the user gesture. Open once immediately when main has
  // captured and allowlisted the URL; the visible button remains a retry/reopen fallback.
  void requestBrowserOpen();
  return () => {
    if (removed) return;
    removed = true;
    panel.remove();
  };
}

function createCodePrompt(options: CodePromptOptions): CodePromptController {
  const form = document.createElement('form');
  form.setAttribute('data-agent-login-code-prompt', '');
  form.style.display = 'flex';
  form.style.flexWrap = 'wrap';
  form.style.alignItems = 'center';
  form.style.gap = '0.4rem';
  form.style.padding = '0.5rem';
  form.style.border = '1px solid #d1d5db';
  form.style.borderRadius = '8px';
  form.style.background = '#f9fafb';

  const guidance = document.createElement('span');
  guidance.style.flexBasis = '100%';
  guidance.style.fontSize = '0.78rem';
  guidance.style.color = '#374151';

  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'one-time-code';
  input.maxLength = 4_096;
  input.placeholder = '인증 코드';
  input.setAttribute('aria-label', '에이전트 로그인 인증 코드');
  input.spellcheck = false;
  input.style.minWidth = '12rem';
  input.style.flex = '1';
  input.style.padding = '0.42rem 0.55rem';

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = '코드 확인';
  submitButton.setAttribute('data-agent-login-code-submit', '');

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = '취소';
  cancelButton.setAttribute('data-agent-login-code-cancel', '');

  let removed = false;
  let activeAttempt = 0;
  const remove = (): void => {
    if (removed) return;
    removed = true;
    input.value = '';
    form.remove();
  };

  const activateAttempt = (attempt: number): void => {
    if (removed || attempt <= activeAttempt) return;
    activeAttempt = attempt;
    form.setAttribute('data-agent-login-attempt', String(attempt));
    input.value = '';
    guidance.textContent = attempt === 1
      ? '브라우저에 표시된 로그인 코드를 입력하세요.'
      : '코드가 올바르지 않습니다. 전체 코드를 다시 복사해 입력하세요.';
    options.statusElement.textContent = '⏳ 로그인 코드 입력 대기 중...';
    setPromptBusy(input, submitButton, cancelButton, false);
    input.focus();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submittedCode = input.value.trim();
    const submittedAttempt = activeAttempt;
    input.value = '';
    if (
      !submittedCode
      || submittedCode.length > input.maxLength
      || RAW_URL_RE.test(submittedCode)
      || /[\r\n\0]/.test(submittedCode)
    ) {
      guidance.textContent = '링크가 아닌 인증 코드만 입력해주세요.';
      return;
    }

    setPromptBusy(input, submitButton, cancelButton, true);
    try {
      const result = await options.api.agentLoginSubmitCode(
        options.provider,
        options.sessionId,
        submittedAttempt,
        submittedCode,
      );
      if (removed || activeAttempt !== submittedAttempt) return;
      if (result?.success) {
        guidance.textContent = '코드 확인 중입니다. 잠시 기다려주세요.';
        options.statusElement.textContent = '⏳ 코드 확인 중...';
        return;
      }
      if (result?.code === 'attempt_already_submitted') {
        guidance.textContent = '코드 확인 중입니다. 새 입력 요청을 기다려주세요.';
        return;
      }
    } catch {
      if (removed || activeAttempt !== submittedAttempt) return;
    }
    guidance.textContent = '인증 코드를 전송하지 못했습니다. 다시 입력해주세요.';
    setPromptBusy(input, submitButton, cancelButton, false);
    input.focus();
  });

  cancelButton.addEventListener('click', async () => {
    input.value = '';
    setPromptBusy(input, submitButton, cancelButton, true);
    options.statusElement.textContent = '⏳ 로그인 취소 중...';
    try {
      const result = await options.api.agentLoginCancel(options.provider, options.sessionId);
      if (removed) return;
      if (result?.success || result?.code === 'session_closed') {
        options.dismiss();
        return;
      }
    } catch {
      if (removed) return;
    }
    guidance.textContent = '로그인 취소 요청을 처리하지 못했습니다. 다시 시도해주세요.';
    options.statusElement.textContent = '⏳ 로그인 진행 중...';
    setPromptBusy(input, submitButton, cancelButton, false);
    input.focus();
  });

  form.append(guidance, input, submitButton, cancelButton);
  options.mountElement.appendChild(form);
  return Object.freeze({ activateAttempt, remove });
}

export async function runAgentLoginWithCodeFallback<T>(
  options: LoginCodeFallbackOptions<T>,
): Promise<T> {
  const { api, provider } = options;
  let activeSessionId: string | undefined;
  let browserPromptStarted = false;
  let removeBrowserPrompt: (() => void) | undefined;
  let codePrompt: CodePromptController | undefined;

  const dismissCodePrompt = (): void => {
    const prompt = codePrompt;
    codePrompt = undefined;
    prompt?.remove();
  };

  let unsubscribe = (): void => undefined;
  if (typeof api.onAgentLoginProgress === 'function') {
    unsubscribe = api.onAgentLoginProgress((progress) => {
      if (!isMatchingProgress(progress, provider)) return;
      if (activeSessionId && progress.sessionId !== activeSessionId) return;
      activeSessionId = progress.sessionId;

      if (progress.phase === 'manual-url-ready') {
        if (browserPromptStarted || typeof api.agentLoginOpenBrowser !== 'function') return;
        browserPromptStarted = true;
        try {
          removeBrowserPrompt = createBrowserPrompt({
            provider,
            sessionId: progress.sessionId,
            mountElement: options.mountElement,
            statusElement: options.statusElement,
            openBrowser: api.agentLoginOpenBrowser,
          });
        } catch {
          browserPromptStarted = false;
        }
        return;
      }

      if (
        typeof api.agentLoginSubmitCode !== 'function'
        || typeof api.agentLoginCancel !== 'function'
      ) return;
      if (!codePrompt) {
        codePrompt = createCodePrompt({
          provider,
          sessionId: progress.sessionId,
          mountElement: options.mountElement,
          statusElement: options.statusElement,
          api: {
            agentLoginSubmitCode: api.agentLoginSubmitCode,
            agentLoginCancel: api.agentLoginCancel,
          },
          dismiss: dismissCodePrompt,
        });
      }
      codePrompt.activateAttempt(progress.attempt);
    });
  }

  try {
    return await options.startLogin();
  } finally {
    try {
      unsubscribe();
    } catch {
      // Cleanup must never replace the login result.
    }
    dismissCodePrompt();
    removeBrowserPrompt?.();
  }
}
