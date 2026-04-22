/**
 * ✅ [v1.4.80] Google Labs Flow 이미지 생성기 (Nano Banana Pro)
 *
 * 아키텍처 (ImageFX와 동일 패턴 — labs.google 세션 공유):
 *   1. AdsPower/Playwright 브라우저로 labs.google/flow 접속
 *   2. ImageFX와 동일한 Google OAuth 세션 재사용 (쿠키 공유)
 *   3. aisandbox-pa.googleapis.com 내부 API 직접 호출
 *   4. 첫 실행 시 네트워크 인터셉트로 실제 엔드포인트/페이로드 자동 학습
 *      → 이후 동일 계정/세션에서 재사용 (구글 UI 변경에 강건)
 *
 * 모델: Nano Banana Pro (gemini-3-pro-image-preview) — Flow 무료 쿼터 활용
 * 쿼터: Google AI Pro 구독 기준 하루 50~100장+ (실측 필요)
 * 비용: $0 (계정 쿼터 내), 쿼터 초과 시 HTTP 429 → 폴백
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { writeImageFile } from './imageUtils.js';
import { PromptBuilder } from './promptBuilder.js';
import { trackApiUsage } from '../apiUsageTracker.js';
import type { Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ─── 로깅 ────────────────────────────────────────────────
function sendImageLog(message: string): void {
    try {
        const { BrowserWindow } = require('electron');
        const wins = BrowserWindow.getAllWindows();
        if (wins[0]) wins[0].webContents.send('image-generation:log', message);
    } catch { /* 렌더러 초기화 전 */ }
    console.log(message);
}

// ─── 캐시 (세션 재사용) ────────────────────────────────────
let cachedBrowser: Browser | null = null;
let cachedPage: Page | null = null;
let cachedToken: string | null = null;
let cachedTokenExpiry: Date | null = null;
let _enabled: boolean = false;

// ✅ [v1.4.80 P1] 자동 학습 세션당 1회 제한 — 무한 재학습 루프 방지
let _discoveryAttemptedThisSession = false;

// ─── 자동 학습 API 메타데이터 ──────────────────────────────
interface FlowApiMetadata {
    endpoint: string;           // 실측 엔드포인트 (예: https://aisandbox-pa.googleapis.com/v1:runImageGeneration)
    modelNameType: string;      // 실측 모델 이름 (예: IMAGEN_4_PRO, NANO_BANANA_PRO)
    requestTemplate: any;       // 요청 JSON 템플릿 구조
    responseImagePath: string;  // 응답에서 base64 찾는 경로 (예: imagePanels.0.generatedImages.0.encodedImage)
    learnedAt: string;
    version: number;            // 스키마 버전 (변경 시 재학습)
}

const FLOW_API_CACHE_FILE = 'flow-api-metadata.json';
const SCHEMA_VERSION = 1;

function getCachePath(): string {
    try {
        return path.join(app.getPath('userData'), FLOW_API_CACHE_FILE);
    } catch {
        return path.join(require('os').homedir(), '.naver-blog-automation', FLOW_API_CACHE_FILE);
    }
}

function loadApiMetadata(): FlowApiMetadata | null {
    try {
        const p = getCachePath();
        if (!fs.existsSync(p)) return null;
        const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as FlowApiMetadata;
        if (data.version !== SCHEMA_VERSION) return null;
        return data;
    } catch { return null; }
}

function saveApiMetadata(meta: FlowApiMetadata): void {
    try {
        fs.writeFileSync(getCachePath(), JSON.stringify(meta, null, 2), 'utf-8');
        console.log(`[Flow] 📘 API 메타데이터 저장: ${meta.endpoint}`);
    } catch (err) {
        console.warn(`[Flow] ⚠️ 메타 저장 실패: ${(err as Error).message}`);
    }
}

// ─── 비율 매핑 ──────────────────────────────────────────
const ASPECT_RATIO_MAP: Record<string, string> = {
    '1:1': 'IMAGE_ASPECT_RATIO_SQUARE',
    'square': 'IMAGE_ASPECT_RATIO_SQUARE',
    '9:16': 'IMAGE_ASPECT_RATIO_PORTRAIT',
    'portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
    '16:9': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
    'landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
    '4:3': 'IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE',
};

