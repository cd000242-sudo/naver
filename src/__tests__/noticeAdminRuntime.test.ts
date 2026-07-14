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

  it('renders server rich text exactly while sanitizing executable markup', async () => {
    const module = await import('../renderer/modules/noticeAdmin') as any;

    module.showServerNotice(
      '<p style="color:#fbbf24; font-size:32px" onclick="alert(1)"><strong>업데이트 완료</strong></p>' +
      '<img src="data:image/png;base64,AAAA" alt="공지 이미지" onerror="alert(1)">' +
      '<script>alert(1)</script>',
    );

    const modal = document.getElementById('notice-modal');
    const content = document.getElementById('notice-display-content');
    expect(modal?.style.display).toBe('flex');
    expect(modal?.getAttribute('aria-hidden')).toBe('false');
    expect(content?.textContent).toContain('업데이트 완료');
    expect(content?.querySelector('strong')?.textContent).toBe('업데이트 완료');
    expect(content?.querySelector('p')?.getAttribute('style')).toContain('color: #fbbf24');
    expect(content?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(content?.querySelector('[onclick]')).toBeNull();
    expect(content?.querySelector('[onerror]')).toBeNull();
    expect(content?.querySelector('script')).toBeNull();
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

  it('does not let a late startup cache response overwrite a newer live notice', async () => {
    let resolveCachedNotice: ((notice: string) => void) | undefined;
    (window as any).api.getActiveNotice = vi.fn(() => new Promise<string>((resolve) => {
      resolveCachedNotice = resolve;
    }));
    const module = await import('../renderer/modules/noticeAdmin') as any;

    module.initNoticeAdmin();
    module.showServerNotice('방금 도착한 최신 공지');
    resolveCachedNotice?.('시작 전에 저장된 이전 공지');
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('notice-display-content')?.textContent).toBe('방금 도착한 최신 공지');
  });

  it('skips startup cache recovery when a live notice arrived before admin initialization', async () => {
    (window as any).api.getActiveNotice = vi.fn(async () => '시작 전에 저장된 이전 공지');
    const module = await import('../renderer/modules/noticeAdmin') as any;

    module.showServerNotice('인증 직후 도착한 최신 공지');
    module.initNoticeAdmin();
    await Promise.resolve();
    await Promise.resolve();

    expect((window as any).api.getActiveNotice).not.toHaveBeenCalled();
    expect(document.getElementById('notice-display-content')?.textContent).toBe('인증 직후 도착한 최신 공지');
  });

  it('keeps the locally authored admin notice ahead of a stale server notice', async () => {
    localStorage.setItem(
      'app_notice_html_v1',
      '<p style="color:#fbbf24"><strong>운영자가 저장한 최신 공지</strong></p>',
    );
    const module = await import('../renderer/modules/noticeAdmin') as any;

    module.showServerNotice('서버에 남아 있던 예전 공지');

    const content = document.getElementById('notice-display-content');
    expect(content?.textContent).toContain('운영자가 저장한 최신 공지');
    expect(content?.textContent).not.toContain('서버에 남아 있던 예전 공지');
    expect(content?.querySelector('strong')).not.toBeNull();
  });

  it('does not replace a dismissed operator notice with a stale server notice', async () => {
    localStorage.setItem('app_notice_html_v1', '<p>Operator notice</p>');
    const module = await import('../renderer/modules/noticeAdmin') as any;
    module.initNoticeAdmin();

    document.getElementById('notice-close-btn')?.click();
    module.showServerNotice('Stale server notice');

    expect(document.getElementById('notice-modal')?.style.display).toBe('none');
    expect(document.getElementById('notice-display-content')?.textContent).toBe('Operator notice');
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

  it('reopens an operator notice immediately after saving the same content', async () => {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="admin-modal" aria-hidden="false" style="display:flex">
        <div id="admin-editor"></div>
        <div id="notice-editor"><p>Operator notice</p></div>
        <div id="admin-faq-list"></div>
        <button id="admin-save-btn"></button>
      </div>
    `);
    localStorage.setItem('app_notice_html_v1', '<p>Operator notice</p>');
    const module = await import('../renderer/modules/noticeAdmin') as any;
    module.initNoticeAdmin();

    document.getElementById('notice-close-btn')?.click();
    expect(document.getElementById('notice-modal')?.style.display).toBe('none');

    document.getElementById('admin-save-btn')?.click();
    expect(document.getElementById('notice-modal')?.style.display).toBe('flex');
    expect(document.getElementById('notice-display-content')?.textContent).toBe('Operator notice');
  });

  it('registers the server notice IPC listener once and exposes readiness', async () => {
    const on = vi.fn(() => () => undefined);
    (window as any).api.on = on;
    const events = await import('../renderer/utils/appEventsHandler') as any;

    events.initNoticeModalListener();
    events.initNoticeModalListener();

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith('app:show-notice', expect.any(Function));
    expect((window as any).__noticeListenerReady).toBe(true);
  });
});
