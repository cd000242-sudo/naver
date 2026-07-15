/* @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastManager } from '../renderer/utils/uiManagers';

describe('ToastManager untrusted-message rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="toast-container"></div>';
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders CLI/IPC-like markup as text and uses no inline event handler', () => {
    const payload = '<img src=x onerror="window.__toastXss = true">login failed';
    const manager = new ToastManager();

    manager.info(payload, 60_000);

    const toast = document.querySelector<HTMLElement>('.toast.info');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain(payload);
    expect(toast?.querySelector('img')).toBeNull();

    const closeButton = toast?.querySelector<HTMLButtonElement>('button');
    expect(closeButton?.getAttribute('onclick')).toBeNull();
    closeButton?.click();
    expect(toast?.isConnected).toBe(false);
  });
});
