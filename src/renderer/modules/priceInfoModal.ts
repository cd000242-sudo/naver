/**
 * ✅ [2026-02-26 모듈화] 가격 정보 모달 모듈
 * - renderer.ts에서 분리됨
 * - 이미지/비디오 가격 정보 모달 UI, 계산, 표시
 * - 의존: appendLog (자체 정의), window.api, DOM
 */

import { toastManager } from '../utils/uiManagers.js';
import { rememberPlan } from '../utils/geminiPlanMemo.js';
import { normalizeGeminiTextModelId } from '../../runtime/modelRegistry.js';
import {
  createAgentStatusRefreshCoordinator,
  type AgentStatusProvider,
} from '../utils/agentStatusRefreshCoordinator.js';
import { runAgentLoginWithCodeFallback } from '../utils/agentLoginCodePrompt.js';
import {
  formatAgentVersionLabel,
  resolvePersistedTextModelConfig,
  resolveTextModelSelection,
} from '../utils/agentProductPolicyUi.js';

// renderer.ts 전역 함수/변수 참조 (런타임에 존재)
declare function initMultiAccountManager(): Promise<void>;
declare function testLicenseCode(code: string): Promise<void>;
declare const apiClient: { call: (method: string, args: any[], opts?: any) => Promise<any> };

// appendLog는 rendererUtils.ts에서 전역 스코프로 제공됨
declare function appendLog(message: string, logOutputId?: string): void;

function isMaskedSecretValue(value: string | undefined): boolean {
  if (!value) return false;
  return /[\u2022\u25CF*]/.test(value);
}

/** display \uD1A0\uAE00 \uD5EC\uD37C \u2014 \uBC84\uD2BC/\uCEE8\uD14C\uC774\uB108 \uD45C\uC2DC \uC81C\uC5B4. */
function setShown(el: HTMLElement | null, on: boolean, mode: 'inline-block' | 'flex' = 'inline-block'): void {
  if (el) el.style.display = on ? mode : 'none';
}

const agentStatusRefreshCoordinator = createAgentStatusRefreshCoordinator();
const announcedAgentLoginTargets = new WeakSet<HTMLElement>();
let claudeSubscriptionDisabled = true;

interface RefreshAgentStatusOptions {
  readonly providers?: readonly AgentStatusProvider[];
  readonly forceRefresh?: boolean;
}

function applyClaudeSubscriptionSelectorPolicy(disabled: boolean): void {
  claudeSubscriptionDisabled = disabled;
  const querySelector = (document as Document & {
    querySelector?: Document['querySelector'];
  }).querySelector?.bind(document);
  if (!querySelector) return;
  const radio = querySelector(
    'input[name="primaryGeminiTextModel"][value="agent-claude"]',
  ) as HTMLInputElement | null;
  if (!radio) return;

  const card = radio.closest('label');
  radio.disabled = disabled;
  if (disabled) {
    radio.setAttribute('aria-disabled', 'true');
    card?.setAttribute('aria-disabled', 'true');
    card?.setAttribute('title', '배포 앱에서는 Claude API 키 방식을 사용해주세요.');
    if (card) {
      card.style.cursor = 'not-allowed';
      card.style.opacity = '0.55';
    }
  } else {
    radio.removeAttribute('aria-disabled');
    card?.removeAttribute('aria-disabled');
    card?.removeAttribute('title');
    if (card) {
      card.style.cursor = 'pointer';
      card.style.opacity = '';
    }
  }

  if (!disabled || !radio.checked) return;
  const claudeApiKey = (document.getElementById('claude-api-key') as HTMLInputElement | null)?.value;
  const safeSelection = resolveTextModelSelection('agent-claude', claudeApiKey, true);
  const fallback = querySelector(
    `input[name="primaryGeminiTextModel"][value="${safeSelection.model}"]`,
  ) as HTMLInputElement | null;
  radio.checked = false;
  if (fallback) fallback.checked = true;
  const unifiedGenerator = document.getElementById('unified-generator') as HTMLInputElement | null;
  if (unifiedGenerator) unifiedGenerator.value = safeSelection.provider;
}

/**
 * \uC124\uCE58/\uB85C\uADF8\uC778 \uBC84\uD2BC\uC5D0 \uD074\uB9AD \uD578\uB4E4\uB7EC \uBC14\uC778\uB529 (\uD480\uC790\uB3D9 \u2014 \uC571\uC5D0\uC11C npm \uC124\uCE58/OAuth \uB85C\uADF8\uC778 \uC2E4\uD589).
 * onclick \uB300\uC785\uC774\uB77C \uBC18\uBCF5 \uD638\uCD9C\uB3FC\uB3C4 \uB204\uC801\uB418\uC9C0 \uC54A\uB294\uB2E4. \uC644\uB8CC \uD6C4 \uC0C1\uD0DC\uB97C \uC7AC\uC870\uD68C\uD574 \uBC43\uC9C0/\uBC84\uD2BC\uC744 \uAC31\uC2E0\uD55C\uB2E4.
 */
function bindAgentAction(
  btn: HTMLButtonElement | null,
  provider: AgentStatusProvider,
  action: 'install' | 'login',
  statusEl: HTMLElement,
): void {
  if (!btn) return;
  btn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const api = window.api;
    const fn = action === 'install' ? api?.agentInstall : api?.agentLogin;
    if (typeof fn !== 'function') return;
    const actionLease = agentStatusRefreshCoordinator.beginAction(provider);
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = action === 'install' ? '\u23F3 \uC124\uCE58 \uC911... (\uCD5C\uB300 2\uBD84)' : '\u23F3 \uB85C\uADF8\uC778 \uC900\uBE44 \uC911...';
    statusEl.textContent = action === 'install' ? '\u23F3 npm \uC804\uC5ED \uC124\uCE58 \uC911...' : '\u23F3 \uB85C\uADF8\uC778 \uC8FC\uC18C \uC900\uBE44 \uC911...';
    statusEl.style.color = '#6b7280';
    try {
      const res = action === 'login'
        ? await runAgentLoginWithCodeFallback({
          provider,
          mountElement: btn.parentElement ?? statusEl,
          statusElement: statusEl,
          api,
          startLogin: () => api.agentLogin(provider),
        })
        : await fn(provider);
      if (res?.success) {
        const loginStatus = action === 'login' && 'status' in res ? res.status : undefined;
        if (action === 'login' && loginStatus?.available !== true) {
          toastManager.warning(`\u26A0\uFE0F \uB85C\uADF8\uC778\uC740 \uD655\uC778\uB410\uC9C0\uB9CC \uD604\uC7AC \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${loginStatus?.detail || '\uAD6C\uB3C5 \uC0C1\uD0DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694'}`);
        } else if (
          action === 'login'
          && 'authState' in res
          && res.authState === 'already_authenticated'
        ) {
          announcedAgentLoginTargets.add(statusEl);
          toastManager.success(`\u2705 ${provider === 'codex' ? 'Codex' : 'Claude Code'} \uB85C\uADF8\uC778\uC774 \uC774\uBBF8 \uC790\uB3D9 \uC778\uC2DD\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.`);
        } else {
          if (action === 'login') announcedAgentLoginTargets.add(statusEl);
          toastManager.success(action === 'install' ? '\u2705 CLI \uC124\uCE58 \uC644\uB8CC' : '\u2705 \uB85C\uADF8\uC778 \uC644\uB8CC');
        }
      } else {
        toastManager.error(`\u274C ${action === 'install' ? '\uC124\uCE58' : '\uB85C\uADF8\uC778'} \uC2E4\uD328: ${res?.message || '\uC54C \uC218 \uC5C6\uB294 \uC624\uB958'}`);
      }
    } catch (err) {
      toastManager.error(`\u274C \uC624\uB958: ${(err as Error).message}`);
    } finally {
      if (agentStatusRefreshCoordinator.endAction(actionLease)) {
        btn.disabled = false;
        btn.textContent = orig;
        await refreshAgentStatusBadges({ providers: [provider], forceRefresh: false });
      }
    }
  };
}

/**
 * \uC5D0\uC774\uC804\uD2B8 \uACC4\uC815 \uC804\uD658 \u2014 \uB85C\uADF8\uC544\uC6C3 \uD6C4 \uB2E4\uB978 \uAD6C\uB3C5 \uACC4\uC815\uC73C\uB85C \uC7AC\uB85C\uADF8\uC778.
 * codex logout / claude auth logout \u2192 \uC774\uC5B4\uC11C \uB85C\uADF8\uC778(\uBE0C\uB77C\uC6B0\uC800 OAuth, \uB2E4\uB978 \uACC4\uC815 \uC120\uD0DD \uAC00\uB2A5).
 */
function bindAgentSwitch(
  btn: HTMLButtonElement | null,
  provider: AgentStatusProvider,
  statusEl: HTMLElement,
): void {
  if (!btn) return;
  btn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const api = window.api;
    if (typeof api?.agentLogout !== 'function' || typeof api?.agentLogin !== 'function') return;
    if (!confirm(`${provider} \uACC4\uC815\uC744 \uB85C\uADF8\uC544\uC6C3\uD558\uACE0 \uB2E4\uB978 \uACC4\uC815\uC73C\uB85C \uB2E4\uC2DC \uB85C\uADF8\uC778\uD560\uAE4C\uC694?`)) return;
    const actionLease = agentStatusRefreshCoordinator.beginAction(provider);
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '\u23F3 \uB85C\uADF8\uC544\uC6C3 \uC911...';
    statusEl.textContent = '\u23F3 \uB85C\uADF8\uC544\uC6C3 \uC911...';
    statusEl.style.color = '#6b7280';
    try {
      const out = await api.agentLogout(provider);
      if (!out?.success) {
        toastManager.error(`\u274C \uB85C\uADF8\uC544\uC6C3 \uC2E4\uD328: ${out?.message || '\uC54C \uC218 \uC5C6\uB294 \uC624\uB958'}`);
        return;
      }
      btn.textContent = '\u23F3 \uC0C8 \uACC4\uC815 \uB85C\uADF8\uC778 \uC900\uBE44 \uC911...';
      statusEl.textContent = '\u23F3 \uC0C8 \uACC4\uC815 \uB85C\uADF8\uC778 \uC8FC\uC18C \uC900\uBE44 \uC911...';
      const login = await runAgentLoginWithCodeFallback({
        provider,
        mountElement: btn.parentElement ?? statusEl,
        statusElement: statusEl,
        api,
        startLogin: () => api.agentLogin(provider),
      });
      if (login?.success) {
        if (login.status?.available !== true) {
          toastManager.warning(`\u26A0\uFE0F \uACC4\uC815\uC740 \uC5F0\uACB0\uB410\uC9C0\uB9CC \uD604\uC7AC \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${login.status?.detail || '\uAD6C\uB3C5 \uC0C1\uD0DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694'}`);
        } else {
          toastManager.success('\u2705 \uACC4\uC815 \uC804\uD658 \uC644\uB8CC');
        }
      } else {
        toastManager.error(`\u274C \uB85C\uADF8\uC778 \uC2E4\uD328: ${login?.message || '\uC54C \uC218 \uC5C6\uB294 \uC624\uB958'}`);
      }
    } catch (err) {
      toastManager.error(`\u274C \uC624\uB958: ${(err as Error).message}`);
    } finally {
      if (agentStatusRefreshCoordinator.endAction(actionLease)) {
        btn.disabled = false;
        btn.textContent = orig;
        await refreshAgentStatusBadges({ providers: [provider], forceRefresh: false });
      }
    }
  };
}

/**
 * \uC5D0\uC774\uC804\uD2B8 \uBAA8\uB4DC(codex/claude \uAD6C\uB3C5 CLI) \uC124\uCE58\u00B7\uB85C\uADF8\uC778 \uC0C1\uD0DC \uBC43\uC9C0 + \uC561\uC158 \uBC84\uD2BC \uAC31\uC2E0.
 * \uAE00\uC0DD\uC131 \uC5D4\uC9C4 \uC124\uC815 \uB85C\uB4DC \uC2DC \uD638\uCD9C \u2014 agent:status IPC\uB85C \uC2E4\uC81C \uC0C1\uD0DC\uB97C \uC870\uD68C\uD574 \uCE74\uB4DC\uC5D0 \uD45C\uAE30\uD55C\uB2E4.
 * \uBBF8\uC124\uCE58 \u2192 \uC790\uB3D9\uC124\uCE58 \uBC84\uD2BC, \uBBF8\uB85C\uADF8\uC778 \u2192 \uB85C\uADF8\uC778 \uBC84\uD2BC\uC744 \uB178\uCD9C\uD55C\uB2E4(\uD480\uC790\uB3D9).
 */