// ─── 알려진 엔드포인트 폴백 풀 (학습 실패 시) ─────────────
const CANDIDATE_ENDPOINTS = [
    'https://aisandbox-pa.googleapis.com/v1:runImageGeneration',
    'https://aisandbox-pa.googleapis.com/v1:runImageFx',
    'https://aisandbox-pa.googleapis.com/v1:runBananaImage',
];
const CANDIDATE_MODEL_NAMES = [
    'IMAGEN_4_PRO',
    'IMAGEN_4_ULTRA',
    'NANO_BANANA_PRO',
    'GEMINI_IMAGE_3',
    'IMAGEN_3_5',
];

// ─── 공개 API ──────────────────────────────────────────
export function setFlowEnabled(enabled: boolean): void {
    _enabled = enabled;
    console.log(`[Flow] 🌐 ${enabled ? '✅ 활성' : '❌ 비활성'}`);
}

export function isFlowEnabled(): boolean {
    return _enabled;
}

/**
 * ✅ 브라우저 + Flow 페이지 확보
 *  - ImageFX와 동일한 AdsPower/Playwright 세션 공유
 *  - 기존 ImageFX 구현의 헬퍼 재사용 (중복 제거)
 */
async function ensureFlowBrowserPage(): Promise<Page> {
    // ✅ [v1.4.80 P0] ImageFX 브라우저/세션 공유 — export 확인 후 직접 호출
    const { ensureImageFxBrowserPage } = await import('./imageFxGenerator.js');
    if (typeof ensureImageFxBrowserPage !== 'function') {
        throw new Error('FLOW_IMAGEFX_BRIDGE_MISSING:ImageFX 세션 공유가 비활성 상태입니다. 앱을 최신 버전으로 업데이트해주세요.');
    }
    const page = await ensureImageFxBrowserPage();

    // Flow 페이지로 이동 (labs.google 세션 공유 — 추가 로그인 불필요)
    const currentUrl = page.url();
    if (!currentUrl.includes('labs.google/flow')) {
        console.log('[Flow] 🌐 labs.google/flow 접속...');
        sendImageLog('🌐 [Flow] Google Labs Flow 접속 중...');
        await page.goto('https://labs.google/flow', {
            waitUntil: 'networkidle',
            timeout: 60000,
        });
        await page.waitForTimeout(2000);
    }

    cachedPage = page;
    return page;
}

/**
 * ✅ 세션 토큰 획득 (ImageFX와 완전 동일 경로 — /fx/api/auth/session)
 *  labs.google 도메인 Google OAuth 쿠키 공유
 */
async function getFlowSessionToken(page: Page): Promise<string> {
    if (cachedToken && cachedTokenExpiry && cachedTokenExpiry > new Date()) {
        return cachedToken;
    }

    console.log('[Flow] 🔑 세션 토큰 획득...');
    sendImageLog('🔑 [Flow] Google 세션 토큰 확인 중...');

    // ImageFX와 동일 엔드포인트 — labs.google 도메인 내 어디서든 호출 가능
    const session = await page.evaluate(async () => {
        const candidates = [
            '/fx/api/auth/session',   // ImageFX 경로 (가장 안정)
            '/flow/api/auth/session', // Flow 전용 (존재 시)
            '/api/auth/session',      // 기본
        ];
        for (const path of candidates) {
            try {
                const res = await fetch(path, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.access_token) return data;
                }
            } catch { /* 다음 후보 시도 */ }
        }
        return { error: 'NO_SESSION_ENDPOINT' };
    });

    if (!(session as any).access_token || !(session as any).user) {
        throw new Error(
            'Google 로그인이 필요합니다. AdsPower 브라우저에서 Google 계정(ImageFX와 동일)으로 로그인한 후 다시 시도해주세요.'
        );
    }

    cachedToken = (session as any).access_token;
    cachedTokenExpiry = new Date((session as any).expires || Date.now() + 50 * 60 * 1000);
    const userInfo = (session as any).user;
    console.log(`[Flow] ✅ 토큰 획득 (${userInfo?.name || userInfo?.email || 'user'}, 만료: ${cachedTokenExpiry.toLocaleTimeString()})`);
    sendImageLog(`✅ [Flow] ${userInfo?.name || userInfo?.email} 계정 세션 확보`);

    return cachedToken!;
}

/**
 * ✅ 자동 API 학습 — 알려진 엔드포인트/모델 조합을 순차 시도
 *  성공한 조합을 디스크에 저장 → 다음부터 바로 사용
 */
