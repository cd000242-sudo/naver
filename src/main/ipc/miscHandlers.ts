// src/main/ipc/miscHandlers.ts
// 기타 IPC 핸들러 (튜토리얼, 이미지 저장, 콘텐츠 수집, SEO)

import { ipcMain, app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig } from '../../configManager.js';

/**
 * 기타 핸들러 등록
 */
export function registerMiscHandlers(): void {

    // 튜토리얼 영상 목록 가져오기
    ipcMain.handle('tutorials:getVideos', async () => {
        console.log('[miscHandlers] tutorials:getVideos 핸들러 시작');
        try {
            const config = await loadConfig();
            console.log('[miscHandlers] tutorials:getVideos config 로드 완료');
            const videos = (config as any).tutorialVideos || [];
            console.log('[miscHandlers] tutorials:getVideos 영상 수:', videos.length);
            return videos;
        } catch (error) {
            console.error('[miscHandlers] tutorials:getVideos 오류:', error);
            return [];
        }
    });

    // 저장된 이미지 경로 가져오기
    ipcMain.handle('images:getSavedPath', async () => {
        return path.join(app.getPath('userData'), 'images');
    });

    // 저장된 이미지 목록 가져오기
    ipcMain.handle('images:getSaved', async (_event, dirPath: string) => {
        try {
            const files = await fs.readdir(dirPath);
            const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
            const images = imageFiles.map(f => path.join(dirPath, f));
            return { success: true, images };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // 플랫폼에서 콘텐츠 수집 (실시간 정보)
    ipcMain.handle('content:collectFromPlatforms', async (_event, keyword: string, options?: { maxPerSource?: number; targetDate?: string }) => {
        try {
            const { collectContentFromPlatforms } = await import('../../sourceAssembler.js');
            const config = await loadConfig();
            const result = await collectContentFromPlatforms(keyword, {
                maxPerSource: options?.maxPerSource || 5,
                clientId: config.naverDatalabClientId,
                clientSecret: config.naverDatalabClientSecret,
                logger: (msg: string) => console.log(msg),
                targetDate: options?.targetDate,
            });
            return result;
        } catch (error) {
            console.error('[miscHandlers] 플랫폼 콘텐츠 수집 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // 쇼핑커넥트 SEO 제목 생성
    ipcMain.handle('seo:generateTitle', async (_event, productName: string): Promise<{ success: boolean; title?: string; message?: string }> => {
        try {
            console.log(`[miscHandlers] SEO 제목 생성 요청: "${productName}"`);

            if (!productName || productName.trim().length < 3) {
                return { success: true, title: productName || '' };
            }

            const { generateShoppingConnectTitle } = await import('../../naverSearchApi.js');
            const seoTitle = await generateShoppingConnectTitle(productName.trim(), 3);

            console.log(`[miscHandlers] SEO 제목 생성 완료: "${seoTitle}"`);
            return { success: true, title: seoTitle };
        } catch (error) {
            console.error('[miscHandlers] SEO 제목 생성 오류:', error);
            return { success: false, title: productName, message: (error as Error).message };
        }
    });
}
