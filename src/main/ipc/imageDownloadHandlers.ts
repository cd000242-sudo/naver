// src/main/ipc/imageDownloadHandlers.ts
// 이미지 다운로드 + 저장 IPC 핸들러
// [v2.10.250] main.ts에서 분리 — god-file 압축 9단계.
//
// 분리 1개 핸들러 (확장 예정 — downloadAndSaveMultiple은 다음 단계):
//   image:downloadAndSave — 단일 이미지 다운로드 (data: / file: / http(s)) + userData/Downloads 저장
//
// 의존성: fs.promises, path, loadConfig. context 불필요.

import { ipcMain } from 'electron';
import * as path from 'path';
import * as fsp from 'fs/promises';
// [SPEC-FREEZE-GUARD-001-P2 R5 / v2.10.264] Base64 디코딩 워커 분리 — 수동 다운로드 data URL 분기
import { decodeBase64Async } from '../utils/base64Async.js';
import { loadConfig } from '../../configManager.js';
import { isFreeTierUser } from '../utils/authUtils.js';
import { consume as consumeQuota } from '../../quotaManager.js';
import {
    buildBatchImageFileName,
    resolveBatchImageDirectory,
    type BatchImageDestination,
} from './imageDownloadPathPolicy.js';
import { summarizeBatchImageDownloads } from './imageDownloadResultPolicy.js';

