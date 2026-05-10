/**
 * SPEC-IMAGE-RECOVERY-001: blocking modal for B1~B7.
 *
 * Rules (M-1 ~ M-4 in spec):
 *   - User-explicit choice required — no auto-close, no Esc-to-cancel.
 *   - "다른 엔진으로 자동 전환" button MUST NEVER appear.
 *   - Checkpoint flush is triggered by the coordinator before show().
 */

import { escapeHtml } from '../utils/htmlUtils.js';
import type {
  BlockingModalCode,
  ModalNotifier,
  ModalOptions,
  UserChoice,
} from '../../image/recovery/types';

// V1: 보안 — errorCode 본문 삽입 전 alphanumeric + underscore + colon + dot만 허용
function sanitizeErrorCode(errorCode?: string): string {
  if (!errorCode) return '알 수 없음';
  const safe = errorCode.replace(/[^A-Za-z0-9_.\-:]/g, '');
  return safe.length > 0 ? safe.slice(0, 80) : '알 수 없음';
}

// debugger 권고: B4 메시지 원인 카테고리별로 분기
function buildB4Message(errorCode?: string): string {
  const code = (errorCode ?? '').toLowerCase();
  const base = 'Chrome 또는 Edge 브라우저를 사용할 수 없습니다.\n\n';
  if (/eacces|permission/.test(code)) {
    return base + '권한 부족이 원인으로 보입니다.\n→ 앱을 "관리자 권한으로 실행" 후 다시 시도해주세요.';
  }
  if (/enospc|disk|space/.test(code)) {
    return base + '디스크 공간 부족이 원인으로 보입니다.\n→ C 드라이브에 최소 500MB 여유 공간을 확보한 뒤 다시 시도해주세요.';
  }
  if (/blocked|antivirus|av/.test(code)) {
    return base + '백신/방화벽이 차단했을 가능성이 있습니다.\n→ 백신 예외 목록에 이 앱을 추가하고 다시 시도해주세요.';
  }
  if (/econnreset|etimedout|network/.test(code)) {
    return base + '네트워크 오류로 자동 설치가 실패했습니다.\n→ 인터넷 연결을 확인 후 다시 시도하거나, 아래 링크에서 직접 Chrome/Edge를 설치해주세요.';
  }
  return base + '아래 링크에서 Chrome 또는 Edge를 설치한 뒤 앱을 다시 실행해주세요.\n관리자 권한으로 앱을 실행하면 자동 설치 성공률이 높아집니다.';
}

const DEFAULT_TITLES: Record<BlockingModalCode, string> = {
  B1: '⚠️ Google ImageFX 접근 거부',
  B2: '⚠️ 안전 필터 차단',
  B3: '⚠️ 시간당 한도 초과',
  B4: '⚠️ Chrome/Edge 브라우저 미설치',
  B5: '⚠️ Google 로그인 시간 초과',
  B6: '⚠️ Flow 페이지 변경 감지',
  B7: '⚠️ 회복 불가능한 오류',
};

function buildOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText =
    'position:fixed; inset:0; z-index: 1000000; background: rgba(0,0,0,0.65); ' +
    'display:flex; align-items:center; justify-content:center; padding: 1rem;';
  return overlay;
}

