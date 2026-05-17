// src/main/ipc/imageCollectUrlHandlers.ts
// 일반 URL에서 이미지 추출 IPC 핸들러
// [v2.10.255] main.ts에서 분리 — god-file 압축 14단계.
//
// 분리 1개 핸들러:
//   image:collectFromUrl — URL → HTML fetch → <img> 정규식 추출 (최대 20개)
//   ⚠️ image:crawlFromUrl (imageOptimizeHandlers.ts)는 별도 — Puppeteer 강화 크롤링

import { ipcMain } from 'electron';
import { validateLicenseAndQuota, isFreeTierUser } from '../utils/authUtils.js';
import { consume as consumeQuota } from '../../quotaManager.js';

export function registerImageCollectUrlHandlers(): void {
    ipcMain.handle('image:collectFromUrl', async (_event, url: string) => {
        // ✅ [리팩토링] 통합 검증
        const check = await validateLicenseAndQuota('media', 1);
        if (!check.valid) return check.response;

        try {
            // 간단한 이미지 URL 추출 (Puppeteer 없이)
            const https = await import('https');
            const http = await import('http');
            const { URL } = await import('url');

            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;

            const html = await new Promise<string>((resolve, reject) => {
                client.get(url, { timeout: 30000 }, (response: any) => {
                    let data = '';
                    response.on('data', (chunk: string) => data += chunk);
                    response.on('end', () => resolve(data));
                    response.on('error', reject);
                }).on('error', reject);
            });

            // 이미지 URL 추출
            const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
            const images: string[] = [];
            let match;
            while ((match = imgRegex.exec(html)) !== null) {
                const imgUrl = match[1];
                if (imgUrl.startsWith('http') && /\.(jpg|jpeg|png|gif|webp)/i.test(imgUrl)) {
                    images.push(imgUrl);
                }
            }

            const result = { success: true, images: images.slice(0, 20) };
            if (result.success && (result.images?.length ?? 0) > 0 && (await isFreeTierUser())) {
                await consumeQuota('media', 1);
            }
            return result;
        } catch (error) {
            console.error('[Main] URL 이미지 수집 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    console.log('[IPC] Image collect-URL handlers registered (1 handler)');
}