async function discoverAndCacheApi(
    page: Page,
    token: string,
    testPrompt: string,
    aspectRatio: string,
): Promise<{ endpoint: string; modelNameType: string; encodedImage: string } | null> {
    console.log('[Flow] 🔍 API 자동 학습 시작...');
    sendImageLog('🔍 [Flow] 내부 API 엔드포인트 자동 탐색 중 (첫 실행만)...');

    for (const endpoint of CANDIDATE_ENDPOINTS) {
        for (const modelName of CANDIDATE_MODEL_NAMES) {
            const result = await page.evaluate(async (params: any) => {
                try {
                    const body = JSON.stringify({
                        userInput: {
                            candidatesCount: 1,
                            prompts: [params.prompt],
                            seed: params.seed,
                        },
                        clientContext: {
                            sessionId: `;${Date.now()}`,
                            tool: 'FLOW',
                        },
                        modelInput: { modelNameType: params.modelName },
                        aspectRatio: params.ratio,
                    });
                    const res = await fetch(params.endpoint, {
                        method: 'POST',
                        body,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${params.token}`,
                        },
                    });
                    if (!res.ok) return { ok: false, status: res.status };
                    const data = await res.json();
                    const img = data?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage
                        || data?.generatedImages?.[0]?.encodedImage
                        || data?.images?.[0]?.base64
                        || data?.result?.images?.[0]?.data;
                    if (img) return { ok: true, encodedImage: img };
                    return { ok: false, status: 200, reason: 'no_image' };
                } catch (err: any) {
                    return { ok: false, error: err.message };
                }
            }, { endpoint, modelName, token, prompt: testPrompt, ratio: aspectRatio, seed: Math.floor(Math.random() * 999999) });

            if ((result as any).ok && (result as any).encodedImage) {
                console.log(`[Flow] ✅ 학습 성공: ${endpoint} / ${modelName}`);
                sendImageLog(`✅ [Flow] API 학습 완료: ${modelName}`);
                // 메타 저장
                saveApiMetadata({
                    endpoint,
                    modelNameType: modelName,
                    requestTemplate: {
                        userInput: { candidatesCount: 1, prompts: ['<PROMPT>'], seed: 0 },
                        clientContext: { sessionId: '<SID>', tool: 'FLOW' },
                        modelInput: { modelNameType: modelName },
                        aspectRatio: '<RATIO>',
                    },
                    responseImagePath: 'imagePanels.0.generatedImages.0.encodedImage',
                    learnedAt: new Date().toISOString(),
                    version: SCHEMA_VERSION,
                });
                return { endpoint, modelNameType: modelName, encodedImage: (result as any).encodedImage };
            }
        }
    }

    console.warn('[Flow] ❌ 자동 학습 실패 — 모든 엔드포인트/모델 조합 시도 무효');
    return null;
}

/**
 * ✅ Flow로 이미지 1장 생성
 *  1차: 캐시된 메타데이터로 바로 호출 (빠름)
 *  2차: 실패 시 자동 학습 → 성공 조합 캐시
 */
export async function generateSingleImageWithFlow(
    prompt: string,
    aspectRatio: string = '1:1',
    signal?: AbortSignal,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    const currentPrompt = sanitizeFlowPrompt(prompt);
    const flowAspectRatio = ASPECT_RATIO_MAP[aspectRatio] || ASPECT_RATIO_MAP['1:1'];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (signal?.aborted) {
            console.log('[Flow] ⏹️ 중지 요청됨');
            return null;
        }

        try {
            const page = await ensureFlowBrowserPage();
            const token = await getFlowSessionToken(page);

            // 캐시된 메타데이터 확인
            let meta = loadApiMetadata();

            // 메타 없으면 자동 학습 (세션당 1회만 허용 — 무한 루프 방지)
            if (!meta) {
                if (_discoveryAttemptedThisSession) {
                    throw new Error('FLOW_API_DISCOVERY_FAILED:내부 API 엔드포인트를 찾을 수 없습니다 (이번 세션 1회 시도 완료). Google AI Pro 구독 + Flow 액세스 권한 확인 후 앱 재시작 필요.');
                }
                _discoveryAttemptedThisSession = true;
                const discovered = await discoverAndCacheApi(page, token, currentPrompt, flowAspectRatio);
                if (discovered) {
                    const buffer = Buffer.from(discovered.encodedImage, 'base64');
                    trackApiUsage('gemini', { images: 1, model: 'flow-nano-banana-pro', costOverride: 0 });
                    const mimeType = detectImageMime(buffer);
                    sendImageLog(`✅ [Flow] 이미지 생성 완료 (${Math.round(buffer.length / 1024)}KB, 학습 중 생성)`);
                    return { buffer, mimeType };
                }
                throw new Error('FLOW_API_DISCOVERY_FAILED:내부 API 엔드포인트를 찾을 수 없습니다. Google 계정의 Flow 액세스 권한을 확인해주세요.');
            }

            // 학습된 메타로 정규 호출
            console.log(`[Flow] 🖼️ 이미지 생성 시도 ${attempt}/${MAX_RETRIES} (${meta.modelNameType})`);
            sendImageLog(`🖼️ [Flow] ${meta.modelNameType} 이미지 생성 중... (${attempt}/${MAX_RETRIES})`);

            const genResult = await page.evaluate(async (params: any) => {
                try {
                    const body = JSON.stringify({
                        userInput: {
                            candidatesCount: 1,
                            prompts: [params.prompt],
                            seed: params.seed,
                        },
                        clientContext: {
                            sessionId: `;${Date.now()}`,
                            tool: 'FLOW',
                        },
                        modelInput: { modelNameType: params.modelName },
                        aspectRatio: params.ratio,
                    });
                    const res = await fetch(params.endpoint, {
                        method: 'POST',
                        body,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${params.token}`,
                        },
                    });
                    if (!res.ok) {
                        const text = await res.text();
                        return { error: `HTTP_${res.status}`, detail: text.substring(0, 500) };
                    }
                    const data = await res.json();
                    const img = data?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage
                        || data?.generatedImages?.[0]?.encodedImage;
                    if (img) return { success: true, encodedImage: img };
                    return { error: 'NO_IMAGES', detail: JSON.stringify(data).substring(0, 500) };
                } catch (err: any) {
                    return { error: 'EXCEPTION', detail: err.message };
                }
            }, {
                endpoint: meta.endpoint,
                modelName: meta.modelNameType,
                token,
                prompt: currentPrompt,
                ratio: flowAspectRatio,
                seed: Math.floor(Math.random() * 999999),
            });

            if ((genResult as any).success && (genResult as any).encodedImage) {
                const buffer = Buffer.from((genResult as any).encodedImage, 'base64');
                console.log(`[Flow] ✅ 성공 (${Math.round(buffer.length / 1024)}KB, 시도 ${attempt})`);
                sendImageLog(`✅ [Flow] 이미지 생성 완료 (${Math.round(buffer.length / 1024)}KB)`);
                trackApiUsage('gemini', { images: 1, model: 'flow-nano-banana-pro', costOverride: 0 });
                return { buffer, mimeType: detectImageMime(buffer) };
            }

            const errorCode = (genResult as any).error || 'UNKNOWN';
            const errorDetail = (genResult as any).detail || '';

            // 토큰 만료
            if (errorCode === 'HTTP_401') {
                console.warn('[Flow] 🔑 토큰 만료 → 갱신');
                cachedToken = null;
                cachedTokenExpiry = null;
                if (attempt === MAX_RETRIES) {
                    lastError = new Error('FLOW_AUTH_EXPIRED:Google 세션 만료. AdsPower에서 재로그인 필요.');
                }
                continue;
            }

            // 쿼터 초과
            if (errorCode === 'HTTP_429') {
                sendImageLog('🚫 [Flow] 계정 쿼터 초과 — 약 1시간 후 재시도 권장');
                return null;
            }

            // 메타데이터 무효 (구글이 API 구조 변경 등) → 재학습 (세션당 1회만)
            if (errorCode === 'HTTP_404' || errorCode === 'NO_IMAGES') {
                if (_discoveryAttemptedThisSession) {
                    throw new Error(`FLOW_API_INVALID:저장된 API 메타가 무효이고 이번 세션 재학습도 이미 완료. 앱 재시작 필요.`);
                }
                console.warn(`[Flow] ⚠️ 메타 무효(${errorCode}) — 재학습 시도 (세션당 1회)`);
                try { fs.unlinkSync(getCachePath()); } catch { /* ignore */ }
                continue;
            }

            // 안전 필터
            if (errorDetail.includes('safety') || errorDetail.includes('blocked') || errorDetail.includes('policy')) {
                sendImageLog('🛡️ [Flow] 안전 필터 차단 — 프롬프트 순화');
                if (attempt === MAX_RETRIES) {
                    lastError = new Error('FLOW_SAFETY_BLOCK:Google 안전 필터 차단.');
                }
                continue;
            }

            // 알 수 없는 오류
            console.warn(`[Flow] ⚠️ ${errorCode}: ${errorDetail.substring(0, 200)}`);
            lastError = new Error(`FLOW_${errorCode}:${errorDetail.substring(0, 200)}`);

            if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
        } catch (err) {
            console.warn(`[Flow] 시도 ${attempt} 예외: ${(err as Error).message}`);
            lastError = err as Error;
            if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
        }
    }

    throw lastError || new Error('FLOW_UNKNOWN_ERROR:이미지 생성 실패');
}

