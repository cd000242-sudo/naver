// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

function mountNoticeModal(): void {
  document.body.innerHTML = `
    <div id="notice-modal" aria-hidden="true" style="display:none">
      <div id="notice-display-content"></div>
      <div id="notice-faq-display"></div>
      <input id="notice-dont-show-today" type="checkbox">
      <button id="notice-close-btn"></button>
      <button id="notice-confirm-btn"></button>
    </div>
  `;
}

describe('notice admin runtime delivery', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    mountNoticeModal();
    Object.defineProperty(window, 'api', {
      configurable: true,
      writable: true,
      value: {},
    });
  });

  it('renders a server notice through the canonical modal without treating it as HTML', async () => {
    const module = await import('../renderer/modules/noticeAdmin') as any;

    module.showServerNotice('업데이트 완료\n<img src=x onerror=alert(1)>');

    const modal = document.getElementById('notice-modal');
    const content = document.getElementById('notice-display-content');
    expect(modal?.style.display).toBe('flex');
    expect(modal?.getAttribute('aria-hidden')).toBe('false');
    expect(content?.textContent).toContain('업데이트 완료');
    expect(content?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(content?.querySelector('img')).toBeNull();
  });

  it('pulls the cached active notice when the one-shot IPC event was missed', async () => {
    (window as any).api.getActiveNotice = vi.fn(async () => '인증 후 즉시 표시할 공지');
    const module = await import('../renderer/modules/noticeAdmin') as any;

    module.initNoticeAdmin();
    await Promise.resolve();
    await Promise.resolve();

    expect((window as any).api.getActiveNotice).toHaveBeenCalledTimes(1);
    expect(document.getElementById('notice-display-content')?.textContent).toContain('인증 후 즉시 표시할 공지');
    expect(document.getElementById('notice-modal')?.style.display).toBe('flex');
  });

  it('does not reopen a notice closed in this app session, but shows changed content', async () => {
    const module = await import('../renderer/modules/noticeAdmin') as any;
    module.initNoticeAdmin();
    module.showServerNotice('첫 번째 공지');

    document.getElementById('notice-close-btn')?.click();
    module.showServerNotice('첫 번째 공지');
    expect(document.getElementById('notice-modal')?.style.display).toBe('none');

    module.showServerNotice('내용이 바뀐 새 공지');
    expect(document.getElementById('notice-modal')?.style.display).toBe('flex');
    expect(document.getElementById('notice-display-content')?.textContent).toBe('내용이 바뀐 새 공지');
  });

  it('preserves the shutdown policy when a maintenance notice is dismissed', async () => {
    const forceQuit = vi.fn();
    (window as any).api.forceQuit = forceQuit;
    const module = await import('../renderer/modules/noticeAdmin') as any;
    module.initNoticeAdmin();

    module.showServerNotice('서비스 점검으로 잠시 이용이 제한됩니다.');
    document.getElementById('notice-confirm-btn')?.click();

    expect(forceQuit).toHaveBeenCalledTimes(1);
  });
});
