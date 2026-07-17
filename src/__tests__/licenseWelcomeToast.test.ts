/* @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatWelcomeToastMessage, initLicenseBadge } from '../renderer/modules/licenseUI';
import { ToastManager } from '../renderer/utils/uiManagers';

describe('license welcome toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = `
      <div id="toast-container"></div>
      <div id="license-badge"><span id="license-badge-text"></span></div>
      <div id="left-status-badges"></div>
    `;
  });

  afterEach(() => {
    delete (window as any).api;
    sessionStorage.clear();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('returns readable plain text without exposing HTML or inline CSS', () => {
    const message = formatWelcomeToastMessage('박성현');

    expect(message).toContain('박성현님 환영합니다');
    expect(message).toContain('Better Life Naver');
    expect(message).not.toMatch(/[<>]/);
    expect(message).not.toContain('style=');
    expect(message).not.toContain('font-weight');
  });

  it('keeps an HTML-looking user label inert as plain text', () => {
    expect(formatWelcomeToastMessage('<img onerror=alert(1)>')).toContain('<img onerror=alert(1)>');
  });

  it('renders the initial-entry welcome toast in its final visible state without changing ordinary toast animation', async () => {
    (window as any).api = {
      getLicense: vi.fn().mockResolvedValue({
        license: {
          isValid: true,
          licenseType: 'premium',
          userId: '박성현',
          expiresAt: '2030-01-01T00:00:00.000Z',
        },
      }),
    };

    await initLicenseBadge();

    const manager = new ToastManager();

    const welcomeToast = document.querySelector<HTMLElement>('.toast.info');
    expect(welcomeToast?.style.opacity).toBe('1');
    expect(welcomeToast?.style.transform).toBe('translateX(0)');
    expect(welcomeToast?.textContent).toContain(formatWelcomeToastMessage('박성현'));

    manager.info('일반 알림', 60_000);

    const toasts = Array.from(document.querySelectorAll<HTMLElement>('.toast.info'));
    const ordinaryToast = toasts[1];
    expect(ordinaryToast?.style.opacity).toBe('0');
    expect(ordinaryToast?.style.transform).toBe('translateX(100%)');

    vi.advanceTimersByTime(10);
    expect(ordinaryToast?.style.opacity).toBe('1');
    expect(ordinaryToast?.style.transform).toBe('translateX(0)');
  });
});