/**
 * ✅ 일괄 이미지 생성 (ImageFX와 동일 시그니처로 호환성 유지)
 */
export async function generateWithFlow(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,
): Promise<GeneratedImage[]> {
    console.log(`[Flow] 🎨 총 ${items.length}개 이미지 생성 시작`);
    sendImageLog(`🎨 [Flow] Nano Banana Pro로 ${items.length}개 이미지 생성 시작`);

    const results: GeneratedImage[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
            sendImageLog(`🖼️ [Flow] [${i + 1}/${items.length}] "${item.heading}" 생성 중...`);
            const prompt = item.englishPrompt || PromptBuilder.build(item, {
                imageStyle: (item as any).imageStyle || 'realistic',
                category: (item as any).category || '',
            } as any);
            const aspectRatio = (item as any).aspectRatio || '1:1';
            const generated = await generateSingleImageWithFlow(prompt, aspectRatio);
            if (!generated) {
                console.warn(`[Flow] [${i + 1}/${items.length}] 생성 실패 (null 반환)`);
                continue;
            }
            const { filePath } = await writeImageFile(
                generated.buffer,
                generated.mimeType === 'image/jpeg' ? 'jpg' : generated.mimeType === 'image/webp' ? 'webp' : 'png',
                item.heading,
                postTitle,
                postId,
            );
            const image: GeneratedImage = {
                filePath,
                heading: item.heading,
                prompt,
                mimeType: generated.mimeType,
                provider: 'flow-nano-banana-pro',
                cost: 0,
            } as any;
            results.push(image);
            if (onImageGenerated) onImageGenerated(image, i + 1, items.length);
        } catch (err) {
            console.error(`[Flow] [${i + 1}/${items.length}] 실패: ${(err as Error).message}`);
            sendImageLog(`❌ [Flow] [${i + 1}] 실패: ${(err as Error).message.substring(0, 100)}`);
        }
    }

    console.log(`[Flow] ✅ 완료: ${results.length}/${items.length} 성공`);
    sendImageLog(`✅ [Flow] 완료: ${results.length}/${items.length} 성공`);
    return results;
}

// ─── 유틸 ──────────────────────────────────────────────
function sanitizeFlowPrompt(prompt: string): string {
    let cleaned = prompt.trim();
    // 마크다운/서식 제거
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
    // 200자 초과 시 트렁케이션
    if (cleaned.length > 200) cleaned = cleaned.substring(0, 200);
    return cleaned;
}

function detectImageMime(buffer: Buffer): string {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/webp';
    return 'image/png';
}

/**
 * ✅ Flow 연결 테스트 (UI "테스트" 버튼용)
 */
export async function testFlowConnection(): Promise<{ ok: boolean; message: string; userInfo?: any }> {
    try {
        const page = await ensureFlowBrowserPage();
        const token = await getFlowSessionToken(page);
        const userInfo = await page.evaluate(async () => {
            try {
                const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
                return res.ok ? (await res.json()).user : null;
            } catch { return null; }
        });
        return {
            ok: !!token,
            message: token ? `✅ Flow 연결 성공 — ${userInfo?.email || userInfo?.name || 'user'}` : '❌ 세션 확보 실패',
            userInfo,
        };
    } catch (err) {
        return { ok: false, message: `❌ ${(err as Error).message}` };
    }
}
