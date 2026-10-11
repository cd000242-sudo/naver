/**
 * [2026-10-11 사장님] "LDB 에서 삽입·배치를 누르면 저장은 빠른데 앱에 다 채워질 때까지가 느리다."
 * 코드만으로는 어느 단계인지 특정되지 않아(카테고리 재조회·이미지 파일 저장·앱 화면 반영), 단계별 시간과
 * 받을 때 앱 창 상태(숨은 창은 크롬 엔진이 느리게 돌린다)를 로그 한 줄로 남긴다.
 */
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverLdbPostsToWindow, describeLdbWindowState } from '../main/ldb-delivery.js';
import { createLdbDestinations } from '../main/ldb-destinations.js';

afterEach(() => vi.restoreAllMocks());

describe('describeLdbWindowState', () => {
  it('받을 때 앱 창 상태를 사람이 읽는 말로 남긴다', () => {
    expect(describeLdbWindowState({ isMinimized: () => true })).toBe('최소화');
    expect(describeLdbWindowState({ isMinimized: () => false, isVisible: () => false })).toBe('숨김');
    expect(describeLdbWindowState({ isMinimized: () => false, isVisible: () => true, isFocused: () => false })).toBe('보임(다른 창이 앞)');
    expect(describeLdbWindowState({ isMinimized: () => false, isVisible: () => true, isFocused: () => true })).toBe('보임(앞)');
  });
});

describe('LDB 배치 시간 기록', () => {
  it('앱 화면 반영 시간과 받을 때 창 상태를 한 줄 남긴다(이미지 없는 선택 확인은 남기지 않는다)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const ipc = new EventEmitter();
    const window = { isDestroyed: () => false, isMinimized: () => false, isVisible: () => true, isFocused: () => false,
      restore: vi.fn(), show: vi.fn(), moveTop: vi.fn(), focus: vi.fn(),
      webContents: { id: 4, isDestroyed: () => false, isLoading: () => false, send: vi.fn() } };
    const ack = () => ipc.emit('ldb:import-posts-result', { sender: { id: 4 } }, { requestId: window.webContents.send.mock.calls.at(-1)?.[2], ok: true, imported: window.webContents.send.mock.calls.at(-1)?.[1].length });
    const delivery = deliverLdbPostsToWindow(window, ipc, [{}]);
    ack(); await delivery;
    expect(log.mock.calls.map(call => String(call[0])).find(line => line.startsWith('[LDB 배치]'))).toMatch(/^\[LDB 배치\] 앱 화면 반영 \d+ms · 받을 때 앱 창: 보임\(다른 창이 앞\)$/);
    log.mockClear();
    const empty = deliverLdbPostsToWindow(window, ipc, []);
    ack(); await empty;
    expect(log.mock.calls.some(call => String(call[0]).startsWith('[LDB 배치]'))).toBe(false);
  });

  it('카테고리 확인 시간과 그 뒤 전달 시간을 나눠 남긴다', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const destinations = createLdbDestinations({
      accounts: () => [{ id: 'a1', name: '내 블로그', blogId: 'myblog', naverId: 'myblog' }], active: () => ({ id: 'a1' }),
      fetchCategories: async () => ({ success: true, categories: [{ id: '12', name: '생활' }] }),
      deliver: async posts => posts.length,
    });
    await destinations.send([{}], { accountId: 'a1', categoryId: '12' });
    expect(log.mock.calls.map(call => String(call[0])).find(line => line.startsWith('[LDB 배치]'))).toMatch(/^\[LDB 배치\] 카테고리 확인 \d+ms · 이미지 저장·앱 반영 \d+ms$/);
  });
});
