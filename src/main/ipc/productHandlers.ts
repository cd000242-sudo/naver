// src/main/ipc/productHandlers.ts
// 베스트 상품 수집 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { BestProductCollector } from '../../services/bestProductCollector.js';
import { sendLog } from '../utils/ipcHelpers.js';

const bestProductCollector = new BestProductCollector();

/**
 * 베스트 상품 핸들러 등록
 */
export function registerProductHandlers(): void {
  ipcMain.handle('bestProduct:getCategories', async (_event, platform: string = 'all') => {
    try {
      const categories = bestProductCollector.getCategories(platform as any);
      return { success: true, categories };
    } catch (error) {
      return { success: false, message: `카테고리 조회 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('bestProduct:fetchCoupang', async (_event, categoryId: string = 'all', maxCount: number = 20, useAdsPower: boolean = false) => {
    try {
      sendLog(`🛒 쿠팡 ${categoryId} 베스트 상품 수집 중... (AdsPower: ${useAdsPower ? 'ON' : 'OFF'})`);
      const result = await bestProductCollector.fetchCoupangBest(categoryId, maxCount, useAdsPower);
      if (result.success) {
        sendLog(`✅ 쿠팡 ${result.categoryName}: ${result.products.length}개 수집 완료`);
      } else {
        sendLog(`⚠️ 쿠팡 수집 실패: ${result.error || '상품을 찾을 수 없습니다'}`);
      }
      return result;
    } catch (error) {
      return { success: false, products: [], platform: 'coupang', category: categoryId, categoryName: '', fetchedAt: new Date().toISOString(), error: (error as Error).message };
    }
  });

  ipcMain.handle('bestProduct:fetchNaver', async (_event, categoryId: string = 'all', maxCount: number = 20, useAdsPower: boolean = false) => {
    try {
      sendLog(`🔍 네이버 쇼핑 ${categoryId} 인기상품 수집 중... (AdsPower: ${useAdsPower ? 'ON' : 'OFF'})`);
      const result = await bestProductCollector.fetchNaverBest(categoryId, maxCount, useAdsPower);
      if (result.success) {
        sendLog(`✅ 네이버 ${result.categoryName}: ${result.products.length}개 수집 완료`);
      } else {
        sendLog(`⚠️ 네이버 수집 실패: ${result.error || '상품을 찾을 수 없습니다'}`);
      }
      return result;
    } catch (error) {
      return { success: false, products: [], platform: 'naver', category: categoryId, categoryName: '', fetchedAt: new Date().toISOString(), error: (error as Error).message };
    }
  });

  ipcMain.handle('bestProduct:fetchAll', async (_event, categoryId: string = 'all', maxCount: number = 10) => {
    try {
      sendLog(`🔥 쿠팡+네이버 베스트 통합 수집 중...`);
      const result = await bestProductCollector.fetchAllBest(categoryId, maxCount);
      const total = (result.coupang.products?.length || 0) + (result.naver.products?.length || 0);
      sendLog(`✅ 통합 수집 완료: 총 ${total}개 (쿠팡 ${result.coupang.products?.length || 0} + 네이버 ${result.naver.products?.length || 0})`);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, message: `통합 수집 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('bestProduct:clearCache', async () => {
    try {
      bestProductCollector.clearCache();
      return { success: true, message: '캐시가 초기화되었습니다.' };
    } catch (error) {
      return { success: false, message: `초기화 실패: ${(error as Error).message}` };
    }
  });

  console.log('[IPC] Product handlers registered (5 handlers)');
}
