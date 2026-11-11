import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createLdbConnectConsent, LDB_CONNECT_PROMPT, LDB_CONNECT_MERGE_MS,
} from '../main/ldb-connect-consent.js';

/** Builds the consent gate with injected Electron/config seams; `answer` is the clicked button index. */
function setup(options: { enabled?: boolean; answer?: number } = {}) {
  const state = { enabled: options.enabled ?? false, now: 1_000_000, answer: options.answer ?? 0 };
  const showMessageBox = vi.fn(async (_opts: unknown) => ({ response: state.answer }));
  const enable = vi.fn(async () => { state.enabled = true; });
  const request = createLdbConnectConsent({
    isEnabled: async () => state.enabled,
    showMessageBox,
    enable,
    now: () => state.now,
  });
  return { state, showMessageBox, enable, request };
}

describe('LDB 확장 연결 동의 창', () => {
  it('이미 켜져 있으면 창 없이 그대로 둔다', async () => {
    const { request, showMessageBox, enable } = setup({ enabled: true });
    await expect(request()).resolves.toBe('already-enabled');
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(enable).not.toHaveBeenCalled();
  });

  it('꺼져 있으면 정해진 제목·본문·단추로 한 번 묻는다', async () => {
    const { request, showMessageBox } = setup({ answer: 1 });
    await request();
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(showMessageBox.mock.calls[0][0]).toMatchObject({
      title: 'LDB 확장 연결',
      message: '크롬의 LDB 확장이 이 앱과 연결하려고 해요. 연결을 켤까요?',
      buttons: ['켜기', '나중에'],
    });
    expect(LDB_CONNECT_PROMPT.buttons).toEqual(['켜기', '나중에']);
  });

  it('엔터나 닫기 단추는 [나중에]로 처리되도록 기본값을 [나중에]에 둔다', async () => {
    const { request, showMessageBox } = setup({ answer: 1 });
    await request();
    expect(showMessageBox.mock.calls[0][0]).toMatchObject({ defaultId: 1, cancelId: 1 });
  });

  it('[켜기]를 누르면 그때서야 켜기 동작을 한 번 부른다', async () => {
    const { request, showMessageBox, enable } = setup({ answer: 0 });
    const order: string[] = [];
    showMessageBox.mockImplementation(async () => { order.push('dialog'); return { response: 0 }; });
    enable.mockImplementation(async () => { order.push('enable'); });
    await expect(request()).resolves.toBe('enabled');
    expect(enable).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['dialog', 'enable']);
  });

  it('[나중에]를 누르면 아무것도 바꾸지 않는다', async () => {
    const { request, enable, state } = setup({ answer: 1 });
    await expect(request()).resolves.toBe('declined');
    expect(enable).not.toHaveBeenCalled();
    expect(state.enabled).toBe(false);
  });

  it('켠 뒤 다시 불리면 창 없이 지나간다', async () => {
    const { request, showMessageBox, state } = setup({ answer: 0 });
    await request();
    state.now += LDB_CONNECT_MERGE_MS * 10;
    await expect(request()).resolves.toBe('already-enabled');
    expect(showMessageBox).toHaveBeenCalledTimes(1);
  });

  it('[나중에] 뒤 5초 안의 연속 호출은 한 번으로 합치고, 5초가 지나면 창을 또 띄운다', async () => {
    const { request, showMessageBox, state } = setup({ answer: 1 });
    await request();
    state.now += LDB_CONNECT_MERGE_MS - 1;
    await expect(request()).resolves.toBe('merged');
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    state.now += 1;
    await expect(request()).resolves.toBe('declined');
    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('창이 떠 있는 동안 들어온 호출은 새 창을 만들지 않는다', async () => {
    const { request, showMessageBox, enable } = setup();
    let answerDialog!: (value: { response: number }) => void;
    showMessageBox.mockImplementation(() => new Promise(resolve => { answerDialog = resolve; }));
    const first = request();
    const second = request();
    const third = request();
    await expect(second).resolves.toBe('merged');
    await expect(third).resolves.toBe('merged');
    await vi.waitFor(() => expect(showMessageBox).toHaveBeenCalledTimes(1));
    answerDialog({ response: 0 });
    await expect(first).resolves.toBe('enabled');
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(enable).toHaveBeenCalledTimes(1);
  });

  it('켜기 동작이 실패해도 예외를 던지지 않고, 5초 뒤에는 다시 물을 수 있다', async () => {
    const { request, enable, showMessageBox, state } = setup({ answer: 0 });
    enable.mockRejectedValueOnce(new Error('save failed'));
    await expect(request()).resolves.toBe('failed');
    expect(state.enabled).toBe(false);
    state.now += LDB_CONNECT_MERGE_MS;
    await expect(request()).resolves.toBe('enabled');
    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('창을 띄우지 못하면 아무것도 켜지 않는다', async () => {
    const { request, enable, showMessageBox } = setup();
    showMessageBox.mockRejectedValueOnce(new Error('no window'));
    await expect(request()).resolves.toBe('failed');
    expect(enable).not.toHaveBeenCalled();
  });

  it('설정을 읽지 못하면 묻지도 켜지도 않는다', async () => {
    const showMessageBox = vi.fn(async () => ({ response: 0 }));
    const enable = vi.fn(async () => undefined);
    const request = createLdbConnectConsent({ isEnabled: async () => { throw new Error('read failed'); }, showMessageBox, enable });
    await expect(request()).resolves.toBe('failed');
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(enable).not.toHaveBeenCalled();
  });
});

describe('LDB 확장 연결 동의 창 — main.ts 연결', () => {
  const main = readFileSync('src/main.ts', 'utf8');
  const between = (from: string, to: string) => {
    const start = main.indexOf(from);
    const end = main.indexOf(to, start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    return main.slice(start, end);
  };

  it('고정 주소가 아니면 연결 요청 자체를 만들지 않는다', () => {
    const handler = between('const handleLdbConnectUrl =', 'const broadcastLdbBridgeState');
    expect(handler.indexOf('if (!isLdbConnectUrl(value)) return;')).toBeGreaterThan(0);
    expect(handler.indexOf('if (!isLdbConnectUrl(value)) return;')).toBeLessThan(handler.indexOf('ldbConnectPending = true'));
  });

  it('꺼져 있을 때는 동의 창을 거치고, 묻지 않고 켜는 길은 없다', () => {
    const resume = between('const resumeLdbConnect =', 'const handleLdbConnectUrl =');
    expect(resume).toContain('requestLdbConnectConsent()');
    expect(main.match(/ldbBridgeEnabled: true/g)).toHaveLength(1);
    const consent = between('const requestLdbConnectConsent =', 'const resumeLdbConnect =');
    expect(consent).toContain('saveConfig({ ldbBridgeEnabled: true })');
  });

  it('[켜기] 뒤에는 설정 스위치와 같은 후처리 함수를 부른다', () => {
    const consent = between('const requestLdbConnectConsent =', 'const resumeLdbConnect =');
    expect(consent).toContain('refreshLdbBridgeAfterConfigChange()');
    expect(main).toMatch(/onAccountActivated: \(\) => \{ void refreshLdbBridgeAfterConfigChange\(\); \}/);
  });
});