function buildModal(code: BlockingModalCode, options: ModalOptions): HTMLDivElement {
  const modal = document.createElement('div');
  modal.style.cssText =
    'width: min(560px, 95vw); max-height: 85vh; overflow:auto; ' +
    'background: var(--bg-primary, #fff); color: var(--text-strong, #111); ' +
    'border: 1px solid var(--border-light, #e0e0e0); border-radius: 14px; ' +
    'box-shadow: 0 20px 60px rgba(0,0,0,0.35); padding: 1.25rem;';

  const title = options.title || DEFAULT_TITLES[code];
  // ux-validator 권고: 에러 배지 대비 강화 (WCAG AA 준수)
  const errorCodeBadge = options.errorCode
    ? `<span style="font-family: ui-monospace, monospace; font-size: 0.75rem; padding: 0.15rem 0.45rem; border-radius: 6px; background: #fee2e2; color: #991b1b; font-weight: 600;">${escapeHtml(options.errorCode)}</span>`
    : '';

  const linksHtml = (options.resourceLinks ?? [])
    .map(
      (link) =>
        `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${escapeHtml(link.label)}</a>`,
    )
    .join('<br/>');

  modal.innerHTML = `
    <div style="display:flex; align-items:center; gap: 0.5rem; margin-bottom: 0.75rem;">
      <div style="font-weight: 800; font-size: 1.05rem; flex: 1;">${escapeHtml(title)}</div>
      ${errorCodeBadge}
    </div>
    <div style="font-size: 0.92rem; line-height: 1.6; color: var(--text-strong, #111); white-space: pre-wrap;">${escapeHtml(options.message)}</div>
    ${linksHtml ? `<div style="margin-top: 0.75rem; font-size: 0.85rem; line-height: 1.7;">${linksHtml}</div>` : ''}
    <div data-recovery-modal-actions style="margin-top: 1rem; display:flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap;"></div>
  `;
  return modal;
}

function buildButton(option: { id: string; label: string; variant?: 'primary' | 'secondary' | 'destructive' }): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.choiceId = option.id;
  // ux-validator 권고: 색맹 사용자도 destructive를 식별 가능하게 ⚠ 심볼 추가 (색상 외 단서)
  const labelWithSymbol = option.variant === 'destructive' ? `⚠ ${option.label}` : option.label;
  btn.textContent = labelWithSymbol;
  const variant = option.variant ?? 'secondary';
  const palette = {
    primary: 'background:#2563eb; color:#fff;',
    destructive: 'background:#b91c1c; color:#fff;',
    secondary: 'background: rgba(0,0,0,0.06); color: var(--text-strong, #111);',
  } as const;
  btn.style.cssText =
    'border:none; border-radius: 10px; padding: 0.55rem 1rem; cursor: pointer; ' +
    'font-weight: 600; font-size: 0.9rem; ' + palette[variant];
  return btn;
}

export const recoveryBlockingModal: ModalNotifier = {
  show(code: BlockingModalCode, options: ModalOptions): Promise<UserChoice> {
    return new Promise<UserChoice>((resolve) => {
      const overlay = buildOverlay();
      const modal = buildModal(code, options);
      const actions = modal.querySelector<HTMLDivElement>('[data-recovery-modal-actions]')!;

      // Must always include at least one explicit user-action — never auto-close.
      const choices = options.choices.length > 0
        ? options.choices
        : [{ id: 'close', label: '닫기', variant: 'secondary' as const }];

      for (const option of choices) {
        const btn = buildButton(option);
        btn.addEventListener('click', () => {
          document.body.removeChild(overlay);
          resolve({
            chosenId: option.id,
            choiceLabel: option.label,
            timestampMs: Date.now(),
          });
        });
        actions.appendChild(btn);
      }

      // SPEC M-2 — block click-outside and Esc.
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          e.stopPropagation();
        }
      });

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Focus first button so keyboard works but Esc doesn't cancel.
      const firstButton = actions.querySelector('button');
      firstButton?.focus();
    });
  },
};

