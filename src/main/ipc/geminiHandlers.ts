// src/main/ipc/geminiHandlers.ts
// Gemini 관련 IPC 핸들러 — API 안정성 테스트 + Veo 비디오 생성
// [v2.10.248] main.ts에서 분리 — god-file 압축 7단계.
//
// 분리 2개 핸들러:
//   gemini:test10x          — Gemini API 30회 연속 테스트 (안정성 측정)
//   gemini:generateVeoVideo — Veo 모델 비디오 생성 (이미지 → 비디오 / text-to-video)

import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import { generateBlogContent } from '../../gemini.js';
import { loadConfig, applyConfigToEnv } from '../../configManager.js';
import { isFreeTierUser, validateLicenseAndQuota } from '../utils/authUtils.js';
import { consume as consumeQuota } from '../../quotaManager.js';
import { sanitizeFileName, ensureHeadingMp4Dir, getUniqueMp4Path } from '../utils/fileUtils.js';
import { convertMp4ToGif } from '../../image/gifConverter.js';

/**
 * Gemini 핸들러 컨텍스트 — main.ts의 sendLog만 주입.
 * (validateLicenseAndQuota / isFreeTierUser / sanitize* 등은 utils에서 직접 import)
 */
export interface GeminiHandlerContext {
    sendLog: (message: string) => void;
}

/**
 * gemini:* 2개 IPC 일괄 등록.
 */