export async function refreshAgentStatusBadges(
  options: RefreshAgentStatusOptions = {},
): Promise<void> {
  const api = window.api;
  if (!api?.agentStatus) return;
  const targets = [
    { provider: 'codex', elId: 'agent-codex-status', actionsId: 'agent-codex-actions', installId: 'agent-codex-install-btn', loginId: 'agent-codex-login-btn', switchId: 'agent-codex-switch-btn' },
    { provider: 'claude', elId: 'agent-claude-status', actionsId: 'agent-claude-actions', installId: 'agent-claude-install-btn', loginId: 'agent-claude-login-btn', switchId: 'agent-claude-switch-btn' },
  ] as const;
  const selectedProviders = new Set(options.providers ?? targets.map((target) => target.provider));
  const selectedTargets = targets.filter((target) => selectedProviders.has(target.provider));

  await Promise.all(selectedTargets.map(async (t) => {
    const el = document.getElementById(t.elId);
    if (!el) return;
    const refreshLease = agentStatusRefreshCoordinator.beginRefresh(t.provider);
    if (!refreshLease) return;
    const actions = document.getElementById(t.actionsId);
    const installBtn = document.getElementById(t.installId) as HTMLButtonElement | null;
    const loginBtn = document.getElementById(t.loginId) as HTMLButtonElement | null;
    const switchBtn = document.getElementById(t.switchId) as HTMLButtonElement | null;
    el.textContent = '\u23F3 \uC0C1\uD0DC \uD655\uC778 \uC911...';
    el.style.color = '#6b7280';
    setShown(actions, false, 'flex');
    setShown(installBtn, false);
    setShown(loginBtn, false);
    setShown(switchBtn, false);
    try {
      const res = await api.agentStatus(t.provider, { forceRefresh: options.forceRefresh === true });
      if (!agentStatusRefreshCoordinator.canApply(refreshLease)) return;
      const s = res?.status;
      if (!res?.success || !s) {
        el.textContent = '\u26A0\uFE0F \uC0C1\uD0DC \uD655\uC778 \uC2E4\uD328 \u2014 \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4';
        el.style.color = '#b45309';
        return;
      }
      if (t.provider === 'claude') {
        applyClaudeSubscriptionSelectorPolicy(s.errorCode === 'provider_disabled');
      }
      if (!s.loggedIn || !s.available) announcedAgentLoginTargets.delete(el);
      if (s.errorCode === 'provider_disabled') {
        el.textContent = `\u26D4 ${s.detail || 'Claude 구독 에이전트는 배포 앱에서 비활성화되어 있습니다. 환경설정에서 Claude API 키를 사용해주세요.'}`;
        el.style.color = '#6b7280';
        return;
      }
      const versionLabel = formatAgentVersionLabel(t.provider, s.version);
      if (!s.installed) {
        el.textContent = '\u2B07\uFE0F \uBBF8\uC124\uCE58 \u2014 \uC790\uB3D9 \uC124\uCE58\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4';
        el.style.color = '#b91c1c';
        setShown(actions, true, 'flex');
        setShown(installBtn, true);
        bindAgentAction(installBtn, t.provider, 'install', el);
        return;
      }
      if (!s.loggedIn) {
        el.textContent = `\u2705 \uC124\uCE58\uB428(${versionLabel}) \u00B7 \u274C \uB85C\uADF8\uC778 \uD544\uC694`;
        el.style.color = '#b45309';
        setShown(actions, true, 'flex');
        setShown(loginBtn, true);
        bindAgentAction(loginBtn, t.provider, 'login', el);
        return;
      }
      if (s.available !== true) {
        const subscriptionInactive = s.errorCode === 'subscription_inactive';
        const rateLimited = s.errorCode === 'rate_limited';
        const providerLabel = t.provider === 'codex' ? 'Codex' : 'Claude';
        el.textContent = subscriptionInactive
          ? `\u274C ${providerLabel} \uAD6C\uB3C5 \uAE30\uAC04 \uB9CC\uB8CC \uB610\uB294 \uC0AC\uC6A9 \uBD88\uAC00 \u2014 \uACC4\uC815 \uC804\uD658 \uD6C4 \uB2E4\uC2DC \uC5F0\uACB0`
          : rateLimited
            ? `\u23F3 ${providerLabel} \uAD6C\uB3C5 \uC0AC\uC6A9 \uD55C\uB3C4 \uC18C\uC9C4 \u2014 \uCD08\uAE30\uD654 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4`
            : `\u26A0\uFE0F ${providerLabel} \uC0AC\uC6A9 \uAD8C\uD55C \uD655\uC778 \uC2E4\uD328 \u2014 ${s.detail || '\uC0C1\uD0DC\uB97C \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694'}`;
        el.style.color = subscriptionInactive ? '#b91c1c' : '#b45309';
        setShown(actions, true, 'flex');
        setShown(switchBtn, true);
        bindAgentSwitch(switchBtn, t.provider, el);
        return;
      }
      el.textContent = s.availabilityCheck === 'authentication'
        ? `\u2705 \uB85C\uADF8\uC778 \uD655\uC778\uB428 \u2014 \uC2E4\uC81C \uC0AC\uC6A9 \uAC00\uB2A5 \uC5EC\uBD80\uB294 \uCCAB \uC0DD\uC131 \uC2DC \uD655\uC778 (${versionLabel})`
        : `\u2705 \uC900\uBE44\uB428 \u2014 ${s.detail || versionLabel}`;
      el.style.color = '#15803d';
      if (t.provider === 'codex' && !announcedAgentLoginTargets.has(el)) {
        announcedAgentLoginTargets.add(el);
        toastManager.success('\u2705 Codex \uB85C\uADF8\uC778 \uC790\uB3D9 \uC778\uC2DD \uC644\uB8CC');
      }
      // \u2705 [v2.11.49] \uB85C\uADF8\uC778 \uC0C1\uD0DC\uC77C \uB54C "\uACC4\uC815 \uC804\uD658" \uBC84\uD2BC \uB178\uCD9C (\uB85C\uADF8\uC544\uC6C3 \u2192 \uB2E4\uB978 \uACC4\uC815 \uC7AC\uB85C\uADF8\uC778)
      setShown(actions, true, 'flex');
      setShown(switchBtn, true);
      bindAgentSwitch(switchBtn, t.provider, el);
    } catch {
      if (!agentStatusRefreshCoordinator.canApply(refreshLease)) return;
      el.textContent = '\u26A0\uFE0F \uC0C1\uD0DC \uD655\uC778 \uC2E4\uD328 \u2014 \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4';
      el.style.color = '#b45309';
    }
  }));
}

function readSecretInputValue(inputId: string, currentValue?: string): string | undefined {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  const current = currentValue?.trim();
  const safeCurrent = current && !isMaskedSecretValue(current) ? current : undefined;
  const realValue = input?.dataset?.realValue?.trim();
  if (realValue && !isMaskedSecretValue(realValue)) return realValue;

  const raw = input?.value?.trim();
  if (!raw) return undefined;
  if (isMaskedSecretValue(raw)) return safeCurrent;
  return raw;
}

