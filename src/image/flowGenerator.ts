/**
 * ✅ [v1.4.88] Google Labs Flow 이미지 생성기 — UI 자동화 방식
 *
 * 아키텍처 (ImageFX와 동일 패턴 — DOM 자동화로 완전 재작성):
 *   1. AdsPower/Playwright 브라우저로 labs.google/fx/tools/flow 접속
 *   2. ImageFX와 동일한 Google OAuth 세션 재사용 (쿠키 공유)
 *   3. UI 자동화: 프롬프트 입력 → "만들기" 클릭 → 이미지 URL 획득 → 다운로드
 *
 * 왜 UI 자동화인가:
 *   - API 직접 호출은 recaptchaContext.token이 페이지 내부에서 동적 생성되어 외부 복제 불가
 *   - 실제 엔드포인트: POST /v1/projects/{projectId}/flowMedia:batchGenerateImages (tool=PINHOLE, imageModelName=NARWHAL)
 *   - UI 자동화는 Google이 구조를 바꿔도 셀렉터만 갱신하면 되어 훨씬 견고
 *
 * 모델: Nano Banana 2 (Flow 기본, 내부명 NARWHAL)
 * 비용: $0 (AI Pro 쿼터 내)
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { writeImageFile } from './imageUtils.js';
import { PromptBuilder } from './promptBuilder.js';
import { trackApiUsage } from '../apiUsageTracker.js';
import type { Browser, Page } from 'playwright';

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
let cachedProjectUrl: string | null = null;
let _enabled: boolean = false;

// ─── 공개 플래그 ─────────────────────────────────────────
export function setFlowEnabled(enabled: boolean): void {
    _enabled = enabled;
    console.log(`[Flow] 🌐 ${enabled ? '✅ 활성' : '❌ 비활성'}`);
}

export function isFlowEnabled(): boolean {
    return _enabled;
}

// ─── 브라우저 페이지 확보 (ImageFX 세션 공유) ─────────────────
async function ensureFlowBrowserPage(): Promise<Page> {
    const { ensureImageFxBrowserPage } = await import('./imageFxGenerator.js');
    if (typeof ensureImageFxBrowserPage !== 'function') {
        throw new Error('FLOW_IMAGEFX_BRIDGE_MISSING:ImageFX 세션 공유가 비활성 상태입니다. 앱 업데이트 필요.');
    }
    const page = await ensureImageFxBrowserPage();
    cachedPage = page;
    return page;
}

// ─── Flow 프로젝트 확보 ───────────────────────────────────
async function ensureFlowProject(page: Page): Promise<void> {
    const currentUrl = page.url();

    // 이미 프로젝트 페이지이면 그대로 사용
    if (currentUrl.includes('/tools/flow/project/')) {
        cachedProjectUrl = currentUrl;
        return;
    }

    // 캐시된 프로젝트 URL이 있으면 그쪽으로 이동
    if (cachedProjectUrl) {
        console.log('[Flow] 🔗 캐시된 프로젝트 재사용');
        await page.goto(cachedProjectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1500);
        // 이동 성공 확인
        if (page.url().includes('/tools/flow/project/')) return;
    }

    // 새 프로젝트 생성
    console.log('[Flow] 🆕 Flow 새 프로젝트 생성 중...');
    sendImageLog('🆕 [Flow] 새 프로젝트 생성 중...');
    await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // "새 프로젝트" 버튼 클릭 — 다국어 지원 (ko/en/ja)
    const newProjectBtn = page.locator('button').filter({ hasText: /새 프로젝트|New project|新しいプロジェクト/ }).first();
    await newProjectBtn.waitFor({ state: 'visible', timeout: 30000 });
    await newProjectBtn.click();

    // 프로젝트 URL로 리다이렉트 대기
    await page.waitForURL(/\/tools\/flow\/project\//, { timeout: 30000 });
    await page.waitForTimeout(1500);
    cachedProjectUrl = page.url();
    console.log(`[Flow] ✅ 프로젝트 준비: ${cachedProjectUrl}`);
}

// ─── 프롬프트 입력 + 생성 클릭 + 이미지 URL 추출 ────────────────
async function typePromptAndSubmit(page: Page, prompt: string): Promise<void> {
    // 기존 프롬프트 지우기 (close 버튼 존재 시)
    try {
        const clearBtn = page.locator('button').filter({ hasText: /프롬프트 지우기|Clear prompt/ }).first();
        if (await clearBtn.count() > 0 && await clearBtn.isVisible().catch(() => false)) {
            await clearBtn.click();
            await page.waitForTimeout(300);
        }
    } catch { /* 지울 게 없음 */ }

    // 프롬프트 입력창 (role=textbox, contenteditable) 찾기
    const promptInput = page.locator('[role="textbox"][contenteditable="true"], div[contenteditable="true"]').first();
    await promptInput.waitFor({ state: 'visible', timeout: 15000 });
    await promptInput.click();
    await promptInput.fill(prompt);
    await page.waitForTimeout(300);

    // 만들기(arrow_forward) 버튼 — 하단 프롬프트 바의 submit 버튼
    // 상단에도 'add_2 만들기' 버튼이 있지만 그건 뉴 미디어 드롭다운용. 하단 'arrow_forward 만들기'가 전송.
    const submitBtn = page.locator('button').filter({ hasText: /arrow_forward/ }).first();
    await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
    await submitBtn.click();
}