export function registerImageDownloadHandlers(): void {
    ipcMain.handle('image:downloadAndSave', async (_event, imageUrl: string, heading: string, postTitle?: string, postId?: string, category?: string) => {
        try {
            const https = await import('https');
            const http = await import('http');
            const { URL, fileURLToPath } = await import('url');

            let buffer: Buffer;
            let ext = '.jpg';

            const trimmedUrl = String(imageUrl || '').trim();
            if (!trimmedUrl) {
                return { success: false, message: 'imageUrl이 비어있습니다.' };
            }

            // 1) data: URL 지원 (AI 생성 이미지가 dataURL로 오는 경우)
            if (/^data:/i.test(trimmedUrl)) {
                const m = trimmedUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
                if (!m) {
                    return { success: false, message: '지원하지 않는 data URL 형식입니다.' };
                }
                const mime = m[1].toLowerCase();
                const base64 = m[2];
                // [SPEC-FREEZE-GUARD-001-P2 R5] 워커 디코딩 (수동 다운로드 data URL 분기)
                buffer = await decodeBase64Async(base64);

                if (mime.includes('png')) ext = '.png';
                else if (mime.includes('jpeg')) ext = '.jpeg';
                else if (mime.includes('jpg')) ext = '.jpg';
                else if (mime.includes('webp')) ext = '.webp';
                else if (mime.includes('gif')) ext = '.gif';
                else ext = '.png';
            } else {
                const parsedUrl = new URL(trimmedUrl);

                // 2) file: URL 지원
                if (parsedUrl.protocol === 'file:') {
                    const localFilePath = fileURLToPath(parsedUrl);
                    buffer = await fsp.readFile(localFilePath);
                    ext = path.extname(localFilePath) || '.jpg';
                } else {
                    // 3) http(s) 다운로드
                    const client = parsedUrl.protocol === 'https:' ? https : http;
                    buffer = await new Promise<Buffer>((resolve, reject) => {
                        client.get(trimmedUrl, { timeout: 30000 }, (response: any) => {
                            const chunks: Buffer[] = [];
                            response.on('data', (chunk: Buffer) => chunks.push(chunk));
                            response.on('end', () => resolve(Buffer.concat(chunks)));
                            response.on('error', reject);
                        }).on('error', reject);
                    });
                    ext = path.extname(parsedUrl.pathname) || '.jpg';
                }
            }

            // ✅ [v2.10.21] image:downloadAndSave 저장 경로를 다른 IPC와 통일 — 사용자 보고
            //   '풀오토만 폴더 생성되고 URL 이미지 수집은 안 된다'
            //   원인: 이 핸들러만 userData/images 폴더에 저장 → 사용자가 Downloads 폴더에서 못 찾음
            //   조치: customImageSavePath(=Downloads/naver-blog-images) 우선 + Downloads 폴백 + 글제목 서브폴더
            const osMod = await import('os');
            const fallbackPath = path.join(osMod.homedir(), 'Downloads', 'naver-blog-images');
            let basePath = fallbackPath;
            try {
                const config = await loadConfig();
                const cfgPath = String((config as any).customImageSavePath || '').trim();
                if (cfgPath) basePath = cfgPath;
            } catch { /* fallback 사용 */ }

            // ✅ [v2.10.54] 폴더명/파일명 sanitize 강화 (image:downloadAndSave도 통일)
            const safeTitle = (postTitle || category || 'images')
                .normalize('NFC')
                .replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_')
                .replace(/[…·•◦‧⋯⋮⋯]/g, '_')
                .replace(/\s+/g, '_')
                .replace(/\.+$/, '')
                .replace(/_+/g, '_')
                .replace(/_+$/, '')
                .substring(0, 80)
                .trim() || 'images';
            const safeHeading = (heading || 'image')
                .normalize('NFC')
                .replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_')
                .replace(/[…·•◦‧⋯⋮⋯]/g, '_')
                .replace(/_+/g, '_')
                .replace(/\.+$/g, '')
                .substring(0, 50)
                .trim() || 'image';
            const fileName = `${safeHeading}-${Date.now()}${ext}`;

            let imagesPath = path.join(basePath, safeTitle);
            try {
                await fsp.mkdir(imagesPath, { recursive: true });
                console.log(`[Main] ✅ image:downloadAndSave 저장 경로: ${imagesPath}`);
            } catch (mkErr: any) {
                console.warn(`[Main] ⚠️ basePath mkdir 실패 (${basePath}) → Downloads 폴백: ${mkErr?.message}`);
                imagesPath = path.join(fallbackPath, safeTitle);
                await fsp.mkdir(imagesPath, { recursive: true });
            }
            const filePath = path.join(imagesPath, fileName);

            await fsp.writeFile(filePath, buffer);
            const previewDataUrl = `data:image/${ext.slice(1)};base64,${buffer.toString('base64')}`;

            return { success: true, filePath, previewDataUrl, savedToLocal: filePath };
        } catch (error) {
            console.error('[Main] 이미지 다운로드 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // [v2.10.254] image:downloadAndSaveMultiple — 다중 이미지 배치 다운로드 (BATCH=4 청크)
    ipcMain.handle('image:downloadAndSaveMultiple', async (
        _event,
        images: Array<{ url: string; heading: string }>,
        title: string,
        options?: { destination?: BatchImageDestination },
    ) => {
        console.log(`[Main] 🖼️ image:downloadAndSaveMultiple 호출 — 이미지 ${images?.length || 0}개, title="${title}"`);

        try {
            const axios = (await import('axios')).default;
            const os = await import('os');

            const savedImages: any[] = [];
            const destination: BatchImageDestination = options?.destination === 'configured-root'
                ? 'configured-root'
                : 'title-subfolder';
            const batchToken = destination === 'configured-root'
                ? (await import('crypto')).randomUUID().slice(0, 8)
                : '';
            // ✅ [v2.10.54] safeTitle 정규식 보강 — 줄임표/가운뎃점/기타 유니코드 특수문자
            const safeTitle = (title || 'untitled')
                .normalize('NFC')
                .replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_')
                .replace(/[…·•◦‧⋯⋮⋯]/g, '_')
                .replace(/\s+/g, '_')
                .replace(/\.+$/, '')
                .replace(/_+/g, '_')
                .replace(/_+$/, '')
                .substring(0, 80)
                .trim() || 'untitled';

            // ✅ [v2.8.8] 이미지 저장 경로 보장 — customImageSavePath 우선, 실패 시 Downloads 폴백
            const fallbackPath = path.join(os.homedir(), 'Downloads', 'naver-blog-images');
            let basePath = fallbackPath;
            try {
                const config = await loadConfig();
                const cfgPath = String((config as any).customImageSavePath || '').trim();
                if (cfgPath) {
                    basePath = cfgPath;
                } else {
                    // 기본 경로를 config에 영속화
                    const { saveConfig } = await import('../../configManager.js');
                    await saveConfig({ ...config, customImageSavePath: fallbackPath } as any);
                    console.log(`[Main] customImageSavePath 미세팅 → ${fallbackPath}로 자동 영속화`);
                }
            } catch (cfgErr: any) {
                console.warn(`[Main] config 로드 실패 — fallback 사용: ${cfgErr?.message}`);
            }

            let imagesPath = resolveBatchImageDirectory(basePath, safeTitle, destination);
            try {
                await fsp.mkdir(imagesPath, { recursive: true });
                console.log(`[Main] ✅ 이미지 저장 경로 생성: ${imagesPath}`);
            } catch (mkErr: any) {
                console.warn(`[Main] ⚠️ basePath mkdir 실패 (${basePath}) → Downloads 폴백: ${mkErr?.message}`);
                imagesPath = resolveBatchImageDirectory(fallbackPath, safeTitle, destination);
                await fsp.mkdir(imagesPath, { recursive: true });
                console.log(`[Main] ✅ 폴백 경로 생성: ${imagesPath}`);
            }

            // ✅ [2026-04-18 FIX] Referer를 URL의 origin으로 동적 설정 — 핫링크 방지 우회
            const inferRefererFromUrl = (imgUrl: string): string => {
                try {
                    const u = new URL(imgUrl);
                    const host = u.hostname;
                    if (host.includes('coupangcdn') || host.includes('coupang')) return 'https://www.coupang.com/';
                    if (host.includes('pstatic') || host.includes('phinf')) return 'https://smartstore.naver.com/';
                    if (host.includes('shopping-phinf')) return 'https://brand.naver.com/';
                    return `${u.protocol}//${u.host}/`;
                } catch {
                    return 'https://search.naver.com/';
                }
            };

            const downloadImage = async (url: string, maxRetries = 3): Promise<{ buffer: Buffer; contentType: string } | null> => {
                const referer = inferRefererFromUrl(url);
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        const response = await axios.get(url, {
                            responseType: 'arraybuffer',
                            timeout: 30000,
                            maxRedirects: 5,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': referer,
                                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                            },
                            validateStatus: (status) => status >= 200 && status < 400,
                        });

                        const buffer = Buffer.from(response.data);
                        // ✅ axios 1.x: response.headers['content-type']가 union type 반환 → String() 변환
                        const contentType = String(response.headers['content-type'] || 'image/jpeg');

                        if (buffer.length < 1024) {
                            console.warn(`[Main] ⚠️ 이미지 크기 너무 작음 (${buffer.length}bytes), 재시도 ${attempt}/${maxRetries}`);
                            if (attempt < maxRetries) {
                                await new Promise(r => setTimeout(r, 500 * attempt));
                                continue;
                            }
                            return null;
                        }

                        return { buffer, contentType };
                    } catch (error: any) {
                        const errorMsg = error.response?.status
                            ? `HTTP ${error.response.status}`
                            : (error.code || error.message);
                        console.warn(`[Main] ⚠️ 다운로드 시도 ${attempt}/${maxRetries} 실패: ${errorMsg}`);

                        if (attempt < maxRetries) {
                            await new Promise(r => setTimeout(r, 1000 * attempt));
                        }
                    }
                }
                return null;
            };

            const getExtensionFromContentType = (contentType: string, url: string): string => {
                const typeMap: Record<string, string> = {
                    'image/jpeg': '.jpg',
                    'image/jpg': '.jpg',
                    'image/png': '.png',
                    'image/gif': '.gif',
                    'image/webp': '.webp',
                    'image/avif': '.avif',
                    'image/svg+xml': '.svg',
                };

                for (const [type, ext] of Object.entries(typeMap)) {
                    if (contentType.includes(type)) return ext;
                }

                const urlPath = url.split('?')[0];
                const urlExt = path.extname(urlPath).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(urlExt)) {
                    return urlExt === '.jpeg' ? '.jpg' : urlExt;
                }

                return '.jpg';
            };

            // ✅ [v2.10.32] 무제한 Promise.all → batch=4 청크 (저사양 PC RSS 스파이크 차단)
            const downloadOne = async (img: any, i: number): Promise<{ filePath: string; heading: string } | null> => {
                const result = await downloadImage(img.url);

                if (!result) {
                    console.error(`[Main] ❌ 이미지 ${i + 1} 다운로드 최종 실패: ${img.heading}`);
                    return null;
                }

                try {
                    const ext = getExtensionFromContentType(result.contentType, img.url);
                    const safeHeading = img.heading.replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_').replace(/\.+$/g, '').substring(0, 50);
                    const fileName = buildBatchImageFileName(
                        i,
                        safeHeading,
                        ext,
                        safeTitle,
                        destination,
                        batchToken,
                    );
                    const filePath = path.join(imagesPath, fileName);

                    await fsp.writeFile(filePath, result.buffer);
                    console.log(`[Main] ✅ 이미지 ${i + 1} 저장 완료: ${fileName} (${Math.round(result.buffer.length / 1024)}KB)`);

                    return { filePath, heading: img.heading };
                } catch (writeError) {
                    console.error(`[Main] ❌ 이미지 ${i + 1} 파일 저장 실패:`, writeError);
                    return null;
                }
            };

            const BATCH = 4;
            const results: Array<{ filePath: string; heading: string } | null> = new Array(images.length).fill(null);
            for (let start = 0; start < images.length; start += BATCH) {
                const end = Math.min(start + BATCH, images.length);
                const chunkPromises: Array<Promise<void>> = [];
                for (let i = start; i < end; i++) {
                    chunkPromises.push(
                        downloadOne(images[i], i).then((r) => { results[i] = r; })
                    );
                }
                await Promise.all(chunkPromises);
            }

            // ✅ [2026-04-18 FIX] 인덱스 정합성 보존 — 실패한 슬롯을 null로 유지
            for (const r of results) {
                savedImages.push(r);
            }

            const summary = summarizeBatchImageDownloads(results, images.length);

            console.log(`[Main] 📊 다운로드 결과: 성공 ${summary.successCount}개, 실패 ${summary.failCount}개`);

            const response = {
                success: summary.success,
                partial: summary.partial,
                successCount: summary.successCount,
                failCount: summary.failCount,
                savedImages,
                folderPath: imagesPath,
                ...(summary.success ? {} : { error: '이미지를 저장하지 못했습니다.' }),
            };
            if (summary.shouldConsumeQuota && (await isFreeTierUser())) {
                await consumeQuota('media', 1);
            }
            return response;
        } catch (error) {
            console.error('[Main] 다중 이미지 다운로드 실패:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    console.log('[IPC] Image download handlers registered (2 handlers)');
}
