// @ts-nocheck
// Restored from dist/renderer/modules/fullAutoFlow.js after source encoding damage; keep runtime parity with the last successful build.
"use strict";
import { applyPendingArticleTablesToGeneratedContent } from './articleTableComposer.js';
import { buildRendererContentPolicyContext } from '../utils/contentPolicyContext.js';
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitLog = emitLog;
exports.resolveImageManagerKeys = resolveImageManagerKeys;
exports.isFatalApiError = isFatalApiError;
exports.isRetryableImageError = isRetryableImageError;
exports.friendlyErrorMessage = friendlyErrorMessage;
exports.executeFullAutoFlow = executeFullAutoFlow;
exports.executeSemiAutoFlow = executeSemiAutoFlow;
exports.updateUnifiedPreview = updateUnifiedPreview;
exports.updateUnifiedImagePreview = updateUnifiedImagePreview;
exports.initFullAutoImageSourceSelection = initFullAutoImageSourceSelection;
exports.initFullAutoExecution = initFullAutoExecution;
exports.collectFullAutoFormData = collectFullAutoFormData;
exports.validateFullAutoFormData = validateFullAutoFormData;
exports.executeFullAutoAutomation = executeFullAutoAutomation;
exports.generateFullAutoContent = generateFullAutoContent;
exports.displayContentInAllTabs = displayContentInAllTabs;
exports.generateImagesForContent = generateImagesForContent;
exports.generateLibraryImagesForHeadings = generateLibraryImagesForHeadings;
exports.generateAIImagesForHeadings = generateAIImagesForHeadings;
exports.executeBlogPublishing = executeBlogPublishing;
const FULL_AUTO_CONTENT_GENERATION_TIMEOUT_MS = 360000;
const FULL_AUTO_CONTENT_GENERATION_RETRY_COUNT = 0;
const FULL_AUTO_IMAGE_MAX_ATTEMPTS = 3;
const FULL_AUTO_IMAGE_TOTAL_BUDGET_MS = 35 * 60 * 1000;
const FULL_AUTO_THUMBNAIL_IMAGE_TIMEOUT_MS = 4 * 60 * 1000;
const FULL_AUTO_BODY_IMAGE_TIMEOUT_MS = 25 * 60 * 1000;
const FLOW_FULL_AUTO_IMAGE_MAX_ATTEMPTS = 2;
const FLOW_FULL_AUTO_TOTAL_BUDGET_MS = 18 * 60 * 1000;
const FLOW_FULL_AUTO_THUMBNAIL_IMAGE_TIMEOUT_MS = 4 * 60 * 1000;
const FLOW_FULL_AUTO_BODY_IMAGE_TIMEOUT_MS = 7 * 60 * 1000;
const FULL_AUTO_CONTENT_RETRY_CACHE_KEY = '__leaderFullAutoContentRetryCache';
const FULL_AUTO_CONTENT_RETRY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
function isConcreteNaverPostUrlLikeForFullAuto(value) {
    const url = String(value || '').trim();
    if (!url || !/blog\.naver\.com/i.test(url) || /PostWriteForm\.naver|Redirect=Write/i.test(url)) {
        return false;
    }
    if (/blog\.naver\.com\/[^/?#]+\/\d+/i.test(url)) {
        return true;
    }
    try {
        const parsed = new URL(url);
        return parsed.hostname.toLowerCase().includes('blog.naver.com') && /^\d+$/.test(parsed.searchParams.get('logNo') || '');
    }
    catch {
        return /[?&]logNo=\d+/i.test(url);
    }
}
function isFlowImageSource(provider) {
    return String(provider || '').trim() === 'flow';
}
function getFullAutoImageMaxAttempts(provider) {
    return isFlowImageSource(provider) ? FLOW_FULL_AUTO_IMAGE_MAX_ATTEMPTS : FULL_AUTO_IMAGE_MAX_ATTEMPTS;
}
function getFullAutoTotalImageBudgetMs(provider) {
    return isFlowImageSource(provider) ? FLOW_FULL_AUTO_TOTAL_BUDGET_MS : FULL_AUTO_IMAGE_TOTAL_BUDGET_MS;
}
function getFullAutoThumbnailImageTimeoutMs(provider) {
    return isFlowImageSource(provider) ? FLOW_FULL_AUTO_THUMBNAIL_IMAGE_TIMEOUT_MS : FULL_AUTO_THUMBNAIL_IMAGE_TIMEOUT_MS;
}
function getFullAutoBodyImageTimeoutMs(provider, itemCount = 1) {
    if (!isFlowImageSource(provider)) {
        return FULL_AUTO_BODY_IMAGE_TIMEOUT_MS;
    }
    const count = Math.max(1, Number(itemCount) || 1);
    if (count === 1) {
        return FLOW_FULL_AUTO_BODY_IMAGE_TIMEOUT_MS;
    }
    return Math.min(FLOW_FULL_AUTO_TOTAL_BUDGET_MS, 120000 + count * FLOW_FULL_AUTO_BODY_IMAGE_TIMEOUT_MS);
}
function assertAutomationPublishResult(automationResult, payload) {
    if (!automationResult) {
        throw new Error('블로그 발행 결과가 비어 있습니다. 작성중인 글이 남아 있을 수 있어 완료 처리하지 않습니다.');
    }
    if (automationResult.success !== true) {
        throw new Error(automationResult.message || automationResult.error || '블로그 발행이 성공 결과를 반환하지 않았습니다.');
    }
    const publishMode = String(payload?.publishMode || 'publish');
    if (publishMode === 'publish') {
        const publishedUrl = String(automationResult.url || automationResult.postUrl || automationResult.blogUrl || '').trim();
        if (!isConcreteNaverPostUrlLikeForFullAuto(publishedUrl)) {
            throw new Error('블로그 발행 URL을 확인하지 못했습니다. 작성중인 글/임시저장/블로그홈 상태를 완료로 처리하지 않습니다.');
        }
    }
    return automationResult;
}
function getFullAutoImagePath(image) {
    if (!image)
        return '';
    if (typeof image === 'string')
        return image.trim();
    return String(image.filePath || image.savedToLocal || image.url || image.previewDataUrl || '').trim();
}
function normalizeFullAutoImageForPipeline(image, overrides = {}) {
    const merged = {
        ...(typeof image === 'object' && image ? image : {}),
        ...overrides,
    };
    const filePath = getFullAutoImagePath(merged) || getFullAutoImagePath(image);
    if (!filePath)
        return merged;
    return {
        ...merged,
        filePath,
        savedToLocal: merged.savedToLocal || merged.filePath || filePath,
        url: merged.url || filePath,
        previewDataUrl: merged.previewDataUrl || (/^(data:|blob:|file:|https?:)/i.test(filePath) ? filePath : undefined),
    };
}
function registerFullAutoThumbnailImage(image, provider, formData, originalHeading = '') {
    const normalized = normalizeFullAutoImageForPipeline(image, {
        provider: image?.provider || provider || 'unknown',
        heading: '🖼️ 썸네일',
        originalHeading,
        isThumbnail: true,
    });
    const thumbPath = getFullAutoImagePath(normalized);
    if (thumbPath) {
        try {
            ImageManager.setImage('🖼️ 썸네일', {
                ...normalized,
                filePath: thumbPath,
                savedToLocal: normalized.savedToLocal || thumbPath,
                url: normalized.url || thumbPath,
                previewDataUrl: normalized.previewDataUrl,
                heading: '🖼️ 썸네일',
                isThumbnail: true,
            });
            window.thumbnailPath = thumbPath;
            if (formData)
                formData.thumbnailPath = thumbPath;
            console.log(`[FullAuto] ✅ 대표 썸네일 고정 등록: ${thumbPath.substring(0, 120)}`);
        }
        catch (e) {
            console.warn('[FullAuto] 대표 썸네일 등록 실패:', e);
        }
    }
    return normalized;
}
function normalizeReuseString(value) {
    return String(value ?? '').trim();
}
function normalizeReuseStringList(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => normalizeReuseString(item))
        .filter(Boolean)
        .sort();
}
function splitHashtagCandidates(value) {
    if (Array.isArray(value)) {
        return value.flatMap((item) => splitHashtagCandidates(item));
    }
    return String(value ?? '')
        .split(/[,\s#]+/)
        .map((tag) => tag.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_-]/gu, ''))
        .filter((tag) => tag.length >= 2 && tag.length <= 18);
}
function resolveFallbackHashtags(structuredContent, formData) {
    const candidates = [
        ...splitHashtagCandidates(structuredContent?.hashtags),
        ...splitHashtagCandidates(formData?.hashtags),
        ...splitHashtagCandidates(formData?.generatedHashtags),
        ...splitHashtagCandidates(formData?.keywords),
    ];
    if (candidates.length < 3) {
        candidates.push(...splitHashtagCandidates(structuredContent?.selectedTitle || structuredContent?.title || formData?.title));
    }
    const seen = new Set();
    return candidates
        .map((tag) => tag.replace(/^-+|-+$/g, ''))
        .filter(Boolean)
        .filter((tag) => {
        const key = tag.toLowerCase();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .slice(0, 5);
}
function compactTailDebugText(value, maxLength = 700) {
    const text = String(value ?? '');
    return text.length > maxLength ? text.slice(-maxLength) : text;
}
function parsePrePublishMissingHashtags(errorMsg) {
    const message = String(errorMsg || '');
    const match = message.match(/hashtag-presence\(([^)]*)\)/);
    const detail = match?.[1] || '';
    const missingMarker = '\uc2e4\uc81c \ub204\ub77d:';
    const missingIndex = detail.indexOf(missingMarker);
    if (missingIndex < 0) {
        return [];
    }
    return splitHashtagCandidates(detail.slice(missingIndex + missingMarker.length));
}
function parseBackendHashtagDebug(errorMsg) {
    const message = String(errorMsg || '');
    const marker = 'HASHTAG_DEBUG:';
    const markerIndex = message.indexOf(marker);
    if (markerIndex < 0) {
        return null;
    }
    const jsonText = message.slice(markerIndex + marker.length).trim();
    try {
        return JSON.parse(jsonText);
    }
    catch {
        return {
            parseFailed: true,
            raw: jsonText.slice(0, 900),
        };
    }
}
function buildRendererPublishTailDebug(payload, errorMsg) {
    const structuredContent = payload?.structuredContent || {};
    const expectedHashtags = splitHashtagCandidates(
        payload?.hashtags || structuredContent?.hashtags || payload?.formDataHashtags || []
    );
    const content = String(payload?.content || structuredContent?.bodyPlain || structuredContent?.content || '');
    const backendHashtagDebug = parseBackendHashtagDebug(errorMsg);
    const missingFromError = parsePrePublishMissingHashtags(errorMsg);
    const bodyHashtagStatus = expectedHashtags.map((tag) => ({
        tag,
        hashPresent: content.includes(`#${tag}`),
        plainPresent: content.includes(tag),
    }));
    return {
        title: String(payload?.title || structuredContent?.selectedTitle || structuredContent?.title || '').slice(0, 120),
        publishMode: payload?.publishMode,
        contentMode: payload?.contentMode,
        expectedHashtags,
        missingFromError: missingFromError.length > 0 ? missingFromError : backendHashtagDebug?.missingHashtags || [],
        backendHashtagDebug,
        bodyHashtagStatus,
        contentChars: content.length,
        contentTail: compactTailDebugText(content),
        previousPostTitle: payload?.previousPostTitle || '',
        previousPostUrl: payload?.previousPostUrl || '',
        ctaPosition: payload?.ctaPosition || '',
        ctasCount: Array.isArray(payload?.ctas) ? payload.ctas.length : 0,
        generatedImagesCount: Array.isArray(payload?.generatedImages) ? payload.generatedImages.length : 0,
        imageMode: payload?.imageMode,
        skipImages: payload?.skipImages === true,
    };
}
function emitRendererPublishTailDebug(stage, payload, extra = {}) {
    try {
        const errorMsg = extra?.errorMsg || extra?.apiError || '';
        const diagnostics = buildRendererPublishTailDebug(payload, errorMsg);
        const line = `[TailDebug] ${JSON.stringify({
            scope: 'renderer-publish',
            stage,
            ...diagnostics,
            ...extra,
        })}`;
        console.warn(line);
        if (String(stage).includes('error') && diagnostics.missingFromError?.length > 0) {
            const logFn = (typeof window !== 'undefined' && typeof window.appendLog === 'function')
                ? window.appendLog
                : (typeof appendLog === 'function' ? appendLog : null);
            logFn?.(`🧭 [TailDebug] 해시태그 누락 진단: ${diagnostics.missingFromError.map((tag) => `#${tag}`).join(' ')} / cause=${diagnostics.backendHashtagDebug?.probableCause || 'unknown'}`);
        }
    }
    catch (error) {
        console.warn('[TailDebug] renderer emit failed', error?.message || error);
    }
}
function cloneFullAutoContentForRetry(content) {
    try {
        return JSON.parse(JSON.stringify(content));
    }
    catch {
        return content;
    }
}
function hasReusableFullAutoContent(content) {
    return !!content && ((Array.isArray(content.headings) && content.headings.length > 0) ||
        !!normalizeReuseString(content.bodyPlain || content.content || content.introduction));
}
function getManualTitleOverride(formData) {
    return normalizeReuseString(formData?.manualTitleOverride || formData?.manualTitle || formData?.imageNarrative?.manualTitle).slice(0, 120) || undefined;
}
function applyManualTitleOverride(structuredContent, manualTitle) {
    const title = normalizeReuseString(manualTitle).slice(0, 120);
    if (!structuredContent || !title)
        return;
    structuredContent.title = title;
    structuredContent.selectedTitle = title;
    structuredContent.manualTitleLocked = true;
    structuredContent.manualTitleValue = title;
    structuredContent.titleAlternatives = [title];
    structuredContent.titleCandidates = [{ text: title, score: 100, reasoning: '사용자 지정 제목' }];
}
function buildFullAutoContentReuseKey(formData) {
    const contentMode = normalizeReuseString(formData?.contentMode || formData?.styleOptions?.contentMode || '');
    return JSON.stringify({
        urls: normalizeReuseStringList(formData?.urls),
        keywords: normalizeReuseString(formData?.keywords),
        generator: normalizeReuseString(formData?.generator),
        toneStyle: normalizeReuseString(formData?.toneStyle),
        contentMode,
        manualTitleOverride: normalizeReuseString(getManualTitleOverride(formData)),
        keywordAsTitle: formData?.keywordAsTitle === true,
        keywordTitlePrefix: formData?.keywordTitlePrefix === true,
        ctaType: normalizeReuseString(formData?.ctaType),
        category: normalizeReuseString(formData?.category || formData?.categoryName),
    });
}
function getFullAutoContentRetryCache(formData) {
    try {
        const cache = window[FULL_AUTO_CONTENT_RETRY_CACHE_KEY];
        if (!cache || !cache.imageRetryPending)
            return null;
        if (Date.now() - Number(cache.createdAt || 0) > FULL_AUTO_CONTENT_RETRY_MAX_AGE_MS) {
            delete window[FULL_AUTO_CONTENT_RETRY_CACHE_KEY];
            return null;
        }
        if (cache.key !== buildFullAutoContentReuseKey(formData))
            return null;
        if (!hasReusableFullAutoContent(cache.structuredContent))
            return null;
        return cloneFullAutoContentForRetry(cache.structuredContent);
    }
    catch {
        return null;
    }
}
function saveFullAutoContentRetryCache(formData, structuredContent) {
    if (!hasReusableFullAutoContent(structuredContent))
        return;
    try {
        window[FULL_AUTO_CONTENT_RETRY_CACHE_KEY] = {
            key: buildFullAutoContentReuseKey(formData),
            structuredContent: cloneFullAutoContentForRetry(structuredContent),
            createdAt: Date.now(),
            imageRetryPending: true,
        };
    }
    catch (error) {
        console.warn('[FullAuto] content retry cache save failed:', error);
    }
}
function clearFullAutoContentRetryCache() {
    try {
        delete window[FULL_AUTO_CONTENT_RETRY_CACHE_KEY];
    }
    catch {
    }
}
function isExplicitImageManagementSource(formData) {
    return formData.imageSource === 'image-management' ||
        formData.imageSource === 'saved' ||
        formData.imageSource === 'local-folder';
}
if (typeof window !== 'undefined') {
    window.getFullAutoContentRetryCache = getFullAutoContentRetryCache;
    window.saveFullAutoContentRetryCache = saveFullAutoContentRetryCache;
    window.clearFullAutoContentRetryCache = clearFullAutoContentRetryCache;
}
function autoLinkPreviousPost(formData, modal) {
    appendLog(`🔗 이전글 자동 엮기: 같은 계정+카테고리의 이전 발행글 찾기 시작...`);
    ensureCategoryMigration();
    const allPosts = loadAllGeneratedPosts();
    const currentNaverId = getCurrentNaverId();
    const rawCategory = formData.category || formData.categoryName || '';
    const currentCategory = normalizeCategory(rawCategory);
    appendLog(`   📂 현재 카테고리: "${currentCategory || '없음'}" (원본: "${rawCategory}")`);
    appendLog(`   👤 현재 계정: "${currentNaverId || '미지정'}"`);
    const publishedPosts = allPosts.filter((p) => p.publishedUrl && p.publishedUrl.trim() &&
        (!currentNaverId || !p.naverId || p.naverId === currentNaverId));
    appendLog(`   📊 전체 발행글: ${publishedPosts.length}개`);
    const canAutoLink = formData.ctaType === 'previous-post';
    const needsLinkLookup = !formData.ctaUrl || formData.ctaUrl.trim() === '';
    if (canAutoLink && needsLinkLookup) {
        const prevPosts = publishedPosts
            .filter((p) => {
            if (!currentCategory)
                return false;
            const postCat = normalizeCategory(p.category || '');
            return postCat === currentCategory;
        })
            .sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });
        appendLog(`   🔍 동일 카테고리 글: ${prevPosts.length}개`);
        const prevPost = prevPosts[0];
        if (prevPost) {
            const validUrl = prevPost.publishedUrl && prevPost.publishedUrl.startsWith('http') ? prevPost.publishedUrl : '';
            formData.ctaUrl = validUrl;
            if (validUrl)
                formData.ctaLink = validUrl;
            formData.previousPostTitle = prevPost.title || '이전 글 보기';
            if (validUrl)
                formData.previousPostUrl = validUrl;
            if (!formData.ctaText || formData.ctaText.startsWith('📖')) {
                formData.ctaText = `📖 추천 글: ${prevPost.title}`;
            }
            appendLog(`✅ CTA 이전글 매칭 성공: "${prevPost.title}" (카테고리: ${prevPost.category || '없음'})`);
            appendLog(`   👉 URL: ${formData.ctaUrl}`);
            modal?.addLog?.(`🔗 이전글 자동 매칭: ${prevPost.title}`);
        }
        else {
            if (!currentCategory) {
                appendLog('⚠️ 현재 카테고리가 설정되지 않았습니다.');
            }
            else {
                appendLog(`⚠️ "${currentCategory}" 카테고리의 이전 발행글을 찾지 못했습니다.`);
            }
            if (!formData.ctaUrl)
                formData.ctaType = 'none';
        }
    }
    const needsPreviousPostLookup = !formData.previousPostUrl || formData.previousPostUrl.trim() === '';
    const isShoppingConnectMode = formData.affiliateLink && formData.affiliateLink.trim();
    const isMateMode = formData.contentMode === 'mate';
    const isStandardContentMode = ['seo', 'homefeed', 'custom', 'business', 'affiliate'].includes(String(formData.contentMode || 'seo'));
    const skipBecauseCtaIsPrevPost = formData.ctaType === 'previous-post' && !isShoppingConnectMode && !isMateMode;
    const ctaLinkAlreadyHasPreviousPost = formData.ctaLink && formData.ctaLink.trim() &&
        formData.ctaLink.startsWith('http') && formData.ctaLink.includes('blog.naver.com');
    const skipBecauseCtaLinkAlreadySet = ctaLinkAlreadyHasPreviousPost && !isShoppingConnectMode;
    if (needsPreviousPostLookup && (formData.ctaType !== 'none' || isMateMode || isStandardContentMode) && !skipBecauseCtaIsPrevPost && !skipBecauseCtaLinkAlreadySet) {
        let prevPosts = [];
        if (isShoppingConnectMode) {
            prevPosts = publishedPosts
                .filter((p) => {
                if (!currentCategory)
                    return false;
                const postCat = normalizeCategory(p.category || '');
                const categoryMatch = postCat === currentCategory;
                const isPostShoppingConnect = !!(p.affiliateLink || p.contentMode === 'shopping-connect');
                return categoryMatch && isPostShoppingConnect;
            })
                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            appendLog(`   🔍 동일 카테고리 쇼핑커넥트 글: ${prevPosts.length}개`);
        }
        if (prevPosts.length === 0 && currentCategory) {
            prevPosts = publishedPosts
                .filter((p) => normalizeCategory(p.category || '') === currentCategory)
                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            appendLog(`   🔍 동일 카테고리 전체 글: ${prevPosts.length}개`);
        }
        const prevPost = prevPosts[0];
        if (prevPost) {
            formData.previousPostTitle = prevPost.title;
            formData.previousPostUrl = prevPost.publishedUrl;
            appendLog(`✅ 이전글 자동 매칭 성공: "${prevPost.title}" (카테고리: ${prevPost.category || '없음'})`);
            appendLog(`   👉 이전글 URL: ${formData.previousPostUrl}`);
            modal?.addLog?.(`🔗 이전글 자동 매칭: ${prevPost.title}`);
        }
        else {
            if (!currentCategory) {
                appendLog('⚠️ 현재 카테고리가 설정되지 않았습니다.');
            }
            else {
                appendLog(`⚠️ "${currentCategory}" 카테고리의 이전 발행글을 찾지 못했습니다.`);
            }
        }
    }
}
function emitLog(message, modal, type = 'info') {
    appendLog(message);
    if (modal?.addLog) {
        modal.addLog(message);
    }
}
function resolveImageManagerKeys(imageResults, headings) {
    return imageResults.map((img, idx) => {
        if (img.heading && String(img.heading).trim()) {
            return { img, headingKey: String(img.heading).trim() };
        }
        const origIdx = img.originalIndex;
        if (typeof origIdx === 'number' && origIdx >= 0 && origIdx < headings.length) {
            const h = headings[origIdx];
            const title = typeof h === 'string' ? h : (h?.title || h?.text || '');
            if (title.trim())
                return { img, headingKey: title.trim() };
        }
        return { img, headingKey: `이미지 ${idx + 1}` };
    });
}
function isFatalApiError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    return /\b(402|429|500|503)\b/.test(msg) ||
        msg.includes('openai_credit_required') ||
        msg.includes('too many requests') ||
        msg.includes('rate limit') ||
        msg.includes('internal server error') ||
        msg.includes('service unavailable');
}
function isRetryableImageError(error) {
    if (isFatalApiError(error))
        return false;
    const msg = String(error?.message || error || '').toLowerCase();
    return msg.includes('timeout') || msg.includes('타임아웃') ||
        msg.includes('시간 초과') || msg.includes('timed out') ||
        msg.includes('network') || msg.includes('fetch') ||
        msg.includes('econnrefused') || msg.includes('econnreset') ||
        msg.includes('결과가 비어있음') || msg.includes('결과 없음') ||
        msg.includes('이미지 없이 발행');
}
function friendlyErrorMessage(error) {
    const rawMessage = String(error?.message || error || '');
    const msg = rawMessage.toLowerCase();
    if (/IMAGEFX_BOT_DETECTED|FLOW_BOT_DETECTED|봇감지 의심/i.test(rawMessage)) {
        const body = rawMessage.replace(/^(IMAGEFX_BOT_DETECTED|FLOW_BOT_DETECTED):/, '').trim();
        return body || '⚠️ Google 봇감지 의심입니다. 한도가 아닐 가능성이 큽니다. 다른 이미지 엔진(나노바나나/DeepInfra)으로 전환하거나 Google 계정을 변경해주세요.';
    }
    if (/OPENAI_CREDIT_REQUIRED/i.test(rawMessage) || /\b402\b/.test(msg)) {
        return '💳 OpenAI 크레딧을 확인해주세요. platform.openai.com/billing 에서 크레딧·결제 상태를 확인할 수 있습니다.';
    }
    if (/OPENAI_MODEL_UNAVAILABLE/i.test(rawMessage)) {
        const unavailModel = rawMessage.split('OPENAI_MODEL_UNAVAILABLE:')[1]?.trim() || '선택한 모델';
        return `🚫 "${unavailModel}" 모델에 접근할 수 없습니다. 환경설정 → 이미지 모델에서 다른 모델로 변경해주세요.`;
    }
    if (/429|too many requests|rate limit/i.test(msg)) {
        if (/openai|gpt-image|gpt-4|dall-e/i.test(msg)) {
            try {
                window.showOpenAiTierWarningModal?.('rate-limit-hit');
            }
            catch { }
            return '🚨 OpenAI RPM 한도 도달 (Tier 시스템). 화면 모달의 안내 참고 또는 다른 엔진(Nano Banana 2/ImageFX/DeepInfra)으로 전환하세요.';
        }
        return '⚠️ AI 이미지 생성 할당량이 부족합니다. 잠시 후 다시 시도하거나, 설정에서 할당량을 확인해주세요.';
    }
    if (/500|internal server error/i.test(msg)) {
        return '⚠️ AI 서버가 과부하 상태입니다. 잠시 후 다시 시도해주세요.';
    }
    if (/503|service unavailable/i.test(msg)) {
        return '⚠️ AI 서비스가 현재 점검 중입니다. 잠시 후 다시 시도해주세요.';
    }
    if (/timeout|시간 초과|timed out/i.test(msg)) {
        return '⚠️ 요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.';
    }
    if (/network|fetch|econnrefused/i.test(msg)) {
        return '⚠️ 네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.';
    }
    if (/quota|할당/i.test(msg)) {
        return '⚠️ API 할당량이 초과되었습니다. 설정에서 할당량을 확인해주세요.';
    }
    return `⚠️ 오류가 발생했습니다: ${error?.message || String(error)}`;
}
async function executeFullAutoFlow(formData) {
    formData = createPipelineFormDataSnapshot('full-auto', formData || {});
    const isContinuousInvocation = window.isContinuousMode === true;
    if (!isContinuousInvocation) {
        window.stopFullAutoPublish = false;
    }
    const modal = resolveFullAutoProgressModal(window.currentProgressModal, isContinuousInvocation);
    const checkShouldStop = () => {
        if (isFullAutoStopRequested(modal)) {
            appendLog('⏹️ 사용자가 작업을 취소했습니다.');
            throw new Error('사용자가 작업을 취소했습니다.');
        }
    };
    try {
        checkShouldStop();
        if (formData.contentMode === 'image-narrative') {
            await publishWithImageNarrative(formData);
            return;
        }
        const hasPreGeneratedImages = Array.isArray(formData.imageManagementImages)
            && formData.imageManagementImages.length > 0;
        if (hasPreGeneratedImages) {
            console.log(`[FullAuto] ♻️ formData.imageManagementImages ${formData.imageManagementImages.length}장 감지 → ImageManager 초기화 스킵 (중복 생성 방지)`);
            try {
                ImageManager.clearAll();
                const batchEntries = formData.imageManagementImages.map((img) => ({
                    headingTitle: img.heading || 'thumbnail',
                    image: img,
                }));
                if (typeof ImageManager.addImagesBatch === 'function') {
                    ImageManager.addImagesBatch(batchEntries);
                }
                else {
                    batchEntries.forEach((e) => ImageManager.addImage(e.headingTitle, e.image));
                }
                generatedImages = [...formData.imageManagementImages];
                window.generatedImages = generatedImages;
                console.log(`[FullAuto] ♻️ ImageManager 배치 재주입 완료 (${generatedImages.length}장, sync 1회)`);
            }
            catch (reuseErr) {
                console.error('[FullAuto] 이미지 재주입 실패:', reuseErr);
            }
        }
        else {
            try {
                ImageManager.clearAll();
                generatedImages = [];
                window.generatedImages = [];
                console.log('[FullAuto] ✅ ImageManager/generatedImages 초기화 완료 (이전 이미지 잔존 방지)');
            }
            catch (clearErr) {
                console.error('[FullAuto] ImageManager 초기화 실패:', clearErr);
            }
        }
        const retryContentForImageOnly = getFullAutoContentRetryCache(formData);
        try {
            const prevTitleInput = document.getElementById('unified-generated-title');
            if (prevTitleInput)
                prevTitleInput.value = '';
            const prevTitleInput2 = document.getElementById('unified-title');
            if (prevTitleInput2)
                prevTitleInput2.value = '';
        }
        catch { }
        formData.title = '';
        if (!formData.structuredContent && retryContentForImageOnly) {
            formData.structuredContent = retryContentForImageOnly;
            formData._contentAlreadyGenerated = true;
            formData.imageManagementImages = [];
            appendLog('♻️ 이전 글 생성 결과를 재사용하고 이미지 생성만 다시 진행합니다.');
        }
        let structuredContent = formData.structuredContent;
        if (structuredContent && structuredContent.headings && structuredContent.headings.length > 0) {
            appendLog('📝 기존 생성된 콘텐츠를 사용합니다.');
            console.log('[FullAuto] 기존 콘텐츠 재사용 - 소제목 개수:', structuredContent.headings.length);
            const titleInput = document.getElementById('unified-generated-title');
            const currentUITitle = titleInput?.value?.trim() || '';
            const existingSelectedTitle = structuredContent.selectedTitle?.trim() || '';
            const contentMode = formData.contentMode || formData.styleOptions?.contentMode || 'seo';
            const _rawTitle = String(structuredContent.title || '').trim();
            const _titleIsUrl = /^https?:\/\//i.test(_rawTitle);
            const productName = String(structuredContent.productInfo?.name || (_titleIsUrl ? '' : _rawTitle) || '').trim();
            if (contentMode === 'affiliate' && productName && existingSelectedTitle) {
                const normalizedTitle = existingSelectedTitle.replace(/[^\w가-힣]/g, '').toLowerCase();
                const normalizedProduct = productName.replace(/[^\w가-힣]/g, '').toLowerCase();
                const isTitleSameAsProduct = normalizedTitle === normalizedProduct ||
                    normalizedTitle.includes(normalizedProduct) ||
                    normalizedProduct.includes(normalizedTitle);
                if (isTitleSameAsProduct) {
                    console.warn(`[FullAuto] ⚠️ 쇼핑커넥트: 제목이 상품명과 유사함 - contentGenerator 패치 확인 필요`);
                    console.warn(`[FullAuto]    - 현재 제목: "${existingSelectedTitle.substring(0, 50)}..."`);
                    console.warn(`[FullAuto]    - 상품명: "${productName.substring(0, 50)}..."`);
                }
            }
            const _kwLockEarly = window._keywordTitleOptions?.useKeywordAsTitle === true
                || structuredContent?.keywordAsTitleLocked === true
                || structuredContent?.manualTitleLocked === true;
            if (_kwLockEarly && existingSelectedTitle) {
                console.log(`[FullAuto] 🔒 keywordAsTitle lock 활성 — UI 제목 패치 skip. existingSelectedTitle="${existingSelectedTitle.substring(0, 40)}..." 보존`);
            }
            else if (currentUITitle && currentUITitle !== existingSelectedTitle) {
                structuredContent.selectedTitle = currentUITitle;
                console.log(`[FullAuto] ✅ 제목 패치: UI 제목 사용 → "${currentUITitle.substring(0, 40)}..."`);
                appendLog(`📝 제목 패치 적용: ${currentUITitle.substring(0, 30)}...`);
            }
            else if (!existingSelectedTitle && structuredContent.title) {
                const _titleVal = String(structuredContent.title || '').trim();
                if (!/^https?:\/\//i.test(_titleVal)) {
                    structuredContent.selectedTitle = structuredContent.title;
                    console.log(`[FullAuto] ⚠️ selectedTitle 없음 → title 사용: "${structuredContent.title?.substring(0, 40)}..."`);
                }
                else {
                    console.warn(`[FullAuto] ⚠️ title이 URL이므로 selectedTitle에 복사하지 않음: "${_titleVal.substring(0, 60)}"`);
                }
            }
        }
        else {
            appendLog('📝 콘텐츠 생성 중...');
            await yieldToUI();
            structuredContent = await generateFullAutoContent(formData);
            checkShouldStop();
        }
        if (!structuredContent) {
            throw new Error('콘텐츠 생성에 실패했습니다.');
        }
        applyManualTitleOverride(structuredContent, getManualTitleOverride(formData));
        await yieldToUI();
        await displayContentInAllTabs(structuredContent);
        const newTitle = structuredContent.selectedTitle || structuredContent.title || '';
        if (newTitle && !/^https?:\/\//i.test(newTitle.trim())) {
            const titleInput = document.getElementById('unified-generated-title');
            if (titleInput)
                titleInput.value = newTitle;
            formData.title = newTitle;
        }
        await yieldToUI();
        currentStructuredContent = structuredContent;
        window.currentStructuredContent = structuredContent;
        saveFullAutoContentRetryCache(formData, structuredContent);
        const postId = saveGeneratedPost(structuredContent, false, { category: formData.category || formData.categoryName });
        if (postId) {
            currentPostId = postId;
        }
        await yieldToUI();
        let finalImages = [];
        const imageManagerImages = ImageManager.getAllImages();
        if (imageManagerImages && imageManagerImages.length > 0) {
            finalImages = imageManagerImages;
            appendLog(`🖼️ ImageManager에서 ${finalImages.length}개의 이미지를 가져왔습니다.`);
        }
        await yieldToUI();
        if (finalImages.length === 0 && generatedImages && generatedImages.length > 0) {
            finalImages = generatedImages;
            appendLog(`🖼️ 전역 generatedImages에서 ${finalImages.length}개의 이미지를 가져왔습니다.`);
        }
        if (finalImages.length === 0 && Array.isArray(formData.imageManagementImages) && formData.imageManagementImages.length > 0) {
            finalImages = [...formData.imageManagementImages];
            appendLog(`♻️ formData에서 이미 생성된 이미지 ${finalImages.length}개 재사용 (중복 방지)`);
            console.log('[FullAuto] ♻️ formData.imageManagementImages 경로로 복구');
        }
        await yieldToUI();
        const scSubImageMode = formData.scSubImageMode;
        const isCollectedMode = formData.contentMode === 'affiliate' && scSubImageMode === 'collected';
        if (isCollectedMode && finalImages.length === 0) {
            const collectedFromContent = structuredContent.collectedImages || structuredContent.images || formData.collectedImages || [];
            if (collectedFromContent.length > 0) {
                const seenUrls = new Set();
                const uniqueImages = [];
                for (const img of collectedFromContent) {
                    const imgUrl = img.url || img.filePath || (typeof img === 'string' ? img : '');
                    if (!imgUrl)
                        continue;
                    const baseUrl = imgUrl.split('?')[0].split('#')[0];
                    if (seenUrls.has(baseUrl)) {
                        console.log(`[FullAuto] 🔄 중복 이미지 스킵: ${baseUrl.substring(0, 50)}...`);
                        continue;
                    }
                    seenUrls.add(baseUrl);
                    uniqueImages.push(img);
                }
                console.log(`[FullAuto] 🧹 중복 필터링: ${collectedFromContent.length}개 → ${uniqueImages.length}개`);
                const headingsCount = structuredContent.headings?.length || 0;
                const requiredImageCount = headingsCount + 1;
                console.log(`[FullAuto] 📊 필요 이미지: ${requiredImageCount}개 (썸네일 1 + 소제목 ${headingsCount}개), 수집: ${uniqueImages.length}개`);
                if (uniqueImages.length < 2) {
                    console.log(`[FullAuto] ⚠️ 이미지 부족! 썸네일만 사용, 소제목 이미지 생략`);
                    finalImages = uniqueImages.length > 0 ? [{
                            heading: '썸네일',
                            filePath: uniqueImages[0].url || uniqueImages[0].filePath || uniqueImages[0],
                            url: uniqueImages[0].url || uniqueImages[0].filePath || uniqueImages[0],
                            provider: 'collected',
                            source: 'smartstore',
                            isThumbnail: true
                        }] : [];
                }
                else {
                    const thumbnailImage = uniqueImages[0];
                    const thumbnailUrl = thumbnailImage.url || thumbnailImage.filePath || thumbnailImage;
                    finalImages = [{
                            heading: '썸네일',
                            filePath: thumbnailUrl,
                            url: thumbnailUrl,
                            provider: 'collected',
                            source: 'smartstore',
                            isThumbnail: true
                        }];
                    const headingsCount = structuredContent.headings?.length || 0;
                    for (let i = 0; i < headingsCount && (i + 1) < uniqueImages.length; i++) {
                        const headingImg = uniqueImages[i + 1];
                        const headingTitle = structuredContent.headings[i]?.title || `소제목 ${i + 1}`;
                        const imgUrl = headingImg.url || headingImg.filePath || headingImg;
                        if (imgUrl.split('?')[0] === thumbnailUrl.split('?')[0]) {
                            console.log(`[FullAuto] ⚠️ ${headingTitle}: 썸네일과 동일한 이미지 스킵!`);
                            continue;
                        }
                        finalImages.push({
                            heading: headingTitle,
                            filePath: imgUrl,
                            url: imgUrl,
                            provider: 'collected',
                            source: 'smartstore',
                            isThumbnail: false
                        });
                    }
                    console.log(`[FullAuto] ✅ 이미지 할당 완료: 썸네일 1개 + 소제목 ${finalImages.length - 1}개`);
                }
                appendLog(`✅ 수집된 제품 이미지 ${finalImages.length}개를 사용합니다. (중복 ${collectedFromContent.length - uniqueImages.length}개 제거)`);
                console.log(`[FullAuto] ✅ 수집 이미지 모드: finalImages ${finalImages.length}개 사용`);
                finalImages.forEach((img) => {
                    if (img.heading && img.heading !== '썸네일') {
                        ImageManager.addImage(img.heading, {
                            filePath: img.filePath || img.url,
                            provider: 'collected',
                            url: img.url || img.filePath
                        });
                    }
                });
                // [SPEC-STABILITY-2026 R5] The thumbnail was explicitly skipped
                // above, so the image-management grid's first slot stayed empty
                // in full-auto (S5). Register it under the dedicated key, and
                // persist web URLs locally first — remote srcs 403/CORS in the
                // grid.
                const thumbEntry = finalImages.find((img) => img.isThumbnail);
                if (thumbEntry) {
                    let thumbPath = getFullAutoImagePath(thumbEntry);
                    if (/^https?:\/\//i.test(thumbPath)) {
                        try {
                            const saved = await (window as any).api?.downloadAndSaveImage?.(
                                thumbPath, '🖼️ 썸네일', structuredContent.selectedTitle || ''
                            );
                            if (saved?.success && saved.filePath) {
                                thumbPath = saved.filePath;
                                console.log(`[FullAuto] 🖼️ 썸네일 로컬 저장 완료: ${thumbPath}`);
                            }
                        } catch (thumbSaveErr) {
                            console.warn('[FullAuto] 썸네일 로컬 저장 실패 (웹 URL 유지):', (thumbSaveErr as Error)?.message);
                        }
                    }
                    ImageManager.setImage('🖼️ 썸네일', {
                        filePath: thumbPath,
                        savedToLocal: thumbEntry.savedToLocal || thumbPath,
                        url: thumbEntry.url || thumbPath,
                        previewDataUrl: thumbEntry.previewDataUrl,
                        provider: thumbEntry.provider || 'collected',
                        heading: '🖼️ 썸네일',
                        isThumbnail: true
                    });
                    window.thumbnailPath = thumbPath;
                    formData.thumbnailPath = thumbPath;
                }
                ImageManager.syncGeneratedImagesArray();
                console.log(`[FullAuto] ImageManager에 수집 이미지 ${finalImages.length}개 등록 완료 (썸네일 ${thumbEntry ? '포함' : '없음'})`);
            }
        }
        if (isCollectedMode && finalImages.length === 0) {
            modal?.addLog('⚠️ 수집 이미지 모드가 선택되었으나 이미지가 없어 발행을 중단합니다.');
            appendLog('⚠️ 수집 이미지 없음 - 이미지 없이 발행하지 않고 중단합니다.');
            throw new Error('수집 이미지 모드에 사용할 이미지가 없습니다.');
        }
        else if (finalImages.length === 0 && !formData.skipImages && formData.imageSource && formData.imageSource !== 'skip') {
            const _sourceNames = {
                'pollinations': 'Pollinations (FLUX, 무료)',
                'nano-banana-pro': '나노 바나나 프로 (Gemini Native)',
                'prodia': 'Prodia',
                'stability': 'Stability AI',
                'deepinfra': 'DeepInfra FLUX-2',
                'deepinfra-flux': 'DeepInfra FLUX-2',
                'falai': 'Fal.ai FLUX',
                'naver-search': '네이버 이미지 검색',
                'naver': '네이버 이미지 검색',
            };
            const _friendlySource = _sourceNames[formData.imageSource] || formData.imageSource;
            appendLog(`🖼️ 이미지 생성 시작 (엔진: ${_friendlySource})...`);
            modal?.addLog(`🖼️ ${_friendlySource}로 이미지 생성 중...`);
            modal?.setProgress(35, '이미지 생성 중...');
            const headingsForPreview = structuredContent.headings || [];
            if (headingsForPreview.length > 0) {
                const placeholderImages = headingsForPreview.map((h, idx) => ({
                    heading: String(h.title || h.text || `이미지 ${idx + 1}`).trim(),
                    url: '',
                    isPlaceholder: true
                }));
                modal?.showImages(placeholderImages, `🎨 이미지 생성 중... (${_friendlySource})`);
            }
            const originalProvider = formData.imageSource;
            const IMAGE_GEN_MAX_RETRIES = getFullAutoImageMaxAttempts(originalProvider);
            let imageGenSuccess = false;
            const imageGenerationStartedAt = Date.now();
            const getRemainingImageBudgetMs = () => Math.max(0, getFullAutoTotalImageBudgetMs(originalProvider) - (Date.now() - imageGenerationStartedAt));
            const getBoundedImageTimeoutMs = (maxMs) => {
                const remainingMs = getRemainingImageBudgetMs();
                if (remainingMs <= 30000) {
                    throw new Error('이미지 생성 전체 제한 시간 초과');
                }
                return Math.min(maxMs, remainingMs);
            };
            const isImageBudgetError = (error) => String(error?.message || '').includes('이미지 생성 전체 제한 시간 초과');
            const getProviderForAttempt = (attempt) => {
                void attempt;
                return originalProvider;
            };
            const RETRY_DELAYS = [0, 8, 12];
            for (let imageAttempt = 1; imageAttempt <= IMAGE_GEN_MAX_RETRIES && !imageGenSuccess; imageAttempt++) {
                checkShouldStop();
                const currentProvider = getProviderForAttempt(imageAttempt);
                try {
                    if (imageAttempt > 1) {
                        const retryWaitSec = RETRY_DELAYS[imageAttempt - 1] || 12;
                        const providerChanged = currentProvider !== originalProvider;
                        const providerMsg = providerChanged ? ` (엔진 변경: ${currentProvider})` : '';
                        appendLog(`🔄 이미지 생성 재시도 (${imageAttempt}/${IMAGE_GEN_MAX_RETRIES})${providerMsg}, ${retryWaitSec}초 대기 중...`);
                        modal?.addLog(`🔄 재시도 ${imageAttempt}/${IMAGE_GEN_MAX_RETRIES}${providerMsg}`);
                        modal?.setProgress(33, `이미지 재시도 대기 중... (${retryWaitSec}초)`);
                        const _waitEnd = Date.now() + retryWaitSec * 1000;
                        while (Date.now() < _waitEnd) {
                            checkShouldStop();
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                    const headings = structuredContent.headings || [];
                    const _rawFullAutoTitle = structuredContent.selectedTitle || structuredContent.title || '';
                    const fullAutoTitle = /^https?:\/\//i.test(String(_rawFullAutoTitle)) ? '' : _rawFullAutoTitle;
                    let referenceImagePath = '';
                    const collectedImgs = window.imageManagementGeneratedImages || window.generatedImages || [];
                    if (collectedImgs.length > 0) {
                        referenceImagePath = collectedImgs[0].filePath || collectedImgs[0].url;
                    }
                    // [Phase 7.1-d] formData snapshot first (set by flow entry); raw
                    // accessor fallback covers callers that do not populate it
                    // (image-narrative paths) — behavior unchanged.
                    const _headingImageModeForThumb = formData.headingImageMode;
                    let dedicatedThumbnailImage = null;
                    if (_headingImageModeForThumb === 'none') {
                        console.log('[FullAuto] 🚫 headingImageMode=none: 전용 썸네일 생성도 건너뜁니다.');
                        appendLog('🚫 이미지 없이 모드: 썸네일 포함 모든 이미지 생성 건너뛰기');
                    }
                    else
                        try {
                            const thumbnailAllowText = !!formData.includeThumbnailText;
                            const thumbImageStyle = formData.imageStyle;
                            let thumbnailPrompt;
                            try {
                                const aiTranslated = await generateEnglishPromptForHeading(fullAutoTitle, formData.keywords, thumbImageStyle);
                                thumbnailPrompt = aiTranslated;
                                appendLog(`🎨 AI 썸네일 프롬프트: "${aiTranslated.substring(0, 60)}..."`);
                            }
                            catch {
                                thumbnailPrompt = `eye-catching blog thumbnail, visual metaphor for: ${fullAutoTitle}, cinematic lighting, compelling composition, hero image style`;
                                appendLog(`⚠️ AI 썸네일 프롬프트 생성 실패 → 기본 프롬프트 사용`);
                            }
                            appendLog(`🖼️ [풀오토] 전용 썸네일 별도 생성 중... (엔진: ${currentProvider})`);
                            modal?.addLog(`🖼️ 전용 썸네일 생성 시작... (${currentProvider})`);
                            const thumbResult = await generateImagesWithCostSafety({
                                provider: currentProvider,
                                items: [{
                                        heading: fullAutoTitle || '블로그 썸네일',
                                        prompt: thumbnailPrompt,
                                        englishPrompt: thumbnailPrompt,
                                        isThumbnail: true,
                                        allowText: thumbnailAllowText,
                                    }],
                                postTitle: fullAutoTitle,
                                isFullAuto: true,
                                longRunImageGeneration: true,
                                isContinuousMode: !!isContinuousMode,
                                category: formData.category || formData.categoryName || '',
                                referenceImagePath,
                                imageRatio: formData.thumbnailImageRatio || formData.imageRatio,
                                thumbnailTextInclude: thumbnailAllowText,
                                imageGenerationTimeoutMs: getBoundedImageTimeoutMs(getFullAutoThumbnailImageTimeoutMs(currentProvider)),
                            });
                            if (thumbResult?.success && thumbResult.images && thumbResult.images.length > 0) {
                                dedicatedThumbnailImage = registerFullAutoThumbnailImage(thumbResult.images[0], currentProvider, formData, fullAutoTitle || '블로그 썸네일');
                                appendLog(`✅ [풀오토] 전용 썸네일 생성 완료!`);
                                modal?.addLog(`✅ 전용 썸네일 생성 완료`);
                            }
                            else {
                                appendLog(`⚠️ [풀오토] 전용 썸네일 생성 실패 → 썸네일 없이 진행`);
                            }
                        }
                        catch (thumbErr) {
                            appendLog(`⚠️ [풀오토] 전용 썸네일 생성 오류: ${thumbErr.message}`);
                        }
                    const imageResult = await generateImagesWithCostSafety({
                        provider: currentProvider,
                        title: fullAutoTitle,
                        items: (() => {
                            const allItems = headings.map((h, idx) => {
                                const title = String(h.title || h.text || (typeof h === 'string' ? h : '')).trim();
                                const prompt = String(h.imagePrompt || h.prompt || title || 'Abstract Image').trim();
                                return {
                                    heading: title || '이미지',
                                    prompt: prompt,
                                    englishPrompt: prompt,
                                    isThumbnail: false,
                                    allowText: false
                                };
                            }).filter(Boolean);
                            // formData carries the live checkbox state for single
                            // full-auto; headingImageMode covers every other flow.
                            const isThumbnailOnly = formData.thumbnailOnly === true || formData.headingImageMode === 'thumbnail-only';
                            if (isThumbnailOnly) {
                                console.log('[FullAuto] 📷 썸네일만 생성 모드: 소제목 이미지 없이 전용 썸네일만 사용');
                                return [];
                            }
                            return allItems;
                        })(),
                        category: formData.category || formData.categoryName || '',
                        referenceImagePath,
                        imageRatio: formData.subheadingImageRatio || formData.imageRatio,
                        thumbnailTextInclude: false,
                        longRunImageGeneration: true,
                        isContinuousMode: !!isContinuousMode,
                        imageGenerationTimeoutMs: getBoundedImageTimeoutMs(getFullAutoBodyImageTimeoutMs(currentProvider, headings.length)),
                    });
                    if (imageResult?.success && imageResult.images && imageResult.images.length > 0) {
                        const normalizedBodyImages = imageResult.images.map((img) => normalizeFullAutoImageForPipeline(img, { isThumbnail: false }));
                        finalImages = [
                            ...(dedicatedThumbnailImage ? [dedicatedThumbnailImage] : []),
                            ...normalizedBodyImages,
                        ];
                        resolveImageManagerKeys(normalizedBodyImages, headings).forEach(({ img, headingKey }) => {
                            const imagePath = getFullAutoImagePath(img);
                            ImageManager.addImage(headingKey, {
                                ...img,
                                filePath: imagePath,
                                savedToLocal: img.savedToLocal || imagePath,
                                provider: img.provider || currentProvider,
                                url: img.url || imagePath,
                                previewDataUrl: img.previewDataUrl
                            });
                        });
                        if (dedicatedThumbnailImage) {
                            registerFullAutoThumbnailImage(dedicatedThumbnailImage, currentProvider, formData, fullAutoTitle || '블로그 썸네일');
                        }
                        ImageManager.syncGeneratedImagesArray?.();
                        appendLog(`✅ ${finalImages.length}개의 이미지 생성 완료! (썸네일 ${dedicatedThumbnailImage ? '포함' : '미포함'}, 엔진: ${currentProvider})`);
                        modal?.addLog(`✅ 이미지 ${finalImages.length}개 생성 완료`);
                        imageGenSuccess = true;
                    }
                    else if (dedicatedThumbnailImage) {
                        void dedicatedThumbnailImage;
                        throw new Error('소제목 이미지 생성 결과가 비어있습니다. 썸네일만으로 발행하지 않고 중단합니다.');
                    }
                    else {
                        throw new Error('이미지 생성 결과가 비어있음');
                    }
                }
                catch (imgError) {
                    console.warn(`[FullAuto] 이미지 생성 오류 (시도 ${imageAttempt}/${IMAGE_GEN_MAX_RETRIES}, 엔진: ${currentProvider}):`, imgError.message || imgError);
                    if (isImageBudgetError(imgError)) {
                        appendLog('⏱️ 이미지 생성 제한 시간이 지나 발행을 중단합니다.');
                        modal?.addLog('⏱️ 이미지 제한 시간 초과, 발행 중단');
                        throw imgError;
                    }
                    if (isFatalApiError(imgError)) {
                        if (imageAttempt >= IMAGE_GEN_MAX_RETRIES) {
                            emitLog(`${friendlyErrorMessage(imgError)} 이미지 없이 발행하지 않고 중단합니다.`, modal, 'warn');
                            throw imgError;
                        }
                        appendLog(`⚠️ ${currentProvider} API 에러 (${imgError.message}), 다른 엔진으로 재시도...`);
                        modal?.addLog(`⚠️ API 에러 → 엔진 교체 재시도`);
                        continue;
                    }
                    if (imageAttempt < IMAGE_GEN_MAX_RETRIES) {
                        const nextProvider = getProviderForAttempt(imageAttempt + 1);
                        const switchMsg = nextProvider !== currentProvider ? ` → 엔진 변경: ${nextProvider}` : '';
                        appendLog(`⚠️ 이미지 생성 실패 (${imageAttempt}/${IMAGE_GEN_MAX_RETRIES}): ${imgError.message}`);
                        appendLog(`🔄 자동 재시도합니다...${switchMsg}`);
                        modal?.addLog(`⚠️ 실패 ${imageAttempt}/${IMAGE_GEN_MAX_RETRIES}, 재시도 중...`);
                        continue;
                    }
                    appendLog(`❌ ${IMAGE_GEN_MAX_RETRIES}회 모두 실패. 이미지 없이 발행하지 않고 중단합니다.`);
                    emitLog(`${friendlyErrorMessage(imgError)} ${IMAGE_GEN_MAX_RETRIES}회 재시도 후에도 실패하여 발행을 중단합니다.`, modal, 'warn');
                    throw imgError;
                }
            }
        }
        else if (finalImages.length === 0 && formData.skipImages) {
            appendLog('ℹ️ 이미지 건너뛰기 옵션이 선택되어 이미지 없이 발행합니다.');
            modal?.addLog('ℹ️ 이미지 건너뛰기');
        }
        await yieldToUI();
        checkShouldStop();
        if (finalImages.length > 0) {
            appendLog(`✅ 총 ${finalImages.length}개의 이미지를 발행에 사용합니다.`);
            finalImages.forEach((img, idx) => {
                const provider = img.provider || 'unknown';
                const heading = img.heading || '제목 없음';
                appendLog(`   [${idx + 1}] ${heading} (${provider})`);
            });
            const imageSource = UnifiedDOMCache.getImageSource();
            const imageTitle = imageSource === 'collected' ? '📷 수집된 이미지' : '🎨 생성된 이미지';
            modal?.showImages(finalImages, imageTitle);
        }
        await yieldToUI();
        if (structuredContent.headings && structuredContent.headings.length > 0) {
            appendLog('✅ 이미지 준비 완료! 바로 발행을 진행합니다.');
            updateUnifiedImagePreview(structuredContent.headings, finalImages);
        }
        await yieldToUI();
        if (formData.useAffiliateVideo && finalImages.length >= 2) {
            const hookingImage = finalImages[1];
            const hookingHeading = structuredContent.headings?.[1]?.title || structuredContent.headings?.[1]?.text || '후킹 영상';
            const hookingImagePath = hookingImage?.filePath || '';
            const normalizedHeading = normalizeHeadingKeyForVideoCache(String(hookingHeading).trim());
            const existingVideo = typeof window.api?.getAppliedVideo === 'function'
                ? await window.api.getAppliedVideo(normalizedHeading)
                : null;
            if (existingVideo?.filePath) {
                appendLog(`ℹ️ 이미 영상이 배치되어 있습니다: "${hookingHeading}". 기존 영상을 사용합니다.`);
                modal?.addLog('ℹ️ 기존 영상 재사용');
            }
            else if (hookingImagePath) {
                appendLog(`🎬 [쇼핑커넥트] 후킹 이미지 영상 변환 시작: "${hookingHeading}"`);
                appendLog('   📐 비율: 1:1 (정사각형, 피드 꽉찬 표시)');
                modal?.addLog('🎬 후킹 영상 생성 중...');
                modal?.setProgress(52, '후킹 영상 생성 중...');
                try {
                    let videoResult = null;
                    const startTime = Date.now();
                    const VEO_TIMEOUT_MS = 120000;
                    if (typeof window.api?.generateVeoVideo === 'function') {
                        const veoPrompt = `Cinematic product reveal video. The ${hookingHeading} dramatically fills the entire square frame. Slow zoom in with professional studio lighting. Luxurious and premium feel. High contrast, vivid colors. Center-focused composition for maximum visual impact on social media feed.`;
                        appendLog('   ⏳ Veo 영상 생성 요청 중... (최대 2~3분 소요)');
                        videoResult = await window.api.generateVeoVideo({
                            prompt: veoPrompt,
                            model: 'veo-3.1-generate-preview',
                            durationSeconds: 6,
                            aspectRatio: '1:1',
                            negativePrompt: 'audio, speech, voice, voiceover, narration, music, singing, lyrics, dialogue, text, watermark, logo',
                            imagePath: hookingImagePath,
                            heading: String(hookingHeading).trim(),
                        });
                        const elapsedMs = Date.now() - startTime;
                        if (elapsedMs > VEO_TIMEOUT_MS && !videoResult?.success) {
                            appendLog('   ⏰ Veo 생성이 오래 걸리고 있습니다. KenBurns로 빠르게 전환합니다.');
                        }
                    }
                    if (!videoResult?.success) {
                        appendLog(`⚠️ Veo 영상 생성 실패, KenBurns로 폴백: ${videoResult?.message || 'unknown'}`);
                        modal?.addLog('🔄 KenBurns 폴백 생성 중...');
                        if (typeof window.api?.createKenBurnsVideo === 'function') {
                            videoResult = await window.api.createKenBurnsVideo({
                                imagePath: hookingImagePath,
                                heading: String(hookingHeading).trim(),
                                durationSeconds: 6,
                                aspectRatio: '1:1',
                            });
                        }
                    }
                    if (videoResult?.success && videoResult?.filePath) {
                        appendLog(`✅ 후킹 영상 생성 완료: ${videoResult.filePath}`);
                        appendLog('   📐 1:1 정사각형 비율로 피드에서 꽉차게 표시됩니다.');
                        modal?.addLog('✅ 후킹 영상 생성 완료');
                        if (typeof window.api?.applyHeadingVideo === 'function') {
                            await window.api.applyHeadingVideo(String(hookingHeading).trim(), {
                                provider: videoResult.filePath?.includes('veo') ? 'veo' : 'kenburns',
                                filePath: videoResult.filePath,
                                previewDataUrl: '',
                                updatedAt: Date.now(),
                            });
                        }
                    }
                    else {
                        appendLog(`⚠️ 후킹 영상 생성 실패: ${videoResult?.message || '알 수 없는 오류'}. 영상 없이 진행합니다.`);
                        modal?.addLog('⚠️ 후킹 영상 생성 실패, 계속 진행');
                    }
                }
                catch (videoError) {
                    console.error('[FullAuto] 후킹 영상 생성 오류:', videoError);
                    appendLog(`⚠️ 후킹 영상 생성 중 오류: ${videoError.message}. 영상 없이 진행합니다.`);
                    modal?.addLog('⚠️ 후킹 영상 오류, 계속 진행');
                }
                await yieldToUI();
            }
            else {
                appendLog('⚠️ 후킹 이미지 경로가 없어 영상 변환을 건너뜁니다.');
            }
        }
        modal?.setStep(2, 'completed', '완료');
        modal?.setProgress(55, '네이버 로그인 준비 중...');
        modal?.addLog(`✅ 이미지 ${finalImages.length}개 준비 완료`);
        modal?.setStep(3, 'active', '로그인 중...');
        checkShouldStop();
        try {
            autoLinkPreviousPost(formData, modal);
        }
        catch (linkError) {
            // Previous-post lookup is optional enrichment. Corrupt or migrated
            // local history must never block login after images are ready.
            console.warn('[FullAuto] previous-post lookup failed; continuing publish:', linkError);
            appendLog('⚠️ 이전글 자동 연결을 건너뛰고 네이버 발행을 계속합니다.');
            modal?.addLog?.('⚠️ 이전글 연결 건너뜀 — 발행 계속');
        }
        const automationResult = await executeBlogPublishing(structuredContent, finalImages, formData);
        if (currentPostId && automationResult?.success) {
            const publishedUrl = automationResult.url || automationResult.postUrl || automationResult.blogUrl;
            if (publishedUrl) {
                updatePostAfterPublish(currentPostId, publishedUrl, formData.publishMode);
            }
            updatePostImages(currentPostId, finalImages);
        }
        modal?.setStep(3, 'completed', '완료');
        modal?.setStep(4, 'completed', '완료');
        modal?.setProgress(100, '발행 완료!');
        modal?.addLog('✅ 블로그 발행 완료!');
        showUnifiedProgress(100, '발행 완료!', '모든 작업이 완료되었습니다.');
        try {
            stopAutosave();
            stopAutoBackup();
            clearAutosavedContent();
            appendLog('💾 임시 저장 데이터 삭제 완료');
        }
        catch (e) {
            console.error('[FullAutoFlow] 임시 데이터 정리 중 오류:', e);
        }
        if (automationResult?.success) {
            clearFullAutoContentRetryCache();
            setTimeout(() => {
                try {
                    resetAllFields();
                    hideUnifiedProgress();
                }
                catch (e) {
                    console.error('[FullAutoFlow] 필드 초기화 중 오류:', e);
                }
            }, 3000);
        }
        else {
            console.log('[FullAutoFlow] ⚠️ 발행 결과가 성공이 아니므로 콘텐츠/이미지 보존 (재시도 가능)');
            try {
                resetPublishing();
            }
            catch (e) { }
        }
        return automationResult;
    }
    catch (error) {
        console.error('[FullAutoFlow] 오류:', error);
        try {
            resetPublishing();
        }
        catch (e) {
            console.warn('[FullAutoFlow] resetPublishing 오류:', e);
        }
        try {
            hideUnifiedProgress();
        }
        catch (e) { }
        throw error;
    }
}
async function executeSemiAutoFlow(formData) {
    formData = createPipelineFormDataSnapshot('full-auto', formData || {});
    formData._semiAutoMode = true;
    const isContinuousInvocation = window.isContinuousMode === true;
    if (!isContinuousInvocation) {
        window.stopFullAutoPublish = false;
    }
    const checkSemiAutoStop = () => {
        if (window.stopFullAutoPublish === true) {
            appendLog('⏹️ 사용자가 작업을 취소했습니다.');
            throw new Error('사용자가 작업을 취소했습니다.');
        }
    };
    try {
        appendLog('🔧 반자동 모드: 수동 콘텐츠 기반 자동화 시작');
        showUnifiedProgress(5, '수동 콘텐츠 처리 시작', '입력된 콘텐츠를 분석하고 있습니다.');
        const imageTabPreset = applyPresetThumbnailIfExists('image-tab');
        if (imageTabPreset.applied) {
            appendLog('🎨 미리 세팅된 썸네일이 복원됩니다!');
            const firstHeadingTitle = resolveFirstHeadingTitleForThumbnail();
            if (firstHeadingTitle && imageTabPreset.forHeading) {
                imageTabPreset.forHeading.heading = firstHeadingTitle;
                ImageManager.setImage(firstHeadingTitle, imageTabPreset.forHeading);
                if (!formData.imageManagementImages || formData.imageManagementImages.length === 0) {
                    formData.imageManagementImages = [imageTabPreset.forHeading];
                }
                else {
                    formData.imageManagementImages[0] = imageTabPreset.forHeading;
                }
                if (imageTabPreset.forThumbnail) {
                    window.thumbnailPath = imageTabPreset.forThumbnail;
                    formData.thumbnailPath = imageTabPreset.forThumbnail;
                }
            }
        }
        const structuredContent = formData.structuredContent || {
            selectedTitle: formData.title,
            bodyPlain: formData.content,
            content: formData.content,
            hashtags: formData.hashtags,
            headings: formData.structuredContent?.headings || []
        };
        if (structuredContent.headings && structuredContent.headings.length > 0) {
            appendLog(`📑 소제목 ${structuredContent.headings.length}개가 포함되어 있습니다.`);
        }
        updateUnifiedPreview(structuredContent);
        showUnifiedProgress(30, '콘텐츠 준비 완료', '수동 입력 콘텐츠가 준비되었습니다.');
        appendLog('✅ 콘텐츠 준비 완료');
        let generatedImagesForPublish = [];
        console.log('[SemiAuto] formData.imageManagementImages:', formData.imageManagementImages);
        console.log('[SemiAuto] imageManagementImages.length:', formData.imageManagementImages?.length);
        console.log('[SemiAuto] skipImages:', formData.skipImages);
        const hasImageManagementData = Array.isArray(formData.imageManagementImages);
        const isExplicitImageManagement = isExplicitImageManagementSource(formData);
        if (hasImageManagementData && formData.imageManagementImages.length > 0) {
            showUnifiedProgress(50, '이미지 준비 완료', `이미지 관리 탭에서 생성한 ${formData.imageManagementImages.length}개의 이미지를 사용합니다.`);
            appendLog(`✅ 이미지 관리 탭에서 생성한 ${formData.imageManagementImages.length}개의 이미지를 사용합니다.`);
            generatedImagesForPublish = [...formData.imageManagementImages];
            showUnifiedProgress(60, '이미지 준비 완료', '이미지가 준비되었습니다.');
            appendLog('✅ 이미지 준비 완료!');
        }
        else if (hasImageManagementData && formData.imageManagementImages.length === 0 && isExplicitImageManagement) {
            formData.skipImages = true;
            showUnifiedProgress(50, '이미지 없이 발행', '이미지 관리 탭에 이미지가 없어도 본문만 발행합니다.');
            appendLog('ℹ️ 반자동 발행: 이미지 관리 탭이 비어 있어 이미지 없이 발행합니다. [semi-auto:text-only-empty-image-management]');
        }
        else if (!formData.skipImages) {
            showUnifiedProgress(40, '이미지 생성 시작...', '제목에 맞는 이미지를 생성하고 있습니다.');
            appendLog('🎨 이미지가 없습니다. 새로 생성 중...');
            appendLog(`   [디버그] imageManagementImages가 없어서 새로 생성: ${JSON.stringify(formData.imageManagementImages)}`);
            if (structuredContent.collectedImages && structuredContent.collectedImages.length > 0) {
                formData.collectedImages = structuredContent.collectedImages;
                console.log(`[FullAuto] ✅ structuredContent.collectedImages → formData.collectedImages 전달: ${structuredContent.collectedImages.length}개`);
            }
            generatedImagesForPublish = await generateImagesForContent(structuredContent, formData);
            if (generatedImagesForPublish.length > 0) {
                generatedImagesForPublish.forEach((img) => {
                    if (img.heading) {
                        ImageManager.setImage(img.heading, img);
                    }
                });
                appendLog(`🔗 ImageManager에 ${generatedImagesForPublish.length}개 이미지 등록 완료`);
                try {
                    displayGeneratedImages(generatedImagesForPublish);
                    updatePromptItemsWithImages(generatedImagesForPublish);
                }
                catch (uiErr) {
                    console.warn('[SemiAuto] 이미지 관리탭 UI 업데이트 실패:', uiErr);
                }
            }
            showUnifiedProgress(60, '이미지 생성 완료', '이미지가 성공적으로 생성되었습니다.');
            appendLog('✅ 이미지 생성 완료');
        }
        else {
            appendLog('⏭️ 이미지 생성 건너뛰기 (skipImages = true)');
        }
        checkSemiAutoStop();
        autoLinkPreviousPost(formData);
        checkSemiAutoStop();
        showUnifiedProgress(80, '블로그 발행 준비 중...', '네이버 블로그에 발행할 준비를 하고 있습니다.');
        appendLog('📤 블로그 발행 시작...');
        appendLog(`📊 발행 정보: 제목="${structuredContent.selectedTitle}", 이미지=${generatedImagesForPublish.length}개`);
        showUnifiedProgress(90, '블로그 발행 중...', '네이버 블로그에 콘텐츠를 발행하고 있습니다.');
        const automationResult = await executeBlogPublishing(structuredContent, generatedImagesForPublish, formData);
        if (currentPostId && automationResult?.success) {
            const publishedUrl = automationResult.url || automationResult.postUrl || automationResult.blogUrl;
            if (publishedUrl) {
                updatePostAfterPublish(currentPostId, publishedUrl, formData.publishMode);
            }
            updatePostImages(currentPostId, generatedImagesForPublish);
        }
        showUnifiedProgress(100, '발행 완료!', '🎉 반자동 발행이 성공적으로 완료되었습니다!');
        appendLog('✅ 반자동 모드 자동화 완료');
        stopAutosave();
        stopAutoBackup();
        clearAutosavedContent();
        appendLog('💾 임시 저장 데이터 삭제 완료');
        if (automationResult?.success) {
            setTimeout(() => {
                resetAllFields();
                resetThumbnailGeneratorOnPublish();
            }, 3000);
            setTimeout(() => {
                const progressContainer = document.getElementById('unified-progress-container');
                if (progressContainer) {
                    progressContainer.style.display = 'none';
                }
            }, 3000);
        }
        else {
            console.log('[SemiAutoFlow] ⚠️ 발행 결과가 성공이 아니므로 콘텐츠/이미지 보존 (재시도 가능)');
            try {
                resetPublishing();
            }
            catch (e) { }
        }
        return automationResult;
    }
    catch (error) {
        console.error('[SemiAutoFlow] 오류:', error);
        if (isPostContentAppliedPublishError(error?.message || String(error || ''))) {
            appendLog('🛑 본문 작성 완료 후 발행 단계에서 브라우저 세션이 종료되었습니다. 같은 글을 다시 쓰지 않도록 자동 재작성을 중단합니다.');
            showUnifiedProgress(95, '본문 작성 완료 — 발행 상태 확인 필요', '네이버 글쓰기 창의 임시저장/작성 상태를 먼저 확인해주세요.');
            throw error;
        }
        try {
            resetPublishing();
        }
        catch (e) {
            console.warn('[SemiAutoFlow] resetPublishing 오류:', e);
        }
        try {
            hideUnifiedProgress();
        }
        catch (e) { }
        throw error;
    }
}
function updateUnifiedPreview(structuredContent) {
    const previewSection = document.getElementById('unified-preview-section');
    if (!previewSection)
        return;
    previewSection.style.display = 'block';
    setTimeout(() => {
        previewSection.style.opacity = '1';
        previewSection.style.transform = 'translateY(0)';
    }, 100);
    previewSection.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.3)';
    let borderAnimationCount = 0;
    const borderAnimation = setInterval(() => {
        borderAnimationCount++;
        if (borderAnimationCount % 2 === 0) {
            previewSection.style.borderColor = 'var(--accent)';
        }
        else {
            previewSection.style.borderColor = 'var(--primary)';
        }
        if (borderAnimationCount >= 6) {
            clearInterval(borderAnimation);
            previewSection.style.borderColor = 'var(--primary)';
            previewSection.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
        }
    }, 200);
    setTimeout(() => {
        previewSection.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }, 300);
    const generatedImagesSection = document.getElementById('generated-images-section');
    if (generatedImagesSection) {
        generatedImagesSection.style.display = 'block';
    }
    const mp4FilesSection = document.getElementById('mp4-files-section');
    if (mp4FilesSection) {
        mp4FilesSection.style.display = 'block';
    }
    refreshMp4FilesList();
    const videoProviderSelect = document.getElementById('video-provider-select');
    if (videoProviderSelect) {
        try {
            const raw = String(window.localStorage?.getItem('videoProvider') || '').trim().toLowerCase();
            const stored = raw === 'kenburns' ? 'kenburns' : 'veo';
            setCurrentVideoProvider(stored);
        }
        catch {
            setCurrentVideoProvider('veo');
        }
        if (!videoProviderSelect.hasAttribute('data-listener-added')) {
            videoProviderSelect.setAttribute('data-listener-added', 'true');
            videoProviderSelect.addEventListener('change', () => {
                try {
                    setCurrentVideoProvider(getCurrentVideoProvider());
                }
                catch (e) {
                    console.warn('[fullAutoFlow] catch ignored:', e);
                }
            });
        }
    }
    const openImagesFolderBtn = document.getElementById('open-images-folder-btn');
    if (openImagesFolderBtn && !openImagesFolderBtn.hasAttribute('data-listener-added')) {
        openImagesFolderBtn.setAttribute('data-listener-added', 'true');
        openImagesFolderBtn.addEventListener('click', async () => {
            try {
                if (!window.api.openPath) {
                    appendLog('⚠️ 파일 시스템 API를 사용할 수 없습니다.');
                    alert('파일 시스템 API를 사용할 수 없습니다.');
                    return;
                }
                const imageFolderPath = await getRequiredImageBasePath();
                if (window.api.openPath) {
                    await window.api.openPath(imageFolderPath);
                    appendLog(`📂 이미지 폴더를 열었습니다: ${imageFolderPath}`);
                }
                else {
                    await navigator.clipboard.writeText(imageFolderPath);
                    alert(`이미지 폴더 경로가 클립보드에 복사되었습니다:\n\n${imageFolderPath}\n\n탐색기에서 이 경로를 붙여넣어 주세요.`);
                }
            }
            catch (error) {
                console.error('폴더 열기 실패:', error);
                alert(error.message || '폴더를 열 수 없습니다. 경로를 확인해주세요.');
            }
        });
    }
    const openExistingImagesFolderBtn = document.getElementById('open-existing-images-folder-btn');
    if (openExistingImagesFolderBtn && !openExistingImagesFolderBtn.hasAttribute('data-listener-added')) {
        openExistingImagesFolderBtn.setAttribute('data-listener-added', 'true');
        openExistingImagesFolderBtn.addEventListener('click', async () => {
            try {
                await openExistingImageFolder();
            }
            catch (e) {
                console.error('기존 폴더 열기 실패:', e);
                toastManager.error(e.message || '기존 폴더를 열 수 없습니다.');
            }
        });
    }
    const loadImagesFromFoldersBtn = document.getElementById('load-images-from-folders-btn');
    if (loadImagesFromFoldersBtn && !loadImagesFromFoldersBtn.hasAttribute('data-listener-added')) {
        loadImagesFromFoldersBtn.setAttribute('data-listener-added', 'true');
        loadImagesFromFoldersBtn.addEventListener('click', async () => {
            await showLoadImagesFromFoldersModal();
        });
    }
    const undoImageChangeBtn = document.getElementById('undo-image-change-btn');
    if (undoImageChangeBtn && !undoImageChangeBtn.hasAttribute('data-listener-added')) {
        undoImageChangeBtn.setAttribute('data-listener-added', 'true');
        undoImageChangeBtn.addEventListener('click', () => {
            undoLastImageChange();
        });
    }
    const openMp4Btns = [
        document.getElementById('open-mp4-folder-btn'),
        document.getElementById('open-mp4-folder-btn-2'),
    ].filter(Boolean);
    openMp4Btns.forEach((btn) => {
        if (btn.hasAttribute('data-listener-added'))
            return;
        btn.setAttribute('data-listener-added', 'true');
        btn.addEventListener('click', async () => {
            try {
                const dir = await getAiVideoFolderPath();
                await window.api.openPath(dir);
            }
            catch (e) {
                console.error('[AI-VIDEO] 폴더 열기 실패:', e);
                toastManager.error(e.message || 'AI 영상 폴더를 열 수 없습니다.');
            }
        });
    });
    const refreshMp4ListBtn = document.getElementById('refresh-mp4-list-btn');
    if (refreshMp4ListBtn && !refreshMp4ListBtn.hasAttribute('data-listener-added')) {
        refreshMp4ListBtn.setAttribute('data-listener-added', 'true');
        refreshMp4ListBtn.addEventListener('click', async () => {
            await refreshMp4FilesList();
        });
    }
    const importMp4Btn = document.getElementById('import-mp4-btn');
    if (importMp4Btn && !importMp4Btn.hasAttribute('data-listener-added')) {
        importMp4Btn.setAttribute('data-listener-added', 'true');
        importMp4Btn.addEventListener('click', async () => {
            try {
                if (typeof window.api?.showOpenDialog !== 'function') {
                    toastManager.error('파일 선택 기능을 사용할 수 없습니다.');
                    return;
                }
                const pick = await window.api.showOpenDialog({
                    properties: ['openFile'],
                    filters: [{ name: 'MP4 Videos', extensions: ['mp4'] }],
                });
                if (!pick || pick.canceled || !Array.isArray(pick.filePaths) || pick.filePaths.length === 0)
                    return;
                const sourcePath = String(pick.filePaths[0] || '').trim();
                if (!sourcePath)
                    return;
                const dirPath = await getAiVideoFolderPath();
                if (typeof window.api?.importMp4 !== 'function') {
                    await window.api.openPath(dirPath);
                    appendLog('⚠️ 영상 불러오기 기능(복사)이 아직 준비되지 않았습니다. 열린 폴더에 mp4를 직접 복사한 뒤, AI 영상 목록에서 새로고침을 눌러주세요.');
                    toastManager.warning('아직 자동 불러오기가 준비되지 않았습니다. 폴더에 직접 복사 후 새로고침 해주세요.');
                    return;
                }
                appendLog(`📥 영상 불러오기 시작: ${sourcePath.split(/[\\/]/).pop() || 'video.mp4'}`);
                const res = await window.api.importMp4({ sourcePath, dirPath });
                if (!res?.success) {
                    toastManager.error(res?.message || '영상 불러오기 실패');
                    appendLog(`❌ 영상 불러오기 실패: ${res?.message || 'unknown'}`);
                    return;
                }
                toastManager.success('✅ 영상이 AI 영상 목록에 추가되었습니다.');
                appendLog(`✅ 영상 불러오기 완료: ${String(res?.fileName || '')}`);
                await refreshMp4FilesList();
            }
            catch (e) {
                console.error('[AI-VIDEO] import mp4 실패:', e);
                toastManager.error(`영상 불러오기 오류: ${e.message}`);
                appendLog(`❌ 영상 불러오기 오류: ${e.message}`);
            }
        });
    }
    const createVeoVideoBtn = document.getElementById('create-veo-video-btn');
    if (createVeoVideoBtn && !createVeoVideoBtn.hasAttribute('data-listener-added')) {
        createVeoVideoBtn.setAttribute('data-listener-added', 'true');
        createVeoVideoBtn.addEventListener('click', async () => {
            try {
                const ok = window.confirm('⚠️ 안내\n\n현재 "AI 영상 만들기"는 텍스트 프롬프트 기반(Veo) 생성입니다.\n\n실존 인물/유명인/특정 인물의 얼굴(닮은꼴 포함)은 정책(안전 필터)로 차단될 수 있습니다.\n프롬프트에 이름/비교/누구처럼 등의 표현을 넣지 마세요.\n\n계속 진행할까요?');
                if (!ok)
                    return;
                await openVeoHeadingSelectModal();
            }
            catch (e) {
                console.error('[VEO] generateVeoVideo 실패:', e);
                const msg = e.message || String(e);
                toastManager.error(`AI 영상 생성 오류: ${msg}`);
                appendLog(`❌ AI 영상 생성 중 오류: ${msg}`);
            }
        });
    }
}
function updateUnifiedImagePreview(headings, generatedImages) {
    const integratedPreview = document.getElementById('unified-integrated-preview');
    if (!integratedPreview)
        return;
    ensureUnifiedPreviewVideoDelegation();
    const structuredContent = window.currentStructuredContent;
    const bodyPlain = structuredContent?.bodyPlain || '';
    const bodyImages = Array.isArray(generatedImages)
        ? generatedImages.filter((img) => img?.isThumbnail !== true)
        : [];
    const integratedHtml = headings.map((heading, index) => {
        const generatedImage = bodyImages[index];
        const imageStatus = generatedImage ? '✅ 생성됨' : '⏳ 준비중';
        const statusColor = generatedImage ? 'var(--success)' : 'var(--accent)';
        const headingTitle = typeof heading === 'string' ? heading : (heading.title || heading);
        const normalizedHeadingTitle = normalizeHeadingKeyForVideoCache(String(headingTitle || '').trim());
        let headingContent = typeof heading === 'string' ? '' : (heading.content || '');
        const safeTitle = escapeHtml(headingTitle);
        if (!headingContent && bodyPlain) {
            const headingIndex = bodyPlain.indexOf(headingTitle);
            if (headingIndex !== -1) {
                const startIndex = headingIndex + headingTitle.length;
                let endIndex = bodyPlain.length;
                for (let i = index + 1; i < headings.length; i++) {
                    const nextTitle = typeof headings[i] === 'string' ? headings[i] : (headings[i].title || headings[i]);
                    const nextIndex = bodyPlain.indexOf(nextTitle, startIndex);
                    if (nextIndex !== -1) {
                        endIndex = nextIndex;
                        break;
                    }
                }
                headingContent = bodyPlain.substring(startIndex, endIndex).trim();
            }
        }
        const safeContent = escapeHtml(headingContent.substring(0, 400)) + (headingContent.length > 400 ? '...' : '');
        let imageDisplay = '';
        const headingKey = encodeURIComponent(String(normalizedHeadingTitle || '').trim());
        const getFromCache2 = window.getHeadingVideoPreviewFromCache || getHeadingVideoPreviewFromCache;
        const cachedVideo = getFromCache2(normalizedHeadingTitle);
        const cachedVideoUrl = cachedVideo?.url ? String(cachedVideo.url) : '';
        if (cachedVideoUrl) {
            const safeVideoUrl = escapeHtml(cachedVideoUrl);
            imageDisplay = `
        <div class="unified-heading-video" data-video-url="${safeVideoUrl}" data-video-title="${safeTitle}" data-heading-video-slot="${headingKey}" style="width: 100%; height: 100%;">
          <video class="unified-heading-video-player" src="${safeVideoUrl}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px; background: #000;"></video>
        </div>
      `;
        }
        if (generatedImage) {
            const imageRaw = getFullAutoImagePath(generatedImage);
            const imageUrl = toFileUrlMaybe(String(imageRaw || '').trim());
            if (!imageDisplay) {
                const headingEnc = encodeURIComponent(String(headingTitle || '').trim());
                const imageEnc = encodeURIComponent(String(imageUrl || '').trim());
                imageDisplay = `
          <div data-heading-video-slot="${headingKey}" style="width: 100%; height: 100%;">
            <img src="${escapeHtml(imageUrl)}" alt="${safeTitle}" class="ken-burns-media" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px; cursor: pointer;" onclick="showHeadingImagesModal('${headingEnc}','${imageEnc}')">
          </div>
        `;
            }
        }
        else {
            if (!imageDisplay) {
                imageDisplay = `
          <div data-heading-video-slot="${headingKey}" style="width: 100%; height: 100%; border-radius: 6px; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem; font-weight: 600;">${index + 1}</div>
        `;
            }
        }
        return `<div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border-light);">
      <!-- 이미지 영역 -->
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">
        <div style="width: 60px; height: 40px; border-radius: 6px; overflow: hidden; border: 2px solid var(--border-color);">
          ${imageDisplay}
        </div>
        <div style="flex: 1;">
          <div style="font-size: 0.9rem; color: var(--text-strong); font-weight: 500;">🖼️ ${generatedImage ? '이미지 생성됨' : '이미지 생성 예정'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">소제목에 맞는 이미지가 ${generatedImage ? '완성되었습니다' : '생성됩니다'}</div>
        </div>
        <div style="font-size: 0.8rem; color: ${statusColor}; font-weight: 600;">${imageStatus}</div>
      </div>

      <!-- 소제목 + 본문 영역 -->
      <div style="padding: 0.75rem; background: var(--bg-primary); border-radius: 6px; border-left: 3px solid var(--success);">
        <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.75rem; font-size: 1rem; word-break: keep-all; line-height: 1.4; overflow-wrap: break-word;">📝 ${safeTitle}</div>
        <div style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.7; white-space: pre-line;">${safeContent}</div>
      </div>
    </div>`;
    }).join('');
    integratedPreview.innerHTML = integratedHtml || '<div style="color: var(--text-muted); font-style: italic;">소제목이 없습니다.</div>';
    const headingTitles = headings
        .map((h) => (typeof h === 'string' ? h : (h?.title || h)))
        .map((t) => String(t || '').trim())
        .filter((t) => t.length > 0);
    headingTitles.forEach((t) => {
        prefetchHeadingVideoPreview(t);
        if (headingVideoPreviewInFlight.has(t)) {
            headingVideoPreviewInFlight.get(t).then((entry) => {
                if (!entry || !entry.url)
                    return;
                const normalizedT = normalizeHeadingKeyForVideoCache(t);
                const key = encodeURIComponent(normalizedT);
                const slot = integratedPreview.querySelector(`[data-heading-video-slot="${key}"]`);
                if (!slot)
                    return;
                const safeVideoUrl = escapeHtml(String(entry.url));
                const safeTitle = escapeHtml(t);
                slot.innerHTML = `
          <div class="unified-heading-video" data-video-url="${safeVideoUrl}" data-video-title="${safeTitle}" data-heading-video-slot="${key}" style="width: 100%; height: 100%;">
            <video class="unified-heading-video-player" src="${safeVideoUrl}" muted autoplay loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px; background: #000;"></video>
          </div>
        `;
                const v = slot.querySelector('.unified-heading-video-player');
                if (v) {
                    try {
                        v.play().catch((e) => {
                            console.warn('[fullAutoFlow] promise catch ignored:', e);
                        });
                    }
                    catch (e) {
                        console.warn('[fullAutoFlow] catch ignored:', e);
                    }
                }
            }).catch((e) => {
                console.warn('[fullAutoFlow] headingVideoPreviewInFlight promise catch ignored:', e);
            });
        }
    });
    integratedPreview.querySelectorAll('.unified-heading-video-player').forEach((el) => {
        try {
            el.play().catch((e) => {
                console.warn('[fullAutoFlow] promise catch ignored:', e);
            });
        }
        catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
        }
    });
}
function initFullAutoImageSourceSelection() {
    const imageSourceBtns = document.querySelectorAll('.full-auto-img-source-btn');
    imageSourceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const source = btn.dataset.source;
            if (btn.hasAttribute('disabled')) {
                alert('이 기능은 현재 사용할 수 없습니다.');
                return;
            }
            imageSourceBtns.forEach(b => b.classList.remove('selected'));
            imageSourceBtns.forEach(b => b.style.borderColor = 'transparent');
            btn.classList.add('selected');
            btn.style.borderColor = 'var(--primary)';
            const categoryContainer = document.getElementById('full-auto-library-category-container');
            if (categoryContainer) {
                categoryContainer.style.display = source === 'library' ? 'block' : 'none';
            }
            console.log(`[FullAuto] 이미지 소스 선택됨: ${source}`);
            if (source) {
                localStorage.setItem('fullAutoImageSource', source);
                console.log(`[FullAuto] 풀오토 전용 이미지 소스 localStorage 저장: ${source}`);
            }
        });
    });
}
function initFullAutoExecution() {
    const startBtn = document.getElementById('full-auto-start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            try {
                const formData = collectFullAutoFormData();
                if (!validateFullAutoFormData(formData)) {
                    return;
                }
                await executeFullAutoAutomation(formData);
            }
            catch (error) {
                console.error('[FullAuto] 실행 오류:', error);
                alert(`풀오토 실행 중 오류가 발생했습니다: ${error.message}`);
            }
        });
    }
}
function collectFullAutoFormData() {
    // [Phase 7.1-d] This is the direct-UI full-auto entry (bypasses
    // publishingHandlers) — resolve the pipeline snapshot here once.
    const pipelineCfg = resolvePipelineConfig('full-auto');
    const urls = Array.from(document.querySelectorAll('#unified-url-fields-container .url-field-input, #full-auto-url-fields-container .url-field-input'))
        .map(input => input.value.trim())
        .filter(url => url.length > 0);
    const keywords = document.getElementById('unified-keywords')?.value.trim() || '';
    const title = document.getElementById('unified-generated-title')?.value.trim() || '';
    const generator = UnifiedDOMCache.getGenerator();
    const targetAge = 'all';
    const imageSource = UnifiedDOMCache.getImageSource();
    const skipImages = pipelineCfg.image.textOnlyPublish || pipelineCfg.image.headingImageMode === 'none';
    const publishMode = document.getElementById('unified-publish-mode')?.value
        || 'publish';
    let scheduleDate;
    let scheduleTime;
    if (publishMode === 'schedule') {
        const rawScheduleVal = document.getElementById('unified-schedule-date')?.value;
        if (rawScheduleVal) {
            if (rawScheduleVal.includes('T')) {
                const parts = rawScheduleVal.split('T');
                scheduleDate = parts[0];
                scheduleTime = parts[1]?.substring(0, 5);
            }
            else if (rawScheduleVal.includes(' ')) {
                const parts = rawScheduleVal.split(' ');
                scheduleDate = parts[0];
                scheduleTime = parts[1]?.substring(0, 5);
            }
            else {
                scheduleDate = rawScheduleVal;
            }
        }
    }
    const autoPublish = document.getElementById('auto-publish-after-generate')?.checked || false;
    const includeThumbnailText = pipelineCfg.image.thumbnailTextInclude ||
        document.getElementById('thumbnail-text-include')?.checked || false;
    const enablePreview = true;
    const autoOptimize = true;
    const enableBackup = true;
    const contentTemplate = 'auto';
    const toneStyle = document.getElementById('unified-tone-style')?.value || 'professional';
    const keywordAsTitle = document.getElementById('fullauto-keyword-as-title')?.checked || false;
    const keywordTitlePrefix = document.getElementById('fullauto-keyword-title-prefix')?.checked || false;
    const manualTitleOverride = document.getElementById('shopping-connect-manual-title')?.value?.trim()
        || document.getElementById('unified-manual-title')?.value?.trim()
        || undefined;
    return {
        pipelineConfigSnapshot: pipelineCfg,
        urls,
        keywords,
        title: manualTitleOverride || title,
        manualTitleOverride,
        generator,
        targetAge,
        imageSource,
        skipImages,
        publishMode,
        scheduleDate,
        scheduleTime,
        includeThumbnailText,
        enablePreview,
        autoOptimize,
        enableBackup,
        contentTemplate,
        toneStyle,
        keywordAsTitle,
        keywordTitlePrefix,
        headingImageMode: pipelineCfg.image.headingImageMode,
        imageStyle: pipelineCfg.image.imageStyle,
        imageRatio: pipelineCfg.image.imageRatio,
        thumbnailImageRatio: pipelineCfg.image.thumbnailImageRatio,
        subheadingImageRatio: pipelineCfg.image.subheadingImageRatio,
        imageFallbackPolicy: pipelineCfg.image.fallbackPolicy,
        scSubImageMode: pipelineCfg.shopping.subImageMode,
        scAIImageEngine: pipelineCfg.shopping.aiImageEngine,
        scAutoThumbnailSetting: pipelineCfg.shopping.autoThumbnail,
    };
}
function validateFullAutoFormData(data) {
    if (data.urls.length === 0 && !data.keywords && !data.title) {
        alert('URL, 키워드, 제목 중 최소 하나 이상을 입력해주세요.');
        return false;
    }
    if (data.title && !data.keywords) {
        const looksLikeKeywords = data.title.includes(',') ||
            (data.title.length < 20 && !data.title.includes(' '));
        if (looksLikeKeywords) {
            const userChoice = confirm(`💡 안내: 제목 필드 사용법\n\n` +
                `현재 입력: "${data.title}"\n\n` +
                `• 제목 필드: 블로그 글 제목을 입력하세요\n` +
                `  예) "${new Date().getFullYear()}년 다이어트 성공 비법 총정리"\n\n` +
                `• 키워드 필드: 검색 키워드를 입력하세요\n` +
                `  예) "다이어트, 건강, 운동"\n\n` +
                `⚠️ 실시간 정보 기반 체크박스를 반드시 켜주세요!\n` +
                `   → AI 할루시네이션(거짓 정보) 방지에 필수입니다.\n\n` +
                `그래도 현재 입력으로 진행하시겠습니까?`);
            if (!userChoice) {
                return false;
            }
        }
    }
    const realtimeCheckbox = document.getElementById('unified-realtime-crawl');
    if (realtimeCheckbox && !realtimeCheckbox.checked) {
        const enableRealtime = confirm(`⚠️ 실시간 정보 수집이 꺼져 있습니다!\n\n` +
            `실시간 정보 수집을 켜면:\n` +
            `• 최신 뉴스, 블로그, 카페 정보 반영\n` +
            `• AI 할루시네이션(거짓 정보) 방지\n` +
            `• 더 정확하고 신뢰할 수 있는 글 생성\n\n` +
            `실시간 정보 수집을 켜시겠습니까?`);
        if (enableRealtime) {
            realtimeCheckbox.checked = true;
        }
    }
    return true;
}
async function executeFullAutoAutomation(formData) {
    formData = createPipelineFormDataSnapshot('full-auto', formData || {});
    const startBtn = document.getElementById('full-auto-start-btn');
    const progressContainer = document.createElement('div');
    progressContainer.id = 'full-auto-progress-container';
    progressContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 300px;
    background: var(--bg-primary);
    border: 2px solid var(--primary);
    border-radius: var(--radius-lg);
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: var(--font-family);
  `;
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
    width: 100%;
    height: 8px;
    background: var(--bg-secondary);
    border-radius: 4px;
    overflow: hidden;
    margin: 0.5rem 0;
  `;
    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
    height: 100%;
    background: linear-gradient(90deg, var(--primary), var(--success));
    width: 0%;
    transition: width 0.3s ease;
    border-radius: 4px;
  `;
    const progressText = document.createElement('div');
    progressText.style.cssText = `
    font-size: 0.9rem;
    color: var(--text-strong);
    text-align: center;
    font-weight: 600;
  `;
    progressBar.appendChild(progressFill);
    progressContainer.appendChild(progressText);
    progressContainer.appendChild(progressBar);
    document.body.appendChild(progressContainer);
    const updateProgress = (percent, text) => {
        progressFill.style.width = `${percent}%`;
        progressText.textContent = text;
        console.log(`[FullAuto Progress] ${percent}%: ${text}`);
    };
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<span style="font-size: 1.75rem;">⏳</span><span>실행 중...</span>';
    }
    const result = await withErrorHandling(async () => {
        updateProgress(5, '콘텐츠 생성 준비 중...');
        showUnifiedProgress(5, '콘텐츠 생성 준비 중...', 'AI가 글을 생성할 준비를 하고 있습니다.');
        appendLog('🚀 풀오토 자동화를 시작합니다!');
        const retryContentForImageOnly = getFullAutoContentRetryCache(formData);
        if (!formData._contentAlreadyGenerated && retryContentForImageOnly) {
            formData._contentAlreadyGenerated = true;
            formData.structuredContent = retryContentForImageOnly;
            formData.imageManagementImages = [];
            appendLog('♻️ 이전 글 생성 결과를 재사용하고 이미지 생성만 다시 진행합니다.');
        }
        let structuredContent;
        if (formData._contentAlreadyGenerated && formData.structuredContent && (formData.structuredContent.headings?.length > 0 || formData.structuredContent.bodyPlain)) {
            appendLog('♻️ 이미 생성된 콘텐츠 재사용 (중복 생성 방지)');
            console.log('[FullAuto] ♻️ formData.structuredContent 재사용 — generateFullAutoContent 스킵');
            structuredContent = formData.structuredContent;
            if (!structuredContent.bodyPlain && !structuredContent.content && Array.isArray(structuredContent.headings) && structuredContent.headings.length > 0) {
                const recovered = structuredContent.headings
                    .map((h) => {
                    const bodyText = (h.content || h.summary || '').trim();
                    return bodyText ? `${h.title || ''}\n\n${bodyText}` : (h.title || '');
                })
                    .filter((s) => s.trim())
                    .join('\n\n');
                if (recovered) {
                    structuredContent.bodyPlain = recovered;
                    structuredContent.content = recovered;
                    console.warn('[FullAuto] ⚠️ _contentAlreadyGenerated 재사용 경로: bodyPlain 누락 → headings에서 복구');
                }
            }
        }
        else {
            structuredContent = await generateFullAutoContent(formData);
        }
        if (!structuredContent) {
            throw new Error('콘텐츠 생성에 실패했습니다.');
        }
        applyManualTitleOverride(structuredContent, getManualTitleOverride(formData));
        updateProgress(25, '콘텐츠 생성 완료');
        showUnifiedProgress(25, '콘텐츠 생성 완료', 'AI 글 생성이 완료되었습니다.');
        currentStructuredContent = structuredContent;
        window.currentStructuredContent = structuredContent;
        saveFullAutoContentRetryCache(formData, structuredContent);
        const postId = saveGeneratedPost(structuredContent);
        if (postId) {
            currentPostId = postId;
        }
        await displayContentInAllTabs(structuredContent);
        updateProgress(40, '소제목 분석 완료');
        showUnifiedProgress(40, '소제목 분석 완료', '생성된 콘텐츠의 소제목을 분석하고 있습니다.');
        updateProgress(45, '이미지 생성 시작...');
        if (structuredContent.collectedImages && structuredContent.collectedImages.length > 0) {
            formData.collectedImages = structuredContent.collectedImages;
            console.log(`[FullAuto] ✅ 크롤링 시 수집한 이미지 ${structuredContent.collectedImages.length}장을 이미지 생성에 전달`);
        }
        let generatedImages = [];
        if (Array.isArray(formData.imageManagementImages) && formData.imageManagementImages.length > 0) {
            appendLog(`♻️ 이미 생성된 이미지 ${formData.imageManagementImages.length}장 재사용 (중복 생성 방지)`);
            console.log(`[FullAuto] ♻️ formData.imageManagementImages 재사용 — generateImagesForContent 스킵`);
            generatedImages = [...formData.imageManagementImages];
        }
        else if (formData.skipImages === true) {
            appendLog('⏭️ 이미지 건너뛰기 옵션이 선택되어 이미지 생성을 건너뜁니다.');
            console.log('[FullAuto] skipImages=true -> generateImagesForContent skip');
            generatedImages = [];
        }
        else {
            generatedImages = await generateImagesForContent(structuredContent, formData);
        }
        updateProgress(70, '이미지 생성 완료');
        showUnifiedProgress(70, '이미지 생성 완료', '소제목에 맞는 이미지가 모두 생성되었습니다.');
        updateProgress(90, '블로그 발행 중...');
        showUnifiedProgress(90, '블로그 발행 중...', '네이버 블로그에 콘텐츠를 발행하고 있습니다.');
        const automationResult = await executeBlogPublishing(structuredContent, generatedImages, formData);
        if (currentPostId && automationResult?.success) {
            const publishedUrl = automationResult.url || automationResult.postUrl || automationResult.blogUrl;
            if (publishedUrl) {
                updatePostAfterPublish(currentPostId, publishedUrl, formData.publishMode);
            }
        }
        updateProgress(100, '발행 완료! 🎉');
        showUnifiedProgress(100, '발행 완료!', '🎉 모든 작업이 성공적으로 완료되었습니다!');
        appendLog('🎉 풀오토 자동화가 성공적으로 완료되었습니다!');
        clearFullAutoContentRetryCache();
        stopAutosave();
        stopAutoBackup();
        clearAutosavedContent();
        appendLog('💾 임시 저장 데이터 삭제 완료');
        setTimeout(() => {
            resetAllFields();
        }, 3000);
        return automationResult;
    }, 'FullAutoExecution');
    setTimeout(() => {
        if (progressContainer.parentNode) {
            progressContainer.parentNode.removeChild(progressContainer);
        }
    }, 2000);
    if (!result) {
        if (progressContainer.parentNode) {
            progressContainer.parentNode.removeChild(progressContainer);
        }
        try {
            hideUnifiedProgress();
        }
        catch (e) { }
        try {
            resetPublishing();
        }
        catch (e) {
            console.warn('[FullAuto] resetPublishing 오류:', e);
        }
        toastManager.error('❌ 풀오토 실행에 실패했습니다.');
    }
    else {
        setTimeout(() => {
            console.log('[FullAuto] 발행 완료 후 필드 초기화 시작');
            resetAllFields();
            hideUnifiedProgress();
            toastManager.success('🆕 다음 글 작성을 위해 필드가 초기화되었습니다.');
            refreshGeneratedPostsList();
        }, 3000);
    }
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = '<span style="font-size: 1.75rem;">🚀</span><span>풀 오토 발행 시작</span>';
    }
}
async function generateFullAutoContent(formData) {
    if (currentStructuredContent) {
        appendLog('🔄 기존 콘텐츠를 초기화하고 새로운 콘텐츠를 생성합니다...');
        currentStructuredContent = null;
        window.currentStructuredContent = null;
        generatedImages = [];
        window.imageManagementGeneratedImages = null;
        window.selectedContentType = 'info';
        const typeEl = document.getElementById('unified-article-type');
        if (typeEl && typeEl.value !== 'review') {
            window.selectedContentType = 'info';
        }
        else if (typeEl && typeEl.value === 'review') {
            window.selectedContentType = 'review';
        }
    }
    const customPromptVal = (document.getElementById('custom-prompt-input')?.value?.trim()
        || document.getElementById('unified-custom-prompt')?.value?.trim()
        || '');
    if (customPromptVal) {
        appendLog('⚠️ [주의] 개인 프롬프트가 설정되어 있습니다. 현재 모드의 기본 프롬프트가 완전 대체됩니다.');
    }
    const isUrlMode = formData.urls && formData.urls.length > 0;
    appendLog(`🤖 AI 콘텐츠 생성을 시작합니다... (방식: ${isUrlMode ? 'URL 뉴스' : '키워드'})`);
    const urls = formData.urls || [];
    const keywords = formData.keywords || '';
    // [2026-06-12] 키워드 입력에 URL이 섞이면("키워드, https://...") URL은
    // 참고자료로 자동 분리 — 키워드/제목으로 새지 않게 하고 글 재료로 쓴다.
    const rawTokens = keywords ? keywords.split(',').map((k) => k.trim()).filter((k) => k.length > 0) : [];
    const inlineReferenceUrls = rawTokens.filter((k) => /^https?:\/\//i.test(k));
    const keywordList = rawTokens.filter((k) => !/^https?:\/\//i.test(k));
    const cleanedKeywords = keywordList.join(', ');
    if (inlineReferenceUrls.length > 0) {
        appendLog(`🔗 키워드 입력에서 참고 URL ${inlineReferenceUrls.length}개 분리 — 페이지를 수집해 글 재료로 사용합니다.`);
    }
    const titleStr = formData.title ? String(formData.title || '').trim() : '';
    let draftText;
    if (keywordList.length > 0) {
        draftText = keywordList.join(', ');
    }
    else if (titleStr) {
        draftText = titleStr;
    }
    const businessInfo = formData.contentMode === 'business' ? (() => {
        const globalInfo = window._businessInfo;
        if (globalInfo && globalInfo.name) {
            const m = [];
            if (!globalInfo.name)
                m.push('업체명');
            if (!globalInfo.phone && !globalInfo.kakao)
                m.push('전화 또는 카톡');
            if (globalInfo.serviceArea === 'regional' && !globalInfo.region)
                m.push('서비스 지역');
            if (m.length > 0) {
                alert('🏢 업체 정보 누락:\n\n• ' + m.join('\n• ') + '\n\n다시 입력해주세요.');
                window.openBusinessGlobalModal?.();
                throw new Error('업체 정보 누락');
            }
            return globalInfo;
        }
        const get = (id) => document.getElementById(id)?.value?.trim() || undefined;
        const tryGet = (suffix) => get('unified-business-info-' + suffix) ||
            get('continuous-modal-business-info-' + suffix) ||
            get('ma-business-info-' + suffix) ||
            get('business-info-' + suffix);
        const nationwide = document.getElementById('unified-business-service-nationwide')?.checked ||
            document.getElementById('continuous-modal-business-service-nationwide')?.checked ||
            document.getElementById('ma-business-service-nationwide')?.checked ||
            document.getElementById('business-service-nationwide')?.checked;
        const serviceArea = nationwide ? 'nationwide' : 'regional';
        const info = {
            name: tryGet('name'),
            phone: tryGet('phone'),
            kakao: tryGet('kakao'),
            address: tryGet('address'),
            hours: tryGet('hours'),
            region: serviceArea === 'nationwide' ? undefined : tryGet('region'),
            serviceArea,
            extra: tryGet('extra'),
        };
        const missing = [];
        if (!info.name)
            missing.push('업체명');
        if (!info.phone && !info.kakao)
            missing.push('전화번호 또는 카카오톡 (둘 중 하나 필수)');
        if (info.serviceArea === 'regional' && !info.region)
            missing.push('서비스 지역 (지역구 모드)');
        if (missing.length > 0) {
            const msg = `🏢 업체 홍보 모드 필수 정보가 누락되었습니다:\n\n• ${missing.join('\n• ')}\n\n⚠️ 빈 값으로 발행하면 AI가 가짜 정보를 만들 수 있습니다.`;
            alert(msg);
            throw new Error(`업체 정보 누락: ${missing.join(', ')}`);
        }
        return info;
    })() : undefined;
    // [2026-06-12] 업체홍보 각도 로테이션 — 같은 업체 반복 발행 시 매번 다른
    // 강조 프레임을 강제한다 (이력은 업체명 기준 localStorage).
    if (businessInfo && window.rotateBusinessAngle) {
        try {
            const promoAngle = window.rotateBusinessAngle(businessInfo.name || '');
            if (promoAngle) {
                businessInfo.promoAngle = promoAngle.label;
                businessInfo.promoAngleDirective = promoAngle.directive;
                appendLog(`🎯 이번 글 강조 각도: ${promoAngle.label}`);
            }
        }
        catch (angleErr) {
            console.warn('[FullAuto] 각도 로테이션 실패(기본 진행):', angleErr);
        }
    }
    if (formData.keywordAsTitle) {
        window._keywordTitleOptions = {
            useKeywordAsTitle: true,
            useKeywordTitlePrefix: formData.keywordTitlePrefix || false,
            keyword: cleanedKeywords || titleStr || keywordList.join(' '),
        };
        appendLog(`📌 키워드를 제목으로 그대로 사용: "${window._keywordTitleOptions.keyword}"`);
    }
    else if (formData.keywordTitlePrefix) {
        window._keywordTitleOptions = {
            useKeywordAsTitle: false,
            useKeywordTitlePrefix: true,
            keyword: cleanedKeywords || titleStr || keywordList.join(' '),
        };
        appendLog(`🔝 키워드를 제목 맨 앞에 배치합니다.`);
    }
    else {
        window._keywordTitleOptions = undefined;
    }
    // [2026-06-12] 업체홍보 심층 리서치: 자료 URL이 없으면 업체 정보의
    // researchUrl(홈페이지/상품 페이지)을 수집 파이프라인에 주입한다.
    const businessResearchUrl = formData.contentMode === 'business'
        ? String(businessInfo?.researchUrl || '').trim()
        : '';
    const manualTitleOverride = getManualTitleOverride(formData);
    const contentPolicyContext = buildRendererContentPolicyContext({
        title: manualTitleOverride || titleStr || keywordList[0] || cleanedKeywords,
        content: draftText || '',
        keywords: keywordList,
        businessInfo,
        contentMode: formData.contentMode || 'seo',
    });
    const payload = {
        assembly: {
            generator: formData.generator,
            keywords: keywordList,
            rssUrl: urls.length > 0 ? urls[0] : (inlineReferenceUrls[0] || businessResearchUrl || undefined),
            title: titleStr || undefined,
            draftText,
            targetAge: formData.targetAge,
            minChars: formData.minChars || 2500,
            customPrompt: (document.getElementById('custom-prompt-input')?.value?.trim()
                || document.getElementById('unified-custom-prompt')?.value?.trim()) || undefined,
            categoryHint: formData.category || formData.categoryName || formData.categoryHint,
            contentMode: formData.contentMode || 'seo',
            articleType: formData.articleType,
            toneStyle: formData.toneStyle || formData.tone,
            businessInfo,
            contentPolicyContext,
            manualTitleOverride,
            useKeywordAsTitle: formData.keywordAsTitle || false,
            keywordForTitle: formData.keywordAsTitle ? (cleanedKeywords || titleStr || keywordList.join(' ')) : undefined,
            useKeywordTitlePrefix: formData.keywordTitlePrefix || false,
        }
    };
    appendLog('📝 콘텐츠 조립 정보를 준비했습니다.');
    const apiClient = EnhancedApiClient.getInstance();
    const apiResponse = await apiClient.call('generateStructuredContent', [payload], {
        retryCount: FULL_AUTO_CONTENT_GENERATION_RETRY_COUNT,
        retryDelay: 3000,
        timeout: FULL_AUTO_CONTENT_GENERATION_TIMEOUT_MS
    });
    const result = apiResponse.data || { success: false, message: apiResponse.error };
    if (isPaywallPayload(result)) {
        activatePaywall(result);
        return;
    }
    if (!result.success) {
        const errMsg = result.message || apiResponse.error || '콘텐츠 생성 실패';
        if (errMsg.includes('[FACT_CHECK_BLOCKED]')) {
            const userMsg = errMsg.replace('[FACT_CHECK_BLOCKED] ', '').replace('Error: ', '');
            appendLog(`⛔ ${userMsg.split('\n')[0]}`);
            try {
                alert(`🔍 자료 기반 작성 불가\n\n${userMsg}`);
            }
            catch { }
            throw new Error(userMsg);
        }
        appendLog('❌ 콘텐츠 생성에 실패했습니다.');
        throw new Error(errMsg);
    }
    applyManualTitleOverride(result.content, manualTitleOverride);
    appendLog('✅ AI 콘텐츠 생성이 완료되었습니다!');
    try {
        const factReport = result.content?.factCheckReport;
        if (factReport && factReport.totalFacts > 0) {
            const matchPct = Math.round(factReport.matchRate * 100);
            if (factReport.passed) {
                appendLog(`🔍 자료 대조 검증 통과: ${factReport.totalFacts}개 사실 중 ${factReport.matchRate * factReport.totalFacts}개 일치 (${matchPct}%)`);
            }
            else {
                const unmatchedSummary = (factReport.unmatched || []).slice(0, 5).join(', ');
                appendLog(`⚠️ 자료 대조 검증: 매칭률 ${matchPct}% (${factReport.totalFacts}개 사실 중 일부 미매칭). 미매칭: ${unmatchedSummary}${(factReport.unmatched || []).length > 5 ? ' ...' : ''}`);
                if (matchPct < 50) {
                    try {
                        alert(`⚠️ 자료 대조 검증 경고\n\n생성된 본문의 사실 매칭률이 ${matchPct}%로 낮습니다.\n자료에 없는 사실: ${unmatchedSummary}\n\n발행 전 본문을 직접 확인하시는 것을 강력히 권장합니다.`);
                    }
                    catch { }
                }
            }
        }
    }
    catch (factCheckUiErr) {
        console.warn('[FullAuto] fact 검증 결과 표시 중 예외 (무시):', factCheckUiErr);
    }
    try {
        const unifiedCollectChecked = !!document.getElementById('unified-url-collect-images')?.checked;
        const unifiedFillGap = !!document.getElementById('unified-url-fillgap-ai')?.checked;
        const contentUrl = document.getElementById('content-url-collect')?.value?.trim() || '';
        const contentFillGap = !!document.getElementById('content-url-fillgap-ai')?.checked;
        let unifiedFirstUrl = '';
        if (unifiedCollectChecked) {
            const firstUrlInput = document.querySelector('.unified-url-input');
            unifiedFirstUrl = (firstUrlInput?.value || '').trim();
        }
        let sourceUrl = '';
        let fillGap = false;
        if (unifiedCollectChecked && unifiedFirstUrl) {
            sourceUrl = unifiedFirstUrl;
            fillGap = unifiedFillGap;
            appendLog(`🔗 [풀오토] 위 URL로 이미지 수집 옵션 ON — ${sourceUrl.slice(0, 60)}...`);
        }
        else if (contentUrl) {
            sourceUrl = contentUrl;
            fillGap = contentFillGap;
        }
        else {
            sourceUrl = formData?.sourceUrl || result.content?.sourceUrl || '';
        }
        if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
            const runFn = window.runAutoImageSearch;
            const ImageManager = window.ImageManager;
            const syncFn = window.syncGlobalImagesFromImageManager || (() => { });
            const mainKw = formData?.keywords || result.content?.selectedTitle || '';
            if (typeof runFn === 'function') {
                await runFn(result.content, mainKw, appendLog, ImageManager, syncFn, { sourceUrl, fillGapWithAI: fillGap });
                appendLog(`🔗 [풀오토] URL 이미지 자동 수집 완료 (fillgap=${fillGap ? 'ON' : 'OFF'})`);
            }
            else {
                appendLog(`⚠️ [풀오토] runAutoImageSearch 미로드 — 스킵`);
            }
        }
    }
    catch (e) {
        appendLog(`⚠️ [풀오토] URL 이미지 수집 실패: ${e?.message?.slice(0, 80)}`);
    }
    if (result.content.collectedImages && result.content.collectedImages.length > 0) {
        console.log(`[FullAuto] 수집된 이미지 ${result.content.collectedImages.length}장을 참조 이미지로 등록합니다.`);
        const win = window;
        const existingUrls = new Set([...generatedImages, ...(win.imageManagementGeneratedImages || [])]);
        const newImages = result.content.collectedImages.filter((url) => !existingUrls.has(url));
        if (newImages.length > 0) {
            generatedImages.push(...newImages);
            if (!win.imageManagementGeneratedImages)
                win.imageManagementGeneratedImages = [];
            win.imageManagementGeneratedImages.push(...newImages);
            appendLog(`📸 쇼핑몰/사이트에서 ${newImages.length}장의 제품 이미지를 확보했습니다.`);
        }
    }
    const tableEnhancedContent = applyPendingArticleTablesToGeneratedContent(result.content);
    console.log('[FullAuto] 구조화 콘텐츠 생성 완료:', tableEnhancedContent);
    return tableEnhancedContent;
}
async function displayContentInAllTabs(structuredContent) {
    appendLog('📋 생성된 콘텐츠를 통합 탭에 표시합니다.');
    updateUnifiedPreview(structuredContent);
    if (structuredContent.headings && structuredContent.headings.length > 0) {
        updateUnifiedImagePreview(structuredContent.headings);
    }
    appendLog('✅ 콘텐츠 표시가 완료되었습니다.');
    console.log('[Unified] 통합 탭 콘텐츠 표시 완료');
}
async function generateImagesForContent(structuredContent, formData) {
    if (!structuredContent) {
        appendLog('⚠️ 구조화된 콘텐츠가 없어 이미지 생성을 건너뜁니다.');
        console.warn('[FullAuto] structuredContent is undefined, skipping image generation');
        throw new Error('이미지 생성에 사용할 콘텐츠 구조가 없습니다.');
    }
    if (formData.skipImages) {
        appendLog('🚫 이미지 생성을 건너뜁니다.');
        console.log('[FullAuto] 이미지 생성 건너뜀');
        return [];
    }
    const headings = structuredContent.headings || [];
    if (headings.length === 0) {
        appendLog('⚠️ 소제목이 없어 이미지 생성을 중단합니다.');
        console.log('[FullAuto] 소제목이 없어 이미지 생성 중단');
        throw new Error('이미지 생성을 위한 소제목이 없습니다.');
    }
    appendLog(`🎨 ${headings.length}개 소제목의 이미지를 생성합니다.`);
    if (formData.imageSource === 'local-folder') {
        const loadLocalFolderWithFallback = window.loadLocalFolderWithFallback;
        if (!loadLocalFolderWithFallback)
            throw new Error('loadLocalFolderWithFallback 함수가 아직 로드되지 않았습니다');
        const lfResult = await loadLocalFolderWithFallback({
            headings,
            postTitle: currentStructuredContent?.selectedTitle || formData.postTitle || '',
            onLog: (msg) => appendLog(msg),
            aiFallbackFn: async (provider, missingHeadings, title, opts) => {
                formData.imageSource = provider;
                return await generateAIImagesForHeadings(missingHeadings, formData);
            },
        });
        if (lfResult.images.length > 0) {
            try {
                displayGeneratedImages(lfResult.images);
            }
            catch { }
            try {
                updatePromptItemsWithImages(lfResult.images);
            }
            catch { }
            window.generatedImages = lfResult.images;
            window.imageManagementGeneratedImages = lfResult.images;
        }
        else {
            throw new Error('로컬 폴더/AI 대체 이미지 생성 결과가 비어있습니다.');
        }
        return lfResult.images;
    }
    const sourceDisplayNames = {
        'local-folder': '📂 내 폴더 (로컬 이미지)',
        'pollinations': 'Pollinations (FLUX, 무료)',
        'nano-banana-pro': '나노 바나나 프로 (Gemini API 키, 과금 가능)',
        'stability': 'Stability AI',
        'prodia': 'Prodia AI',
        'deepinfra': 'FLUX-2 (DeepInfra)',
        'falai': 'Fal.ai FLUX',
    };
    appendLog(`📸 이미지 소스: ${sourceDisplayNames[formData.imageSource] || formData.imageSource}`);
    const previewSection = document.getElementById('full-auto-preview-section');
    if (previewSection) {
        updateFullAutoPreview(structuredContent);
    }
    let generatedImages = [];
    generatedImages = await generateAIImagesForHeadings(headings, formData);
    if (!Array.isArray(generatedImages) || generatedImages.length === 0) {
        throw new Error('이미지 생성 결과가 비어있습니다.');
    }
    console.log(`[FullAuto] ${generatedImages.length}개 이미지 생성 완료`);
    appendLog(`✅ ${generatedImages.length}개의 이미지가 생성되었습니다!`);
    if (generatedImages.length > 0) {
        try {
            displayGeneratedImages(generatedImages);
            updatePromptItemsWithImages(generatedImages);
            window.generatedImages = generatedImages;
            window.imageManagementGeneratedImages = generatedImages;
            console.log(`[FullAuto] ✅ 이미지 관리탭 UI 업데이트 완료: ${generatedImages.length}개`);
        }
        catch (uiErr) {
            console.warn('[FullAuto] 이미지 관리탭 UI 업데이트 실패 (발행에는 영향 없음):', uiErr);
        }
    }
    const integratedPreviewEl = document.getElementById('full-auto-integrated-preview');
    if (integratedPreviewEl) {
        updateFullAutoFinalImagePreview(generatedImages);
    }
    return generatedImages;
}
async function generateLibraryImagesForHeadings(headings, formData) {
    const images = [];
    for (const heading of headings) {
        try {
            const extractedKeywords = extractSearchKeywords(heading.title, heading.content);
            appendLog(`🔍 소제목 "${heading.title}"의 검색 키워드: ${extractedKeywords.join(', ')}`);
            const libraryImages = await window.api.getLibraryImages('', extractedKeywords);
            if (libraryImages.length > 0) {
                const selectedImage = libraryImages[0];
                images.push({
                    heading: heading.title,
                    filePath: selectedImage.url,
                    provider: 'library',
                    alt: selectedImage.sourceTitle || heading.title,
                    previewDataUrl: selectedImage.previewDataUrl || selectedImage.url
                });
            }
        }
        catch (error) {
            console.warn(`[FullAuto] 라이브러리 이미지 검색 실패 (${heading.title}):`, error);
        }
    }
    return images;
}
async function generateAIImagesForHeadings(headings, formData) {
    formData = createPipelineFormDataSnapshot('full-auto', formData || {});
    if (!headings || !Array.isArray(headings)) {
        console.warn('[AI Images] headings is undefined or not an array, failing image generation');
        appendLog('⚠️ 소제목 정보가 없어 이미지 생성을 중단합니다.');
        throw new Error('이미지 생성을 위한 소제목 정보가 없습니다.');
    }
    // [Phase 7.1-d] Raw accessor fallbacks — formData (flow-entry snapshot)
    // stays first; raw reads cover un-populating callers (image-narrative).
    const _skipImagesFlag = formData.skipImages === true;
    if (_skipImagesFlag) {
        console.log('[AI Images] 🚫 skipImages/textOnlyPublish=true → 유료 이미지 API 호출 차단');
        appendLog('🚫 이미지 없이 발행: generateAIImagesForHeadings 호출 차단 (유료 API 비용 방지)');
        return [];
    }
    const _resolvedHeadingImageMode = formData.headingImageMode;
    const _thumbnailOnly = formData.thumbnailOnly === true || _resolvedHeadingImageMode === 'thumbnail-only';
    const _headingImageMode = _resolvedHeadingImageMode || 'all';
    if (_headingImageMode === 'none') {
        console.log('[AI Images] 🚫 headingImageMode=none → 이미지 생성 전체 스킵');
        appendLog('🚫 이미지 없이 모드: 소제목 이미지 생성 건너뜁니다.');
        return [];
    }
    if (_thumbnailOnly) {
        console.log(`[AI Images] 📷 thumbnailOnly=true → 소제목 ${headings.length}개 스킵, 전용 썸네일만 생성`);
        appendLog(`📷 썸네일만 생성 모드: 소제목 이미지 ${headings.length}개 생성을 건너뜁니다.`);
        headings = [];
    }
    const imageSource = formData.imageSource;
    const imageStyle = formData.imageStyle;
    const imageRatio = formData.imageRatio;
    const imageFallbackPolicy = formData.imageFallbackPolicy;
    console.log(`[AI Images] 이미지 생성 시작 - 소스: ${imageSource}, 스타일: ${imageStyle}, 비율: ${imageRatio}, 폴백정책: ${imageFallbackPolicy}, 소제목 개수: ${headings.length}`);
    const sourceNames = {
        'local-folder': '📂 내 폴더 (로컬)',
        'pollinations': 'Pollinations (FLUX, 무료)',
        'nano-banana-pro': '나노 바나나 프로 (Gemini Native)',
        'prodia': 'Prodia (과금 가능)',
        'stability': 'Stability AI',
        'deepinfra': 'DeepInfra FLUX-2 (과금 가능)',
        'deepinfra-flux': 'DeepInfra FLUX-2 (과금 가능)',
        'falai': 'Fal.ai FLUX (과금 가능)',
        'naver-search': '네이버 이미지 검색',
        'naver': '네이버 이미지 검색',
        'imagefx': 'ImageFX (Google Labs, 제한 가능)',
        'flow': 'Flow (Nano Banana Pro, AI Pro 무료)',
        'openai-image': 'OpenAI DALL-E',
        'leonardoai': 'Leonardo AI',
    };
    appendLog(`🎨 ${sourceNames[imageSource] || imageSource}로 ${headings.length}개 이미지 생성 시작...`);
    appendLog('🧵 안정성을 위해 이미지는 1개씩 순차 생성합니다.');
    let completedCount = 0;
    const progressStart = 45;
    const progressEnd = 70;
    const existingImages = window.imageManagementGeneratedImages || [];
    const hasManualThumbnail = existingImages.length > 0 && (existingImages[0]?.isManualThumbnail === true ||
        existingImages[0]?.source === 'manual' ||
        existingImages[0]?.source === 'thumbnail-generator');
    if (hasManualThumbnail) {
        appendLog(`🎨 수동 설정 썸네일 감지됨 → 썸네일(0번) 건너뛰고 1번 소제목부터 이미지 생성`);
        console.log(`[AI Images] ✅ 수동 썸네일 감지: 첫 번째 이미지 건너뛰기`);
    }
    const thumbnailTextCheckbox = document.getElementById('thumbnail-text-option');
    const thumbnailFromStorage = _rawPipeline.thumbnailTextInclude === 'true';
    const isShoppingConnect = formData.isShoppingConnect === true || formData.contentMode === 'affiliate';
    const SC_FAKE_AI_ENGINES = [
        'imagefx', 'dall-e-3', 'leonardoai', 'deepinfra', 'deepinfra-flux',
        'stability', 'falai', 'prodia', 'pollinations', 'flow',
    ];
    if (isShoppingConnect && SC_FAKE_AI_ENGINES.includes(imageSource)) {
        console.log(`[AI Images] 🛒 쇼핑커넥트 + ${imageSource}: img2img 미지원 — 사용자 선택 그대로 실행 (제품 정확도 미보장)`);
        appendLog(`⚠️ "${imageSource}"는 img2img 미지원 — 제품 외형이 다르게 생성될 수 있습니다. 정확한 재현을 원하시면 [🍌 나노바나나] 또는 [🦆 덕트테이프]를 선택하세요.`);
    }
    const includeThumbnailText = isShoppingConnect ? true : (formData.includeThumbnailText ??
        thumbnailFromStorage ??
        thumbnailTextCheckbox?.checked ?? false);
    if (isShoppingConnect) {
        console.log(`[AI Images] ✅ 쇼핑커넥트 모드: 썸네일 텍스트 포함 자동 활성화`);
    }
    let collectedImages = isShoppingConnect
        ? (formData.collectedImages || currentStructuredContent?.collectedImages || currentStructuredContent?.images || [])
        : [];
    if (isShoppingConnect && collectedImages.length === 0) {
        console.log(`[AI Images] ⚠️ 수집된 이미지 없음 - AI 생성으로 진행`);
        appendLog(`⚠️ 수집된 이미지가 없습니다. AI 이미지 생성으로 진행합니다.`);
    }
    else if (isShoppingConnect && collectedImages.length > 0) {
        console.log(`[AI Images] ✅ 글 생성 시 수집된 이미지 ${collectedImages.length}개 재사용 (재크롤링 안함)`);
    }
    if (isShoppingConnect && collectedImages.length > 0) {
        appendLog(`🛒 쇼핑 커넥트 모드: ${collectedImages.length}개 수집 이미지를 참조로 사용합니다.`);
        if (collectedImages.length >= headings.length) {
            try {
                appendLog(`🎯 AI 이미지 매칭 중... (소제목에 맞는 이미지 자동 배치)`);
                const headingTitles = headings.map((h) => h.title || h);
                const imageUrls = collectedImages.map((img) => typeof img === 'string' ? img : (img.url || img.filePath || ''));
                const matchResult = await window.api.matchImagesToHeadings(imageUrls, headingTitles);
                if (matchResult.success && matchResult.matches) {
                    const reorderedImages = matchResult.matches.map((imgIndex, headingIndex) => {
                        const originalImg = collectedImages[imgIndex] || collectedImages[headingIndex % collectedImages.length];
                        return {
                            ...(typeof originalImg === 'object' ? originalImg : { url: originalImg }),
                            heading: headingTitles[headingIndex],
                            headingIndex: headingIndex,
                            matchedByAI: true
                        };
                    });
                    const isReviewUrl = (img) => {
                        const u = String(img?.url || img?.filePath || (typeof img === 'string' ? img : '') || '');
                        return /image\.nmv|checkout\.phinf/i.test(u);
                    };
                    const galleryFirst = [
                        ...reorderedImages.filter((img) => !isReviewUrl(img)),
                        ...reorderedImages.filter((img) => isReviewUrl(img)),
                    ];
                    galleryFirst.forEach((img, i) => {
                        img.headingIndex = i;
                        img.heading = headingTitles[i] ?? img.heading;
                    });
                    collectedImages = galleryFirst;
                    const galleryCount = galleryFirst.filter((img) => !isReviewUrl(img)).length;
                    appendLog(`✅ AI 매칭 완료: 추가이미지 ${galleryCount}개 우선 배치 + 리뷰 이미지는 뒤로 정렬`);
                    console.log(`[AI Images] ✅ AI 매칭 + gallery 우선 정렬 결과:`, matchResult.matches);
                }
            }
            catch (matchError) {
                console.warn(`[AI Images] ⚠️ AI 매칭 실패, 순차 배치 유지:`, matchError);
            }
        }
    }
    let dedicatedShopThumbnail = null;
    if (isShoppingConnect && collectedImages.length > 0) {
        const firstCollected = collectedImages[0];
        const thumbUrl = typeof firstCollected === 'string' ? firstCollected : (firstCollected?.url || firstCollected?.filePath || firstCollected?.thumbnailUrl || '');
        if (thumbUrl) {
            dedicatedShopThumbnail = {
                url: thumbUrl,
                filePath: thumbUrl,
                heading: (currentStructuredContent?.selectedTitle || formData.postTitle || formData.title || '🖼️ 썸네일'),
                isThumbnail: true,
                isCollectedImage: true,
                source: 'collected',
                provider: 'collected',
            };
            appendLog(`🛒 쇼핑커넥트: 수집 이미지를 썸네일로 사용 (텍스트 오버레이는 발행 시 적용)`);
        }
    }
    else if (!isShoppingConnect) {
        try {
            let shopTitle = currentStructuredContent?.selectedTitle || formData.postTitle || formData.title || '';
            if (/^https?:\/\//i.test(shopTitle.trim())) {
                console.warn(`[FullAuto] ⚠️ shopTitle이 URL이므로 빈 문자열로 대체: "${shopTitle.substring(0, 60)}"`);
                shopTitle = '';
            }
            const isNanoBanana = imageSource === 'nano-banana-pro' || imageSource === 'pollinations';
            const thumbnailAllowText = includeThumbnailText;
            appendLog(`🖼️ 전용 AI 썸네일 생성 중... (블로그 제목 기반 AI 추론)`);
            let thumbnailPrompt;
            try {
                const aiTranslated = await generateEnglishPromptForHeading(shopTitle, formData.keywords, imageStyle);
                thumbnailPrompt = aiTranslated;
                appendLog(`🎨 AI 썸네일 프롬프트: "${aiTranslated.substring(0, 50)}..."`);
            }
            catch {
                thumbnailPrompt = `eye-catching blog thumbnail, visual metaphor for: ${shopTitle}, cinematic lighting, compelling composition, hero image style`;
                appendLog(`⚠️ AI 프롬프트 생성 실패 → 기본 프롬프트 사용`);
            }
            const thumbResult = await generateImagesWithCostSafety({
                provider: imageSource,
                items: [{
                        heading: shopTitle || '블로그 썸네일',
                        prompt: thumbnailPrompt,
                        englishPrompt: thumbnailPrompt,
                        isThumbnail: true,
                        allowText: thumbnailAllowText,
                    }],
                postTitle: shopTitle,
                isFullAuto: formData.mode === 'full-auto',
                longRunImageGeneration: true,
                isContinuousMode: !!isContinuousMode,
                imageRatio: globalSettings.thumbnailRatio || globalSettings.imageRatio || '1:1',
                thumbnailTextInclude: includeThumbnailText,
                imageFallbackPolicy,
                imageGenerationTimeoutMs: getFullAutoThumbnailImageTimeoutMs(imageSource),
            });
            if (thumbResult?.success && thumbResult.images && thumbResult.images.length > 0) {
                dedicatedShopThumbnail = {
                    ...thumbResult.images[0],
                    heading: shopTitle || '🖼️ 썸네일',
                    isThumbnail: true,
                };
                appendLog(`✅ 전용 AI 썸네일 생성 완료!`);
            }
            else {
                appendLog(`⚠️ 전용 썸네일 생성 실패 → 썸네일 없이 진행`);
            }
        }
        catch (thumbErr) {
            appendLog(`⚠️ 전용 썸네일 생성 오류: ${thumbErr.message}`);
        }
    }
    const generateOne = async (heading, i) => {
        try {
            if (isFullAutoStopRequested()) {
                appendLog(`⏹️ 이미지 생성 중지됨 (${i + 1}/${headings.length})`);
                return [];
            }
            const headingTitle = heading.title || heading || `이미지 ${i + 1}`;
            appendLog(`🎨 [${i + 1}/${headings.length}] "${String(headingTitle).substring(0, 20)}" 이미지 생성 시작...`);
            const isThumbnail = false;
            const shouldIncludeText = false;
            const useAiImageChecked = document.getElementById('unified-use-ai-image')?.checked ?? true;
            const englishPrompt = await generateEnglishPromptForHeading(heading, formData.keywords, imageStyle);
            console.log(`[AI Images] ${i + 1}/${headings.length} - 스타일: ${imageStyle}, 프롬프트: ${englishPrompt}`);
            console.log(`[AI Images] ${i + 1}번 소제목 - heading: "${heading.title}", isThumbnail: ${isThumbnail}, allowText: ${shouldIncludeText}, useAiImage: ${useAiImageChecked} (쇼핑커넥트: ${isShoppingConnect})`);
            let ref = {};
            if (isShoppingConnect && collectedImages.length > 0) {
                const refImg = collectedImages[i % collectedImages.length];
                const refUrl = typeof refImg === 'string' ? refImg : (refImg?.url || refImg?.filePath || refImg?.thumbnailUrl);
                if (refUrl) {
                    ref = { referenceImagePath: refUrl };
                    console.log(`[AI Images] 🛒 쇼핑 커넥트 참조 이미지 적용: ${refUrl}`);
                }
            }
            else {
                ref = await resolveReferenceImageForHeadingAsync(String(heading.title || heading || '').trim());
            }
            if (isShoppingConnect && collectedImages.length > 0 && !useAiImageChecked) {
                const collectedImg = collectedImages[i % collectedImages.length];
                const imgUrl = typeof collectedImg === 'string' ? collectedImg : (collectedImg?.url || collectedImg?.filePath || collectedImg?.thumbnailUrl || '');
                if (imgUrl) {
                    console.log(`[AI Images] 🛒 쇼핑커넥트: ${i + 1}번 → 수집 이미지 직접 사용: ${imgUrl.substring(0, 60)}...`);
                    appendLog(`✅ [${i + 1}/${headings.length}] "${String(headingTitle).substring(0, 20)}" 수집 이미지 적용 완료!`);
                    completedCount++;
                    const currentProgress = progressStart + ((progressEnd - progressStart) * (completedCount / headings.length));
                    showUnifiedProgress(Math.round(currentProgress), `이미지 적용 중... (${completedCount}/${headings.length})`, `\"${heading.title}\" 수집 이미지 적용 완료`);
                    return [{
                            heading: heading.title,
                            headingIndex: i,
                            url: imgUrl,
                            filePath: imgUrl,
                            isCollectedImage: true,
                            isThumbnail: false,
                            source: 'collected'
                        }];
                }
            }
            const imageResult = await generateImagesWithCostSafety({
                provider: imageSource,
                items: [{
                        heading: heading.title,
                        prompt: englishPrompt,
                        englishPrompt: englishPrompt,
                        isThumbnail: false,
                        allowText: false,
                        imageStyle: imageStyle,
                        imageRatio: globalSettings.subheadingRatio || imageRatio,
                        ...ref,
                    }],
                postTitle: currentStructuredContent?.selectedTitle,
                postId: currentPostId || undefined,
                isFullAuto: formData.mode === 'full-auto',
                longRunImageGeneration: true,
                isContinuousMode: !!isContinuousMode,
                isShoppingConnect: isShoppingConnect,
                collectedImages: collectedImages,
                thumbnailTextInclude: false,
                imageFallbackPolicy,
                imageGenerationTimeoutMs: getFullAutoBodyImageTimeoutMs(imageSource, 1),
            });
            completedCount++;
            const currentProgress = progressStart + ((progressEnd - progressStart) * (completedCount / headings.length));
            showUnifiedProgress(Math.round(currentProgress), `이미지 생성 중... (${completedCount}/${headings.length})`, `\"${heading.title}\" 이미지 생성 완료`);
            console.log(`[AI Images] ${i + 1}/${headings.length} - 결과:`, imageResult.success ? '성공' : '실패');
            if (imageResult.success && imageResult.images && imageResult.images.length > 0) {
                appendLog(`✅ [${i + 1}/${headings.length}] "${String(headingTitle).substring(0, 20)}" 이미지 생성 완료!`);
                return imageResult.images.map((img) => ({ ...img, isThumbnail: false }));
            }
            else {
                const msg = imageResult?.message || '이미지 생성 결과가 비어있습니다.';
                appendLog(`⚠️ [${i + 1}/${headings.length}] "${String(headingTitle).substring(0, 20)}" 이미지 생성 실패 — 발행 중단: ${msg}`);
                throw new Error(msg);
            }
        }
        catch (error) {
            completedCount++;
            console.warn(`[AI Images] ${i + 1}/${headings.length} 이미지 생성 오류 (${heading.title}):`, error);
            appendLog(`❌ [${i + 1}/${headings.length}] ${friendlyErrorMessage(error)}`);
            throw error;
        }
    };
    const results = [];
    for (let i = 0; i < headings.length; i++) {
        results.push(await generateOne(headings[i], i));
    }
    const images = results.flat();
    const finalImagesWithThumbnail = [
        ...(dedicatedShopThumbnail ? [dedicatedShopThumbnail] : []),
        ...images,
    ];
    console.log(`[AI Images] 이미지 생성 완료 - 총 ${finalImagesWithThumbnail.length}개 생성됨 (썸네일 ${dedicatedShopThumbnail ? '포함' : '미포함'})`);
    return finalImagesWithThumbnail;
}
const PUBLISH_AUTOMATION_TIMEOUT_MS = 1500000;
const DETACHED_LOGIN_FRAME_RETRY_DELAY_MS = 10000;
const MAX_DETACHED_LOGIN_FRAME_RETRIES = 1;
const PUBLISH_SESSION_RECOVERY_RETRY_DELAY_MS = 10000;
const MAX_PUBLISH_SESSION_RECOVERY_RETRIES = 1;
function isDetachedLoginFrameError(message) {
    const normalized = String(message || '').toLowerCase();
    const hasDetachedFrameSignal = normalized.includes('execution context is not available in detached frame') ||
        normalized.includes('detached frame') ||
        normalized.includes('execution context was destroyed') ||
        normalized.includes('cannot find context with specified id') ||
        normalized.includes('frame was detached');
    const hasNaverLoginSignal = normalized.includes('nidlogin.login') ||
        normalized.includes('nid.naver.com') ||
        normalized.includes('naver login');
    return hasDetachedFrameSignal && hasNaverLoginSignal;
}
function getPublishRetryNaverId(payload) {
    return String(payload?.naverId || payload?.accountId || payload?.account?.naverId || '').trim();
}
async function closeBrowserForPublishRetry(payload) {
    const naverId = getPublishRetryNaverId(payload);
    try {
        await window.api?.closeBrowser?.(naverId);
    }
    catch (error) {
        console.warn('[PublishRetry] closeBrowser failed before publish retry:', error);
    }
}
function isPostContentAppliedPublishError(errorMsg) {
    const message = String(errorMsg || '');
    return message.includes('POST_CONTENT_APPLIED') || message.includes('POST_TAIL_INCOMPLETE');
}
function blockPostContentAppliedPublishRetry(errorMsg) {
    if (!isPostContentAppliedPublishError(errorMsg)) {
        return false;
    }
    appendLog('⚠️ 본문 작성 완료 후 발행 단계 오류가 감지되어 자동 재로그인/재작성을 중단합니다.');
    appendLog('   네이버 글쓰기 창의 작성 내용 또는 임시저장 상태를 먼저 확인해주세요.');
    return true;
}
async function retryRunAutomationAfterDetachedLoginFrame(apiClient, payload, errorMsg) {
    if (isPostContentAppliedPublishError(errorMsg)) {
        return null;
    }
    if (!isDetachedLoginFrameError(errorMsg)) {
        return null;
    }
    const retryAttempts = Number(payload._detachedLoginFrameRetryCount || 0);
    if (retryAttempts >= MAX_DETACHED_LOGIN_FRAME_RETRIES) {
        return null;
    }
    const nextAttempt = retryAttempts + 1;
    appendLog(`⚠️ 네이버 로그인 프레임이 새로고침되어 발행 연결이 끊겼습니다: ${errorMsg.substring(0, 80)}`);
    appendLog(`🔄 브라우저 세션을 정리하고 ${DETACHED_LOGIN_FRAME_RETRY_DELAY_MS / 1000}초 후 발행을 1회 재시도합니다. (${nextAttempt}/${MAX_DETACHED_LOGIN_FRAME_RETRIES})`);
    showUnifiedProgress(88, '로그인 프레임 복구 중...', '네이버 로그인 화면이 갱신되어 브라우저 세션을 다시 준비합니다.');
    await closeBrowserForPublishRetry(payload);
    await new Promise(resolve => setTimeout(resolve, DETACHED_LOGIN_FRAME_RETRY_DELAY_MS));
    const retryPayload = {
        ...payload,
        _detachedLoginFrameRetryCount: nextAttempt,
    };
    const retryResponse = await apiClient.call('runAutomation', [retryPayload], {
        retryCount: 0,
        retryDelay: 5000,
        timeout: PUBLISH_AUTOMATION_TIMEOUT_MS,
    });
    if (retryResponse.success && retryResponse.data?.success) {
        appendLog('✅ 로그인 프레임 복구 후 발행 재시도에 성공했습니다.');
        return retryResponse.data;
    }
    const retryErrorMsg = retryResponse.error || retryResponse.data?.message || '로그인 프레임 복구 재시도 실패';
    appendLog(`❌ 로그인 프레임 복구 재시도 실패: ${retryErrorMsg}`);
    throw new Error(retryErrorMsg);
}
function isRecoverablePublishAutomationError(errorMsg) {
    if (isPostContentAppliedPublishError(errorMsg)) {
        return false;
    }
    const normalized = String(errorMsg || '').toLowerCase();
    const userActionRequiredSignals = [
        'captcha',
        'security verification',
        'authentication required',
        'auth required',
        '보안인증',
        '보안 인증',
        '인증이 필요',
        '사용자가 작업을 취소',
        'cancelled',
        'canceled',
        '이미 자동화가 실행 중',
        'category_not_found',
        'publish_condition',
        'pre_publish_blocked',
        'image upload',
        'unsupported image',
        'file too large',
        '이미지 업로드',
        '이미지 파일',
    ];
    if (userActionRequiredSignals.some((signal) => normalized.includes(signal.toLowerCase()))) {
        return false;
    }
    const recoverableSignals = [
        '브라우저 세션이 종료',
        '세션이 종료',
        'target closed',
        'protocol error',
        'session closed',
        'connection closed',
        'browser is closed',
        'page is closed',
        'execution context was destroyed',
        'cannot find context',
        'detached frame',
        '제목 입력 필드를 찾을 수 없습니다',
        'documenttitle',
        '.se-section-documenttitle',
        'postwriteform',
        'smarteditor',
        'naverwriteeditor',
    ];
    return recoverableSignals.some((signal) => normalized.includes(signal.toLowerCase()));
}
function shouldCloseBrowserBeforePublishRetry(errorMsg) {
    const normalized = String(errorMsg || '').toLowerCase();
    const editorNotReadySignals = [
        '?쒕ぉ ?낅젰 ?꾨뱶瑜?李얠쓣 ???놁뒿?덈떎',
        '제목 입력 필드를 찾을 수 없습니다',
        'documenttitle',
        '.se-section-documenttitle',
        'postwriteform',
        'smarteditor',
        'naverwriteeditor',
        'selectors=[',
    ];
    if (editorNotReadySignals.some((signal) => normalized.includes(signal.toLowerCase()))) {
        return false;
    }
    const hardSessionSignals = [
        '釉뚮씪?곗? ?몄뀡??醫낅즺',
        '?몄뀡??醫낅즺',
        '브라우저 세션이 종료',
        '세션이 종료',
        'target closed',
        'protocol error',
        'session closed',
        'connection closed',
        'browser is closed',
        'page is closed',
        'execution context was destroyed',
        'cannot find context',
        'detached frame',
    ];
    return hardSessionSignals.some((signal) => normalized.includes(signal.toLowerCase()));
}
async function retryRunAutomationAfterRecoverablePublishFailure(apiClient, payload, errorMsg) {
    if (isPostContentAppliedPublishError(errorMsg)) {
        return null;
    }
    if (!isRecoverablePublishAutomationError(errorMsg)) {
        return null;
    }
    const retryAttempts = Number(payload._publishSessionRecoveryRetryCount || 0);
    if (retryAttempts >= MAX_PUBLISH_SESSION_RECOVERY_RETRIES) {
        return null;
    }
    const nextAttempt = retryAttempts + 1;
    appendLog(`🔄 브라우저/에디터 세션이 끊겨 발행을 복구합니다: ${String(errorMsg || '').substring(0, 100)}`);
    const closeBeforeRetry = shouldCloseBrowserBeforePublishRetry(errorMsg);
    if (closeBeforeRetry) {
        appendLog(`🔄 브라우저 세션을 정리하고 ${PUBLISH_SESSION_RECOVERY_RETRY_DELAY_MS / 1000}초 후 같은 글/이미지로 1회 재시도합니다. (${nextAttempt}/${MAX_PUBLISH_SESSION_RECOVERY_RETRIES})`);
    }
    else {
        appendLog(`🔄 에디터가 아직 준비되지 않아 같은 브라우저에서 다시 시도합니다. (${nextAttempt}/${MAX_PUBLISH_SESSION_RECOVERY_RETRIES})`);
    }
    showUnifiedProgress(88, '브라우저 세션 복구 중...', '글과 이미지는 유지한 채 네이버 발행 브라우저만 다시 준비합니다.');
    if (closeBeforeRetry) {
        await closeBrowserForPublishRetry(payload);
    }
    await new Promise(resolve => setTimeout(resolve, PUBLISH_SESSION_RECOVERY_RETRY_DELAY_MS));
    const retryPayload = {
        ...payload,
        _publishSessionRecoveryRetryCount: nextAttempt,
    };
    const retryResponse = await apiClient.call('runAutomation', [retryPayload], {
        retryCount: 0,
        retryDelay: 5000,
        timeout: PUBLISH_AUTOMATION_TIMEOUT_MS,
    });
    if (retryResponse.success && retryResponse.data?.success) {
        appendLog('✅ 브라우저 세션 복구 후 발행 재시도에 성공했습니다.');
        return retryResponse.data;
    }
    const retryErrorMsg = retryResponse.error || retryResponse.data?.message || '브라우저 세션 복구 재시도 실패';
    appendLog(`❌ 브라우저 세션 복구 재시도도 실패했습니다: ${String(retryErrorMsg).substring(0, 120)}`);
    throw new Error(retryErrorMsg);
}
async function executeBlogPublishing(structuredContent, generatedImages, formData) {
    formData = createPipelineFormDataSnapshot('full-auto', formData || {});
    if (window.stopFullAutoPublish === true) {
        appendLog('⏹️ 발행 시작 전 취소 감지 → 건너뜁니다.');
        throw new Error('사용자가 작업을 취소했습니다.');
    }
    const pipelineCfg = formData.pipelineConfigSnapshot;
    const modal = resolveFullAutoProgressModal(
        window.currentProgressModal,
        window.isContinuousMode === true,
    );
    appendLog('📤 블로그 발행을 준비합니다.');
    showUnifiedProgress(85, '블로그 발행 준비 중...', '네이버 계정 정보를 확인하고 있습니다.');
    modal?.setProgress(60, '네이버 계정 확인 중...');
    const naverIdInput = document.getElementById('naver-id');
    const naverPasswordInput = document.getElementById('naver-password');
    let naverId;
    let naverPassword;
    if (naverIdInput && naverIdInput.value.trim()) {
        naverId = naverIdInput.value.trim();
    }
    if (naverPasswordInput && naverPasswordInput.value.trim()) {
        naverPassword = naverPasswordInput.value.trim();
    }
    if (!naverId || !naverPassword) {
        const config = await window.api.getConfig();
        if (config.savedNaverId && !naverId) {
            naverId = config.savedNaverId;
        }
        if (config.savedNaverPassword && !naverPassword) {
            naverPassword = config.savedNaverPassword;
        }
    }
    if (!naverId || !naverPassword) {
        appendLog('❌ 네이버 계정 정보가 설정되지 않았습니다.');
        appendLog('💡 네이버 아이디와 비밀번호를 입력 필드에 입력하거나, "기억하기"를 체크하여 저장해주세요.');
        throw new Error('네이버 아이디와 비밀번호가 설정되지 않았습니다.');
    }
    appendLog('🔐 네이버 계정 정보를 확인했습니다.');
    showUnifiedProgress(87, '페이로드 구성 중...', '발행할 콘텐츠를 준비하고 있습니다.');
    let ctaText = formData.ctaText;
    let ctaLink = formData.ctaLink;
    if (!ctaText || !ctaLink) {
        const autoCTA = generateAutoCTA(structuredContent.selectedTitle || '', '');
        ctaText = ctaText || autoCTA.ctaText;
        ctaLink = ctaLink || autoCTA.ctaLink;
    }
    if (ctaLink) {
        appendLog(`📢 CTA 버튼 포함: "${ctaText}"`);
    }
    const resolvedCtas = (() => {
        const list = (Array.isArray(formData?.ctas) ? formData.ctas : [])
            .map((c) => ({
            text: String(c?.text || '').trim(),
            link: String(c?.link || '').trim() || undefined,
        }))
            .filter((c) => Boolean(c?.text));
        if (list.length > 0)
            return list;
        const t = String(ctaText || '').trim();
        const l = String(ctaLink || '').trim();
        return t ? [{ text: t, link: l || undefined }] : [];
    })();
    window.generatedImages = null;
    const imagesForPayloadSource = (() => {
        if (Array.isArray(generatedImages) && generatedImages.length > 0) {
            console.log('[executeBlogPublishing] ✅ 파라미터 generatedImages 사용:', generatedImages.length);
            return generatedImages;
        }
        try {
            const fromGlobal = window.imageManagementGeneratedImages;
            if (Array.isArray(fromGlobal) && fromGlobal.length > 0) {
                console.log('[executeBlogPublishing] ✅ imageManagementGeneratedImages에서 이미지 폴백:', fromGlobal.length);
                return fromGlobal;
            }
        }
        catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
        }
        try {
            const fromManager = ImageManager.getAllImages();
            if (Array.isArray(fromManager) && fromManager.length > 0) {
                console.log('[executeBlogPublishing] ✅ ImageManager에서 이미지 폴백:', fromManager.length);
                return fromManager;
            }
        }
        catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
        }
        console.log('[executeBlogPublishing] ⚠️ 이미지 소스 없음');
        return [];
    })();
    const normalizedImagesForPayload = filterImagesForPublish(structuredContent, imagesForPayloadSource)
        .map((img) => {
        const filePath = getFullAutoImagePath(img);
        return {
            ...img,
            filePath,
            savedToLocal: img?.savedToLocal || filePath,
            url: img?.url || filePath,
        };
    })
        .filter((img) => Boolean(img?.filePath));
    let thumbnailPath = window.thumbnailPath || formData.thumbnailPath;
    if (!thumbnailPath && normalizedImagesForPayload && normalizedImagesForPayload.length > 0) {
        const thumbnailImage = normalizedImagesForPayload.find((img) => img.isThumbnail === true);
        const fallbackImage = normalizedImagesForPayload[0];
        const selectedImage = thumbnailImage || fallbackImage;
        thumbnailPath = getFullAutoImagePath(selectedImage);
    }
    if (thumbnailPath) {
        appendLog(`📷 대표사진 설정됨: ${thumbnailPath.substring(0, 50)}...`);
    }
    const _kwTitleOptsRef = window._keywordTitleOptions;
    const _keywordAsTitleLock = _kwTitleOptsRef?.useKeywordAsTitle === true
        || structuredContent?.keywordAsTitleLocked === true;
    const _currentSelectedTitle = String(structuredContent?.selectedTitle || '').trim();
    const preferredTitle = (() => {
        if (_keywordAsTitleLock && _currentSelectedTitle) {
            console.log(`[fullAutoFlow] 🔒 keywordAsTitle lock 활성 — UI 우선 정책 비활성. selectedTitle="${_currentSelectedTitle}" 보존`);
            appendLog(`🔒 키워드 제목 잠금: "${_currentSelectedTitle.substring(0, 40)}..." 보존`);
            return _currentSelectedTitle;
        }
        try {
            const generatedTitleUi = document.getElementById('unified-generated-title')?.value?.trim();
            if (generatedTitleUi) {
                console.log(`[fullAutoFlow] preferredTitle ← unified-generated-title UI: "${generatedTitleUi.substring(0, 40)}..."`);
                return generatedTitleUi;
            }
        }
        catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
        }
        try {
            const unifiedTitleUi = document.getElementById('unified-title')?.value?.trim();
            if (unifiedTitleUi) {
                console.log(`[fullAutoFlow] preferredTitle ← unified-title UI: "${unifiedTitleUi.substring(0, 40)}..."`);
                return unifiedTitleUi;
            }
        }
        catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
        }
        const fromFormData = String(formData?.title || '').trim();
        if (fromFormData) {
            console.log(`[fullAutoFlow] preferredTitle ← formData.title: "${fromFormData.substring(0, 40)}..."`);
            return fromFormData;
        }
        console.log(`[fullAutoFlow] preferredTitle ← structuredContent.selectedTitle: "${_currentSelectedTitle.substring(0, 40)}..."`);
        return _currentSelectedTitle;
    })();
    if (preferredTitle && preferredTitle !== _currentSelectedTitle) {
        console.log(`[fullAutoFlow] selectedTitle 덮어쓰기: "${_currentSelectedTitle.substring(0, 40)}..." → "${preferredTitle.substring(0, 40)}..."`);
        structuredContent.selectedTitle = preferredTitle;
    }
    const preferredContent = (() => {
        try {
            const generatedContentUi = document.getElementById('unified-generated-content')?.value?.trim();
            if (generatedContentUi && generatedContentUi.length > 0)
                return generatedContentUi;
        }
        catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
        }
        try {
            const postContentUi = document.getElementById('post-content')?.value?.trim();
            if (postContentUi && postContentUi.length > 0)
                return postContentUi;
        }
        catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
        }
        return structuredContent.content || structuredContent.bodyPlain || '';
    })();
    const preferredHashtags = (() => {
        try {
            const hashtagsUi = document.getElementById('unified-generated-hashtags')?.value?.trim();
            if (hashtagsUi) {
                return hashtagsUi.split(/[,\s#]+/).map(h => h.trim()).filter(h => h.length > 0);
            }
        }
        catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
        }
        try {
            const postTagsUi = document.getElementById('post-tags')?.value?.trim();
            if (postTagsUi) {
                return postTagsUi.split(/[,\s#]+/).map(h => h.trim()).filter(h => h.length > 0);
            }
        }
        catch (e) {
            console.warn('[fullAutoFlow] catch ignored:', e);
        }
        return resolveFallbackHashtags(structuredContent, formData);
    })();
    if (preferredContent) {
        structuredContent.content = preferredContent;
        structuredContent.bodyPlain = preferredContent;
        if (!structuredContent._bodyManuallyEdited) {
            structuredContent._bodyManuallyEdited = true;
            console.log('[executeBlogPublishing] ✅ _bodyManuallyEdited 강제 설정 (preferredContent 존재)');
        }
    }
    if (preferredHashtags && preferredHashtags.length > 0) {
        structuredContent.hashtags = preferredHashtags;
    }
    const rawContent = structuredContent.content || structuredContent.bodyPlain || '';
    const cleanedContent = normalizeReadableBodyText(rawContent);
    structuredContent.bodyPlain = cleanedContent;
    structuredContent.content = cleanedContent;
    if (structuredContent.headings && Array.isArray(structuredContent.headings) && cleanedContent) {
        for (let i = 0; i < structuredContent.headings.length; i++) {
            const heading = structuredContent.headings[i];
            if (!heading?.title)
                continue;
            const escapedTitle = heading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const titlePattern = new RegExp(`${escapedTitle}\\s*:?\\s*`, 'i');
            const titleMatch = cleanedContent.match(titlePattern);
            if (titleMatch && titleMatch.index !== undefined) {
                const startIdx = titleMatch.index + titleMatch[0].length;
                let endIdx = cleanedContent.length;
                if (i < structuredContent.headings.length - 1) {
                    const nextTitle = structuredContent.headings[i + 1]?.title;
                    if (nextTitle) {
                        const nextEscaped = nextTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const nextPattern = new RegExp(`${nextEscaped}\\s*:?\\s*`, 'i');
                        const nextMatch = cleanedContent.substring(startIdx).match(nextPattern);
                        if (nextMatch && nextMatch.index !== undefined) {
                            endIdx = startIdx + nextMatch.index;
                        }
                    }
                }
                const newContent = cleanedContent.substring(startIdx, endIdx).trim();
                if (newContent.length > 10) {
                    heading.content = newContent;
                }
            }
        }
        console.log('[executeBlogPublishing] ✅ headings[].content 재파싱 완료');
    }
    console.log('[executeBlogPublishing] rawContent 길이:', rawContent.length);
    console.log('[executeBlogPublishing] cleanedContent 길이:', cleanedContent.length);
    if (!cleanedContent || cleanedContent.length < 10) {
        appendLog(`⚠️ 본문 내용이 비어있거나 너무 짧습니다. (${cleanedContent.length}자)`);
        console.warn('[executeBlogPublishing] 본문 내용 부족:', {
            content: structuredContent.content?.substring(0, 100),
            bodyPlain: structuredContent.bodyPlain?.substring(0, 100)
        });
    }
    console.log('[executeBlogPublishing] 📊 IPC 전송 직전 상태:', {
        _bodyManuallyEdited: structuredContent._bodyManuallyEdited,
        bodyPlainLength: structuredContent.bodyPlain?.length || 0,
        headingsCount: structuredContent.headings?.length || 0,
        headingsContentLengths: (structuredContent.headings || []).map((h) => ({
            title: h.title?.substring(0, 20),
            contentLen: h.content?.length || 0,
        })),
        publishMode: formData.publishMode,
        scheduleDate: formData.scheduleDate,
        scheduleTime: formData.scheduleTime,
    });
    const ftcCheckboxEl = document.getElementById('unified-ftc-disclosure');
    const ftcTextareaEl = document.getElementById('unified-ftc-text');
    const isAffiliateModeFtc = formData.contentMode === 'affiliate';
    const disclosureCfg = pipelineCfg.disclosure;
    let ftcEnabled;
    let ftcSource;
    if (ftcCheckboxEl) {
        ftcEnabled = ftcCheckboxEl.checked;
        ftcSource = 'checkbox';
    }
    else if (disclosureCfg.enabledSetting !== null) {
        ftcEnabled = disclosureCfg.enabledSetting;
        ftcSource = 'PipelineConfig';
    }
    else {
        ftcEnabled = isAffiliateModeFtc;
        ftcSource = isAffiliateModeFtc ? 'mode-default-affiliate' : 'mode-default-other';
    }
    const ftcText = ftcEnabled
        ? (ftcTextareaEl?.value?.trim()
            || disclosureCfg.text
            || (isAffiliateModeFtc ? disclosureCfg.defaultText : ''))
        : '';
    const finalContent = cleanedContent;
    if (ftcEnabled && ftcText) {
        structuredContent.ftcDisclosure = ftcText;
        appendLog(`⚖️ 공정위 문구 설정됨 (${ftcSource}): "${ftcText.substring(0, 30)}..."`);
    }
    else {
        appendLog(`⏭️ 공정위 문구 비활성 (모드='${formData.contentMode || 'normal'}', 결정근거=${ftcSource})`);
    }
    const resolvedBlogCategoryName = String(formData.categoryName || '').trim() || undefined;
    const contentPolicyContext = buildRendererContentPolicyContext({
        title: preferredTitle || structuredContent.selectedTitle || '',
        content: finalContent,
        keywords: formData.keywords || structuredContent.keywords || [],
        structuredContent,
        businessInfo: formData.contentMode === 'business' ? (window._businessInfo || undefined) : undefined,
        contentMode: formData.contentMode || 'seo',
        accountId: naverId,
        blogId: naverId,
        cta: formData.skipCta ? undefined : ctaText,
    });
    const payload = {
        naverId: naverId,
        naverPassword: naverPassword,
        title: preferredTitle || structuredContent.selectedTitle,
        content: finalContent,
        lines: finalContent.split('\n'),
        hashtags: structuredContent.hashtags,
        structuredContent: structuredContent,
        generatedImages: normalizedImagesForPayload,
        imageMode: formData.skipImages ? 'skip' : 'full-auto',
        skipImages: formData.skipImages || false,
        includeFtcDisclosure: ftcEnabled,
        autoGenerate: true,
        publishMode: formData.publishMode,
        scheduleDate: formData.publishMode === 'schedule' ? formData.scheduleDate : undefined,
        scheduleTime: formData.publishMode === 'schedule' ? formData.scheduleTime : undefined,
        scheduleType: formData.publishMode === 'schedule' ? (formData.scheduleType || 'naver-server') : undefined,
        toneStyle: formData.toneStyle,
        postId: currentPostId || undefined,
        thumbnailPath: thumbnailPath,
        categoryName: resolvedBlogCategoryName,
        ...((() => { console.log(`[executeBlogPublishing] 📂 IPC categoryName: "${resolvedBlogCategoryName || '(없음)'}"`); return {}; })()),
        ctaText: formData.skipCta ? undefined : ctaText,
        ctaLink: formData.skipCta ? undefined : ctaLink,
        ctas: formData.skipCta ? [] : resolvedCtas,
        ctaPosition: formData.ctaPosition || 'bottom',
        skipCta: formData.skipCta || false,
        contentMode: formData.contentMode || 'seo',
        affiliateLink: formData.affiliateLink,
        // [2026-06-12] 업체홍보 문의 표 이미지용 — 발행 단계에 연락 채널 전달
        businessInfo: formData.contentMode === 'business' ? (window._businessInfo || undefined) : undefined,
        contentPolicyContext,
        previousPostTitle: formData.previousPostTitle || undefined,
        previousPostUrl: formData.previousPostUrl || undefined,
        customBannerPath: formData.customBannerPath || window.customBannerPath || undefined,
        autoBannerGenerate: formData.autoBannerGenerate || false,
        includeThumbnailText: formData.includeThumbnailText ?? false,
        skipBotBackoff: formData._semiAutoMode === true,
    };
    emitRendererPublishTailDebug('renderer-payload-before-runAutomation', payload, {
        formHashtags: splitHashtagCandidates(formData?.hashtags || formData?.generatedHashtags || []),
        structuredHashtags: splitHashtagCandidates(structuredContent?.hashtags || []),
    });
    if (formData.publishMode === 'schedule') {
        if (!currentPostId) {
            appendLog('⚠️ 글 ID가 없습니다. 자동으로 저장합니다...');
            const postId = saveGeneratedPost(structuredContent);
            if (postId) {
                currentPostId = postId;
                payload.postId = postId;
                appendLog(`💾 글이 자동으로 저장되었습니다 (ID: ${postId})`);
            }
            else {
                appendLog('❌ 글 저장에 실패했습니다. 예약 발행이 정상적으로 작동하지 않을 수 있습니다.');
            }
        }
        const generatedPosts = JSON.parse(localStorage.getItem(GENERATED_POSTS_KEY) || '[]');
        const postExists = generatedPosts.some((p) => p.id === currentPostId);
        if (postExists) {
            appendLog(`📝 예약 발행 글 ID: ${currentPostId} (localStorage 확인 완료)`);
            console.log('[Publish] 예약 발행 postId:', currentPostId, 'localStorage 존재:', true);
        }
        else {
            appendLog(`⚠️ localStorage에 글이 없습니다. 다시 저장합니다...`);
            console.warn('[Publish] localStorage에 postId가 없음:', currentPostId);
            const newPostId = saveGeneratedPost(structuredContent);
            if (newPostId) {
                currentPostId = newPostId;
                payload.postId = newPostId;
                appendLog(`💾 글이 다시 저장되었습니다 (ID: ${newPostId})`);
            }
        }
    }
    appendLog('🚀 블로그 자동화를 시작합니다...');
    if (typeof window.ImageManager !== 'undefined' && window.ImageManager.imageMap) {
        console.log('[Renderer] 블로그 발행 시작 전 ImageManager 동기화 시도...');
        try {
            await window.api.syncImageManager(window.ImageManager.imageMap);
        }
        catch (e) {
            console.error('[Renderer] ImageManager 동기화 실패:', e);
        }
    }
    modal?.addLog('🔐 네이버 로그인 시도 중...');
    showUnifiedProgress(90, '블로그 발행 시작...', '네이버 블로그에 접속하고 있습니다.');
    const apiClient = EnhancedApiClient.getInstance();
    modal?.setStep(4, 'active', '발행 중...');
    modal?.setProgress(75, '블로그 발행 중...');
    showUnifiedProgress(92, '블로그 로그인 중...', '네이버 계정으로 로그인하고 있습니다.');
    modal?.setProgress(70, '네이버 로그인 중...');
    showUnifiedProgress(95, '콘텐츠 발행 중...', '네이버 블로그에 콘텐츠를 업로드하고 있습니다.');
    window._publishAutomationDispatched = true;
    window._publishAutomationDispatchedAt = Date.now();
    appendLog('📤 네이버 로그인·발행 엔진으로 작업을 전달했습니다.');
    const apiResponse = await apiClient.call('runAutomation', [payload], {
        retryCount: 0,
        retryDelay: 5000,
        timeout: PUBLISH_AUTOMATION_TIMEOUT_MS
    });
    if (!apiResponse.success) {
        const errorMsg = apiResponse.error || '블로그 발행 실패';
        emitRendererPublishTailDebug('renderer-runAutomation-api-error', payload, {
            errorMsg,
            apiSuccess: apiResponse.success,
            responseKeys: Object.keys(apiResponse || {}),
        });
        if (blockPostContentAppliedPublishRetry(errorMsg)) {
            throw new Error(errorMsg);
        }
        const detachedFrameRetryResult = await retryRunAutomationAfterDetachedLoginFrame(apiClient, payload, errorMsg);
        if (detachedFrameRetryResult) {
            return detachedFrameRetryResult;
        }
        const recoverablePublishRetryResult = await retryRunAutomationAfterRecoverablePublishFailure(apiClient, payload, errorMsg);
        if (recoverablePublishRetryResult) {
            return recoverablePublishRetryResult;
        }
        const isNetworkError = errorMsg.includes('ERR_CONNECTION_RESET') ||
            errorMsg.includes('ERR_CONNECTION_REFUSED') ||
            errorMsg.includes('ERR_CONNECTION_TIMED_OUT') ||
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('net::');
        if (isNetworkError) {
            const retryAttempts = payload._networkRetryCount || 0;
            const MAX_NETWORK_RETRIES = 2;
            if (retryAttempts < MAX_NETWORK_RETRIES) {
                const waitSec = (retryAttempts + 1) * 10;
                appendLog(`⚠️ 네트워크 오류 감지: ${errorMsg.substring(0, 60)}`);
                appendLog(`🔄 ${waitSec}초 후 발행을 다시 시도합니다... (${retryAttempts + 1}/${MAX_NETWORK_RETRIES})`);
                showUnifiedProgress(88, `네트워크 오류 → ${waitSec}초 후 재시도...`, `재시도 ${retryAttempts + 1}/${MAX_NETWORK_RETRIES}`);
                await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
                payload._networkRetryCount = retryAttempts + 1;
                appendLog(`🚀 발행 재시도 시작... (${retryAttempts + 1}/${MAX_NETWORK_RETRIES})`);
                const retryResponse = await apiClient.call('runAutomation', [payload], { retryCount: 0, retryDelay: 5000, timeout: 300000 });
                if (retryResponse.success && retryResponse.data?.success) {
                    appendLog(`✅ 재시도 성공! 블로그 발행이 완료되었습니다.`);
                    return retryResponse.data;
                }
                const retryErrorMsg = retryResponse.error || retryResponse.data?.message || '재시도 실패';
                appendLog(`❌ 재시도도 실패했습니다: ${retryErrorMsg}`);
                throw new Error(retryErrorMsg);
            }
        }
        appendLog(`❌ 블로그 발행에 실패했습니다: ${errorMsg}`);
        throw new Error(errorMsg);
    }
    else if (!apiResponse.data?.success) {
        const errorMsg = apiResponse.data?.message || apiResponse.error || '블로그 발행 실패';
        emitRendererPublishTailDebug('renderer-runAutomation-data-error', payload, {
            errorMsg,
            apiSuccess: apiResponse.success,
            dataSuccess: apiResponse.data?.success,
            responseKeys: Object.keys(apiResponse || {}),
            dataKeys: Object.keys(apiResponse.data || {}),
        });
        if (errorMsg.includes('이미 자동화가 실행 중')) {
            appendLog('⚠️ 이전 자동화가 아직 실행 중입니다. 발행이 실행되지 않았습니다.');
            appendLog('💡 잠시 후 다시 시도하거나, 브라우저 닫기 후 재시도해주세요.');
            throw new Error('이전 자동화가 아직 실행 중입니다. 완료 후 다시 시도해주세요.');
        }
        if (blockPostContentAppliedPublishRetry(errorMsg)) {
            throw new Error(errorMsg);
        }
        const detachedFrameRetryResult = await retryRunAutomationAfterDetachedLoginFrame(apiClient, payload, errorMsg);
        if (detachedFrameRetryResult) {
            return detachedFrameRetryResult;
        }
        const recoverablePublishRetryResult = await retryRunAutomationAfterRecoverablePublishFailure(apiClient, payload, errorMsg);
        if (recoverablePublishRetryResult) {
            return recoverablePublishRetryResult;
        }
        const isNetworkError2 = errorMsg.includes('ERR_CONNECTION_RESET') ||
            errorMsg.includes('ERR_CONNECTION_REFUSED') ||
            errorMsg.includes('ERR_CONNECTION_TIMED_OUT') ||
            errorMsg.includes('net::');
        if (isNetworkError2) {
            const retryAttempts = payload._networkRetryCount || 0;
            if (retryAttempts < 2) {
                const waitSec = (retryAttempts + 1) * 10;
                appendLog(`⚠️ 네트워크 오류: ${errorMsg.substring(0, 60)}`);
                appendLog(`🔄 ${waitSec}초 후 발행을 다시 시도합니다... (${retryAttempts + 1}/2)`);
                await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
                payload._networkRetryCount = retryAttempts + 1;
                const retryResponse2 = await apiClient.call('runAutomation', [payload], { retryCount: 0, retryDelay: 5000, timeout: 300000 });
                if (retryResponse2.success && retryResponse2.data?.success) {
                    appendLog(`✅ 재시도 성공!`);
                    return retryResponse2.data;
                }
            }
        }
        try {
            hideUnifiedProgress();
        }
        catch { }
        try {
            hideUnifiedProgress();
        }
        catch { }
        appendLog(`❌ 블로그 발행에 실패했습니다: ${errorMsg}`);
        throw new Error(errorMsg);
    }
    const automationResult = apiResponse.data;
    assertAutomationPublishResult(automationResult, payload);
    window._lastPublishOutcome = 'success';
    emitRendererPublishTailDebug('renderer-runAutomation-success', payload, {
        resultKeys: Object.keys(automationResult || {}),
    });
    showUnifiedProgress(98, '발행 완료 확인...', '블로그 발행이 완료되었는지 확인하고 있습니다.');
    setTimeout(() => {
        showUnifiedProgress(100, '발행 완료!', '🎉 블로그 발행이 성공적으로 완료되었습니다!');
        appendLog('✅ 블로그 발행이 성공적으로 완료되었습니다!');
        console.log('[FullAuto] 블로그 발행 완료');
    }, 500);
    return automationResult;
}
function hydrateNarrativeImageMetadata(image, heading, sourceById) {
    const sourceId = String(image?.blobId || image?.filePath || image?.url || '').trim();
    const source = sourceById.get(sourceId);
    if (!source) {
        return { ...image, heading: image?.heading ?? heading };
    }
    const dataUrl = `data:${source.mimeType};base64,${source.imageBase64}`;
    return {
        ...image,
        heading: image?.heading ?? heading,
        filePath: dataUrl,
        previewDataUrl: dataUrl,
        url: dataUrl,
        provider: 'narrative',
        sourceImageId: source.imageId,
        fileName: source.fileName,
    };
}
async function publishWithImageNarrative(formData) {
    const modal = window.currentProgressModal ?? null;
    appendLog('📸 이미지 추론 글 모드 시작...');
    showUnifiedProgress(10, '이미지 추론 중...', 'Vision AI가 사진을 분석하고 있습니다.');
    modal?.setProgress?.(10, 'Vision 분석 시작...');
    let structuredContent;
    let narrativeImageMap;
    try {
        const imagePayloads = (formData.imageNarrative?.images ?? []).map((img) => ({
            imageId: img.imageId ?? img.id ?? img.name ?? 'img',
            imageBase64: img.imageBase64 ?? img.base64 ?? '',
            mimeType: img.mimeType ?? 'image/jpeg',
            fileName: img.fileName ?? img.name,
        }));
        const manualTitleOverride = getManualTitleOverride(formData);
        const imagePayloadById = new Map(imagePayloads.map((img) => [img.imageId, img]));
        if (imagePayloads.length < 3) {
            throw new Error('이미지 추론 글 모드: 최소 3장의 이미지가 필요합니다.');
        }
        showUnifiedProgress(20, '이미지 분석 요청 중...', `${imagePayloads.length}장을 Vision AI에 전송합니다.`);
        modal?.setProgress?.(20, 'IPC 요청...');
        const ipcResult = await window.api.inferAndWrite({
            images: imagePayloads,
            provider: formData.imageNarrative?.provider ?? 'gemini',
            mode: formData.imageNarrative?.mode ?? 'auto',
            targetChars: formData.targetChars,
            toneStyle: formData.toneStyle,
            context: formData.imageNarrative?.context,
            manualTitle: manualTitleOverride,
            plan: formData.imageNarrative?.plan,
            reviewEdits: formData.imageNarrative?.reviewEdits,
        });
        if (!ipcResult.success || !ipcResult.content) {
            throw new Error(ipcResult.message ?? 'Vision 추론 또는 글 생성에 실패했습니다.');
        }
        structuredContent = ipcResult.content;
        applyManualTitleOverride(structuredContent, manualTitleOverride);
        narrativeImageMap = new Map();
        if (ipcResult.imageMap) {
            for (const [heading, imgs] of Object.entries(ipcResult.imageMap)) {
                narrativeImageMap.set(heading, imgs.map((img) => hydrateNarrativeImageMetadata(img, heading, imagePayloadById)));
            }
        }
    }
    catch (err) {
        appendLog(`❌ 이미지 추론 실패: ${err.message}`);
        throw err;
    }
    showUnifiedProgress(55, '글 생성 완료 — 이미지 배치 중...', '소제목별 이미지를 배치하고 있습니다.');
    modal?.setProgress?.(55, '이미지 배치 중...');
    if (narrativeImageMap && narrativeImageMap.size > 0) {
        try {
            ImageManager.clearAll();
            narrativeImageMap.forEach((imgs, heading) => {
                imgs.forEach((img) => ImageManager.addImage(heading, img));
            });
            appendLog(`🖼️ ImageManager에 ${narrativeImageMap.size}개 소제목 이미지 배치 완료`);
        }
        catch (imErr) {
            console.warn('[ImageNarrative] ImageManager 배치 실패 (계속 진행):', imErr);
        }
    }
    currentStructuredContent = structuredContent;
    window.currentStructuredContent = structuredContent;
    const postId = saveGeneratedPost(structuredContent, false, {
        category: formData.category || formData.categoryName,
        contentMode: 'image-narrative',
    });
    if (postId)
        currentPostId = postId;
    await displayContentInAllTabs(structuredContent);
    const newTitle = structuredContent.selectedTitle || structuredContent.title || '';
    if (newTitle && !/^https?:\/\//i.test(newTitle.trim())) {
        const titleInput = document.getElementById('unified-generated-title');
        if (titleInput)
            titleInput.value = newTitle;
        formData.title = newTitle;
    }
    const finalImages = ImageManager.getAllImages() ?? [];
    // Phase 4: "글 생성하기"는 반자동 편집까지만 — 본문/이미지는 통합 탭에 배치된 상태로
    // 멈추고 사용자가 검토 후 직접 발행한다(발행 보류). 풀오토(_generateOnly=false)만 발행.
    if (formData._generateOnly) {
        showUnifiedProgress(100, '글 생성 완료', '반자동 편집 탭에서 확인 후 발행하세요.');
        appendLog(`✅ 사진으로 글생성 완료 — 이미지 ${finalImages.length}개를 소제목에 배치, 반자동 편집/이미지 관리탭 대기 (발행 보류)`);
        return;
    }
    showUnifiedProgress(70, '발행 준비 중...', '네이버 블로그에 발행합니다.');
    modal?.setProgress?.(70, '발행 준비...');
    appendLog(`📤 발행 위임: 이미지 ${finalImages.length}개, 글 "${newTitle.substring(0, 30)}..."`);
    await executeBlogPublishing(structuredContent, finalImages, formData);
}


export { emitLog, resolveImageManagerKeys, isFatalApiError, isRetryableImageError, friendlyErrorMessage, executeFullAutoFlow, executeSemiAutoFlow, updateUnifiedPreview, updateUnifiedImagePreview, initFullAutoImageSourceSelection, initFullAutoExecution, collectFullAutoFormData, validateFullAutoFormData, executeFullAutoAutomation, generateFullAutoContent, displayContentInAllTabs, generateImagesForContent, generateLibraryImagesForHeadings, generateAIImagesForHeadings, executeBlogPublishing };
