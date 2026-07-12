import { app, ipcMain } from 'electron';
import path from 'path';

import { RevenueValidationError, type RevenueEntryInput, type RevenueSettings } from '../../analytics/revenueOperations.js';
import { RevenueOperationsStore } from '../../analytics/revenueOperationsStore.js';

let store: RevenueOperationsStore | null = null;

function getStore(): RevenueOperationsStore {
  if (!store) {
    store = new RevenueOperationsStore(path.join(app.getPath('userData'), 'revenue-operations.json'));
  }
  return store;
}

function message(error: unknown): string {
  if (error instanceof RevenueValidationError) return error.message;
  return '수익 데이터를 처리하지 못했습니다. 진단 로그를 확인해 주세요.';
}

export function registerRevenueOperationsHandlers(): void {
  ipcMain.handle('revenue:getDashboard', async () => {
    try {
      return { success: true, dashboard: await getStore().getDashboard() };
    } catch (error) {
      return { success: false, message: message(error) };
    }
  });

  ipcMain.handle('revenue:addEntry', async (_event, input: RevenueEntryInput) => {
    try {
      const entry = await getStore().addEntry(input);
      return { success: true, entry, dashboard: await getStore().getDashboard() };
    } catch (error) {
      return { success: false, message: message(error) };
    }
  });

  ipcMain.handle('revenue:removeEntry', async (_event, id: string) => {
    try {
      const removed = await getStore().removeEntry(id);
      return removed
        ? { success: true, dashboard: await getStore().getDashboard() }
        : { success: false, message: '삭제할 수익 내역을 찾지 못했습니다.' };
    } catch (error) {
      return { success: false, message: message(error) };
    }
  });

  ipcMain.handle('revenue:updateSettings', async (_event, input: Partial<RevenueSettings>) => {
    try {
      const settings = await getStore().updateSettings(input);
      return { success: true, settings, dashboard: await getStore().getDashboard() };
    } catch (error) {
      return { success: false, message: message(error) };
    }
  });

  console.log('[IPC] Revenue operations handlers registered (4 handlers)');
}