// ─── 새 이미지 대기 ────────────────────────────────────────
async function waitForNewImage(page: Page, prevCount: number, timeoutMs: number = 120000): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const srcs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img[alt="생성된 이미지"], img[alt="Generated image"]'))
                .map((img: any) => img.src)
                .filter((s) => s && !s.includes('=s96-c'));
        });
        if (srcs.length > prevCount) {
            // 가장 최근 = 첫 번째 또는 마지막 (DOM 순서에 따라 다름). 첫 번째가 최신인 경우가 많음.
            return srcs[0];
        }
        await page.waitForTimeout(1000);
    }
    throw new Error('FLOW_IMAGE_TIMEOUT:이미지 생성 120초 초과 — 쿼터 초과/안전필터/네트워크 문제 가능성');
}

async function countExistingImages(page: Page): Promise<number> {
    return await page.evaluate(() => {
        return document.querySelectorAll('img[alt="생성된 이미지"], img[alt="Generated image"]').length;
    });
}

// ─── 이미지 URL → Buffer 다운로드 ────────────────────────────
async function downloadImageAsBuffer(page: Page, imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const base64 = await page.evaluate(async (url: string) => {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP_${res.status}`);
        const blob = await res.blob();
        return await new Promise<{ b64: string; type: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                const comma = result.indexOf(',');
                resolve({ b64: comma >= 0 ? result.substring(comma + 1) : '', type: blob.type || 'image/png' });
            };
            reader.onerror = () => reject(new Error('blob read error'));
            reader.readAsDataURL(blob);
        });
    }, imageUrl);

    const buffer = Buffer.from(base64.b64, 'base64');
    if (buffer.length < 1024) {
        throw new Error(`FLOW_IMAGE_DOWNLOAD_TINY:다운로드된 이미지가 비정상적으로 작음 (${buffer.length} bytes)`);
    }
    return { buffer, mimeType: base64.type || 'image/png' };
}

// ─── 단일 이미지 생성 (UI 자동화) ─────────────────────────────
export async function generateSingleImageWithFlow(
    prompt: string,
    _aspectRatio: string = '1:1',
    signal?: AbortSignal,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (signal?.aborted) {
            console.log('[Flow] ⏹️ 중지 요청됨');
            return null;
        }

        try {
            const page = await ensureFlowBrowserPage();
            await ensureFlowProject(page);

            const prevCount = await countExistingImages(page);
            console.log(`[Flow] 🖼️ 이미지 생성 시도 ${attempt}/${MAX_RETRIES} (기존 ${prevCount}장)`);
            sendImageLog(`🖼️ [Flow] 프롬프트 전송 중... (시도 ${attempt}/${MAX_RETRIES})`);

            await typePromptAndSubmit(page, prompt);

            sendImageLog('⏳ [Flow] 이미지 생성 대기 중...');
            const newImageUrl = await waitForNewImage(page, prevCount, 120000);
            console.log(`[Flow] ✅ 이미지 URL 획득: ${newImageUrl.substring(0, 120)}`);

            sendImageLog('📥 [Flow] 이미지 다운로드 중...');
            const downloaded = await downloadImageAsBuffer(page, newImageUrl);

            trackApiUsage('gemini', { images: 1, model: 'flow-nano-banana-2', costOverride: 0 });
            sendImageLog(`✅ [Flow] 생성 완료 (${Math.round(downloaded.buffer.length / 1024)}KB)`);
            return downloaded;
        } catch (err) {
            const msg = (err as Error).message || '';
            console.warn(`[Flow] 시도 ${attempt}/${MAX_RETRIES} 실패: ${msg}`);
            sendImageLog(`⚠️ [Flow] 시도 ${attempt} 실패: ${msg.substring(0, 150)}`);
            lastError = err as Error;

            if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, 3000 * attempt));
            }
        }
    }

    throw lastError || new Error('FLOW_UNKNOWN_ERROR:이미지 생성 실패');
}

// ─── 일괄 생성 (기존 시그니처 유지) ──────────────────────────
export async function generateWithFlow(
    items: ImageRequestItem[],
    postTitle?: string,
    postId?: string,
    onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,
): Promise<GeneratedImage[]> {
    console.log(`[Flow] 🎨 총 ${items.length}개 이미지 생성 시작 (UI 자동화)`);
    sendImageLog(`🎨 [Flow] Nano Banana 2로 ${items.length}개 이미지 생성 시작`);

    const results: GeneratedImage[] = [];
    let firstCriticalError: Error | null = null;

    for (let i = 0; i < items.length; i++) {
        if (firstCriticalError) break;
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
                console.warn(`[Flow] [${i + 1}] null 반환 (중지 감지) — 나머지 건너뜀`);
                break;
            }

            const ext = generated.mimeType === 'image/jpeg' ? 'jpg'
                : generated.mimeType === 'image/webp' ? 'webp'
                : 'png';
            const { filePath } = await writeImageFile(generated.buffer, ext, item.heading, postTitle, postId);

            const image: GeneratedImage = {
                filePath,
                heading: item.heading,
                prompt,
                mimeType: generated.mimeType,
                provider: 'flow-nano-banana-2',
                cost: 0,
            } as any;
            results.push(image);
            if (onImageGenerated) onImageGenerated(image, i + 1, items.length);
        } catch (err) {
            const msg = (err as Error).message || '';
            console.error(`[Flow] [${i + 1}/${items.length}] 실패: ${msg}`);
            sendImageLog(`❌ [Flow] [${i + 1}] 실패: ${msg.substring(0, 150)}`);
            if (msg.startsWith('FLOW_')) firstCriticalError = err as Error;
        }
    }

    console.log(`[Flow] ${results.length > 0 ? '✅' : '❌'} 완료: ${results.length}/${items.length} 성공`);
    sendImageLog(`${results.length > 0 ? '✅' : '❌'} [Flow] 완료: ${results.length}/${items.length} 성공`);

    if (results.length === 0) {
        if (firstCriticalError) throw firstCriticalError;
        throw new Error('FLOW_ALL_FAILED:모든 이미지 생성 실패. 이전 로그 확인 필요.');
    }
    return results;
}

// ─── 연결 테스트 (UI "테스트" 버튼용) ──────────────────────────
export async function testFlowConnection(): Promise<{ ok: boolean; message: string; userInfo?: any }> {
    try {
        const page = await ensureFlowBrowserPage();
        // labs.google/fx 도메인 세션 확인 (ImageFX와 동일 엔드포인트)
        const session = await page.evaluate(async () => {
            try {
                const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
                return res.ok ? await res.json() : null;
            } catch { return null; }
        });
        if (!session || !(session as any).user) {
            return { ok: false, message: '❌ Google 세션 없음 — AdsPower에서 Google 로그인 필요' };
        }
        const userInfo = (session as any).user;
        // Flow 프로젝트 페이지 접근 확인
        await ensureFlowProject(page);
        return {
            ok: true,
            message: `✅ Flow 연결 성공 — ${userInfo?.email || userInfo?.name || 'user'} (프로젝트 준비됨)`,
            userInfo,
        };
    } catch (err) {
        return { ok: false, message: `❌ ${(err as Error).message}` };
    }
}

// ─── 중지/정리 ──────────────────────────────────────────
export function resetFlowState(): void {
    cachedProjectUrl = null;
    cachedPage = null;
    cachedBrowser = null;
}
