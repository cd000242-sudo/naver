// src/main/ipc/imageOptimizeHandlers.ts
// 이미지 검색어 최적화 + URL 크롤링 IPC 핸들러
// [v2.10.243] main.ts에서 분리 — main.ts god-file 압축 2단계 (file:* 다음).
//
// 분리 4개 핸들러:
//   - image:optimizeSearchQuery   (검색어 최적화)
//   - image:extractCoreSubject    (핵심 주제 추출)
//   - image:batchOptimizeSearchQueries  (배치 최적화 — 호출 1회로 처리)
//
// [2026-09-09] 위 세 핸들러는 엔진 선택과 무관하게 Gemini 로 직행했다. GPT 를 골라 둔
//   사용자도 소제목마다 Gemini 를 때려 분당 한도(429)를 맞았다(사용자 실측).
//   이젠 선택 엔진으로 부른다 — Gemini 선택이거나 키가 없으면 기존 경로 그대로다.
//   - image:crawlFromUrl          (URL에서 이미지 크롤링 — googleImageSearch)
//
// 의존성: ./gemini, ./crawler/googleImageSearch (dynamic import 그대로 보존)

import { ipcMain } from 'electron';
import { resolveSelectedEngineTextCaller } from './selectedEngineTextCaller.js';

/**
 * 이미지 검색어 최적화 + 크롤링 IPC 일괄 등록.
 */
export function registerImageOptimizeHandlers(): void {
    // 검색어 최적화 (gemini API 1회 호출)
    ipcMain.handle('image:optimizeSearchQuery', async (_event, title: string, heading: string): Promise<{
        success: boolean;
        optimizedQuery?: string;
        coreSubject?: string;
        broaderQuery?: string;
        category?: string;
        message?: string;
    }> => {
        try {
            const { optimizeImageSearchQuery } = await import('../../gemini.js');
            const route = await resolveSelectedEngineTextCaller();
            if (route) console.log(`[Main] 검색어 최적화 엔진: ${route.engine}`);
            const result = await optimizeImageSearchQuery(title, heading, undefined, route?.callText);
            console.log(`[Main] 검색어 최적화: "${heading}" → "${result.optimizedQuery}"`);
            return {
                success: true,
                optimizedQuery: result.optimizedQuery,
                coreSubject: result.coreSubject,
                broaderQuery: result.broaderQuery,
                category: result.category,
            };
        } catch (error) {
            console.error('[Main] 검색어 최적화 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [100점 개선] 핵심 주제 추출 IPC 핸들러
    ipcMain.handle('image:extractCoreSubject', async (_event, title: string): Promise<{
        success: boolean;
        subject?: string;
        message?: string;
    }> => {
        try {
            const { extractCoreSubject } = await import('../../gemini.js');
            const route = await resolveSelectedEngineTextCaller();
            const subject = await extractCoreSubject(title, undefined, route?.callText);
            console.log(`[Main] 핵심 주제 추출: "${title}" → "${subject}"`);
            return { success: true, subject };
        } catch (error) {
            console.error('[Main] 핵심 주제 추출 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [100점 개선] 배치 검색어 최적화 IPC 핸들러 (API 호출 1회로 모든 소제목 처리)
    ipcMain.handle('image:batchOptimizeSearchQueries', async (_event, title: string, headings: string[]): Promise<{
        success: boolean;
        results?: Array<{ heading: string; optimizedQuery: string; broaderQuery: string }>;
        message?: string;
    }> => {
        try {
            const { batchOptimizeImageSearchQueries } = await import('../../gemini.js');
            const route = await resolveSelectedEngineTextCaller();
            if (route) console.log(`[Main] 배치 검색어 최적화 엔진: ${route.engine}`);
            const results = await batchOptimizeImageSearchQueries(title, headings, undefined, route?.callText);
            console.log(`[Main] 배치 검색어 최적화: ${results.length}개 소제목 완료`);
            return { success: true, results };
        } catch (error) {
            console.error('[Main] 배치 검색어 최적화 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [v2.7.87] 강화된 crawlImagesFromUrl로 교체 — iframe 20개 순회 + visible 모드 + 페이지 모든 이미지
    ipcMain.handle('image:crawlFromUrl', async (_event, url: string): Promise<{
        success: boolean;
        images?: string[];
        title?: string;
        message?: string;
    }> => {
        try {
            if (!url || !url.trim()) {
                return { success: false, message: 'URL이 비어있습니다.' };
            }
            console.log(`[Main] URL에서 이미지 크롤링 (v2.7.87 강화): ${url}`);
            const { crawlImagesFromUrl, getLastCrawledTitle } = await import('../../crawler/googleImageSearch.js');
            const images = await crawlImagesFromUrl(url);
            const pageTitle = getLastCrawledTitle();
            if (images.length > 0) {
                console.log(`[Main] URL에서 ${images.length}개 이미지 추출 완료, title="${pageTitle.slice(0, 60)}"`);
                return { success: true, images, title: pageTitle };
            }
            return { success: false, message: '이미지를 찾을 수 없습니다.' };
        } catch (error) {
            console.error('[Main] URL 이미지 크롤링 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    console.log('[IPC] Image optimize handlers registered (4 handlers)');
}