export async function initPriceInfoModal(): Promise<void> {
  // ✅ 가격 정보 모달 열기/닫기 로직 추가
  const openPriceInfoBtn = document.getElementById('open-price-info-btn');
  const priceInfoModal = document.getElementById('price-info-modal');
  const closePriceModalBtn = document.getElementById('close-price-modal-btn');
  const confirmPriceBtn = document.getElementById('confirm-price-btn');

  if (openPriceInfoBtn && priceInfoModal) {
    // 열기
    openPriceInfoBtn.addEventListener('click', () => {
      priceInfoModal.style.display = 'flex';
      priceInfoModal.setAttribute('aria-hidden', 'false');
      // ✅ [2026-03-19] 모달 열릴 때 통합 대시보드 자동 갱신
      refreshApiCostDashboard();
    });

    // 닫기 함수
    const closePriceModal = () => {
      priceInfoModal.style.display = 'none';
      priceInfoModal.setAttribute('aria-hidden', 'true');
    };

    if (closePriceModalBtn) closePriceModalBtn.addEventListener('click', closePriceModal);
    if (confirmPriceBtn) confirmPriceBtn.addEventListener('click', closePriceModal);

    // 배경 클릭 닫기
    priceInfoModal.addEventListener('click', (e) => {
      if (e.target === priceInfoModal) closePriceModal();
    });
  }

  // ✅ 비용표·추천 모달 공통 열기 — 우측 상단 재오픈 버튼 + 엔진 설정 진입 자동 표시에서 재사용.
  const openPriceModal = () => {
    if (!priceInfoModal) return;
    priceInfoModal.style.display = 'flex';
    priceInfoModal.setAttribute('aria-hidden', 'false');
    try { refreshApiCostDashboard(); } catch { /* ignore */ }
  };

  // 우측 상단 고정 재오픈 버튼 — 사용자가 닫아도 언제든 다시 볼 수 있게.
  const reopenPriceInfoBtn = document.getElementById('reopen-price-info-btn');
  if (reopenPriceInfoBtn) reopenPriceInfoBtn.addEventListener('click', openPriceModal);

  // AI 텍스트 엔진 설정 진입 시 비용표·추천을 "먼저" 1회 자동 표시 (사용자 요청 — Gemini 쪽에 묻으면 안 봄).
  const navTextEngineBtn = document.getElementById('nav-text-engine-btn');
  if (navTextEngineBtn && priceInfoModal) {
    navTextEngineBtn.addEventListener('click', () => {
      if ((window as any).__priceModalAutoShown) return; // 세션 1회만 — 매번 띄워 귀찮게 하지 않음
      (window as any).__priceModalAutoShown = true;
      // 섹션 전환 직후 자연스럽게: 약간의 지연 후 모달 표시
      setTimeout(openPriceModal, 350);
    });
  }

  // ✅ [2026-03-19] 통합 API 비용 대시보드 초기화
  initApiCostDashboard();


  // ✅ [2026-03-18] Gemini API 할당량 확인 버튼 이벤트 (정확한 공식 데이터 기반)
  const geminiQuotaCheckBtn = document.getElementById('gemini-quota-check-btn');
  const geminiQuotaResult = document.getElementById('gemini-quota-result');
  if (geminiQuotaCheckBtn && geminiQuotaResult) {
    geminiQuotaCheckBtn.addEventListener('click', async () => {
      const apiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
      const apiKey = apiKeyInput?.value?.trim();

      if (!apiKey) {
        geminiQuotaResult.style.display = 'block';
        geminiQuotaResult.innerHTML = '⚠️ <b>API 키를 먼저 입력해주세요.</b>';
        return;
      }

      geminiQuotaResult.style.display = 'block';
      geminiQuotaResult.innerHTML = '⏳ <b>할당량 확인 중...</b>';
      (geminiQuotaCheckBtn as HTMLButtonElement).disabled = true;

      try {
        const result = await window.api.checkGeminiQuota(apiKey);

        if (!result.success) {
          const msg = (result.message || '확인 실패').replace(/\\n/g, '<br>');
          geminiQuotaResult.innerHTML = `❌ <b>${msg}</b>`;
          return;
        }

        const d = result.data;
        if (!d) { geminiQuotaResult.innerHTML = `❌ <b>데이터 없음</b>`; return; }

        // ✅ [2026-03-19] 100점 UX 개선 — 중복 제거, 단일 라인, AI Studio 링크
        const tracker = d.usageTracker || { totalInputTokens: 0, totalOutputTokens: 0, totalCalls: 0, estimatedCostUSD: 0 };
        const budget = d.creditBudget || 300;
        const usedCost = tracker.estimatedCostUSD || 0;
        const isFree = d.userPlanType === 'free';
        const isAutoPlan = d.userPlanType === 'auto';
        const pct = isFree ? 0 : Math.min(100, (usedCost / budget) * 100);
        const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';

        // 토큰 포맷 헬퍼 (1,234,567 → 1.2M | 45,678 → 45.7K)
        const fmtTokens = (n: number) => n >= 1_000_000 ? (n/1_000_000).toFixed(1)+'M' : n >= 1_000 ? (n/1_000).toFixed(1)+'K' : String(n);

        // ✅ [2026-03-19] 다크 배경 강제 적용으로 텍스트 가독성 보장
        let html = `<div style="background:rgba(15,17,25,0.95);border-radius:12px;padding:16px;color:#e2e8f0;">`;
        html += `<div style="text-align:center;margin-bottom:12px;">`;

        if (isFree) {
          // 무료 플랜: 비용 없음 표시
          html += `<div style="font-size:1.5rem;font-weight:700;color:#22c55e;">🆓 무료 플랜</div>`;
          html += `<div style="font-size:0.75rem;color:#94a3b8;">비용이 발생하지 않습니다 (분당 15회 제한)</div>`;
        } else if (isAutoPlan) {
          html += `<div style="font-size:1.5rem;font-weight:800;color:#22c55e;">⚙️ 자동 감지</div>`;
          html += `<div style="font-size:0.75rem;color:#94a3b8;">보조 무료 키 우선 사용 · 메인 키 비용은 사용량 기준 추적</div>`;
        } else {
          // 유료 플랜: "$X / $Y 예산" 단일 라인 (중복 제거)
          html += `<div style="font-size:2rem;font-weight:800;color:${barColor};letter-spacing:-1px;">`;
          html += `$${usedCost.toFixed(2)} <span style="color:#94a3b8;font-weight:400;">/ $${budget} 예산</span></div>`;
          html += `<div style="font-size:0.72rem;color:#94a3b8;">${pct.toFixed(1)}% 사용</div>`;
        }
        html += `</div>`;

        // 진행률 바 (명시 paid 모드만)
        if (!isFree && !isAutoPlan) {
          html += `<div style="background:rgba(255,255,255,0.1);border-radius:6px;height:8px;margin-bottom:10px;overflow:hidden;">`;
          html += `<div style="background:${barColor};height:100%;width:${pct.toFixed(1)}%;border-radius:6px;transition:width 0.5s;"></div></div>`;
        }

        // 상세 정보 (토큰은 K/M 단위로 가독성 향상)
        html += `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;font-size:0.78rem;margin-bottom:10px;color:#cbd5e1;">`;
        html += `📊 API 호출 <b>${tracker.totalCalls.toLocaleString()}회</b> | 입력 <b>${fmtTokens(tracker.totalInputTokens)}</b> | 출력 <b>${fmtTokens(tracker.totalOutputTokens)}</b> 토큰`;
        if (tracker.firstTracked) {
          html += `<br>🕐 ${new Date(tracker.firstTracked).toLocaleDateString('ko-KR')} ~ ${tracker.lastUpdated ? new Date(tracker.lastUpdated).toLocaleDateString('ko-KR') : '현재'} 추적 중`;
        }
        html += `</div>`;

        // API 키 상태 + 모델 정보
        html += `<div style="font-size:0.78rem;color:#94a3b8;margin-bottom:10px;">`;
        html += `✅ API 키 유효 | ${d.planLabel} | 모델 ${d.totalModels}개`;
        if (d.testCallResult?.error) html += `<br>⚠️ ${d.testCallResult.error}`;
        html += `</div>`;

        if (isFree || isAutoPlan) {
          html += `<div style="background:rgba(59,130,246,0.10);border:1px solid rgba(59,130,246,0.25);border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:0.72rem;color:#bfdbfe;line-height:1.55;">`;
          html += `<b>${isAutoPlan ? '자동 모드 한도 안내' : '무료 글 생성 한도'}</b><br>`;
          html += `Flash: 250회/일 · 10회/분<br>`;
          html += `Flash-Lite: 1,000회/일 · 15회/분<br>`;
          html += `Pro: 100회/일 · 5회/분<br>`;
          html += `429 오류는 RPM(분당), TPM(토큰), RPD(일일) 중 하나를 넘었다는 뜻입니다. 한도는 API 키가 아니라 Google AI Studio 프로젝트 단위이며, 일일 한도는 태평양 시간 자정에 초기화됩니다.`;
          html += `</div>`;
        }

        // 예산 설정 + 초기화 (명시 paid 모드만)
        if (!isFree && !isAutoPlan) {
          html += `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">`;
          html += `<label style="font-size:0.75rem;color:#94a3b8;">예산($):</label>`;
          html += `<input type="number" id="gemini-budget-input" value="${budget}" min="1" max="99999" step="10" style="width:80px;padding:3px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#e2e8f0;font-size:0.8rem;">`;
          html += `<button id="gemini-budget-save-btn" style="padding:3px 10px;border-radius:4px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.15);color:#93c5fd;font-size:0.75rem;cursor:pointer;">저장</button>`;
          html += `<button id="gemini-usage-reset-btn" style="padding:3px 10px;border-radius:4px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#fca5a5;font-size:0.75rem;cursor:pointer;">🔄 초기화</button>`;
          html += `</div>`;
        }

        // ✅ [v1.4.50] Safety Lock 안내 + Google Cloud Budget Alert 링크 (명시 paid 모드만)
        if (!isFree && !isAutoPlan) {
          html += `<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:0.72rem;color:#86efac;line-height:1.5;">`;
          html += `🛡️ <b>Safety Lock 활성화됨</b> — 설정한 예산 도달 시 앱에서 자동 차단합니다.<br>`;
          html += `90% 도달 시 콘솔에 경고 로그 출력, 100% 도달 시 Gemini 호출이 즉시 중단됩니다.<br>`;
          html += `<a href="#" id="gcloud-budget-alert-link" style="color:#fbbf24;text-decoration:underline;font-weight:600;">⭐ Google Cloud 공식 예산 알림 설정하기 (권장)</a>`;
          html += `</div>`;
        }

        // 안내 문구 (추정치 이유 설명 + AI Studio 링크)
        html += `<div style="font-size:0.7rem;color:#64748b;line-height:1.5;">`;
        html += `⚠️ 앱에서 추적 가능한 호출만 집계된 <b>추정치</b>입니다. (Gemini 2.5 thinking 토큰 포함)<br>`;
        html += `정확한 청구 금액은 <a href="#" id="aistudio-billing-link" style="color:#93c5fd;text-decoration:underline;">Google AI Studio</a>에서 확인하세요.`;
        html += `</div>`;
        html += `</div>`; // 다크 배경 래퍼 닫기

        geminiQuotaResult.innerHTML = html;

        // 이벤트 바인딩 (예산 저장 / 초기화 / 링크)
        document.getElementById('gemini-budget-save-btn')?.addEventListener('click', async () => {
          const v = Math.max(1, Number((document.getElementById('gemini-budget-input') as HTMLInputElement)?.value) || 300);
          try { await (window.api as any).setGeminiCreditBudget(v); toastManager.success(`💰 예산 $${v} 설정!`); } catch { toastManager.error('예산 설정 실패'); }
        });
        document.getElementById('gemini-usage-reset-btn')?.addEventListener('click', async () => {
          if (!confirm('사용량 추적을 초기화하시겠습니까?')) return;
          try { await (window.api as any).resetGeminiUsageTracker(); toastManager.success('🔄 초기화 완료!'); geminiQuotaCheckBtn.click(); } catch { toastManager.error('초기화 실패'); }
        });
        document.getElementById('aistudio-billing-link')?.addEventListener('click', (e) => { e.preventDefault(); window.api.openExternalUrl('https://aistudio.google.com/apikey'); });
        document.getElementById('gcloud-budget-alert-link')?.addEventListener('click', (e) => { e.preventDefault(); window.api.openExternalUrl('https://console.cloud.google.com/billing/budgets'); });

      } catch (err: any) {
        geminiQuotaResult.innerHTML = `❌ <b>오류:</b> ${err?.message || '알 수 없는 오류'}`;
      } finally {
        (geminiQuotaCheckBtn as HTMLButtonElement).disabled = false;
      }
    });
  }

  // ✅ [2026-03-18] API 키 표시/숨김 (👁 눈 아이콘) 토글 - 범용 헬퍼
  function setupApiKeyToggle(inputId: string, toggleId: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement;
    const toggle = document.getElementById(toggleId) as HTMLButtonElement;
    if (input && toggle) {
      toggle.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggle.textContent = isPassword ? '🙈' : '👁';
        toggle.title = isPassword ? 'API 키 숨기기' : 'API 키 표시/숨기기';
      });
    }
  }
  setupApiKeyToggle('gemini-api-key', 'gemini-api-key-toggle');
  setupApiKeyToggle('leonardoai-api-key', 'leonardoai-api-key-toggle');
  setupApiKeyToggle('perplexity-api-key', 'perplexity-api-key-toggle');
  setupApiKeyToggle('openai-api-key', 'openai-api-key-toggle');
  setupApiKeyToggle('claude-api-key', 'claude-api-key-toggle');
  setupApiKeyToggle('deepinfra-api-key', 'deepinfra-api-key-toggle');

  // ✅ [2026-03-18] 범용 API 키 유효성 검증 헬퍼
  function setupApiKeyValidation(
    provider: string,
    inputId: string,
    btnId: string,
    resultId: string,
    displayName: string
  ): void {
    const btn = document.getElementById(btnId) as HTMLButtonElement;
    const resultEl = document.getElementById(resultId);
    if (!btn || !resultEl) return;

    btn.addEventListener('click', async () => {
      const input = document.getElementById(inputId) as HTMLInputElement;
      const apiKey = input?.value?.trim();

      if (!apiKey) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = `⚠️ <b>${displayName} API 키를 먼저 입력해주세요.</b>`;
        return;
      }

      resultEl.style.display = 'block';
      resultEl.innerHTML = `⏳ <b>${displayName} API 키 확인 중...</b>`;
      btn.disabled = true;

      try {
        const result = await window.api.validateApiKey(provider, apiKey);

        if (result.success) {
          let html = `✅ <b>${displayName} API 키 유효!</b><br>`;
          if (result.details) html += `📋 ${result.details}`;

          // ✅ [2026-03-19] 잔액/사용량 카드 렌더링
          if (result.balance) {
            const b = result.balance;
            const hasRemaining = b.remaining && b.remaining !== '';
            const hasTotal = b.total && b.total !== '';
            const hasTokens = (b.totalInputTokens || 0) > 0 || (b.totalOutputTokens || 0) > 0;
            const hasImages = (b.totalImages || 0) > 0;

            // 추적 기간 계산
            let periodText = '';
            if (b.firstTracked) {
              const first = new Date(b.firstTracked);
              const now = new Date();
              const days = Math.max(1, Math.ceil((now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)));
              periodText = `${days}일간`;
            }

            html += `<div style="margin-top:10px;padding:12px 14px;background:rgba(15,23,42,0.85);border-radius:10px;border:1px solid rgba(99,102,241,0.25);color:#e2e8f0;font-size:12.5px;line-height:1.7;">`;

            // 잔액/충전금액 (있으면 강조 표시)
            if (hasRemaining) {
              html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">`;
              html += `<span style="color:#94a3b8;">💰 잔액</span>`;
              html += `<span style="color:#22d3ee;font-weight:700;font-size:15px;">${b.remaining}</span>`;
              html += `</div>`;
            }
            if (hasTotal) {
              html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">`;
              html += `<span style="color:#94a3b8;">💳 충전</span>`;
              html += `<span style="color:#a78bfa;font-weight:600;">${b.total}</span>`;
              html += `</div>`;
            }
            if (hasRemaining || hasTotal) {
              html += `<hr style="border:none;border-top:1px solid rgba(99,102,241,0.15);margin:6px 0;">`;
            }

            // 앱 내 누적 사용량
            html += `<div style="color:#94a3b8;font-size:11px;margin-bottom:4px;">📊 앱 내 누적 사용량 ${periodText ? `(${periodText})` : ''}</div>`;
            html += `<div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">비용</span><span style="color:#fbbf24;font-weight:600;">${b.usedCost}</span></div>`;
            html += `<div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">호출</span><span>${b.totalCalls.toLocaleString()}회</span></div>`;
            if (hasTokens) {
              html += `<div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">토큰</span><span>${(b.totalInputTokens + b.totalOutputTokens).toLocaleString()}</span></div>`;
            }
            if (hasImages) {
              html += `<div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">이미지</span><span>${b.totalImages.toLocaleString()}장</span></div>`;
            }

            // 대시보드 링크 + 잔액 미표시 시 안내
            if (b.dashboardUrl) {
              if (!hasRemaining) {
                // 잔액 조회 불가 시 — 눈에 띄는 버튼 스타일 링크
                html += `<div style="margin-top:10px;text-align:center;">`;
                html += `<div style="font-size:10.5px;color:#64748b;margin-bottom:6px;">⚠️ 이 제공자는 API로 잔액 조회를 지원하지 않습니다</div>`;
                html += `<a href="#" onclick="window.api?.openExternalUrl?.('${b.dashboardUrl}');return false;" style="display:inline-block;padding:6px 16px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:6px;color:#a5b4fc;text-decoration:none;font-size:12px;font-weight:600;transition:all 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.25)'" onmouseout="this.style.background='rgba(99,102,241,0.15)'" >🔗 대시보드에서 잔액 확인</a>`;
                html += `</div>`;
              } else {
                html += `<div style="margin-top:8px;text-align:center;">`;
                html += `<a href="#" onclick="window.api?.openExternalUrl?.('${b.dashboardUrl}');return false;" style="color:#818cf8;text-decoration:none;font-size:11.5px;">🔗 대시보드에서 상세 확인 →</a>`;
                html += `</div>`;
              }
            }

            html += `</div>`;
          }

          resultEl.innerHTML = html;
          resultEl.style.borderColor = 'rgba(34, 197, 94, 0.4)';
          resultEl.style.background = 'rgba(34, 197, 94, 0.08)';
        } else {
          resultEl.innerHTML = `❌ <b>${result.message || '유효하지 않은 API 키입니다.'}</b>`;
          resultEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          resultEl.style.background = 'rgba(239, 68, 68, 0.08)';
        }
      } catch (err: any) {
        resultEl.innerHTML = `❌ <b>오류:</b> ${err?.message || '알 수 없는 오류'}`;
        resultEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        resultEl.style.background = 'rgba(239, 68, 68, 0.08)';
      } finally {
        btn.disabled = false;
      }
    });
  }

  setupApiKeyValidation('leonardoai', 'leonardoai-api-key', 'leonardoai-validate-btn', 'leonardoai-validate-result', 'Leonardo AI');
  setupApiKeyValidation('perplexity', 'perplexity-api-key', 'perplexity-validate-btn', 'perplexity-validate-result', 'Perplexity');
  setupApiKeyValidation('openai', 'openai-api-key', 'openai-validate-btn', 'openai-validate-result', 'OpenAI');
  setupApiKeyValidation('claude', 'claude-api-key', 'claude-validate-btn', 'claude-validate-result', 'Claude');
  setupApiKeyValidation('deepinfra', 'deepinfra-api-key', 'deepinfra-validate-btn', 'deepinfra-validate-result', 'DeepInfra');

  // ✅ [v2.10.218] 덕테이프 인증 버튼 — OpenAI Organization 인증 페이지 열기
  const ducttapeVerifyBtn = document.getElementById('openai-org-verify-btn') as HTMLButtonElement | null;
  if (ducttapeVerifyBtn) {
    ducttapeVerifyBtn.addEventListener('click', async () => {
      try {
        await (window as any).api?.openExternalUrl?.('https://platform.openai.com/settings/organization/general');
      } catch (e) {
        console.error('[Settings] 덕테이프 인증 페이지 열기 실패:', e);
        alert('OpenAI 인증 페이지를 열 수 없습니다.\n수동으로 https://platform.openai.com/settings/organization/general 접속해주세요.');
      }
    });
  }

  // ✅ [v2.7.95] 데이터 백업/복원 버튼 핸들러
  const backupCreateBtn = document.getElementById('backup-create-btn') as HTMLButtonElement | null;
  const backupListBtn = document.getElementById('backup-list-btn') as HTMLButtonElement | null;
  const backupResult = document.getElementById('backup-result') as HTMLDivElement | null;
  const backupListContainer = document.getElementById('backup-list-container') as HTMLDivElement | null;

  if (backupCreateBtn) {
    backupCreateBtn.addEventListener('click', async () => {
      backupCreateBtn.disabled = true;
      const orig = backupCreateBtn.innerHTML;
      backupCreateBtn.innerHTML = '<span>🔄</span><span>백업 생성 중...</span>';
      try {
        const r = await (window as any).api.backupCreate('manual');
        if (backupResult) {
          backupResult.style.display = 'block';
          if (r?.success) {
            backupResult.style.background = 'rgba(34, 197, 94, 0.12)';
            backupResult.style.color = '#22c55e';
            backupResult.innerHTML = `✅ 백업 완료: ${(r.backupPath || '').replace(/^.*[\\/]/, '')}`;
          } else {
            backupResult.style.background = 'rgba(239, 68, 68, 0.12)';
            backupResult.style.color = '#ef4444';
            backupResult.innerHTML = `❌ 백업 실패: ${r?.message || 'unknown'}`;
          }
        }
      } finally {
        backupCreateBtn.disabled = false;
        backupCreateBtn.innerHTML = orig;
      }
    });
  }

  if (backupListBtn && backupListContainer) {
    backupListBtn.addEventListener('click', async () => {
      try {
        const r = await (window as any).api.backupList();
        backupListContainer.style.display = 'block';
        if (!r?.success || !r.backups || r.backups.length === 0) {
          backupListContainer.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); text-align: center;">백업이 없습니다. 먼저 [지금 백업하기]를 눌러주세요.</div>';
          return;
        }
        backupListContainer.innerHTML = r.backups.map((b: any) => {
          const date = new Date(b.mtime).toLocaleString('ko-KR');
          const isAuto = b.name.includes('-auto');
          return `<div style="display: flex; gap: 0.5rem; align-items: center; padding: 0.6rem; background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.15); border-radius: 8px; margin-bottom: 0.5rem;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 0.8rem; color: var(--text-strong); font-weight: 600; word-break: break-all;">${b.name}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${date} ${isAuto ? '(자동)' : '(수동)'}</div>
            </div>
            <button type="button" class="restore-backup-btn" data-path="${b.path.replace(/"/g, '&quot;')}"
              style="padding: 0.4rem 0.7rem; background: #22c55e; color: white; border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; white-space: nowrap;">
              📥 복원
            </button>
          </div>`;
        }).join('');

        backupListContainer.querySelectorAll('.restore-backup-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const target = e.currentTarget as HTMLButtonElement;
            const backupPath = target.dataset.path || '';
            if (!confirm(`이 백업으로 복원하시겠습니까?\n\n${backupPath.replace(/^.*[\\/]/, '')}\n\n현재 데이터는 자동으로 별도 백업되며, 복원 후 앱을 재시작해야 합니다.`)) return;
            target.disabled = true;
            target.textContent = '복원 중...';
            try {
              const rr = await (window as any).api.backupRestore(backupPath);
              if (rr?.success) {
                alert(`✅ ${rr.message}\n\n앱을 재시작합니다.`);
                location.reload();
              } else {
                alert(`❌ 복원 실패: ${rr?.message || 'unknown'}`);
                target.disabled = false;
                target.textContent = '📥 복원';
              }
            } catch (err: any) {
              alert(`❌ 복원 오류: ${err?.message}`);
              target.disabled = false;
              target.textContent = '📥 복원';
            }
          });
        });
      } catch (e: any) {
        if (backupListContainer) {
          backupListContainer.style.display = 'block';
          backupListContainer.innerHTML = `<div style="padding: 1rem; color: #ef4444;">목록 조회 실패: ${e?.message}</div>`;
        }
      }
    });
  }

  // ✅ 이미지 경로 설정 버튼 이벤트
  const browseImagePathBtn = document.getElementById('browse-image-path-btn') as HTMLButtonElement;
  const resetImagePathBtn = document.getElementById('reset-image-path-btn') as HTMLButtonElement;
  const customImageSavePathInput = document.getElementById('custom-image-save-path') as HTMLInputElement;

  // 폴더 선택 버튼
  if (browseImagePathBtn) {
    browseImagePathBtn.addEventListener('click', async () => {
      try {
        if (!window.api.showOpenDialog) {
          alert('폴더 선택 기능을 사용할 수 없습니다.');
          return;
        }

        const result = await window.api.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          title: '이미지 저장 폴더 선택',
          buttonLabel: '선택'
        });

        if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
          const selectedPath = result.filePaths[0].replace(/\\/g, '/');
          customImageSavePathInput.value = selectedPath;
          appendLog(`📁 이미지 저장 경로 선택: ${selectedPath}`);
          toastManager.success('폴더가 선택되었습니다!');
        }
      } catch (error) {
        console.error('폴더 선택 오류:', error);
        alert(`폴더 선택 중 오류가 발생했습니다: ${(error as Error).message}`);
      }
    });
  }

  // 기본값으로 재설정 버튼
  if (resetImagePathBtn) {
    resetImagePathBtn.addEventListener('click', async () => {
      customImageSavePathInput.value = '';

      alert('이미지 저장 경로가 초기화되었습니다.\n\n환경설정에서 이미지 저장 폴더를 다시 선택해주세요.');
      appendLog('📁 이미지 저장 경로 초기화 (재설정 필요)');
    });
  }

  const geminiApiKey = document.getElementById('gemini-api-key') as HTMLInputElement;
  const geminiExtraApiKeys = document.getElementById('gemini-extra-api-keys') as HTMLTextAreaElement | null;
  const geminiFreeQuotaFirst = document.getElementById('gemini-free-quota-first') as HTMLInputElement | null;
  const unsplashApiKey = document.getElementById('unsplash-api-key') as HTMLInputElement;
  const pixabayApiKey = document.getElementById('pixabay-api-key') as HTMLInputElement;
  const prodiaTokenInput = document.getElementById('prodia-token') as HTMLInputElement | null;
  const prodiaModelSelect = document.getElementById('prodia-model-select') as HTMLSelectElement | null;
  const naverClientId = document.getElementById('naver-client-id') as HTMLInputElement; // ✅ 네이버 API
  const naverClientSecret = document.getElementById('naver-client-secret') as HTMLInputElement; // ✅ 네이버 API
  const dailyPostLimit = document.getElementById('daily-post-limit') as HTMLInputElement;
  const freeQuotaPublish = document.getElementById('free-quota-publish') as HTMLInputElement;
  const freeQuotaContent = document.getElementById('free-quota-content') as HTMLInputElement;
  const freeQuotaMedia = document.getElementById('free-quota-media') as HTMLInputElement;
  const externalApiCostConsent = document.getElementById('external-api-cost-consent') as HTMLInputElement;
  const externalApiPerRunImageLimit = document.getElementById('external-api-per-run-image-limit') as HTMLInputElement;
  const externalApiDailyImageLimit = document.getElementById('external-api-daily-image-limit') as HTMLInputElement;
  const externalApiUsageText = document.getElementById('external-api-usage-text') as HTMLParagraphElement;
  const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
  const settingsApi = (window as any).api;
  const isBrowserPreview = settingsApi?.__browserPreview === true;
  const hasSettingsBridge = !isBrowserPreview && typeof settingsApi?.getConfig === 'function';

  // The static browser preview does not receive Electron's preload bridge.
  // Render safe defaults there instead of treating the missing bridge as a settings failure.
  if (!hasSettingsBridge) {
    console.info('[Settings] Browser preview detected. Electron settings bridge is unavailable.');
    if (saveSettingsBtn) {
      saveSettingsBtn.disabled = true;
      saveSettingsBtn.setAttribute('aria-disabled', 'true');
      saveSettingsBtn.title = '브라우저 미리보기에서는 환경설정을 저장할 수 없습니다. 앱에서 실행해 주세요.';
    }
  }

  // 설정 로드
  try {
    console.log('[Settings] 설정 로드 시작...');
    let config: any = hasSettingsBridge ? await settingsApi.getConfig() : {};
    console.log('[Settings] 설정 로드 성공:', Object.keys(config || {}).length, '개 항목');

    if (!config) {
      console.warn('[Settings] ⚠️ 설정이 null 또는 undefined입니다.');
      throw new Error('설정을 불러올 수 없습니다 (null/undefined)');
    }

    const isPackaged = typeof settingsApi?.isPackaged === 'function'
      ? await settingsApi.isPackaged()
      : true;
    console.log('[Settings] 배포 모드:', isPackaged);

    const rawLoadedTextModel = config.primaryGeminiTextModel || 'gemini-3.5-flash';
    const normalizedLoadedConfig = String(rawLoadedTextModel).startsWith('gemini-')
      ? { ...config, primaryGeminiTextModel: normalizeGeminiTextModelId(rawLoadedTextModel) }
      : config;
    const persistedTextModel = resolvePersistedTextModelConfig(
      normalizedLoadedConfig,
      isPackaged,
    );
    if (persistedTextModel.changed && hasSettingsBridge) {
      try {
        await settingsApi.saveConfig(persistedTextModel.config);
      } catch (error) {
        console.warn('[Settings] 비활성 Claude 구독 설정 자동 마이그레이션 저장 실패:', error);
      }
    }
    config = persistedTextModel.config;

    // 사용자 프로필 필드
    const userDisplayName = document.getElementById('user-display-name') as HTMLInputElement;
    const userEmail = document.getElementById('user-email') as HTMLInputElement;
    const userTimezone = document.getElementById('user-timezone') as HTMLSelectElement;

    // 고급 설정 필드
    const enableDebugMode = document.getElementById('enable-debug-mode') as HTMLInputElement;
    const autoSaveDrafts = document.getElementById('auto-save-drafts') as HTMLInputElement;
    const backupFrequency = document.getElementById('backup-frequency') as HTMLSelectElement;

    // 배포용 vs 개발용 모드 처리
    if (isPackaged) {
      // 배포용: 개발자 전용 기능 숨김
      document.querySelectorAll('.dev-only').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    } else {
      // 개발용: 모든 설정 표시 (개발자 전용 기능 포함)
      document.querySelectorAll('.dev-only').forEach(el => {
        (el as HTMLElement).style.display = 'block';
      });
    }

    // 패키지 환경에서도 API 키를 로드하고 표시 (입력 가능하도록)
    if (geminiApiKey) {
      geminiApiKey.value = config.geminiApiKey || '';
      if (config.geminiApiKey) {
        console.log('[Settings] Gemini API 키 로드됨:', config.geminiApiKey ? '✅' : '❌');
      }
    }
    if (geminiExtraApiKeys) {
      geminiExtraApiKeys.value = Array.isArray((config as any).geminiApiKeys)
        ? (config as any).geminiApiKeys.join('\n')
        : '';
    }
    if (geminiFreeQuotaFirst) {
      geminiFreeQuotaFirst.checked = (config as any).geminiUseFreeQuotaBeforePaid !== false;
    }

    // ✅ [2026-02-23] OpenAI Image API 키는 OpenAI API 키와 통합됨 (별도 입력 필드 제거)

    // ✅ [2026-02-22] Leonardo AI API 키 로드
    const leonardoaiApiKeyInput = document.getElementById('leonardoai-api-key') as HTMLInputElement;
    if (leonardoaiApiKeyInput) {
      leonardoaiApiKeyInput.value = (config as any).leonardoaiApiKey || '';
      if ((config as any).leonardoaiApiKey) {
        console.log('[Settings] Leonardo AI API 키 로드됨:', (config as any).leonardoaiApiKey ? '✅' : '❌');
      }
    }



    // ✅ [2026-01-26] DeepInfra API 키 로드
    const deepinfraApiKeyInput = document.getElementById('deepinfra-api-key') as HTMLInputElement;
    if (deepinfraApiKeyInput) {
      deepinfraApiKeyInput.value = config.deepinfraApiKey || '';
      if (config.deepinfraApiKey) {
        console.log('[Settings] DeepInfra API 키 로드됨:', config.deepinfraApiKey ? '✅' : '❌');
      }
    }

    // ✅ [2026-02-22] OpenAI API 키 로드
    const openaiApiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
    if (openaiApiKeyInput) {
      openaiApiKeyInput.value = config.openaiApiKey || '';
      if (config.openaiApiKey) {
        console.log('[Settings] OpenAI API 키 로드됨:', config.openaiApiKey ? '✅' : '❌');
      }
    }

    // ✅ [2026-02-22] Claude API 키 로드
    const claudeApiKeyInput = document.getElementById('claude-api-key') as HTMLInputElement;
    if (claudeApiKeyInput) {
      claudeApiKeyInput.value = config.claudeApiKey || '';
      if (config.claudeApiKey) {
        console.log('[Settings] Claude API 키 로드됨:', config.claudeApiKey ? '✅' : '❌');
      }
    }

    // ✅ [2026-03-30] Perplexity API 키 로드 (누락 수정)
    const perplexityApiKeyInput = document.getElementById('perplexity-api-key') as HTMLInputElement;
    if (perplexityApiKeyInput) {
      perplexityApiKeyInput.value = config.perplexityApiKey || '';
      if (config.perplexityApiKey) {
        console.log('[Settings] Perplexity API 키 로드됨:', config.perplexityApiKey ? '✅' : '❌');
      }
    }

    // ✅ Gemini 모델 선택 로드
    const geminiModelSelect = document.getElementById('settings-gemini-model') as HTMLSelectElement;
    if (geminiModelSelect) {
      geminiModelSelect.value = normalizeGeminiTextModelId(config.geminiModel || 'gemini-3.5-flash');
      console.log('[Settings] Gemini 모델 로드됨:', geminiModelSelect.value);
    }

    // ✅ Gemini 텍스트 주력 모델 라디오 버튼 로드
    // ✅ [v2.10.221] undefined여도 기본값 'gemini-2.5-flash'로 항상 라디오/라벨 복원
    {
      const rawActiveTextModel = config.primaryGeminiTextModel || 'gemini-3.5-flash';
      const activeTextModel = String(rawActiveTextModel).startsWith('gemini-')
        ? normalizeGeminiTextModelId(rawActiveTextModel)
        : rawActiveTextModel;
      const modelRadios = document.getElementsByName('primaryGeminiTextModel') as NodeListOf<HTMLInputElement>;
      modelRadios.forEach(radio => {
        radio.checked = (radio.value === activeTextModel);
      });
      console.log('[Settings] Gemini 텍스트 주력 모델 로드됨:', activeTextModel, '(원본:', config.primaryGeminiTextModel || 'undefined', ')');

      // ✅ [2026-02-22 FIX] 로드 시 nav-text-engine-status UI 업데이트
      // ✅ [v2.7.78] deprecate 모델 ID 자동 마이그레이션 + 기본값 보장
      const navStatusEl = document.getElementById('nav-text-engine-status');
      if (navStatusEl) {
        // [v1.4.32] 가격 표시 추가 — 사용자가 어떤 비용을 쓰는지 한눈에
        const modelNames: Record<string, string> = {
          'gemini-3.1-flash-lite': '💰 Gemini 3.1 Flash-Lite (가성비)',
          'gemini-3.5-flash': '⚖️ Gemini 3.5 Flash (균형) ★ 기본',
          'gemini-3.1-pro-preview': '👑 Gemini 3.1 Pro Preview (프리미엄)',
          'perplexity-sonar': '🔮 Perplexity Sonar (~₩32/글)',
          'openai-gpt4o-mini': '🧠 GPT-5.6 Luna (가성비)',
          'openai-gpt41': '⚖️ GPT-5.6 Terra (균형)',
          'openai-gpt4o': '🚀 GPT-5.6 Sol (프리미엄)',
          'openai-gpt4o-search': '🔎 GPT-5.6 웹 검색 (Responses API)',
          'claude-sonnet': '📜 Claude Sonnet 5 (균형)',
          'claude-opus': '👑 Claude Fable 5 (프리미엄)',
          'agent-codex': '🤖 에이전트 (Codex · 별도 API 키 불필요)',
          'agent-claude': '🤖 에이전트 (Claude 구독 · 배포 앱 비활성)',
        };
        navStatusEl.textContent = `현재: ${modelNames[activeTextModel] || activeTextModel}`;
      }
      // ✅ 에이전트 모드 설치/로그인 상태 뱃지 갱신 (비동기 — 로드 차단 안 함)
      void refreshAgentStatusBadges();
    }

    // ✅ [2026-06-05] Gemini 플랜 로드 (텍스트+이미지 공통)
    //   사용자가 무료/유료를 고르지 않아도 앱이 자동 라우팅한다.
    //   과거 free/paid 값은 호환용으로 읽되, 신규 기본값은 auto.
    const planType = config.geminiPlanType || 'auto';
    const planRadios = document.getElementsByName('geminiPlanType') as NodeListOf<HTMLInputElement>;
    planRadios.forEach(radio => {
      if (radio.value === planType) {
        radio.checked = true;
      }
    });
    console.log('[Settings] Gemini 플랜 로드됨:', planType);

    try {
      const unifiedGeminiModel = document.getElementById('unified-gemini-model') as HTMLSelectElement | null;
      if (unifiedGeminiModel) {
        unifiedGeminiModel.value = normalizeGeminiTextModelId(config.geminiModel || 'gemini-3.5-flash');
      }
    } catch (e) {
      console.warn('[priceInfoModal] catch ignored:', e);
    }

    // ✅ [2026-02-22 FIX] 앱 시작 시 defaultAiProvider → unified-generator 동기화
    // 환경설정에서 Perplexity 선택 시에도 hidden input이 gemini로 고정되던 버그 수정
    try {
      const unifiedGenerator = document.getElementById('unified-generator') as HTMLInputElement | null;
      const aiProvider = config.defaultAiProvider || 'gemini';
      if (unifiedGenerator && unifiedGenerator.value !== aiProvider) {
        unifiedGenerator.value = aiProvider;
        console.log(`[Settings] ✅ unified-generator 초기 동기화: ${aiProvider}`);
      }
    } catch (e) {
      console.warn('[priceInfoModal] catch ignored:', e);
    }
    if (unsplashApiKey) unsplashApiKey.value = config.unsplashApiKey || '';
    if (pixabayApiKey) pixabayApiKey.value = config.pixabayApiKey || '';
    if (prodiaTokenInput) {
      prodiaTokenInput.value = (config as any).prodiaApiKey || (config as any).prodiaToken || (config as any)['prodia-token'] || '';
    }
    if (prodiaModelSelect) {
      prodiaModelSelect.value = (config as any).prodiaModel || (config as any)['prodia-model'] || 'sdxl';
    }
    if (naverClientId) {
      naverClientId.value = config.naverClientId || config.naverDatalabClientId || '';
      if (config.naverClientId || config.naverDatalabClientId) {
        console.log('[Settings] 네이버 Client ID 로드됨:', (config.naverClientId || config.naverDatalabClientId) ? '✅' : '❌');
      }
    }
    if (naverClientSecret) {
      const storedNaverSecret = config.naverClientSecret || config.naverDatalabClientSecret || '';
      // [2026-06-30] 과거 마스킹 저장 버그로 손상된 키(• 포함)는 입력칸에 다시 넣지 않는다.
      //   넣으면 재저장 시에도 마스킹이 안 풀려 영구 stuck → 빈칸 + 안내로 재입력을 유도한다.
      if (isMaskedSecretValue(storedNaverSecret)) {
        naverClientSecret.value = '';
        naverClientSecret.placeholder = '키가 손상되어 비워졌습니다 — Client Secret을 다시 입력해 주세요';
        console.warn('[Settings] 네이버 Client Secret이 손상(마스킹)되어 있어 비웠습니다 — 재입력 필요');
      } else {
        naverClientSecret.value = storedNaverSecret;
        if (storedNaverSecret) console.log('[Settings] 네이버 Client Secret 로드됨: ✅');
      }
    }
    // ✅ 네이버 광고 API 키 로드
    const naverAdApiKey = document.getElementById('naver-ad-api-key') as HTMLInputElement;
    const naverAdSecretKey = document.getElementById('naver-ad-secret-key') as HTMLInputElement;
    const naverAdCustomerId = document.getElementById('naver-ad-customer-id') as HTMLInputElement;
    if (naverAdApiKey) {
      naverAdApiKey.value = config.naverAdApiKey || '';
      if (config.naverAdApiKey) {
        console.log('[Settings] 네이버 광고 API Key 로드됨:', config.naverAdApiKey ? '✅' : '❌');
      }
    }
    if (naverAdSecretKey) {
      naverAdSecretKey.value = config.naverAdSecretKey || '';
      if (config.naverAdSecretKey) {
        console.log('[Settings] 네이버 광고 Secret Key 로드됨:', config.naverAdSecretKey ? '✅' : '❌');
      }
    }
    if (naverAdCustomerId) {
      naverAdCustomerId.value = config.naverAdCustomerId || '';
      if (config.naverAdCustomerId) {
        console.log('[Settings] 네이버 광고 Customer ID 로드됨:', config.naverAdCustomerId);
      }
    }
    if (dailyPostLimit) dailyPostLimit.value = String(config.dailyPostLimit || 3);
    if (freeQuotaPublish) freeQuotaPublish.value = String((config as any).freeQuotaPublish ?? 2);
    if (freeQuotaContent) freeQuotaContent.value = String((config as any).freeQuotaContent ?? 5);
    if (freeQuotaMedia) freeQuotaMedia.value = String((config as any).freeQuotaMedia ?? 30);
    // ✅ [v2.7.59] 기본 이미지 저장 경로 자동 세팅 — config에 customImageSavePath 미지정 시 Downloads/naver-blog-images로 1회 채워서 저장
    if (customImageSavePathInput) {
      if (config.customImageSavePath && config.customImageSavePath.trim() !== '') {
        customImageSavePathInput.value = config.customImageSavePath;
      } else {
        try {
          const defaultPath = await (window as any).api?.getDefaultImageSavePath?.();
          if (defaultPath) {
            customImageSavePathInput.value = defaultPath;
            // config 자동 영속화 — 이후 설정 모달 진입 시 동일 경로 즉시 표시
            try {
              await (window as any).api?.saveConfig?.({ ...config, customImageSavePath: defaultPath });
              console.log(`[Settings] 📁 이미지 저장 경로 기본값 자동 세팅: ${defaultPath}`);
            } catch (e) {
              console.warn('[Settings] 기본 이미지 경로 자동 저장 실패 (무시):', e);
            }
          }
        } catch (e) {
          console.warn('[Settings] 기본 이미지 경로 IPC 실패 (무시):', e);
        }
      }
    }

    // ✅ [v2.10.59] 비용 절감 토글 4종 로드 — 기본 ON (사용자 명시 요청)
    //   기존: 기본 OFF (안전 우선)
    //   변경: 기본 ON (비용 절감 자동 적용). 사용자가 명시 OFF 시에만 비활성
    try {
      const costSaverModeEl = document.getElementById('cost-saver-mode') as HTMLInputElement | null;
      const useCompressedPromptEl = document.getElementById('use-compressed-prompt') as HTMLInputElement | null;
      const useCrawlSummaryEl = document.getElementById('use-crawl-summary') as HTMLInputElement | null;
      const subWorkProviderEl = document.getElementById('sub-work-provider') as HTMLSelectElement | null;
      // costSaverMode: undefined일 때 기본 true (자동 ON)
      if (costSaverModeEl) costSaverModeEl.checked = (config as any).costSaverMode !== false;
      // useCompressedPrompt/useCrawlSummary: 기본 OFF 유지 (실험적이라 안전)
      if (useCompressedPromptEl) useCompressedPromptEl.checked = (config as any).useCompressedPrompt === true;
      if (useCrawlSummaryEl) useCrawlSummaryEl.checked = (config as any).useCrawlSummary === true;
      if (subWorkProviderEl) subWorkProviderEl.value = (config as any).subWorkProvider || 'same';
    } catch (e) {
      console.warn('[priceInfoModal] 비용 절감 토글 로드 실패:', e);
    }

    // ✅ [v2.10.63] GEO/AEO 최적화 토글 로드 — 기본 ON (수익화 효과 우선)
    //   v2.10.62 기본 OFF → v2.10.63 기본 ON 전환
    //   undefined일 때 자동 ON. 사용자가 명시 false 저장 시에만 OFF.
    try {
      const geoOptEl = document.getElementById('geo-optimization') as HTMLInputElement | null;
      if (geoOptEl) geoOptEl.checked = (config as any).geoOptimization !== false;
    } catch (e) {
      console.warn('[priceInfoModal] GEO 최적화 토글 로드 실패:', e);
    }

    // ✅ [v2.10.73] 네이버 fact-check RAG 토글 로드 — 기본 ON (LLM 환각 차단)
    //   네이버 검색 API 키가 있을 때만 작동 (키 없으면 자동 OFF처럼 동작)
    try {
      const factCheckEl = document.getElementById('use-naver-factcheck') as HTMLInputElement | null;
      if (factCheckEl) factCheckEl.checked = (config as any).useNaverFactCheck !== false;
    } catch (e) {
      console.warn('[priceInfoModal] 네이버 fact-check 토글 로드 실패:', e);
    }

    // 자동 관련글 링크 토글 로드 — 기본 OFF (opt-in). 이전글 엮기가 이미 관련
    // 글 링크 1개를 깔끔한 oglink 카드로 달기 때문에, 자동 관련글까지 켜면 같은
    // 글로 가는 링크가 둘 나온다(추천글/다음글 중복, 2026-06-11 제보). 명시적으로
    // 켠 사용자만 ON 유지(=== true).
    try {
      const autoLinkEl = document.getElementById('auto-insert-internal-links') as HTMLInputElement | null;
      if (autoLinkEl) autoLinkEl.checked = (config as any).autoInsertInternalLinks === true;
    } catch (e) {
      console.warn('[priceInfoModal] 자동 관련글 링크 토글 로드 실패:', e);
    }

    // [v2.10.235 Phase 3-A] AI 탭 친화 모드 토글 로드 — 기본 OFF (비용·시간 ↑이므로 opt-in)
    try {
      const aiTabEl = document.getElementById('ai-tab-friendly-mode') as HTMLInputElement | null;
      if (aiTabEl) aiTabEl.checked = (config as any).aiTabFriendlyMode === true;
    } catch (e) {
      console.warn('[priceInfoModal] AI 탭 친화 모드 토글 로드 실패:', e);
    }

    // [v2.10.236 Phase 3-B] Claude Sonnet abstention 모드 토글 로드 — 기본 OFF (토큰 ×10 비용)
    try {
      const claudeAbstentionEl = document.getElementById('claude-abstention-mode') as HTMLInputElement | null;
      if (claudeAbstentionEl) claudeAbstentionEl.checked = (config as any).claudeAbstentionMode === true;
    } catch (e) {
      console.warn('[priceInfoModal] Claude abstention 모드 토글 로드 실패:', e);
    }

    // ✅ [v2.10.187 Phase 3.6+] 자동 SERP 벤치마크 토글 로드 — opt-out (기본 ON)
    //   undefined(미설정)도 ON 처리. 사용자가 명시적으로 OFF 한 경우만 unchecked.
    try {
      const serpAutoEl = document.getElementById('auto-serp-benchmark') as HTMLInputElement | null;
      if (serpAutoEl) serpAutoEl.checked = (config as any).autoSerpBenchmark !== false;
    } catch (e) {
      console.warn('[priceInfoModal] 자동 SERP 벤치마크 토글 로드 실패:', e);
    }

    try {
      if (externalApiCostConsent) externalApiCostConsent.checked = config.externalApiCostConsent === true;
      if (externalApiPerRunImageLimit) externalApiPerRunImageLimit.value = String((config as any).externalApiPerRunImageLimit ?? 10);
      if (externalApiDailyImageLimit) externalApiDailyImageLimit.value = String((config as any).externalApiDailyImageLimit ?? 30);

      if (externalApiUsageText) {
        const today = (() => {
          const d = new Date();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        })();
        const used = (config as any).externalApiDailyImageDate === today ? Number((config as any).externalApiDailyImageCount ?? 0) : 0;
        const dailyLimit = Number((config as any).externalApiDailyImageLimit ?? 30);
        externalApiUsageText.textContent = `오늘 사용량: ${used} / ${dailyLimit}장`;
      }
    } catch (e) {
      console.warn('[priceInfoModal] catch ignored:', e);
    }

    // ✅ [2026-01-16] 이미지 모델 고급 설정 로드
    try {
      const falaiModelSelect = document.getElementById('falai-model-select') as HTMLSelectElement;
      const stabilityModelSelect = document.getElementById('stability-model-select') as HTMLSelectElement;
      const nanoBananaMainModel = document.getElementById('nano-banana-main-model') as HTMLSelectElement;
      const nanoBananaSubModel = document.getElementById('nano-banana-sub-model') as HTMLSelectElement;
      // nanoBananaThumbnailModel 제거됨 (대표 이미지와 통합)
      const pollinationsModelSelect = document.getElementById('pollinations-model-select') as HTMLSelectElement;

      if (falaiModelSelect) falaiModelSelect.value = (config as any).falaiModel || 'flux-realism';
      if (stabilityModelSelect) stabilityModelSelect.value = (config as any).stabilityModel || 'sd35-large-turbo';
      if (nanoBananaMainModel) nanoBananaMainModel.value = (config as any).nanoBananaMainModel || 'gemini-3-1-flash';  // ✅ [2026-03-11] 기본값 나노바나나2로 통일
      if (nanoBananaSubModel) nanoBananaSubModel.value = (config as any).nanoBananaSubModel || 'gemini-3-1-flash';  // ✅ [2026-03-11] 기본값 나노바나나2로 통일
      if (pollinationsModelSelect) pollinationsModelSelect.value = (config as any).pollinationsModel || 'default';

      console.log('[Settings] 이미지 모델 고급 설정 로드됨:', {
        falaiModel: (config as any).falaiModel,
        stabilityModel: (config as any).stabilityModel,
        nanoBananaMainModel: (config as any).nanoBananaMainModel,
        nanoBananaSubModel: (config as any).nanoBananaSubModel,
        nanoBananaThumbnailModel: (config as any).nanoBananaThumbnailModel
      });

      // ✅ 비용표 토글 버튼 이벤트
      const togglePriceTableBtn = document.getElementById('toggle-price-table-btn');
      const priceTablePanel = document.getElementById('image-price-table-panel');
      if (togglePriceTableBtn && priceTablePanel) {
        togglePriceTableBtn.onclick = () => {
          const isVisible = priceTablePanel.style.display !== 'none';
          priceTablePanel.style.display = isVisible ? 'none' : 'block';
          togglePriceTableBtn.textContent = isVisible ? '💰 비용표 보기' : '💰 비용표 숨기기';
        };
      }

      const presetBudgetBtn = document.getElementById('preset-budget-btn');
      const imagePresetInput = document.getElementById('image-preset-input') as HTMLInputElement;
      if (presetBudgetBtn) {
        presetBudgetBtn.onclick = () => {
          if (falaiModelSelect) falaiModelSelect.value = 'flux-schnell';
          if (stabilityModelSelect) stabilityModelSelect.value = 'sdxl-1.0';
          if (nanoBananaMainModel) nanoBananaMainModel.value = 'gemini-3-1-flash';  // ✅ [2026-03-11] 가성비 = 나노바나나2 (₩97/장)
          if (nanoBananaSubModel) nanoBananaSubModel.value = 'gemini-3-1-flash';
          if (imagePresetInput) imagePresetInput.value = 'budget';
          console.log('[Settings] 💰 가성비 조합 프리셋 적용됨');
          toastManager.success('💰 가성비 조합이 적용되었습니다. 저장 버튼을 눌러주세요!');
        };
      }

      const presetPremiumBtn = document.getElementById('preset-premium-btn');
      if (presetPremiumBtn) {
        presetPremiumBtn.onclick = () => {
          if (falaiModelSelect) falaiModelSelect.value = 'flux-1.1-pro';
          if (stabilityModelSelect) stabilityModelSelect.value = 'stable-image-ultra';
          // ✅ [v2.7.24] gemini-3.x 프리뷰는 미존재 ID라 'gemini-3-1-flash'(=정식 GA)로 통합
          if (nanoBananaMainModel) nanoBananaMainModel.value = 'gemini-3-1-flash';
          if (nanoBananaSubModel) nanoBananaSubModel.value = 'gemini-3-1-flash';
          if (imagePresetInput) imagePresetInput.value = 'premium';
          console.log('[Settings] 🏆 고퀄리티 조합 프리셋 적용됨');
          toastManager.success('🏆 고퀄리티 조합이 적용되었습니다. 저장 버튼을 눌러주세요!');
        };
      }
    } catch (e) {
      console.warn('[Settings] 이미지 모델 고급 설정 로드 중 오류 (무시 가능):', e);
    }

    // ✅ 로드 완료 로그
    console.log('[Settings] 모든 설정 필드 로드 완료');


    // 사용자 프로필 설정 (개발 모드에서만 표시)
    if (!isPackaged) {
      if (userDisplayName) userDisplayName.value = config.userDisplayName || '';
      if (userEmail) userEmail.value = config.userEmail || '';
      if (userTimezone) userTimezone.value = config.userTimezone || 'Asia/Seoul';

      // 고급 설정
      if (enableDebugMode) enableDebugMode.checked = config.enableDebugMode || false;
      if (autoSaveDrafts) autoSaveDrafts.checked = config.autoSaveDrafts || false;
      if (backupFrequency) backupFrequency.value = config.backupFrequency || 'never';
    }
  } catch (error) {
    console.error('[Settings] ❌ 설정 로드 실패:', error);
    console.error('[Settings] 오류 상세:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
      name: (error as Error).name
    });

    // 사용자에게 알림
    const errorMessage = (error as Error).message || '알 수 없는 오류';
    alert(`⚠️ 환경설정을 불러올 수 없습니다.\n\n오류: ${errorMessage}\n\n콘솔을 확인해주세요.`);

    // 기본값으로 설정 필드 초기화
    if (geminiApiKey) geminiApiKey.value = '';
    if (dailyPostLimit) dailyPostLimit.value = '3';
    if (freeQuotaPublish) freeQuotaPublish.value = '2';
    if (freeQuotaContent) freeQuotaContent.value = '5';
    if (freeQuotaMedia) freeQuotaMedia.value = '30';
  }

  // 전역 설정 저장 핸들러 정의 (중복 등록 방지를 제거하고 덮어씀)
  (window as any).saveSettingsHandler = async function (): Promise<void> {
    try {

        if (!hasSettingsBridge || typeof settingsApi?.saveConfig !== 'function') {
          toastManager.warning('브라우저 미리보기에서는 환경설정을 저장할 수 없습니다. 앱에서 실행해 주세요.');
          return;
        }

        const isPackaged = typeof settingsApi?.isPackaged === 'function'
          ? await settingsApi.isPackaged()
          : true;
        const currentConfig = await settingsApi.getConfig().catch(() => ({}));

        // 사용자 프로필 필드
        const userDisplayName = document.getElementById('user-display-name') as HTMLInputElement;
        const userEmail = document.getElementById('user-email') as HTMLInputElement;
        const userTimezone = document.getElementById('user-timezone') as HTMLSelectElement;

        // 고급 설정 필드
        const enableDebugMode = document.getElementById('enable-debug-mode') as HTMLInputElement;
        const autoSaveDrafts = document.getElementById('auto-save-drafts') as HTMLInputElement;
        const backupFrequency = document.getElementById('backup-frequency') as HTMLSelectElement;

        // 패키지 환경에서도 모든 설정을 저장할 수 있도록 수정
        const customImageSavePathInput = document.getElementById('custom-image-save-path') as HTMLInputElement;

        // ✅ 저장 시점에 다시 요소 찾기 (스코프 문제 해결)
        const naverClientIdInput = document.getElementById('naver-client-id') as HTMLInputElement;
        const naverClientSecretInput = document.getElementById('naver-client-secret') as HTMLInputElement;
        // ✅ 네이버 광고 API 키 필드
        const naverAdApiKeyInput = document.getElementById('naver-ad-api-key') as HTMLInputElement;
        const naverAdSecretKeyInput = document.getElementById('naver-ad-secret-key') as HTMLInputElement;
        const naverAdCustomerIdInput = document.getElementById('naver-ad-customer-id') as HTMLInputElement;

        // 디버깅 로그
        console.log('[Settings] 네이버 Client ID 입력값:', naverClientIdInput?.value ? '✅' : '❌');
        console.log('[Settings] 네이버 Client Secret 입력값:', naverClientSecretInput?.value ? '***' : '없음');
        console.log('[Settings] 네이버 광고 API Key 입력값:', naverAdApiKeyInput?.value ? '✅' : '❌');

        // ✅ [2026-06-14] Prodia 복구: prodiaApiKey/prodiaToken 별칭 모두 유지
        const prodiaApiKeyValue = readSecretInputValue('prodia-token', currentConfig?.prodiaApiKey || currentConfig?.prodiaToken);
        const stabilityApiKeyInput = undefined; // deprecated

        const parsedGeminiExtraKeys = (geminiExtraApiKeys?.value || '')
          .split(/[\n,]+/)
          .map((key) => key.trim())
          .filter(Boolean);

        const geminiApiKeyValue = readSecretInputValue('gemini-api-key', currentConfig?.geminiApiKey);
        const openaiApiKeyValue = readSecretInputValue('openai-api-key', currentConfig?.openaiApiKey || currentConfig?.openaiImageApiKey);
        const claudeApiKeyValue = readSecretInputValue('claude-api-key', currentConfig?.claudeApiKey);
        const perplexityApiKeyValue = readSecretInputValue('perplexity-api-key', currentConfig?.perplexityApiKey);
        const unsplashApiKeyValue = readSecretInputValue('unsplash-api-key', currentConfig?.unsplashApiKey);
        const pixabayApiKeyValue = readSecretInputValue('pixabay-api-key', currentConfig?.pixabayApiKey);
        const naverClientSecretValue = readSecretInputValue('naver-client-secret', currentConfig?.naverClientSecret || currentConfig?.naverDatalabClientSecret);
        const naverAdApiKeyValue = readSecretInputValue('naver-ad-api-key', currentConfig?.naverAdApiKey);
        const naverAdSecretKeyValue = readSecretInputValue('naver-ad-secret-key', currentConfig?.naverAdSecretKey);
        const leonardoaiApiKeyValue = readSecretInputValue('leonardoai-api-key', currentConfig?.leonardoaiApiKey);
        const deepinfraApiKeyValue = readSecretInputValue('deepinfra-api-key', currentConfig?.deepinfraApiKey);
        const selectedTextModel = (
          document.querySelector('input[name="primaryGeminiTextModel"]:checked') as HTMLInputElement | null
        )?.value;
        const safeTextSelection = resolveTextModelSelection(
          selectedTextModel,
          claudeApiKeyValue,
          claudeSubscriptionDisabled,
        );

        let config: any = {
          dailyPostLimit: parseInt(dailyPostLimit?.value || '3'),
          freeQuotaPublish: parseInt(freeQuotaPublish?.value || '2'),
          freeQuotaContent: parseInt(freeQuotaContent?.value || '5'),
          freeQuotaMedia: parseInt(freeQuotaMedia?.value || '30'),
          geminiApiKey: geminiApiKeyValue,
          geminiApiKeys: parsedGeminiExtraKeys,
          geminiUseFreeQuotaBeforePaid: geminiFreeQuotaFirst?.checked !== false,
          unsplashApiKey: unsplashApiKeyValue,
          pixabayApiKey: pixabayApiKeyValue,
          naverClientId: naverClientIdInput?.value.trim() || undefined, // ✅ 네이버 검색 API 호환용
          naverClientSecret: naverClientSecretValue, // ✅ 네이버 검색 API 호환용
          naverDatalabClientId: naverClientIdInput?.value.trim() || undefined, // ✅ 네이버 검색 API
          naverDatalabClientSecret: naverClientSecretValue, // ✅ 네이버 검색 API
          naverAdApiKey: naverAdApiKeyValue, // ✅ 네이버 광고 API
          naverAdSecretKey: naverAdSecretKeyValue, // ✅ 네이버 광고 API
          naverAdCustomerId: naverAdCustomerIdInput?.value.trim() || undefined, // ✅ 네이버 광고 API
          // ✅ [2026-02-22] 새 이미지 프로바이더 API 키
          openaiImageApiKey: openaiApiKeyValue, // ✅ [2026-02-23] OpenAI API 키와 통합
          leonardoaiApiKey: leonardoaiApiKeyValue,
          prodiaApiKey: prodiaApiKeyValue,
          prodiaToken: prodiaApiKeyValue,
          prodiaModel: (document.getElementById('prodia-model-select') as HTMLSelectElement | null)?.value || currentConfig?.prodiaModel || 'sdxl',

          leonardoaiModel: (document.getElementById('leonardoai-model-select') as HTMLSelectElement)?.value || 'seedream-4.5',
          deepinfraApiKey: deepinfraApiKeyValue, // ✅ [2026-01-26] DeepInfra API
          customImageSavePath: customImageSavePathInput?.value.trim() || undefined,
          // ✅ [v2.10.58] 비용 절감 토글 4종 저장 (silent 폴백 0, 사용자 명시)
          costSaverMode: (document.getElementById('cost-saver-mode') as HTMLInputElement | null)?.checked || false,
          useCompressedPrompt: (document.getElementById('use-compressed-prompt') as HTMLInputElement | null)?.checked || false,
          useCrawlSummary: (document.getElementById('use-crawl-summary') as HTMLInputElement | null)?.checked || false,
          subWorkProvider: ((document.getElementById('sub-work-provider') as HTMLSelectElement | null)?.value as 'same' | 'gpt-mini' | 'gemini-flash' | 'haiku') || 'same',
          // ✅ [v2.10.62] GEO/AEO 최적화 토글 저장 (기본 OFF)
          geoOptimization: (document.getElementById('geo-optimization') as HTMLInputElement | null)?.checked || false,
          // ✅ [v2.10.73] 네이버 fact-check RAG 토글 저장 (기본 ON, undefined도 true 취급)
          useNaverFactCheck: (() => {
            const el = document.getElementById('use-naver-factcheck') as HTMLInputElement | null;
            // 토글 자체가 없거나 checked면 true. 명시 unchecked만 false.
            return el ? el.checked : true;
          })(),
          // ✅ [v2.10.361] Perplexity 팩트 검증 + 자동 재작성 토글 저장 (기본 OFF, 비용 차감)
          usePerplexityFactCheck: (document.getElementById('use-perplexity-factcheck') as HTMLInputElement | null)?.checked || false,
          // ✅ [v2.10.229] 자동 관련글 링크 토글 저장 (기본 ON, undefined도 true 취급)
          autoInsertInternalLinks: (() => {
            const el = document.getElementById('auto-insert-internal-links') as HTMLInputElement | null;
            return el ? el.checked : true;
          })(),
          // [v2.10.235 Phase 3-A] AI 탭 친화 모드 토글 저장 (기본 OFF, 명시 ON 시에만 true)
          aiTabFriendlyMode: (document.getElementById('ai-tab-friendly-mode') as HTMLInputElement | null)?.checked || false,
          // [v2.10.236 Phase 3-B] Claude Sonnet abstention 모드 토글 저장 (기본 OFF, 명시 ON 시에만 true)
          claudeAbstentionMode: (document.getElementById('claude-abstention-mode') as HTMLInputElement | null)?.checked || false,
          // ✅ [v2.10.186 Phase 3.6] 자동 SERP 벤치마크 토글 (기본 OFF — 옵트인)
          autoSerpBenchmark: (document.getElementById('auto-serp-benchmark') as HTMLInputElement | null)?.checked || false,
          primaryGeminiTextModel: safeTextSelection.model, // product policy 적용 후 안전한 텍스트 모델
          // ✅ [2026-06-05] Gemini 자동 모드 저장
          //   더 이상 무료/유료를 묻지 않는다. 라디오가 없거나 값이 깨져도 auto로 저장해
          //   연속발행 중 플랜 모달/수동 선택 회귀를 막는다.
          ...((): { geminiPlanType: 'auto' | 'free' | 'paid' } => {
            const checked = (document.querySelector('input[name="geminiPlanType"]:checked') as HTMLInputElement | null)?.value;
            if (checked === 'auto' || checked === 'free' || checked === 'paid') {
              rememberPlan(checked);
              return { geminiPlanType: checked };
            }
            rememberPlan('auto');
            return { geminiPlanType: 'auto' };
          })(),
          imagePreset: (document.getElementById('image-preset-input') as HTMLInputElement)?.value as 'budget' | 'premium' | 'custom' || 'custom',
          // ✅ [2026-02-22 FIX] primaryGeminiTextModel에서 defaultAiProvider 자동 파생
          openaiApiKey: openaiApiKeyValue, // ✅ [2026-02-22] OpenAI API
          claudeApiKey: claudeApiKeyValue, // ✅ [2026-02-22] Claude API
          perplexityApiKey: perplexityApiKeyValue, // ✅ [2026-03-30] Perplexity API 키 저장 누락 수정
          defaultAiProvider: safeTextSelection.provider,
        };


        try {
          if (externalApiCostConsent) {
            const consent = externalApiCostConsent.checked === true;
            config.externalApiCostConsent = consent;
            if (consent) {
              config.externalApiCostConsentAt = new Date().toISOString();
            }
          }
          if (externalApiPerRunImageLimit) {
            const v = Math.max(1, Math.floor(Number(externalApiPerRunImageLimit.value || 10)));
            config.externalApiPerRunImageLimit = v;
          }
          if (externalApiDailyImageLimit) {
            const v = Math.max(1, Math.floor(Number(externalApiDailyImageLimit.value || 30)));
            config.externalApiDailyImageLimit = v;
          }
        } catch (e) {
          console.warn('[priceInfoModal] catch ignored:', e);
        }

        // 디버깅: 최종 config 확인
        console.log('[Settings] 저장할 config 네이버 키:', {
          naverDatalabClientId: config.naverDatalabClientId?.substring(0, 10) + '...',
          naverDatalabClientSecret: config.naverDatalabClientSecret ? '***' : '없음'
        });

        // 개발 모드에서만 사용자 프로필 및 고급 설정 저장
        if (!isPackaged) {
          config = {
            ...config,
            userDisplayName: userDisplayName?.value.trim() || undefined,
            userEmail: userEmail?.value.trim() || undefined,
            userTimezone: userTimezone?.value || 'Asia/Seoul',
            enableDebugMode: enableDebugMode?.checked || false,
            autoSaveDrafts: autoSaveDrafts?.checked || false,
            backupFrequency: backupFrequency?.value || 'never',
          };
        }

        const saveResult = await apiClient.call('saveConfig', [config], {
          retryCount: 2,
          timeout: 10000
        });

        if (saveResult.success) {
          // ✅ 저장 성공 로그
          console.log('[Settings] 설정 저장 완료:', Object.keys(config).length, '개 항목');

          // API 키 저장 확인 로그
          if (config.geminiApiKey) {
            appendLog(`✅ Gemini API 키 저장됨 (길이: ${config.geminiApiKey.length}자, 형식: 올바름)`);
          }

          appendLog('⚙️ 설정이 저장되었습니다.');
          toastManager.success('✅ 설정이 저장되었습니다. 앱을 껐다 켜도 유지됩니다!');

          try {
            const unifiedGeminiModel = document.getElementById('unified-gemini-model') as HTMLSelectElement | null;
            if (unifiedGeminiModel) {
              unifiedGeminiModel.value = normalizeGeminiTextModelId(config.geminiModel || 'gemini-3.5-flash');
            }
            // ✅ [2026-02-22 FIX] 저장 후 unified-generator 즉시 동기화
            const unifiedGeneratorEl = document.getElementById('unified-generator') as HTMLInputElement | null;
            if (unifiedGeneratorEl && config.defaultAiProvider) {
              unifiedGeneratorEl.value = config.defaultAiProvider;
              console.log(`[Settings] ✅ unified-generator 동기화: ${config.defaultAiProvider}`);
            }
            // ✅ [2026-02-22 FIX] nav-text-engine-status UI 업데이트
            const statusEl = document.getElementById('nav-text-engine-status');
            if (statusEl && config.primaryGeminiTextModel) {
              const names: Record<string, string> = {
                'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
                'gemini-3.5-flash': 'Gemini 3.5 Flash',
                'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
                'perplexity-sonar': '🔮 Perplexity AI',
                'openai-gpt4o-mini': '🧠 GPT-5.6 Luna',
                'openai-gpt41': '⚖️ GPT-5.6 Terra',
                'openai-gpt4o': '🚀 GPT-5.6 Sol',
                'claude-sonnet': '📜 Claude Sonnet 5',
                'claude-opus': '👑 Claude Fable 5',
                'agent-codex': '🤖 에이전트 (Codex 구독)',
                'agent-claude': '🤖 에이전트 (Claude 구독 · 배포 앱 비활성)',
              };
              statusEl.textContent = `현재: ${names[config.primaryGeminiTextModel] || config.primaryGeminiTextModel}`;
            }
          } catch (e) {
            console.warn('[priceInfoModal] catch ignored:', e);
          }
        } else {
          toastManager.error(`❌ 설정 저장 실패: ${saveResult.error}`);
          return;
        }
        const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
        if (settingsModal) {
          settingsModal.setAttribute('aria-hidden', 'true');
          settingsModal.style.display = 'none';
        }
      } catch (error) {
        alert(`❌ 설정 저장 실패: ${(error as Error).message}`);
      }
  };

  // ✅ [2026-01-27] API 키 섹션 저장 버튼 - 기존 저장 로직 트리거
  const apiKeysSaveBtn = document.getElementById('api-keys-save-btn');
  if (apiKeysSaveBtn) {
    apiKeysSaveBtn.addEventListener('click', () => {
      console.log('[Settings] API 키 저장 버튼 클릭 - 전역 저장 로직 트리거');
      if (typeof (window as any).saveSettingsHandler === 'function') (window as any).saveSettingsHandler();
    });
  }

  // ✅ [2026-01-27] AI 텍스트 엔진 저장 버튼
  const textEngineSaveBtn = document.getElementById('text-engine-save-btn');
  if (textEngineSaveBtn) {
    textEngineSaveBtn.addEventListener('click', () => {
      console.log('[Settings] AI 텍스트 엔진 저장 버튼 클릭 - 전역 저장 로직 트리거');
      if (typeof (window as any).saveSettingsHandler === 'function') (window as any).saveSettingsHandler();
    });
  }

  // ✅ [2026-01-27] 이미지 모델 저장 버튼
  const imageModelSaveBtn = document.getElementById('image-model-save-btn');
  if (imageModelSaveBtn) {
    imageModelSaveBtn.addEventListener('click', () => {
      console.log('[Settings] 이미지 모델 저장 버튼 클릭 - 전역 저장 로직 트리거');
      if (typeof (window as any).saveSettingsHandler === 'function') (window as any).saveSettingsHandler();
    });
  }

  // ✅ [2026-01-27] 이미지 경로 저장 버튼
  const imagePathSaveBtn = document.getElementById('image-path-save-btn');
  if (imagePathSaveBtn) {
    imagePathSaveBtn.addEventListener('click', () => {
      console.log('[Settings] 이미지 경로 저장 버튼 클릭 - 전역 저장 로직 트리거');
      if (typeof (window as any).saveSettingsHandler === 'function') (window as any).saveSettingsHandler();
    });
  }

  // ✅ 다계정 관리 기능 초기화
  await initMultiAccountManager();

  // ✅ 환경설정에서 다계정 관리 버튼 클릭
  const openMultiAccountFromSettings = document.getElementById('open-multi-account-from-settings');
  if (openMultiAccountFromSettings) {
    openMultiAccountFromSettings.addEventListener('click', () => {
      // 환경설정 모달 닫기
      const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
      if (settingsModal) {
        settingsModal.style.display = 'none';
      }
      // 다계정 관리 모달 열기
      const multiAccountBtn = document.getElementById('multi-account-btn');
      multiAccountBtn?.click();
    });
  }

  // ✅ 환경설정에서 가이드/분석 버튼 클릭
  const openGuideFromSettings = document.getElementById('open-guide-from-settings');
  if (openGuideFromSettings) {
    openGuideFromSettings.addEventListener('click', () => {
      // 환경설정 모달 닫기
      const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
      if (settingsModal) {
        settingsModal.style.display = 'none';
      }
      // 가이드/분석 모달 열기
      const toolsHubModal = document.getElementById('tools-hub-modal');
      if (toolsHubModal) {
        toolsHubModal.style.display = 'flex';
      }
    });
  }

  // 라이선스 코드 테스트
  const testLicenseCodeBtn = document.getElementById('test-license-code-btn') as HTMLButtonElement;
  const testLicenseCodeInput = document.getElementById('test-license-code') as HTMLInputElement;
  if (testLicenseCodeBtn && testLicenseCodeInput) {
    testLicenseCodeBtn.addEventListener('click', async () => {
      const code = testLicenseCodeInput.value.trim();
      if (!code) {
        alert('테스트할 라이선스 코드를 입력해주세요.');
        return;
      }
      await testLicenseCode(code);
    });
  }

  // 외부 유입 라이선스 등록
  const registerExternalInflowBtn = document.getElementById('register-external-inflow-btn') as HTMLButtonElement;
  if (registerExternalInflowBtn) {
    registerExternalInflowBtn.addEventListener('click', async () => {
      if (confirm('외부 유입 90일 라이선스를 등록하시겠습니까?\n\n등록 후 90일 동안 외부 유입 기능을 사용할 수 있습니다.')) {
        try {
          registerExternalInflowBtn.disabled = true;
          registerExternalInflowBtn.textContent = '등록 중...';

          const result = await window.api.registerExternalInflowLicense();

          if (result.success) {
            // 만료일 정확한 표시
            const expiresAt = result.expiresAt ? new Date(result.expiresAt) : null;
            const formattedDate = expiresAt ?
              `${expiresAt.getFullYear()}년 ${expiresAt.getMonth() + 1}월 ${expiresAt.getDate()}일` :
              '알 수 없음';

            alert(`✅ ${result.message}\n\n만료일: ${formattedDate}`);
            toastManager.success('외부 유입 라이선스가 등록되었습니다!');
          } else {
            alert(`❌ ${result.message}`);
          }
        } catch (error) {
          console.error('외부 유입 라이선스 등록 오류:', error);
          alert(`❌ 라이선스 등록 중 오류가 발생했습니다: ${(error as Error).message}`);
        } finally {
          registerExternalInflowBtn.disabled = false;
          registerExternalInflowBtn.textContent = '🎯 외부 유입 90일 라이선스 등록';
        }
      }
    });
  }

  // ✅ 네트워크 진단 버튼 이벤트 리스너
  const networkDiagnosticsBtn = document.getElementById('network-diagnostics-btn') as HTMLButtonElement;
  if (networkDiagnosticsBtn && !networkDiagnosticsBtn.hasAttribute('data-listener-added')) {
    networkDiagnosticsBtn.setAttribute('data-listener-added', 'true');
    networkDiagnosticsBtn.addEventListener('click', async () => {
      networkDiagnosticsBtn.disabled = true;
      networkDiagnosticsBtn.textContent = '🔄 진단 중...';

      const diagnosticResults: string[] = [];
      diagnosticResults.push('===== 네트워크 진단 결과 =====\n');

      try {
        // 1. 라이선스 서버 연결 테스트
        diagnosticResults.push('📡 라이선스 서버 연결 테스트...');
        try {
          const licenseResult = await window.api.testLicenseServer();
          if (licenseResult.success) {
            diagnosticResults.push(`✅ 라이선스 서버: 연결 성공`);
          } else {
            diagnosticResults.push(`❌ 라이선스 서버: ${licenseResult.message}`);
          }
        } catch (e) {
          diagnosticResults.push(`❌ 라이선스 서버: 연결 실패 - ${(e as Error).message}`);
        }

        // 2. OpenAI API 연결 테스트
        diagnosticResults.push('\n📡 OpenAI API 연결 테스트...');
        try {
          const openaiResponse = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer test' },
            signal: AbortSignal.timeout(10000)
          });
          diagnosticResults.push(`✅ OpenAI API: 도달 가능 (상태: ${openaiResponse.status})`);
        } catch (e) {
          const errMsg = (e as Error).message;
          if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
            diagnosticResults.push(`⚠️ OpenAI API: 응답 지연 (10초 초과)`);
          } else {
            diagnosticResults.push(`❌ OpenAI API: ${errMsg}`);
          }
        }

        // 3. Google/Gemini API 연결 테스트
        diagnosticResults.push('\n📡 Google API (Gemini) 연결 테스트...');
        try {
          const googleResponse = await fetch('https://generativelanguage.googleapis.com/', {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
          });
          diagnosticResults.push(`✅ Google API: 도달 가능 (상태: ${googleResponse.status})`);
        } catch (e) {
          const errMsg = (e as Error).message;
          if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
            diagnosticResults.push(`⚠️ Google API: 응답 지연 (10초 초과)`);
          } else {
            diagnosticResults.push(`❌ Google API: ${errMsg}`);
          }
        }

        // 4. Anthropic (Claude) API 연결 테스트
        diagnosticResults.push('\n📡 Anthropic (Claude) API 연결 테스트...');
        try {
          const anthropicResponse = await fetch('https://api.anthropic.com/', {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
          });
          diagnosticResults.push(`✅ Anthropic API: 도달 가능 (상태: ${anthropicResponse.status})`);
        } catch (e) {
          const errMsg = (e as Error).message;
          if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
            diagnosticResults.push(`⚠️ Anthropic API: 응답 지연 (10초 초과)`);
          } else {
            diagnosticResults.push(`❌ Anthropic API: ${errMsg}`);
          }
        }

        // 5. 네이버 API 연결 테스트
        diagnosticResults.push('\n📡 네이버 API 연결 테스트...');
        try {
          const naverResponse = await fetch('https://openapi.naver.com/', {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
          });
          diagnosticResults.push(`✅ 네이버 API: 도달 가능 (상태: ${naverResponse.status})`);
        } catch (e) {
          const errMsg = (e as Error).message;
          if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
            diagnosticResults.push(`⚠️ 네이버 API: 응답 지연 (10초 초과)`);
          } else {
            diagnosticResults.push(`❌ 네이버 API: ${errMsg}`);
          }
        }

        // 6. API 키 설정 상태 확인
        diagnosticResults.push('\n🔑 API 키 설정 상태...');
        try {
          const config = await window.api.getConfig();
          const geminiKey = config.geminiApiKey?.trim();
          const openaiKey = config.openaiApiKey?.trim();
          const claudeKey = config.claudeApiKey?.trim();

          if (geminiKey && geminiKey.length > 10) {
            diagnosticResults.push(`✅ Gemini API 키: 설정됨 (${geminiKey.length}자)`);
          } else {
            diagnosticResults.push(`❌ Gemini API 키: 미설정 ← 반드시 설정 필요!`);
          }

          if (openaiKey && openaiKey.length > 10) {
            diagnosticResults.push(`✅ OpenAI API 키: 설정됨 (${openaiKey.length}자)`);
          } else {
            diagnosticResults.push(`⚠️ OpenAI API 키: 미설정`);
          }

          if (claudeKey && claudeKey.length > 10) {
            diagnosticResults.push(`✅ Claude API 키: 설정됨 (${claudeKey.length}자)`);
          } else {
            diagnosticResults.push(`⚠️ Claude API 키: 미설정`);
          }
        } catch (e) {
          diagnosticResults.push(`❌ 설정 로드 실패: ${(e as Error).message}`);
        }

        // 문제 자동 진단 및 해결책 제시
        diagnosticResults.push('\n===== 📋 진단 결과 및 해결 방법 =====\n');

        const hasApiKeyIssue = diagnosticResults.some(r => r.includes('Gemini API 키: 미설정'));
        const hasNetworkIssue = diagnosticResults.some(r => r.includes('❌') && !r.includes('API 키'));
        const hasSlowNetwork = diagnosticResults.some(r => r.includes('응답 지연'));

        if (hasApiKeyIssue) {
          diagnosticResults.push('🚨 문제: Gemini API 키가 설정되지 않았습니다!');
          diagnosticResults.push('');
          diagnosticResults.push('📌 해결 방법:');
          diagnosticResults.push('1. Google AI Studio 접속: https://aistudio.google.com');
          diagnosticResults.push('2. "Get API Key" 클릭 → API 키 생성');
          diagnosticResults.push('3. 환경설정(⚙️) → Gemini API 키에 붙여넣기');
          diagnosticResults.push('4. 저장 버튼 클릭');
          diagnosticResults.push('5. 앱 재시작 또는 다시 시도');
        } else if (hasNetworkIssue) {
          diagnosticResults.push('🚨 문제: 네트워크 연결에 문제가 있습니다!');
          diagnosticResults.push('');
          diagnosticResults.push('📌 해결 방법:');
          diagnosticResults.push('1. 인터넷 연결 확인');
          diagnosticResults.push('2. VPN 사용 중이면 끄기');
          diagnosticResults.push('3. 방화벽에서 앱 허용');
          diagnosticResults.push('4. 회사/학교 네트워크면 다른 네트워크 사용');
        } else if (hasSlowNetwork) {
          diagnosticResults.push('⚠️ 주의: 네트워크가 느립니다!');
          diagnosticResults.push('');
          diagnosticResults.push('📌 해결 방법:');
          diagnosticResults.push('1. WiFi 신호 확인 (라우터 가까이)');
          diagnosticResults.push('2. 다른 프로그램의 인터넷 사용 줄이기');
          diagnosticResults.push('3. 유선 연결 권장');
          diagnosticResults.push('4. 잠시 후 다시 시도');
        } else {
          diagnosticResults.push('✅ 모든 연결이 정상입니다!');
          diagnosticResults.push('');
          diagnosticResults.push('💡 그래도 안 되면:');
          diagnosticResults.push('1. 앱 완전히 종료 후 재시작');
          diagnosticResults.push('2. 환경설정에서 API 키 다시 저장');
          diagnosticResults.push('3. 컴퓨터 재부팅');
        }

        alert(diagnosticResults.join('\n'));
        appendLog('🔍 네트워크 진단 완료 - 결과를 확인해주세요');

      } catch (error) {
        alert(`네트워크 진단 중 오류가 발생했습니다:\n${(error as Error).message}`);
      } finally {
        networkDiagnosticsBtn.disabled = false;
        networkDiagnosticsBtn.textContent = '🔍 네트워크 진단 실행';
      }
    });
  }

  // ✅ 원클릭 네트워크 최적화 버튼 이벤트 리스너
  const networkOptimizeBtn = document.getElementById('network-optimize-btn') as HTMLButtonElement;
  if (networkOptimizeBtn && !networkOptimizeBtn.hasAttribute('data-listener-added')) {
    networkOptimizeBtn.setAttribute('data-listener-added', 'true');
    networkOptimizeBtn.addEventListener('click', async () => {
      // 경고 메시지 표시
      const confirmed = confirm(
        '⚡ 원클릭 네트워크 최적화\n\n' +
        '다음 작업을 수행합니다:\n' +
        '• DNS 캐시 갱신 (관리자 권한 필요)\n' +
        '• API 서버 연결 테스트\n' +
        '• 최적 연결 상태 확인\n\n' +
        '계속하시겠습니까?'
      );

      if (!confirmed) return;

      networkOptimizeBtn.disabled = true;
      networkOptimizeBtn.textContent = '⚡ 최적화 중...';
      appendLog('🔄 네트워크 최적화 시작...');

      try {
        const result = await window.api.networkOptimize();

        // 결과 표시
        alert(result.results.join('\n'));

        if (result.success) {
          appendLog('✅ 네트워크 최적화 완료!');
          toastManager.success('네트워크 최적화가 완료되었습니다!');
        } else {
          appendLog('⚠️ 네트워크 최적화 완료 (일부 문제 발견)');
          toastManager.warning('네트워크에 일부 문제가 있습니다. 결과를 확인하세요.');
        }

      } catch (error) {
        alert(`네트워크 최적화 중 오류가 발생했습니다:\n${(error as Error).message}`);
        appendLog(`❌ 네트워크 최적화 실패: ${(error as Error).message}`);
      } finally {
        networkOptimizeBtn.disabled = false;
        networkOptimizeBtn.textContent = '⚡ 원클릭 네트워크 최적화';
      }
    });
  }
}

