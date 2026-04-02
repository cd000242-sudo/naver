// src/main/ipc/keywordHandlers.ts
// 키워드 분석 관련 IPC 핸들러

import { ipcMain } from 'electron';
import { loadConfig, applyConfigToEnv } from '../../configManager.js';
import { KeywordAnalyzer } from '../../analytics/keywordAnalyzer.js';
import { sendLog } from '../utils/ipcHelpers.js';

const keywordAnalyzer = new KeywordAnalyzer();

/**
 * 키워드 분석기에 API 설정 적용 (공통 로직)
 */
async function applyKeywordApiConfig(): Promise<void> {
  const config = await loadConfig();
  if (config.naverDatalabClientId && config.naverDatalabClientSecret) {
    keywordAnalyzer.setNaverSearchConfig({
      clientId: config.naverDatalabClientId,
      clientSecret: config.naverDatalabClientSecret,
    });
  }
  if (config.naverAdApiKey && config.naverAdSecretKey && config.naverAdCustomerId) {
    keywordAnalyzer.setNaverAdConfig({
      apiKey: config.naverAdApiKey,
      secretKey: config.naverAdSecretKey,
      customerId: config.naverAdCustomerId,
    });
  }
}

/**
 * 키워드 분석 핸들러 등록
 */
export function registerKeywordHandlers(): void {
  ipcMain.handle('keyword:analyze', async (_event, keyword: string) => {
    try {
      const config = await loadConfig();
      applyConfigToEnv(config);
    } catch (e) {
      console.error('[Main] keyword:analyze - 설정 동기화 실패:', e);
    }

    try {
      sendLog(`🔍 키워드 분석 중: ${keyword}`);
      await applyKeywordApiConfig();
      const result = await keywordAnalyzer.analyzeKeyword(keyword);
      sendLog(`✅ 키워드 분석 완료: ${keyword} (기회점수: ${result.opportunity}, 난이도: ${result.difficulty})`);
      return { success: true, analysis: result };
    } catch (error) {
      return { success: false, message: `분석 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('keyword:findBlueOcean', async (_event, baseKeyword: string, count: number = 5) => {
    try {
      sendLog(`🌊 블루오션 키워드 검색 중: ${baseKeyword}`);
      await applyKeywordApiConfig();
      const keywords = await keywordAnalyzer.findBlueOceanKeywords(baseKeyword, count);
      sendLog(`✅ 블루오션 키워드 ${keywords.length}개 발견`);
      return { success: true, keywords };
    } catch (error) {
      return { success: false, message: `검색 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('keyword:clearCache', async () => {
    try {
      keywordAnalyzer.clearCache();
      return { success: true, message: '캐시가 초기화되었습니다.' };
    } catch (error) {
      return { success: false, message: `초기화 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('keyword:discoverBlueOcean', async (_event, count: number = 10) => {
    try {
      const config = await loadConfig();
      applyConfigToEnv(config);
    } catch (e) {
      console.error('[Main] keyword:discoverBlueOcean - 설정 동기화 실패:', e);
    }

    try {
      sendLog(`🔍 자동 블루오션 키워드 발견 중...`);
      await applyKeywordApiConfig();
      const keywords = await keywordAnalyzer.discoverBlueOceanKeywords(count);
      sendLog(`✅ 자동 발견 블루오션 키워드 ${keywords.length}개`);
      return { success: true, keywords };
    } catch (error) {
      return { success: false, message: `자동 발견 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('keyword:discoverGoldenByCategory', async (_event, count: number = 5) => {
    try {
      const config = await loadConfig();
      applyConfigToEnv(config);
    } catch (e) {
      console.error('[Main] keyword:discoverGoldenByCategory - 설정 동기화 실패:', e);
    }

    try {
      sendLog(`🏆 카테고리별 황금키워드 발견 중...`);
      await applyKeywordApiConfig();
      const result = await keywordAnalyzer.discoverGoldenKeywordsByCategory(count);
      sendLog(`✅ 카테고리별 황금키워드 발견 완료`);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, message: `발견 실패: ${(error as Error).message}` };
    }
  });

  ipcMain.handle('keyword:discoverGoldenBySingleCategory', async (_event, categoryId: string, count: number = 10) => {
    try {
      const config = await loadConfig();
      applyConfigToEnv(config);
    } catch (e) {
      console.error('[Main] keyword:discoverGoldenBySingleCategory - 설정 동기화 실패:', e);
    }

    try {
      sendLog(`🏆 ${categoryId} 카테고리 황금키워드 발견 중...`);
      await applyKeywordApiConfig();
      const result = await keywordAnalyzer.discoverGoldenKeywordsBySingleCategory(categoryId, count);
      sendLog(`✅ ${categoryId} 카테고리 황금키워드 ${result.keywords.length}개 발견`);
      return result;
    } catch (error) {
      return { success: false, message: `발견 실패: ${(error as Error).message}` };
    }
  });

  console.log('[IPC] Keyword handlers registered (6 handlers)');
}
