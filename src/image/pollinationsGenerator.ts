import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt } from './imageUtils.js';

/**
 * Pollinations.AI 무료 이미지 생성기 (수정됨)
 * - FLUX 모델 강제 적용
 * - 불필요한 용량 제한 해제
 * - 응답 타입 검증 추가
 */

export async function isPollinationsConfigured(): Promise<boolean> {
    return true;
}

// 지원 사이즈
export const POLLINATIONS_SIZES = [
    '1024x1024',
    '768x1024', // 세로형 (블로그 최적)
    '1024x768', // 가로형
    '512x512',
] as const;

/**
 * Pollinations.AI로 단일 이미지 생성
 */
async function generateSingleImage(
    prompt: string,
    width: number = 1024,
    height: number = 1024
): Promise<{ success: boolean; imageUrl?: string; buffer?: Buffer; error?: string }> {

    // ✅ 한글 프롬프트는 URL 인코딩 필수
    const safePrompt = encodeURIComponent(prompt);

    // ✅ FLUX 모델 명시 & enhance=true (프롬프트 자동 보정)
    // seed를 랜덤으로 주어 매번 다른 이미지 생성
    const seed = Math.floor(Math.random() * 1000000);
    const requestUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}&enhance=true`;

    console.log(`[Pollinations] 🌸 요청 URL: ${requestUrl}`);

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await axios.get(requestUrl, {
                responseType: 'arraybuffer', // 바이너리 데이터 수신
                timeout: 60000, // 생성 시간이 길 수 있으므로 60초로 연장
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/jpeg, image/png, image/webp'
                }
            });

            // ✅ 1. HTTP 상태 코드 확인
            if (response.status !== 200) {
                throw new Error(`HTTP Status ${response.status}`);
            }

            // ✅ 2. Content-Type 확인 (이미지가 맞는지 검증)
            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
                // 이미지가 아니라면 에러 (보통 에러 메시지가 JSON/HTML로 옴)
                const errorBody = Buffer.from(response.data).toString('utf-8').slice(0, 100);
                throw new Error(`응답이 이미지가 아님 (${contentType}): ${errorBody}`);
            }

            const buffer = Buffer.from(response.data);
            const imageSize = buffer.length;

            // ✅ 3. 최소 용량 체크 완화 (100KB -> 5KB)
            // 검은색 화면이나 에러 이미지가 보통 1~2KB 내외임. 5KB 이상이면 정상으로 간주.
            if (imageSize < 5000) {
                throw new Error(`이미지 용량이 너무 작음 (${imageSize} bytes) - 생성 실패 의심`);
            }

            console.log(`[Pollinations] ✅ 생성 성공: ${(imageSize / 1024).toFixed(1)}KB`);

            return {
                success: true,
                imageUrl: requestUrl,
                buffer
            };

        } catch (error: any) {
            console.error(`[Pollinations] ❌ 시도 ${attempt}/3 실패: ${error.message}`);

            if (attempt < 3) {
                const delay = 3000 * attempt;
                console.log(`[Pollinations] ⏳ ${delay / 1000}초 후 재시도...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    return { success: false, error: '3회 시도 모두 실패' };
}

/**
 * Pollinations.AI로 일괄 이미지 생성
 */
export async function generateWithPollinations(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false
): Promise<GeneratedImage[]> {
    console.log(`[Pollinations] 🌸 총 ${items.length}개 이미지 생성 시작 (FLUX 모델, 병렬 처리)`);

    const results: GeneratedImage[] = [];

    // 저장 경로 설정
    const imagesDir = path.join(app.getPath('userData'), 'images');
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }

    // ✅ [병렬 처리] 최대 3개 동시 생성 (무료 API 예의상 제한)
    const PARALLEL_LIMIT = 3;
    console.log(`[Pollinations] ⚡ 병렬 처리 모드: ${PARALLEL_LIMIT}개 동시 생성`);

    // 배치 단위로 처리
    for (let batchStart = 0; batchStart < items.length; batchStart += PARALLEL_LIMIT) {
        const batch = items.slice(batchStart, batchStart + PARALLEL_LIMIT);

        const batchPromises = batch.map(async (item, batchIndex) => {
            const globalIndex = batchStart + batchIndex;
            console.log(`[Pollinations] 🖼️ [${globalIndex + 1}/${items.length}] "${item.heading}" 생성 중...`);

            try {
                // ✅ 영문 프롬프트가 있으면 최우선 사용
                let prompt = item.englishPrompt || item.prompt || item.heading;

                // 스타일 보정 (FLUX 모델에 먹히는 고퀄리티 태그 추가)
                const qualityTags = "hyper-realistic, 8k, highly detailed, cinematic lighting, professional photography";
                const finalPrompt = `${prompt}, ${qualityTags}`;

                const result = await generateSingleImage(finalPrompt);

                if (result.success && result.buffer) {
                    // 파일 저장
                    const sanitizedHeading = item.heading.replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
                    const timestamp = Date.now();
                    const fileName = `pollinations_${sanitizedHeading}_${timestamp}.jpg`;
                    const filePath = path.join(imagesDir, fileName);

                    fs.writeFileSync(filePath, result.buffer);

                    // Base64 프리뷰
                    const previewDataUrl = `data:image/jpeg;base64,${result.buffer.toString('base64')}`;

                    return {
                        heading: item.heading,
                        filePath,
                        previewDataUrl,
                        provider: 'pollinations',
                        savedToLocal: filePath
                    } as GeneratedImage;
                } else {
                    console.warn(`[Pollinations] ⚠️ "${item.heading}" 생성 실패, 건너뜀.`);
                    return null;
                }
            } catch (e) {
                console.error(`[Pollinations] 치명적 오류 (${item.heading}):`, e);
                return null;
            }
        });

        // 배치 완료 대기
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach((result) => {
            if (result) results.push(result);
        });

        // 다음 배치 전 대기 (무료 API 매너)
        if (batchStart + PARALLEL_LIMIT < items.length) {
            console.log(`[Pollinations] ⏳ 다음 배치 전 2초 대기...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    return results;
}

export default { generateWithPollinations, isPollinationsConfigured };