// ==================== ✅ [2026-03-19] 통합 API 비용 대시보드 ====================

const PROVIDER_META: Record<string, { label: string; icon: string; color: string; type: 'text' | 'image' }> = {
  gemini:        { label: 'Gemini',        icon: '💎', color: '#4285f4', type: 'text' },
  openai:        { label: 'OpenAI (텍스트)', icon: '🤖', color: '#10a37f', type: 'text' },
  'openai-image': { label: 'OpenAI (이미지)', icon: '🎨', color: '#10a37f', type: 'image' },
  claude:        { label: 'Claude',        icon: '🧠', color: '#d97706', type: 'text' },
  perplexity:    { label: 'Perplexity',    icon: '🔮', color: '#7c3aed', type: 'text' },
  deepinfra:     { label: 'DeepInfra',     icon: '⚡', color: '#ef4444', type: 'image' },
  leonardoai:    { label: 'Leonardo AI',   icon: '🖌️', color: '#ec4899', type: 'image' },
};

const DASHBOARD_CONTAINER_ID = 'api-cost-dashboard-container';

function initApiCostDashboard(): void {
  // 대시보드 삽입 위치: gemini-quota-result 아래
  const anchor = document.getElementById('gemini-quota-result');
  if (!anchor || document.getElementById(DASHBOARD_CONTAINER_ID)) return;

  const container = document.createElement('div');
  container.id = DASHBOARD_CONTAINER_ID;
  container.style.cssText = 'margin-top:16px; display:none;'; // 데이터 로드 전 숨김
  anchor.parentElement?.insertBefore(container, anchor.nextSibling);
}

