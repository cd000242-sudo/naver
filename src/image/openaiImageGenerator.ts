// ✅ [2026-02-22] OpenAI Image Generator (DALL-E / gpt-image-1)
// OpenAI Images API를 사용한 고품질 이미지 생성

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { loadConfig } from '../configManager.js';
import { trackApiUsage } from '../apiUsageTracker.js';
import { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { STYLE_PROMPT_MAP, isNoPersonCategory, getImageDiversityHints } from './imageStyles.js';
import { addThumbnailTextOverlay } from './textOverlay.js';
import { AutomationService } from '../main/services/AutomationService.js';

const OPENAI_IMAGES_API_URL = 'https://api.openai.com/v1/images/generations';
// v2.7.5: gpt-image-2 default 복귀 — 사용자가 명확히 신모델(덕트테이프)을
// 쓰려고 메뉴를 만들었기 때문. 실측에서 gpt-image-2는 OpenAI 서버에 실재하며,
// 다만 Organization 인증된 계정만 접근 가능(403 반환). 1세대 폴백을 제거하고
// 미인증 시 OPENAI_ORG_VERIFY_REQUIRED: 태그된 에러를 throw해 렌더러가
// 친절 모달로 인증 페이지 원클릭 이동을 안내한다.
const DEFAULT_MODEL = 'gpt-image-2';
const MIN_VALID_IMAGE_BYTES = 1024;

/**
 * OpenAI Image API로 일괄 이미지 생성
 */
export async function generateWithOpenAIImage(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    isFullAuto: boolean = false,
    providedApiKey?: string,
    isShoppingConnect: boolean = false,
    onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,  // ✅ [2026-02-27] 실시간 콜백
    collectedImages?: string[],  // ✅ [2026-03-03] 수집 이미지 참조 (img2img)
    overrideModel?: string,       // v2.7.15: 호출자가 모델 강제 지정 (예: 'dall-e-3')
): Promise<GeneratedImage[]> {
    const config = await loadConfig();
    // ✅ [v2.7.33] 키 source 명시 — 사용자 진단 시 어느 입력란을 채워야 하는지 즉시 보임
    let apiKey: string | undefined;
    let keySource = 'unknown';
    if (providedApiKey?.trim()) {
        apiKey = providedApiKey.trim();
        keySource = 'caller(providedApiKey)';
    } else if ((config as any).openaiImageApiKey?.trim()) {
        apiKey = (config as any).openaiImageApiKey.trim();
        keySource = 'config.openaiImageApiKey (UI: OpenAI 이미지 키)';
    } else if ((config as any).openaiApiKey?.trim()) {
        apiKey = (config as any).openaiApiKey.trim();
        keySource = 'config.openaiApiKey (UI: OpenAI 키 / .env OPENAI_API_KEY)';
    } else if (process.env.OPENAI_API_KEY?.trim()) {
        apiKey = process.env.OPENAI_API_KEY.trim();
        keySource = 'process.env.OPENAI_API_KEY (.env 직접)';
    }

    if (!apiKey) {
        throw new Error('OpenAI API 키가 설정되지 않았습니다. 환경설정에서 OpenAI 이미지 API 키 또는 .env의 OPENAI_API_KEY를 입력해주세요.');
    }

    console.log(`[OpenAI-Image] 🎨 총 ${items.length}개 이미지 생성 시작 (모델: ${DEFAULT_MODEL}, 키 source: ${keySource}, 키 prefix: ${apiKey.substring(0, 7)}...)`);

    // ✅ [2026-03-03] 참조 이미지 사전 캐싱 (쇼핑커넥트 수집 이미지)
    let cachedReferenceBase64: string | null = null;
    if (isShoppingConnect && collectedImages && collectedImages.length > 0) {
        try {
            const firstImage = collectedImages[0];
            const candidateUrl = typeof firstImage === 'string'
                ? firstImage
                : ((firstImage as any)?.url || (firstImage as any)?.thumbnailUrl || '');
            if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
                console.log(`[OpenAI-Image] 🖼️ 참조 이미지 다운로드: ${candidateUrl.substring(0, 80)}...`);
                const refResponse = await axios.get(candidateUrl, { responseType: 'arraybuffer', timeout: 15000 });
                const refBuf = Buffer.from(refResponse.data);
                if (refBuf && refBuf.length > 0) {
                    cachedReferenceBase64 = refBuf.toString('base64');
                    console.log(`[OpenAI-Image] ✅ 참조 이미지 캐싱 완료 (${Math.round(refBuf.length / 1024)}KB) → img2img 모드 활성화`);
                }
            }
        } catch (refErr: any) {
            console.warn(`[OpenAI-Image] ⚠️ 참조 이미지 다운로드 실패: ${refErr.message} → text-to-image로 진행`);
        }
    }

    const results: GeneratedImage[] = [];
    // v2.7.4: 첫 항목에서 401(API 키 무효) 감지 시 즉시 중단 — 나머지 N개도
    // 같은 키로 같은 에러를 만나므로 재시도 시간 낭비 방지. 마지막 에러는
    // 함수 throw에 전달돼 dispatcher가 친절한 메시지로 변환한다.
    let firstFatalError: any = null;
    // ✅ [v2.7.44] reviewer 권고 #2 — globalThis 안티패턴 제거
    //   기존: globalThis.__lastOpenAIError에 마지막 axios 에러 저장 → 동시 발행 2개 시
    //         후속 호출이 앞 호출 에러를 덮어써 잘못된 메시지 표시
    //   수정: 함수 스코프 클로저 변수로 격리 (각 generateWithOpenAIImage 호출이 자체 보존)
    let lastApiErrorRef: any = null;

    for (let i = 0; i < items.length; i++) {
        if (AutomationService.isCancelRequested()) {
            console.log('[OpenAI-Image] ⛔ 중지 요청 감지 → 이미지 생성 중단');
            break;
        }
        if (firstFatalError) {
            console.warn(`[OpenAI-Image] ⛔ 치명적 에러 감지 (인증/권한). 나머지 ${items.length - i}개 항목 건너뜀.`);
            break;
        }

        const item = items[i];
        console.log(`[OpenAI-Image] 🖼️ [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);

        try {
            // ✅ [2026-02-23] imageStyle 핸들링 구현
            const imageStyle = (item as any).imageStyle || 'realistic';
            console.log(`[OpenAI-Image] 🎨 이미지 스타일: ${imageStyle}`);

            // 프롬프트 구성
            let prompt = item.englishPrompt || sanitizeImagePrompt(item.prompt || item.heading);

            // ✅ [v1.5.5] gpt-image-2는 한글 네이티브 지원 — 한글 제거 제거
            //   이전: gpt-image-1은 영어 프롬프트 최적이라 한글 제거 필요
            //   현재: gpt-image-2는 한국어/일본어/중국어/힌디어/벵골어 렌더링 완벽
            //   그래도 프롬프트 자체는 영어 우선(번역 결과)이니 영어 위주이나 한글 혼용도 허용

            // 스타일별 프롬프트 분기
            // ✅ [2026-03-03 FIX] DALL-E에도 스타일 프롬프트(STYLE_PROMPT_MAP) 적용 + 한국인 인물 지시
            const dh = getImageDiversityHints(i);
            console.log(`[OpenAI-Image] 🎲 다양성[${i}]: 📐${dh.angle.split(',')[0]} | 💡${dh.lighting.split(',')[0]} | 🎨${dh.color.split(',')[0]}`);

            // ✅ 스타일 프롬프트 적용 (stickman/roundy/2d/disney 등)
            const stylePromptText = STYLE_PROMPT_MAP[imageStyle] || STYLE_PROMPT_MAP['realistic'];
            const isRealistic = imageStyle === 'realistic' || !imageStyle;

            // ✅ [2026-03-12 FIX] NO TEXT 지시를 프롬프트 맨 앞에 배치 → AI가 텍스트 렌더링 강력 방지
            const NO_TEXT_PREFIX = 'CRITICAL RULE: This image must contain ZERO text, ZERO letters, ZERO words, ZERO writing of any kind. Generate a COMPLETELY TEXT-FREE image.';

            if (isShoppingConnect) {
                if (cachedReferenceBase64) {
                    prompt = `${NO_TEXT_PREFIX} Based on the provided product reference image, create a premium lifestyle photograph showing this exact product being used by a Korean person (20-40s). ${dh.angle}, ${dh.framing}, ${prompt}, luxury Korean lifestyle setting, ${dh.lighting}, ${dh.focus}, maintain the product's exact appearance and design from the reference.`;
                } else {
                    prompt = `${NO_TEXT_PREFIX} ${dh.angle}, ${dh.framing}, Premium lifestyle photography with Korean person, ${dh.personAction}, using or enjoying the product, ${prompt}, luxury lifestyle setting, ${dh.lighting}, ${dh.focus}.`;
                }
            } else if (!isRealistic) {
                prompt = `${NO_TEXT_PREFIX} ${stylePromptText}, ${prompt}.`;
            } else {
                const koreanPersonDirective = 'If any person appears in this image, they must be Korean with East Asian features. ';
                prompt = `${NO_TEXT_PREFIX} ${dh.angle}, ${koreanPersonDirective}${prompt}, ${dh.color}.`;
            }

            // 이미지 비율 설정
            const imageRatio = (item as any).imageRatio || (config as any).imageRatio || '1:1';
            const sizeMap: Record<string, string> = {
                '1:1': '1024x1024',
                '16:9': '1536x1024',
                '9:16': '1024x1536',
                '4:3': '1536x1024',
                '3:4': '1024x1536'
            };
            const size = sizeMap[imageRatio] || '1024x1024';

            // 재시도 로직 — v2.7.5: gpt-image-2 단일 모델, 1세대 폴백 제거
            const maxRetries = 3;
            let lastError: any;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                // v2.7.15: 호출자가 dall-e-3 등 명시 시 그것 사용. 아니면 기본 gpt-image-2.
                const currentModel = overrideModel || DEFAULT_MODEL;
                try {
                    // ✅ [2026-03-03] 참조 이미지가 있으면 image 파라미터로 전달 (img2img)
                    // v2.7.15: dall-e-3는 quality='standard'/'hd', size 1024x1024/1792x1024/1024x1792만 지원
                    const isDallE3 = currentModel === 'dall-e-3';
                    const dalle3Size = imageRatio === '16:9' || imageRatio === '4:3'
                        ? '1792x1024' : (imageRatio === '9:16' || imageRatio === '3:4' ? '1024x1792' : '1024x1024');
                    // ✅ [v2.7.36] quality='auto' → 'medium' 강제
                    //   사용자 보고: $13에 글 10개 = 장당 $0.186 (high quality와 정확 일치).
                    //   원인: 'auto'가 신규 키/복잡 프롬프트/img2img 시 high를 자동 선택.
                    //   수정: 'medium' 명시 강제 → 장당 ~$0.042 (4배 절감)
                    //   사용자가 (config as any).openaiImageQuality로 'low'/'high' 선택 가능.
                    const userQuality = (config as any).openaiImageQuality;
                    const validQualities = ['low', 'medium', 'high', 'auto'];
                    const finalQuality = validQualities.includes(userQuality) ? userQuality : 'medium';
                    const requestBody: any = {
                        model: currentModel,
                        prompt: prompt,
                        n: 1,
                        size: isDallE3 ? dalle3Size : size,
                        quality: isDallE3 ? 'standard' : finalQuality,
                    };
                    if (isDallE3) {
                        requestBody.response_format = 'b64_json'; // dall-e-3는 명시 필요
                    }

                    // gpt-image-1은 image 파라미터로 참조 이미지 전달 가능
                    // dall-e-3는 image 파라미터 미지원 (text-to-image only)
                    if (cachedReferenceBase64 && !isDallE3) {
                        requestBody.image = `data:image/png;base64,${cachedReferenceBase64}`;
                        console.log(`[OpenAI-Image] 🖼️ 참조 이미지를 image 파라미터로 전달 (img2img 모드)`);
                    }

                    const response = await axios.post(
                        OPENAI_IMAGES_API_URL,
                        requestBody,
                        {
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 120000, // 2분 타임아웃
                            responseType: 'json'
                        }
                    );

                    // base64 또는 URL 응답 처리
                    const imageData = response.data?.data?.[0];

                    if (!imageData) {
                        throw new Error('이미지 데이터가 응답에 없습니다 (model: ' + currentModel + ').');
                    }

                    let buffer: Buffer;

                    if (imageData.b64_json && imageData.b64_json.length > 0) {
                        // base64 응답
                        buffer = Buffer.from(imageData.b64_json, 'base64');
                    } else if (imageData.url) {
                        // URL 응답 → 다운로드
                        const imgResponse = await axios.get(imageData.url, {
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });
                        buffer = Buffer.from(imgResponse.data);
                    } else {
                        throw new Error('이미지 데이터 형식이 올바르지 않습니다 (b64_json/url 모두 비어있음, model: ' + currentModel + ').');
                    }

                    // v2.7.3: 빈/손상 버퍼 검증 — 작은 파일은 OpenAI가 빈 응답 또는 안전필터 차단을 의미
                    if (!buffer || buffer.length < MIN_VALID_IMAGE_BYTES) {
                        const sz = buffer ? buffer.length : 0;
                        console.warn(`[OpenAI-Image] ⚠️ 빈/손상 이미지 감지 (${sz} bytes < ${MIN_VALID_IMAGE_BYTES}, model: ${currentModel})`);
                        throw new Error(`OpenAI가 빈 이미지 반환 (${sz} bytes, model: ${currentModel}). 안전필터/쿼터 의심.`);
                    }

                    // ✅ [2026-03-12 FIX] 텍스트 오버레이는 imageGenerator.ts의 applyKoreanTextOverlayIfNeeded에서 일괄 처리
                    // 여기서 추가로 적용하면 2중 오버레이가 발생하므로 제거

                    // 파일 저장
                    const savedResult = await writeImageFile(buffer, 'png', item.heading, postTitle, postId);

                    results.push({
                        heading: item.heading,
                        filePath: savedResult.savedToLocal || savedResult.filePath,
                        provider: 'openai-image',
                        previewDataUrl: savedResult.previewDataUrl,
                        savedToLocal: savedResult.savedToLocal,
                        originalIndex: (item as any).originalIndex, // ✅ [2026-03-05 FIX] headingImageMode 필터링 후 정확한 소제목 매칭
                    });

                    // ✅ [2026-03-19] 사용량 추적
                    trackApiUsage('openai-image', { images: 1, model: DEFAULT_MODEL });

                    console.log(`[OpenAI-Image] ✅ [${i + 1}/${items.length}] "${item.heading}" 생성 완료!`);

                    // ✅ [2026-02-27] 실시간 콜백 호출
                    if (onImageGenerated) {
                        try { onImageGenerated(results[results.length - 1], i, items.length); } catch (cbErr) { /* 콜백 오류 무시 */ }
                    }

                    break; // 성공 시 재시도 루프 탈출

                } catch (apiError: any) {
                    lastError = apiError;
                    // ✅ [v2.7.44] 함수 스코프 클로저로 보존 (globalThis 안티패턴 제거)
                    lastApiErrorRef = apiError;
                    const status = apiError.response?.status;
                    const errMsg = apiError.response?.data?.error?.message || apiError.message || 'unknown';
                    const errCode = apiError.response?.data?.error?.code || '';
                    console.warn(`[OpenAI-Image] ⚠️ 시도 ${attempt}/${maxRetries} 실패 (model: ${currentModel}, status: ${status}, code: ${errCode}): ${errMsg}`);

                    // v2.7.5: 403 + "must be verified" 패턴 감지 → Org 인증 미완료 전용 태그
                    // 렌더러가 OPENAI_ORG_VERIFY_REQUIRED 태그로 감지해 친절 모달 + 인증
                    // 페이지 원클릭 이동을 보여준다.
                    const isOrgVerifyRequired = status === 403
                        && /organization must be verified|verify organization|verified to use the model/i.test(errMsg);
                    if (isOrgVerifyRequired) {
                        console.error('[OpenAI-Image] 🔒 Organization 인증 필요 — 즉시 중단.');
                        firstFatalError = new Error(`OPENAI_ORG_VERIFY_REQUIRED:${errMsg}`);
                        break;
                    }

                    // v2.7.4: 401/403(invalid_api_key 등 일반 인증)은 재시도 무의미. 즉시 중단.
                    const isAuthError = status === 401 || status === 403
                        || errCode === 'invalid_api_key'
                        || /invalid api key|incorrect api key|unauthenticated/i.test(errMsg);
                    if (isAuthError) {
                        console.error(`[OpenAI-Image] 🚫 인증 에러 (${status} ${errCode}) — 재시도 무의미.`);
                        firstFatalError = apiError;
                        break;
                    }

                    if (attempt < maxRetries) {
                        const delay = 2000 * attempt;
                        console.log(`[OpenAI-Image] ⏳ ${delay}ms 후 재시도...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            if (results.length <= i) {
                // 모든 재시도 실패
                console.error(`[OpenAI-Image] ❌ "${item.heading}" 모든 재시도 실패: ${lastError?.message}`);
            }

        } catch (error: any) {
            console.error(`[OpenAI-Image] ❌ "${item.heading}" 생성 실패:`, error.message);
        }
    }

    console.log(`[OpenAI-Image] 📊 최종 결과: ${results.length}/${items.length}개 생성 완료`);

    // ✅ [v2.7.44] 함수 스코프 lastApiErrorRef 사용 (멀티 호출 충돌 차단)
    if (results.length === 0) {
        if (firstFatalError) throw firstFatalError;
        const status = lastApiErrorRef?.response?.status;
        const apiMsg = lastApiErrorRef?.response?.data?.error?.message || lastApiErrorRef?.message;
        const detail = status || apiMsg
            ? ` 마지막 실패: status=${status || 'n/a'}, message="${(apiMsg || '').substring(0, 200)}"`
            : '';
        throw new Error(`OpenAI 덕트테이프로 단 1장의 이미지도 생성하지 못했습니다. (키 source: ${keySource})${detail}`);
    }

    return results;
}

/**
 * 단일 이미지 생성 (테스트 이미지 생성 핸들러용)
 */
export async function generateSingleOpenAIImage(
    options: { prompt: string; size?: string; model?: string },
    apiKey: string
): Promise<{ success: boolean; localPath?: string; error?: string }> {
    try {
        const response = await axios.post(
            OPENAI_IMAGES_API_URL,
            {
                model: options.model || DEFAULT_MODEL,
                prompt: options.prompt,
                n: 1,
                size: options.size || '1024x1024',
                quality: 'medium', // ✅ [v2.7.36] 단일 이미지 진단 호출도 medium 고정 (비용 4배 절감)
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000,
                responseType: 'json'
            }
        );

        const imageData = response.data?.data?.[0];
        if (!imageData) {
            return { success: false, error: '이미지 데이터가 응답에 없습니다.' };
        }

        let buffer: Buffer;
        if (imageData.b64_json) {
            buffer = Buffer.from(imageData.b64_json, 'base64');
        } else if (imageData.url) {
            const imgResponse = await axios.get(imageData.url, { responseType: 'arraybuffer', timeout: 30000 });
            buffer = Buffer.from(imgResponse.data);
        } else {
            return { success: false, error: '이미지 데이터 형식이 올바르지 않습니다.' };
        }

        const filename = `openai_img_${Date.now()}.png`;
        const localPath = path.join(app.getPath('temp'), filename);
        fs.writeFileSync(localPath, buffer);

        return { success: true, localPath };
    } catch (err: any) {
        return { success: false, error: err.response?.data?.error?.message || err.message || 'OpenAI Image 생성 실패' };
    }
}
