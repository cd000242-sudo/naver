// @ts-nocheck
// Restored from dist/renderer/modules/multiAccountManager.js after source encoding damage; keep runtime parity with the last successful build.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initMultiAccountManager = initMultiAccountManager;
exports.generateImagesForAutomation = generateImagesForAutomation;
exports.initMultiAccountPublishModal = initMultiAccountPublishModal;
exports.initMainAccountSelector = initMainAccountSelector;
const time24Select_1 = require("../utils/time24Select");
const MULTI_ACCOUNT_SAFE_MIN_INTERVAL_SEC = 300;
const MULTI_ACCOUNT_SAFE_10_PLUS_INTERVAL_SEC = 420;
const MULTI_ACCOUNT_SAFE_50_PLUS_INTERVAL_SEC = 600;
const MULTI_ACCOUNT_UI_IMAGE_MIN_INTERVAL_SEC = 480;
const MULTI_ACCOUNT_SLOW_IMAGE_MIN_INTERVAL_SEC = 420;
const MULTI_ACCOUNT_UI_IMAGE_SOURCES = new Set(['dropshot', 'flow', 'imagefx']);
const MULTI_ACCOUNT_SLOW_IMAGE_SOURCES = new Set(['nano-banana-pro', 'nano-banana-2', 'openai-image', 'leonardoai']);
const FLOW_AUTOMATION_IMAGE_ITEM_TIMEOUT_MS = 7 * 60 * 1000;
const FLOW_AUTOMATION_BATCH_MAX_TIMEOUT_MS = 18 * 60 * 1000;
function isFlowAutomationProvider(provider) {
    return String(provider || '').trim() === 'flow';
}
function applyIntervalJitter(intervalSeconds, floorSeconds = 1) {
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0)
        return intervalSeconds;
    const jitterFactor = 1 + (Math.random() * 2 - 1) * 0.25;
    const jittered = Math.round(intervalSeconds * jitterFactor);
    return Math.min(86400, Math.max(floorSeconds, jittered));
}
function getSafeMultiAccountInterval(requestedSeconds, totalItems, imageSource) {
    const requested = Number.isFinite(requestedSeconds) ? Math.max(0, Math.floor(requestedSeconds)) : 0;
    let minimum = MULTI_ACCOUNT_SAFE_MIN_INTERVAL_SEC;
    if (totalItems >= 50) {
        minimum = MULTI_ACCOUNT_SAFE_50_PLUS_INTERVAL_SEC;
    }
    else if (totalItems >= 10) {
        minimum = MULTI_ACCOUNT_SAFE_10_PLUS_INTERVAL_SEC;
    }
    const normalizedImageSource = String(imageSource || '').trim();
    if (MULTI_ACCOUNT_UI_IMAGE_SOURCES.has(normalizedImageSource)) {
        minimum = Math.max(minimum, MULTI_ACCOUNT_UI_IMAGE_MIN_INTERVAL_SEC);
    }
    else if (MULTI_ACCOUNT_SLOW_IMAGE_SOURCES.has(normalizedImageSource)) {
        minimum = Math.max(minimum, MULTI_ACCOUNT_SLOW_IMAGE_MIN_INTERVAL_SEC);
    }
    const safe = Math.min(86400, Math.max(requested, minimum));
    const reason = MULTI_ACCOUNT_UI_IMAGE_SOURCES.has(normalizedImageSource)
        ? '브라우저 이미지 엔진 안정화 보호'
        : MULTI_ACCOUNT_SLOW_IMAGE_SOURCES.has(normalizedImageSource)
            ? '이미지 생성 엔진 안정화 보호'
            : totalItems >= 50
                ? '50개 이상 대량 발행 보호'
                : totalItems >= 10
                    ? '10개 이상 장기 발행 보호'
                    : '풀오토 다중계정 기본 보호';
    return { requested, safe, adjusted: safe !== requested, reason };
}
function getSubImageMode() {
    try {
        const mode = resolvePipelineConfig('multi-account').shopping.subImageMode;
        if (mode === 'ai' || mode === 'collected')
            return mode;
    }
    catch { }
    return 'collected';
}
function setSubImageMode(mode) {
    try {
        const w = (typeof window !== 'undefined' ? window : null);
        if (w && typeof w.setSubImageMode === 'function') {
            w.setSubImageMode(mode);
            return;
        }
        localStorage.setItem('scSubImageMode', mode);
        localStorage.setItem('scSubImageSource', mode);
    }
    catch { }
}
async function initMultiAccountManager() {
    console.log('[MultiAccount] 다계정 관리 기능 초기화 시작');
    const accountListContainer = document.getElementById('ar-account-list') || document.getElementById('account-list');
    const noAccountsMessage = document.getElementById('ar-no-accounts-message') || document.getElementById('no-accounts-message');
    const accountStatsSummary = document.getElementById('account-stats-summary');
    const addAccountBtn = document.getElementById('add-account-btn');
    if (!accountListContainer || !addAccountBtn) {
        console.log('[MultiAccount] 다계정 관리 UI 요소를 찾을 수 없습니다.', {
            accountListContainer: !!accountListContainer,
            addAccountBtn: !!addAccountBtn,
        });
        return;
    }
    async function renderAccountList() {
        try {
            const result = await window.api.getAllBlogAccounts();
            if (!result.success || !result.accounts) {
                console.error('[MultiAccount] 계정 목록 로드 실패:', result.message);
                return;
            }
            const accounts = result.accounts;
            console.log('[MultiAccount] 계정 목록 로드:', accounts.length, '개');
            if (accounts.length === 0) {
                accountListContainer.innerHTML = '';
                if (noAccountsMessage)
                    noAccountsMessage.style.display = 'block';
                if (accountStatsSummary)
                    accountStatsSummary.style.display = 'none';
                return;
            }
            if (noAccountsMessage)
                noAccountsMessage.style.display = 'none';
            if (accountStatsSummary)
                accountStatsSummary.style.display = 'block';
            const statsResult = await window.api.getTotalBlogStats();
            if (statsResult.success && statsResult.stats) {
                const stats = statsResult.stats;
                const totalAccountsEl = document.getElementById('stats-total-accounts');
                const activeAccountsEl = document.getElementById('stats-active-accounts');
                const todayPostsEl = document.getElementById('stats-today-posts');
                const weekPostsEl = document.getElementById('stats-week-posts');
                if (totalAccountsEl)
                    totalAccountsEl.textContent = String(stats.totalAccounts);
                if (activeAccountsEl)
                    activeAccountsEl.textContent = String(stats.activeAccounts);
                if (todayPostsEl)
                    todayPostsEl.textContent = String(stats.todayTotalPosts);
                if (weekPostsEl)
                    weekPostsEl.textContent = String(stats.weekTotalPosts);
            }
            const activeResult = await window.api.getActiveBlogAccount();
            const activeAccountId = activeResult.success && activeResult.account ? activeResult.account.id : null;
            accountListContainer.innerHTML = accounts.map((account) => {
                const isActive = account.id === activeAccountId;
                const hasCredentials = account.naverId ? true : false;
                return `
          <div class="account-item" data-account-id="${account.id}" style="
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            padding: 0.75rem 1rem; 
            background: ${isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; 
            border: 2px solid ${isActive ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.1)'}; 
            border-radius: 10px;
            transition: all 0.2s;
          ">
            <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
              <div style="
                width: 40px; 
                height: 40px; 
                border-radius: 50%; 
                background: ${isActive ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #6366f1, #4f46e5)'}; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                font-size: 1.25rem;
              ">
                ${isActive ? '✓' : '👤'}
              </div>
              <div>
                <div style="font-weight: 600; color: var(--text-strong); display: flex; align-items: center; gap: 0.5rem;">
                  ${escapeHtml(account.name)}
                  ${isActive ? '<span style="font-size: 0.7rem; background: #10b981; color: white; padding: 0.15rem 0.5rem; border-radius: 4px;">활성</span>' : ''}
                  ${hasCredentials ? '<span style="font-size: 0.7rem; background: #3b82f6; color: white; padding: 0.15rem 0.5rem; border-radius: 4px;">로그인 정보 저장됨</span>' : ''}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                  @${escapeHtml(account.blogId)} · 오늘 ${account.todayPosts || 0}/${account.settings?.dailyLimit || 5}건
                  ${account.settings?.autoRotate ? ' · 🔄 자동순환' : ''}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              ${!isActive ? `
                <button type="button" class="set-active-btn" data-account-id="${account.id}" style="
                  padding: 0.4rem 0.75rem; 
                  background: linear-gradient(135deg, #10b981, #059669); 
                  color: white; 
                  border: none; 
                  border-radius: 6px; 
                  font-size: 0.75rem; 
                  cursor: pointer;
                  font-weight: 600;
                ">활성화</button>
              ` : ''}
              <button type="button" class="toggle-account-btn" data-account-id="${account.id}" style="
                padding: 0.4rem 0.75rem; 
                background: ${account.isActive ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; 
                color: ${account.isActive ? '#f59e0b' : '#10b981'}; 
                border: 1px solid ${account.isActive ? '#f59e0b' : '#10b981'}; 
                border-radius: 6px; 
                font-size: 0.75rem; 
                cursor: pointer;
                font-weight: 600;
              ">${account.isActive ? '비활성화' : '활성화'}</button>
              <button type="button" class="remove-account-btn" data-account-id="${account.id}" style="
                padding: 0.4rem 0.75rem; 
                background: rgba(239, 68, 68, 0.2); 
                color: #ef4444; 
                border: 1px solid #ef4444; 
                border-radius: 6px; 
                font-size: 0.75rem; 
                cursor: pointer;
                font-weight: 600;
              ">삭제</button>
            </div>
          </div>
        `;
            }).join('');
            accountListContainer.querySelectorAll('.set-active-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const accountId = e.target.dataset.accountId;
                    if (accountId) {
                        const result = await window.api.setActiveBlogAccount(accountId);
                        if (result.success) {
                            toastManager.success('활성 계정이 변경되었습니다.');
                            await renderAccountList();
                        }
                        else {
                            toastManager.error(result.message || '활성화 실패');
                        }
                    }
                });
            });
            accountListContainer.querySelectorAll('.toggle-account-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const accountId = e.target.dataset.accountId;
                    if (accountId) {
                        const result = await window.api.toggleBlogAccount(accountId);
                        if (result.success) {
                            toastManager.success(result.isActive ? '계정이 활성화되었습니다.' : '계정이 비활성화되었습니다.');
                            await renderAccountList();
                        }
                        else {
                            toastManager.error(result.message || '토글 실패');
                        }
                    }
                });
            });
            accountListContainer.querySelectorAll('.remove-account-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const accountId = e.target.dataset.accountId;
                    if (accountId && confirm('정말로 이 계정을 삭제하시겠습니까?')) {
                        const result = await window.api.removeBlogAccount(accountId);
                        if (result.success) {
                            toastManager.success('계정이 삭제되었습니다.');
                            await renderAccountList();
                        }
                        else {
                            toastManager.error(result.message || '삭제 실패');
                        }
                    }
                });
            });
        }
        catch (error) {
            console.error('[MultiAccount] 계정 목록 렌더링 오류:', error);
        }
    }
    addAccountBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('new-account-name');
        const blogIdInput = document.getElementById('new-account-blog-id');
        const naverIdInput = document.getElementById('new-account-naver-id');
        const naverPwInput = document.getElementById('new-account-naver-pw');
        const dailyLimitInput = document.getElementById('new-account-daily-limit');
        const autoRotateInput = document.getElementById('new-account-auto-rotate');
        const name = nameInput?.value.trim();
        const blogId = blogIdInput?.value.trim();
        const naverId = naverIdInput?.value.trim();
        const naverPw = naverPwInput?.value;
        const dailyLimit = parseInt(dailyLimitInput?.value || '5');
        const autoRotate = autoRotateInput?.checked ?? true;
        if (!name || !blogId) {
            toastManager.warning('계정 별명과 블로그 ID는 필수입니다.');
            return;
        }
        try {
            const result = await window.api.addBlogAccount(name, blogId, naverId || undefined, naverPw || undefined, {
                dailyLimit,
                autoRotate
            });
            if (result.success) {
                toastManager.success(`계정 "${name}"이(가) 추가되었습니다.`);
                if (nameInput)
                    nameInput.value = '';
                if (blogIdInput)
                    blogIdInput.value = '';
                if (naverIdInput)
                    naverIdInput.value = '';
                if (naverPwInput)
                    naverPwInput.value = '';
                if (dailyLimitInput)
                    dailyLimitInput.value = '5';
                if (autoRotateInput)
                    autoRotateInput.checked = true;
                await renderAccountList();
            }
            else {
                toastManager.error(result.message || '계정 추가 실패');
            }
        }
        catch (error) {
            console.error('[MultiAccount] 계정 추가 오류:', error);
            toastManager.error('계정 추가 중 오류가 발생했습니다.');
        }
    });
    const syncAccountsBtn = document.getElementById('ar-sync-accounts-btn');
    syncAccountsBtn?.addEventListener('click', async () => {
        try {
            syncAccountsBtn.innerHTML = '<span>🔄</span> 동기화 중...';
            syncAccountsBtn.disabled = true;
            const result = await window.api.adminSyncAccounts();
            if (result.success) {
                toastManager.success('네이버 계정 정보가 패널로 동기화되었습니다.');
            }
            else {
                toastManager.error(result.message || '동기화 실패');
            }
        }
        catch (error) {
            console.error('[AccountSync] 동기화 오류:', error);
            toastManager.error('동기화 중 오류가 발생했습니다.');
        }
        finally {
            syncAccountsBtn.innerHTML = '<span>🔄</span> 패널로 계정 동기화';
            syncAccountsBtn.disabled = false;
        }
    });
    await renderAccountList();
    console.log('[MultiAccount] 다계정 관리 기능 초기화 완료');
}
function isAutomationThumbnailItem(item) {
    const heading = String(item?.heading || '').toLowerCase();
    return item?.isThumbnail === true ||
        heading.includes('썸네일') ||
        heading.includes('thumbnail') ||
        heading.includes('서론') ||
        heading.includes('대표');
}
function getSequentialImageItemsForMode(items, mode) {
    if (mode === 'none')
        return [];
    if (mode === 'thumbnail-only') {
        return items.filter((item) => isAutomationThumbnailItem(item));
    }
    if (mode !== 'odd-only' && mode !== 'even-only') {
        return items;
    }
    return items.filter((item, idx) => {
        if (isAutomationThumbnailItem(item))
            return true;
        const originalIndex = Number.isFinite(Number(item?.originalIndex)) ? Number(item.originalIndex) : idx;
        return mode === 'odd-only' ? originalIndex % 2 === 1 : originalIndex % 2 === 0;
    });
}
// [SPEC-STABILITY-2026 R4] Single-flight: the same post must never run two
// image generations at once. Live evidence (6/10, 6/11): per-heading [1/1]
// runs and a full [1/N] batch ran concurrently for one post — 2x cost
// (237 images in one day) and cross-run heading-mapping pollution. The
// duplicate is REJECTED loudly: silent dedup could merge runs from different
// providers and violate the user's explicit engine choice.
const _giaInFlight = new Map();
const _GIA_STALE_MS = 15 * 60 * 1000; // a run older than this is presumed dead
// [Phase 7.2 / R13] Single definition of the provider fallback chain
// (full-auto setting > global setting > default). Flow entries call this ONCE
// and pass the result via options.fallbackProvider — the core must not pick
// a provider out of localStorage on its own.
function resolveImageProviderFallback() {
    const INVALID_PROVIDERS = ['saved', '', 'null', 'undefined'];
    // [Phase 7.1-f] Reads go through the single pipeline accessor; the
    // priority chain itself stays here (full-auto > global > default).
    const _rawPipeline = readRawPipelineSettings();
    const rawFullAuto = _rawPipeline.fullAutoImageSource;
    const rawGlobal = _rawPipeline.globalImageSource;
    return (rawFullAuto && !INVALID_PROVIDERS.includes(rawFullAuto) ? rawFullAuto : null) ||
        (rawGlobal && !INVALID_PROVIDERS.includes(rawGlobal) ? rawGlobal : null) ||
        'nano-banana-pro';
}
async function generateImagesForAutomation(provider, headings, postTitle, options = {}) {
    const flightKey = String(postTitle || '').trim();
    const startedAt = flightKey ? _giaInFlight.get(flightKey) : undefined;
    if (flightKey && startedAt !== undefined) {
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs < _GIA_STALE_MS) {
            const msg = `IMAGE_DUPLICATE_RUN:같은 글("${flightKey.substring(0, 30)}")의 이미지 생성이 이미 진행 중입니다 (${Math.round(elapsedMs / 1000)}초 경과) — 이중 생성 차단 (S4)`;
            console.warn(`[generateImagesForAutomation] ⛔ ${msg}`);
            throw new Error(msg);
        }
        console.warn(`[generateImagesForAutomation] ⚠️ ${Math.round(elapsedMs / 60000)}분 경과한 stale 진행 기록 무시하고 새 생성 진행`);
    }
    if (flightKey) _giaInFlight.set(flightKey, Date.now());
    try {
        return await generateImagesForAutomationInner(provider, headings, postTitle, options);
    } finally {
        if (flightKey) _giaInFlight.delete(flightKey);
    }
}
async function generateImagesForAutomationInner(provider, headings, postTitle, options = {}) {
    if (provider === 'skip') {
        console.log('[generateImagesForAutomation] ⏭️ provider="skip" → 이미지 생성 건너뜀');
        return [];
    }
    if (provider === 'local-folder') {
        console.log('[generateImagesForAutomation] 📂 provider="local-folder" → AI 생성 불필요, 빈 배열 반환');
        return [];
    }
    const INVALID_PROVIDERS = ['saved', '', 'null', 'undefined'];
    if (!provider || INVALID_PROVIDERS.includes(provider.trim())) {
        // [Phase 7.2 / R13] Caller-resolved fallback first; the localStorage
        // read below is a warned transition net for un-migrated callers.
        let fallbackProvider = typeof options.fallbackProvider === 'string' && options.fallbackProvider.trim() && !INVALID_PROVIDERS.includes(options.fallbackProvider.trim())
            ? options.fallbackProvider.trim()
            : '';
        if (!fallbackProvider) {
            fallbackProvider = resolveImageProviderFallback();
            console.warn('[generateImagesForAutomation] ⚠️ fallbackProvider 미전달 — localStorage 폴백 (R13: 호출자가 명시 전달)');
        }
        console.warn(`[generateImagesForAutomation] ⚠️ provider가 유효하지 않음("${provider}")! fallback 적용: "${fallbackProvider}"`);
        provider = fallbackProvider;
    }
    const includeThumbnailText = options.thumbnailTextInclude ?? options.allowThumbnailText ?? false;
    console.log(`[generateImagesForAutomation] 🖼️ allowThumbnailText = ${includeThumbnailText}, provider = ${provider}`);
    // [SPEC-STABILITY-2026 R4 diagnostics] Tag every generation run so
    // overlapping runs for the same post are visible in user logs, and record
    // the caller so a duplicate trigger can be pinned from one reproduction.
    const runId = Math.random().toString(36).slice(2, 6);
    try {
        const callerLine = (new Error().stack || '')
            .split('\n')
            .slice(2, 5)
            .map((line) => line.trim())
            .join(' <- ');
        console.log(`[generateImagesForAutomation] ▶ run #${runId} provider=${provider} post="${String(postTitle || '').substring(0, 30)}" caller: ${callerLine}`);
    }
    catch {
        // stack capture is diagnostic only
    }
    const { stopCheck, onProgress } = options;
    if (stopCheck && stopCheck())
        return [];
    // [Phase 7.2 / R13] Behavior inputs must come from the caller — flow entry
    // resolves localStorage ONCE and passes it down. The fallback read below
    // exists only for un-migrated callers and warns so they get fixed.
    let _headingImageMode = typeof options.headingImageMode === 'string' && options.headingImageMode
        ? options.headingImageMode
        : '';
    if (!_headingImageMode) {
        _headingImageMode = readRawPipelineSettings().headingImageMode || 'all';
        console.warn('[generateImagesForAutomation] ⚠️ headingImageMode 미전달 — localStorage 폴백 (R13: 호출자가 명시 전달)');
    }
    // headingImageMode is the single source of truth here. The legacy
    // 'thumbnailOnly' checkbox key is full-auto-only (carried via options) —
    // reading it globally let a stale 'true' force thumbnail-only publishes
    // in continuous/multi-account flows the user never configured.
    const _thumbnailOnly = (options.thumbnailOnly === true ||
        _headingImageMode === 'thumbnail-only');
    if (_headingImageMode === 'none') {
        console.log('[generateImagesForAutomation] 🚫 headingImageMode=none → 이미지 생성 전체 스킵');
        onProgress?.('🚫 이미지 없이 모드: 이미지 생성을 건너뜁니다.');
        return [];
    }
    if (_thumbnailOnly) {
        const thumbOnlyHeadings = headings.filter((h) => h?.isThumbnail === true);
        if (thumbOnlyHeadings.length > 0) {
            console.log(`[generateImagesForAutomation] 📷 thumbnailOnly=true → 썸네일 ${thumbOnlyHeadings.length}개만 생성 (소제목 ${headings.length - thumbOnlyHeadings.length}개 스킵)`);
            onProgress?.(`📷 썸네일만 생성 모드: 소제목 이미지 생성 건너뜀`);
            headings = thumbOnlyHeadings;
        }
        else {
            console.log('[generateImagesForAutomation] 📷 thumbnailOnly=true → postTitle 기반 썸네일 1개만 생성');
            onProgress?.(`📷 썸네일만 생성 모드: 썸네일 1개만 생성`);
            headings = [];
        }
    }
    const items = [];
    for (const h of headings) {
        const headingIdx = headings.indexOf(h);
        const title = h.title || h.text || h.heading || (typeof h === 'string' ? h : '');
        if (!title || title.trim() === '')
            continue;
        const isThumb = h.isThumbnail === true;
        let rawPrompt;
        if (isThumb) {
            try {
                const globalImgSettings = typeof getGlobalImageSettings === 'function' ? getGlobalImageSettings() : {};
                const thumbStyle = globalImgSettings.imageStyle || '';
                rawPrompt = await generateEnglishPromptForHeading(postTitle, '', thumbStyle);
                console.log(`[generateImagesForAutomation] 🎨 AI 썸네일 프롬프트: "${rawPrompt.substring(0, 60)}..."`);
            }
            catch {
                rawPrompt = `eye-catching blog thumbnail, visual metaphor for: ${postTitle}, cinematic lighting, compelling composition, hero image style`;
                console.log(`[generateImagesForAutomation] ⚠️ AI 썸네일 프롬프트 실패 → 기본 프롬프트 사용`);
            }
        }
        else {
            try {
                const globalImgSettings = typeof getGlobalImageSettings === 'function' ? getGlobalImageSettings() : {};
                const subheadingStyle = globalImgSettings.imageStyle || '';
                rawPrompt = await generateEnglishPromptForHeading(title, postTitle, subheadingStyle);
                console.log(`[generateImagesForAutomation] 🎨 소제목[${headingIdx}] AI 프롬프트: "${rawPrompt.substring(0, 60)}..."`);
            }
            catch {
                rawPrompt = h.prompt || h.imagePrompt || title || 'Abstract Image';
                console.log(`[generateImagesForAutomation] ⚠️ 소제목[${headingIdx}] AI 프롬프트 실패 → 원문 사용`);
            }
        }
        items.push({
            heading: isThumb ? (postTitle || title) : title,
            prompt: rawPrompt,
            englishPrompt: rawPrompt,
            isThumbnail: isThumb,
            originalIndex: headingIdx,
            allowText: isThumb ? includeThumbnailText : false,
            referenceImagePath: h.referenceImagePath || options.referenceImagePath
        });
    }
    if (items.length === 0 && postTitle) {
        items.push({
            heading: postTitle,
            prompt: postTitle,
            isThumbnail: true,
            originalIndex: 0,
            allowText: includeThumbnailText,
            referenceImagePath: options.referenceImagePath
        });
    }
    const itemsForGeneration = getSequentialImageItemsForMode(items, _headingImageMode);
    const _displayCount = itemsForGeneration.length;
    onProgress?.(`🚀 이미지 생성 시작: ${_displayCount}개 (Provider: ${provider}, run #${runId})`);
    onProgress?.('🧵 안정성을 위해 이미지를 1개씩 순차 생성합니다.');
    if (_displayCount === 0) {
        console.log(`[generateImagesForAutomation] headingImageMode="${_headingImageMode}" → 생성 대상 없음`);
        return [];
    }
    const isUiAutomationImageProvider = MULTI_ACCOUNT_UI_IMAGE_SOURCES.has(provider);
    const isFlowProvider = isFlowAutomationProvider(provider);
    const perItemBudgetMs = isUiAutomationImageProvider ? 150000 : 90000;
    const BATCH_TIMEOUT_MS = isFlowProvider
        ? (_displayCount <= 1
            ? FLOW_AUTOMATION_IMAGE_ITEM_TIMEOUT_MS
            : Math.min(FLOW_AUTOMATION_BATCH_MAX_TIMEOUT_MS, Math.max(FLOW_AUTOMATION_IMAGE_ITEM_TIMEOUT_MS, 120000 + (_displayCount * FLOW_AUTOMATION_IMAGE_ITEM_TIMEOUT_MS))))
        // Hard 15-minute batch ceiling — the old 45-minute ceiling let a dead
        // provider hold the whole continuous run hostage.
        : Math.min(15 * 60 * 1000, Math.max(5 * 60 * 1000, 60000 + (_displayCount * perItemBudgetMs)));
    const batchStartTime = Date.now();
    const checkBatchTimeout = () => {
        const elapsed = Date.now() - batchStartTime;
        if (elapsed >= BATCH_TIMEOUT_MS) {
            console.error(`[generateImagesForAutomation] ⏰ 배치 타임아웃 (${Math.round(elapsed / 1000)}초 경과)`);
            onProgress?.(`⏰ 이미지 생성 타임아웃 (${Math.round(elapsed / 1000)}초) - 발행 중단`);
            return true;
        }
        return false;
    };
    const MAX_RETRIES = isFlowProvider ? 2 : 3;
    let lastError = null;
    const sequentialImages = [];
    for (let itemIndex = 0; itemIndex < itemsForGeneration.length; itemIndex++) {
        const item = itemsForGeneration[itemIndex];
        let itemSucceeded = false;
        for (let attempt = 1; attempt <= MAX_RETRIES && !itemSucceeded; attempt++) {
            try {
                if (stopCheck && stopCheck())
                    return sequentialImages;
                if (checkBatchTimeout()) {
                    throw new Error(`이미지 생성 타임아웃(${Math.round(BATCH_TIMEOUT_MS / 60000)}분 초과) - ${sequentialImages.length}/${_displayCount}개만 생성되어 발행을 중단합니다.`);
                    if (sequentialImages.length > 0) {
                        onProgress?.(`⏰ 타임아웃! ${sequentialImages.length}/${_displayCount}개만 생성되어 발행 중단`);
                        return sequentialImages;
                    }
                    throw new Error(`이미지 생성 타임아웃 (${Math.round(BATCH_TIMEOUT_MS / 60000)}분 초과) - 발행 중단`);
                }
                const elapsedSec = Math.round((Date.now() - batchStartTime) / 1000);
                const headingName = String(item?.heading || `${itemIndex + 1}번`).substring(0, 30);
                onProgress?.(`🎨 [${itemIndex + 1}/${_displayCount}][run #${runId}] ${provider} 엔진으로 순차 생성 중... (${elapsedSec}초 경과)`);
                const result = await generateImagesWithCostSafety({
                    provider: provider,
                    items: [item],
                    postTitle: postTitle,
                    regenerate: false,
                    referenceImagePath: item.referenceImagePath || options.referenceImagePath,
                    collectedImages: options.collectedImages,
                    thumbnailTextInclude: item.isThumbnail === true ? includeThumbnailText : false,
                    headingImageMode: 'all',
                    imageFallbackPolicy: 'engine-only',
                    isMultiAccount: true,
                    longRunImageGeneration: true,
                    imageGenerationTimeoutMs: isFlowProvider
                        ? FLOW_AUTOMATION_IMAGE_ITEM_TIMEOUT_MS
                        : Math.min(45 * 60 * 1000, 180000 + perItemBudgetMs),
                });
                if (stopCheck && stopCheck())
                    return sequentialImages;
                if (result?.success && result.images && result.images.length > 0) {
                    const normalizedImages = result.images.map((img) => ({
                        ...img,
                        heading: img?.heading || item.heading,
                        isThumbnail: img?.isThumbnail ?? item.isThumbnail,
                        originalIndex: img?.originalIndex ?? item.originalIndex,
                    }));
                    sequentialImages.push(...normalizedImages);
                    itemSucceeded = true;
                    onProgress?.(`✅ [${itemIndex + 1}/${_displayCount}][run #${runId}] 이미지 생성 완료: ${headingName}...`);
                    continue;
                }
                const detailMsg = result?.message ||
                    (Array.isArray(result?.images) && result.images.length === 0
                        ? '이미지 생성 결과가 비어있음'
                        : '이미지 생성 결과 없음');
                onProgress?.(`🔍 진단: success=${result?.success}, images=${result?.images?.length ?? 'undefined'}, message="${result?.message || '(없음)'}"`);
                throw new Error(detailMsg);
            }
            catch (error) {
                lastError = error;
                const errMsg = lastError.message || '';
                console.warn(`[generateImagesForAutomation] ${itemIndex + 1}/${_displayCount} 시도 ${attempt}/${MAX_RETRIES} 실패:`, errMsg);
                if (errMsg.includes('[ImageFX]') && (errMsg.includes('시간당 한도') ||
                    errMsg.includes('한도를 초과') ||
                    errMsg.includes('세션이 만료') ||
                    errMsg.includes('접근이 거부') ||
                    errMsg.includes('안전 필터'))) {
                    console.warn(`[generateImagesForAutomation] ⛔ 회복 불가능한 ImageFX 오류 → 이미지 생성 중단`);
                    onProgress?.(`⛔ ${errMsg.substring(0, 200)}`);
                    throw lastError;
                }
                if (attempt < MAX_RETRIES) {
                    // Retry waits capped low — the previous 15-45s escalations,
                    // multiplied by headings × attempts, made continuous runs
                    // look stuck on "이미지 수집" for tens of minutes.
                    const waitTime = Math.min(isUiAutomationImageProvider ? 15000 : 10000, (isUiAutomationImageProvider ? 5000 : 3000) * attempt);
                    onProgress?.(`⚠️ [${itemIndex + 1}/${_displayCount}] 이미지 생성 실패 (${attempt}/${MAX_RETRIES}), ${waitTime / 1000}초 후 재시도...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }
        if (!itemSucceeded) {
            const headingName = String(item?.heading || `image-${itemIndex + 1}`).substring(0, 30);
            const failCause = lastError?.message || 'empty image generation result';
            // Fail fast WITH a visible reason (the old unreachable onProgress
            // after throw meant users never saw why the run stalled).
            onProgress?.(`❌ [${itemIndex + 1}/${_displayCount}] "${headingName}" 이미지 생성 최종 실패 — 이미지 단계 중단: ${String(failCause).substring(0, 160)}`);
            throw new Error(`[${itemIndex + 1}/${_displayCount}] "${headingName}" image generation failed: ${failCause}`);
        }
    }
    if (sequentialImages.length > 0) {
        const successCount = sequentialImages.length;
        const totalRequested = Math.max(_displayCount, 1);
        onProgress?.(`🎉 총 ${successCount}/${totalRequested}개 이미지 생성 완료`);
        console.log(`[Image Stats] 순차 생성 완료: ${successCount}/${totalRequested}개`);
        return sequentialImages;
    }
    const errorDetail = lastError?.message || '알 수 없는 오류';
    onProgress?.(`⚠️ 이미지 생성 결과 없음: ${errorDetail} — 발행을 중단하고 이미지 단계부터 다시 시도합니다.`);
    console.warn(`[generateImagesForAutomation] 이미지 0개로 종료: ${errorDetail}`);
    throw new Error(`image generation returned no images: ${errorDetail}`);
}
async function initMultiAccountPublishModal() {
    console.log('[MultiAccountPublish] 다중계정 동시발행 모달 초기화 시작');
    const multiAccountBtn = document.getElementById('multi-account-btn');
    const multiAccountModal = document.getElementById('multi-account-modal');
    const accountEditModal = document.getElementById('ma-account-edit-modal');
    if (!multiAccountBtn || !multiAccountModal) {
        console.log('[MultiAccountPublish] 모달 요소를 찾을 수 없습니다.');
        return;
    }
    if (multiAccountModal.parentElement !== document.body) {
        console.log('[MultiAccountPublish] 모달을 body로 이동합니다.');
        document.body.appendChild(multiAccountModal);
    }
    let selectedAccountIds = [];
    let isPublishing = false;
    let stopRequested = false;
    multiAccountBtn.addEventListener('click', async () => {
        console.log('[MultiAccountPublish] 모달 열기 버튼 클릭');
        const unlocked = await window.checkFeatureLockAndShow?.('multi-account-manage');
        if (unlocked === false)
            return;
        multiAccountModal.style.display = 'flex';
        multiAccountModal.setAttribute('aria-hidden', 'false');
        try {
            await renderMultiAccountList();
        }
        catch (error) {
            console.error('[MultiAccountPublish] 계정 목록 로드 중 오류:', error);
            const container = document.getElementById('ma-accounts-container');
            if (container) {
                container.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #ef4444;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</div>
            <p>계정 목록을 불러오지 못했습니다</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">${error.message}</p>
          </div>
        `;
            }
        }
    });
    document.querySelectorAll('[data-close-multi-account]').forEach(btn => {
        btn.addEventListener('click', () => {
            multiAccountModal.style.display = 'none';
            multiAccountModal.setAttribute('aria-hidden', 'true');
        });
    });
    document.querySelectorAll('[data-close-ma-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (accountEditModal) {
                accountEditModal.style.display = 'none';
                accountEditModal.setAttribute('aria-hidden', 'true');
            }
        });
    });
    const continuousModeCheckbox = document.getElementById('ma-continuous-mode');
    const continuousSettings = document.getElementById('ma-continuous-settings');
    continuousModeCheckbox?.addEventListener('change', () => {
        if (continuousSettings) {
            continuousSettings.style.display = continuousModeCheckbox.checked ? 'flex' : 'none';
        }
    });
    const maContentModeBtns = document.querySelectorAll('.ma-content-mode-btn');
    const maContentModeInput = document.getElementById('ma-content-mode');
    const maShoppingConnectSettings = document.getElementById('ma-shopping-connect-settings');
    maContentModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode) {
                maContentModeBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                if (maContentModeInput)
                    maContentModeInput.value = mode;
                if (maShoppingConnectSettings) {
                    if (mode === 'affiliate') {
                        maShoppingConnectSettings.style.display = 'block';
                        maShoppingConnectSettings.animate([
                            { opacity: 0, transform: 'translateY(-10px)' },
                            { opacity: 1, transform: 'translateY(0)' }
                        ], { duration: 300, easing: 'ease-out' });
                    }
                    else {
                        maShoppingConnectSettings.style.display = 'none';
                    }
                }
            }
        });
    });
    async function renderMultiAccountList() {
        const container = document.getElementById('ma-accounts-container');
        const noAccountsMsg = document.getElementById('ma-no-accounts');
        if (!container) {
            console.warn('[MultiAccountPublish] ma-accounts-container 요소가 없습니다.');
            return;
        }
        try {
            console.log('[MultiAccountPublish] 계정 목록 로드 시작...');
            if (!window.api) {
                console.error('[MultiAccountPublish] window.api가 정의되지 않았습니다!');
                container.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #ef4444;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</div>
            <p>API가 초기화되지 않았습니다</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">앱을 재시작해주세요</p>
          </div>
        `;
                if (noAccountsMsg)
                    noAccountsMsg.style.display = 'none';
                return;
            }
            if (typeof window.api.getAllBlogAccounts !== 'function') {
                console.error('[MultiAccountPublish] window.api.getAllBlogAccounts 함수가 없습니다!');
                container.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #ef4444;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</div>
            <p>계정 API가 없습니다</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">앱 버전을 확인해주세요</p>
          </div>
        `;
                if (noAccountsMsg)
                    noAccountsMsg.style.display = 'none';
                return;
            }
            const result = await window.api.getAllBlogAccounts();
            console.log('[MultiAccountPublish] getAllBlogAccounts 결과:', result);
            if (!result.success || !result.accounts) {
                console.warn('[MultiAccountPublish] 계정 로드 실패:', result.message);
                if (noAccountsMsg)
                    noAccountsMsg.style.display = 'block';
                return;
            }
            const accounts = result.accounts;
            if (accounts.length === 0) {
                if (noAccountsMsg)
                    noAccountsMsg.style.display = 'block';
                return;
            }
            if (noAccountsMsg)
                noAccountsMsg.style.display = 'none';
            const unsetCount = accounts.filter((a) => !a.settings?.proxyHost).length;
            const bulkProxyHtml = `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 0.5rem; gap: 0.5rem;">
          <button type="button" id="ma-bulk-proxy-btn" style="
            padding: 0.5rem 1rem;
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 0.8rem;
            cursor: pointer;
            font-weight: 600;
            opacity: ${unsetCount > 0 ? '1' : '0.5'};
          " ${unsetCount === 0 ? 'disabled' : ''}>
            🔐 전체 프록시 일괄 설정 (${unsetCount}개 미설정)
          </button>
        </div>
      `;
            container.innerHTML = bulkProxyHtml + accounts.map((account) => {
                return `
          <div class="ma-account-card" data-account-id="${account.id}" style="
            background: rgba(255, 255, 255, 0.03);
            border: 2px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 0.875rem;
            transition: all 0.2s;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div>
                  <div style="font-weight: 700; color: var(--text-strong); font-size: 1rem;">
                    👤 ${escapeHtml(account.name)}
                    ${account.settings?.proxyHost ? '<span style="font-size: 0.65rem; background: rgba(59, 130, 246, 0.25); color: #60a5fa; padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.25rem;">🌐 프록시</span>' : ''}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">ID: ${escapeHtml(account.blogId || account.name)}</div>
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button type="button" class="ma-fullauto-btn" data-account-id="${account.id}" data-account-name="${escapeHtml(account.name)}" style="padding: 0.4rem 0.75rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 600;">⚡ 풀오토 세팅</button>
                <button type="button" class="ma-edit-btn" data-account-id="${account.id}" style="padding: 0.4rem 0.6rem; background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 0.75rem; cursor: pointer;">⚙️ 편집</button>
                <button type="button" class="ma-delete-btn" data-account-id="${account.id}" style="padding: 0.4rem 0.6rem; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; font-size: 0.75rem; cursor: pointer;">🗑️</button>
              </div>
            </div>
          </div>
        `;
            }).join('');
            container.querySelectorAll('.ma-fullauto-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const button = e.target;
                    const accountId = button.dataset.accountId;
                    const accountName = button.dataset.accountName;
                    if (accountId && accountName) {
                        openFullautoSettingModal(accountId, accountName);
                    }
                });
            });
            const bulkProxyBtn = document.getElementById('ma-bulk-proxy-btn');
            if (bulkProxyBtn) {
                bulkProxyBtn.addEventListener('click', async () => {
                    if (!confirm(`프록시 미설정 계정 ${unsetCount}개에 SmartProxy Sticky Session을 자동 설정합니다.\n계정별 고정 IP가 할당됩니다. 계속할까요?`))
                        return;
                    bulkProxyBtn.textContent = '🔄 설정 중...';
                    bulkProxyBtn.disabled = true;
                    try {
                        const result = await window.api.bulkSetupStickyProxy();
                        if (result.success) {
                            toastManager.success(result.message);
                            await renderMultiAccountList();
                        }
                        else {
                            toastManager.error(result.message || '일괄 설정 실패');
                        }
                    }
                    catch (err) {
                        toastManager.error(`오류: ${err.message}`);
                    }
                });
            }
            container.querySelectorAll('.ma-edit-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const accountId = e.target.closest('button')?.dataset.accountId;
                    if (accountId)
                        await openAccountEditModal(accountId);
                });
            });
            container.querySelectorAll('.ma-delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const accountId = e.target.closest('button')?.dataset.accountId;
                    if (accountId && confirm('정말로 이 계정을 삭제하시겠습니까?')) {
                        await window.api.removeBlogAccount(accountId);
                        selectedAccountIds = selectedAccountIds.filter(id => id !== accountId);
                        await renderMultiAccountList();
                        updateSelectedCount();
                    }
                });
            });
        }
        catch (error) {
            console.error('[MultiAccountPublish] 계정 목록 렌더링 오류:', error);
        }
    }
    let publishQueue = [];
    function updateMAScheduleStatusSummary() {
        const statusText = document.getElementById('ma-schedule-status-text');
        if (!statusText)
            return;
        if (!publishQueue || publishQueue.length === 0) {
            statusText.textContent = '📭 대기열이 비어있습니다.';
            return;
        }
        const scheduledCount = publishQueue.filter((item) => item.publishMode === 'schedule' && item.scheduleDate).length;
        const total = publishQueue.length;
        if (scheduledCount === 0) {
            statusText.innerHTML = `총 <strong style="color: #60a5fa;">${total}</strong>개 항목 | 예약 설정된 항목 없음`;
        }
        else {
            statusText.innerHTML = `총 <strong style="color: #60a5fa;">${total}</strong>개 항목 | <strong style="color: #10b981;">${scheduledCount}</strong>개 예약 설정됨`;
        }
    }
    function showMARandomScheduleModal() {
        document.getElementById('ma-random-schedule-modal-overlay')?.remove();
        if (!publishQueue || publishQueue.length === 0) {
            toastManager.warning('📋 대기열에 항목이 없습니다. 먼저 항목을 추가해주세요.');
            return;
        }
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const overlay = document.createElement('div');
        overlay.id = 'ma-random-schedule-modal-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 50000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px);';
        overlay.innerHTML = `
      <div style="background: var(--bg-primary, #1a1a2e); border: 2px solid rgba(59, 130, 246, 0.4); border-radius: 16px; padding: 1.5rem; max-width: 480px; width: 92%; box-shadow: 0 25px 50px rgba(0,0,0,0.5); max-height: 85vh; overflow-y: auto;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
          <h3 style="margin: 0; color: #60a5fa; font-size: 1.1rem; font-weight: 700;">🎲 랜덤 예약 배분</h3>
          <button type="button" id="ma-rnd-schedule-close" style="background: none; border: none; color: var(--text-muted, #999); font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
        </div>

        <p style="margin: 0 0 1rem 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.5;">
          시작~마감 시간 범위 내에서 대기열 항목들에 <strong style="color: #10b981;">랜덤 예약 시간</strong>을 자동 배분합니다.
        </p>

        <!-- 시작 시간 -->
        <div style="margin-bottom: 1rem;">
          <label style="color: #10b981; font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 0.5rem;">🟢 시작 시간</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">날짜 (비워두면 오늘)</label>
              <input type="date" id="ma-rnd-start-date" value=""
                style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark;">
            </div>
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">시간</label>
              ${(0, time24Select_1.createTime24Select)({ id: 'ma-rnd-start-time', defaultValue: '09:00', step: 10, style: 'width: 100%;', selectStyle: 'padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark; cursor: pointer; flex: 1;' })}
            </div>
          </div>
        </div>

        <!-- 마감 시간 -->
        <div style="margin-bottom: 1rem;">
          <label style="color: #ef4444; font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 0.5rem;">🔴 마감 시간</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">날짜 (비워두면 시작일과 동일)</label>
              <input type="date" id="ma-rnd-end-date" value=""
                style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark;">
            </div>
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">시간</label>
              ${(0, time24Select_1.createTime24Select)({ id: 'ma-rnd-end-time', defaultValue: '18:00', step: 10, style: 'width: 100%;', selectStyle: 'padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark; cursor: pointer; flex: 1;' })}
            </div>
          </div>
        </div>

        <!-- 빠른 프리셋 -->
        <div style="margin-bottom: 1rem;">
          <label style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.5rem;">⚡ 빠른 시간대 설정</label>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button type="button" class="ma-rnd-preset" data-start="09:00" data-end="18:00" style="padding: 0.4rem 0.6rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; color: #60a5fa; cursor: pointer; font-size: 0.75rem; font-weight: 600;">🌅 9-18시</button>
            <button type="button" class="ma-rnd-preset" data-start="08:00" data-end="22:00" style="padding: 0.4rem 0.6rem; background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px; color: #a78bfa; cursor: pointer; font-size: 0.75rem; font-weight: 600;">📅 8-22시</button>
            <button type="button" class="ma-rnd-preset" data-start="10:00" data-end="14:00" style="padding: 0.4rem 0.6rem; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; color: #f59e0b; cursor: pointer; font-size: 0.75rem; font-weight: 600;">☀️ 10-14시</button>
            <button type="button" class="ma-rnd-preset" data-start="18:00" data-end="23:00" style="padding: 0.4rem 0.6rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; color: #10b981; cursor: pointer; font-size: 0.75rem; font-weight: 600;">🌙 18-23시</button>
          </div>
        </div>

        <!-- 미리보기 영역 -->
        <div id="ma-rnd-schedule-preview" style="display: none; margin-bottom: 1rem; padding: 0.75rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; max-height: 150px; overflow-y: auto;">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem; font-weight: 600;">📊 배분 미리보기</div>
          <div id="ma-rnd-schedule-preview-content" style="font-size: 0.75rem; color: var(--text-strong); line-height: 1.6; font-family: monospace;"></div>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button type="button" id="ma-rnd-schedule-cancel" style="flex: 1; padding: 0.7rem; background: var(--bg-tertiary, #333); color: var(--text-muted, #999); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.85rem;">취소</button>
          <button type="button" id="ma-rnd-schedule-apply" style="flex: 2; padding: 0.7rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">🎲 랜덤 예약 적용</button>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);
        (0, time24Select_1.bindTime24Events)(overlay);
        overlay.querySelectorAll('.ma-rnd-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const s = btn.dataset.start || '09:00';
                const e = btn.dataset.end || '18:00';
                (0, time24Select_1.setTime24Value)('ma-rnd-start-time', s);
                (0, time24Select_1.setTime24Value)('ma-rnd-end-time', e);
                toastManager.info(`⏰ ${s} ~ ${e} 시간대가 설정되었습니다.`);
            });
        });
        const handleEscRandom = (e) => { if (e.key === 'Escape')
            closeModal(); };
        const closeModal = () => { document.removeEventListener('keydown', handleEscRandom); overlay.remove(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay)
            closeModal(); });
        document.getElementById('ma-rnd-schedule-close')?.addEventListener('click', closeModal);
        document.getElementById('ma-rnd-schedule-cancel')?.addEventListener('click', closeModal);
        document.getElementById('ma-rnd-schedule-apply')?.addEventListener('click', () => {
            const today2 = new Date();
            const todayStr2 = `${today2.getFullYear()}-${String(today2.getMonth() + 1).padStart(2, '0')}-${String(today2.getDate()).padStart(2, '0')}`;
            const startDateStr = document.getElementById('ma-rnd-start-date')?.value || todayStr2;
            const startTimeStr = document.getElementById('ma-rnd-start-time')?.value || '09:00';
            const endDateStr = document.getElementById('ma-rnd-end-date')?.value || startDateStr;
            const endTimeStr = document.getElementById('ma-rnd-end-time')?.value || '18:00';
            const startTime = new Date(`${startDateStr}T${startTimeStr}`);
            const endTime = new Date(`${endDateStr}T${endTimeStr}`);
            const minAllowed = new Date(Date.now() + 15 * 60 * 1000);
            if (startTime.getTime() < minAllowed.getTime()) {
                toastManager.error('❌ 시작 시간은 현재 시간 기준 15분 이후여야 합니다!');
                return;
            }
            if (endTime.getTime() <= startTime.getTime()) {
                toastManager.error('❌ 마감 시간이 시작 시간보다 이후여야 합니다!');
                return;
            }
            const rangeMs = endTime.getTime() - startTime.getTime();
            if (rangeMs < 600000) {
                toastManager.error('❌ 시작~마감 시간 범위가 최소 10분 이상이어야 합니다.');
                return;
            }
            const distributed = window.distributeByRandomRange(publishQueue.length, {
                startDate: startDateStr, startTime: startTimeStr,
                endDate: endDateStr, endTime: endTimeStr,
            });
            publishQueue.forEach((item, i) => {
                item.scheduleDate = distributed[i].date;
                item.scheduleTime = distributed[i].time;
                item.publishMode = 'schedule';
                item.scheduleType = 'naver-server';
                item.scheduleUserModified = true;
            });
            const previewEl = document.getElementById('ma-rnd-schedule-preview');
            const previewContent = document.getElementById('ma-rnd-schedule-preview-content');
            if (previewEl && previewContent) {
                previewEl.style.display = 'block';
                previewContent.innerHTML = publishQueue.map((item, i) => {
                    return `<div style="display: flex; gap: 0.5rem; padding: 2px 0;">
            <span style="color: #60a5fa; min-width: 25px;">#${i + 1}</span>
            <span style="color: #10b981; font-weight: 600;">${item.scheduleDate} ${item.scheduleTime}</span>
            <span style="color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${(item.accountName || item.sourceUrl || item.sourceKeyword || '').substring(0, 20)}...</span>
          </div>`;
                }).join('');
            }
            toastManager.success(`✅ ${publishQueue.length}개 항목에 랜덤 예약 적용! (${startTimeStr}~${endTimeStr})`);
            renderQueue();
            updateMAScheduleStatusSummary();
        });
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    function showMAIndividualScheduleModal() {
        document.getElementById('ma-individual-schedule-modal-overlay')?.remove();
        if (!publishQueue || publishQueue.length === 0) {
            toastManager.warning('📋 대기열에 항목이 없습니다. 먼저 항목을 추가해주세요.');
            return;
        }
        const overlay = document.createElement('div');
        overlay.id = 'ma-individual-schedule-modal-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 50000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px);';
        const itemRows = publishQueue.map((item, i) => {
            const curDate = item.scheduleDate || '';
            const curTime = item.scheduleTime || '09:00';
            const isScheduled = item.publishMode === 'schedule' && curDate;
            const label = item.accountName + (item.sourceUrl ? ` — ${item.sourceUrl}` : item.sourceKeyword ? ` — ${item.sourceKeyword}` : '');
            const shortLabel = label.length > 22 ? label.substring(0, 22) + '...' : label;
            return `
        <div style="display: grid; grid-template-columns: 30px 1fr auto auto; gap: 0.5rem; align-items: center; padding: 0.5rem 0.6rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;" data-idx="${i}">
          <input type="checkbox" class="ma-indv-check" data-idx="${i}" ${isScheduled ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #10b981; cursor: pointer;">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; color: var(--text-strong, #fff);" title="${label}">${shortLabel}</div>
          <input type="date" class="ma-indv-date" data-idx="${i}" value="${curDate}" style="padding: 0.35rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.8rem; color-scheme: dark; width: 130px;">
          ${(0, time24Select_1.createTime24Select)({ className: 'ma-indv-time', dataIdx: i, defaultValue: curTime, step: 10, style: 'width: 100px;', selectStyle: 'padding: 0.35rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.75rem; color-scheme: dark; cursor: pointer;' })}
        </div>`;
        }).join('');
        overlay.innerHTML = `
      <div style="background: var(--bg-primary, #1a1a2e); border: 2px solid rgba(16, 185, 129, 0.4); border-radius: 16px; max-width: 620px; width: 95%; box-shadow: 0 25px 50px rgba(0,0,0,0.5); max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;">
        <!-- 헤더 -->
        <div style="padding: 1rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
          <h3 style="margin: 0; color: #34d399; font-size: 1.1rem; font-weight: 700;">📋 개별 예약 설정</h3>
          <button type="button" id="ma-indv-schedule-close" style="background: none; border: none; color: var(--text-muted, #999); font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
        </div>

        <!-- 전체 선택/해제 + 일괄 설정 -->
        <div style="padding: 0.75rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.8rem; color: var(--text-muted);">
            <input type="checkbox" id="ma-indv-select-all" style="width: 16px; height: 16px; accent-color: #10b981;">
            <span>전체 선택</span>
          </label>
          <div style="margin-left: auto; display: flex; align-items: center; gap: 0.4rem;">
            <span style="font-size: 0.75rem; color: var(--text-muted);">선택 항목 일괄:</span>
            <input type="date" id="ma-indv-bulk-date" style="padding: 0.3rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.75rem; color-scheme: dark;">
            ${(0, time24Select_1.createTime24Select)({ id: 'ma-indv-bulk-time', defaultValue: '09:00', step: 10, selectStyle: 'padding: 0.3rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.7rem; color-scheme: dark; cursor: pointer;' })}
            <button type="button" id="ma-indv-bulk-apply" style="padding: 0.3rem 0.6rem; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px; color: #60a5fa; cursor: pointer; font-size: 0.75rem; font-weight: 600;">적용</button>
          </div>
        </div>

        <!-- 헤더 라벨 -->
        <div style="padding: 0.4rem 1.5rem; display: grid; grid-template-columns: 30px 1fr auto auto; gap: 0.5rem; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <span></span>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">대기열 항목</span>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; width: 130px; text-align: center;">날짜</span>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; width: 100px; text-align: center;">시간</span>
        </div>

        <!-- 아이템 리스트 (스크롤) -->
        <div style="flex: 1; overflow-y: auto; padding: 0.75rem 1.5rem; display: flex; flex-direction: column; gap: 0.4rem;">
          ${itemRows}
        </div>

        <!-- 푸터 -->
        <div style="padding: 0.75rem 1.5rem; border-top: 1px solid rgba(255,255,255,0.08); display: flex; gap: 0.5rem;">
          <button type="button" id="ma-indv-schedule-cancel" style="flex: 1; padding: 0.7rem; background: var(--bg-tertiary, #333); color: var(--text-muted, #999); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.85rem;">취소</button>
          <button type="button" id="ma-indv-schedule-save" style="flex: 2; padding: 0.7rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">💾 예약 저장</button>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);
        (0, time24Select_1.bindTime24Events)(overlay);
        document.getElementById('ma-indv-select-all')?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            overlay.querySelectorAll('.ma-indv-check').forEach(cb => {
                cb.checked = checked;
            });
        });
        document.getElementById('ma-indv-bulk-apply')?.addEventListener('click', () => {
            const bulkDate = document.getElementById('ma-indv-bulk-date')?.value;
            const bulkTime = document.getElementById('ma-indv-bulk-time')?.value || '09:00';
            if (!bulkDate) {
                toastManager.warning('📅 일괄 적용할 날짜를 선택해주세요.');
                return;
            }
            let appliedCount = 0;
            overlay.querySelectorAll('.ma-indv-check').forEach(cb => {
                if (cb.checked) {
                    const idx = cb.dataset.idx;
                    const dateInput = overlay.querySelector(`.ma-indv-date[data-idx="${idx}"]`);
                    if (dateInput)
                        dateInput.value = bulkDate;
                    if (idx != null)
                        (0, time24Select_1.setTime24ValueByIdx)(idx, bulkTime, overlay);
                    appliedCount++;
                }
            });
            if (appliedCount > 0) {
                toastManager.info(`✅ ${appliedCount}개 항목에 ${bulkDate} ${bulkTime} 일괄 적용됨`);
            }
            else {
                toastManager.warning('⚠️ 체크된 항목이 없습니다.');
            }
        });
        const handleEscIndv = (e) => { if (e.key === 'Escape')
            closeModal(); };
        const closeModal = () => { document.removeEventListener('keydown', handleEscIndv); overlay.remove(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay)
            closeModal(); });
        document.getElementById('ma-indv-schedule-close')?.addEventListener('click', closeModal);
        document.getElementById('ma-indv-schedule-cancel')?.addEventListener('click', closeModal);
        document.getElementById('ma-indv-schedule-save')?.addEventListener('click', () => {
            let savedCount = 0;
            overlay.querySelectorAll('.ma-indv-check').forEach(cb => {
                const idx = parseInt(cb.dataset.idx || '0');
                const checked = cb.checked;
                const dateInput = overlay.querySelector(`.ma-indv-date[data-idx="${idx}"]`);
                const timeInput = overlay.querySelector(`.ma-indv-time[data-idx="${idx}"]`);
                const item = publishQueue[idx];
                if (!item)
                    return;
                if (checked && dateInput?.value) {
                    const timeVal = timeInput?.value || '09:00';
                    const scheduledTime = new Date(`${dateInput.value}T${timeVal}`);
                    const minAllowed = new Date(Date.now() + 15 * 60 * 1000);
                    if (scheduledTime.getTime() < minAllowed.getTime()) {
                        const label = (item.accountName || item.sourceUrl || '').substring(0, 15);
                        toastManager.error(`❌ "${label}..." 예약 시간이 현재 기준 15분 이후여야 합니다!`);
                        return;
                    }
                    item.publishMode = 'schedule';
                    item.scheduleDate = dateInput.value;
                    item.scheduleTime = timeVal;
                    item.scheduleType = 'naver-server';
                    item.scheduleUserModified = true;
                    savedCount++;
                }
                else if (!checked) {
                    item.publishMode = 'publish';
                    item.scheduleDate = undefined;
                    item.scheduleTime = undefined;
                    item.scheduleUserModified = undefined;
                }
            });
            toastManager.success(`✅ ${savedCount}개 항목 예약 저장 완료!`);
            renderQueue();
            updateMAScheduleStatusSummary();
            closeModal();
        });
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    function renderQueue() {
        const container = document.getElementById('ma-queue-container');
        const noQueueMsg = document.getElementById('ma-no-queue');
        const queueCountEl = document.getElementById('ma-queue-count');
        const shuffleBtn = document.getElementById('ma-shuffle-queue-btn');
        if (!container)
            return;
        if (queueCountEl) {
            queueCountEl.textContent = String(publishQueue.length);
        }
        if (shuffleBtn) {
            shuffleBtn.style.display = publishQueue.length >= 2 ? 'inline-flex' : 'none';
        }
        if (publishQueue.length === 0) {
            if (noQueueMsg)
                noQueueMsg.style.display = 'block';
            container.innerHTML = '';
            if (noQueueMsg)
                container.appendChild(noQueueMsg);
            return;
        }
        if (noQueueMsg)
            noQueueMsg.style.display = 'none';
        container.innerHTML = publishQueue.map((item, index) => {
            const sourceDisplay = item.sourceUrl ? `🔗 ${item.sourceUrl.substring(0, 30)}...` : `🔑 ${item.sourceKeyword}`;
            const toneEmoji = { friendly: '😊', professional: '💼', casual: '🎒', formal: '🎩', humorous: '😄', community_fan: '🔥', mom_cafe: '👩‍👧', storyteller: '📖', expert_review: '🔬', calm_info: '🍃', text_hip: '🖤', sincere_exposure: '🔍', data_verified: '📊', mentor: '🧑‍🏫', self_interview: '💬' }[item.toneStyle] || '😊';
            const ctaBadge = item.ctaType === 'previous-post' ? '<span style="background: #3b82f6; color: white; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.65rem; margin-left: 0.25rem;">🔗이전글</span>' :
                item.ctaType === 'custom' ? '<span style="background: #8b5cf6; color: white; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.65rem; margin-left: 0.25rem;">✏️CTA</span>' : '';
            const scheduleBadge = item.publishMode === 'schedule' && item.scheduleDate
                ? `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.65rem; margin-left: 0.25rem; font-weight: 600;">📅 ${item.scheduleDate} ${item.scheduleTime || ''}</span>`
                : item.publishMode === 'draft'
                    ? '<span style="background: rgba(156, 163, 175, 0.2); color: #9ca3af; padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.65rem; margin-left: 0.25rem; font-weight: 600;">📝 임시</span>'
                    : '';
            return `
        <div class="ma-queue-item" data-queue-id="${item.id}" style="
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 8px;
          padding: 0.75rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: var(--text-strong); font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span style="background: #10b981; color: white; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.75rem;">${index + 1}</span>
              👤 ${escapeHtml(item.accountName)}${ctaBadge}${scheduleBadge}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${sourceDisplay} | ${toneEmoji}
            </div>
          </div>
          <div style="display: flex; gap: 0.3rem; align-items: center; flex-shrink: 0;">
            <button type="button" class="ma-queue-edit-btn" data-queue-id="${item.id}" title="수정" style="padding: 0.3rem 0.5rem; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.5); border-radius: 4px; font-size: 0.7rem; cursor: pointer;">⚙️</button>
            <button type="button" class="ma-queue-remove-btn" data-queue-id="${item.id}" title="삭제" style="padding: 0.3rem 0.5rem; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius: 4px; font-size: 0.7rem; cursor: pointer;">✕</button>
          </div>
        </div>
      `;
        }).join('');
        container.querySelectorAll('.ma-queue-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const queueId = e.currentTarget.dataset.queueId;
                if (!queueId)
                    return;
                const item = publishQueue.find(q => q.id === queueId);
                if (!item)
                    return;
                window.currentEditingQueueId = queueId;
                openFullautoSettingModal(item.accountId, item.accountName);
                setTimeout(() => {
                    const urlInput = document.getElementById('ma-setting-url');
                    const keywordInput = document.getElementById('ma-setting-keyword');
                    const toneSelect = document.getElementById('ma-setting-tone');
                    const ctaTypeSelect = document.getElementById('ma-setting-cta-type');
                    const ctaUrlInput = document.getElementById('ma-setting-cta-url');
                    const ctaTextInput = document.getElementById('ma-setting-cta-text');
                    if (urlInput && item.sourceUrl)
                        urlInput.value = item.sourceUrl;
                    if (keywordInput && item.sourceKeyword)
                        keywordInput.value = item.sourceKeyword;
                    if (toneSelect && item.toneStyle)
                        toneSelect.value = item.toneStyle;
                    if (ctaTypeSelect && item.ctaType)
                        ctaTypeSelect.value = item.ctaType;
                    if (ctaUrlInput && item.ctaUrl)
                        ctaUrlInput.value = item.ctaUrl;
                    if (ctaTextInput && item.ctaText)
                        ctaTextInput.value = item.ctaText;
                    if (item.publishMode) {
                        const radio = document.querySelector(`input[name="ma-setting-publish-mode"][value="${item.publishMode}"]`);
                        if (radio)
                            radio.checked = true;
                    }
                    const addBtn = document.getElementById('ma-add-to-queue-btn');
                    if (addBtn) {
                        addBtn.innerHTML = '✏️ 수정 완료 (대기열에 추가)';
                    }
                    console.log(`[Queue] 수정 모드 진입: ${queueId}, 계정: ${item.accountName}`);
                }, 100);
            });
        });
        container.querySelectorAll('.ma-queue-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const queueId = e.currentTarget.dataset.queueId;
                if (queueId) {
                    publishQueue = publishQueue.filter(item => item.id !== queueId);
                    renderQueue();
                }
            });
        });
    }
    function saveLastFullAutoSetting(accountId, snapshot) {
        if (!accountId)
            return;
        try {
            const raw = localStorage.getItem('multiAccount.lastSettings') || '{}';
            const all = JSON.parse(raw) || {};
            all[accountId] = { ...snapshot, savedAt: Date.now() };
            localStorage.setItem('multiAccount.lastSettings', JSON.stringify(all));
        }
        catch (e) {
            console.warn('[multiAccountManager] saveLastFullAutoSetting failed:', e);
        }
    }
    function loadLastFullAutoSetting(accountId) {
        if (!accountId)
            return null;
        try {
            const raw = localStorage.getItem('multiAccount.lastSettings') || '{}';
            const all = JSON.parse(raw) || {};
            return all[accountId] || null;
        }
        catch (e) {
            console.warn('[multiAccountManager] loadLastFullAutoSetting failed:', e);
            return null;
        }
    }
    function openFullautoSettingModal(accountId, accountName) {
        const modal = document.getElementById('ma-fullauto-setting-modal');
        if (!modal)
            return;
        try {
            modal.dataset.isJabBlog = '0';
            window.api.getAllBlogAccounts?.().then((res) => {
                const acc = res?.accounts?.find((a) => String(a?.id || '') === String(accountId || ''));
                const isJab = acc?.settings?.isJabBlog === true;
                try {
                    modal.dataset.isJabBlog = isJab ? '1' : '0';
                }
                catch (e) {
                    console.warn('[multiAccountManager] catch ignored:', e);
                }
            }).catch((e) => {
                console.warn('[multiAccountManager] promise catch ignored:', e);
            });
        }
        catch (e) {
            console.warn('[multiAccountManager] catch ignored:', e);
        }
        const accountIdInput = document.getElementById('ma-setting-account-id');
        const accountNameEl = document.getElementById('ma-setting-account-name');
        if (accountIdInput)
            accountIdInput.value = accountId;
        if (accountNameEl)
            accountNameEl.textContent = `📌 ${accountName}`;
        const urlInput = document.getElementById('ma-setting-url');
        const keywordInput = document.getElementById('ma-setting-keyword');
        const imageSourceSelect = document.getElementById('ma-setting-image-source');
        const toneSelect = document.getElementById('ma-setting-tone');
        const ctaTypeSelectInit = document.getElementById('ma-setting-cta-type');
        const ctaUrlInputInit = document.getElementById('ma-setting-cta-url');
        const ctaTextInputInit = document.getElementById('ma-setting-cta-text');
        if (urlInput)
            urlInput.value = '';
        if (keywordInput)
            keywordInput.value = '';
        if (imageSourceSelect) {
            const currentUiSource = UnifiedDOMCache.getImageSource();
            imageSourceSelect.value = currentUiSource || 'nano-banana-pro';
        }
        if (toneSelect)
            toneSelect.value = 'friendly';
        if (ctaTypeSelectInit)
            ctaTypeSelectInit.value = 'none';
        if (ctaUrlInputInit)
            ctaUrlInputInit.value = '';
        if (ctaTextInputInit)
            ctaTextInputInit.value = '';
        try {
            const last = loadLastFullAutoSetting(accountId);
            if (last) {
                if (toneSelect && typeof last.toneStyle === 'string')
                    toneSelect.value = last.toneStyle;
                if (ctaTypeSelectInit && typeof last.ctaType === 'string')
                    ctaTypeSelectInit.value = last.ctaType;
                if (ctaUrlInputInit && typeof last.ctaUrl === 'string')
                    ctaUrlInputInit.value = last.ctaUrl;
                if (ctaTextInputInit && typeof last.ctaText === 'string')
                    ctaTextInputInit.value = last.ctaText;
                if (imageSourceSelect && typeof last.imageSource === 'string')
                    imageSourceSelect.value = last.imageSource;
                const catSel = document.getElementById('ma-setting-category');
                if (catSel && typeof last.category === 'string')
                    catSel.value = last.category;
                const contentModeSel = document.getElementById('ma-setting-content-mode');
                if (contentModeSel && typeof last.contentMode === 'string')
                    contentModeSel.value = last.contentMode;
                const realCatSel = document.getElementById('ma-setting-real-category');
                if (realCatSel && typeof last.realCategoryName === 'string') {
                    const matchOpt = Array.from(realCatSel.options).find(o => o.text === last.realCategoryName);
                    if (matchOpt)
                        realCatSel.value = matchOpt.value;
                }
                if (typeof last.publishMode === 'string') {
                    const radio = document.querySelector(`input[name="ma-setting-publish-mode"][value="${last.publishMode}"]`);
                    if (radio)
                        radio.checked = true;
                }
                const setCheckbox = (id, val) => {
                    const el = document.getElementById(id);
                    if (el && typeof val === 'boolean')
                        el.checked = val;
                };
                setCheckbox('ma-setting-include-thumbnail-text', last.includeThumbnailText);
                setCheckbox('ma-setting-use-ai-image', last.useAiImage);
                setCheckbox('ma-setting-create-product-thumbnail', last.createProductThumbnail);
                setCheckbox('ma-setting-keyword-as-title', last.keywordAsTitle);
                setCheckbox('ma-setting-keyword-title-prefix', last.keywordTitlePrefix);
                console.log(`[multiAccountManager] 🔄 ${accountId} 계정 마지막 세팅 자동 복원`);
            }
        }
        catch (e) {
            console.warn('[multiAccountManager] prefill from last failed:', e);
        }
        const imageSettingsBtn = document.getElementById('ma-open-image-settings-btn');
        if (imageSettingsBtn) {
            const newImgBtn = imageSettingsBtn.cloneNode(true);
            imageSettingsBtn.parentNode?.replaceChild(newImgBtn, imageSettingsBtn);
            newImgBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[MA-ImageSettings] 🖼️ 이미지 설정 버튼 클릭됨 (직접 이벤트 리스너)');
                const maModal = document.getElementById('ma-fullauto-setting-modal');
                if (maModal && maModal.style.display !== 'none') {
                    maModal.setAttribute('data-was-visible', 'true');
                    maModal.style.visibility = 'hidden';
                    console.log('[MA-ImageSettings] 임시 숨김: ma-fullauto-setting-modal');
                }
                if (typeof openHeadingImageModal === 'function') {
                    openHeadingImageModal();
                    console.log('[MA-ImageSettings] ✅ openHeadingImageModal 호출 완료');
                }
                else {
                    console.error('[MA-ImageSettings] ❌ openHeadingImageModal 함수를 찾을 수 없습니다');
                    toastManager.warning('이미지 설정 모달을 열 수 없습니다. 앱을 새로고침해주세요.');
                }
            });
            console.log('[MA-ImageSettings] ✅ 이미지 설정 버튼 이벤트 리스너 추가 완료');
        }
        const categoryBtn = document.getElementById('ma-setting-open-category-btn');
        if (categoryBtn) {
            const newCatBtn = categoryBtn.cloneNode(true);
            categoryBtn.parentNode?.replaceChild(newCatBtn, categoryBtn);
            newCatBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[MA-Category] 📂 콘텐츠 카테고리 버튼 클릭됨');
                const maModal = document.getElementById('ma-fullauto-setting-modal');
                if (maModal && maModal.style.display !== 'none') {
                    maModal.setAttribute('data-was-visible', 'true');
                    maModal.style.visibility = 'hidden';
                    console.log('[MA-Category] 임시 숨김: ma-fullauto-setting-modal');
                }
                const opener = window.openCategoryModalInSettingMode;
                if (typeof opener === 'function') {
                    opener();
                    console.log('[MA-Category] ✅ openCategoryModalInSettingMode 호출 완료');
                }
                else {
                    console.error('[MA-Category] ❌ openCategoryModalInSettingMode 함수를 찾을 수 없습니다');
                    toastManager.warning('카테고리 선택 모달을 열 수 없습니다. 앱을 새로고침해주세요.');
                    if (maModal && maModal.getAttribute('data-was-visible') === 'true') {
                        maModal.style.visibility = 'visible';
                        maModal.removeAttribute('data-was-visible');
                    }
                }
            });
            console.log('[MA-Category] ✅ 콘텐츠 카테고리 버튼 이벤트 리스너 추가 완료');
        }
        const analyzeBtn = document.getElementById('ma-setting-analyze-category-btn');
        if (analyzeBtn) {
            const newAnalyzeBtn = analyzeBtn.cloneNode(true);
            analyzeBtn.parentNode?.replaceChild(newAnalyzeBtn, analyzeBtn);
            newAnalyzeBtn.addEventListener('click', async () => {
                try {
                    newAnalyzeBtn.disabled = true;
                    newAnalyzeBtn.innerHTML = '⏳ 분석중...';
                    const accResult = await window.api.getAllBlogAccounts();
                    const account = accResult.accounts?.find((a) => String(a.id) === String(accountId));
                    if (!account?.naverId) {
                        toastManager.warning('계정 정보를 찾을 수 없습니다.');
                        return;
                    }
                    const response = await window.api.fetchBlogCategories({
                        naverId: account.naverId,
                        naverPassword: account.naverPassword
                    });
                    if (response.success && response.categories && response.categories.length > 0) {
                        const realCatContainer = document.getElementById('ma-setting-real-category-container');
                        const realCatSelect = document.getElementById('ma-setting-real-category');
                        if (realCatContainer && realCatSelect) {
                            realCatSelect.innerHTML = response.categories.map((cat) => `<option value="${cat.categoryNo || cat.id}">${cat.categoryName || cat.name}</option>`).join('');
                            realCatContainer.style.display = 'block';
                        }
                        toastManager.success(`✅ ${response.categories.length}개의 블로그 카테고리 분석 완료`);
                    }
                    else {
                        toastManager.error(response.message || '카테고리 분석 실패');
                    }
                }
                catch (err) {
                    console.error('카테고리 분석 오류:', err);
                    toastManager.error('분석 중 오류 발생');
                }
                finally {
                    newAnalyzeBtn.disabled = false;
                    newAnalyzeBtn.innerHTML = '<span>🔍</span> 블로그 카테고리 분석하기';
                }
            });
        }
        const contentModeSelect = document.getElementById('ma-setting-content-mode');
        if (contentModeSelect)
            contentModeSelect.value = 'seo';
        const thumbnailCheckbox = document.getElementById('ma-setting-include-thumbnail-text');
        if (thumbnailCheckbox)
            thumbnailCheckbox.checked = false;
        const useAiImageCheck = document.getElementById('ma-setting-use-ai-image');
        if (useAiImageCheck)
            useAiImageCheck.checked = true;
        const createThumbnailCheck = document.getElementById('ma-setting-create-product-thumbnail');
        if (createThumbnailCheck)
            createThumbnailCheck.checked = false;
        const publishModePublish = document.querySelector('input[name="ma-setting-publish-mode"][value="publish"]');
        if (publishModePublish)
            publishModePublish.checked = true;
        const ctaTypeSelect = document.getElementById('ma-setting-cta-type');
        const ctaUrlInput = document.getElementById('ma-setting-cta-url');
        const ctaTextInput = document.getElementById('ma-setting-cta-text');
        const categorySelectForCta = document.getElementById('ma-setting-category');
        try {
            if (!document.getElementById('ma-setting-select-prevpost-btn') && ctaUrlInput?.parentElement) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.id = 'ma-setting-select-prevpost-btn';
                btn.textContent = '🔍 이전글 선택';
                btn.style.cssText = `
          margin-top: 0.5rem;
          padding: 0.55rem 0.75rem;
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.45);
          border-radius: 8px;
          cursor: pointer;
          font-weight: 800;
          font-size: 0.85rem;
          width: 100%;
        `;
                btn.addEventListener('click', () => {
                    const postsAll = loadGeneratedPosts();
                    const posts = (postsAll || []).filter((p) => String(p?.publishedUrl || '').trim().length > 0);
                    if (posts.length === 0) {
                        toastManager.warning('발행된 이전 글이 없습니다. 먼저 글을 발행한 뒤 다시 시도하세요.');
                        return;
                    }
                    const catKey = String(categorySelectForCta?.value || '').trim();
                    showPostSelectionModal(posts, (selectedPost) => {
                        if (!selectedPost)
                            return;
                        const url = String(selectedPost.publishedUrl || '').trim();
                        if (ctaUrlInput && url)
                            ctaUrlInput.value = url;
                        if (ctaTextInput && selectedPost.title)
                            ctaTextInput.value = `📖 ${selectedPost.title}`;
                    }, { defaultCategory: catKey || undefined });
                });
                ctaUrlInput.parentElement.appendChild(btn);
            }
        }
        catch (e) {
            console.warn('[multiAccountManager] catch ignored:', e);
        }
        if (ctaTypeSelect && !ctaTypeSelect.hasAttribute('data-listener-added')) {
            ctaTypeSelect.setAttribute('data-listener-added', 'true');
            ctaTypeSelect.addEventListener('change', () => {
                const v = String(ctaTypeSelect.value || '').trim();
                if (v !== 'previous-post')
                    return;
                const isJabBlog = String(modal?.dataset?.isJabBlog || '0') === '1';
                const catKey = String(categorySelectForCta?.value || '').trim();
                const postsAll = loadGeneratedPosts();
                const published = (postsAll || []).filter((p) => String(p?.publishedUrl || '').trim().length > 0);
                if (published.length === 0) {
                    toastManager.warning('발행된 이전 글이 없습니다. 먼저 글을 발행한 뒤 다시 시도하세요.');
                    return;
                }
                if (!isJabBlog && catKey) {
                    const candidates = published.filter((p) => String(p?.category || '').trim() === catKey);
                    if (candidates.length > 0) {
                        candidates.sort((a, b) => {
                            const aT = new Date(a.publishedAt || a.updatedAt || a.createdAt || 0).getTime();
                            const bT = new Date(b.publishedAt || b.updatedAt || b.createdAt || 0).getTime();
                            return bT - aT;
                        });
                        const chosen = candidates[0];
                        const url = String(chosen?.publishedUrl || '').trim();
                        if (ctaUrlInput && url)
                            ctaUrlInput.value = url;
                        if (ctaTextInput && chosen?.title)
                            ctaTextInput.value = `📖 ${chosen.title}`;
                        toastManager.success('✅ 같은 카테고리의 최신 발행글이 자동으로 연결되었습니다.');
                        return;
                    }
                }
                showPostSelectionModal(published, (selectedPost) => {
                    if (!selectedPost)
                        return;
                    const url = String(selectedPost.publishedUrl || '').trim();
                    if (ctaUrlInput && url)
                        ctaUrlInput.value = url;
                    if (ctaTextInput && selectedPost.title)
                        ctaTextInput.value = `📖 ${selectedPost.title}`;
                }, { defaultCategory: catKey || undefined });
            });
        }
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
    }
    document.querySelector('[data-close-fullauto-setting]')?.addEventListener('click', () => {
        const modal = document.getElementById('ma-fullauto-setting-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
        window.currentEditingQueueId = null;
        const addBtn = document.getElementById('ma-add-to-queue-btn');
        if (addBtn)
            addBtn.innerHTML = '+ 대기열에 추가';
    });
    setupMutualExclusiveCheckboxes('ma-setting-keyword-as-title', 'ma-setting-keyword-title-prefix');
    document.getElementById('ma-add-to-queue-btn')?.addEventListener('click', () => {
        const accountId = document.getElementById('ma-setting-account-id')?.value;
        const accountNameEl = document.getElementById('ma-setting-account-name');
        const accountName = accountNameEl?.textContent?.replace('📌 ', '') || '';
        try {
            const urlAuto = document.getElementById('ma-modal-url-auto-collect');
            const fillGap = document.getElementById('ma-modal-fillgap-ai');
            if (urlAuto)
                localStorage.setItem('ma_urlAutoCollect', urlAuto.checked ? '1' : '0');
            if (fillGap)
                localStorage.setItem('ma_fillGapAi', fillGap.checked ? '1' : '0');
        }
        catch { }
        const urlText = document.getElementById('ma-setting-url')?.value || '';
        const keywordText = document.getElementById('ma-setting-keyword')?.value || '';
        const urls = urlText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        const keywords = keywordText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        const imageSource = getFullAutoImageSource();
        const toneStyle = document.getElementById('ma-setting-tone')?.value || 'friendly';
        const category = String(document.getElementById('ma-setting-category')?.value || '').trim() || 'general';
        const realCatSelect = document.getElementById('ma-setting-real-category');
        const realCategoryName = (realCatSelect?.options && realCatSelect.selectedIndex >= 0)
            ? realCatSelect.options[realCatSelect.selectedIndex]?.text || ''
            : '';
        const contentMode = (document.getElementById('ma-setting-content-mode')?.value || 'seo');
        const customPrompt = (() => {
            const modalPrompt = document.getElementById('ma-setting-custom-prompt')?.value?.trim();
            if (modalPrompt)
                return modalPrompt;
            const unifiedPrompt = document.getElementById('custom-prompt-input')?.value?.trim();
            if (unifiedPrompt)
                return unifiedPrompt;
            const mainPrompt = document.getElementById('unified-custom-prompt')?.value?.trim();
            if (mainPrompt)
                return mainPrompt;
            if (contentMode === 'custom') {
                alert('✏️ 사용자 정의 모드 필수:\n\n개인 프롬프트를 입력해주세요.');
                throw new Error('customPrompt 누락 — custom 모드 선택 시 필수');
            }
            return undefined;
        })();
        const businessInfo = contentMode === 'business' ? (() => {
            const globalInfo = window._businessInfo;
            if (globalInfo && globalInfo.name)
                return globalInfo;
            const get = (id) => document.getElementById(id)?.value?.trim() || undefined;
            const tryGet = (suffix) => get('ma-business-info-' + suffix) || get('unified-business-info-' + suffix) || get('business-info-' + suffix);
            const nationwide = document.getElementById('ma-business-service-nationwide')?.checked ||
                document.getElementById('unified-business-service-nationwide')?.checked ||
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
                missing.push('전화번호 또는 카카오톡');
            if (info.serviceArea === 'regional' && !info.region)
                missing.push('서비스 지역');
            if (missing.length > 0) {
                alert(`🏢 업체 홍보 모드 필수 정보 누락:\n\n• ${missing.join('\n• ')}\n\n발행 전 입력해주세요.`);
                throw new Error(`업체 정보 누락: ${missing.join(', ')}`);
            }
            return info;
        })() : undefined;
        const ctaType = document.getElementById('ma-setting-cta-type')?.value || 'none';
        const ctaUrl = document.getElementById('ma-setting-cta-url')?.value?.trim() || '';
        const ctaText = document.getElementById('ma-setting-cta-text')?.value?.trim() || '';
        const includeThumbnailText = document.getElementById('ma-setting-include-thumbnail-text')?.checked || false;
        const useAiImage = document.getElementById('ma-setting-use-ai-image')?.checked ?? true;
        const createProductThumbnail = document.getElementById('ma-setting-create-product-thumbnail')?.checked ?? false;
        const keywordAsTitle = document.getElementById('ma-setting-keyword-as-title')?.checked || false;
        const keywordTitlePrefix = document.getElementById('ma-setting-keyword-title-prefix')?.checked || false;
        const affiliateLink = contentMode === 'affiliate'
            ? (document.getElementById('ma-shopping-affiliate-link')?.value?.trim() ||
                document.getElementById('ma-setting-affiliate-link')?.value?.trim() || '')
            : undefined;
        const videoOption = contentMode === 'affiliate'
            ? (document.getElementById('ma-shopping-video-option')?.checked ||
                document.getElementById('ma-setting-video-option')?.checked || false)
            : undefined;
        const publishModeRadioVal = document.querySelector('input[name="ma-setting-publish-mode"]:checked')?.value;
        const publishMode = publishModeRadioVal === 'draft' ? 'draft' : publishModeRadioVal === 'schedule' ? 'schedule' : 'publish';
        const scheduleDate = publishMode === 'schedule'
            ? (document.getElementById('ma-setting-schedule-date')?.value || undefined)
            : undefined;
        const scheduleTime = publishMode === 'schedule'
            ? (document.getElementById('ma-setting-schedule-time')?.value || undefined)
            : undefined;
        const scheduleType = publishMode === 'schedule' ? 'naver-server' : undefined;
        const scheduleInterval = undefined;
        console.log(`[🔍 DIAG-1 큐생성] publishModeRadioVal=${publishModeRadioVal}, publishMode=${publishMode}, scheduleDate=${scheduleDate}, scheduleTime=${scheduleTime}`);
        const items = [];
        if (urls.length > 0) {
            urls.forEach(url => items.push({ url, keyword: '' }));
        }
        else if (keywords.length > 0) {
            keywords.forEach(keyword => items.push({ url: '', keyword }));
        }
        if (items.length === 0) {
            toastManager.warning('URL 또는 키워드를 입력해주세요.');
            return;
        }
        let addedCount = 0;
        const presetThumbnails = window.presetThumbnails || {};
        const manualThumbnailForQueue = presetThumbnails['ma-full-auto'] || presetThumbnails['ma-semi-auto'] || null;
        const editingQueueId = window.currentEditingQueueId;
        if (editingQueueId) {
            const { url, keyword } = items[0];
            const existingItem = publishQueue.find(q => q.id === editingQueueId);
            const updatedItem = {
                id: editingQueueId,
                accountId,
                accountName,
                sourceUrl: url,
                sourceKeyword: keyword,
                imageSource,
                toneStyle,
                category,
                contentMode,
                customPrompt,
                businessInfo,
                ctaType,
                ctaUrl,
                ctaText,
                includeThumbnailText,
                useAiImage,
                createProductThumbnail,
                publishMode: existingItem?.publishMode || publishMode,
                scheduleDate: existingItem?.scheduleDate,
                scheduleTime: existingItem?.scheduleTime,
                scheduleType: existingItem?.scheduleType,
                scheduleInterval,
                affiliateLink,
                videoOption,
                manualThumbnail: manualThumbnailForQueue,
                realCategoryName,
                keywordAsTitle,
                keywordTitlePrefix,
                // [v2.11.x] URL 이미지 자동 수집 기능 제거 — 항상 비활성
                urlAutoCollect: false,
                fillGapWithAI: false,
            };
            const idx = publishQueue.findIndex(q => q.id === editingQueueId);
            if (idx !== -1) {
                publishQueue[idx] = updatedItem;
            }
            else {
                publishQueue.push(updatedItem);
            }
            addedCount = 1;
            window.currentEditingQueueId = null;
            const addBtn = document.getElementById('ma-add-to-queue-btn');
            if (addBtn)
                addBtn.innerHTML = '+ \uB300\uAE30\uC5F4\uC5D0 \uCD94\uAC00';
        }
        else {
            items.forEach(({ url, keyword }) => {
                const queueItem = {
                    id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    accountId,
                    accountName,
                    sourceUrl: url,
                    sourceKeyword: keyword,
                    imageSource,
                    toneStyle,
                    category,
                    contentMode,
                    ctaType,
                    ctaUrl,
                    ctaText,
                    includeThumbnailText,
                    useAiImage,
                    createProductThumbnail,
                    publishMode,
                    scheduleDate,
                    scheduleTime,
                    scheduleType,
                    scheduleInterval,
                    affiliateLink,
                    videoOption,
                    manualThumbnail: manualThumbnailForQueue,
                    realCategoryName,
                    keywordAsTitle,
                    keywordTitlePrefix,
                    // [v2.11.x] URL 이미지 자동 수집 기능 제거 — 항상 비활성
                    urlAutoCollect: false,
                    fillGapWithAI: false,
                };
                publishQueue.push(queueItem);
                addedCount++;
            });
        }
        renderQueue();
        saveLastFullAutoSetting(accountId, {
            sourceUrl: urlText,
            sourceKeyword: keywordText,
            toneStyle,
            ctaType,
            ctaUrl,
            ctaText,
            publishMode,
            contentMode,
            category,
            realCategoryName,
            imageSource,
            includeThumbnailText,
            useAiImage,
            createProductThumbnail,
            keywordAsTitle,
            keywordTitlePrefix,
        });
        const modal = document.getElementById('ma-fullauto-setting-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
        window.currentEditingQueueId = null;
        const addBtnReset = document.getElementById('ma-add-to-queue-btn');
        if (addBtnReset)
            addBtnReset.innerHTML = '+ 대기열에 추가';
        document.getElementById('ma-setting-url').value = '';
        document.getElementById('ma-setting-keyword').value = '';
        if (addedCount === 1) {
            toastManager.success(`${accountName} 계정이 대기열에 추가되었습니다.`);
        }
        else {
            toastManager.success(`${accountName} 계정에서 ${addedCount}개 항목이 대기열에 추가되었습니다.`);
        }
        if (typeof window.clearManualThumbnail === 'function') {
            window.clearManualThumbnail();
            console.log('[Queue] 수동 썸네일 초기화 완료');
        }
        if (window.presetThumbnails) {
            window.presetThumbnails = {
                'image-tab': null,
                'full-auto': null,
                'continuous': null,
                'ma-semi-auto': null,
                'ma-full-auto': null
            };
            console.log('[Queue] presetThumbnails 초기화 완료');
        }
    });
    document.getElementById('ma-setting-content-mode')?.addEventListener('change', (e) => {
        const mode = e.target.value;
        const shoppingSettings = document.getElementById('ma-shopping-connect-settings');
        if (shoppingSettings) {
            shoppingSettings.style.display = mode === 'affiliate' ? 'block' : 'none';
        }
        const customPromptPanel = document.getElementById('ma-setting-custom-prompt-panel');
        if (customPromptPanel) {
            customPromptPanel.style.display = mode === 'custom' ? 'block' : 'none';
        }
        if (mode === 'business' && !window._businessInfo) {
            setTimeout(() => window.openBusinessGlobalModal?.(), 200);
        }
    });
    document.getElementById('ma-setting-goto-thumbnail-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('ma-fullauto-setting-modal');
        if (modal)
            modal.style.display = 'none';
        window.currentEditingQueueId = null;
        const imageToolsTab = document.querySelector('[data-tab="image-tools"]');
        if (imageToolsTab) {
            imageToolsTab.click();
            setTimeout(() => {
                const thumbnailSubtab = document.querySelector('[data-subtab="thumbnail"]');
                if (thumbnailSubtab) {
                    thumbnailSubtab.click();
                    toastManager.info('🎨 썸네일 커스터마이징 화면입니다. 설정 후 풀오토 세팅으로 돌아가세요.');
                }
            }, 150);
        }
    });
    document.getElementById('ma-setting-goto-banner-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('ma-fullauto-setting-modal');
        if (modal)
            modal.style.display = 'none';
        window.currentEditingQueueId = null;
        const imageToolsTab = document.querySelector('[data-tab="image-tools"]');
        if (imageToolsTab) {
            imageToolsTab.click();
            setTimeout(() => {
                const bannerSubtab = document.querySelector('[data-subtab="shopping-banner"]');
                if (bannerSubtab) {
                    bannerSubtab.click();
                    toastManager.info('🎨 배너 커스터마이징 화면입니다.');
                }
            }, 150);
        }
    });
    document.getElementById('ma-clear-queue-btn')?.addEventListener('click', () => {
        if (publishQueue.length === 0) {
            toastManager.info('대기열이 비어있습니다.');
            return;
        }
        if (confirm('대기열을 모두 삭제하시겠습니까?')) {
            publishQueue = [];
            renderQueue();
            toastManager.success('대기열이 삭제되었습니다.');
        }
    });
    document.getElementById('ma-shuffle-queue-btn')?.addEventListener('click', () => {
        if (publishQueue.length < 2) {
            toastManager.info('셔플하려면 2개 이상의 항목이 필요합니다.');
            return;
        }
        for (let i = publishQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [publishQueue[i], publishQueue[j]] = [publishQueue[j], publishQueue[i]];
        }
        renderQueue();
        toastManager.success(`🔀 대기열 ${publishQueue.length}개 항목 순서가 랜덤으로 섞였습니다!`);
    });
    document.querySelectorAll('.ma-modal-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const subtab = btn.dataset.subtab;
            if (!subtab)
                return;
            document.querySelectorAll('.ma-modal-subtab-btn').forEach(b => {
                b.style.borderBottom = '3px solid transparent';
                b.style.color = 'var(--text-muted)';
                b.classList.remove('active');
            });
            btn.style.borderBottom = '3px solid #10b981';
            btn.style.color = '#10b981';
            btn.classList.add('active');
            document.querySelectorAll('.ma-modal-subtab-content').forEach(content => {
                content.style.display = 'none';
            });
            const contentId = `ma-modal-subtab-${subtab}-content`;
            const content = document.getElementById(contentId);
            if (content)
                content.style.display = 'block';
            if (subtab === 'schedule') {
                updateMAScheduleStatusSummary();
            }
        });
    });
    document.querySelectorAll('input[name="ma-setting-publish-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const value = e.target.value;
            if (value === 'schedule') {
                const scheduleTabBtn = document.querySelector('.ma-modal-subtab-btn[data-subtab="schedule"]');
                if (scheduleTabBtn)
                    scheduleTabBtn.click();
            }
        });
    });
    document.getElementById('ma-open-random-schedule-btn')?.addEventListener('click', () => {
        showMARandomScheduleModal();
    });
    document.getElementById('ma-open-individual-schedule-btn')?.addEventListener('click', () => {
        showMAIndividualScheduleModal();
    });
    updateMAScheduleStatusSummary();
    document.querySelectorAll('input[name="ma-shopping-subimage-source"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const value = e.target.value;
            setSubImageMode(value === 'collected' ? 'collected' : 'ai');
            if (value === 'nano-banana' || value === 'nano-banana-2' || value === 'nano-banana-pro' || value === 'openai-image' || value === 'flow' || value === 'prodia') {
                localStorage.setItem('scAIImageEngine', value);
                localStorage.setItem('fullAutoImageSource', value);
                localStorage.setItem('globalImageSource', value);
                window.globalImageSource = value;
                const mainSel = document.getElementById('image-source-select');
                if (mainSel && mainSel.value !== value)
                    mainSel.value = value;
                const contRadio = document.querySelector(`input[name="continuous-modal-shopping-subimage-source"][value="${value}"]`);
                if (contRadio && !contRadio.checked)
                    contRadio.checked = true;
                console.log(`[다중계정 쇼핑커넥트] 🍌🦆 AI 엔진 선택 → 전역 sync: ${value}`);
            }
            console.log('[다중계정 쇼핑커넥트] 📷 이미지 소스 → localStorage:', value);
        });
    });
    document.getElementById('ma-shopping-goto-thumbnail-btn')?.addEventListener('click', () => {
        const modalsToClose = ['ma-fullauto-setting-modal', 'multi-account-modal'];
        modalsToClose.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
            }
        });
        window.currentEditingQueueId = null;
        const imageToolsTab = document.querySelector('[data-tab="image-tools"]');
        if (imageToolsTab) {
            imageToolsTab.click();
            setTimeout(() => {
                const thumbnailSubtab = document.querySelector('[data-subtab="thumbnail"]');
                if (thumbnailSubtab) {
                    thumbnailSubtab.click();
                    toastManager.info('🎨 썸네일 커스터마이징 화면입니다. 설정 후 풀오토 세팅으로 돌아가세요.');
                }
            }, 150);
        }
    });
    document.getElementById('ma-shopping-goto-banner-btn')?.addEventListener('click', () => {
        const modalsToClose = ['ma-fullauto-setting-modal', 'multi-account-modal'];
        modalsToClose.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
            }
        });
        window.currentEditingQueueId = null;
        const imageToolsTab = document.querySelector('[data-tab="image-tools"]');
        if (imageToolsTab) {
            imageToolsTab.click();
            setTimeout(() => {
                const bannerSubtab = document.querySelector('[data-subtab="shopping-banner"]');
                if (bannerSubtab) {
                    bannerSubtab.click();
                    toastManager.info('🎨 배너 커스터마이징 화면입니다.');
                }
            }, 150);
        }
    });
    document.getElementById('ma-setting-select-prevpost-btn')?.addEventListener('click', async () => {
        try {
            const modal = document.createElement('div');
            modal.className = 'unified-modal-overlay';
            modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 20000; display: flex; align-items: center; justify-content: center;`;
            modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1.5rem; max-width: 600px; width: 95%; max-height: 80vh; overflow-y: auto;">
          <h3 style="margin: 0 0 1rem 0; color: var(--text-strong);">🔗 이전 글에서 CTA 데이터 가져오기</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">저장된 글 목록에서 CTA 링크로 사용할 글을 선택하세요.</p>
          <div id="ma-prev-post-list-container" style="min-height: 200px; display: flex; align-items: center; justify-content: center;">
            <div class="loader-small"></div>
          </div>
          <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end;">
            <button type="button" id="ma-prev-post-modal-cancel" style="padding: 0.6rem 1.2rem; background: var(--bg-tertiary); color: var(--text-muted); border: 1px solid var(--border-light); border-radius: 6px; cursor: pointer;">취소</button>
          </div>
        </div>
      `;
            document.body.appendChild(modal);
            const closeModal = () => {
                document.body.removeChild(modal);
            };
            modal.querySelector('#ma-prev-post-modal-cancel')?.addEventListener('click', closeModal);
            const listContainer = modal.querySelector('#ma-prev-post-list-container');
            listContainer.innerHTML = '<div style="color: var(--text-muted);">저장된 글 목록을 불러오는 중...</div>';
            const allPosts = loadGeneratedPosts();
            const publishedPosts = allPosts.filter((p) => p.publishedUrl && p.publishedUrl.trim());
            if (publishedPosts.length === 0 && allPosts.length === 0) {
                listContainer.innerHTML = '<div style="color: var(--text-muted);">저장된 글이 없습니다. 먼저 글을 생성해주세요.</div>';
                return;
            }
            const postsToShow = publishedPosts.length > 0 ? publishedPosts : allPosts;
            listContainer.innerHTML = `
        <div style="width: 100%;">
          <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px; margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-muted);">
            📝 총 ${allPosts.length}개 글 (발행됨: ${publishedPosts.length}개)
          </div>
          ${postsToShow.slice(0, 20).map((p) => `
            <div style="padding: 0.75rem; border-bottom: 1px solid var(--border-light); cursor: pointer; transition: background 0.2s;" class="ma-prev-post-row" data-url="${p.publishedUrl || ''}" data-title="${(p.title || '').replace(/"/g, '&quot;')}">
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-strong);">${p.title || '(제목 없음)'}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                ${p.publishedUrl ? '✅ 발행됨' : '⏳ 미발행'} | ${new Date(p.createdAt || Date.now()).toLocaleDateString('ko-KR')}
              </div>
              ${p.publishedUrl ? `<div style="font-size: 0.7rem; color: var(--primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.publishedUrl}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
            modal.querySelectorAll('.ma-prev-post-row').forEach(row => {
                row.addEventListener('click', () => {
                    const url = row.dataset.url || '';
                    const title = row.dataset.title || '';
                    const ctaUrlInput = document.getElementById('ma-setting-cta-url');
                    const ctaTextInput = document.getElementById('ma-setting-cta-text');
                    const ctaTypeSelect = document.getElementById('ma-setting-cta-type');
                    if (ctaUrlInput)
                        ctaUrlInput.value = url;
                    if (ctaTextInput)
                        ctaTextInput.value = `이전 글: ${title}`;
                    if (ctaTypeSelect)
                        ctaTypeSelect.value = 'previous-post';
                    toastManager.success('이전 글 링크가 CTA 설정에 반영되었습니다.');
                    closeModal();
                });
            });
        }
        catch (error) {
            console.error('ma-setting-select-prevpost-btn Error:', error);
            toastManager.error('포스팅 목록을 불러오는데 실패했습니다.');
        }
    });
    function updateSelectedCount() {
        const countEl = document.getElementById('ma-selected-count');
        if (countEl) {
            countEl.textContent = `${selectedAccountIds.length}개`;
        }
    }
    async function openAccountEditModal(accountId) {
        if (!accountEditModal)
            return;
        const titleEl = document.getElementById('ma-edit-title');
        const accountIdInput = document.getElementById('ma-edit-account-id');
        const nameInput = document.getElementById('ma-edit-name');
        const blogIdInput = document.getElementById('ma-edit-blog-id');
        const naverIdInput = document.getElementById('ma-edit-naver-id');
        const naverPwInput = document.getElementById('ma-edit-naver-pw');
        const isJabBlogCheckbox = document.getElementById('ma-edit-is-jabblog');
        const dailyLimitInput = document.getElementById('ma-edit-daily-limit');
        const imageSourceSelect = document.getElementById('ma-edit-image-source');
        const toneSelect = document.getElementById('ma-edit-tone-style');
        const publishModeSelect = document.getElementById('ma-edit-publish-mode');
        const autoRotateCheckbox = document.getElementById('ma-edit-auto-rotate');
        const deleteAccountBtn = document.getElementById('ma-delete-account-btn');
        if (accountId) {
            if (titleEl)
                titleEl.textContent = '계정 설정 편집';
            if (deleteAccountBtn)
                deleteAccountBtn.style.display = 'inline-block';
            const result = await window.api.getAllBlogAccounts();
            const account = result.accounts?.find((a) => a.id === accountId);
            if (account) {
                if (accountIdInput)
                    accountIdInput.value = accountId;
                if (nameInput)
                    nameInput.value = account.name || '';
                if (blogIdInput)
                    blogIdInput.value = account.blogId || account.name || '';
                if (isJabBlogCheckbox)
                    isJabBlogCheckbox.checked = account.settings?.isJabBlog === true;
                const credResult = await window.api.getAccountCredentials(accountId);
                if (credResult.success && credResult.credentials) {
                    if (naverIdInput)
                        naverIdInput.value = credResult.credentials.naverId || '';
                    if (naverPwInput)
                        naverPwInput.value = credResult.credentials.naverPassword || '';
                }
                if (dailyLimitInput)
                    dailyLimitInput.value = String(account.settings?.dailyLimit || 5);
                if (imageSourceSelect)
                    imageSourceSelect.value = account.settings?.imageSource || 'gemini';
                if (toneSelect)
                    toneSelect.value = account.settings?.toneStyle || 'friendly';
                if (publishModeSelect)
                    publishModeSelect.value = account.settings?.publishMode || 'publish';
                if (autoRotateCheckbox)
                    autoRotateCheckbox.checked = account.settings?.autoRotate !== false;
                const categorySelect = document.getElementById('ma-edit-category');
                const keywordsTextarea = document.getElementById('ma-edit-keywords');
                if (categorySelect)
                    categorySelect.value = account.settings?.category || '';
                if (keywordsTextarea) {
                    const keywordsArray = account.settings?.keywords || [];
                    keywordsTextarea.value = keywordsArray.join(', ');
                }
                const proxyHostInput = document.getElementById('ma-edit-proxy-host');
                const proxyPortInput = document.getElementById('ma-edit-proxy-port');
                const proxyUsernameInput = document.getElementById('ma-edit-proxy-username');
                const proxyPasswordInput = document.getElementById('ma-edit-proxy-password');
                if (proxyHostInput)
                    proxyHostInput.value = account.settings?.proxyHost || '';
                if (proxyPortInput)
                    proxyPortInput.value = account.settings?.proxyPort || '';
                if (proxyUsernameInput)
                    proxyUsernameInput.value = account.settings?.proxyUsername || '';
                if (proxyPasswordInput)
                    proxyPasswordInput.value = account.settings?.proxyPassword || '';
                const autoProxyBtn = document.getElementById('ma-auto-proxy-btn');
                if (autoProxyBtn) {
                    autoProxyBtn.onclick = async () => {
                        const nid = naverIdInput?.value?.trim() || account.naverId || account.blogId;
                        if (!nid) {
                            toastManager.warning('네이버 ID가 없어 프록시를 생성할 수 없습니다.');
                            return;
                        }
                        const result = await window.api.generateStickyProxy(nid);
                        if (result.success && result.proxy) {
                            if (proxyHostInput)
                                proxyHostInput.value = result.proxy.host;
                            if (proxyPortInput)
                                proxyPortInput.value = result.proxy.port;
                            if (proxyUsernameInput)
                                proxyUsernameInput.value = result.proxy.username;
                            if (proxyPasswordInput)
                                proxyPasswordInput.value = result.proxy.password;
                            toastManager.success(`✅ Sticky 프록시 자동 생성 완료! 하단 저장 버튼을 눌러주세요.`);
                        }
                        else {
                            toastManager.error(result.message || '프록시 생성 실패');
                        }
                    };
                }
            }
            if (naverIdInput) {
                naverIdInput.readOnly = true;
                naverIdInput.style.background = 'var(--bg-tertiary)';
                naverIdInput.style.color = 'var(--text-muted)';
            }
        }
        else {
            if (titleEl)
                titleEl.textContent = '새 계정 추가';
            if (deleteAccountBtn)
                deleteAccountBtn.style.display = 'none';
            if (accountIdInput)
                accountIdInput.value = '';
            if (nameInput)
                nameInput.value = '';
            if (blogIdInput)
                blogIdInput.value = '';
            if (naverIdInput) {
                naverIdInput.value = '';
                naverIdInput.readOnly = false;
                naverIdInput.style.background = 'var(--bg-secondary)';
                naverIdInput.style.color = 'var(--text-strong)';
            }
            if (naverPwInput)
                naverPwInput.value = '';
            if (isJabBlogCheckbox)
                isJabBlogCheckbox.checked = false;
            if (dailyLimitInput)
                dailyLimitInput.value = '5';
            if (imageSourceSelect)
                imageSourceSelect.value = 'gemini';
            if (toneSelect)
                toneSelect.value = 'friendly';
            if (publishModeSelect)
                publishModeSelect.value = 'publish';
            if (autoRotateCheckbox)
                autoRotateCheckbox.checked = true;
            const categorySelect = document.getElementById('ma-edit-category');
            const keywordsTextarea = document.getElementById('ma-edit-keywords');
            if (categorySelect)
                categorySelect.value = '';
            if (keywordsTextarea)
                keywordsTextarea.value = '';
            const proxyHostInput = document.getElementById('ma-edit-proxy-host');
            const proxyPortInput = document.getElementById('ma-edit-proxy-port');
            const proxyUsernameInput = document.getElementById('ma-edit-proxy-username');
            const proxyPasswordInput = document.getElementById('ma-edit-proxy-password');
            if (proxyHostInput)
                proxyHostInput.value = '';
            if (proxyPortInput)
                proxyPortInput.value = '';
            if (proxyUsernameInput)
                proxyUsernameInput.value = '';
            if (proxyPasswordInput)
                proxyPasswordInput.value = '';
            const autoProxyBtn = document.getElementById('ma-auto-proxy-btn');
            if (autoProxyBtn) {
                autoProxyBtn.onclick = async () => {
                    const nid = naverIdInput?.value?.trim();
                    if (!nid) {
                        toastManager.warning('네이버 ID를 먼저 입력해주세요.');
                        return;
                    }
                    const result = await window.api.generateStickyProxy(nid);
                    if (result.success && result.proxy) {
                        if (proxyHostInput)
                            proxyHostInput.value = result.proxy.host;
                        if (proxyPortInput)
                            proxyPortInput.value = result.proxy.port;
                        if (proxyUsernameInput)
                            proxyUsernameInput.value = result.proxy.username;
                        if (proxyPasswordInput)
                            proxyPasswordInput.value = result.proxy.password;
                        toastManager.success(`✅ Sticky 프록시 자동 생성 완료! 하단 저장 버튼을 눌러주세요.`);
                    }
                    else {
                        toastManager.error(result.message || '프록시 생성 실패');
                    }
                };
            }
        }
        accountEditModal.style.display = 'flex';
        accountEditModal.setAttribute('aria-hidden', 'false');
    }
    window.openAccountEditModal = openAccountEditModal;
    window.renderMultiAccountList = renderMultiAccountList;
    window.refreshAllAccountLists = async () => {
        console.log('[Account] 모든 계정 목록 새로고침');
        try {
            await renderMultiAccountList();
        }
        catch (e) {
            console.error('[Account] renderMultiAccountList 오류:', e);
        }
        if (typeof window.renderInlineAccountList === 'function') {
            try {
                await window.renderInlineAccountList();
            }
            catch (e) {
                console.error('[Account] renderInlineAccountList 오류:', e);
            }
        }
        if (typeof window.loadMainAccountList === 'function') {
            try {
                await window.loadMainAccountList();
            }
            catch (e) {
                console.error('[Account] loadMainAccountList 오류:', e);
            }
        }
    };
    document.getElementById('ma-add-account-btn')?.addEventListener('click', () => {
        openAccountEditModal();
    });
    document.getElementById('ma-save-account-btn')?.addEventListener('click', async () => {
        const accountIdInput = document.getElementById('ma-edit-account-id');
        const nameInput = document.getElementById('ma-edit-name');
        const blogIdInput = document.getElementById('ma-edit-blog-id');
        const naverIdInput = document.getElementById('ma-edit-naver-id');
        const naverPwInput = document.getElementById('ma-edit-naver-pw');
        const isJabBlogCheckbox = document.getElementById('ma-edit-is-jabblog');
        const dailyLimitInput = document.getElementById('ma-edit-daily-limit');
        const imageSourceSelect = document.getElementById('ma-edit-image-source');
        const toneSelect = document.getElementById('ma-edit-tone-style');
        const publishModeSelect = document.getElementById('ma-edit-publish-mode');
        const autoRotateCheckbox = document.getElementById('ma-edit-auto-rotate');
        const accountId = accountIdInput?.value;
        const name = nameInput?.value.trim();
        const blogId = blogIdInput?.value.trim() || name;
        const naverId = naverIdInput?.value.trim();
        const naverPw = naverPwInput?.value;
        if (!name || !naverId || !naverPw) {
            toastManager.warning('필수 항목(별명, 네이버 ID, 비밀번호)을 모두 입력해주세요.');
            return;
        }
        const settings = {
            dailyLimit: parseInt(dailyLimitInput?.value || '5'),
            imageSource: imageSourceSelect?.value || getFullAutoImageSource(),
            toneStyle: toneSelect?.value || 'friendly',
            publishMode: publishModeSelect?.value || 'publish',
            autoRotate: autoRotateCheckbox?.checked !== false,
            isJabBlog: isJabBlogCheckbox?.checked === true,
            proxyHost: document.getElementById('ma-edit-proxy-host')?.value?.trim() || undefined,
            proxyPort: document.getElementById('ma-edit-proxy-port')?.value?.trim() || undefined,
            proxyUsername: document.getElementById('ma-edit-proxy-username')?.value?.trim() || undefined,
            proxyPassword: document.getElementById('ma-edit-proxy-password')?.value?.trim() || undefined,
        };
        try {
            if (accountId) {
                await window.api.updateBlogAccount(accountId, { name, blogId });
                await window.api.updateAccountCredentials(accountId, naverId, naverPw);
                await window.api.updateAccountSettings(accountId, settings);
                toastManager.success('계정 설정이 업데이트되었습니다.');
            }
            else {
                const result = await window.api.addBlogAccount(name, blogId, naverId, naverPw, settings);
                if (result.success) {
                    toastManager.success('계정이 추가되었습니다.');
                }
                else {
                    toastManager.error(result.message || '계정 추가 실패');
                    return;
                }
            }
            if (accountEditModal) {
                accountEditModal.style.display = 'none';
                accountEditModal.setAttribute('aria-hidden', 'true');
            }
            if (typeof window.refreshAllAccountLists === 'function') {
                await window.refreshAllAccountLists();
            }
            else {
                await renderMultiAccountList();
            }
        }
        catch (error) {
            toastManager.error('저장 중 오류가 발생했습니다.');
        }
    });
    document.getElementById('ma-delete-account-btn')?.addEventListener('click', async () => {
        const accountIdInput = document.getElementById('ma-edit-account-id');
        const accountId = accountIdInput?.value;
        if (!accountId) {
            toastManager.warning('삭제할 계정이 선택되지 않았습니다.');
            return;
        }
        if (!confirm('정말로 이 계정을 삭제하시겠습니까?\n\n삭제된 계정은 복구할 수 없습니다.')) {
            return;
        }
        try {
            const result = await window.api.removeBlogAccount(accountId);
            if (result.success) {
                toastManager.success('계정이 삭제되었습니다.');
                if (accountEditModal) {
                    accountEditModal.style.display = 'none';
                    accountEditModal.setAttribute('aria-hidden', 'true');
                }
                if (typeof window.refreshAllAccountLists === 'function') {
                    await window.refreshAllAccountLists();
                }
                else {
                    await renderMultiAccountList();
                }
            }
            else {
                toastManager.error(result.message || '계정 삭제 실패');
            }
        }
        catch (error) {
            console.error('[MultiAccount] 계정 삭제 오류:', error);
            toastManager.error('계정 삭제 중 오류가 발생했습니다.');
        }
    });
    const formatWaitTime = (seconds) => {
        if (seconds < 60)
            return `${seconds}초`;
        if (seconds < 3600) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return secs > 0 ? `${mins}분 ${secs}초` : `${mins}분`;
        }
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
    };
    function toFileUrlSafeMA(p) {
        const raw = String(p || '').trim();
        if (!raw)
            return '';
        if (/^(https?:\/\/|data:|blob:|file:\/\/)/i.test(raw))
            return raw;
        if (typeof window?.toFileUrlMaybe === 'function') {
            return window.toFileUrlMaybe(raw);
        }
        return `file:///${raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
    }
    function updateMACurrentImages(images) {
        const section = document.getElementById('ma-current-images-section');
        const grid = document.getElementById('ma-images-grid');
        const countEl = document.getElementById('ma-images-count');
        if (!section || !grid)
            return;
        const valid = (images || []).filter((img) => img && (img.url || img.filePath));
        if (valid.length === 0) {
            section.style.display = 'none';
            grid.innerHTML = '';
            return;
        }
        section.style.display = 'block';
        if (countEl)
            countEl.textContent = `(${valid.length}장)`;
        grid.innerHTML = '';
        valid.forEach((img, idx) => {
            const src = toFileUrlSafeMA(img.url || img.filePath || '');
            if (!src)
                return;
            const item = document.createElement('div');
            item.style.cssText = 'position: relative; aspect-ratio: 1; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3);';
            const headingAttr = String(img.heading || '').replace(/"/g, '&quot;');
            item.innerHTML = `
        <img src="${src}" alt="${headingAttr}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;" />
        <div style="position: absolute; top: 0; right: 0; padding: 1px 4px; background: rgba(0,0,0,0.6); font-size: 0.55rem; color: white; border-bottom-left-radius: 4px;">${idx + 1}</div>
      `;
            grid.appendChild(item);
        });
    }
    function clearMACurrentImages() {
        const section = document.getElementById('ma-current-images-section');
        const grid = document.getElementById('ma-images-grid');
        const countEl = document.getElementById('ma-images-count');
        if (section)
            section.style.display = 'none';
        if (grid)
            grid.innerHTML = '';
        if (countEl)
            countEl.textContent = '';
    }
    function showMAProgressModal() {
        const modal = document.getElementById('ma-publish-progress-modal');
        if (!modal)
            return;
        if (modal.parentElement !== document.body) {
            console.log('[MultiAccountPublish] 진행 모달을 body로 이동합니다.');
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        hideMAFloatingBar();
        const stopBtn = document.getElementById('ma-progress-stop-btn');
        if (stopBtn)
            stopBtn.style.display = 'flex';
        const closeBtn = document.getElementById('ma-progress-close-btn');
        if (closeBtn)
            closeBtn.style.display = 'none';
        const completeBtn = document.getElementById('ma-progress-complete-btn');
        if (completeBtn)
            completeBtn.style.display = 'none';
        const minimizeBtn = document.getElementById('ma-progress-minimize-btn');
        if (minimizeBtn && !minimizeBtn.hasAttribute('data-listener-added')) {
            minimizeBtn.setAttribute('data-listener-added', 'true');
            minimizeBtn.addEventListener('click', () => {
                hideMAProgressModal();
            });
        }
    }
    function hideMAProgressModal() {
        const modal = document.getElementById('ma-publish-progress-modal');
        if (!modal)
            return;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        if (isPublishing) {
            createOrShowMAFloatingBar();
            toastManager.info('📊 하단 바에서 진행 상황을 확인할 수 있습니다.', 3000);
        }
    }
    function createOrShowMAFloatingBar() {
        let bar = document.getElementById('ma-floating-progress-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ma-floating-progress-bar';
            bar.style.cssText = `
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
        background: linear-gradient(135deg, #1e293b, #0f172a);
        border-top: 2px solid rgba(59, 130, 246, 0.5);
        padding: 10px 20px; cursor: pointer;
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
        transition: opacity 0.3s, transform 0.3s;
      `;
            bar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; max-width: 800px; margin: 0 auto;">
          <div style="font-size: 1.2rem; animation: spin 1s linear infinite;">🔄</div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span id="ma-float-text" style="color: #e2e8f0; font-size: 0.85rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">다중계정 발행 중...</span>
              <span id="ma-float-percent" style="color: #60a5fa; font-weight: 700; font-size: 0.9rem; margin-left: 8px; flex-shrink: 0;">0%</span>
            </div>
            <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
              <div id="ma-float-bar-fill" style="height: 100%; width: 0%; background: linear-gradient(90deg, #3b82f6, #60a5fa); border-radius: 2px; transition: width 0.3s ease;"></div>
            </div>
          </div>
          <div style="color: #94a3b8; font-size: 0.7rem; flex-shrink: 0; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">👆 상세보기</div>
        </div>
      `;
            bar.addEventListener('click', () => {
                hideMAFloatingBar();
                showMAProgressModal();
            });
            document.body.appendChild(bar);
        }
        bar.style.display = 'block';
        updateMAFloatingBar(currentProgressPercent, currentProgressAccountName, currentProgressStep);
    }
    function updateMAFloatingBar(percent, accountName, step) {
        const bar = document.getElementById('ma-floating-progress-bar');
        if (!bar || bar.style.display === 'none')
            return;
        const textEl = document.getElementById('ma-float-text');
        const percentEl = document.getElementById('ma-float-percent');
        const barFill = document.getElementById('ma-float-bar-fill');
        const p = Math.max(0, Math.min(100, percent));
        if (textEl && (accountName || step)) {
            textEl.textContent = accountName ? `${accountName} - ${step || '진행 중...'}` : (step || '다중계정 발행 중...');
        }
        if (percentEl)
            percentEl.textContent = `${p.toFixed(0)}%`;
        if (barFill)
            barFill.style.width = `${p.toFixed(0)}%`;
    }
    function hideMAFloatingBar() {
        const bar = document.getElementById('ma-floating-progress-bar');
        if (bar) {
            bar.style.display = 'none';
        }
    }
    function destroyMAFloatingBar() {
        const bar = document.getElementById('ma-floating-progress-bar');
        if (bar)
            bar.remove();
    }
    let currentProgressPercent = 0;
    let currentProgressAccountName = '';
    let currentProgressStep = '';
    const progressAnimationFrame = null;
    function updateMAProgress(current, total, accountName, step, subStep, totalSubSteps) {
        const totalSafe = Math.max(1, Number(total || 0));
        const currentSafe = Math.max(0, Number(current || 0));
        const sub = typeof subStep === 'number' ? subStep : 0;
        const subTotal = typeof totalSubSteps === 'number' && totalSubSteps > 0 ? totalSubSteps : 0;
        const subRatio = subTotal > 0 ? Math.max(0, Math.min(1, sub / subTotal)) : 0;
        const rawPercent = ((currentSafe + subRatio) / totalSafe) * 100;
        const percent = Math.max(0, Math.min(100, rawPercent));
        animateProgress(percent);
        const currentEl = document.getElementById('ma-progress-current');
        if (currentEl)
            currentEl.textContent = `${Math.min(currentSafe, totalSafe)} / ${totalSafe} 계정`;
        const taskAccount = document.getElementById('ma-task-account');
        if (taskAccount)
            taskAccount.textContent = accountName || '진행 중...';
        const taskStep = document.getElementById('ma-task-step');
        if (taskStep)
            taskStep.textContent = step || '';
        currentProgressAccountName = accountName || '';
        currentProgressStep = step || '';
        updateMAFloatingBar(percent, accountName, step);
    }
    function animateProgress(targetPercent) {
        const p = Math.max(0, Math.min(100, Number(targetPercent || 0)));
        currentProgressPercent = p;
        const bar = document.getElementById('ma-progress-bar');
        if (bar)
            bar.style.width = `${p.toFixed(0)}%`;
        const percentEl = document.getElementById('ma-progress-percent');
        if (percentEl)
            percentEl.textContent = `${p.toFixed(0)}%`;
    }
    function updateMAStep(stepId, status) {
        const el = document.getElementById(stepId);
        if (!el)
            return;
        el.classList.remove('active', 'completed', 'error', 'pending');
        el.classList.add(status);
    }
    function resetMASteps() {
        ['ma-step-content', 'ma-step-image', 'ma-step-login', 'ma-step-publish'].forEach((id) => {
            updateMAStep(id, 'pending');
        });
    }
    function addMALog(message, type = 'info') {
        const line = message;
        try {
            appendLog(`[MA] ${line}`);
        }
        catch {
        }
        const liveLog = document.getElementById('ma-live-log');
        if (!liveLog) {
            console.log(`[FullAuto] ${line}`);
            return;
        }
        const ts = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let logColor = '#94a3b8';
        if (type === 'success' || message.includes('✅') || message.includes('완료'))
            logColor = '#10b981';
        else if (type === 'error' || message.includes('❌') || message.includes('실패'))
            logColor = '#ef4444';
        else if (type === 'warning' || message.includes('⚠️'))
            logColor = '#f59e0b';
        else if (message.includes('🤖') || message.includes('🎨'))
            logColor = '#a78bfa';
        const item = document.createElement('div');
        item.style.cssText = `line-height: 1.5; padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,0.03);`;
        const safeMsg = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        item.innerHTML = `<span style="color: rgba(255,255,255,0.3); font-size: 0.7rem; margin-right: 5px;">[${ts}]</span><span style="color: ${logColor}">${safeMsg}</span>`;
        liveLog.appendChild(item);
        while (liveLog.childElementCount > 150) {
            liveLog.removeChild(liveLog.firstElementChild);
        }
        requestAnimationFrame(() => { liveLog.scrollTop = liveLog.scrollHeight; });
    }
    function addProgressItem(message, type) {
        const progressList = document.getElementById('ma-progress-list');
        if (!progressList) {
            addMALog(message, type);
            return;
        }
        const item = document.createElement('div');
        item.style.cssText = 'padding: 6px 10px; border-radius: 6px; margin-bottom: 4px; font-size: 0.85rem;';
        const colors = {
            info: 'rgba(96, 165, 250, 0.15)',
            success: 'rgba(16, 185, 129, 0.15)',
            error: 'rgba(239, 68, 68, 0.15)',
            warning: 'rgba(245, 158, 11, 0.15)',
        };
        const textColors = {
            info: '#94a3b8',
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
        };
        item.style.background = colors[type] || colors.info;
        item.style.color = textColors[type] || textColors.info;
        const safeMsg = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        item.innerHTML = safeMsg;
        progressList.appendChild(item);
        while (progressList.childElementCount > 100) {
            progressList.removeChild(progressList.firstElementChild);
        }
        requestAnimationFrame(() => { progressList.scrollTop = progressList.scrollHeight; });
        addMALog(message, type);
    }
    function showMAResult(success, fail) {
        addMALog(`✅ 발행 완료 - 성공: ${success}건, 실패: ${fail}건`, 'success');
        hideMAFloatingBar();
        const resultSummary = document.getElementById('ma-result-summary');
        if (resultSummary)
            resultSummary.style.display = 'block';
        const sEl = document.getElementById('ma-result-success');
        const fEl = document.getElementById('ma-result-fail');
        const tEl = document.getElementById('ma-result-total');
        if (sEl)
            sEl.textContent = String(success);
        if (fEl)
            fEl.textContent = String(fail);
        if (tEl)
            tEl.textContent = String(Math.max(0, Number(success || 0) + Number(fail || 0)));
        const stopBtn = document.getElementById('ma-progress-stop-btn');
        const closeBtn = document.getElementById('ma-progress-close-btn');
        const completeBtn = document.getElementById('ma-progress-complete-btn');
        if (stopBtn)
            stopBtn.style.display = 'none';
        if (closeBtn)
            closeBtn.style.display = 'none';
        if (completeBtn)
            completeBtn.style.display = 'flex';
        if (completeBtn && !completeBtn.hasAttribute('data-listener-added')) {
            completeBtn.setAttribute('data-listener-added', 'true');
            completeBtn.addEventListener('click', () => {
                hideMAProgressModal();
            });
        }
        const taskSpinner = document.getElementById('ma-task-spinner');
        if (taskSpinner)
            taskSpinner.style.animation = 'none';
        const progressIcon = document.getElementById('ma-progress-icon');
        if (progressIcon) {
            progressIcon.textContent = '✅';
            progressIcon.style.animation = 'none';
        }
        const badge = document.getElementById('ma-task-status-badge');
        if (badge) {
            badge.textContent = '완료';
            badge.style.background = 'rgba(16, 185, 129, 0.25)';
            badge.style.color = '#10b981';
        }
    }
    document.getElementById('ma-start-publish-btn')?.addEventListener('click', async () => {
        const unlocked = await window.checkFeatureLockAndShow?.('multi-account-fullauto');
        if (unlocked === false)
            return;
        if (window.currentEditingQueueId) {
            toastManager.warning('📢 현재 내용을 수정 중입니다. 먼저 "수정 완료(대기열에 추가)" 버튼을 눌러 저장해주세요!');
            return;
        }
        if (publishQueue.length === 0) {
            toastManager.warning('발행 대기열이 비어있습니다. 계정에서 "⚡ 풀오토 세팅"을 클릭하여 대기열에 추가하세요.');
            return;
        }
        if (isPublishing) {
            toastManager.warning('이미 발행이 진행 중입니다.');
            return;
        }
        const intervalValue = parseInt(document.getElementById('ma-interval-value')?.value || '30');
        const intervalUnit = document.getElementById('ma-interval-unit')?.value || 'seconds';
        let intervalSeconds = intervalValue;
        if (intervalUnit === 'minutes') {
            intervalSeconds = intervalValue * 60;
        }
        else if (intervalUnit === 'hours') {
            intervalSeconds = intervalValue * 3600;
        }
        intervalSeconds = Math.min(intervalSeconds, 86400);
        isPublishing = true;
        stopRequested = false;
        window.stopFullAutoPublish = false;
        const startBtn = document.getElementById('ma-start-publish-btn');
        const startBtnOriginalHtml = startBtn?.innerHTML || '';
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<span style="font-size: 1.25rem;">⏳</span> 발행 중...';
        }
        const progressSection = document.getElementById('ma-progress-section');
        const progressList = document.getElementById('ma-progress-list');
        if (progressSection)
            progressSection.style.display = 'none';
        if (progressList)
            progressList.innerHTML = '';
        showMAProgressModal();
        resetMASteps();
        const liveLog = document.getElementById('ma-live-log');
        if (liveLog)
            liveLog.innerHTML = '';
        const resultSummary = document.getElementById('ma-result-summary');
        const stopBtn = document.getElementById('ma-progress-stop-btn');
        const closeBtn = document.getElementById('ma-progress-close-btn');
        const taskSpinner = document.getElementById('ma-task-spinner');
        const progressIcon = document.getElementById('ma-progress-icon');
        const progressTitle = document.getElementById('ma-progress-title');
        if (resultSummary)
            resultSummary.style.display = 'none';
        if (stopBtn)
            stopBtn.style.display = 'flex';
        if (closeBtn)
            closeBtn.style.display = 'none';
        if (taskSpinner)
            taskSpinner.style.animation = 'spin 1s linear infinite';
        if (progressIcon) {
            progressIcon.textContent = '🚀';
            progressIcon.style.animation = 'bounce 1s infinite';
        }
        if (progressTitle)
            progressTitle.textContent = '풀오토 다중계정 발행';
        let totalSuccess = 0;
        let totalFail = 0;
        const queueSnapshot = [...publishQueue];
        const totalItems = queueSnapshot.length;
        const primaryImageSource = String(queueSnapshot.find((item) => !!item.imageSource)?.imageSource
            || getFullAutoImageSource?.()
            || UnifiedDOMCache?.getImageSource?.()
            || '').trim();
        const intervalPolicy = getSafeMultiAccountInterval(intervalSeconds, totalItems, primaryImageSource);
        intervalSeconds = intervalPolicy.safe;
        const waitInterruptible = async (seconds, currentIdx, totalCount) => {
            const ms = Math.max(0, Math.floor(seconds * 1000));
            const start = Date.now();
            while (Date.now() - start < ms) {
                if (stopRequested || window.stopFullAutoPublish)
                    return false;
                const remaining = Math.max(0, Math.ceil((ms - (Date.now() - start)) / 1000));
                if (typeof currentIdx === 'number' && typeof totalCount === 'number') {
                    updateMAProgress(currentIdx + 1, totalCount, '대기 중...', `⏳ ${formatWaitTime(remaining)} 후 다음 발행`);
                }
                await new Promise((r) => setTimeout(r, 500));
            }
            return true;
        };
        const estimatedTime = totalItems * (intervalSeconds + 60);
        const progressTime = document.getElementById('ma-progress-time');
        if (progressTime)
            progressTime.textContent = `예상 시간: ${formatWaitTime(estimatedTime)}`;
        addProgressItem(`🚀 대기열 ${totalItems}개 항목 발행 시작 (간격: ${formatWaitTime(intervalSeconds)})`, 'info');
        addMALog(`🚀 대기열 ${totalItems}개 항목 발행 시작`, 'info');
        if (intervalPolicy.adjusted) {
            addMALog(`🛡️ 안전 발행 간격 자동 조정: ${formatWaitTime(intervalPolicy.requested)} → ${formatWaitTime(intervalPolicy.safe)} (${intervalPolicy.reason})`, 'warning');
            addProgressItem(`🛡️ 안전 간격 적용: ${formatWaitTime(intervalPolicy.safe)}`, 'warning');
        }
        updateMAProgress(0, totalItems, '준비 중...', '발행 시작');
        {
            const scheduleItems = queueSnapshot.filter(item => item.publishMode === 'schedule');
            if (scheduleItems.length > 1) {
                const allHaveSchedule = scheduleItems.every(item => item.scheduleDate && item.scheduleTime);
                const autoItems = scheduleItems.filter(item => !item.scheduleUserModified);
                if (allHaveSchedule && autoItems.length === 0) {
                    addMALog(`📅 모든 ${scheduleItems.length}개 예약 항목이 이미 설정됨 → 재분배 건너뜀`, 'info');
                    scheduleItems.forEach((item, idx) => {
                        addMALog(`  📅 [${idx + 1}/${scheduleItems.length}] ${item.accountName || '계정'}: ${item.scheduleDate} ${item.scheduleTime} (확정)`, 'info');
                    });
                }
                else {
                    const firstItem = scheduleItems.find(item => !item.scheduleUserModified) || scheduleItems[0];
                    window.distributeWithProtection(scheduleItems, {
                        baseDate: firstItem.scheduleDate || new Date().toISOString().split('T')[0],
                        baseTime: firstItem.scheduleTime || '09:00',
                        intervalMinutes: firstItem.scheduleInterval || 30,
                    }, (msg, level) => addMALog(msg, level));
                    scheduleItems.forEach((item, idx) => {
                        addMALog(`  📅 [${idx + 1}/${scheduleItems.length}] ${item.accountName || '계정'}: ${item.scheduleDate} ${item.scheduleTime}${item.scheduleUserModified ? ' (수동)' : ' (자동)'}`, 'info');
                    });
                }
            }
            const incompleteScheduleItems = queueSnapshot.filter(item => item.publishMode === 'schedule' && (!item.scheduleDate || !item.scheduleTime));
            for (const item of incompleteScheduleItems) {
                const autoTime = new Date(Date.now() + 30 * 60 * 1000);
                const ceilMin = Math.ceil(autoTime.getMinutes() / 10) * 10;
                autoTime.setMinutes(ceilMin % 60, 0, 0);
                if (ceilMin >= 60)
                    autoTime.setHours(autoTime.getHours() + 1);
                if (!item.scheduleDate) {
                    item.scheduleDate = `${autoTime.getFullYear()}-${String(autoTime.getMonth() + 1).padStart(2, '0')}-${String(autoTime.getDate()).padStart(2, '0')}`;
                }
                if (!item.scheduleTime) {
                    item.scheduleTime = `${String(autoTime.getHours()).padStart(2, '0')}:${String(autoTime.getMinutes()).padStart(2, '0')}`;
                }
                addMALog(`⚠️ [BUG-4 FIX v2] 예약 정보 자동 보정: ${item.scheduleDate} ${item.scheduleTime}`, 'warning');
                console.log(`[BUG-4 FIX v2] 예약 정보 자동 보정: ${item.scheduleDate} ${item.scheduleTime}`);
            }
        }
        try {
            for (let i = 0; i < queueSnapshot.length && !stopRequested && !window.stopFullAutoPublish; i++) {
                const queueItem = queueSnapshot[i];
                // [Phase 7.1-c] Per-item snapshot — settings changed mid-run
                // apply from the NEXT account/post (design §2.2).
                const itemPipelineCfg = resolvePipelineConfig('multi-account');
                let generatedPostId = null;
                const TOTAL_SUB_STEPS = 4;
                resetMASteps();
                currentProgressPercent = (i / totalItems) * 100;
                updateMAProgress(i, totalItems, queueItem.accountName, '🚀 처리 시작...', 0, TOTAL_SUB_STEPS);
                addMALog(`📋 [${i + 1}/${totalItems}] ${queueItem.accountName} 처리 시작`, 'info');
                addProgressItem(`📋 [${i + 1}/${totalItems}] ${queueItem.accountName} 처리 시작...`, 'info');
                try {
                    ImageManager.clearAll();
                    if (typeof syncGlobalImagesFromImageManager === 'function') {
                        syncGlobalImagesFromImageManager();
                    }
                    window.currentStructuredContent = null;
                    window.generatedImages = [];
                    clearMACurrentImages();
                }
                catch (clearErr) {
                    console.error('[FullAuto] 데이터 초기화 실패:', clearErr);
                }
                updateMAStep('ma-step-content', 'active');
                updateMAProgress(i, totalItems, queueItem.accountName, '📝 AI 콘텐츠 생성 중...', 0.5, TOTAL_SUB_STEPS);
                addMALog('📝 AI 콘텐츠 생성 중...', 'info');
                addProgressItem(`   📝 AI 콘텐츠 생성 중...`, 'info');
                let structuredContent = null;
                let generatedImages = [];
                if (queueItem.sourceKeyword) {
                    setKeywordTitleOptionsFromItem(queueItem.sourceKeyword, queueItem.keywordAsTitle, queueItem.keywordTitlePrefix);
                }
                try {
                    const contentPayload = {
                        assembly: {
                            generator: UnifiedDOMCache.getGenerator(),
                            toneStyle: queueItem.toneStyle,
                            targetAge: 'all',
                        }
                    };
                    try {
                        const articleType = String(queueItem.category || '').trim() || 'general';
                        contentPayload.assembly.articleType = articleType;
                    }
                    catch (e) {
                        console.warn('[multiAccountManager] catch ignored:', e);
                    }
                    try {
                        const cm = (queueItem.contentMode || 'seo');
                        contentPayload.assembly.contentMode = cm;
                    }
                    catch (e) {
                        console.warn('[multiAccountManager] catch ignored:', e);
                    }
                    if (queueItem.contentMode === 'custom' && queueItem.customPrompt) {
                        contentPayload.assembly.customPrompt = queueItem.customPrompt;
                        console.log(`[multiAccountManager] ✏️ customPrompt 전달 (${queueItem.customPrompt.length}자)`);
                    }
                    if (queueItem.contentMode === 'business' && queueItem.businessInfo) {
                        contentPayload.assembly.businessInfo = queueItem.businessInfo;
                        console.log(`[multiAccountManager] 🏢 businessInfo 전달: ${queueItem.businessInfo.name || 'unknown'}`);
                    }
                    const keywordList = queueItem.sourceKeyword
                        ? queueItem.sourceKeyword.split(',').map(k => k.trim()).filter(Boolean)
                        : [];
                    contentPayload.assembly.keywords = keywordList;
                    if (queueItem.sourceUrl) {
                        contentPayload.assembly.rssUrl = [queueItem.sourceUrl];
                    }
                    if (queueItem.sourceKeyword) {
                        contentPayload.assembly.draftText = queueItem.sourceKeyword;
                    }
                    else if (queueItem.sourceUrl) {
                        contentPayload.assembly.draftText = queueItem.sourceUrl;
                    }
                    console.log('[FullAuto] 콘텐츠 생성 요청:', contentPayload);
                    const apiClient = EnhancedApiClient.getInstance();
                    const apiResponse = await apiClient.call('generateStructuredContent', [contentPayload], {
                        retryCount: 2,
                        retryDelay: 3000,
                        timeout: 900000
                    });
                    const contentResult = apiResponse.data || { success: false, message: apiResponse.error };
                    console.log('[FullAuto] 콘텐츠 생성 결과:', contentResult);
                    if (isPaywallPayload(contentResult)) {
                        activatePaywall(contentResult);
                        throw new Error(contentResult.message || '콘텐츠 생성 실패');
                    }
                    if (!contentResult.success || !contentResult.content) {
                        throw new Error(contentResult.message || '콘텐츠 생성 실패');
                    }
                    structuredContent = contentResult.content;
                    console.log('[FullAuto] 구조화된 콘텐츠:', structuredContent);
                    if (queueItem.urlAutoCollect && queueItem.sourceUrl) {
                        try {
                            const runFn = window.runAutoImageSearch;
                            const ImageManager = window.ImageManager;
                            const syncFn = window.syncGlobalImagesFromImageManager || (() => { });
                            if (typeof runFn === 'function') {
                                await runFn(structuredContent, queueItem.sourceKeyword || structuredContent?.selectedTitle || '', (msg) => addMALog(msg, 'info'), ImageManager, syncFn, {
                                    sourceUrl: queueItem.sourceUrl,
                                    fillGapWithAI: !!queueItem.fillGapWithAI,
                                });
                                addMALog(`🔗 [다계정] URL 이미지 자동 수집 완료`, 'success');
                            }
                            else {
                                addMALog(`⚠️ [다계정] runAutoImageSearch 미로드 — 스킵`, 'warning');
                            }
                        }
                        catch (e) {
                            addMALog(`⚠️ [다계정] URL 이미지 수집 실패 — 키워드 검색으로 폴백: ${e?.message?.slice(0, 60)}`, 'warning');
                        }
                    }
                    {
                        const _isAffiliateMode = queueItem.contentMode === 'affiliate';
                        const _disclosureCfg = itemPipelineCfg.disclosure;
                        const _ftcEnabled = _disclosureCfg.enabledSetting !== null ? _disclosureCfg.enabledSetting : _isAffiliateMode;
                        const _ftcText = _ftcEnabled
                            ? (_disclosureCfg.text || (_isAffiliateMode ? _disclosureCfg.defaultText : ''))
                            : '';
                        const _ftcSource = _disclosureCfg.enabledSetting !== null ? 'PipelineConfig' : (_isAffiliateMode ? 'mode-default-affiliate' : 'mode-default-other');
                        if (_ftcEnabled && _ftcText && structuredContent) {
                            structuredContent.ftcDisclosure = _ftcText;
                            addMALog(`⚖️ 공정위 문구 삽입됨 (${_ftcSource}): "${_ftcText.substring(0, 30)}..."`, 'info');
                        }
                        else {
                            console.log(`[FullAuto] ⏭️ 공정위 문구 비활성 (모드='${queueItem.contentMode || 'seo'}', 결정근거=${_ftcSource})`);
                        }
                    }
                    if (structuredContent.selectedTitle && /^https?:\/\//i.test(String(structuredContent.selectedTitle).trim())) {
                        addMALog(`⚠️ selectedTitle이 URL이므로 제거됨`, 'warning');
                        console.warn(`[FullAuto] ⚠️ selectedTitle이 URL이므로 빈 문자열로 대체: "${String(structuredContent.selectedTitle).substring(0, 60)}"`);
                        structuredContent.selectedTitle = '';
                    }
                    if (structuredContent.title && /^https?:\/\//i.test(String(structuredContent.title).trim())) {
                        console.warn(`[FullAuto] ⚠️ title이 URL입니다 (원본 소스 참조용 유지, selectedTitle 전파 차단): "${String(structuredContent.title).substring(0, 60)}"`);
                    }
                    const keywordTitleOpts = window._keywordTitleOptions;
                    if (keywordTitleOpts && structuredContent) {
                        if (keywordTitleOpts.useKeywordAsTitle) {
                            const originalTitle = structuredContent.selectedTitle;
                            const exactTitle = String(keywordTitleOpts.keyword || '').trim();
                            structuredContent.title = exactTitle;
                            structuredContent.selectedTitle = exactTitle;
                            structuredContent.keywordAsTitleLocked = true;
                            structuredContent.keywordAsTitleValue = exactTitle;
                            structuredContent.titleAlternatives = [exactTitle];
                            structuredContent.titleCandidates = [{ text: exactTitle, score: 100, reasoning: '사용자 지정 키워드 제목' }];
                            addMALog(`📌 제목 교체: "${(originalTitle || '').substring(0, 20)}..." → "${structuredContent.selectedTitle}"`, 'info');
                            console.log(`[FullAuto] 키워드→제목 교체: "${originalTitle}" → "${structuredContent.selectedTitle}"`);
                        }
                        else if (keywordTitleOpts.useKeywordTitlePrefix) {
                            const keyword = String(keywordTitleOpts.keyword || '').trim();
                            const currentTitle = String(structuredContent.selectedTitle || '').trim();
                            if (keyword && currentTitle && !currentTitle.startsWith(keyword)) {
                                const cleaned = cleanKeywordFromTitle(keyword, currentTitle);
                                const newTitle = cleaned ? `${keyword} ${cleaned}` : keyword;
                                structuredContent.selectedTitle = newTitle;
                                addMALog(`🔝 키워드 앞배치: "${currentTitle.substring(0, 20)}..." → "${newTitle.substring(0, 30)}..."`, 'info');
                                console.log(`[FullAuto] 키워드 앞배치: "${currentTitle}" → "${newTitle}"`);
                            }
                        }
                        window._keywordTitleOptions = null;
                    }
                    if (queueItem.contentMode === 'affiliate' && structuredContent.selectedTitle) {
                        const isUrl = (str) => /^https?:\/\//i.test(str.trim());
                        const rawTitle = String(structuredContent.title || '').trim();
                        const rawSelectedTitle = String(structuredContent.selectedTitle || '').trim();
                        const productName = (!rawTitle || isUrl(rawTitle))
                            ? (isUrl(rawSelectedTitle) ? '' : rawSelectedTitle)
                            : rawTitle;
                        if (productName && productName.length >= 3) {
                            try {
                                addMALog('🔍 SEO 100점 제목 생성 중... (자동완성 키워드 3개 이상 조합)', 'info');
                                const seoResult = await window.api.generateSeoTitle(productName);
                                if (seoResult.success && seoResult.title && seoResult.title !== productName) {
                                    const originalTitle = structuredContent.selectedTitle;
                                    structuredContent.selectedTitle = seoResult.title;
                                    console.log(`[SEO] 제목 교체: "${originalTitle}" → "${seoResult.title}"`);
                                    addMALog(`✨ SEO 제목 적용: "${seoResult.title.substring(0, 35)}"`, 'success');
                                    if (structuredContent.title && structuredContent.title === originalTitle) {
                                        structuredContent.title = seoResult.title;
                                    }
                                }
                            }
                            catch (seoErr) {
                                console.warn('[SEO] 제목 생성 실패 (원본 사용):', seoErr);
                            }
                        }
                    }
                    try {
                        window.currentStructuredContent = structuredContent;
                        await autoAnalyzeHeadings(structuredContent);
                    }
                    catch (uiErr) {
                        console.error('[FullAuto] UI 업데이트 실패:', uiErr);
                    }
                    updateMAStep('ma-step-content', 'completed');
                    addMALog(`✅ 콘텐츠 생성 완료: "${structuredContent.selectedTitle?.substring(0, 20)}..."`, 'success');
                    addProgressItem(`   ✅ 콘텐츠 생성 완료: "${structuredContent.selectedTitle?.substring(0, 25)}..."`, 'success');
                    updateMAStep('ma-step-image', 'active');
                    updateMAProgress(i, totalItems, queueItem.accountName, '🎨 이미지 수집 중...', 1, TOTAL_SUB_STEPS);
                    addMALog('🎨 이미지 수집 중...', 'info');
                    addProgressItem(`   🎨 이미지 수집 중...`, 'info');
                    const rawHeadingsMA = structuredContent.headings || [];
                    const headings = structuredContent.introduction
                        ? [{ title: structuredContent.selectedTitle || '🖼️ 썸네일', content: structuredContent.introduction, isThumbnail: true, isIntro: true }, ...rawHeadingsMA]
                        : rawHeadingsMA;
                    try {
                        const imageSource = queueItem.imageSource || getFullAutoImageSource();
                        const skipImages = queueItem.skipImages === true
                            || (window.isImageSkipEnabled?.() === true)
                            || imageSource === 'skip';
                        console.log('[FullAuto] 이미지 소스:', imageSource, ', 건너뛰기:', skipImages, `(queueItem=${queueItem.skipImages === true}, SSOT=${window.isImageSkipEnabled?.() === true}, source=skip=${imageSource === 'skip'})`);
                        if (!skipImages && queueItem.contentMode === 'affiliate' && queueItem.affiliateLink) {
                            addMALog('🛒 쇼핑커넥트 모드 - 제품 이미지 수집 중...', 'info');
                            addProgressItem(`   🛒 제휴 링크에서 제품 이미지 수집 중...`, 'info');
                            try {
                                const collectResult = await window.api.collectImagesFromShopping(queueItem.affiliateLink);
                                if (collectResult?.success && collectResult.images && collectResult.images.length > 0) {
                                    generatedImages = collectResult.images.map((imgUrl, idx) => ({
                                        url: imgUrl,
                                        filePath: imgUrl,
                                        heading: idx === 0 ? '대표 이미지' : `제품 이미지 ${idx + 1}`,
                                        provider: 'collected'
                                    }));
                                    if (structuredContent) {
                                        if (typeof saveCollectedShoppingImagesToLocal === 'function') {
                                            const localSaveResult = await saveCollectedShoppingImagesToLocal(generatedImages, collectResult.productInfo?.name || structuredContent.selectedTitle || 'shopping-connect-images', { headingPrefix: '상품 이미지' });
                                            if (localSaveResult.images.length > 0) {
                                                generatedImages = localSaveResult.images;
                                            }
                                            if (localSaveResult.folderPath) {
                                                addMALog(`📁 수집 이미지 저장 위치: ${localSaveResult.folderPath}`, 'info');
                                            }
                                        }
                                        structuredContent.collectedImages = generatedImages;
                                        structuredContent.images = [...generatedImages];
                                        window.currentStructuredContent = structuredContent;
                                    }
                                    addMALog(`✅ 제품 이미지 ${collectResult.images.length}장 수집 완료`, 'success');
                                    addProgressItem(`   ✅ 제품 이미지 ${collectResult.images.length}장 수집 완료`, 'success');
                                    if (collectResult.productInfo) {
                                        addMALog(`📦 상품: ${collectResult.productInfo.name || '알 수 없음'}`, 'info');
                                    }
                                }
                                else {
                                    addMALog('⚠️ 제품 이미지 수집 실패 - AI 이미지로 대체합니다', 'warning');
                                }
                            }
                            catch (collectError) {
                                console.error('[FullAuto] 쇼핑커넥트 이미지 수집 오류:', collectError);
                                addMALog(`⚠️ 이미지 수집 오류: ${collectError.message?.substring(0, 50)} - AI 이미지로 대체`, 'warning');
                            }
                        }
                        const scSubImageModePre = itemPipelineCfg.shopping.subImageMode;
                        if (generatedImages.length > 0 && queueItem.contentMode === 'affiliate') {
                            const shouldMatchCollected = scSubImageModePre === 'collected';
                            if (shouldMatchCollected && (structuredContent.headings || []).length > 0) {
                                try {
                                    addMALog('🤖 수집 이미지를 소제목에 매칭 중...', 'info');
                                    const matchResult = await window.api.matchImages({
                                        headings: structuredContent.headings || [],
                                        collectedImages: generatedImages,
                                        scSubImageSource: scSubImageModePre
                                    });
                                    if (matchResult?.success && matchResult.assignments) {
                                        matchResult.assignments.forEach((assignment) => {
                                            const headIdx = assignment.headingIndex;
                                            const targetHeading = (structuredContent.headings || [])[headIdx];
                                            if (targetHeading) {
                                                targetHeading.referenceImagePath = assignment.imageUrl || assignment.imagePath;
                                            }
                                        });
                                        addMALog(`✅ ${matchResult.assignments.length}개 소제목에 이미지 배치 완료`, 'success');
                                    }
                                }
                                catch (matchErr) {
                                    console.error('[FullAuto] 이미지 매칭 실패:', matchErr);
                                }
                            }
                            if (queueItem.includeThumbnailText && generatedImages.length > 0) {
                                try {
                                    const thumbnailImg = generatedImages[0];
                                    const thumbnailPath = typeof thumbnailImg === 'string'
                                        ? thumbnailImg
                                        : (thumbnailImg?.filePath || thumbnailImg?.url || '');
                                    if (thumbnailPath) {
                                        addMALog('🎨 수집 이미지에 텍스트 오버레이 중...', 'info');
                                        const overlayResult = await window.api.createProductThumbnail(thumbnailPath, structuredContent.selectedTitle || '', { position: 'bottom', fontSize: 28, textColor: '#ffffff', opacity: 0.8 });
                                        if (overlayResult?.success && overlayResult.outputPath) {
                                            generatedImages[0] = {
                                                ...generatedImages[0],
                                                filePath: overlayResult.outputPath,
                                                url: overlayResult.outputPath,
                                                provider: 'collected-overlay'
                                            };
                                            addMALog('✅ 썸네일 텍스트 오버레이 완료', 'success');
                                        }
                                    }
                                }
                                catch (overlayErr) {
                                    console.error('[FullAuto] 썸네일 오버레이 실패:', overlayErr);
                                }
                            }
                        }
                        const alreadyHasImages = generatedImages.length > 0;
                        if (skipImages) {
                            addMALog('⏭️ 이미지 생성 건너뛰기 (사용자 설정)', 'info');
                            generatedImages = [];
                        }
                        else if (alreadyHasImages) {
                            console.log('[FullAuto] 쇼핑커넥트 수집 이미지 사용:', generatedImages.length);
                        }
                        else if (imageSource === 'local-folder') {
                            const loadLF = window.loadLocalFolderWithFallback;
                            if (!loadLF)
                                throw new Error('loadLocalFolderWithFallback 함수가 아직 로드되지 않았습니다');
                            const lfResult = await loadLF({
                                headings,
                                postTitle: structuredContent.selectedTitle,
                                onLog: (msg, level) => {
                                    addMALog(msg, level === 'success' ? 'success' : level === 'warning' ? 'warning' : 'info');
                                },
                                aiFallbackFn: generateImagesForAutomation,
                                aiOptions: {
                                    headingImageMode: itemPipelineCfg.image.headingImageMode,
                                    fallbackProvider: resolveImageProviderFallback(),
                                    stopCheck: () => stopRequested || window.stopFullAutoPublish,
                                    allowThumbnailText: itemPipelineCfg.image.thumbnailTextInclude,
                                    thumbnailTextInclude: itemPipelineCfg.image.thumbnailTextInclude,
                                },
                            });
                            generatedImages = lfResult.images;
                            if (lfResult.source === 'empty') {
                                addProgressItem('⚠️ 📂 이미지 없이 진행', 'warning');
                            }
                        }
                        else if (imageSource === 'naver') {
                            addMALog(`🔍 네이버 이미지 검색 시작 (키워드: ${structuredContent.keywords?.[0] || structuredContent.selectedTitle})`, 'info');
                            generatedImages = await generateImagesForAutomation(imageSource, headings, structuredContent.selectedTitle, {
                                headingImageMode: itemPipelineCfg.image.headingImageMode,
                                fallbackProvider: resolveImageProviderFallback(),
                                allowThumbnailText: itemPipelineCfg.image.thumbnailTextInclude || queueItem.includeThumbnailText,
                                thumbnailTextInclude: itemPipelineCfg.image.thumbnailTextInclude || queueItem.includeThumbnailText,
                                stopCheck: () => stopRequested || window.stopFullAutoPublish,
                                onProgress: (msg) => {
                                    addMALog(msg, 'info');
                                }
                            });
                        }
                        else {
                            const _maSourceNames = {
                                'pollinations': 'Pollinations', 'nano-banana-pro': '나노 바나나 프로',
                                'prodia': 'Prodia', 'stability': 'Stability AI',
                                'deepinfra': 'DeepInfra FLUX-2', 'deepinfra-flux': 'DeepInfra FLUX-2',
                                'falai': 'Fal.ai FLUX', 'naver-search': '네이버 검색', 'naver': '네이버 검색',
                            };
                            addMALog(`🎨 AI 이미지 생성 시작 (엔진: ${_maSourceNames[imageSource] || imageSource})`, 'info');
                            generatedImages = await generateImagesForAutomation(imageSource, headings, structuredContent.selectedTitle, {
                                headingImageMode: itemPipelineCfg.image.headingImageMode,
                                fallbackProvider: resolveImageProviderFallback(),
                                allowThumbnailText: itemPipelineCfg.image.thumbnailTextInclude || queueItem.includeThumbnailText,
                                thumbnailTextInclude: itemPipelineCfg.image.thumbnailTextInclude || queueItem.includeThumbnailText,
                                stopCheck: () => stopRequested || window.stopFullAutoPublish,
                                onProgress: (msg) => {
                                    addMALog(msg, 'info');
                                }
                            });
                        }
                        if (stopRequested || window.stopFullAutoPublish)
                            break;
                    }
                    catch (imgErr) {
                        console.error('[FullAuto] 이미지 생성 중 오류:', imgErr);
                        addMALog(`⚠️ 이미지 생성 중 오류 발생: ${imgErr.message}`, 'warning');
                    }
                    try {
                        if (Array.isArray(generatedImages) && generatedImages.length > 0) {
                            generatedImages.forEach((img) => {
                                const titleKey = img.heading || '기타';
                                const resolvedKey = ImageManager.resolveHeadingKey(titleKey);
                                const existing = ImageManager.getImages(resolvedKey) || [];
                                const isDuplicate = existing.some((e) => (e.url || e.filePath) === (img.url || img.filePath));
                                if (!isDuplicate) {
                                    ImageManager.imageMap.set(resolvedKey, [img, ...existing]);
                                }
                            });
                            if (typeof ImageManager.syncGeneratedImagesArray === 'function') {
                                ImageManager.syncGeneratedImagesArray();
                            }
                            if (typeof syncGlobalImagesFromImageManager === 'function') {
                                syncGlobalImagesFromImageManager();
                            }
                            const allImagesAfter = ImageManager.getAllImages();
                            displayGeneratedImages(allImagesAfter);
                            updateMACurrentImages(allImagesAfter);
                        }
                    }
                    catch (uiImgErr) {
                        console.error('[FullAuto] 이미지 UI 업데이트 실패:', uiImgErr);
                    }
                    try {
                        if (structuredContent) {
                            let saveNaverId = '';
                            try {
                                const saveCredResult = await window.api.getAccountCredentials(queueItem.accountId);
                                saveNaverId = (saveCredResult?.credentials?.naverId || '').trim().toLowerCase();
                            }
                            catch (credErr) {
                                console.warn('[FullAuto] naverId 조회 실패, 기본값 사용:', credErr);
                            }
                            generatedPostId = saveGeneratedPostFromData(structuredContent, generatedImages, {
                                toneStyle: queueItem.toneStyle,
                                ctaText: queueItem.ctaText || '',
                                ctaLink: queueItem.ctaUrl || '',
                                category: String(queueItem.category || '').trim() || undefined,
                                naverId: saveNaverId || undefined,
                            });
                            if (generatedPostId) {
                                addMALog(`💾 생성된 글 목록 저장됨 (ID: ${generatedPostId}, 계정: ${saveNaverId || '기본'})`, 'info');
                            }
                        }
                    }
                    catch (e) {
                        console.warn('[multiAccountManager] catch ignored:', e);
                    }
                    updateMAStep('ma-step-image', 'completed');
                    addMALog(`✅ ${generatedImages.length}개 이미지 준비 완료`, 'success');
                    addProgressItem(`   ✅ ${generatedImages.length}개 이미지 준비 완료`, 'success');
                }
                catch (contentError) {
                    updateMAStep('ma-step-content', 'error');
                    addMALog(`❌ 콘텐츠 생성 실패: ${contentError.message}`, 'error');
                    addProgressItem(`   ❌ 콘텐츠 생성 실패: ${contentError.message}`, 'error');
                    totalFail++;
                    if (isFatalApiError(contentError)) {
                        const userMsg = friendlyErrorMessage(contentError);
                        addMALog(`🚨 ${userMsg}`, 'error');
                        addProgressItem(`🚨 ${userMsg}`, 'error');
                        break;
                    }
                    continue;
                }
                try {
                    if (stopRequested || window.stopFullAutoPublish) {
                        break;
                    }
                    updateMAStep('ma-step-login', 'active');
                    updateMAProgress(i, totalItems, queueItem.accountName, '🔐 네이버 로그인 중...', 2, TOTAL_SUB_STEPS);
                    addMALog('🔐 네이버 로그인 중...', 'info');
                    console.log('[FullAuto] 계정 자격증명 요청:', queueItem.accountId);
                    const credResult = await window.api.getAccountCredentials(queueItem.accountId);
                    console.log('[FullAuto] 계정 자격증명 결과:', credResult.success);
                    if (!credResult.success || !credResult.credentials) {
                        throw new Error('계정 자격증명을 가져올 수 없습니다.');
                    }
                    updateMAStep('ma-step-login', 'completed');
                    updateMAStep('ma-step-publish', 'active');
                    updateMAProgress(i, totalItems, queueItem.accountName, '📤 블로그 발행 중...', 3, TOTAL_SUB_STEPS);
                    if (queueItem.ctaType === 'previous-post' && !queueItem.ctaUrl) {
                        try {
                            const catKey = String(queueItem.category || '').trim();
                            const postsAll = loadGeneratedPosts();
                            const ctaAcctNaverId = (credResult?.credentials?.naverId || '').trim().toLowerCase();
                            const published = (postsAll || []).filter((p) => {
                                const hasUrl = String(p?.publishedUrl || '').trim().length > 0;
                                const accountMatch = !ctaAcctNaverId || !p.naverId || p.naverId === ctaAcctNaverId;
                                return hasUrl && accountMatch;
                            });
                            console.log(`[FullAuto] CTA 매칭 시작 - 카테고리: ${catKey}, 계정: ${ctaAcctNaverId || '미지정'}, 발행된 글 수: ${published.length}`);
                            if (catKey && published.length > 0) {
                                const normCat = catKey.replace(/\s+/g, '').toLowerCase();
                                const candidates = published.filter((p) => {
                                    const pCat = String(p?.category || '').trim();
                                    if (!pCat)
                                        return false;
                                    const normPCat = pCat.replace(/\s+/g, '').toLowerCase();
                                    return normPCat === normCat || normPCat.includes(normCat) || normCat.includes(normPCat);
                                });
                                console.log(`[FullAuto] 매칭된 후보 수: ${candidates.length}`);
                                if (candidates.length > 0) {
                                    candidates.sort((a, b) => {
                                        const aT = new Date(a.publishedAt || a.updatedAt || a.createdAt || 0).getTime();
                                        const bT = new Date(b.publishedAt || b.updatedAt || b.createdAt || 0).getTime();
                                        return bT - aT;
                                    });
                                    const chosen = candidates[0];
                                    queueItem.ctaUrl = String(chosen?.publishedUrl || '').trim();
                                    queueItem.previousPostUrl = queueItem.ctaUrl;
                                    queueItem.previousPostTitle = String(chosen?.title || '이전 글 보기').trim();
                                    queueItem.ctaText = `📖 ${chosen.title}`;
                                    addMALog(`🔗 CTA 자동 연동: "${chosen.title}"`, 'info');
                                    console.log(`[FullAuto] CTA 연동 완료: ${queueItem.ctaUrl}`);
                                }
                                else {
                                    console.log('[FullAuto] 일치하는 카테고리의 이전 글을 찾지 못했습니다.');
                                }
                            }
                        }
                        catch (ctaErr) {
                            console.warn('[FullAuto] CTA 자동 연동 실패:', ctaErr);
                        }
                    }
                    const isShoppingConnectMode = !!(queueItem.affiliateLink && String(queueItem.affiliateLink).trim());
                    const isMateMode = queueItem.contentMode === 'mate';
                    const needsPreviousPostLookup = !(queueItem?.previousPostUrl && String(queueItem.previousPostUrl).trim());
                    if (needsPreviousPostLookup && (isShoppingConnectMode || isMateMode || queueItem.ctaType === 'previous-post')) {
                        try {
                            const catKey = String(queueItem.category || '').trim();
                            const postsAll = loadGeneratedPosts();
                            const prevAcctNaverId = (credResult?.credentials?.naverId || '').trim().toLowerCase();
                            const published = (postsAll || []).filter((p) => {
                                const hasUrl = String(p?.publishedUrl || '').trim().length > 0;
                                const accountMatch = !prevAcctNaverId || !p.naverId || p.naverId === prevAcctNaverId;
                                return hasUrl && accountMatch;
                            });
                            console.log(`[FullAuto] 이전글 엮기 매칭 시작 - 카테고리: ${catKey}, 계정: ${prevAcctNaverId || '미지정'}, 발행된 글 수: ${published.length}, 쇼핑커넥트: ${isShoppingConnectMode}`);
                            if (catKey && published.length > 0) {
                                const normCat = catKey.replace(/\s+/g, '').toLowerCase();
                                let candidates = published.filter((p) => {
                                    const pCat = String(p?.category || '').trim();
                                    if (!pCat)
                                        return false;
                                    const normPCat = pCat.replace(/\s+/g, '').toLowerCase();
                                    const categoryMatch = normPCat === normCat;
                                    if (isShoppingConnectMode) {
                                        const isPostShoppingConnect = !!(p.affiliateLink || p.contentMode === 'shopping-connect');
                                        return categoryMatch && isPostShoppingConnect;
                                    }
                                    return categoryMatch;
                                });
                                if (candidates.length === 0 && isShoppingConnectMode) {
                                    candidates = published.filter((p) => {
                                        const pCat = String(p?.category || '').trim();
                                        if (!pCat)
                                            return false;
                                        const normPCat = pCat.replace(/\s+/g, '').toLowerCase();
                                        return normPCat === normCat;
                                    });
                                }
                                console.log(`[FullAuto] 이전글 매칭 후보 수: ${candidates.length}`);
                                if (candidates.length > 0) {
                                    candidates.sort((a, b) => {
                                        const aT = new Date(a.publishedAt || a.updatedAt || a.createdAt || 0).getTime();
                                        const bT = new Date(b.publishedAt || b.updatedAt || b.createdAt || 0).getTime();
                                        return bT - aT;
                                    });
                                    const chosen = candidates[0];
                                    if (isShoppingConnectMode || isMateMode) {
                                        queueItem.previousPostUrl = String(chosen?.publishedUrl || '').trim();
                                        queueItem.previousPostTitle = String(chosen?.title || '이전 글 보기').trim();
                                    }
                                    else {
                                        queueItem.ctaUrl = String(chosen?.publishedUrl || '').trim();
                                        queueItem.previousPostUrl = queueItem.ctaUrl;
                                        queueItem.ctaText = `📖 추천 글: ${String(chosen?.title || '이전 글 보기').trim()}`;
                                        queueItem.previousPostTitle = String(chosen?.title || '이전 글 보기').trim();
                                    }
                                    addMALog(`📖 이전글 자동 매칭: "${chosen.title}"`, 'info');
                                    console.log(`[FullAuto] 이전글 엮기 연동 완료: ${queueItem.previousPostUrl || queueItem.ctaUrl}`);
                                }
                                else {
                                    console.log('[FullAuto] 일치하는 카테고리의 이전 글을 찾지 못했습니다.');
                                }
                            }
                        }
                        catch (prevPostErr) {
                            console.warn('[FullAuto] 이전글 엮기 자동 연동 실패:', prevPostErr);
                        }
                    }
                    if (queueItem.publishMode === 'schedule' && queueItem.scheduleDate && queueItem.scheduleTime) {
                        const scheduledMoment = new Date(`${queueItem.scheduleDate}T${queueItem.scheduleTime}`);
                        const now = new Date();
                        if (scheduledMoment.getTime() <= now.getTime()) {
                            const BUFFER_MS = 20 * 60 * 1000;
                            const corrected = new Date(now.getTime() + BUFFER_MS);
                            corrected.setMinutes(Math.ceil(corrected.getMinutes() / 10) * 10, 0, 0);
                            const newDate = corrected.toISOString().split('T')[0];
                            const hh = String(corrected.getHours()).padStart(2, '0');
                            const mm = String(corrected.getMinutes()).padStart(2, '0');
                            const newTime = `${hh}:${mm}`;
                            addMALog(`⚠️ 예약 시간 과거 감지: ${queueItem.scheduleDate} ${queueItem.scheduleTime} → ${newDate} ${newTime}로 자동 보정`, 'warning');
                            console.log(`[FullAuto] ⚠️ 예약 시간 과거 보정: ${queueItem.scheduleDate} ${queueItem.scheduleTime} → ${newDate} ${newTime}`);
                            queueItem.scheduleDate = newDate;
                            queueItem.scheduleTime = newTime;
                        }
                    }
                    addMALog('📤 블로그 발행 중...', 'info');
                    if (queueItem.publishMode === 'schedule') {
                        addMALog(`📅 예약 시간: ${queueItem.scheduleDate} ${queueItem.scheduleTime} (타입: ${queueItem.scheduleType || 'naver-server'})`, 'info');
                    }
                    addProgressItem(`   🚀 ${queueItem.accountName} 발행 중...`, 'info');
                    let extractedThumbnailPath;
                    if (Array.isArray(generatedImages) && generatedImages.length > 0) {
                        const thumbImg = generatedImages.find((img) => img.isThumbnail === true);
                        if (thumbImg) {
                            extractedThumbnailPath = thumbImg.filePath || thumbImg.url || undefined;
                            console.log(`[FullAuto] 🖼️ 썸네일 추출 (isThumbnail): ${extractedThumbnailPath?.substring(0, 80)}`);
                        }
                        if (!extractedThumbnailPath && generatedImages[0]) {
                            extractedThumbnailPath = generatedImages[0].filePath || generatedImages[0].url || undefined;
                            console.log(`[FullAuto] 🖼️ 썸네일 폴백 (첫 이미지): ${extractedThumbnailPath?.substring(0, 80)}`);
                        }
                    }
                    const publishOptions = {
                        naverId: credResult.credentials.naverId,
                        naverPassword: credResult.credentials.naverPassword,
                        url: queueItem.sourceUrl || undefined,
                        keywords: queueItem.sourceKeyword || undefined,
                        generator: UnifiedDOMCache.getGenerator(),
                        imageSource: queueItem.imageSource,
                        toneStyle: queueItem.toneStyle,
                        publishMode: queueItem.publishMode || 'publish',
                        ...(() => {
                            if (queueItem.publishMode !== 'schedule')
                                return { scheduleDate: undefined, scheduleTime: undefined };
                            if (queueItem.scheduleDate && queueItem.scheduleTime)
                                return { scheduleDate: queueItem.scheduleDate, scheduleTime: queueItem.scheduleTime };
                            const fb = new Date(Date.now() + 30 * 60 * 1000);
                            const cm = Math.ceil(fb.getMinutes() / 10) * 10;
                            fb.setMinutes(cm >= 60 ? 0 : cm, 0, 0);
                            if (cm >= 60)
                                fb.setHours(fb.getHours() + 1);
                            return {
                                scheduleDate: queueItem.scheduleDate || `${fb.getFullYear()}-${String(fb.getMonth() + 1).padStart(2, '0')}-${String(fb.getDate()).padStart(2, '0')}`,
                                scheduleTime: queueItem.scheduleTime || `${String(fb.getHours()).padStart(2, '0')}:${String(fb.getMinutes()).padStart(2, '0')}`,
                            };
                        })(),
                        scheduleType: queueItem.scheduleType || 'naver-server',
                        scheduleInterval: queueItem.scheduleInterval,
                        categoryName: String(queueItem.realCategoryName || '').trim() || undefined,
                        category: queueItem.category || undefined,
                        skipCta: queueItem.ctaType === 'none' || queueItem?.formData?.skipCta === true || queueItem?.skipCta === true,
                        ctaPosition: queueItem?.formData?.ctaPosition || queueItem?.ctaPosition || 'bottom',
                        ctas: (() => {
                            const fromForm = Array.isArray(queueItem?.formData?.ctas) ? queueItem.formData.ctas : [];
                            const list = fromForm
                                .map((c) => ({ text: String(c?.text || '').trim(), link: String(c?.link || '').trim() || undefined }))
                                .filter((c) => Boolean(c.text));
                            if (list.length > 0)
                                return list;
                            const t = String((queueItem?.formData?.ctaText ?? queueItem.ctaText) || '').trim();
                            const l = String((queueItem?.formData?.ctaLink ?? queueItem?.formData?.ctaUrl ?? queueItem.ctaUrl) || '').trim();
                            return t ? [{ text: t, link: l || undefined }] : [];
                        })(),
                        ctaText: String((queueItem?.formData?.ctaText ?? queueItem.ctaText) || '').trim() || undefined,
                        ctaLink: String((queueItem?.formData?.ctaLink ?? queueItem?.formData?.ctaUrl ?? queueItem.ctaUrl) || '').trim() || undefined,
                        hashtags: Array.isArray(structuredContent?.hashtags)
                            ? structuredContent.hashtags
                            : String(structuredContent?.hashtags || '').split(/[,\s#]+/).map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean),
                        preGeneratedContent: structuredContent ? {
                            title: String(structuredContent.selectedTitle || '').trim(),
                            content: structuredContent.bodyPlain || structuredContent.content,
                            hashtags: (structuredContent.hashtags || []).join(' '),
                            structuredContent: structuredContent,
                            generatedImages: generatedImages,
                        } : null,
                        keepBrowserOpen: true,
                        includeThumbnailText: queueItem.includeThumbnailText ?? false,
                        contentMode: queueItem.contentMode,
                        affiliateLink: queueItem.affiliateLink,
                        videoOption: queueItem.videoOption,
                        skipImages: (queueItem.imageSource === 'skip') || false,
                        useAiImage: queueItem.useAiImage ?? true,
                        createProductThumbnail: queueItem.createProductThumbnail ?? false,
                        scSubImageSource: itemPipelineCfg.shopping.subImageMode,
                        collectedImages: structuredContent?.collectedImages || [],
                        previousPostUrl: queueItem?.previousPostUrl || (queueItem.ctaType === 'previous-post' ? queueItem?.ctaUrl : undefined) || undefined,
                        previousPostTitle: queueItem?.previousPostTitle || (queueItem.ctaType === 'previous-post' && queueItem?.ctaText ? String(queueItem.ctaText).replace(/^[\s📖👉:\-]+/, '').trim() : undefined) || undefined,
                        thumbnailPath: extractedThumbnailPath || undefined,
                    };
                    console.log('[FullAuto] 발행 옵션:', publishOptions);
                    console.log(`[🔍 DIAG-2 IPC전달] publishMode=${publishOptions.publishMode}, scheduleDate=${publishOptions.scheduleDate}, scheduleTime=${publishOptions.scheduleTime}, scheduleType=${publishOptions.scheduleType}`);
                    const result = await window.api.multiAccountPublish([queueItem.accountId], publishOptions);
                    console.log('[FullAuto] 발행 결과:', result);
                    if (stopRequested || window.stopFullAutoPublish) {
                        break;
                    }
                    if (result.success && result.results?.[0]?.success) {
                        updateMAStep('ma-step-publish', 'completed');
                        const publishedUrl = result.results?.[0]?.url;
                        if (publishedUrl && structuredContent?.selectedTitle) {
                            const today = new Date();
                            savePublishedPost(today, structuredContent.selectedTitle, publishedUrl);
                            if (!generatedPostId) {
                                const posts = loadGeneratedPosts();
                                const matchingPost = posts.find(p => p.title === structuredContent.selectedTitle && !p.publishedUrl);
                                if (matchingPost) {
                                    updatePostAfterPublish(matchingPost.id, publishedUrl, queueItem.publishMode);
                                    addMALog(`📎 발행 URL 저장됨: ${publishedUrl}`, 'info');
                                }
                            }
                        }
                        try {
                            if (generatedPostId && publishedUrl) {
                                updatePostAfterPublish(generatedPostId, publishedUrl, queueItem.publishMode);
                                updatePostImages(generatedPostId, generatedImages);
                            }
                        }
                        catch (e) {
                            console.warn('[multiAccountManager] catch ignored:', e);
                        }
                        addMALog(`✅ ${queueItem.accountName}: 발행 성공!`, 'success');
                        addProgressItem(`✅ [${i + 1}/${totalItems}] ${queueItem.accountName}: 발행 성공!`, 'success');
                        totalSuccess++;
                        if (queueItem.ctaType === 'previous-post' && publishedUrl) {
                            for (let j = i + 1; j < queueSnapshot.length; j++) {
                                const nextItem = queueSnapshot[j];
                                if (nextItem.ctaType === 'previous-post' && nextItem.accountName === queueItem.accountName) {
                                    const validChainUrl = publishedUrl.startsWith('http') ? publishedUrl : '';
                                    nextItem.ctaUrl = validChainUrl;
                                    nextItem.ctaLink = validChainUrl;
                                    nextItem.ctaText = `📖 추천 글: ${structuredContent?.selectedTitle || '이전 글'}`;
                                    nextItem.previousPostUrl = validChainUrl;
                                    nextItem.previousPostTitle = structuredContent?.selectedTitle || '이전 글';
                                    console.log(`[FullAuto] 🔗 이전글 체이닝: 대기열[${j}] (${nextItem.accountName})에 URL 전달 → ${publishedUrl}`);
                                    addMALog(`🔗 이전글 체이닝: ${nextItem.accountName}의 다음 항목에 방금 발행한 URL 전달`, 'info');
                                    break;
                                }
                            }
                        }
                    }
                    else {
                        throw new Error(result.results?.[0]?.message || '발행 실패');
                    }
                }
                catch (error) {
                    updateMAStep('ma-step-publish', 'error');
                    addMALog(`❌ ${queueItem.accountName}: ${error.message}`, 'error');
                    addProgressItem(`❌ [${i + 1}/${totalItems}] ${queueItem.accountName}: ${error.message}`, 'error');
                    totalFail++;
                }
                if (i < queueSnapshot.length - 1 && !stopRequested && !window.stopFullAutoPublish) {
                    try {
                        const adbEnabled = itemPipelineCfg.safety.adbIpChangeEnabled;
                        const adbEvery = itemPipelineCfg.safety.adbIpChangeEvery;
                        const publishedCount = i + 1;
                        if (adbEnabled && publishedCount % adbEvery === 0) {
                            updateMAProgress(i + 1, totalItems, '📱 IP 변경 중...', '📱 ADB 비행기모드 IP 변경 중...');
                            addMALog(`📱 ADB IP 변경 시작 (${publishedCount}번째 발행 완료 후)...`, 'info');
                            addProgressItem(`📱 ADB IP 변경 중...`, 'info');
                            const adbResult = await window.api.adbChangeIp(5);
                            if (adbResult.success) {
                                addMALog(`✅ IP 변경 성공: ${adbResult.oldIp} → ${adbResult.newIp}`, 'success');
                                addProgressItem(`✅ IP 변경: ${adbResult.oldIp} → ${adbResult.newIp}`, 'success');
                            }
                            else {
                                addMALog(`⚠️ IP 변경 실패: ${adbResult.message}`, 'warning');
                                addProgressItem(`⚠️ IP 변경 실패: ${adbResult.message}`, 'warning');
                            }
                        }
                    }
                    catch (adbErr) {
                        console.error('[FullAuto] ADB IP 변경 오류:', adbErr);
                        addMALog(`⚠️ ADB IP 변경 오류: ${adbErr.message}`, 'warning');
                    }
                    if (intervalSeconds > 0) {
                        const jitteredSeconds = applyIntervalJitter(intervalSeconds, intervalPolicy.safe);
                        const waitMsg = formatWaitTime(jitteredSeconds);
                        updateMAProgress(i + 1, totalItems, '대기 중...', `⏳ 다음 발행까지 ${waitMsg} 대기`);
                        addMALog(`⏳ 다음 발행까지 ${waitMsg} 대기...`, 'info');
                        addProgressItem(`⏳ 다음 발행까지 ${waitMsg} 대기...`, 'info');
                        const ok = await waitInterruptible(jitteredSeconds, i, totalItems);
                        if (!ok) {
                            break;
                        }
                    }
                }
            }
        }
        finally {
            isPublishing = false;
            const wasStopped = stopRequested || window.stopFullAutoPublish;
            destroyMAFloatingBar();
            if (!wasStopped) {
                publishQueue = [];
                renderQueue();
            }
            updateMAProgress(totalItems, totalItems, '완료', wasStopped ? '⏹️ 발행이 중지되었습니다.' : '🎉 모든 발행 완료!');
            addMALog(wasStopped ? '⏹️ 발행이 중지되었습니다.' : `🎉 모든 발행 완료! (성공: ${totalSuccess}, 실패: ${totalFail})`, wasStopped ? 'warning' : 'success');
            try {
                console.log('[FullAuto] 🧹 발행 완료 → 전체 상태 초기화 시작...');
                if (typeof window.resetAfterPublish === 'function') {
                    window.resetAfterPublish();
                }
                window.imageManagementGeneratedImages = [];
                window.maPresetThumbnail = null;
                window.maPresetThumbnailPath = null;
                if (typeof ImageManager !== 'undefined') {
                    ImageManager.clearAll();
                }
                console.log('[FullAuto] ✅ 전체 상태 초기화 완료 → 새 발행 준비 완료');
            }
            catch (memErr) {
                console.warn('[FullAuto] 상태 초기화 중 오류:', memErr);
            }
            showMAResult(totalSuccess, totalFail);
            try {
                const progressStopBtn = document.getElementById('ma-progress-stop-btn');
                const progressCloseBtn = document.getElementById('ma-progress-close-btn');
                if (progressStopBtn)
                    progressStopBtn.style.display = 'none';
                if (progressCloseBtn) {
                    progressCloseBtn.style.display = 'flex';
                    if (!progressCloseBtn.hasAttribute('data-listener-added')) {
                        progressCloseBtn.setAttribute('data-listener-added', 'true');
                        progressCloseBtn.addEventListener('click', () => {
                            hideMAFloatingBar();
                            hideMAProgressModal();
                        });
                    }
                }
            }
            catch (btnErr) {
                console.warn('[FullAuto] 버튼 전환 오류:', btnErr);
            }
            try {
                if (startBtn) {
                    startBtn.disabled = false;
                    startBtn.innerHTML = startBtnOriginalHtml || '<span style="font-size: 1.25rem;">🚀</span> 대기열 발행 시작';
                }
            }
            catch (startBtnErr) {
                console.warn('[FullAuto] 시작 버튼 복원 오류:', startBtnErr);
            }
            if (wasStopped) {
                toastManager.warning(`대기열 발행 중지됨 (성공: ${totalSuccess}개, 실패: ${totalFail}개)`);
            }
            else {
                toastManager.success(`대기열 발행 완료! 성공: ${totalSuccess}개, 실패: ${totalFail}개`);
            }
            try {
                refreshGeneratedPostsList();
                console.log('[FullAuto] ✅ 생성된 글 목록 UI 갱신 완료');
            }
            catch (e) {
                console.warn('[FullAuto] 글 목록 갱신 실패:', e);
            }
        }
    });
    async function handleStopPublish() {
        stopRequested = true;
        isPublishing = false;
        window.stopFullAutoPublish = true;
        destroyMAFloatingBar();
        try {
            await window.api.multiAccountCancel();
        }
        catch (e) {
        }
        try {
            await window.api.cancelAutomation();
        }
        catch (e) {
        }
        try {
            const ws = window;
            if (ws.publishTimeoutId) {
                clearTimeout(ws.publishTimeoutId);
                ws.publishTimeoutId = null;
            }
            if (ws.progressIntervalId) {
                clearInterval(ws.progressIntervalId);
                ws.progressIntervalId = null;
            }
        }
        catch (e) {
            console.warn('[handleStopPublish] 타이머 정리 오류:', e);
        }
        const startBtn = document.getElementById('ma-start-publish-btn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<span style="font-size: 1.25rem;">🚀</span> 대기열 발행 시작';
        }
        const stopBtn = document.getElementById('ma-progress-stop-btn');
        const closeBtn = document.getElementById('ma-progress-close-btn');
        const completeBtn = document.getElementById('ma-progress-complete-btn');
        if (stopBtn)
            stopBtn.style.display = 'none';
        if (closeBtn) {
            closeBtn.style.display = 'flex';
            if (!closeBtn.hasAttribute('data-listener-added')) {
                closeBtn.setAttribute('data-listener-added', 'true');
                closeBtn.addEventListener('click', () => {
                    hideMAProgressModal();
                });
            }
        }
        if (completeBtn)
            completeBtn.style.display = 'none';
        addMALog('⏹️ 발행이 강제 중지되었습니다.', 'warning');
        toastManager.warning('발행이 강제 중지되었습니다.');
    }
    document.getElementById('ma-stop-publish-btn')?.addEventListener('click', handleStopPublish);
    document.getElementById('ma-progress-stop-btn')?.addEventListener('click', handleStopPublish);
    const multiAccountModalDelegation = document.getElementById('multi-account-modal');
    if (multiAccountModalDelegation) {
        multiAccountModalDelegation.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('ma-fullauto-btn') || target.closest('.ma-fullauto-btn')) {
                const btn = target.classList.contains('ma-fullauto-btn') ? target : target.closest('.ma-fullauto-btn');
                if (btn) {
                    e.stopPropagation();
                    const accountId = btn.dataset.accountId;
                    const accountName = btn.dataset.accountName;
                    if (accountId && accountName) {
                        console.log('[MultiAccountPublish] 이벤트 위임: 풀오토 세팅 클릭 -', accountName);
                        openFullautoSettingModal(accountId, accountName);
                    }
                }
                return;
            }
            if (target.id === 'ma-add-account-btn' || target.closest('#ma-add-account-btn')) {
                e.stopPropagation();
                console.log('[MultiAccountPublish] 이벤트 위임: 계정 추가 클릭');
                openAccountEditModal();
                return;
            }
            if (target.classList.contains('ma-edit-btn') || target.closest('.ma-edit-btn')) {
                const btn = target.classList.contains('ma-edit-btn') ? target : target.closest('.ma-edit-btn');
                if (btn) {
                    e.stopPropagation();
                    const accountId = btn.dataset.accountId;
                    if (accountId) {
                        console.log('[MultiAccountPublish] 이벤트 위임: 편집 클릭 -', accountId);
                        openAccountEditModal(accountId);
                    }
                }
                return;
            }
            if (target.classList.contains('ma-delete-btn') || target.closest('.ma-delete-btn')) {
                const btn = target.classList.contains('ma-delete-btn') ? target : target.closest('.ma-delete-btn');
                if (btn) {
                    e.stopPropagation();
                    const accountId = btn.dataset.accountId;
                    if (accountId && confirm('정말로 이 계정을 삭제하시겠습니까?')) {
                        console.log('[MultiAccountPublish] 이벤트 위임: 삭제 클릭 -', accountId);
                        window.api.removeBlogAccount(accountId).then(() => {
                            selectedAccountIds = selectedAccountIds.filter(id => id !== accountId);
                            renderMultiAccountList();
                            updateSelectedCount();
                            toastManager.success('계정이 삭제되었습니다.');
                        }).catch((e) => {
                            console.error('[MultiAccountPublish] 계정 삭제 실패:', e);
                            toastManager.error('계정 삭제 중 오류가 발생했습니다.');
                        });
                    }
                }
                return;
            }
        });
        console.log('[MultiAccountPublish] ✅ 이벤트 위임 핸들러 등록 완료');
    }
    console.log('[MultiAccountPublish] 다중계정 동시발행 모달 초기화 완료');
}
console.log('%c━━━ multiAccountManager v2.10.213 LOADED ━━━', 'background: #8b5cf6; color: white; font-size: 14px; font-weight: bold; padding: 6px 12px; border-radius: 4px');
if (typeof document !== 'undefined') {
    const closeStaleBackdrops = (reason = 'periodic') => {
        let closedCount = 0;
        const closedIds = [];
        document.querySelectorAll('.modal-backdrop').forEach(el => {
            const inlineDisplay = el.style.display;
            if (inlineDisplay !== 'flex' && inlineDisplay !== 'block') {
                if (inlineDisplay !== 'none') {
                    el.style.display = 'none';
                    el.setAttribute('aria-hidden', 'true');
                    closedCount++;
                    closedIds.push(el.id || '(no-id)');
                }
            }
        });
        if (closedCount > 0) {
            console.log(`[BackdropGuard] ${reason}: ${closedCount}개 닫음 → [${closedIds.join(', ')}]`);
        }
        return closedCount;
    };
    window.closeStaleBackdrops = closeStaleBackdrops;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => closeStaleBackdrops('DOMContentLoaded'));
    }
    else {
        closeStaleBackdrops('immediate');
    }
    setTimeout(() => closeStaleBackdrops('after-1s'), 1000);
    console.log('%c[BackdropGuard] 30초 fallback + visibility 게이팅 — v2.10.349', 'color: #4ade80; font-weight: bold');
    let backdropFallbackId = null;
    const startBackdropFallback = () => {
        if (backdropFallbackId)
            clearInterval(backdropFallbackId);
        backdropFallbackId = setInterval(() => closeStaleBackdrops('interval-30s'), 30000);
    };
    const stopBackdropFallback = () => {
        if (backdropFallbackId) {
            clearInterval(backdropFallbackId);
            backdropFallbackId = null;
        }
    };
    if (document.visibilityState === 'visible')
        startBackdropFallback();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible')
            startBackdropFallback();
        else
            stopBackdropFallback();
    });
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')) {
                const el = m.target;
                if (el.classList && el.classList.contains('modal-backdrop')) {
                    const d = el.style.display;
                    console.log(`[Observer] ${el.id || '(no-id)'} 변경 감지 → style.display="${d}"`);
                    if (d !== 'flex' && d !== 'block' && d !== 'none' && d !== '') {
                        el.style.display = 'none';
                        el.setAttribute('aria-hidden', 'true');
                        console.warn(`[Observer] 🚨 ${el.id} invisible 상태("${d}") → 강제 none 설정`);
                    }
                }
            }
        }
    });
    const startObserver = () => {
        const all = document.querySelectorAll('.modal-backdrop');
        all.forEach(el => {
            observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
        });
        console.log(`%c[Observer] MutationObserver 시작 — ${all.length}개 modal-backdrop 감시 중 (v2.10.213)`, 'color: #22d3ee; font-weight: bold');
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    }
    else {
        startObserver();
    }
}
window.diagnoseAddAccount = function () {
    const btn = document.getElementById('main-add-account-btn');
    const modal = document.getElementById('ma-account-edit-modal');
    const funcExists = typeof window.openAddAccountModalDirect === 'function';
    const lines = [];
    lines.push('=== 계정 추가 진단 ===');
    lines.push('');
    lines.push(`v2.10.208 빌드`);
    lines.push(`버튼(main-add-account-btn): ${btn ? '✅ 존재' : '❌ 없음'}`);
    if (btn) {
        const r = btn.getBoundingClientRect();
        lines.push(`  위치: ${Math.round(r.x)}, ${Math.round(r.y)} (크기 ${Math.round(r.width)}×${Math.round(r.height)})`);
        lines.push(`  disabled: ${btn.disabled}`);
        lines.push(`  visible: ${r.width > 0 && r.height > 0}`);
        const topElement = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        lines.push(`  해당 위치 실제 element: ${topElement?.tagName.toLowerCase()}${topElement?.id ? '#' + topElement.id : ''}`);
        lines.push(`  버튼 == 실제 element: ${topElement === btn ? '✅ 일치' : '❌ 다른 element가 위 덮음!'}`);
    }
    lines.push(`모달(ma-account-edit-modal): ${modal ? '✅ 존재' : '❌ 없음'}`);
    if (modal) {
        lines.push(`  display: ${modal.style.display || 'inherit'}`);
    }
    lines.push(`window.openAddAccountModalDirect: ${funcExists ? '✅ 정의됨' : '❌ 미정의'}`);
    lines.push('');
    lines.push('이 정보를 캡처해서 개발자에게 전달해주세요.');
    alert(lines.join('\n'));
};
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target)
            return;
        const btn = target.closest('button');
        if (!btn)
            return;
        if (btn.id !== 'main-add-account-btn' && btn.id !== 'ma-add-account-inline')
            return;
        const path = [];
        let el = target;
        while (el && el !== document.body) {
            const idPart = el.id ? `#${el.id}` : '';
            const classPart = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
            path.push(`${el.tagName.toLowerCase()}${idPart}${classPart}`);
            el = el.parentElement;
        }
        console.log(`[ClickDebug] 🎯 ${btn.id} 클릭 capture 단계 도달!`);
        console.log(`[ClickDebug] target chain: ${path.join(' > ')}`);
        console.log(`[ClickDebug] e.defaultPrevented:`, e.defaultPrevented);
        console.log(`[ClickDebug] button.disabled:`, btn.disabled);
        console.log(`[ClickDebug] button.onclick exists:`, !!btn.onclick);
        console.log(`[ClickDebug] window.openAddAccountModalDirect:`, typeof window.openAddAccountModalDirect);
    }, { capture: true });
}
window.openAddAccountModalDirect = function () {
    console.log('[Modal] 🔘 openAddAccountModalDirect v2.10.215 START');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[ModalDebug] 🔘 openAddAccountModalDirect v2.10.215 START');
    console.log('[ModalDebug] 시각:', new Date().toISOString());
    const accountEditModal = document.getElementById('ma-account-edit-modal');
    console.log('[ModalDebug] Step 1: getElementById 결과:', accountEditModal ? '✅ 존재' : '❌ NULL');
    if (!accountEditModal) {
        console.error('[ModalDebug] ❌ ma-account-edit-modal element 없음 — HTML 누락');
        alert('계정 추가 모달을 찾을 수 없습니다.\n앱을 재시작해주세요.');
        return;
    }
    const beforeComputed = window.getComputedStyle(accountEditModal);
    console.log('[ModalDebug] Step 2: 변경 전 상태');
    console.log('  - inline style.display:', JSON.stringify(accountEditModal.style.display));
    console.log('  - computed display:', beforeComputed.display);
    console.log('  - computed visibility:', beforeComputed.visibility);
    console.log('  - computed opacity:', beforeComputed.opacity);
    console.log('  - computed z-index:', beforeComputed.zIndex);
    console.log('  - computed pointer-events:', beforeComputed.pointerEvents);
    console.log('  - aria-hidden:', accountEditModal.getAttribute('aria-hidden'));
    console.log('  - class list:', accountEditModal.className);
    console.log('  - parent element:', accountEditModal.parentElement?.tagName, accountEditModal.parentElement?.id || '(no id)');
    console.log('[ModalDebug] Step 3: 입력 폼 초기화');
    const titleEl = document.getElementById('ma-edit-title');
    console.log('  - ma-edit-title:', titleEl ? '✅' : '❌');
    if (titleEl)
        titleEl.textContent = '새 계정 추가';
    for (const id of ['ma-edit-account-id', 'ma-edit-name', 'ma-edit-blog-id', 'ma-edit-naver-id', 'ma-edit-naver-pw']) {
        const el = document.getElementById(id);
        console.log(`  - ${id}:`, el ? '✅' : '❌');
        if (el)
            el.value = '';
    }
    const deleteBtn = document.getElementById('ma-delete-account-btn');
    if (deleteBtn)
        deleteBtn.style.display = 'none';
    if (accountEditModal.parentElement !== document.body) {
        console.log('[ModalDebug] Step 3.5: 모달을 body로 이동 (이전 부모:', accountEditModal.parentElement?.id || accountEditModal.parentElement?.tagName, ')');
        document.body.appendChild(accountEditModal);
    }
    else {
        console.log('[ModalDebug] Step 3.5: 이미 body 자식 — 이동 불필요');
    }
    accountEditModal.style.cssText = `
    display: flex !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: rgba(0, 0, 0, 0.5) !important;
    z-index: 99999 !important;
    align-items: center !important;
    justify-content: center !important;
    backdrop-filter: blur(8px) !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  `;
    console.log('[ModalDebug] Step 3.6: cssText로 모든 표시 속성 강제 적용 완료');
    console.log('[ModalDebug] Step 4: style.display = "flex" 재확인');
    accountEditModal.style.display = 'flex';
    accountEditModal.setAttribute('aria-hidden', 'false');
    const afterComputed = window.getComputedStyle(accountEditModal);
    console.log('[ModalDebug] Step 5: 변경 후 상태 (즉시)');
    console.log('  - inline style.display:', JSON.stringify(accountEditModal.style.display));
    console.log('  - computed display:', afterComputed.display);
    console.log('  - computed visibility:', afterComputed.visibility);
    console.log('  - computed opacity:', afterComputed.opacity);
    console.log('  - computed pointer-events:', afterComputed.pointerEvents);
    const rect = accountEditModal.getBoundingClientRect();
    console.log('  - getBoundingClientRect:', `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
    console.log('  - 화면에 보이는가:', rect.width > 0 && rect.height > 0 && afterComputed.display !== 'none' && afterComputed.visibility !== 'hidden' && parseFloat(afterComputed.opacity) > 0 ? '✅ YES' : '❌ NO');
    setTimeout(() => {
        const lateComputed = window.getComputedStyle(accountEditModal);
        console.log('[ModalDebug] Step 6: 100ms 후 재측정 (Observer/Interval 영향 확인)');
        console.log('  - inline style.display:', JSON.stringify(accountEditModal.style.display));
        console.log('  - computed display:', lateComputed.display);
        if (accountEditModal.style.display !== 'flex') {
            console.error('[ModalDebug] 🚨 누군가 100ms 안에 모달을 다시 닫았음! 범인 추적:');
            console.error('  - 현재 inline display:', accountEditModal.style.display);
            console.error('  - 추정 범인: setInterval closeStaleBackdrops, MutationObserver, 또는 다른 모듈');
        }
        else {
            console.log('[ModalDebug] ✅ 100ms 후에도 display: flex 유지 — 정상');
        }
        console.log('[ModalDebug] 🔘 openAddAccountModalDirect END');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }, 100);
};
document.addEventListener('DOMContentLoaded', () => {
    initMultiAccountPublishModal();
    initMainAccountSelector();
    try {
        const accountEditModal = document.getElementById('ma-account-edit-modal');
        if (accountEditModal && accountEditModal.parentElement !== document.body) {
            document.body.appendChild(accountEditModal);
            console.log('[MultiAccount] ✅ ma-account-edit-modal을 body 직속으로 이동 (nested HTML 구조 교정)');
        }
    }
    catch (err) {
        console.warn('[MultiAccount] ma-account-edit-modal 이동 실패 (무시):', err);
    }
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        if (!target)
            return;
        const btn = target.closest('button');
        if (!btn)
            return;
        if (btn.id === 'ma-add-account-inline' || btn.id === 'main-add-account-btn') {
            const lastDirect = btn.__lastDirectClick;
            if (lastDirect && Date.now() - lastDirect < 100)
                return;
            console.log(`[MultiAccount] 🔘 ${btn.id} 클릭 → 계정 편집 모달 열기`);
            const accountEditModal = document.getElementById('ma-account-edit-modal');
            if (accountEditModal) {
                const titleEl = document.getElementById('ma-edit-title');
                if (titleEl)
                    titleEl.textContent = '새 계정 추가';
                const accountIdInput = document.getElementById('ma-edit-account-id');
                if (accountIdInput)
                    accountIdInput.value = '';
                const inputIds = ['ma-edit-name', 'ma-edit-blog-id', 'ma-edit-naver-id', 'ma-edit-naver-pw'];
                for (const id of inputIds) {
                    const el = document.getElementById(id);
                    if (el)
                        el.value = '';
                }
                const deleteBtn = document.getElementById('ma-delete-account-btn');
                if (deleteBtn)
                    deleteBtn.style.display = 'none';
                accountEditModal.style.display = 'flex';
                accountEditModal.setAttribute('aria-hidden', 'false');
                return;
            }
            if (typeof window.openAccountEditModal === 'function') {
                window.openAccountEditModal();
            }
            else {
                const multiAccountModal = document.getElementById('multi-account-modal');
                if (multiAccountModal) {
                    multiAccountModal.style.display = 'flex';
                    multiAccountModal.setAttribute('aria-hidden', 'false');
                }
                else {
                    console.error('[MultiAccount] ❌ 어떤 모달도 찾을 수 없음 (ma-account-edit-modal, multi-account-modal 모두 누락)');
                    alert('계정 추가 모달을 열 수 없습니다. 환경설정에서 다시 시도해주세요.');
                }
            }
        }
    }, { capture: false });
});
function initMainAccountSelector() {
    const accountSelector = document.getElementById('main-account-selector');
    const addAccountBtn = document.getElementById('main-add-account-btn');
    const selectedAccountInfo = document.getElementById('selected-account-info');
    const selectedAccountName = document.getElementById('selected-account-name');
    const saveSessionBtn = document.getElementById('save-session-btn');
    const loadSessionBtn = document.getElementById('load-session-btn');
    const clearSessionBtn = document.getElementById('clear-session-btn');
    const naverIdInput = document.getElementById('naver-id');
    const naverPwInput = document.getElementById('naver-password');
    if (!accountSelector)
        return;
    let currentAccountId = null;
    let isRefreshingAccountList = false;
    let refreshAccountListTimer = null;
    let lastMultiAccountModalVisible = false;
    const scheduleAccountListRefresh = () => {
        try {
            if (refreshAccountListTimer)
                clearTimeout(refreshAccountListTimer);
        }
        catch (e) {
            console.warn('[multiAccountManager] catch ignored:', e);
        }
        refreshAccountListTimer = setTimeout(() => {
            loadAccountList();
        }, 250);
    };
    const accountSessions = new Map();
    async function loadAccountList() {
        try {
            const previousValue = accountSelector.value;
            isRefreshingAccountList = true;
            const result = await window.api.getAllBlogAccounts();
            if (result.success && result.accounts) {
                accountSelector.innerHTML = '<option value="">직접 입력</option>';
                result.accounts.forEach((account) => {
                    const option = document.createElement('option');
                    option.value = account.id;
                    option.textContent = `👤 ${account.name}`;
                    accountSelector.appendChild(option);
                });
                if (previousValue && Array.from(accountSelector.options).some(o => o.value === previousValue)) {
                    accountSelector.value = previousValue;
                }
            }
        }
        catch (error) {
            console.error('[MainAccountSelector] 계정 목록 로드 실패:', error);
        }
        finally {
            isRefreshingAccountList = false;
        }
    }
    window.loadMainAccountList = loadAccountList;
    function collectCurrentSession() {
        return {
            title: document.getElementById('unified-title')?.value || '',
            keywords: document.getElementById('unified-keywords')?.value || '',
            urls: Array.from(document.querySelectorAll('.unified-url-input')).map(el => el.value).filter(v => v),
            generatedTitle: document.getElementById('unified-generated-title')?.value || '',
            generatedContent: document.getElementById('unified-generated-content')?.value || '',
            generatedHashtags: document.getElementById('unified-generated-hashtags')?.value || '',
            generator: UnifiedDOMCache.getGenerator(),
            publishMode: document.getElementById('unified-publish-mode')?.value || 'publish',
            toneStyle: document.getElementById('unified-tone-style')?.value || 'friendly',
            imageSource: document.getElementById('unified-image-source')?.value || 'gemini',
            ctaText: document.getElementById('unified-cta-text')?.value || '',
            ctaLink: document.getElementById('unified-cta-link')?.value || '',
            ctas: readUnifiedCtasFromUi(),
            skipCta: document.getElementById('unified-skip-cta')?.checked || false,
            savedAt: new Date().toISOString(),
        };
    }
    function restoreSession(session) {
        if (!session)
            return;
        const titleInput = document.getElementById('unified-title');
        const keywordsInput = document.getElementById('unified-keywords');
        if (titleInput)
            titleInput.value = session.title || '';
        if (keywordsInput)
            keywordsInput.value = session.keywords || '';
        const urlInputs = document.querySelectorAll('.unified-url-input');
        if (urlInputs[0] && session.urls?.[0])
            urlInputs[0].value = session.urls[0];
        const genTitle = document.getElementById('unified-generated-title');
        const genContent = document.getElementById('unified-generated-content');
        const genHashtags = document.getElementById('unified-generated-hashtags');
        if (genTitle)
            genTitle.value = session.generatedTitle || '';
        if (genContent)
            genContent.value = session.generatedContent || '';
        if (genHashtags)
            genHashtags.value = session.generatedHashtags || '';
        const generator = document.getElementById('unified-generator');
        const publishMode = document.getElementById('unified-publish-mode');
        const toneStyle = document.getElementById('unified-tone-style');
        const imageSource = document.getElementById('unified-image-source');
        if (generator)
            generator.value = session.generator || 'gemini';
        if (publishMode)
            publishMode.value = session.publishMode || 'publish';
        if (toneStyle)
            toneStyle.value = session.toneStyle || 'friendly';
        if (imageSource)
            imageSource.value = session.imageSource || 'gemini';
        const ctaText = document.getElementById('unified-cta-text');
        const ctaLink = document.getElementById('unified-cta-link');
        const skipCta = document.getElementById('unified-skip-cta');
        if (ctaText)
            ctaText.value = session.ctaText || '';
        if (ctaLink)
            ctaLink.value = session.ctaLink || '';
        if (skipCta)
            skipCta.checked = session.skipCta || false;
        try {
            const container = document.getElementById('unified-cta-items-container');
            if (container && Array.isArray(session.ctas)) {
                container.innerHTML = '';
                for (const c of session.ctas) {
                    const text = String(c?.text || '').trim();
                    const link = String(c?.link || '').trim();
                    if (!text)
                        continue;
                    const row = document.createElement('div');
                    row.className = 'unified-cta-item';
                    row.style.cssText = 'display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem;';
                    row.innerHTML = `
            <input type="text" class="unified-cta-text" placeholder="CTA 텍스트" style="flex:1; padding: 0.75rem; border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 0.9rem; background: var(--bg-primary);" value="${escapeHtml(text)}">
            <input type="url" class="unified-cta-link" placeholder="링크 URL" style="flex:1; padding: 0.75rem; border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 0.9rem; background: var(--bg-primary);" value="${escapeHtml(link)}">
            <button type="button" class="unified-cta-remove" style="padding:0.5rem 0.75rem; background: rgba(239,68,68,0.15); color:#ef4444; border: 1px solid rgba(239,68,68,0.35); border-radius: 8px; cursor:pointer;">✕</button>
          `;
                    container.appendChild(row);
                }
            }
        }
        catch (e) {
            console.warn('[multiAccountManager] catch ignored:', e);
        }
    }
    function clearSession() {
        const titleInput = document.getElementById('unified-title');
        const keywordsInput = document.getElementById('unified-keywords');
        if (titleInput)
            titleInput.value = '';
        if (keywordsInput)
            keywordsInput.value = '';
        const urlInputs = document.querySelectorAll('.unified-url-input');
        urlInputs.forEach(input => input.value = '');
        const genTitle = document.getElementById('unified-generated-title');
        const genContent = document.getElementById('unified-generated-content');
        const genHashtags = document.getElementById('unified-generated-hashtags');
        if (genTitle)
            genTitle.value = '';
        if (genContent)
            genContent.value = '';
        if (genHashtags)
            genHashtags.value = '';
        const ctaText = document.getElementById('unified-cta-text');
        const ctaLink = document.getElementById('unified-cta-link');
        const skipCta = document.getElementById('unified-skip-cta');
        if (ctaText)
            ctaText.value = '';
        if (ctaLink)
            ctaLink.value = '';
        if (skipCta)
            skipCta.checked = false;
    }
    accountSelector.addEventListener('change', async () => {
        if (isRefreshingAccountList)
            return;
        const selectedId = accountSelector.value;
        // Keyword/URL are account-independent content inputs. Switching the
        // account (session clear or restore) must not wipe what the user typed,
        // so snapshot them here and re-apply after the switch. The manual
        // "세션 초기화" button still clears everything via clearSession().
        const _preservedKeywords = document.getElementById('unified-keywords')?.value || '';
        const _preservedUrls = Array.from(document.querySelectorAll('.unified-url-input')).map(el => el.value);
        if (currentAccountId) {
            accountSessions.set(currentAccountId, collectCurrentSession());
        }
        if (selectedId) {
            currentAccountId = selectedId;
            const result = await window.api.getAllBlogAccounts();
            const account = result.accounts?.find((a) => a.id === selectedId);
            if (account) {
                window.currentMainAccountSettings = account.settings || {};
                if (selectedAccountInfo)
                    selectedAccountInfo.style.display = 'block';
                if (selectedAccountName)
                    selectedAccountName.textContent = account.name;
                const credResult = await window.api.getAccountCredentials(selectedId);
                if (credResult.success && credResult.credentials) {
                    if (naverIdInput)
                        naverIdInput.value = credResult.credentials.naverId || '';
                    if (naverPwInput)
                        naverPwInput.value = credResult.credentials.naverPassword || '';
                }
                if (accountSessions.has(selectedId)) {
                    restoreSession(accountSessions.get(selectedId));
                    toastManager.info(`📂 ${account.name} 계정의 이전 세션을 불러왔습니다.`);
                }
                else {
                    clearSession();
                    toastManager.info(`👤 ${account.name} 계정으로 전환되었습니다. 새로운 세션입니다.`);
                }
            }
        }
        else {
            currentAccountId = null;
            window.currentMainAccountSettings = null;
            if (selectedAccountInfo)
                selectedAccountInfo.style.display = 'none';
            clearSession();
            if (naverIdInput)
                naverIdInput.value = '';
            if (naverPwInput)
                naverPwInput.value = '';
            toastManager.info('📝 직접 입력 모드로 전환되었습니다.');
        }
        // Re-apply the user's keyword/URL after the switch so neither clearSession
        // (fresh account) nor restoreSession (saved account) drops them. Only
        // non-empty typed values override — empty fields can still be populated
        // by a restored session.
        const _kwInput = document.getElementById('unified-keywords');
        if (_kwInput && _preservedKeywords)
            _kwInput.value = _preservedKeywords;
        const _urlInputs = document.querySelectorAll('.unified-url-input');
        _preservedUrls.forEach((v, i) => {
            if (v && _urlInputs[i])
                _urlInputs[i].value = v;
        });
    });
    addAccountBtn?.addEventListener('click', () => {
        if (typeof window.openAccountEditModal === 'function') {
            window.openAccountEditModal();
            return;
        }
        const multiAccountModal = document.getElementById('multi-account-modal');
        if (multiAccountModal) {
            multiAccountModal.style.display = 'flex';
            multiAccountModal.setAttribute('aria-hidden', 'false');
            return;
        }
        const multiAccountBtn = document.getElementById('multi-account-btn');
        multiAccountBtn?.click();
    });
    saveSessionBtn?.addEventListener('click', () => {
        if (!currentAccountId) {
            toastManager.warning('계정을 먼저 선택해주세요.');
            return;
        }
        accountSessions.set(currentAccountId, collectCurrentSession());
        toastManager.success('💾 현재 세션이 저장되었습니다.');
    });
    loadSessionBtn?.addEventListener('click', () => {
        if (!currentAccountId) {
            toastManager.warning('계정을 먼저 선택해주세요.');
            return;
        }
        if (accountSessions.has(currentAccountId)) {
            restoreSession(accountSessions.get(currentAccountId));
            toastManager.success('📂 저장된 세션을 불러왔습니다.');
        }
        else {
            toastManager.warning('저장된 세션이 없습니다.');
        }
    });
    clearSessionBtn?.addEventListener('click', () => {
        if (confirm('현재 세션을 초기화하시겠습니까?\n입력된 모든 내용이 삭제됩니다.')) {
            clearSession();
            if (currentAccountId) {
                accountSessions.delete(currentAccountId);
            }
            toastManager.success('🗑️ 세션이 초기화되었습니다.');
        }
    });
    loadAccountList();
    const multiAccountModal = document.getElementById('multi-account-modal');
    const isModalVisible = (el) => el.style.display !== 'none' && el.style.display !== '';
    const observer = new MutationObserver(() => {
        if (!multiAccountModal)
            return;
        const el = multiAccountModal;
        const isVisible = isModalVisible(el);
        if (lastMultiAccountModalVisible && !isVisible) {
            scheduleAccountListRefresh();
        }
        lastMultiAccountModalVisible = isVisible;
    });
    if (multiAccountModal) {
        lastMultiAccountModalVisible = isModalVisible(multiAccountModal);
        observer.observe(multiAccountModal, { attributes: true, attributeFilter: ['style'] });
    }
    console.log('[MainAccountSelector] 메인 계정 선택기 초기화 완료');
}


export { initMultiAccountManager, generateImagesForAutomation, initMultiAccountPublishModal, initMainAccountSelector };