async function refreshApiCostDashboard(): Promise<void> {
  const container = document.getElementById(DASHBOARD_CONTAINER_ID);
  if (!container) return;

  container.style.display = 'block';
  container.innerHTML = '<div style="text-align:center;padding:12px;color:#94a3b8;font-size:0.82rem;background:rgba(15,17,25,0.95);border-radius:12px;">⏳ 통합 API 사용량 로딩 중...</div>';

  try {
    const result = await (window.api as any).getAllApiUsageSnapshots();
    if (!result.success || !result.data) {
      container.innerHTML = `<div style="text-align:center;padding:12px;color:#fca5a5;font-size:0.82rem;">❌ 사용량 조회 실패: ${result.message || '알 수 없는 오류'}</div>`;
      return;
    }

    const data: Record<string, any> = result.data;

    // 총 비용 계산
    let totalCost = 0;
    let totalCalls = 0;
    const activeProviders: Array<{ key: string; meta: typeof PROVIDER_META[string]; usage: any }> = [];

    for (const [key, meta] of Object.entries(PROVIDER_META)) {
      const usage = data[key];
      if (!usage) continue;
      totalCost += usage.estimatedCostUSD || 0;
      totalCalls += usage.totalCalls || 0;
      if (usage.totalCalls > 0) {
        activeProviders.push({ key, meta, usage });
      }
    }

    // 비활성 제공자 (호출 0건)도 포함
    for (const [key, meta] of Object.entries(PROVIDER_META)) {
      const usage = data[key];
      if (!usage || usage.totalCalls > 0) continue;
      activeProviders.push({ key, meta, usage });
    }

    // 토큰/비용 포맷 헬퍼
    const fmtTokens = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1_000 ? (n / 1_000).toFixed(1) + 'K' : String(n);
    const fmtCost = (n: number) => n >= 0.01 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : '$0.00';

    let html = '';

    // 헤더: 총 비용 요약
    html += `<div style="background:linear-gradient(135deg,rgba(30,34,55,0.98),rgba(25,20,50,0.98));border:1px solid rgba(147,51,234,0.3);border-radius:12px;padding:14px 16px;margin-bottom:12px;">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">`;
    html += `<span style="font-size:0.85rem;font-weight:700;color:#e2e8f0;">📊 통합 API 비용 대시보드</span>`;
    html += `<button id="api-cost-refresh-btn" style="padding:2px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#94a3b8;font-size:0.7rem;cursor:pointer;" title="새로고침">🔄</button>`;
    html += `</div>`;
    html += `<div style="text-align:center;">`;
    const costColor = totalCost > 10 ? '#ef4444' : totalCost > 5 ? '#f59e0b' : '#22c55e';
    html += `<div style="font-size:1.8rem;font-weight:800;color:${costColor};letter-spacing:-1px;">${fmtCost(totalCost)}</div>`;
    html += `<div style="font-size:0.72rem;color:#94a3b8;">총 ${totalCalls.toLocaleString()}회 호출 | ${activeProviders.filter(p => p.usage.totalCalls > 0).length}개 제공자 활성</div>`;
    html += `</div>`;
    html += `</div>`;

    // 제공자별 카드
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">`;

    for (const { key, meta, usage } of activeProviders) {
      const cost = usage.estimatedCostUSD || 0;
      const calls = usage.totalCalls || 0;
      const opacity = calls > 0 ? '1' : '0.4';
      const borderCol = calls > 0 ? `${meta.color}44` : 'rgba(255,255,255,0.08)';

      html += `<div style="background:rgba(255,255,255,0.04);border:1px solid ${borderCol};border-radius:8px;padding:8px 10px;opacity:${opacity};">`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">`;
      html += `<span style="font-size:0.75rem;font-weight:600;color:${meta.color};">${meta.icon} ${meta.label}</span>`;
      html += `<span style="font-size:0.82rem;font-weight:700;color:#e2e8f0;">${fmtCost(cost)}</span>`;
      html += `</div>`;

      // 상세 정보
      html += `<div style="font-size:0.68rem;color:#94a3b8;line-height:1.4;">`;
      if (calls > 0) {
        html += `${calls.toLocaleString()}회 호출`;
        if (meta.type === 'text') {
          html += ` | ${fmtTokens(usage.totalInputTokens || 0)}in/${fmtTokens(usage.totalOutputTokens || 0)}out`;
        } else {
          html += ` | 이미지 ${(usage.totalImages || 0).toLocaleString()}장`;
        }
      } else {
        html += `사용 기록 없음`;
      }
      html += `</div>`;
      html += `</div>`;
    }

    html += `</div>`;

    // 하단: 안내 + 전체 초기화
    html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
    html += `<div style="font-size:0.68rem;color:#64748b;line-height:1.4;">⚠️ 앱 실행 중 추적된 <b>추정치</b>입니다.</div>`;
    html += `<button id="api-cost-reset-all-btn" style="padding:2px 10px;border-radius:4px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#fca5a5;font-size:0.7rem;cursor:pointer;">🔄 전체 초기화</button>`;
    html += `</div>`;

    container.innerHTML = html;

    // 이벤트 바인딩
    document.getElementById('api-cost-refresh-btn')?.addEventListener('click', () => refreshApiCostDashboard());
    document.getElementById('api-cost-reset-all-btn')?.addEventListener('click', async () => {
      if (!confirm('전체 API 사용량 추적을 초기화하시겠습니까?\n(실제 청구에는 영향 없음)')) return;
      try {
        await (window.api as any).resetApiUsage();
        toastManager.success('🔄 전체 API 사용량 초기화 완료!');
        refreshApiCostDashboard();
      } catch { toastManager.error('초기화 실패'); }
    });
  } catch (err: any) {
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#fca5a5;font-size:0.82rem;">❌ 오류: ${err?.message || '알 수 없는 오류'}</div>`;
  }
}
