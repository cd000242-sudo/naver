// ✅ [2026-01-25 모듈화] VEO 영상 생성 유틸리티
// 소제목별 VEO 영상 생성 및 프롬프트 빌드 관련 함수들

import { normalizeHeadingKeyForVideoCache, toFileUrlMaybe } from './headingKeyUtils.js';
import { buildVeoSafePrompt, isVeoAudioBlockedMessage } from './veoSafetyUtils.js';
import {
    isVeoQuotaExceededMessage,
    buildVeoQuotaUserMessage,
    extractEnglishishProductName,
    isImageStylePromptForVeo
} from './videoProviderUtils.js';
import {
    HeadingVideoPreviewCacheEntry,
    headingVideoPreviewCache,
    headingVideoPreviewInFlight
} from './headingVideoPreviewUtils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// 쿼터 잠금 상태
// ═══════════════════════════════════════════════════════════════════════════════

let veoQuotaLockUntil = 0;
let veoQuotaLastToastAt = 0;

export function getVeoQuotaLockUntil(): number {
    return veoQuotaLockUntil;
}

export function setVeoQuotaLockUntil(value: number): void {
    veoQuotaLockUntil = value;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 소제목 영상 미리 가져오기
// ═══════════════════════════════════════════════════════════════════════════════

function prefetchHeadingVideoPreviewInternal(heading: string): void {
    const key = normalizeHeadingKeyForVideoCache(heading);
    if (!key) return;
    if (headingVideoPreviewCache.has(key)) return;
    if (headingVideoPreviewInFlight.has(key)) return;
    if (typeof (window as any).api?.getHeadingVideos !== 'function') return;

    const p = (window as any).api
        .getHeadingVideos(key)
        .then((res: any) => {
            const videos = Array.isArray(res?.videos) ? res.videos : [];
            const v = videos[0];
            const url = toFileUrlMaybe(v?.previewDataUrl || v?.filePath || '');
            const entry: HeadingVideoPreviewCacheEntry = url ? { url, updatedAt: v?.updatedAt } : null;
            headingVideoPreviewCache.set(key, entry);
            return entry;
        })
        .catch(() => {
            headingVideoPreviewCache.set(key, null);
            return null;
        })
        .finally(() => {
            headingVideoPreviewInFlight.delete(key);
        });

    headingVideoPreviewInFlight.set(key, p);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 리뷰 제품 앵커 추출
// ═══════════════════════════════════════════════════════════════════════════════

function getReviewProductAnchorInternal(): string {
    try {
        const selectedContentType = String((window as any).selectedContentType || '').trim();
        if (selectedContentType !== 'review') return '';

        const sc: any = (window as any).currentStructuredContent || {};
        const title = String(sc?.selectedTitle || sc?.title ||
            (document.getElementById('post-title') as HTMLInputElement | null)?.value || '').trim();
        const keywordsRaw = String(
            (document.getElementById('unified-keywords') as HTMLInputElement | null)?.value || ''
        ).trim();
        const keywords = keywordsRaw ? keywordsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

        for (const k of keywords) {
            const extracted = extractEnglishishProductName(k);
            if (extracted) return extracted;
        }

        const extractedTitle = extractEnglishishProductName(title);
        if (extractedTitle) return extractedTitle;
    } catch {
    }
    return '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 최소 무음 VEO 프롬프트 생성
// ═══════════════════════════════════════════════════════════════════════════════

function buildMinimalSilentVeoPromptInternal(headingTitle: string): string {
    const heading = normalizeHeadingKeyForVideoCache(headingTitle);
    const sc: any = (window as any).currentStructuredContent || {};
    const mainTitle = String(sc?.selectedTitle || sc?.title || '').trim();
    const keywordsRaw = String(
        (document.getElementById('unified-keywords') as HTMLInputElement | null)?.value || ''
    ).trim();
    const firstKeyword = keywordsRaw ? keywordsRaw.split(',').map((s) => s.trim()).filter(Boolean)[0] : '';
    const titleAnchor = mainTitle ? mainTitle.split(/\s*(?:\||｜|:|—|\(|\[|\{)\s*/)[0].trim() : '';
    const anchor = getReviewProductAnchorInternal() || String(firstKeyword || '').trim() || titleAnchor;

    const base = anchor
        ? `Create a cinematic silent B-roll video. No audio. No speech. No music. No text.

[Main topic/product]
${anchor}

[Subheading]
${heading}

[Visual style]
Realistic, natural lighting, smooth camera movement, no logos, no text overlays. If a person appears, depict a Korean person and Korean lifestyle context.`
        : `Create a cinematic silent B-roll video. No audio. No speech. No music. No text.

[Subheading]
${heading}

[Visual style]
Realistic, natural lighting, smooth camera movement, no logos, no text overlays. If a person appears, depict a Korean person and Korean lifestyle context.`;

    return buildVeoSafePrompt(base).prompt;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VEO 쿼터 잠금
// ═══════════════════════════════════════════════════════════════════════════════

export interface VeoQuotaCallbacks {
    showToastError: (msg: string) => void;
    appendLog: (msg: string, target?: string) => void;
}

function lockVeoQuotaInternal(
    minutes: number,
    rawMessage?: string,
    callbacks?: VeoQuotaCallbacks
): string {
    const now = Date.now();
    const ms = Math.max(1, Number(minutes || 0)) * 60 * 1000;
    veoQuotaLockUntil = Math.max(veoQuotaLockUntil, now + ms);
    const remainingMin = Math.max(1, Math.ceil((veoQuotaLockUntil - now) / (60 * 1000)));
    const userMsg = buildVeoQuotaUserMessage(remainingMin);

    if (now - veoQuotaLastToastAt > 2500) {
        veoQuotaLastToastAt = now;
        if (callbacks) {
            try {
                callbacks.showToastError(userMsg);
            } catch (e) {
                console.warn('[veoVideoUtils] catch ignored:', e);
            }
            try {
                const raw = String(rawMessage || '').trim();
                callbacks.appendLog(`❌ Veo 쿼터/한도 초과: ${raw || 'quota exceeded'}`, 'images-log-output');
            } catch (e) {
                console.warn('[veoVideoUtils] catch ignored:', e);
            }
        }
    }
    return userMsg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VEO 영상 생성 (재시도 로직 포함)
// ═══════════════════════════════════════════════════════════════════════════════

export interface GenerateVeoCallbacks {
    appendLog: (msg: string, target?: string) => void;
    showToastError: (msg: string) => void;
}

async function generateVeoVideoWithRetryInternal(
    params: any,
    headingTitleForFallback: string,
    callbacks?: GenerateVeoCallbacks
): Promise<any> {
    if (veoQuotaLockUntil && Date.now() < veoQuotaLockUntil) {
        const remainingMin = Math.max(1, Math.ceil((veoQuotaLockUntil - Date.now()) / (60 * 1000)));
        return { success: false, message: buildVeoQuotaUserMessage(remainingMin) };
    }

    const rawHeading = String((params && params.heading) || headingTitleForFallback || '').trim();
    const safeHeading = rawHeading ? normalizeHeadingKeyForVideoCache(rawHeading) : '';
    const baseParams = safeHeading ? { ...params, heading: safeHeading } : { ...params };

    const first = await (window as any).api.generateVeoVideo(baseParams);
    if (first?.success) return first;

    const message = String(first?.message || '');
    if (isVeoQuotaExceededMessage(message)) {
        return {
            success: false,
            message: lockVeoQuotaInternal(10, message, callbacks ? {
                showToastError: callbacks.showToastError,
                appendLog: callbacks.appendLog
            } : undefined)
        };
    }
    if (!isVeoAudioBlockedMessage(message)) return first;

    const fallbackPrompt = buildMinimalSilentVeoPromptInternal(headingTitleForFallback);
    if (callbacks) {
        callbacks.appendLog('🛡️ Veo 안전 필터(오디오) 차단 감지: 안전 프롬프트로 1회 재시도합니다.');
    }

    return (window as any).api.generateVeoVideo({
        ...baseParams,
        prompt: fallbackPrompt,
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 소제목 맞춤 VEO 프롬프트 빌드
// ═══════════════════════════════════════════════════════════════════════════════

function buildHeadingAlignedVeoPromptInternal(
    headingTitle: string,
    rawHeadingPrompt?: string
): { prompt: string; changed: boolean; reason: string } {
    const heading = normalizeHeadingKeyForVideoCache(headingTitle);
    const raw = String(rawHeadingPrompt || '').trim();

    // ✅ 사용자가 직접 입력한 자연어 프롬프트는 그대로 사용
    if (raw && !isImageStylePromptForVeo(raw)) {
        return buildVeoSafePrompt(raw);
    }

    const sc: any = (window as any).currentStructuredContent || {};
    const mainTitle = String(sc?.selectedTitle || sc?.title || '').trim();
    const keywordsRaw = String(
        (document.getElementById('unified-keywords') as HTMLInputElement | null)?.value || ''
    ).trim();
    const firstKeyword = keywordsRaw ? keywordsRaw.split(',').map((s) => s.trim()).filter(Boolean)[0] : '';

    const titleAnchor = mainTitle ? mainTitle.split(/\s*(?:\||｜|:|—|\(|\[|\{)\s*/)[0].trim() : '';
    const anchor = getReviewProductAnchorInternal() || String(firstKeyword || '').trim() || titleAnchor;

    let headingContent = '';
    try {
        const headingsArr: any[] = Array.isArray(sc?.headings) ? sc.headings : [];
        const bodyPlain = String(sc?.bodyPlain || '').trim();
        const entry = headingsArr.find((h: any) => {
            if (!h) return false;
            const t = typeof h === 'string' ? h : (h.title || '');
            return normalizeHeadingKeyForVideoCache(String(t || '')) === heading;
        });
        if (entry && typeof entry !== 'string') {
            headingContent = String(entry.content || '').trim();
        }
        if (!headingContent && bodyPlain && heading) {
            const headingIndex = bodyPlain.indexOf(headingTitle);
            if (headingIndex !== -1) {
                const startIndex = headingIndex + headingTitle.length;
                let endIndex = bodyPlain.length;
                for (let i = 0; i < headingsArr.length; i++) {
                    const h = headingsArr[i];
                    const t = typeof h === 'string' ? h : (h?.title || '');
                    if (!t || t === headingTitle) continue;
                    const idx = bodyPlain.indexOf(String(t), startIndex);
                    if (idx !== -1 && idx < endIndex) {
                        endIndex = idx;
                    }
                }
                headingContent = bodyPlain.substring(startIndex, endIndex).trim();
            }
        }
    } catch {
        // ignore headingContent failures
    }

    const storySnippet = headingContent
        ? headingContent.split(/(?<=[.!?\n])/).slice(0, 3).join(' ').slice(0, 400)
        : heading;

    const reviewAnchor = getReviewProductAnchorInternal();
    const reviewDirection = reviewAnchor
        ? `\n\n[Hands-on product review direction]\n- Show real-world usage of "${reviewAnchor}"\n- Natural lighting, realistic everyday environment (Korean home/office/tabletop)\n- Korean hands/person interacting with the product (if a person appears)\n- Close-ups of key details, materials, buttons, texture\n- No logos, no text overlays, no watermarks`
        : '';

    const composed = anchor
        ? `Create a cinematic B-roll style silent video that dynamically visualizes the following blog subheading and story.\n\n[Main topic/product]\n${anchor}\n\n[Subheading]\n${heading}\n\n[Story]\n${storySnippet}\n\n[Visual direction]\nShow multiple dynamic cuts, camera movements, and emotional close-ups that match the struggle and mood of the story. Avoid generic party or celebration scenes unless they clearly fit the story.${reviewDirection}`
        : `Create a cinematic B-roll style silent video that dynamically visualizes the following blog subheading and story.\n\n[Subheading]\n${heading}\n\n[Story]\n${storySnippet}\n\n[Visual direction]\nShow multiple dynamic cuts, camera movements, and emotional close-ups that match the struggle and mood of the story. Avoid generic party or celebration scenes unless they clearly fit the story.${reviewDirection}`;

    return buildVeoSafePrompt(composed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-01-26 FIX] window 객체에 노출 (무한재귀 방지)
// _impl 접미사로 renderer.ts wrapper와 이름 충돌 방지
// ═══════════════════════════════════════════════════════════════════════════════

(window as any).prefetchHeadingVideoPreview_impl = prefetchHeadingVideoPreviewInternal;
(window as any).buildMinimalSilentVeoPrompt_impl = buildMinimalSilentVeoPromptInternal;
(window as any).getReviewProductAnchor_impl = getReviewProductAnchorInternal;
(window as any).buildHeadingAlignedVeoPrompt_impl = buildHeadingAlignedVeoPromptInternal;
(window as any).lockVeoQuota_impl = lockVeoQuotaInternal;
(window as any).generateVeoVideoWithRetry_impl = generateVeoVideoWithRetryInternal;
(window as any).getVeoQuotaLockUntil = getVeoQuotaLockUntil;
(window as any).setVeoQuotaLockUntil = setVeoQuotaLockUntil;

console.log('[VeoVideoUtils] 📦 모듈 로드됨!');