export function registerGeminiHandlers(ctx: GeminiHandlerContext): void {
    ipcMain.handle('gemini:test10x', async (_event, testCount?: number) => {
        const TEST_COUNT = testCount || 30; // 기본 30회

        console.log('\n' + '='.repeat(60));
        console.log(`🧪 Gemini API ${TEST_COUNT}회 연속 테스트 시작 (앱 환경)`);
        console.log('='.repeat(60) + '\n');

        const results: Array<{ success: boolean; elapsed?: number; retry?: number; error?: string }> = [];
        let successCount = 0;
        let totalRetries = 0;
        const MAX_RETRIES = 8;
        const RETRY_DELAYS = [3000, 5000, 8000, 10000, 15000, 20000, 25000, 30000];

        for (let i = 1; i <= TEST_COUNT; i++) {
            console.log(`테스트 ${i}/${TEST_COUNT}: 시작...`);

            let lastError = '';
            let retryCount = 0;

            for (let retry = 0; retry <= MAX_RETRIES; retry++) {
                try {
                    const startTime = Date.now();
                    const testPrompt = `다음 주제로 짧은 블로그 글 제목 1개만 생성해주세요: "겨울철 건강 관리"`;

                    const content = await generateBlogContent(testPrompt);
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                    if (content && content.trim()) {
                        results.push({ success: true, elapsed: parseFloat(elapsed), retry });
                        successCount++;
                        totalRetries += retry;
                        console.log(`테스트 ${i}/${TEST_COUNT}: ✅ 성공 (${elapsed}초${retry > 0 ? `, 재시도 ${retry}회` : ''})`);
                        break;
                    }
                    throw new Error('빈 응답');
                } catch (error) {
                    const errorMsg = (error as Error).message || '';
                    lastError = errorMsg.substring(0, 100);

                    const isRetryable =
                        errorMsg.includes('503') ||
                        errorMsg.includes('overloaded') ||
                        errorMsg.includes('500') ||
                        errorMsg.includes('502') ||
                        errorMsg.includes('504') ||
                        errorMsg.includes('rate') ||
                        errorMsg.includes('network') ||
                        errorMsg.includes('timeout');

                    if (isRetryable && retry < MAX_RETRIES) {
                        const delay = RETRY_DELAYS[retry];
                        console.log(`  ⏳ 재시도 ${retry + 1}/${MAX_RETRIES} (${delay / 1000}초 대기)`);
                        await new Promise(r => setTimeout(r, delay));
                        retryCount = retry + 1;
                        continue;
                    }

                    results.push({ success: false, error: lastError, retry });
                    console.log(`테스트 ${i}/${TEST_COUNT}: ❌ 실패: ${lastError}`);
                    break;
                }
            }

            // 테스트 간 간격
            if (i < TEST_COUNT) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // 결과 요약
        console.log('\n' + '='.repeat(60));
        console.log('📊 테스트 결과 요약');
        console.log('='.repeat(60));
        console.log(`총 테스트: ${TEST_COUNT}회`);
        console.log(`성공: ${successCount}회`);
        console.log(`실패: ${TEST_COUNT - successCount}회`);
        console.log(`성공률: ${((successCount / TEST_COUNT) * 100).toFixed(1)}%`);
        console.log(`총 재시도 횟수: ${totalRetries}회`);
        console.log('='.repeat(60) + '\n');

        if (successCount === TEST_COUNT) {
            console.log('🎉 100% 성공! Gemini API가 안정적으로 작동합니다.');
        }

        return {
            success: successCount === TEST_COUNT,
            total: TEST_COUNT,
            successCount,
            failCount: TEST_COUNT - successCount,
            successRate: ((successCount / TEST_COUNT) * 100).toFixed(1) + '%',
            totalRetries,
            results
        };
    });

    ipcMain.handle('gemini:generateVeoVideo', async (_event, payload: {
        prompt: string;
        model?: string;
        durationSeconds?: number;
        aspectRatio?: '16:9' | '9:16' | '1:1' | 'original';
        negativePrompt?: string;
        imagePath?: string;
        image?: { imageBytes: string; mimeType: string };
        heading?: string;
        videoProvider?: 'veo' | 'stability' | 'prodia' | 'kenburns';
        convertToGif?: boolean;
    }) => {
        // ✅ [리팩토링] 통합 검증
        const check = await validateLicenseAndQuota('media', 1);
        if (!check.valid) return check.response;

        try {
            const config = await loadConfig();
            try {
                applyConfigToEnv(config);
            } catch (e) {
                console.warn('[main] catch ignored:', e);
            }

            const {
                prompt = '',
                model = 'veo-3.1-generate-preview',
                durationSeconds = 6,
                aspectRatio = '1:1',
                negativePrompt = '',
                videoProvider = 'veo',
                convertToGif = false,
                heading = 'AI-VIDEO',
            } = payload;

            const headingForSave = sanitizeFileName(String(heading || '').trim()) || 'AI-VIDEO';
            const mp4Dir = await ensureHeadingMp4Dir(headingForSave);

            let finalOutPath = '';
            let finalFileName = '';

            // ✅ 1. Stability AI (SVD) 비디오 생성 — 제거됨 (deprecated provider)
            if (videoProvider === 'stability') {
                throw new Error('Stability AI 비디오 생성은 더 이상 지원되지 않습니다. Veo를 사용하세요.');
            }
            // ✅ 2. Veo (Gemini) 비디오 생성 (기존 로직 보전)
            else if (videoProvider === 'veo') {
                const apiKey = (process.env.GEMINI_API_KEY || '').trim();
                if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');
                if (!prompt?.trim()) throw new Error('프롬프트가 비어있습니다.');

                const pickMimeType = (filePath: string): string => {
                    const p = String(filePath || '').toLowerCase();
                    if (p.endsWith('.png')) return 'image/png';
                    if (p.endsWith('.webp')) return 'image/webp';
                    if (p.endsWith('.gif')) return 'image/gif';
                    if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
                    return 'image/png';
                };

                const normalizeImageInput = async (input: string): Promise<{ imageBytes: string; mimeType: string } | undefined> => {
                    const raw = String(input || '').trim();
                    if (!raw) return undefined;
                    if (/^data:/i.test(raw)) {
                        const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
                        if (!m) return undefined;
                        return { imageBytes: String(m[2] || '').trim(), mimeType: String(m[1] || '').trim() || 'image/png' };
                    }
                    if (/^https?:\/\//i.test(raw)) {
                        const axios = (await import('axios')).default;
                        const resp = await axios.get(raw, { responseType: 'arraybuffer', maxRedirects: 5 });
                        const buf = Buffer.from(resp.data);
                        const ct = String((resp.headers as any)?.['content-type'] || '').split(';')[0].trim();
                        return { imageBytes: buf.toString('base64'), mimeType: ct || pickMimeType(raw) };
                    }
                    const buf = await fs.readFile(raw);
                    return { imageBytes: buf.toString('base64'), mimeType: pickMimeType(raw) };
                };

                const imagePath = String(payload?.imagePath || '').trim();
                const imageBytes = String(payload?.image?.imageBytes || '').trim();
                const imageMimeType = String(payload?.image?.mimeType || '').trim();
                let instanceImage: { imageBytes: string; mimeType: string } | undefined = undefined;

                if (imageBytes) {
                    instanceImage = { imageBytes, mimeType: imageMimeType || 'image/png' };
                } else if (imagePath) {
                    instanceImage = await normalizeImageInput(imagePath);
                }

                ctx.sendLog(`🎬 Veo 영상 생성 시작 (모델: ${model}, ${durationSeconds}초)`);
                const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
                const axios = (await import('axios')).default;
                const headers = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
                const instance: any = { prompt: prompt.trim() };
                if (instanceImage?.imageBytes) {
                    instance.image = { bytesBase64Encoded: instanceImage.imageBytes, mimeType: instanceImage.mimeType };
                }

                const requestBody: any = { instances: [instance], parameters: { durationSeconds } };
                if (aspectRatio && aspectRatio !== 'original') {
                    requestBody.parameters.aspectRatio = aspectRatio;
                }
                if (negativePrompt) requestBody.parameters.negativePrompt = negativePrompt;

                const startResp = await axios.post(`${baseUrl}/models/${encodeURIComponent(model)}:predictLongRunning`, requestBody, { headers });
                const operationName = startResp?.data?.name;
                if (!operationName) throw new Error('Veo 작업 생성 실패');

                const startedAt = Date.now();
                const timeoutMs = 12 * 60 * 1000;
                const pollIntervalMs = 10 * 1000;

                while (true) {
                    if (Date.now() - startedAt > timeoutMs) throw new Error('Veo 생성 시간 초과');
                    await new Promise((r) => setTimeout(r, pollIntervalMs));
                    const statusResp = await axios.get(`${baseUrl}/${operationName}`, { headers });
                    const data = statusResp?.data;
                    ctx.sendLog(`⏳ Veo 생성 중... ${Math.floor((Date.now() - startedAt) / 1000)}초 경과`);

                    if (data?.done === true) {
                        const response = data?.response || {};
                        const errMsg = data?.error?.message || response?.error?.message || response?.generateVideoResponse?.error?.message;
                        if (errMsg) throw new Error(String(errMsg));

                        const pickFirstTruthy = (...vals: any[]): any => {
                            for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== '') return v;
                            return undefined;
                        };

                        // ✅ 비디오 데이터 추출 (다양한 응답 포맷 대응)
                        const rawVideo = pickFirstTruthy(
                            response?.generateVideoResponse?.generatedSamples?.[0]?.video,
                            response?.generatedVideos?.[0]?.video,
                            response?.generated_videos?.[0]?.video,
                            response?.video?.[0] || response?.video
                        );

                        let downloadUrl: string | undefined = undefined;
                        const rawVideoUri = pickFirstTruthy(
                            rawVideo?.uri,
                            rawVideo?.downloadUri,
                            rawVideo?.fileUri,
                            rawVideo?.download_uri,
                            rawVideo?.file_uri,
                            response?.generateVideoResponse?.video?.[0]?.uri,
                            response?.video?.[0]?.uri
                        );

                        // 1) 직접 URL인 경우 사용
                        if (rawVideoUri && /^https?:\/\//i.test(String(rawVideoUri))) {
                            downloadUrl = String(rawVideoUri);
                        }

                        // 2) 파일 ID인 경우 Files API 호출
                        if (!downloadUrl) {
                            let fileId = String(rawVideoUri || rawVideo?.name || '').trim();
                            if (fileId && !fileId.startsWith('files/') && !fileId.startsWith('http')) {
                                fileId = `files/${fileId}`;
                            }

                            if (fileId.startsWith('files/')) {
                                try {
                                    const fileResp = await axios.get(`${baseUrl}/${fileId}`, { headers });
                                    downloadUrl = pickFirstTruthy(
                                        fileResp?.data?.file?.downloadUri,
                                        fileResp?.data?.downloadUri,
                                        fileResp?.data?.file?.download_uri
                                    );
                                } catch (e) {
                                    console.error('[Veo] 파일 정보 조회 실패:', (e as Error).message);
                                }
                            }
                        }

                        if (!downloadUrl) throw new Error('다운로드 URL을 찾을 수 없습니다.');

                        const videoResp = await axios.get(downloadUrl, { headers: { 'x-goog-api-key': apiKey }, responseType: 'arraybuffer' });
                        const { fullPath: outPath, fileName } = await getUniqueMp4Path(mp4Dir, headingForSave);
                        await fs.writeFile(outPath, Buffer.from(videoResp.data));

                        finalOutPath = outPath;
                        finalFileName = fileName;
                        ctx.sendLog(`✅ Veo 영상 생성 완료: ${fileName}`);
                        break;
                    }
                }
            } else {
                throw new Error(`지원하지 않는 비디오 프로바이더: ${videoProvider}`);
            }

            if (await isFreeTierUser()) {
                await consumeQuota('media', 1);
            }

            // ✅ 4. GIF 변환 처리
            if (convertToGif && finalOutPath && finalOutPath.endsWith('.mp4')) {
                try {
                    ctx.sendLog('🔄 GIF 변환 중...');
                    const pathModule = await import('path');
                    const gifPath = await convertMp4ToGif(finalOutPath, { aspectRatio });
                    ctx.sendLog(`✅ GIF 변환 완료: ${pathModule.basename(gifPath)}`);

                    return {
                        success: true,
                        filePath: gifPath,
                        fileName: pathModule.basename(gifPath),
                        mp4Path: finalOutPath
                    };
                } catch (gifError) {
                    ctx.sendLog(`⚠️ GIF 변환 실패: ${(gifError as Error).message}`);
                    return { success: true, filePath: finalOutPath, fileName: finalFileName };
                }
            }

            // ✅ GIF 변환 없는 일반 MP4 생성 성공 응답
            return { success: true, filePath: finalOutPath, fileName: finalFileName };
        } catch (error) {
            console.error('[Gemini] generateVeoVideo 실패:', error);
            const message = (error as Error).message || String(error);
            return { success: false, message };
        }
    });

    console.log('[IPC] Gemini handlers registered (2 handlers)');
}