export const RECOVERY_MODAL_PRESETS: Record<BlockingModalCode, (errorCode?: string) => ModalOptions> = {
  B1: (errorCode) => ({
    title: DEFAULT_TITLES.B1,
    errorCode,
    message:
      'Google이 한국 IP 또는 이 계정의 ImageFX/Flow 접근을 거부했습니다.\n\n' +
      '아래 중 하나를 선택해주세요. 다른 이미지 엔진으로 자동 전환은 일어나지 않습니다.',
    choices: [
      { id: 'open-proxy-settings', label: '외부 프록시 등록', variant: 'primary' },
      { id: 'switch-account', label: '다른 Google 계정 로그인', variant: 'secondary' },
      { id: 'cancel', label: '취소 (배치 종료)', variant: 'destructive' },
    ],
  }),
  B2: (errorCode) => ({
    title: DEFAULT_TITLES.B2,
    errorCode,
    message:
      'Google이 이 프롬프트를 안전 필터로 차단했습니다.\n\n' +
      '프롬프트를 수정하거나 그대로 한 번 더 시도할 수 있습니다.',
    choices: [
      { id: 'edit-prompt', label: '프롬프트 수정', variant: 'primary' },
      { id: 'retry-as-is', label: '그대로 시도', variant: 'secondary' },
      { id: 'cancel', label: '취소 (배치 종료)', variant: 'destructive' },
    ],
  }),
  B3: (errorCode) => ({
    title: DEFAULT_TITLES.B3,
    errorCode,
    message:
      '시간당 한도(HTTP 429)가 초과되었습니다. 약 1시간 후 자동으로 다시 시도하거나, 다른 Google 계정으로 직접 전환할 수 있습니다.\n\n' +
      '* "1시간 후 알림 예약"은 앱이 켜져 있는 상태에서만 동작합니다. 앱을 닫으면 예약이 취소됩니다.',
    choices: [
      { id: 'schedule-1h', label: '1시간 후 알림 예약', variant: 'primary' },
      { id: 'switch-account', label: '다른 Google 계정', variant: 'secondary' },
      { id: 'cancel', label: '취소 (배치 종료)', variant: 'destructive' },
    ],
  }),
  B4: (errorCode) => ({
    title: DEFAULT_TITLES.B4,
    errorCode,
    // debugger 권고: 원인 카테고리별 행동 안내
    message: buildB4Message(errorCode),
    choices: [{ id: 'close', label: '닫기', variant: 'secondary' }],
    resourceLinks: [
      { label: 'Google Chrome 다운로드', url: 'https://www.google.com/chrome/' },
      { label: 'Microsoft Edge 다운로드', url: 'https://www.microsoft.com/edge' },
    ],
  }),
  B5: (errorCode) => ({
    title: DEFAULT_TITLES.B5,
    errorCode,
    message:
      'Google 로그인이 30분을 넘었습니다. 2단계 인증 푸시를 거부했거나 자리에 안 계신 듯합니다.\n다시 로그인하시겠습니까?',
    choices: [
      { id: 'retry-login', label: '다시 로그인', variant: 'primary' },
      { id: 'cancel', label: '취소 (배치 종료)', variant: 'destructive' },
    ],
  }),
  B6: (errorCode) => ({
    title: DEFAULT_TITLES.B6,
    errorCode,
    // ux-validator 권고: "셀렉터" 같은 개발 용어 제거 + 환경 조건 명시
    message:
      'Google Flow 페이지의 UI가 변경되어 자동 인식에 실패했습니다.\n\n' +
      '원격 패치는 보통 1시간 이내 배포됩니다. 잠시 후 다시 시도하거나, 설정에서 다른 이미지 엔진을 직접 선택할 수 있습니다.\n' +
      '(자동 엔진 전환은 일어나지 않습니다)\n\n' +
      '* "1시간 후 자동 재시도"를 선택하면 앱이 켜져 있는 상태에서만 알림이 갑니다. 앱을 닫으면 예약이 취소됩니다.',
    choices: [
      { id: 'retry-1h', label: '1시간 후 자동 재시도', variant: 'primary' },
      { id: 'open-engine-settings', label: '이미지 엔진 설정 열기', variant: 'secondary' },
      { id: 'cancel', label: '취소 (배치 종료)', variant: 'destructive' },
    ],
  }),
  B7: (errorCode) => ({
    title: DEFAULT_TITLES.B7,
    errorCode,
    // V1: errorCode를 메시지 본문에 직접 삽입하므로 sanitize. message는 후속 escapeHtml로 렌더링되나
    // 방어 계층 중첩을 위해 명시적으로 안전한 문자만 통과.
    message:
      `회복 불가능한 오류가 발생했습니다. (코드: ${sanitizeErrorCode(errorCode)})\n\n` +
      '배치를 중단합니다. 진행 상황은 체크포인트로 저장되어 다음 실행에서 재개할 수 있습니다.',
    choices: [{ id: 'close', label: '닫기 (배치 중단)', variant: 'destructive' }],
  }),
};
