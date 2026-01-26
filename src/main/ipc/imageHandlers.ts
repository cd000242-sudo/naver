// src/main/ipc/imageHandlers.ts
// 이미지 및 미디어 관련 IPC 핸들러
// ✅ [100점 수정] Veo 영상 생성, KenBurns, MP4→GIF 변환 구현

import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { IpcContext } from '../types';
import axios from 'axios';
import { spawn } from 'child_process';

// ffmpeg-static 경로 (GIF 변환용)
let ffmpegPath: string | null = null;
try {
    const ffmpegStatic = require('ffmpeg-static');
    ffmpegPath = ffmpegStatic;
} catch (e) {
    console.warn('[imageHandlers] ffmpeg-static을 찾을 수 없습니다.');
}

/**
 * 이미지 핸들러 등록
 */
export function registerImageHandlers(ctx: IpcContext): void {
    // 저장된 이미지 경로 가져오기
    ipcMain.handle('images:getSavedPath', async () => {
        return path.join(os.homedir(), 'naver-blog-automation', 'images');
    });

    // 저장된 이미지 목록 가져오기
    ipcMain.handle('images:getSaved', async (_event, dirPath: string) => {
        try {
            if (!fs.existsSync(dirPath)) return [];
            const files = fs.readdirSync(dirPath);
            return files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
        } catch {
            return [];
        }
    });

    // 이미지 다운로드 및 저장
    ipcMain.handle('image:downloadAndSave', async (_event, imageUrl: string, heading: string, postTitle?: string, postId?: string) => {
        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
            const buffer = Buffer.from(response.data);

            const ext = imageUrl.match(/\.(png|jpg|jpeg|gif|webp)/i)?.[1] || 'png';
            const safeHeading = heading.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
            const fileName = `${safeHeading}-${Date.now()}.${ext}`;

            const saveDir = path.join(app.getPath('userData'), 'images', postId || 'temp');
            await fsp.mkdir(saveDir, { recursive: true });

            const filePath = path.join(saveDir, fileName);
            await fsp.writeFile(filePath, buffer);

            const previewDataUrl = `data:image/${ext};base64,${buffer.toString('base64')}`;
            return { success: true, filePath, previewDataUrl, savedToLocal: filePath };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // URL에서 이미지 수집
    ipcMain.handle('image:collectFromUrl', async (_event, url: string) => {
        console.log('[imageHandlers] image:collectFromUrl - placeholder');
        return { success: false, images: [] };
    });

    // ✅ [2026-01-23 FIX] 쇼핑몰에서 이미지 수집 - 실제 구현
    ipcMain.handle('image:collectFromShopping', async (_event, url: string) => {
        console.log('[imageHandlers] image:collectFromShopping 시작:', url);
        try {
            if (!url || typeof url !== 'string') {
                return { success: false, images: [], message: 'URL이 제공되지 않았습니다.' };
            }

            // crawlFromAffiliateLink 함수 사용
            const { crawlFromAffiliateLink } = await import('../../crawler/productSpecCrawler.js');
            const crawlResult = await crawlFromAffiliateLink(url);

            // ✅ AffiliateProductInfo 타입에서 images 배열 구성
            if (crawlResult) {
                const images: string[] = [];
                if (crawlResult.mainImage) images.push(crawlResult.mainImage);
                if (crawlResult.galleryImages) images.push(...crawlResult.galleryImages);
                if (crawlResult.detailImages) images.push(...crawlResult.detailImages.slice(0, 5));

                // 중복 제거
                const uniqueImages = [...new Set(images)].filter(Boolean);

                if (uniqueImages.length > 0) {
                    console.log(`[imageHandlers] ✅ 이미지 수집 성공: ${uniqueImages.length}개`);
                    return {
                        success: true,
                        images: uniqueImages,
                        title: crawlResult.name,
                        productInfo: {
                            name: crawlResult.name,
                            price: crawlResult.price,
                        }
                    };
                }
            }

            // 폴백: Naver 쇼핑 API로 이미지 검색
            console.log('[imageHandlers] crawlFromAffiliateLink 실패, Naver API 폴백 시도...');
            try {
                const { searchShopping } = await import('../../naverSearchApi.js');

                // URL에서 키워드 추출 (간단한 방법)
                const urlObj = new URL(url);
                let keyword = urlObj.searchParams.get('query') ||
                    urlObj.searchParams.get('keyword') ||
                    urlObj.pathname.split('/').pop()?.replace(/-/g, ' ') || '';

                if (keyword) {
                    const searchResult = await searchShopping({ query: keyword, display: 5 });
                    if (searchResult.items && searchResult.items.length > 0) {
                        const images = searchResult.items
                            .filter((item: any) => item.image)
                            .map((item: any) => item.image);

                        if (images.length > 0) {
                            console.log(`[imageHandlers] ✅ Naver API 폴백 성공: ${images.length}개`);
                            return {
                                success: true,
                                images,
                                title: searchResult.items[0].title?.replace(/<[^>]*>/g, '') || keyword
                            };
                        }
                    }
                }
            } catch (naverError) {
                console.warn('[imageHandlers] Naver API 폴백 실패:', (naverError as Error).message);
            }

            return { success: false, images: [], message: '이미지를 찾을 수 없습니다.' };
        } catch (error) {
            console.error('[imageHandlers] image:collectFromShopping 오류:', error);
            return { success: false, images: [], message: (error as Error).message };
        }
    });

    // 여러 이미지 다운로드 및 저장
    ipcMain.handle('image:downloadAndSaveMultiple', async (_event, images: Array<{ url: string; heading: string }>, title: string) => {
        console.log('[imageHandlers] image:downloadAndSaveMultiple - placeholder');
        return { success: false, savedPaths: [] };
    });

    // 비교표 이미지 생성
    ipcMain.handle('image:generateComparisonTable', async (_event, options: any) => {
        console.log('[imageHandlers] image:generateComparisonTable - placeholder');
        return { success: false };
    });

    // ✅ [2026-01-19] 장단점 표 이미지 생성
    ipcMain.handle('image:generateProsConsTable', async (_event, options: {
        productName: string;
        pros: string[];
        cons: string[];
    }) => {
        try {
            const { productName, pros, cons } = options;
            console.log(`[imageHandlers] 장단점 표 생성: ${productName}, 장점 ${pros.length}개, 단점 ${cons.length}개`);

            const { generateProsConsTableImage } = await import('../../image/tableImageGenerator.js');
            const result = await generateProsConsTableImage(productName, pros, cons);

            if (result) {
                console.log(`[imageHandlers] ✅ 장단점 표 생성 완료: ${result}`);
                return { success: true, path: result };
            } else {
                return { success: false, message: '장단점 표 생성 실패' };
            }
        } catch (error) {
            console.error('[imageHandlers] 장단점 표 생성 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });
}

/**
 * ✅ [100점 수정] 미디어(비디오) 핸들러 등록 - 실제 구현
 */
export function registerMediaHandlers(ctx: IpcContext): void {
    // MP4 파일 목록
    ipcMain.handle('media:listMp4Files', async (_event, payload: { dirPath: string }) => {
        try {
            const { dirPath } = payload;
            if (!fs.existsSync(dirPath)) {
                return { success: true, files: [] };
            }

            const entries = await fsp.readdir(dirPath, { withFileTypes: true });
            const mp4Files = [];

            for (const entry of entries) {
                if (entry.isFile() && /\.mp4$/i.test(entry.name)) {
                    const fullPath = path.join(dirPath, entry.name);
                    const stat = await fsp.stat(fullPath);
                    mp4Files.push({
                        name: entry.name,
                        fullPath,
                        mtime: stat.mtimeMs,
                        size: stat.size
                    });
                }
            }

            // 최신순 정렬
            mp4Files.sort((a, b) => b.mtime - a.mtime);
            return { success: true, files: mp4Files };
        } catch (error) {
            return { success: false, files: [], message: (error as Error).message };
        }
    });

    // ✅ [100점 수정] MP4 → GIF 변환 (실제 구현)
    ipcMain.handle('media:convertMp4ToGif', async (_event, payload: { sourcePath: string; aspectRatio?: string }) => {
        try {
            const { sourcePath, aspectRatio } = payload;

            if (!ffmpegPath) {
                return { success: false, message: 'ffmpeg-static을 찾을 수 없습니다.' };
            }

            if (!fs.existsSync(sourcePath)) {
                return { success: false, message: '원본 MP4 파일이 없습니다.' };
            }

            const gifPath = sourcePath.replace(/\.mp4$/i, '.gif');
            const fps = 12;
            const width = 480;

            let filter: string;
            if (aspectRatio === '1:1') {
                filter = `fps=${fps},scale=${width}:${width}:force_original_aspect_ratio=increase,crop=${width}:${width},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
            } else if (aspectRatio === '9:16') {
                const height = Math.round(width * (16 / 9));
                filter = `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
            } else {
                filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
            }

            return new Promise((resolve) => {
                const args = ['-y', '-i', sourcePath, '-vf', filter, gifPath];
                const ffmpeg = spawn(ffmpegPath as string, args);

                ffmpeg.on('error', (err) => {
                    console.error('[mediaHandlers] ffmpeg 오류:', err);
                    resolve({ success: false, message: err.message });
                });

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        console.log(`[mediaHandlers] ✅ GIF 변환 완료: ${gifPath}`);
                        resolve({ success: true, gifPath });
                    } else {
                        resolve({ success: false, message: `ffmpeg 종료 코드: ${code}` });
                    }
                });
            });
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [100점 수정] Ken Burns 비디오 생성 (실제 구현)
    ipcMain.handle('media:createKenBurnsVideo', async (_event, payload: { imagePath: string; heading?: string; durationSeconds?: number; aspectRatio?: string }) => {
        try {
            const { imagePath, heading, durationSeconds = 6, aspectRatio = '16:9' } = payload;

            if (!ffmpegPath) {
                return { success: false, message: 'ffmpeg-static을 찾을 수 없습니다.' };
            }

            if (!fs.existsSync(imagePath)) {
                return { success: false, message: '원본 이미지 파일이 없습니다.' };
            }

            const safeHeading = (heading || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
            const fileName = `${safeHeading}-${Date.now()}.mp4`;
            const outputDir = path.join(app.getPath('userData'), 'videos');
            await fsp.mkdir(outputDir, { recursive: true });
            const outputPath = path.join(outputDir, fileName);

            // 비율에 따른 해상도
            let width = 1280, height = 720;
            if (aspectRatio === '9:16') { width = 720; height = 1280; }
            else if (aspectRatio === '1:1') { width = 720; height = 720; }

            // Ken Burns 효과: 줌인 + 살짝 이동
            const filter = `scale=${width * 1.2}:${height * 1.2},zoompan=z='min(zoom+0.0015,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${durationSeconds * 25}:s=${width}x${height}:fps=25`;

            return new Promise((resolve) => {
                const args = [
                    '-y',
                    '-loop', '1',
                    '-i', imagePath,
                    '-vf', filter,
                    '-c:v', 'libx264',
                    '-t', String(durationSeconds),
                    '-pix_fmt', 'yuv420p',
                    '-an',
                    outputPath
                ];

                const ffmpeg = spawn(ffmpegPath as string, args);

                ffmpeg.on('error', (err) => {
                    console.error('[mediaHandlers] KenBurns ffmpeg 오류:', err);
                    resolve({ success: false, message: err.message });
                });

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        console.log(`[mediaHandlers] ✅ KenBurns 영상 생성 완료: ${outputPath}`);
                        resolve({ success: true, filePath: outputPath, fileName });
                    } else {
                        resolve({ success: false, message: `ffmpeg 종료 코드: ${code}` });
                    }
                });
            });
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // MP4 파일 가져오기 (import)
    ipcMain.handle('media:importMp4', async (_event, payload: { sourcePath: string; dirPath: string }) => {
        try {
            const { sourcePath, dirPath } = payload;
            const fileName = path.basename(sourcePath);
            const destPath = path.join(dirPath, fileName);

            await fsp.mkdir(dirPath, { recursive: true });
            await fsp.copyFile(sourcePath, destPath);

            return { success: true, filePath: destPath, fileName };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [100점 수정] Veo 영상 생성 (Gemini API)
    ipcMain.handle('gemini:generateVeoVideo', async (_event, payload: {
        prompt: string;
        model?: string;
        durationSeconds?: number;
        aspectRatio?: '16:9' | '9:16' | '1:1' | 'original';
        negativePrompt?: string;
        imagePath?: string;
        image?: { imageBytes: string; mimeType: string };
        heading?: string;
    }) => {
        try {
            const { prompt, model = 'veo-3.1-generate-preview', durationSeconds = 6, aspectRatio = '16:9', negativePrompt, imagePath, image, heading } = payload;

            // API 키 가져오기
            const configModule = await import('../../configManager.js');
            const config = await configModule.loadConfig();
            const apiKey = (config as any).geminiApiKey || process.env.GEMINI_API_KEY;

            if (!apiKey) {
                return { success: false, message: 'Gemini API 키가 설정되지 않았습니다.' };
            }

            console.log(`[Veo] 🎬 영상 생성 시작: "${heading || prompt.substring(0, 30)}..." (${model})`);

            // 이미지 데이터 준비 (Image-to-Video)
            let imageData = image;
            if (!imageData && imagePath && fs.existsSync(imagePath)) {
                const buffer = await fsp.readFile(imagePath);
                const ext = path.extname(imagePath).toLowerCase();
                const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                imageData = {
                    imageBytes: buffer.toString('base64'),
                    mimeType
                };
            }

            // Veo API 호출
            const requestBody: any = {
                contents: [{
                    parts: [{
                        text: prompt + (negativePrompt ? `\n\nNegative prompt: ${negativePrompt}` : '')
                    }]
                }],
                generationConfig: {
                    responseModalities: ['VIDEO'],
                    videoConfig: {
                        durationSeconds,
                        aspectRatio: aspectRatio === 'original' ? '16:9' : aspectRatio
                    }
                }
            };

            // Image-to-Video인 경우 이미지 추가
            if (imageData) {
                requestBody.contents[0].parts.unshift({
                    inlineData: {
                        mimeType: imageData.mimeType,
                        data: imageData.imageBytes
                    }
                });
            }

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                requestBody,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 180000 // 3분 타임아웃 (영상 생성은 오래 걸림)
                }
            );

            // 응답에서 비디오 데이터 추출
            const candidates = response.data?.candidates;
            if (candidates && candidates[0]?.content?.parts) {
                for (const part of candidates[0].content.parts) {
                    if (part.inlineData && part.inlineData.mimeType?.startsWith('video/')) {
                        const videoData = Buffer.from(part.inlineData.data, 'base64');

                        const safeHeading = (heading || 'veo-video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
                        const fileName = `${safeHeading}-${Date.now()}.mp4`;
                        const outputDir = path.join(app.getPath('userData'), 'videos');
                        await fsp.mkdir(outputDir, { recursive: true });
                        const filePath = path.join(outputDir, fileName);

                        await fsp.writeFile(filePath, videoData);

                        console.log(`[Veo] ✅ 영상 생성 완료: ${filePath}`);
                        return { success: true, filePath, fileName };
                    }
                }
            }

            // 비디오 데이터가 없는 경우
            const errorMessage = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '영상 데이터가 응답에 없습니다.';
            console.error(`[Veo] ❌ 영상 생성 실패: ${errorMessage}`);
            return { success: false, message: errorMessage };

        } catch (error: any) {
            const message = error.response?.data?.error?.message || error.message || '알 수 없는 오류';
            console.error(`[Veo] ❌ API 오류: ${message}`);
            return { success: false, message };
        }
    });
}

/**
 * 소제목-비디오 매핑 핸들러 등록
 */
const headingVideoMap = new Map<string, Array<{ provider: string; filePath: string; previewDataUrl: string; updatedAt: number }>>();

export function registerHeadingVideoHandlers(ctx: IpcContext): void {
    // 비디오 적용
    ipcMain.handle('heading:applyVideo', async (_event, heading: string, video: any) => {
        try {
            const existing = headingVideoMap.get(heading) || [];
            existing.push({
                provider: video.provider || 'unknown',
                filePath: video.filePath,
                previewDataUrl: video.previewDataUrl || '',
                updatedAt: video.updatedAt || Date.now()
            });
            headingVideoMap.set(heading, existing);
            return { success: true };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // 적용된 비디오 가져오기
    ipcMain.handle('heading:getAppliedVideo', async (_event, heading: string) => {
        const videos = headingVideoMap.get(heading);
        if (videos && videos.length > 0) {
            return { success: true, video: videos[videos.length - 1] };
        }
        return { success: false };
    });

    // 적용된 비디오 목록 가져오기
    ipcMain.handle('heading:getAppliedVideos', async (_event, heading: string) => {
        const videos = headingVideoMap.get(heading) || [];
        return { success: true, videos };
    });

    // 비디오 제거
    ipcMain.handle('heading:removeVideo', async (_event, heading: string) => {
        headingVideoMap.delete(heading);
        return { success: true };
    });

    // 모든 적용된 비디오 가져오기
    ipcMain.handle('heading:getAllAppliedVideos', async () => {
        const result: Record<string, any[]> = {};
        for (const [key, value] of headingVideoMap.entries()) {
            result[key] = value;
        }
        return { success: true, videos: result };
    });
}

