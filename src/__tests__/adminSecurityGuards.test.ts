import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf-8');

describe('admin security guards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not ship hardcoded admin passwords in renderer or login HTML', () => {
    const loginHtml = read('public', 'login.html');
    const noticeAdmin = read('src', 'renderer', 'modules', 'noticeAdmin.ts');

    expect(loginHtml).not.toContain('@qkrtjdgus12');
    expect(noticeAdmin).not.toContain("const ADMIN_PASSWORD");
    expect(noticeAdmin).not.toContain('2021645');
  });

  it('routes admin unlock through admin:verifyPin instead of client-side password comparison', () => {
    const loginHtml = read('public', 'login.html');
    const loginPreload = read('src', 'preloadLogin.ts');
    const noticeAdmin = read('src', 'renderer', 'modules', 'noticeAdmin.ts');

    expect(loginPreload).toContain("'admin:verifyPin'");
    expect(loginHtml).toContain("ipcRenderer.invoke('admin:verifyPin'");
    expect(loginHtml).not.toContain('passwordInput.value ===');
    expect(noticeAdmin).toContain('verifyAdminPin');
    expect(noticeAdmin).not.toContain('pw?.value ===');
  });

  it('sanitizes rich notice HTML before display and save', () => {
    const noticeAdmin = read('src', 'renderer', 'modules', 'noticeAdmin.ts');

    expect(noticeAdmin).toContain('function sanitizeNoticeHtml');
    expect(noticeAdmin).toContain('content.innerHTML = sanitizeNoticeHtml(notice)');
    expect(noticeAdmin).toContain('localStorage.setItem(NOTICE_KEY, sanitizeNoticeHtml(noticeEditor.innerHTML))');
    expect(noticeAdmin).toContain("attr.name.startsWith('on')");
    expect(noticeAdmin).toContain('javascript:');
  });

  it('shows the saved notice through the modal that owns notice-display-content', () => {
    const noticeAdmin = read('src', 'renderer', 'modules', 'noticeAdmin.ts');

    expect(noticeAdmin).toContain('function getNoticeDisplayElements');
    expect(noticeAdmin).toContain("document.querySelector<HTMLElement>('#notice-display-content')");
    expect(noticeAdmin).toContain("content.closest<HTMLElement>('#notice-modal')");
    expect(noticeAdmin).toContain('const elements = getNoticeDisplayElements()');
    expect(noticeAdmin).not.toContain("const modal = document.getElementById('notice-modal');\r\n  const content = document.getElementById('notice-display-content');");
  });

  it('exposes a post-login notice trigger and retries after the app is visible', () => {
    const noticeAdmin = read('src', 'renderer', 'modules', 'noticeAdmin.ts');

    expect(noticeAdmin).toContain('export function showNoticeIfAny');
    expect(noticeAdmin).toContain('(window as any).showNoticeIfAny = showNoticeIfAny');
    expect(noticeAdmin).toContain('setTimeout(showNoticeIfAny, 250)');
    expect(noticeAdmin).toContain('setTimeout(showNoticeIfAny, 1000)');
  });
});
