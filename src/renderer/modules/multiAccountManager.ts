// @ts-nocheck
// ============================================
// 다중계정 관리 모듈 (Multi-Account Manager)
// modules/multiAccountManager.ts
// ============================================

import { createTime24Select, bindTime24Events, setTime24Value, setTime24ValueByIdx } from '../utils/time24Select';
// ✅ 다계정 관리 기능 초기화 함수
export async function initMultiAccountManager() {
  console.log('[MultiAccount] 다계정 관리 기능 초기화 시작');

  const accountListContainer = document.getElementById('account-list');
  const noAccountsMessage = document.getElementById('no-accounts-message');
  const accountStatsSummary = document.getElementById('account-stats-summary');
  const addAccountBtn = document.getElementById('add-account-btn');

  if (!accountListContainer || !addAccountBtn) {
    console.log('[MultiAccount] 다계정 관리 UI 요소를 찾을 수 없습니다.');
    return;
  }

  // 계정 목록 렌더링 함수
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
        accountListContainer!.innerHTML = '';
        if (noAccountsMessage) noAccountsMessage.style.display = 'block';
        if (accountStatsSummary) accountStatsSummary.style.display = 'none';
        return;
      }

      if (noAccountsMessage) noAccountsMessage.style.display = 'none';
      if (accountStatsSummary) accountStatsSummary.style.display = 'block';

      // 통계 업데이트
      const statsResult = await window.api.getTotalBlogStats();
      if (statsResult.success && statsResult.stats) {
        const stats = statsResult.stats;
        const totalAccountsEl = document.getElementById('stats-total-accounts');
        const activeAccountsEl = document.getElementById('stats-active-accounts');
        const todayPostsEl = document.getElementById('stats-today-posts');
        const weekPostsEl = document.getElementById('stats-week-posts');

        if (totalAccountsEl) totalAccountsEl.textContent = String(stats.totalAccounts);
        if (activeAccountsEl) activeAccountsEl.textContent = String(stats.activeAccounts);
        if (todayPostsEl) todayPostsEl.textContent = String(stats.todayTotalPosts);
        if (weekPostsEl) weekPostsEl.textContent = String(stats.weekTotalPosts);
      }

      // 활성 계정 확인
      const activeResult = await window.api.getActiveBlogAccount();
      const activeAccountId = activeResult.success && activeResult.account ? activeResult.account.id : null;

      // 계정 목록 HTML 생성
      accountListContainer!.innerHTML = accounts.map((account: any) => {
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

      // 이벤트 리스너 등록
      accountListContainer!.querySelectorAll('.set-active-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const accountId = (e.target as HTMLElement).dataset.accountId;
          if (accountId) {
            const result = await window.api.setActiveBlogAccount(accountId);
            if (result.success) {
              toastManager.success('활성 계정이 변경되었습니다.');
              await renderAccountList();
            } else {
              toastManager.error(result.message || '활성화 실패');
            }
          }
        });
      });

      accountListContainer!.querySelectorAll('.toggle-account-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const accountId = (e.target as HTMLElement).dataset.accountId;
          if (accountId) {
            const result = await window.api.toggleBlogAccount(accountId);
            if (result.success) {
              toastManager.success(result.isActive ? '계정이 활성화되었습니다.' : '계정이 비활성화되었습니다.');
              await renderAccountList();
            } else {
              toastManager.error(result.message || '토글 실패');
            }
          }
        });
      });

      accountListContainer!.querySelectorAll('.remove-account-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const accountId = (e.target as HTMLElement).dataset.accountId;
          if (accountId && confirm('정말로 이 계정을 삭제하시겠습니까?')) {
            const result = await window.api.removeBlogAccount(accountId);
            if (result.success) {
              toastManager.success('계정이 삭제되었습니다.');
              await renderAccountList();
            } else {
              toastManager.error(result.message || '삭제 실패');
            }
          }
        });
      });

    } catch (error) {
      console.error('[MultiAccount] 계정 목록 렌더링 오류:', error);
    }
  }

  // 계정 추가 버튼 이벤트
  addAccountBtn.addEventListener('click', async () => {
    const nameInput = document.getElementById('new-account-name') as HTMLInputElement;
    const blogIdInput = document.getElementById('new-account-blog-id') as HTMLInputElement;
    const naverIdInput = document.getElementById('new-account-naver-id') as HTMLInputElement;
    const naverPwInput = document.getElementById('new-account-naver-pw') as HTMLInputElement;
    const dailyLimitInput = document.getElementById('new-account-daily-limit') as HTMLInputElement;
    const autoRotateInput = document.getElementById('new-account-auto-rotate') as HTMLInputElement;

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

        // 입력 필드 초기화
        if (nameInput) nameInput.value = '';
        if (blogIdInput) blogIdInput.value = '';
        if (naverIdInput) naverIdInput.value = '';
        if (naverPwInput) naverPwInput.value = '';
        if (dailyLimitInput) dailyLimitInput.value = '5';
        if (autoRotateInput) autoRotateInput.checked = true;

        await renderAccountList();
      } else {
        toastManager.error(result.message || '계정 추가 실패');
      }
    } catch (error) {
      console.error('[MultiAccount] 계정 추가 오류:', error);
      toastManager.error('계정 추가 중 오류가 발생했습니다.');
    }
  });

  // ✅ 계정 동기화 버튼 이벤트
  const syncAccountsBtn = document.getElementById('ar-sync-accounts-btn');
  syncAccountsBtn?.addEventListener('click', async () => {
    try {
      syncAccountsBtn.innerHTML = '<span>🔄</span> 동기화 중...';
      (syncAccountsBtn as HTMLButtonElement).disabled = true;

      const result = await (window.api as any).adminSyncAccounts();
      if (result.success) {
        toastManager.success('네이버 계정 정보가 패널로 동기화되었습니다.');
      } else {
        toastManager.error(result.message || '동기화 실패');
      }
    } catch (error) {
      console.error('[AccountSync] 동기화 오류:', error);
      toastManager.error('동기화 중 오류가 발생했습니다.');
    } finally {
      syncAccountsBtn.innerHTML = '<span>🔄</span> 패널로 계정 동기화';
      (syncAccountsBtn as HTMLButtonElement).disabled = false;
    }
  });

  // 초기 렌더링
  await renderAccountList();
  console.log('[MultiAccount] 다계정 관리 기능 초기화 완료');
}

// ✅ 다중계정 동시발행 모달 초기화 함수

// ✅ 비용 안전성을 고려한 이미지 생성 래퍼 함수 (자동화용)
// ✅ [2026-01-20 개선] 재시도 로직 + 부분 성공 처리 + 성공률 로깅
export async function generateImagesForAutomation(
  provider: string,
  headings: any[],
  postTitle: string,
  options: {
    stopCheck?: () => boolean;
    onProgress?: (msg: string) => void;
    allowThumbnailText?: boolean;
    referenceImagePath?: string; // ✅ 참조 이미지 경로 추가
    collectedImages?: any[]; // ✅ [2026-01-21 FIX] 수집된 이미지 배열 추가
  } = {}
): Promise<any[]> {

  // ✅ [2026-02-11 FIX] provider가 비었거나 유효하지 않으면 fullAutoImageSource 우선 참조 및 최종 안전망 로그 추가
  // ✅ [2026-02-13 FIX] 'saved'는 "저장된 이미지" UI 버튼 값으로 AI 이미지 생성 엔진이 아님 → 폴백 필요
  // ✅ [2026-03-07 FIX] 'skip'은 INVALID가 아님 — 호출자가 이미지 건너뛰기를 명시한 것
  if (provider === 'skip') {
    console.log('[generateImagesForAutomation] ⏭️ provider="skip" → 이미지 생성 건너뜀');
    return [];
  }
  // ✅ [2026-03-23 FIX] 'local-folder'는 AI 이미지 생성 대상이 아님 → 빈 배열 반환
  // 로컬 폴더 이미지 로딩은 호출자(fullAutoFlow, multiAccountManager 내 분기)에서 직접 처리
  if (provider === 'local-folder') {
    console.log('[generateImagesForAutomation] 📂 provider="local-folder" → AI 생성 불필요, 빈 배열 반환');
    return [];
  }
  // ✅ [2026-03-23 FIX] 'local-folder' 제거 — 호출자 분기에서 이미 처리됨
  const INVALID_PROVIDERS = ['saved', '', 'null', 'undefined'];
  if (!provider || INVALID_PROVIDERS.includes(provider.trim())) {
    // ✅ [2026-02-18 FIX] localStorage에서도 "null"/"undefined" 문자열 필터링
    const rawFullAuto = localStorage.getItem('fullAutoImageSource');
    const rawGlobal = localStorage.getItem('globalImageSource');
    const fallbackProvider =
      (rawFullAuto && !INVALID_PROVIDERS.includes(rawFullAuto) ? rawFullAuto : null) ||
      (rawGlobal && !INVALID_PROVIDERS.includes(rawGlobal) ? rawGlobal : null) ||
      'nano-banana-pro';
    console.warn(`[generateImagesForAutomation] ⚠️ provider가 유효하지 않음("${provider}")! fallback 적용: "${fallbackProvider}"`);
    provider = fallbackProvider;
  }

  // ✅ [Debug] 썸네일 텍스트 옵션 로깅
  console.log(`[generateImagesForAutomation] 🖼️ allowThumbnailText = ${options.allowThumbnailText}, provider = ${provider}`);

  const { stopCheck, onProgress } = options;

  if (stopCheck && stopCheck()) return [];

  // ✅ [2026-02-27 FIX] 썸네일: AI 추론으로 블로그 제목 → 영어 이미지 프롬프트 변환
  // 기존: rawPrompt = postTitle (한국어) → englishPrompt도 한국어 → 제너릭 이미지 생성
  // 수정: generateEnglishPromptForHeading(postTitle) → 콘텐츠에 맞는 영어 프롬프트
  const items: any[] = [];
  for (const h of headings) {
    const headingIdx = headings.indexOf(h);
    const title = h.title || h.text || h.heading || (typeof h === 'string' ? h : '');
    if (!title || title.trim() === '') continue;

    const isThumb = h.isThumbnail === true;

    // ✅ [2026-03-10 FIX] headingImageMode 필터링은 main.ts IPC 핸들러에서 1회만 수행
    // 렌더러에서 사전 필터링하면 이중 필터링으로 짝수/홀수 모드에서 이미지 누락 발생
    let rawPrompt: string;

    if (isThumb) {
      // ✅ [2026-02-27 FIX] 썸네일: 블로그 제목을 AI가 추론하여 영어 이미지 프롬프트 생성
      try {
        const globalImgSettings = typeof getGlobalImageSettings === 'function' ? getGlobalImageSettings() : {};
        const thumbStyle = globalImgSettings.imageStyle || '';
        rawPrompt = await generateEnglishPromptForHeading(postTitle, '', thumbStyle);
        console.log(`[generateImagesForAutomation] 🎨 AI 썸네일 프롬프트: "${rawPrompt.substring(0, 60)}..."`);
      } catch {
        // AI 실패 시 폴백
        rawPrompt = `eye-catching blog thumbnail, visual metaphor for: ${postTitle}, cinematic lighting, compelling composition, hero image style`;
        console.log(`[generateImagesForAutomation] ⚠️ AI 썸네일 프롬프트 실패 → 기본 프롬프트 사용`);
      }
    } else {
      // ✅ [2026-03-23 FIX] 소제목도 AI 영어 프롬프트 변환 + imageStyle 반영
      // 기존: h.prompt || title (한국어 원문 → imageStyle 무시)
      // 수정: generateEnglishPromptForHeading(title, postTitle, imageStyle) → 풀오토와 동일 품질
      try {
        const globalImgSettings = typeof getGlobalImageSettings === 'function' ? getGlobalImageSettings() : {};
        const subheadingStyle = globalImgSettings.imageStyle || '';
        rawPrompt = await generateEnglishPromptForHeading(title, postTitle, subheadingStyle);
        console.log(`[generateImagesForAutomation] 🎨 소제목[${headingIdx}] AI 프롬프트: "${rawPrompt.substring(0, 60)}..."`);
      } catch {
        // AI 실패 시 기존 방식 폴백
        rawPrompt = h.prompt || h.imagePrompt || title || 'Abstract Image';
        console.log(`[generateImagesForAutomation] ⚠️ 소제목[${headingIdx}] AI 프롬프트 실패 → 원문 사용`);
      }
    }

    items.push({
      // ✅ [2026-03-17 FIX] 썸네일 항목의 heading을 postTitle로 치환 — '🖼️ 썸네일' 텍스트 각인 방지
      heading: isThumb ? (postTitle || title) : title,
      prompt: rawPrompt,
      englishPrompt: rawPrompt, // ✅ sanitizeImagePrompt 바이패스 — AI 프롬프트 직접 사용
      isThumbnail: isThumb,
      // ✅ [2026-03-11 FIX] 모든 엔진에서 텍스트 포함 허용 (nano-banana: AI 직접 렌더링, 기타: Sharp 후처리)
      allowText: isThumb ? (options.allowThumbnailText || false) : false,
      referenceImagePath: h.referenceImagePath || options.referenceImagePath
    });
  }

  // 소제목이 없는 경우 최소 1개 항목 생성
  if (items.length === 0 && postTitle) {
    items.push({
      heading: postTitle,
      prompt: postTitle,
      isThumbnail: true,
      // ✅ [2026-03-11 FIX] 모든 엔진에서 텍스트 포함 허용
      allowText: options.allowThumbnailText || false,
      referenceImagePath: options.referenceImagePath
    });
  }

  onProgress?.(`🚀 이미지 생성 시작: ${items.length}개 (Provider: ${provider})`);

  // ✅ [2026-03-11 FIX] 전체 배치 타임아웃: 15분 (원래 엔진 재시도 3회 + 충분한 여유)
  const BATCH_TIMEOUT_MS = 15 * 60 * 1000;
  const batchStartTime = Date.now();
  const checkBatchTimeout = (): boolean => {
    const elapsed = Date.now() - batchStartTime;
    if (elapsed >= BATCH_TIMEOUT_MS) {
      console.error(`[generateImagesForAutomation] ⏰ 배치 타임아웃 (${Math.round(elapsed / 1000)}초 경과)`);
      onProgress?.(`⏰ 이미지 생성 타임아웃 (${Math.round(elapsed / 1000)}초) - 부분 결과로 진행`);
      return true;
    }
    return false;
  };

  // ✅ [2026-03-11 FIX] 재시도 횟수 증가 (2→3회) - 원래 엔진 성공률 극대화
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;
  let bestResult: any = null;  // 부분 성공 시 최선의 결과 저장



  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (stopCheck && stopCheck()) return bestResult?.images || [];

      // ✅ [2026-02-03] 배치 타임아웃 체크 - 5분 초과 시 부분 결과로 즉시 반환
      if (checkBatchTimeout()) {
        if (bestResult?.images?.length > 0) {
          onProgress?.(`⏰ 타임아웃! 부분 결과 ${bestResult.images.length}개 사용`);
          return bestResult.images;
        }
        throw new Error('이미지 생성 타임아웃 (15분 초과) - 이미지 없이 발행 진행');
      }

      // ✅ [2026-01-26] 생성 중 진행상황 표시
      const elapsedSec = Math.round((Date.now() - batchStartTime) / 1000);
      onProgress?.(`🎨 ${provider} 엔진으로 이미지 생성 중... (${items.length}개 대기, ${elapsedSec}초 경과)`);


      // 1. 메인 프로세스에 이미지 생성 요청
      const result = await generateImagesWithCostSafety({
        provider: provider,
        items: items,
        postTitle: postTitle,
        regenerate: false,
        referenceImagePath: options.referenceImagePath,
        collectedImages: options.collectedImages,  // ✅ [2026-01-21 FIX] 수집된 이미지 전달
        thumbnailTextInclude: options.allowThumbnailText  // ✅ [2026-01-28 FIX] 썸네일 텍스트 포함 옵션 전달
      });

      if (stopCheck && stopCheck()) return result?.images || bestResult?.images || [];

      if (result.success && result.images && result.images.length > 0) {
        const successCount = result.images.length;

        // ✅ [2026-03-12 FIX] headingImageMode에 따른 실제 기대 이미지 수 계산
        // main.ts가 headingImageMode에 따라 소제목 이미지를 필터링하므로,
        // 성공률은 "요청한 전체 items"가 아닌 "실제 생성이 기대되는 items"로 계산해야 함
        const headingImageMode = localStorage.getItem('headingImageMode') || 'all';
        let expectedImageCount = items.length;
        if (headingImageMode === 'thumbnail-only') {
          expectedImageCount = items.filter(i => i.isThumbnail).length || 1;
        } else if (headingImageMode === 'none') {
          expectedImageCount = 0;
        } else if (headingImageMode === 'odd-only' || headingImageMode === 'even-only') {
          const thumbs = items.filter(i => i.isThumbnail).length;
          const nonThumbs = items.filter(i => !i.isThumbnail).length;
          expectedImageCount = thumbs + Math.ceil(nonThumbs / 2);
        }
        const totalRequested = Math.max(expectedImageCount, 1);
        const successRate = Math.round((successCount / totalRequested) * 100);

        // ✅ [2026-01-26] 개별 이미지 생성 완료 로그
        for (let i = 0; i < successCount; i++) {
          const img = result.images[i];
          const headingName = img?.heading || img?.title || `${i + 1}번`;
          onProgress?.(`✅ ${i + 1}/${successCount} 이미지 생성 완료: ${headingName.substring(0, 20)}...`);
        }

        // ✅ [2026-01-24 FIX] 부분 성공 저장 (나중에 더 나은 결과가 없으면 이것 사용)
        if (!bestResult || result.images.length > (bestResult.images?.length || 0)) {
          bestResult = result;
        }

        // ✅ 50% 이상 성공 시 즉시 반환 (부분 성공 허용)
        if (successRate >= 50) {
          onProgress?.(`🎉 총 ${successCount}/${totalRequested}개 이미지 생성 완료! (성공률: ${successRate}%)`);
          console.log(`[Image Stats] 생성 성공률: ${successRate}% (${successCount}/${totalRequested}), 시도: ${attempt}/${MAX_RETRIES}`);
          return result.images;
        } else {
          // 50% 미만이면 더 시도
          console.log(`[Image Stats] 부분 성공 (${successRate}%), 더 나은 결과를 위해 재시도...`);
          if (attempt < MAX_RETRIES) {
            throw new Error(`이미지 생성 부분 성공 (${successCount}/${totalRequested}), 재시도 중...`);
          }
        }
      } else if (result.images && result.images.length === 0) {
        throw new Error('이미지 생성 결과가 비어있음');
      } else {
        throw new Error(result.message || '이미지 생성 결과 없음');
      }

    } catch (error) {
      lastError = error as Error;
      console.error(`[generateImagesForAutomation] 시도 ${attempt}/${MAX_RETRIES} 실패:`, error);

      if (attempt < MAX_RETRIES) {
        // ✅ [2026-01-24 FIX] 대기 시간 증가: 5초, 10초, 15초 (API 레이트 리밋 대응)
        const waitTime = 5000 * attempt; // 5초, 10초, 15초
        onProgress?.(`⚠️ 이미지 생성 실패 (${attempt}/${MAX_RETRIES}), ${waitTime / 1000}초 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // ✅ [2026-01-24 FIX] 모든 재시도 실패해도 부분 성공 결과가 있으면 반환
  if (bestResult && bestResult.images && bestResult.images.length > 0) {
    const successCount = bestResult.images.length;
    // ✅ [2026-03-12 FIX] headingImageMode 보정된 기대 수 사용
    const headingImageMode = localStorage.getItem('headingImageMode') || 'all';
    let expectedFinal = items.length;
    if (headingImageMode === 'thumbnail-only') expectedFinal = items.filter(i => i.isThumbnail).length || 1;
    else if (headingImageMode === 'none') expectedFinal = 0;
    else if (headingImageMode === 'odd-only' || headingImageMode === 'even-only') {
      expectedFinal = items.filter(i => i.isThumbnail).length + Math.ceil(items.filter(i => !i.isThumbnail).length / 2);
    }
    const totalRequested = Math.max(expectedFinal, 1);
    onProgress?.(`⚠️ 부분 성공: ${successCount}/${totalRequested}개 이미지 생성 (일부만 완료)`);
    console.log(`[Image Stats] 부분 성공 반환: ${successCount}/${totalRequested}개`);
    return bestResult.images;
  }

  // 모든 재시도 실패
  // ✅ [2026-03-09 FIX] 하위 프로바이더의 사용자 친화적 에러 메시지 그대로 전달
  const errorDetail = lastError?.message || '알 수 없는 오류';
  onProgress?.(`❌ 이미지 생성 최종 실패: ${errorDetail}`);
  throw lastError || new Error('이미지 생성 실패');
}

export async function initMultiAccountPublishModal() {

  console.log('[MultiAccountPublish] 다중계정 동시발행 모달 초기화 시작');

  const multiAccountBtn = document.getElementById('multi-account-btn');
  const multiAccountModal = document.getElementById('multi-account-modal');
  const accountEditModal = document.getElementById('ma-account-edit-modal');

  if (!multiAccountBtn || !multiAccountModal) {
    console.log('[MultiAccountPublish] 모달 요소를 찾을 수 없습니다.');
    return;
  }

  // ✅ 모달이 body의 직접 자식이 아니면 body로 이동 (중첩 문제 해결)
  if (multiAccountModal.parentElement !== document.body) {
    console.log('[MultiAccountPublish] 모달을 body로 이동합니다.');
    document.body.appendChild(multiAccountModal);
  }

  // 선택된 계정 ID 목록
  let selectedAccountIds: string[] = [];
  let isPublishing = false;
  let stopRequested = false;

  // 모달 열기
  multiAccountBtn.addEventListener('click', async () => {
    console.log('[MultiAccountPublish] 모달 열기 버튼 클릭');

    // 먼저 모달을 표시
    multiAccountModal.style.display = 'flex';
    multiAccountModal.setAttribute('aria-hidden', 'false');

    // 그 다음 계정 목록 로드 (에러가 나도 모달은 열린 상태 유지)
    try {
      await renderMultiAccountList();
    } catch (error) {
      console.error('[MultiAccountPublish] 계정 목록 로드 중 오류:', error);
      // 오류가 발생해도 모달은 계속 표시
      const container = document.getElementById('ma-accounts-container');
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #ef4444;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</div>
            <p>계정 목록을 불러오지 못했습니다</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">${(error as Error).message}</p>
          </div>
        `;
      }
    }
  });

  // 모달 닫기
  document.querySelectorAll('[data-close-multi-account]').forEach(btn => {
    btn.addEventListener('click', () => {
      multiAccountModal.style.display = 'none';
      multiAccountModal.setAttribute('aria-hidden', 'true');
    });
  });

  // 계정 편집 모달 닫기
  document.querySelectorAll('[data-close-ma-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (accountEditModal) {
        accountEditModal.style.display = 'none';
        accountEditModal.setAttribute('aria-hidden', 'true');
      }
    });
  });

  // 연속 발행 모드 토글
  const continuousModeCheckbox = document.getElementById('ma-continuous-mode') as HTMLInputElement;
  const continuousSettings = document.getElementById('ma-continuous-settings');
  continuousModeCheckbox?.addEventListener('change', () => {
    if (continuousSettings) {
      continuousSettings.style.display = continuousModeCheckbox.checked ? 'flex' : 'none';
    }
  });

  // ✅ 콘텐츠 모드 선택 UI (다중계정)
  const maContentModeBtns = document.querySelectorAll('.ma-content-mode-btn');
  const maContentModeInput = document.getElementById('ma-content-mode') as HTMLInputElement;
  const maShoppingConnectSettings = document.getElementById('ma-shopping-connect-settings');

  maContentModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode;
      if (mode) {
        // 모든 버튼 선택 해제
        maContentModeBtns.forEach(b => b.classList.remove('selected'));
        // 현재 버튼 선택
        btn.classList.add('selected');

        // input 값 업데이트
        if (maContentModeInput) maContentModeInput.value = mode;

        // 쇼핑커넥트 모드 선택 시 설정 UI 표시
        if (maShoppingConnectSettings) {
          if (mode === 'affiliate') {
            maShoppingConnectSettings.style.display = 'block';
            // 애니메이션
            maShoppingConnectSettings.animate([
              { opacity: 0, transform: 'translateY(-10px)' },
              { opacity: 1, transform: 'translateY(0)' }
            ], { duration: 300, easing: 'ease-out' });
          } else {
            maShoppingConnectSettings.style.display = 'none';
          }
        }
      }
    });
  });

  // 계정 목록 렌더링
  async function renderMultiAccountList() {
    const container = document.getElementById('ma-accounts-container');
    const noAccountsMsg = document.getElementById('ma-no-accounts');

    if (!container) {
      console.warn('[MultiAccountPublish] ma-accounts-container 요소가 없습니다.');
      return;
    }

    try {
      console.log('[MultiAccountPublish] 계정 목록 로드 시작...');

      // window.api 존재 여부 확인
      if (!window.api) {
        console.error('[MultiAccountPublish] window.api가 정의되지 않았습니다!');
        container.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #ef4444;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</div>
            <p>API가 초기화되지 않았습니다</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">앱을 재시작해주세요</p>
          </div>
        `;
        if (noAccountsMsg) noAccountsMsg.style.display = 'none';
        return;
      }

      // getAllBlogAccounts 함수 존재 여부 확인
      if (typeof window.api.getAllBlogAccounts !== 'function') {
        console.error('[MultiAccountPublish] window.api.getAllBlogAccounts 함수가 없습니다!');
        container.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #ef4444;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</div>
            <p>계정 API가 없습니다</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">앱 버전을 확인해주세요</p>
          </div>
        `;
        if (noAccountsMsg) noAccountsMsg.style.display = 'none';
        return;
      }

      const result = await window.api.getAllBlogAccounts();
      console.log('[MultiAccountPublish] getAllBlogAccounts 결과:', result);

      if (!result.success || !result.accounts) {
        console.warn('[MultiAccountPublish] 계정 로드 실패:', result.message);
        if (noAccountsMsg) noAccountsMsg.style.display = 'block';
        return;
      }

      const accounts = result.accounts;

      if (accounts.length === 0) {
        if (noAccountsMsg) noAccountsMsg.style.display = 'block';
        return;
      }

      if (noAccountsMsg) noAccountsMsg.style.display = 'none';

      // 계정 카드 HTML 생성 (풀오토 세팅 버튼 추가)
      // ✅ [2026-03-27] 전체 프록시 일괄 설정 버튼 (M-3 해결)
      const unsetCount = accounts.filter((a: any) => !a.settings?.proxyHost).length;
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
      container.innerHTML = bulkProxyHtml + accounts.map((account: any) => {
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

      // 풀오토 세팅 버튼 이벤트
      container.querySelectorAll('.ma-fullauto-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const button = e.target as HTMLElement;
          const accountId = button.dataset.accountId;
          const accountName = button.dataset.accountName;
          if (accountId && accountName) {
            openFullautoSettingModal(accountId, accountName);
          }
        });
      });

      // ✅ [2026-03-27] 전체 프록시 일괄 설정 버튼 이벤트
      const bulkProxyBtn = document.getElementById('ma-bulk-proxy-btn');
      if (bulkProxyBtn) {
        bulkProxyBtn.addEventListener('click', async () => {
          if (!confirm(`프록시 미설정 계정 ${unsetCount}개에 SmartProxy Sticky Session을 자동 설정합니다.\n계정별 고정 IP가 할당됩니다. 계속할까요?`)) return;
          bulkProxyBtn.textContent = '🔄 설정 중...';
          (bulkProxyBtn as HTMLButtonElement).disabled = true;
          try {
            const result = await (window.api as any).bulkSetupStickyProxy();
            if (result.success) {
              toastManager.success(result.message);
              await renderMultiAccountList();
            } else { toastManager.error(result.message || '일괄 설정 실패'); }
          } catch (err) {
            toastManager.error(`오류: ${(err as Error).message}`);
          }
        });
      }

      // 편집 버튼 이벤트
      container.querySelectorAll('.ma-edit-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const accountId = (e.target as HTMLElement).closest('button')?.dataset.accountId;
          if (accountId) await openAccountEditModal(accountId);
        });
      });

      // 삭제 버튼 이벤트
      container.querySelectorAll('.ma-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const accountId = (e.target as HTMLElement).closest('button')?.dataset.accountId;
          if (accountId && confirm('정말로 이 계정을 삭제하시겠습니까?')) {
            await window.api.removeBlogAccount(accountId);
            selectedAccountIds = selectedAccountIds.filter(id => id !== accountId);
            await renderMultiAccountList();
            updateSelectedCount();
          }
        });
      });

    } catch (error) {
      console.error('[MultiAccountPublish] 계정 목록 렌더링 오류:', error);
    }
  }

  // ✅ 발행 대기열 타입 정의
  interface QueueItem {
    id: string;
    accountId: string;
    accountName: string;
    sourceUrl: string;
    sourceKeyword: string;
    imageSource: string;
    toneStyle: string;
    category?: string;
    contentMode?: 'seo' | 'homefeed' | 'affiliate'; // ✅ [FIX] 쇼핑커넥트 모드 추가
    ctaType: 'none' | 'previous-post' | 'custom';
    ctaUrl: string;
    ctaText: string;
    includeThumbnailText?: boolean;
    useAiImage?: boolean; // ✅ AI 이미지 생성 사용 여부
    createProductThumbnail?: boolean; // ✅ 제품 이미지 기반 썸네일 합성 여부
    publishMode?: string;
    scheduleDate?: string;
    scheduleTime?: string;             // ✅ [2026-02-08 FIX] 시간 분리 전달
    scheduleType?: 'app-schedule' | 'naver-server';
    scheduleInterval?: number;         // ✅ [2026-02-08 FIX] 계정 간 발행 간격 (분)
    affiliateLink?: string; // ✅ [2026-01-20] 쇼핑커넥트 제휴 링크
    videoOption?: boolean;  // ✅ [2026-01-20] VEO 영상 변환 옵션
    manualThumbnail?: string | null; // ✅ [2026-01-22] 수동 썸네일 경로
    realCategoryName?: string; // ✅ [2026-02-09 FIX] 실제 블로그 카테고리(폴더) 이름
    keywordAsTitle?: boolean;      // ✅ [2026-02-14] 키워드 그대로 제목 사용
    keywordTitlePrefix?: boolean;  // ✅ [2026-02-14] 키워드 맨 앞 배치
    scheduleUserModified?: boolean; // ✅ [2026-03-17] 사용자가 개별 예약 모달에서 수동 설정한 항목
  }

  // ✅ 발행 대기열
  let publishQueue: QueueItem[] = [];

  // ✅ [2026-02-08] 다중계정 예약 상태 요약 업데이트
  function updateMAScheduleStatusSummary(): void {
    const statusText = document.getElementById('ma-schedule-status-text');
    if (!statusText) return;

    if (!publishQueue || publishQueue.length === 0) {
      statusText.textContent = '📭 대기열이 비어있습니다.';
      return;
    }

    const scheduledCount = publishQueue.filter((item: QueueItem) => item.publishMode === 'schedule' && item.scheduleDate).length;
    const total = publishQueue.length;

    if (scheduledCount === 0) {
      statusText.innerHTML = `총 <strong style="color: #60a5fa;">${total}</strong>개 항목 | 예약 설정된 항목 없음`;
    } else {
      statusText.innerHTML = `총 <strong style="color: #60a5fa;">${total}</strong>개 항목 | <strong style="color: #10b981;">${scheduledCount}</strong>개 예약 설정됨`;
    }
  }

  // ✅ [2026-02-08] 다중계정 랜덤 예약 배분 모달
  function showMARandomScheduleModal(): void {
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
              ${createTime24Select({ id: 'ma-rnd-start-time', defaultValue: '09:00', step: 10, style: 'width: 100%;', selectStyle: 'padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark; cursor: pointer; flex: 1;' })}
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
              ${createTime24Select({ id: 'ma-rnd-end-time', defaultValue: '18:00', step: 10, style: 'width: 100%;', selectStyle: 'padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark; cursor: pointer; flex: 1;' })}
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
    bindTime24Events(overlay);

    // 프리셋 버튼
    overlay.querySelectorAll('.ma-rnd-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = (btn as HTMLElement).dataset.start || '09:00';
        const e = (btn as HTMLElement).dataset.end || '18:00';
        setTime24Value('ma-rnd-start-time', s);
        setTime24Value('ma-rnd-end-time', e);
        toastManager.info(`⏰ ${s} ~ ${e} 시간대가 설정되었습니다.`);
      });
    });

    // 닫기
    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.getElementById('ma-rnd-schedule-close')?.addEventListener('click', closeModal);
    document.getElementById('ma-rnd-schedule-cancel')?.addEventListener('click', closeModal);

    // 적용
    document.getElementById('ma-rnd-schedule-apply')?.addEventListener('click', () => {
      const today2 = new Date();
      const todayStr2 = `${today2.getFullYear()}-${String(today2.getMonth() + 1).padStart(2, '0')}-${String(today2.getDate()).padStart(2, '0')}`;
      const startDateStr = (document.getElementById('ma-rnd-start-date') as HTMLInputElement)?.value || todayStr2;
      const startTimeStr = (document.getElementById('ma-rnd-start-time') as HTMLInputElement)?.value || '09:00';
      const endDateStr = (document.getElementById('ma-rnd-end-date') as HTMLInputElement)?.value || startDateStr;
      const endTimeStr = (document.getElementById('ma-rnd-end-time') as HTMLInputElement)?.value || '18:00';

      const startTime = new Date(`${startDateStr}T${startTimeStr}`);
      const endTime = new Date(`${endDateStr}T${endTimeStr}`);

      // ✅ 15분 미래 검증
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

      // ✅ [2026-03-17 MOD] scheduleDistributor 모듈로 위임
      const distributed = (window as any).distributeByRandomRange(publishQueue.length, {
        startDate: startDateStr, startTime: startTimeStr,
        endDate: endDateStr, endTime: endTimeStr,
      });
      publishQueue.forEach((item: QueueItem, i: number) => {
        item.scheduleDate = distributed[i].date;
        item.scheduleTime = distributed[i].time;
        item.publishMode = 'schedule';
        item.scheduleType = 'naver-server';
        // ✅ [2026-04-01 BUG-7 FIX] 랜덤 배분 후에도 scheduleUserModified=true로 설정
        // 기존: undefined → distributeWithProtection이 발행 직전에 360분 간격으로 재배분하여 날짜 밀림 발생
        // 수정: true → distributeWithProtection에서 "수동 설정"으로 인식되어 보호됨
        item.scheduleUserModified = true;
      });

      // 미리보기
      const previewEl = document.getElementById('ma-rnd-schedule-preview');
      const previewContent = document.getElementById('ma-rnd-schedule-preview-content');
      if (previewEl && previewContent) {
        previewEl.style.display = 'block';
        previewContent.innerHTML = publishQueue.map((item: QueueItem, i: number) => {
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

    // ESC
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleEsc); }
    };
    document.addEventListener('keydown', handleEsc);
  }

  // ✅ [2026-02-08] 다중계정 개별 예약 설정 모달
  function showMAIndividualScheduleModal(): void {
    document.getElementById('ma-individual-schedule-modal-overlay')?.remove();

    if (!publishQueue || publishQueue.length === 0) {
      toastManager.warning('📋 대기열에 항목이 없습니다. 먼저 항목을 추가해주세요.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'ma-individual-schedule-modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 50000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px);';

    const itemRows = publishQueue.map((item: QueueItem, i: number) => {
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
          ${createTime24Select({ className: 'ma-indv-time', dataIdx: i, defaultValue: curTime, step: 10, style: 'width: 100px;', selectStyle: 'padding: 0.35rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.75rem; color-scheme: dark; cursor: pointer;' })}
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
            ${createTime24Select({ id: 'ma-indv-bulk-time', defaultValue: '09:00', step: 10, selectStyle: 'padding: 0.3rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.7rem; color-scheme: dark; cursor: pointer;' })}
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
    bindTime24Events(overlay);

    // 전체 선택
    document.getElementById('ma-indv-select-all')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      overlay.querySelectorAll('.ma-indv-check').forEach(cb => {
        (cb as HTMLInputElement).checked = checked;
      });
    });

    // 일괄 적용
    document.getElementById('ma-indv-bulk-apply')?.addEventListener('click', () => {
      const bulkDate = (document.getElementById('ma-indv-bulk-date') as HTMLInputElement)?.value;
      const bulkTime = (document.getElementById('ma-indv-bulk-time') as HTMLInputElement)?.value || '09:00';
      if (!bulkDate) {
        toastManager.warning('📅 일괄 적용할 날짜를 선택해주세요.');
        return;
      }
      let appliedCount = 0;
      overlay.querySelectorAll('.ma-indv-check').forEach(cb => {
        if ((cb as HTMLInputElement).checked) {
          const idx = (cb as HTMLElement).dataset.idx;
          const dateInput = overlay.querySelector(`.ma-indv-date[data-idx="${idx}"]`) as HTMLInputElement;
          if (dateInput) dateInput.value = bulkDate;
          setTime24ValueByIdx(idx, bulkTime, overlay);
          appliedCount++;
        }
      });
      if (appliedCount > 0) {
        toastManager.info(`✅ ${appliedCount}개 항목에 ${bulkDate} ${bulkTime} 일괄 적용됨`);
      } else {
        toastManager.warning('⚠️ 체크된 항목이 없습니다.');
      }
    });

    // 닫기
    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.getElementById('ma-indv-schedule-close')?.addEventListener('click', closeModal);
    document.getElementById('ma-indv-schedule-cancel')?.addEventListener('click', closeModal);

    // 저장
    document.getElementById('ma-indv-schedule-save')?.addEventListener('click', () => {
      let savedCount = 0;
      overlay.querySelectorAll('.ma-indv-check').forEach(cb => {
        const idx = parseInt((cb as HTMLElement).dataset.idx || '0');
        const checked = (cb as HTMLInputElement).checked;
        const dateInput = overlay.querySelector(`.ma-indv-date[data-idx="${idx}"]`) as HTMLInputElement;
        const timeInput = overlay.querySelector(`.ma-indv-time[data-idx="${idx}"]`) as HTMLInputElement;
        const item = publishQueue[idx];
        if (!item) return;

        if (checked && dateInput?.value) {
          const timeVal = timeInput?.value || '09:00';
          // ✅ 15분 미래 검증
          const scheduledTime = new Date(`${dateInput.value}T${timeVal}`);
          const minAllowed = new Date(Date.now() + 15 * 60 * 1000);
          if (scheduledTime.getTime() < minAllowed.getTime()) {
            const label = (item.accountName || item.sourceUrl || '').substring(0, 15);
            toastManager.error(`❌ "${label}..." 예약 시간이 현재 기준 15분 이후여야 합니다!`);
            return;
          }
          item.publishMode = 'schedule';
          item.scheduleDate = dateInput.value;   // YYYY-MM-DD
          item.scheduleTime = timeVal;           // HH:mm
          item.scheduleType = 'naver-server';
          item.scheduleUserModified = true;      // ✅ [2026-03-17] 사용자 수동 설정 플래그
          savedCount++;
        } else if (!checked) {
          item.publishMode = 'publish';
          item.scheduleDate = undefined;
          item.scheduleTime = undefined;
          item.scheduleUserModified = undefined; // ✅ [2026-03-17] 예약 해제 시 수동 플래그 초기화
        }
      });

      toastManager.success(`✅ ${savedCount}개 항목 예약 저장 완료!`);
      renderQueue();
      updateMAScheduleStatusSummary();
      closeModal();
    });

    // ESC
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleEsc); }
    };
    document.addEventListener('keydown', handleEsc);
  }

  // ✅ 대기열 UI 업데이트
  function renderQueue() {
    const container = document.getElementById('ma-queue-container');
    const noQueueMsg = document.getElementById('ma-no-queue');
    const queueCountEl = document.getElementById('ma-queue-count');
    const shuffleBtn = document.getElementById('ma-shuffle-queue-btn');

    if (!container) return;

    if (queueCountEl) {
      queueCountEl.textContent = String(publishQueue.length);
    }

    // ✅ [2026-02-16] 셔플 버튼 표시/숨김
    if (shuffleBtn) {
      shuffleBtn.style.display = publishQueue.length >= 2 ? 'inline-flex' : 'none';
    }

    if (publishQueue.length === 0) {
      if (noQueueMsg) noQueueMsg.style.display = 'block';
      container.innerHTML = '';
      if (noQueueMsg) container.appendChild(noQueueMsg);
      return;
    }

    if (noQueueMsg) noQueueMsg.style.display = 'none';

    container.innerHTML = publishQueue.map((item, index) => {
      const sourceDisplay = item.sourceUrl ? `🔗 ${item.sourceUrl.substring(0, 30)}...` : `🔑 ${item.sourceKeyword}`;
      const toneEmoji = { friendly: '😊', professional: '💼', casual: '🎒', formal: '🎩', humorous: '😄', community_fan: '🔥', mom_cafe: '👩‍👧', storyteller: '📖', expert_review: '🔬', calm_info: '🍃' }[item.toneStyle] || '😊';
      const ctaBadge = item.ctaType === 'previous-post' ? '<span style="background: #3b82f6; color: white; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.65rem; margin-left: 0.25rem;">🔗이전글</span>' :
        item.ctaType === 'custom' ? '<span style="background: #8b5cf6; color: white; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.65rem; margin-left: 0.25rem;">✏️CTA</span>' : '';
      // ✅ [2026-02-08] 예약/임시 배지 표시
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

    // ✅ 수정 버튼 이벤트
    container.querySelectorAll('.ma-queue-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const queueId = (e.currentTarget as HTMLElement).dataset.queueId;
        if (!queueId) return;
        const item = publishQueue.find(q => q.id === queueId);
        if (!item) return;

        // 수정 모드로 풀오토 세팅 모달 열기
        (window as any).currentEditingQueueId = queueId;
        openFullautoSettingModal(item.accountId, item.accountName);

        // 모달 내 입력 필드에 기존 값 프리필
        setTimeout(() => {
          const urlInput = document.getElementById('ma-setting-url') as HTMLTextAreaElement;
          const keywordInput = document.getElementById('ma-setting-keyword') as HTMLTextAreaElement;
          const toneSelect = document.getElementById('ma-setting-tone') as HTMLSelectElement;
          const ctaTypeSelect = document.getElementById('ma-setting-cta-type') as HTMLSelectElement;
          const ctaUrlInput = document.getElementById('ma-setting-cta-url') as HTMLInputElement;
          const ctaTextInput = document.getElementById('ma-setting-cta-text') as HTMLInputElement;

          if (urlInput && item.sourceUrl) urlInput.value = item.sourceUrl;
          if (keywordInput && item.sourceKeyword) keywordInput.value = item.sourceKeyword;
          if (toneSelect && item.toneStyle) toneSelect.value = item.toneStyle;
          if (ctaTypeSelect && item.ctaType) ctaTypeSelect.value = item.ctaType;
          if (ctaUrlInput && item.ctaUrl) ctaUrlInput.value = item.ctaUrl;
          if (ctaTextInput && item.ctaText) ctaTextInput.value = item.ctaText;

          // 발행 모드 라디오
          if (item.publishMode) {
            // ✅ [2026-03-12 FIX] schedule 모드도 그대로 보존 (기존: schedule → publish 변환 버그)
            const radio = document.querySelector(`input[name="ma-setting-publish-mode"][value="${item.publishMode}"]`) as HTMLInputElement;
            if (radio) radio.checked = true;
          }

          // "대기열에 추가" 버튼 텍스트 변경
          const addBtn = document.getElementById('ma-add-to-queue-btn');
          if (addBtn) {
            addBtn.innerHTML = '✏️ 수정 완료 (대기열에 추가)';
          }

          console.log(`[Queue] 수정 모드 진입: ${queueId}, 계정: ${item.accountName}`);
        }, 100);
      });
    });

    // 삭제 버튼 이벤트
    container.querySelectorAll('.ma-queue-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const queueId = (e.currentTarget as HTMLElement).dataset.queueId;
        if (queueId) {
          publishQueue = publishQueue.filter(item => item.id !== queueId);
          renderQueue();
        }
      });
    });
  }

  // ✅ 풀오토 세팅 모달 열기
  function openFullautoSettingModal(accountId: string, accountName: string) {
    const modal = document.getElementById('ma-fullauto-setting-modal');
    if (!modal) return;

    // 계정 설정(잡블로그 여부 등) 캐시
    try {
      (modal as HTMLElement).dataset.isJabBlog = '0';
      (window.api as any).getAllBlogAccounts?.().then((res: any) => {
        const acc = res?.accounts?.find((a: any) => String(a?.id || '') === String(accountId || ''));
        const isJab = acc?.settings?.isJabBlog === true;
        try {
          (modal as HTMLElement).dataset.isJabBlog = isJab ? '1' : '0';
        } catch (e) {
          console.warn('[multiAccountManager] catch ignored:', e);
        }
      }).catch((e) => {
        console.warn('[multiAccountManager] promise catch ignored:', e);
      });
    } catch (e) {
      console.warn('[multiAccountManager] catch ignored:', e);
    }

    // 계정 정보 설정
    const accountIdInput = document.getElementById('ma-setting-account-id') as HTMLInputElement;
    const accountNameEl = document.getElementById('ma-setting-account-name');

    if (accountIdInput) accountIdInput.value = accountId;
    if (accountNameEl) accountNameEl.textContent = `📌 ${accountName}`;

    // 입력 필드 초기화
    const urlInput = document.getElementById('ma-setting-url') as HTMLInputElement;
    const keywordInput = document.getElementById('ma-setting-keyword') as HTMLInputElement;
    const imageSourceSelect = document.getElementById('ma-setting-image-source') as HTMLSelectElement;
    const toneSelect = document.getElementById('ma-setting-tone') as HTMLSelectElement;
    const ctaTypeSelectInit = document.getElementById('ma-setting-cta-type') as HTMLSelectElement | null;
    const ctaUrlInputInit = document.getElementById('ma-setting-cta-url') as HTMLInputElement | null;
    const ctaTextInputInit = document.getElementById('ma-setting-cta-text') as HTMLInputElement | null;

    if (urlInput) urlInput.value = '';
    if (keywordInput) keywordInput.value = '';
    if (imageSourceSelect) {
      const currentUiSource = UnifiedDOMCache.getImageSource();
      imageSourceSelect.value = currentUiSource || 'nano-banana-pro';
    }
    if (toneSelect) toneSelect.value = 'friendly';
    if (ctaTypeSelectInit) ctaTypeSelectInit.value = 'none';
    if (ctaUrlInputInit) ctaUrlInputInit.value = '';
    if (ctaTextInputInit) ctaTextInputInit.value = '';

    // ✅ [2026-02-02 FIX] 이미지 설정 버튼 직접 이벤트 리스너 추가 (이벤트 위임 실패 대비)
    const imageSettingsBtn = document.getElementById('ma-open-image-settings-btn');
    if (imageSettingsBtn) {
      const newImgBtn = imageSettingsBtn.cloneNode(true) as HTMLButtonElement;
      imageSettingsBtn.parentNode?.replaceChild(newImgBtn, imageSettingsBtn);
      newImgBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[MA-ImageSettings] 🖼️ 이미지 설정 버튼 클릭됨 (직접 이벤트 리스너)');

        // 풀오토 설정 모달 임시 숨김 (z-index 충돌 방지)
        const maModal = document.getElementById('ma-fullauto-setting-modal');
        if (maModal && maModal.style.display !== 'none') {
          maModal.setAttribute('data-was-visible', 'true');
          maModal.style.visibility = 'hidden';
          console.log('[MA-ImageSettings] 임시 숨김: ma-fullauto-setting-modal');
        }

        // 이미지 설정 모달 열기
        if (typeof openHeadingImageModal === 'function') {
          openHeadingImageModal();
          console.log('[MA-ImageSettings] ✅ openHeadingImageModal 호출 완료');
        } else {
          console.error('[MA-ImageSettings] ❌ openHeadingImageModal 함수를 찾을 수 없습니다');
          toastManager.warning('이미지 설정 모달을 열 수 없습니다. 앱을 새로고침해주세요.');
        }
      });
      console.log('[MA-ImageSettings] ✅ 이미지 설정 버튼 이벤트 리스너 추가 완료');
    }

    // ✅ 콘텐츠 카테고리 버튼 이벤트 (카테고리 모달 열기)
    const categoryBtn = document.getElementById('ma-setting-open-category-btn');
    if (categoryBtn) {
      const newCatBtn = categoryBtn.cloneNode(true) as HTMLButtonElement;
      categoryBtn.parentNode?.replaceChild(newCatBtn, categoryBtn);
      newCatBtn.addEventListener('click', () => {
        // 기존 카테고리 모달 열기 함수 호출
        (window as any).openCategoryModalInSettingMode?.();
      });
    }

    // ✅ 블로그 카테고리 분석 버튼 이벤트
    const analyzeBtn = document.getElementById('ma-setting-analyze-category-btn');
    if (analyzeBtn) {
      const newAnalyzeBtn = analyzeBtn.cloneNode(true) as HTMLButtonElement;
      analyzeBtn.parentNode?.replaceChild(newAnalyzeBtn, analyzeBtn);

      newAnalyzeBtn.addEventListener('click', async () => {
        try {
          newAnalyzeBtn.disabled = true;
          newAnalyzeBtn.innerHTML = '⏳ 분석중...';

          const accResult = await window.api.getAllBlogAccounts();
          const account = accResult.accounts?.find((a: any) => String(a.id) === String(accountId));

          if (!(account as any)?.naverId) {
            toastManager.warning('계정 정보를 찾을 수 없습니다.');
            return;
          }

          const response = await (window.api as any).fetchBlogCategories({
            naverId: (account as any).naverId,
            naverPassword: (account as any).naverPassword
          });

          if (response.success && response.categories && response.categories.length > 0) {
            const realCatContainer = document.getElementById('ma-setting-real-category-container');
            const realCatSelect = document.getElementById('ma-setting-real-category') as HTMLSelectElement;

            if (realCatContainer && realCatSelect) {
              realCatSelect.innerHTML = response.categories.map((cat: any) =>
                `<option value="${cat.categoryNo || cat.id}">${cat.categoryName || cat.name}</option>`
              ).join('');
              realCatContainer.style.display = 'block';
            }

            toastManager.success(`✅ ${response.categories.length}개의 블로그 카테고리 분석 완료`);
          } else {
            toastManager.error(response.message || '카테고리 분석 실패');
          }
        } catch (err) {
          console.error('카테고리 분석 오류:', err);
          toastManager.error('분석 중 오류 발생');
        } finally {
          newAnalyzeBtn.disabled = false;
          newAnalyzeBtn.innerHTML = '<span>🔍</span> 블로그 카테고리 분석하기';
        }
      });
    }

    // 콘텐츠 모드 및 썸네일 텍스트 옵션 초기화 (HTML에 이미 존재함)
    const contentModeSelect = document.getElementById('ma-setting-content-mode') as HTMLSelectElement | null;
    if (contentModeSelect) contentModeSelect.value = 'seo';

    const thumbnailCheckbox = document.getElementById('ma-setting-include-thumbnail-text') as HTMLInputElement | null;
    if (thumbnailCheckbox) thumbnailCheckbox.checked = false;

    // AI 이미지 생성 옵션 (신규)
    const useAiImageCheck = document.getElementById('ma-setting-use-ai-image') as HTMLInputElement | null;
    if (useAiImageCheck) useAiImageCheck.checked = true;

    const createThumbnailCheck = document.getElementById('ma-setting-create-product-thumbnail') as HTMLInputElement | null;
    if (createThumbnailCheck) createThumbnailCheck.checked = false;

    // ✅ 발행 모드 초기화 (즉시/임시 라디오 — 예약은 예약 설정 탭에서 모달로 설정)
    const publishModePublish = document.querySelector('input[name="ma-setting-publish-mode"][value="publish"]') as HTMLInputElement | null;
    if (publishModePublish) publishModePublish.checked = true;

    // ✅ CTA 유형이 이전글이면 바로 모달로 선택하게 함 (URL 자동 입력)
    const ctaTypeSelect = document.getElementById('ma-setting-cta-type') as HTMLSelectElement | null;
    const ctaUrlInput = document.getElementById('ma-setting-cta-url') as HTMLInputElement | null;
    const ctaTextInput = document.getElementById('ma-setting-cta-text') as HTMLInputElement | null;
    const categorySelectForCta = document.getElementById('ma-setting-category') as HTMLSelectElement | null;

    // 수동으로 모달 열어 변경할 버튼
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
          const posts = (postsAll || []).filter((p: any) => String(p?.publishedUrl || '').trim().length > 0);
          if (posts.length === 0) {
            toastManager.warning('발행된 이전 글이 없습니다. 먼저 글을 발행한 뒤 다시 시도하세요.');
            return;
          }
          const catKey = String(categorySelectForCta?.value || '').trim();
          showPostSelectionModal(posts, (selectedPost) => {
            if (!selectedPost) return;
            const url = String(selectedPost.publishedUrl || '').trim();
            if (ctaUrlInput && url) ctaUrlInput.value = url;
            if (ctaTextInput && selectedPost.title) ctaTextInput.value = `📖 ${selectedPost.title}`;
          }, { defaultCategory: catKey || undefined });
        });
        ctaUrlInput.parentElement.appendChild(btn);
      }
    } catch (e) {
      console.warn('[multiAccountManager] catch ignored:', e);
    }

    if (ctaTypeSelect && !ctaTypeSelect.hasAttribute('data-listener-added')) {
      ctaTypeSelect.setAttribute('data-listener-added', 'true');
      ctaTypeSelect.addEventListener('change', () => {
        const v = String(ctaTypeSelect.value || '').trim();
        if (v !== 'previous-post') return;

        const isJabBlog = String((modal as any)?.dataset?.isJabBlog || '0') === '1';
        const catKey = String(categorySelectForCta?.value || '').trim();
        const postsAll = loadGeneratedPosts();
        const published = (postsAll || []).filter((p: any) => String(p?.publishedUrl || '').trim().length > 0);
        if (published.length === 0) {
          toastManager.warning('발행된 이전 글이 없습니다. 먼저 글을 발행한 뒤 다시 시도하세요.');
          return;
        }

        // ✅ 잡블로그가 아니면 같은 카테고리 최신 발행글을 자동으로 세팅
        if (!isJabBlog && catKey) {
          const candidates = published.filter((p: any) => String(p?.category || '').trim() === catKey);
          if (candidates.length > 0) {
            candidates.sort((a: any, b: any) => {
              const aT = new Date(a.publishedAt || a.updatedAt || a.createdAt || 0).getTime();
              const bT = new Date(b.publishedAt || b.updatedAt || b.createdAt || 0).getTime();
              return bT - aT;
            });
            const chosen = candidates[0];
            const url = String(chosen?.publishedUrl || '').trim();
            if (ctaUrlInput && url) ctaUrlInput.value = url;
            if (ctaTextInput && chosen?.title) ctaTextInput.value = `📖 ${chosen.title}`;
            toastManager.success('✅ 같은 카테고리의 최신 발행글이 자동으로 연결되었습니다.');
            return;
          }
        }

        // 폴백: 모달로 직접 선택 (카테고리 기본값 적용)
        showPostSelectionModal(published, (selectedPost) => {
          if (!selectedPost) return;
          const url = String(selectedPost.publishedUrl || '').trim();
          if (ctaUrlInput && url) ctaUrlInput.value = url;
          if (ctaTextInput && selectedPost.title) ctaTextInput.value = `📖 ${selectedPost.title}`;
        }, { defaultCategory: catKey || undefined });
      });
    }

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }

  // ✅ 풀오토 세팅 모달 닫기
  document.querySelector('[data-close-fullauto-setting]')?.addEventListener('click', () => {
    const modal = document.getElementById('ma-fullauto-setting-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    // ✅ [2026-03-11 FIX] 수정 모드 해제 (X 버튼으로 닫을 때 초기화 누락 → '수정 중입니다' 경고 잔존 방지)
    (window as any).currentEditingQueueId = null;
    const addBtn = document.getElementById('ma-add-to-queue-btn');
    if (addBtn) addBtn.innerHTML = '+ 대기열에 추가';
  });

  // ✅ [2026-02-14] 다중계정 키워드 제목 체크박스 상호 배타 설정
  setupMutualExclusiveCheckboxes('ma-setting-keyword-as-title', 'ma-setting-keyword-title-prefix');

  // ✅ 대기열에 추가 버튼 (여러 URL/키워드 줄바꿈 지원)
  document.getElementById('ma-add-to-queue-btn')?.addEventListener('click', () => {
    const accountId = (document.getElementById('ma-setting-account-id') as HTMLInputElement)?.value;
    const accountNameEl = document.getElementById('ma-setting-account-name');
    const accountName = accountNameEl?.textContent?.replace('📌 ', '') || '';

    // ✅ textarea에서 여러 줄 읽기
    const urlText = (document.getElementById('ma-setting-url') as HTMLTextAreaElement)?.value || '';
    const keywordText = (document.getElementById('ma-setting-keyword') as HTMLTextAreaElement)?.value || '';

    // 줄바꿈으로 분리하고 빈 줄 제거
    const urls = urlText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    const keywords = keywordText.split('\n').map(s => s.trim()).filter(s => s.length > 0);

    // ✅ [2026-02-03 FIX] 메인 풀오토 이미지 설정에서 imageSource 가져오기 (기존 HTML 요소는 존재하지 않음)
    const imageSource = getFullAutoImageSource();
    const toneStyle = (document.getElementById('ma-setting-tone') as HTMLSelectElement)?.value || 'friendly';
    const category = String((document.getElementById('ma-setting-category') as HTMLSelectElement | null)?.value || '').trim() || 'general';
    // ✅ [2026-02-09 FIX] 실제 블로그 카테고리(폴더) 이름 가져오기
    const realCatSelect = document.getElementById('ma-setting-real-category') as HTMLSelectElement | null;
    const realCategoryName = (realCatSelect?.options && realCatSelect.selectedIndex >= 0)
      ? realCatSelect.options[realCatSelect.selectedIndex]?.text || ''
      : '';
    const contentMode = ((document.getElementById('ma-setting-content-mode') as HTMLSelectElement | null)?.value || 'seo') as 'seo' | 'homefeed' | 'affiliate';
    const ctaType = (document.getElementById('ma-setting-cta-type') as HTMLSelectElement)?.value as 'none' | 'previous-post' | 'custom' || 'none';
    const ctaUrl = (document.getElementById('ma-setting-cta-url') as HTMLInputElement)?.value?.trim() || '';
    const ctaText = (document.getElementById('ma-setting-cta-text') as HTMLInputElement)?.value?.trim() || '';
    const includeThumbnailText = (document.getElementById('ma-setting-include-thumbnail-text') as HTMLInputElement | null)?.checked || false;
    const useAiImage = (document.getElementById('ma-setting-use-ai-image') as HTMLInputElement | null)?.checked ?? true;
    const createProductThumbnail = (document.getElementById('ma-setting-create-product-thumbnail') as HTMLInputElement | null)?.checked ?? false;
    // ✅ [2026-02-14] 키워드 제목 옵션
    const keywordAsTitle = (document.getElementById('ma-setting-keyword-as-title') as HTMLInputElement | null)?.checked || false;
    const keywordTitlePrefix = (document.getElementById('ma-setting-keyword-title-prefix') as HTMLInputElement | null)?.checked || false;

    // ✅ [2026-01-20] 쇼핑커넥트 전용 옵션 수집 (기본설정 탭 또는 쇼핑커넥트 서브탭에서)
    const affiliateLink = contentMode === 'affiliate'
      ? ((document.getElementById('ma-shopping-affiliate-link') as HTMLInputElement)?.value?.trim() ||
        (document.getElementById('ma-setting-affiliate-link') as HTMLInputElement)?.value?.trim() || '')
      : undefined;
    const videoOption = contentMode === 'affiliate'
      ? ((document.getElementById('ma-shopping-video-option') as HTMLInputElement)?.checked ||
        (document.getElementById('ma-setting-video-option') as HTMLInputElement)?.checked || false)
      : undefined;

    // ✅ [2026-03-12 FIX] 발행 모드 — draft/publish/schedule 3가지 모두 보존
    const publishModeRadioVal = (document.querySelector('input[name="ma-setting-publish-mode"]:checked') as HTMLInputElement)?.value;
    const publishMode: 'draft' | 'publish' | 'schedule' = publishModeRadioVal === 'draft' ? 'draft' : publishModeRadioVal === 'schedule' ? 'schedule' : 'publish';
    // ✅ [2026-03-12 FIX] schedule 모드 시 날짜/시간을 UI에서 읽기 (큐에 추가 후 ⏰로 개별 설정도 가능)
    const scheduleDate: string | undefined = publishMode === 'schedule'
      ? ((document.getElementById('ma-setting-schedule-date') as HTMLInputElement)?.value || undefined)
      : undefined;
    const scheduleTime: string | undefined = publishMode === 'schedule'
      ? ((document.getElementById('ma-setting-schedule-time') as HTMLInputElement)?.value || undefined)
      : undefined;
    const scheduleType: 'app-schedule' | 'naver-server' | undefined = publishMode === 'schedule' ? 'naver-server' : undefined;
    const scheduleInterval: number | undefined = undefined;
    console.log(`[🔍 DIAG-1 큐생성] publishModeRadioVal=${publishModeRadioVal}, publishMode=${publishMode}, scheduleDate=${scheduleDate}, scheduleTime=${scheduleTime}`);

    // ✅ URL 우선, 없으면 키워드 사용
    const items: { url: string; keyword: string }[] = [];

    if (urls.length > 0) {
      urls.forEach(url => items.push({ url, keyword: '' }));
    } else if (keywords.length > 0) {
      keywords.forEach(keyword => items.push({ url: '', keyword }));
    }

    if (items.length === 0) {
      toastManager.warning('URL 또는 키워드를 입력해주세요.');
      return;
    }

    // ✅ [수정 모드] 기존 아이템 교체 vs 새 아이템 추가
    let addedCount = 0;
    const presetThumbnails = (window as any).presetThumbnails || {};
    const manualThumbnailForQueue = presetThumbnails['ma-full-auto'] || presetThumbnails['ma-semi-auto'] || null;
    const editingQueueId = (window as any).currentEditingQueueId;

    if (editingQueueId) {
      // 수정 모드: 첫 번째 아이템만 사용하여 기존 항목 교체
      const { url, keyword } = items[0];
      // ✅ [2026-03-11 FIX] 기존 큐 아이템의 예약 정보를 보존 (schedule→publish 덮어쓰기 방지)
      const existingItem = publishQueue.find(q => q.id === editingQueueId);
      const updatedItem: QueueItem = {
        id: editingQueueId,
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
        // ✅ [2026-03-11 FIX] 기존 예약 정보 보존: existingItem의 publishMode가 'schedule'이면 유지
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
      };

      const idx = publishQueue.findIndex(q => q.id === editingQueueId);
      if (idx !== -1) {
        publishQueue[idx] = updatedItem;
      } else {
        publishQueue.push(updatedItem);
      }
      addedCount = 1;

      // 수정 모드 해제
      (window as any).currentEditingQueueId = null;
      const addBtn = document.getElementById('ma-add-to-queue-btn');
      if (addBtn) addBtn.innerHTML = '+ \uB300\uAE30\uC5F4\uC5D0 \uCD94\uAC00';
    } else {
      // 새 아이템 추가 모드 (기존 로직)
      items.forEach(({ url, keyword }) => {
        const queueItem: QueueItem = {
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
        };

        publishQueue.push(queueItem);
        addedCount++;
      });
    }

    renderQueue();

    // 모달 닫기
    const modal = document.getElementById('ma-fullauto-setting-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }

    // ✅ [2026-03-11 FIX] 수정 모드 해제 및 버튼 텍스트 초기화
    (window as any).currentEditingQueueId = null;
    const addBtnReset = document.getElementById('ma-add-to-queue-btn');
    if (addBtnReset) addBtnReset.innerHTML = '+ 대기열에 추가';

    // ✅ 입력 필드 초기화
    (document.getElementById('ma-setting-url') as HTMLTextAreaElement).value = '';
    (document.getElementById('ma-setting-keyword') as HTMLTextAreaElement).value = '';

    if (addedCount === 1) {
      toastManager.success(`${accountName} 계정이 대기열에 추가되었습니다.`);
    } else {
      toastManager.success(`${accountName} 계정에서 ${addedCount}개 항목이 대기열에 추가되었습니다.`);
    }

    // ✅ [2026-01-22] 대기열 추가 후 수동 썸네일 자동 초기화
    // 다음 대기열 항목을 위해 깔끔하게 리셋
    if (typeof (window as any).clearManualThumbnail === 'function') {
      (window as any).clearManualThumbnail();
      console.log('[Queue] 수동 썸네일 초기화 완료');
    }

    // presetThumbnails도 초기화
    if ((window as any).presetThumbnails) {
      (window as any).presetThumbnails = {
        'image-tab': null,
        'full-auto': null,
        'continuous': null,
        'ma-semi-auto': null,
        'ma-full-auto': null
      };
      console.log('[Queue] presetThumbnails 초기화 완료');
    }
  });

  // ✅ [2026-01-20] 콘텐츠 모드 변경 시 쇼핑커넥트 설정 표시/숨김
  document.getElementById('ma-setting-content-mode')?.addEventListener('change', (e) => {
    const mode = (e.target as HTMLSelectElement).value;
    const shoppingSettings = document.getElementById('ma-shopping-connect-settings');
    if (shoppingSettings) {
      shoppingSettings.style.display = mode === 'affiliate' ? 'block' : 'none';
    }
  });

  // ✅ [2026-01-20] 썸네일 커스터마이징 버튼
  document.getElementById('ma-setting-goto-thumbnail-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('ma-fullauto-setting-modal');
    if (modal) modal.style.display = 'none';
    // ✅ [2026-03-11 FIX] 수정 모드 해제
    (window as any).currentEditingQueueId = null;

    const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
    if (imageToolsTab) {
      imageToolsTab.click();
      setTimeout(() => {
        const thumbnailSubtab = document.querySelector('[data-subtab="thumbnail"]') as HTMLElement;
        if (thumbnailSubtab) {
          thumbnailSubtab.click();
          toastManager.info('🎨 썸네일 커스터마이징 화면입니다. 설정 후 풀오토 세팅으로 돌아가세요.');
        }
      }, 150);
    }
  });

  // ✅ [2026-01-20] 배너 커스터마이징 버튼  
  document.getElementById('ma-setting-goto-banner-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('ma-fullauto-setting-modal');
    if (modal) modal.style.display = 'none';
    // ✅ [2026-03-11 FIX] 수정 모드 해제
    (window as any).currentEditingQueueId = null;

    const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
    if (imageToolsTab) {
      imageToolsTab.click();
      setTimeout(() => {
        const bannerSubtab = document.querySelector('[data-subtab="shopping-banner"]') as HTMLElement;
        if (bannerSubtab) {
          bannerSubtab.click();
          toastManager.info('🎨 배너 커스터마이징 화면입니다.');
        }
      }, 150);
    }
  });

  // ✅ 대기열 전체 삭제
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

  // ✅ [2026-02-16] 대기열 순서 셔플 (Fisher-Yates)
  document.getElementById('ma-shuffle-queue-btn')?.addEventListener('click', () => {
    if (publishQueue.length < 2) {
      toastManager.info('셔플하려면 2개 이상의 항목이 필요합니다.');
      return;
    }
    // Fisher-Yates shuffle
    for (let i = publishQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [publishQueue[i], publishQueue[j]] = [publishQueue[j], publishQueue[i]];
    }
    renderQueue();
    toastManager.success(`🔀 대기열 ${publishQueue.length}개 항목 순서가 랜덤으로 섞였습니다!`);
  });

  // ✅ [2026-01-20] 풀오토 모달 서브탭 전환
  document.querySelectorAll('.ma-modal-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = (btn as HTMLElement).dataset.subtab;
      if (!subtab) return;

      // 모든 탭 버튼 비활성화
      document.querySelectorAll('.ma-modal-subtab-btn').forEach(b => {
        (b as HTMLElement).style.borderBottom = '3px solid transparent';
        (b as HTMLElement).style.color = 'var(--text-muted)';
        b.classList.remove('active');
      });

      // 클릭된 탭 버튼 활성화
      (btn as HTMLElement).style.borderBottom = '3px solid #10b981';
      (btn as HTMLElement).style.color = '#10b981';
      btn.classList.add('active');

      // 모든 탭 콘텐츠 숨김
      document.querySelectorAll('.ma-modal-subtab-content').forEach(content => {
        (content as HTMLElement).style.display = 'none';
      });

      // 선택된 탭 콘텐츠 표시
      const contentId = `ma-modal-subtab-${subtab}-content`;
      const content = document.getElementById(contentId);
      if (content) content.style.display = 'block';

      // ✅ [2026-03-11 FIX] 예약 설정 탭 전환 시 큐 상태 자동 갱신
      if (subtab === 'schedule') {
        updateMAScheduleStatusSummary();
      }
    });
  });

  // ✅ [2026-03-12] 발행 모드 라디오 변경 → 예약 선택 시 자동으로 예약 서브탭 전환
  document.querySelectorAll('input[name="ma-setting-publish-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const value = (e.target as HTMLInputElement).value;
      if (value === 'schedule') {
        // 예약 서브탭으로 자동 전환
        const scheduleTabBtn = document.querySelector('.ma-modal-subtab-btn[data-subtab="schedule"]') as HTMLElement;
        if (scheduleTabBtn) scheduleTabBtn.click();
      }
    });
  });

  // ✅ [2026-02-08] 예약 설정 서브탭 - 랜덤 예약 배분 모달 열기
  document.getElementById('ma-open-random-schedule-btn')?.addEventListener('click', () => {
    showMARandomScheduleModal();
  });

  // ✅ [2026-02-08] 예약 설정 서브탭 - 개별 예약 설정 모달 열기
  document.getElementById('ma-open-individual-schedule-btn')?.addEventListener('click', () => {
    showMAIndividualScheduleModal();
  });

  // 예약 상태 요약 업데이트
  updateMAScheduleStatusSummary();

  // ✅ [2026-01-20] 쇼핑커넥트 탭의 썸네일/배너 버튼 (모달 닫기 포함)
  // ✅ [2026-01-27] multi-account-modal도 함께 닫기 추가
  document.getElementById('ma-shopping-goto-thumbnail-btn')?.addEventListener('click', () => {
    // 모든 관련 모달 닫기
    const modalsToClose = ['ma-fullauto-setting-modal', 'multi-account-modal'];
    modalsToClose.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      }
    });
    // ✅ [2026-03-11 FIX] 수정 모드 해제
    (window as any).currentEditingQueueId = null;

    const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
    if (imageToolsTab) {
      imageToolsTab.click();
      setTimeout(() => {
        const thumbnailSubtab = document.querySelector('[data-subtab="thumbnail"]') as HTMLElement;
        if (thumbnailSubtab) {
          thumbnailSubtab.click();
          toastManager.info('🎨 썸네일 커스터마이징 화면입니다. 설정 후 풀오토 세팅으로 돌아가세요.');
        }
      }, 150);
    }
  });

  document.getElementById('ma-shopping-goto-banner-btn')?.addEventListener('click', () => {
    // 모든 관련 모달 닫기
    const modalsToClose = ['ma-fullauto-setting-modal', 'multi-account-modal'];
    modalsToClose.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      }
    });
    // ✅ [2026-03-11 FIX] 수정 모드 해제
    (window as any).currentEditingQueueId = null;

    const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
    if (imageToolsTab) {
      imageToolsTab.click();
      setTimeout(() => {
        const bannerSubtab = document.querySelector('[data-subtab="shopping-banner"]') as HTMLElement;
        if (bannerSubtab) {
          bannerSubtab.click();
          toastManager.info('🎨 배너 커스터마이징 화면입니다.');
        }
      }, 150);
    }
  });

  // ✅ [2026-01-20] 풀오토 이전글 선택 버튼
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

      const listContainer = modal.querySelector('#ma-prev-post-list-container')!;
      listContainer.innerHTML = '<div style="color: var(--text-muted);">저장된 글 목록을 불러오는 중...</div>';

      const allPosts = loadGeneratedPosts();
      const publishedPosts = allPosts.filter((p: any) => p.publishedUrl && p.publishedUrl.trim());

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
          ${postsToShow.slice(0, 20).map((p: any) => `
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
          const url = (row as HTMLElement).dataset.url || '';
          const title = (row as HTMLElement).dataset.title || '';

          const ctaUrlInput = document.getElementById('ma-setting-cta-url') as HTMLInputElement;
          const ctaTextInput = document.getElementById('ma-setting-cta-text') as HTMLInputElement;
          const ctaTypeSelect = document.getElementById('ma-setting-cta-type') as HTMLSelectElement;

          if (ctaUrlInput) ctaUrlInput.value = url;
          if (ctaTextInput) ctaTextInput.value = `이전 글: ${title}`;
          if (ctaTypeSelect) ctaTypeSelect.value = 'previous-post';

          toastManager.success('이전 글 링크가 CTA 설정에 반영되었습니다.');
          closeModal();
        });
      });

    } catch (error) {
      console.error('ma-setting-select-prevpost-btn Error:', error);
      toastManager.error('포스팅 목록을 불러오는데 실패했습니다.');
    }
  });

  // 선택된 계정 수 업데이트 (더 이상 사용하지 않지만 호환성 유지)
  function updateSelectedCount() {
    const countEl = document.getElementById('ma-selected-count');
    if (countEl) {
      countEl.textContent = `${selectedAccountIds.length}개`;
    }
  }

  // 계정 편집 모달 열기
  async function openAccountEditModal(accountId?: string) {
    if (!accountEditModal) return;

    const titleEl = document.getElementById('ma-edit-title');
    const accountIdInput = document.getElementById('ma-edit-account-id') as HTMLInputElement;
    const nameInput = document.getElementById('ma-edit-name') as HTMLInputElement;
    const blogIdInput = document.getElementById('ma-edit-blog-id') as HTMLInputElement;
    const naverIdInput = document.getElementById('ma-edit-naver-id') as HTMLInputElement;
    const naverPwInput = document.getElementById('ma-edit-naver-pw') as HTMLInputElement;
    const isJabBlogCheckbox = document.getElementById('ma-edit-is-jabblog') as HTMLInputElement;
    const dailyLimitInput = document.getElementById('ma-edit-daily-limit') as HTMLInputElement;
    const imageSourceSelect = document.getElementById('ma-edit-image-source') as HTMLSelectElement;
    const toneSelect = document.getElementById('ma-edit-tone-style') as HTMLSelectElement;
    const publishModeSelect = document.getElementById('ma-edit-publish-mode') as HTMLSelectElement;
    const autoRotateCheckbox = document.getElementById('ma-edit-auto-rotate') as HTMLInputElement;

    // 키워드/URL은 세팅하기 패널에서 설정하므로 여기서는 사용하지 않음

    // ✅ 삭제 버튼 참조
    const deleteAccountBtn = document.getElementById('ma-delete-account-btn') as HTMLButtonElement;

    if (accountId) {
      // 편집 모드
      if (titleEl) titleEl.textContent = '계정 설정 편집';
      // ✅ 편집 모드에서 삭제 버튼 표시
      if (deleteAccountBtn) deleteAccountBtn.style.display = 'inline-block';

      const result = await window.api.getAllBlogAccounts();
      const account = result.accounts?.find((a: any) => a.id === accountId);

      if (account) {
        if (accountIdInput) accountIdInput.value = accountId;
        if (nameInput) nameInput.value = account.name || '';
        if (blogIdInput) blogIdInput.value = account.blogId || account.name || '';

        if (isJabBlogCheckbox) isJabBlogCheckbox.checked = account.settings?.isJabBlog === true;

        // 로그인 정보 가져오기
        const credResult = await window.api.getAccountCredentials(accountId);
        if (credResult.success && credResult.credentials) {
          if (naverIdInput) naverIdInput.value = credResult.credentials.naverId || '';
          if (naverPwInput) naverPwInput.value = credResult.credentials.naverPassword || '';
        }

        if (dailyLimitInput) dailyLimitInput.value = String(account.settings?.dailyLimit || 5);
        if (imageSourceSelect) imageSourceSelect.value = account.settings?.imageSource || 'gemini';
        if (toneSelect) toneSelect.value = account.settings?.toneStyle || 'friendly';
        if (publishModeSelect) publishModeSelect.value = account.settings?.publishMode || 'publish';
        if (autoRotateCheckbox) autoRotateCheckbox.checked = account.settings?.autoRotate !== false;

        // ✅ 카테고리/키워드 설정 로드
        const categorySelect = document.getElementById('ma-edit-category') as HTMLSelectElement;
        const keywordsTextarea = document.getElementById('ma-edit-keywords') as HTMLTextAreaElement;
        if (categorySelect) categorySelect.value = account.settings?.category || '';
        if (keywordsTextarea) {
          // keywords 배열을 쉼표로 구분된 문자열로 변환
          const keywordsArray = account.settings?.keywords || [];
          keywordsTextarea.value = keywordsArray.join(', ');
        }

        // ✅ 프록시 설정 로드
        const proxyHostInput = document.getElementById('ma-edit-proxy-host') as HTMLInputElement;
        const proxyPortInput = document.getElementById('ma-edit-proxy-port') as HTMLInputElement;
        const proxyUsernameInput = document.getElementById('ma-edit-proxy-username') as HTMLInputElement;
        const proxyPasswordInput = document.getElementById('ma-edit-proxy-password') as HTMLInputElement;
        if (proxyHostInput) proxyHostInput.value = account.settings?.proxyHost || '';
        if (proxyPortInput) proxyPortInput.value = account.settings?.proxyPort || '';
        if (proxyUsernameInput) proxyUsernameInput.value = account.settings?.proxyUsername || '';
        if (proxyPasswordInput) proxyPasswordInput.value = account.settings?.proxyPassword || '';

        // ✅ [2026-03-27] 프록시 자동 세팅 버튼 바인딩 (편집 모드)
        const autoProxyBtn = document.getElementById('ma-auto-proxy-btn');
        if (autoProxyBtn) {
          autoProxyBtn.onclick = async () => {
            const nid = naverIdInput?.value?.trim() || account.naverId || account.blogId;
            if (!nid) { toastManager.warning('네이버 ID가 없어 프록시를 생성할 수 없습니다.'); return; }
            const result = await (window.api as any).generateStickyProxy(nid);
            if (result.success && result.proxy) {
              if (proxyHostInput) proxyHostInput.value = result.proxy.host;
              if (proxyPortInput) proxyPortInput.value = result.proxy.port;
              if (proxyUsernameInput) proxyUsernameInput.value = result.proxy.username;
              if (proxyPasswordInput) proxyPasswordInput.value = result.proxy.password;
              toastManager.success(`✅ Sticky 프록시 자동 생성 완료! 하단 저장 버튼을 눌러주세요.`);
            } else { toastManager.error(result.message || '프록시 생성 실패'); }
          };
        }
      }

      // ✅ 편집 모드에서는 네이버 아이디 수정 불가 (readonly 적용)
      if (naverIdInput) {
        naverIdInput.readOnly = true;
        naverIdInput.style.background = 'var(--bg-tertiary)';
        naverIdInput.style.color = 'var(--text-muted)';
      }
    } else {
      // 추가 모드
      if (titleEl) titleEl.textContent = '새 계정 추가';
      // ✅ 추가 모드에서 삭제 버튼 숨김
      if (deleteAccountBtn) deleteAccountBtn.style.display = 'none';
      if (accountIdInput) accountIdInput.value = '';
      if (nameInput) nameInput.value = '';
      if (blogIdInput) blogIdInput.value = '';
      if (naverIdInput) {
        naverIdInput.value = '';
        // ✅ 추가 모드에서는 네이버 아이디 입력 가능 (readonly 해제)
        naverIdInput.readOnly = false;
        naverIdInput.style.background = 'var(--bg-secondary)';
        naverIdInput.style.color = 'var(--text-strong)';
      }
      if (naverPwInput) naverPwInput.value = '';
      if (isJabBlogCheckbox) isJabBlogCheckbox.checked = false;
      if (dailyLimitInput) dailyLimitInput.value = '5';
      if (imageSourceSelect) imageSourceSelect.value = 'gemini';
      if (toneSelect) toneSelect.value = 'friendly';
      if (publishModeSelect) publishModeSelect.value = 'publish';
      if (autoRotateCheckbox) autoRotateCheckbox.checked = true;

      // ✅ 카테고리/키워드 초기화
      const categorySelect = document.getElementById('ma-edit-category') as HTMLSelectElement;
      const keywordsTextarea = document.getElementById('ma-edit-keywords') as HTMLTextAreaElement;
      if (categorySelect) categorySelect.value = '';
      if (keywordsTextarea) keywordsTextarea.value = '';

      // ✅ 프록시 설정 초기화
      const proxyHostInput = document.getElementById('ma-edit-proxy-host') as HTMLInputElement;
      const proxyPortInput = document.getElementById('ma-edit-proxy-port') as HTMLInputElement;
      const proxyUsernameInput = document.getElementById('ma-edit-proxy-username') as HTMLInputElement;
      const proxyPasswordInput = document.getElementById('ma-edit-proxy-password') as HTMLInputElement;
      if (proxyHostInput) proxyHostInput.value = '';
      if (proxyPortInput) proxyPortInput.value = '';
      if (proxyUsernameInput) proxyUsernameInput.value = '';
      if (proxyPasswordInput) proxyPasswordInput.value = '';

      // ✅ [2026-03-27] 프록시 자동 세팅 버튼 바인딩 (추가 모드)
      const autoProxyBtn = document.getElementById('ma-auto-proxy-btn');
      if (autoProxyBtn) {
        autoProxyBtn.onclick = async () => {
          const nid = naverIdInput?.value?.trim();
          if (!nid) { toastManager.warning('네이버 ID를 먼저 입력해주세요.'); return; }
          const result = await (window.api as any).generateStickyProxy(nid);
          if (result.success && result.proxy) {
            if (proxyHostInput) proxyHostInput.value = result.proxy.host;
            if (proxyPortInput) proxyPortInput.value = result.proxy.port;
            if (proxyUsernameInput) proxyUsernameInput.value = result.proxy.username;
            if (proxyPasswordInput) proxyPasswordInput.value = result.proxy.password;
            toastManager.success(`✅ Sticky 프록시 자동 생성 완료! 하단 저장 버튼을 눌러주세요.`);
          } else { toastManager.error(result.message || '프록시 생성 실패'); }
        };
      }
    }

    accountEditModal.style.display = 'flex';
    accountEditModal.setAttribute('aria-hidden', 'false');
  }

  // ✅ 전역으로 openAccountEditModal 함수 노출 (발행 계정 선택에서도 사용)
  (window as any).openAccountEditModal = openAccountEditModal;

  // ✅ 전역으로 renderMultiAccountList 함수 노출 (계정 목록 새로고침용)
  (window as any).renderMultiAccountList = renderMultiAccountList;

  // ✅ 글로벌 계정 목록 새로고침 함수 (1개 계정 탭 + 다중계정 탭 모두 동기화)
  (window as any).refreshAllAccountLists = async () => {
    console.log('[Account] 모든 계정 목록 새로고침');
    try {
      await renderMultiAccountList();
    } catch (e) {
      console.error('[Account] renderMultiAccountList 오류:', e);
    }
    // 인라인 계정 목록 새로고침 시도
    if (typeof (window as any).renderInlineAccountList === 'function') {
      try {
        await (window as any).renderInlineAccountList();
      } catch (e) {
        console.error('[Account] renderInlineAccountList 오류:', e);
      }
    }
    // 1개 계정 탭 드롭다운 새로고침 시도
    if (typeof (window as any).loadMainAccountList === 'function') {
      try {
        await (window as any).loadMainAccountList();
      } catch (e) {
        console.error('[Account] loadMainAccountList 오류:', e);
      }
    }
  };

  // 계정 추가 버튼
  document.getElementById('ma-add-account-btn')?.addEventListener('click', () => {
    openAccountEditModal();
  });

  // 계정 저장 버튼
  document.getElementById('ma-save-account-btn')?.addEventListener('click', async () => {
    const accountIdInput = document.getElementById('ma-edit-account-id') as HTMLInputElement;
    const nameInput = document.getElementById('ma-edit-name') as HTMLInputElement;
    const blogIdInput = document.getElementById('ma-edit-blog-id') as HTMLInputElement;
    const naverIdInput = document.getElementById('ma-edit-naver-id') as HTMLInputElement;
    const naverPwInput = document.getElementById('ma-edit-naver-pw') as HTMLInputElement;
    const isJabBlogCheckbox = document.getElementById('ma-edit-is-jabblog') as HTMLInputElement;
    const dailyLimitInput = document.getElementById('ma-edit-daily-limit') as HTMLInputElement;
    const imageSourceSelect = document.getElementById('ma-edit-image-source') as HTMLSelectElement;
    const toneSelect = document.getElementById('ma-edit-tone-style') as HTMLSelectElement;
    const publishModeSelect = document.getElementById('ma-edit-publish-mode') as HTMLSelectElement;
    const autoRotateCheckbox = document.getElementById('ma-edit-auto-rotate') as HTMLInputElement;

    const accountId = accountIdInput?.value;
    const name = nameInput?.value.trim();
    const blogId = blogIdInput?.value.trim() || name; // blogId가 없으면 name 사용
    const naverId = naverIdInput?.value.trim();
    const naverPw = naverPwInput?.value;

    if (!name || !naverId || !naverPw) {
      toastManager.warning('필수 항목(별명, 네이버 ID, 비밀번호)을 모두 입력해주세요.');
      return;
    }

    const settings: any = {
      dailyLimit: parseInt(dailyLimitInput?.value || '5'),
      imageSource: imageSourceSelect?.value || getFullAutoImageSource(),
      toneStyle: toneSelect?.value || 'friendly',
      publishMode: publishModeSelect?.value || 'publish',
      autoRotate: autoRotateCheckbox?.checked !== false,
      isJabBlog: isJabBlogCheckbox?.checked === true,
      // ✅ 계정별 프록시 설정
      proxyHost: (document.getElementById('ma-edit-proxy-host') as HTMLInputElement)?.value?.trim() || undefined,
      proxyPort: (document.getElementById('ma-edit-proxy-port') as HTMLInputElement)?.value?.trim() || undefined,
      proxyUsername: (document.getElementById('ma-edit-proxy-username') as HTMLInputElement)?.value?.trim() || undefined,
      proxyPassword: (document.getElementById('ma-edit-proxy-password') as HTMLInputElement)?.value?.trim() || undefined,
    };

    try {
      if (accountId) {
        // 기존 계정 업데이트
        await window.api.updateBlogAccount(accountId, { name, blogId });
        await window.api.updateAccountCredentials(accountId, naverId, naverPw);
        await window.api.updateAccountSettings(accountId, settings);
        toastManager.success('계정 설정이 업데이트되었습니다.');
      } else {
        // 새 계정 추가
        const result = await window.api.addBlogAccount(name, blogId, naverId, naverPw, settings);
        if (result.success) {
          toastManager.success('계정이 추가되었습니다.');
        } else {
          toastManager.error(result.message || '계정 추가 실패');
          return;
        }
      }

      // 모달 닫기 및 목록 새로고침
      if (accountEditModal) {
        accountEditModal.style.display = 'none';
        accountEditModal.setAttribute('aria-hidden', 'true');
      }
      // ✅ 모든 계정 목록 동기화 (1개 계정 탭 + 다중계정 탭)
      if (typeof (window as any).refreshAllAccountLists === 'function') {
        await (window as any).refreshAllAccountLists();
      } else {
        await renderMultiAccountList();
      }
    } catch (error) {
      toastManager.error('저장 중 오류가 발생했습니다.');
    }
  });

  // ✅ 계정 삭제 버튼 핸들러
  document.getElementById('ma-delete-account-btn')?.addEventListener('click', async () => {
    const accountIdInput = document.getElementById('ma-edit-account-id') as HTMLInputElement;
    const accountId = accountIdInput?.value;

    if (!accountId) {
      toastManager.warning('삭제할 계정이 선택되지 않았습니다.');
      return;
    }

    // 확인 대화상자
    if (!confirm('정말로 이 계정을 삭제하시겠습니까?\n\n삭제된 계정은 복구할 수 없습니다.')) {
      return;
    }

    try {
      const result = await window.api.removeBlogAccount(accountId);
      if (result.success) {
        toastManager.success('계정이 삭제되었습니다.');

        // 모달 닫기
        if (accountEditModal) {
          accountEditModal.style.display = 'none';
          accountEditModal.setAttribute('aria-hidden', 'true');
        }

        // ✅ 모든 계정 목록 동기화 (1개 계정 탭 + 다중계정 탭)
        if (typeof (window as any).refreshAllAccountLists === 'function') {
          await (window as any).refreshAllAccountLists();
        } else {
          await renderMultiAccountList();
        }
      } else {
        toastManager.error(result.message || '계정 삭제 실패');
      }
    } catch (error) {
      console.error('[MultiAccount] 계정 삭제 오류:', error);
      toastManager.error('계정 삭제 중 오류가 발생했습니다.');
    }
  });

  // 대기 시간 포맷팅 함수
  const formatWaitTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}초`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}분 ${secs}초` : `${mins}분`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  };

  // ✅ 풀오토 진행 모달 제어 함수들 (모달 제거됨 - 콘솔 로그만 사용)
  function showMAProgressModal() {
    const modal = document.getElementById('ma-publish-progress-modal');
    if (!modal) return;

    // ✅ 모달이 body의 직접 자식이 아니면 body로 이동 (중첩 문제 해결)
    if (modal.parentElement !== document.body) {
      console.log('[MultiAccountPublish] 진행 모달을 body로 이동합니다.');
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');

    // ✅ 모달 열리면 플로팅 바 숨기기
    hideMAFloatingBar();

    const stopBtn = document.getElementById('ma-progress-stop-btn');
    if (stopBtn) stopBtn.style.display = 'flex';
    const closeBtn = document.getElementById('ma-progress-close-btn');
    if (closeBtn) closeBtn.style.display = 'none';
    const completeBtn = document.getElementById('ma-progress-complete-btn');
    if (completeBtn) completeBtn.style.display = 'none';

    const minimizeBtn = document.getElementById('ma-progress-minimize-btn') as HTMLButtonElement | null;
    if (minimizeBtn && !minimizeBtn.hasAttribute('data-listener-added')) {
      minimizeBtn.setAttribute('data-listener-added', 'true');
      minimizeBtn.addEventListener('click', () => {
        hideMAProgressModal();
      });
    }
  }

  function hideMAProgressModal() {
    const modal = document.getElementById('ma-publish-progress-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');

    // ✅ [2026-03-18] 최소화 시 하단 플로팅 진행률 바 표시
    if (isPublishing) {
      createOrShowMAFloatingBar();
      toastManager.info('📊 하단 바에서 진행 상황을 확인할 수 있습니다.', 3000);
    }
  }

  // ============================================
  // ✅ [2026-03-18] 다중계정 하단 플로팅 진행률 바
  // 연속발행의 continuous-status-indicator 패턴을 다중계정에 적용
  // ============================================
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
    // ✅ [2026-03-18 FIX] 현재 진행률 + 계정명/단계를 캐싱된 값으로 즉시 표시
    updateMAFloatingBar(currentProgressPercent, currentProgressAccountName, currentProgressStep);
  }

  function updateMAFloatingBar(percent: number, accountName: string, step: string) {
    const bar = document.getElementById('ma-floating-progress-bar');
    if (!bar || bar.style.display === 'none') return;

    const textEl = document.getElementById('ma-float-text');
    const percentEl = document.getElementById('ma-float-percent');
    const barFill = document.getElementById('ma-float-bar-fill');

    const p = Math.max(0, Math.min(100, percent));
    if (textEl && (accountName || step)) {
      textEl.textContent = accountName ? `${accountName} - ${step || '진행 중...'}` : (step || '다중계정 발행 중...');
    }
    if (percentEl) percentEl.textContent = `${p.toFixed(0)}%`;
    if (barFill) barFill.style.width = `${p.toFixed(0)}%`;
  }

  function hideMAFloatingBar() {
    const bar = document.getElementById('ma-floating-progress-bar');
    if (bar) {
      bar.style.display = 'none';
    }
  }

  // ✅ [2026-03-18] 플로팅 바 DOM 완전 제거 (발행 완전 종료 시)
  function destroyMAFloatingBar() {
    const bar = document.getElementById('ma-floating-progress-bar');
    if (bar) bar.remove();
  }

  // 현재 진행률 상태 (콘솔 로그용)
  let currentProgressPercent = 0;
  let currentProgressAccountName = '';
  let currentProgressStep = '';
  let progressAnimationFrame: number | null = null;

  function updateMAProgress(current: number, total: number, accountName: string, step: string, subStep?: number, totalSubSteps?: number) {
    const totalSafe = Math.max(1, Number(total || 0));
    const currentSafe = Math.max(0, Number(current || 0));
    const sub = typeof subStep === 'number' ? subStep : 0;
    const subTotal = typeof totalSubSteps === 'number' && totalSubSteps > 0 ? totalSubSteps : 0;
    const subRatio = subTotal > 0 ? Math.max(0, Math.min(1, sub / subTotal)) : 0;
    const rawPercent = ((currentSafe + subRatio) / totalSafe) * 100;
    const percent = Math.max(0, Math.min(100, rawPercent));

    animateProgress(percent);

    const currentEl = document.getElementById('ma-progress-current');
    if (currentEl) currentEl.textContent = `${Math.min(currentSafe, totalSafe)} / ${totalSafe} 계정`;
    const taskAccount = document.getElementById('ma-task-account');
    if (taskAccount) taskAccount.textContent = accountName || '진행 중...';
    const taskStep = document.getElementById('ma-task-step');
    if (taskStep) taskStep.textContent = step || '';

    // ✅ [2026-03-18] 현재 상태 캐싱 + 플로팅 바 동시 업데이트
    currentProgressAccountName = accountName || '';
    currentProgressStep = step || '';
    updateMAFloatingBar(percent, accountName, step);
  }

  function animateProgress(targetPercent: number) {
    const p = Math.max(0, Math.min(100, Number(targetPercent || 0)));
    currentProgressPercent = p;

    const bar = document.getElementById('ma-progress-bar') as HTMLDivElement | null;
    if (bar) bar.style.width = `${p.toFixed(0)}%`;
    const percentEl = document.getElementById('ma-progress-percent');
    if (percentEl) percentEl.textContent = `${p.toFixed(0)}%`;
  }

  function updateMAStep(stepId: string, status: 'active' | 'completed' | 'error' | 'pending') {
    const el = document.getElementById(stepId);
    if (!el) return;
    el.classList.remove('active', 'completed', 'error', 'pending');
    el.classList.add(status);
  }

  function resetMASteps() {
    ['ma-step-content', 'ma-step-image', 'ma-step-login', 'ma-step-publish'].forEach((id) => {
      updateMAStep(id, 'pending');
    });
  }

  function addMALog(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    const line = message;
    try {
      appendLog(`[MA] ${line}`);
    } catch {
    }

    const liveLog = document.getElementById('ma-live-log');
    if (!liveLog) {
      console.log(`[FullAuto] ${line}`);
      return;
    }

    // ✅ [2026-03-07 FIX] 타임스탬프 + 컬러 코딩 + XSS 방지 (renderer.ts IPC 브릿지와 동일 스타일)
    const ts = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let logColor = '#94a3b8';
    if (type === 'success' || message.includes('✅') || message.includes('완료')) logColor = '#10b981';
    else if (type === 'error' || message.includes('❌') || message.includes('실패')) logColor = '#ef4444';
    else if (type === 'warning' || message.includes('⚠️')) logColor = '#f59e0b';
    else if (message.includes('🤖') || message.includes('🎨')) logColor = '#a78bfa';

    const item = document.createElement('div');
    item.style.cssText = `line-height: 1.5; padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,0.03);`;
    const safeMsg = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    item.innerHTML = `<span style="color: rgba(255,255,255,0.3); font-size: 0.7rem; margin-right: 5px;">[${ts}]</span><span style="color: ${logColor}">${safeMsg}</span>`;

    liveLog.appendChild(item);

    // ✅ [2026-03-07 FIX] 엔트리 제한 80→150 (renderer.ts IPC 브릿지와 통일)
    while (liveLog.childElementCount > 150) {
      liveLog.removeChild(liveLog.firstElementChild as Element);
    }
    liveLog.scrollTop = liveLog.scrollHeight;
  }

  // ✅ [2026-03-09 FIX] addProgressItem 정의 추가 (renderer.ts 모듈화 시 누락됨)
  function addProgressItem(message: string, type: 'info' | 'success' | 'error' | 'warning') {
    const progressList = document.getElementById('ma-progress-list');
    if (!progressList) {
      // DOM 요소가 없으면 addMALog로 폴백
      addMALog(message, type);
      return;
    }

    const item = document.createElement('div');
    item.style.cssText = 'padding: 6px 10px; border-radius: 6px; margin-bottom: 4px; font-size: 0.85rem;';

    const colors: Record<string, string> = {
      info: 'rgba(96, 165, 250, 0.15)',
      success: 'rgba(16, 185, 129, 0.15)',
      error: 'rgba(239, 68, 68, 0.15)',
      warning: 'rgba(245, 158, 11, 0.15)',
    };
    const textColors: Record<string, string> = {
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

    // 엔트리 제한
    while (progressList.childElementCount > 100) {
      progressList.removeChild(progressList.firstElementChild as Element);
    }
    progressList.scrollTop = progressList.scrollHeight;

    // 로그에도 기록
    addMALog(message, type);
  }

  function showMAResult(success: number, fail: number) {
    addMALog(`✅ 발행 완료 - 성공: ${success}건, 실패: ${fail}건`, 'success');

    // ✅ [2026-03-18] 발행 완료 시 플로팅 바 숨기기
    hideMAFloatingBar();

    const resultSummary = document.getElementById('ma-result-summary');
    if (resultSummary) resultSummary.style.display = 'block';

    const sEl = document.getElementById('ma-result-success');
    const fEl = document.getElementById('ma-result-fail');
    const tEl = document.getElementById('ma-result-total');
    if (sEl) sEl.textContent = String(success);
    if (fEl) fEl.textContent = String(fail);
    if (tEl) tEl.textContent = String(Math.max(0, Number(success || 0) + Number(fail || 0)));

    const stopBtn = document.getElementById('ma-progress-stop-btn');
    const closeBtn = document.getElementById('ma-progress-close-btn');
    const completeBtn = document.getElementById('ma-progress-complete-btn');
    if (stopBtn) stopBtn.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';
    if (completeBtn) completeBtn.style.display = 'flex';
    if (completeBtn && !completeBtn.hasAttribute('data-listener-added')) {
      completeBtn.setAttribute('data-listener-added', 'true');
      completeBtn.addEventListener('click', () => {
        hideMAProgressModal();
      });
    }

    const taskSpinner = document.getElementById('ma-task-spinner');
    if (taskSpinner) taskSpinner.style.animation = 'none';
    const progressIcon = document.getElementById('ma-progress-icon');
    if (progressIcon) {
      progressIcon.textContent = '✅';
      progressIcon.style.animation = 'none';
    }
    const badge = document.getElementById('ma-task-status-badge');
    if (badge) {
      badge.textContent = '완료';
      badge.style.background = 'rgba(16, 185, 129, 0.25)';
      (badge as HTMLElement).style.color = '#10b981';
    }
  }

  // ✅ 대기열 기반 풀오토 발행 시작
  document.getElementById('ma-start-publish-btn')?.addEventListener('click', async () => {
    // [UX Fix] 수정 중인 상태에서 확인 없이 시작하는 것 방지
    if ((window as any).currentEditingQueueId) {
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

    // ✅ 발행 간격 계산 (초/분/시간 단위 지원, 최대 24시간)
    const intervalValue = parseInt((document.getElementById('ma-interval-value') as HTMLInputElement)?.value || '30');
    const intervalUnit = (document.getElementById('ma-interval-unit') as HTMLSelectElement)?.value || 'seconds';
    let intervalSeconds = intervalValue;
    if (intervalUnit === 'minutes') {
      intervalSeconds = intervalValue * 60;
    } else if (intervalUnit === 'hours') {
      intervalSeconds = intervalValue * 3600;
    }
    // 최대 24시간 (86400초) 제한
    intervalSeconds = Math.min(intervalSeconds, 86400);

    isPublishing = true;
    stopRequested = false;
    // ✅ [2026-03-11 FIX] 연속발행 모드가 아닐 때만 중지 플래그 리셋
    if (!(window as any).isContinuousMode) {
      (window as any).stopFullAutoPublish = false;
    }

    const startBtn = document.getElementById('ma-start-publish-btn') as HTMLButtonElement | null;
    const startBtnOriginalHtml = startBtn?.innerHTML || '';
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.innerHTML = '<span style="font-size: 1.25rem;">⏳</span> 발행 중...';
    }

    // 외부 진행 상황 섹션 숨기기 (모달로 대체)
    const progressSection = document.getElementById('ma-progress-section');
    const progressList = document.getElementById('ma-progress-list');
    if (progressSection) progressSection.style.display = 'none';
    if (progressList) progressList.innerHTML = '';

    // ✅ 새로운 애니메이션 모달 표시
    showMAProgressModal();
    resetMASteps();

    // 모달 초기화
    const liveLog = document.getElementById('ma-live-log');
    if (liveLog) liveLog.innerHTML = '';

    const resultSummary = document.getElementById('ma-result-summary');
    const stopBtn = document.getElementById('ma-progress-stop-btn');
    const closeBtn = document.getElementById('ma-progress-close-btn');
    const taskSpinner = document.getElementById('ma-task-spinner');
    const progressIcon = document.getElementById('ma-progress-icon');
    const progressTitle = document.getElementById('ma-progress-title');

    if (resultSummary) resultSummary.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'flex';
    if (closeBtn) closeBtn.style.display = 'none';
    if (taskSpinner) taskSpinner.style.animation = 'spin 1s linear infinite';
    if (progressIcon) {
      progressIcon.textContent = '🚀';
      progressIcon.style.animation = 'bounce 1s infinite';
    }
    if (progressTitle) progressTitle.textContent = '풀오토 다중계정 발행';

    let totalSuccess = 0;
    let totalFail = 0;
    const totalItems = publishQueue.length;

    const waitInterruptible = async (seconds: number, currentIdx?: number, totalCount?: number) => {
      const ms = Math.max(0, Math.floor(seconds * 1000));
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (stopRequested || (window as any).stopFullAutoPublish) return false;
        // ✅ [2026-03-18] 실시간 카운트다운 갱신 (플로팅 바 + 모달 동시 업데이트)
        const remaining = Math.max(0, Math.ceil((ms - (Date.now() - start)) / 1000));
        if (typeof currentIdx === 'number' && typeof totalCount === 'number') {
          updateMAProgress(currentIdx + 1, totalCount, '대기 중...', `⏳ ${formatWaitTime(remaining)} 후 다음 발행`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return true;
    };

    // 예상 시간 계산
    const estimatedTime = totalItems * (intervalSeconds + 60); // 각 항목당 약 60초 + 간격
    const progressTime = document.getElementById('ma-progress-time');
    if (progressTime) progressTime.textContent = `예상 시간: ${formatWaitTime(estimatedTime)}`;

    addProgressItem(`🚀 대기열 ${totalItems}개 항목 발행 시작 (간격: ${formatWaitTime(intervalSeconds)})`, 'info');
    addMALog(`🚀 대기열 ${totalItems}개 항목 발행 시작`, 'info');
    updateMAProgress(0, totalItems, '준비 중...', '발행 시작');

    // ✅ [2026-03-15 FIX] 예약 모드일 때, 큐 순서별로 예약 시간을 미리 분산 계산
    // 원인: renderer가 multiAccountPublish([accountId])로 계정 1개씩 IPC 호출 → main.ts의 i가 항상 0 → 시간 분산 안 됨
    // 수정: renderer 쪽에서 큐 순번에 맞게 예약 시간을 미리 계산하여 queueItem에 적용
    // ✅ [2026-03-17 MOD] scheduleDistributor 모듈로 위임 (100줄 → 10줄)
    // ✅ [2026-04-01 BUG-7 FIX] 이미 예약 시간이 설정된 항목은 재분배하지 않음
    //    랜덤 배분(distributeByRandomRange) 후 scheduleUserModified=true로 설정되므로
    //    distributeWithProtection이 해당 항목을 "수동"으로 인식하여 보호함
    {
      const scheduleItems = publishQueue.filter(item => item.publishMode === 'schedule');
      if (scheduleItems.length > 1) {
        // ✅ [2026-04-01 BUG-7 FIX] 이미 모든 항목이 예약 시간을 가지고 있으면 재분배 건너뛰기
        // 랜덤 배분이나 개별 예약으로 이미 설정된 경우 distributeWithProtection이 덮어쓰는 것을 방지
        const allHaveSchedule = scheduleItems.every(item => item.scheduleDate && item.scheduleTime);
        const autoItems = scheduleItems.filter(item => !item.scheduleUserModified);
        
        if (allHaveSchedule && autoItems.length === 0) {
          // 모든 항목이 수동 설정(랜덤 배분 포함) → 재분배 불필요
          addMALog(`📅 모든 ${scheduleItems.length}개 예약 항목이 이미 설정됨 → 재분배 건너뜀`, 'info');
          scheduleItems.forEach((item, idx) => {
            addMALog(`  📅 [${idx + 1}/${scheduleItems.length}] ${(item as any).accountName || '계정'}: ${item.scheduleDate} ${item.scheduleTime} (확정)`, 'info');
          });
        } else {
          // 미설정 항목이 있을 때만 distributeWithProtection 실행
          const firstItem = scheduleItems.find(item => !item.scheduleUserModified) || scheduleItems[0];
          (window as any).distributeWithProtection(scheduleItems, {
            baseDate: firstItem.scheduleDate || new Date().toISOString().split('T')[0],
            baseTime: firstItem.scheduleTime || '09:00',
            // ✅ [2026-04-01 BUG-8 FIX] 기본 간격 360분(6시간) → 30분으로 변경
            // 6시간 간격은 10개 계정에서 54시간(2.25일) 밀림 유발
            intervalMinutes: firstItem.scheduleInterval || 30,
          }, (msg: string, level: string) => addMALog(msg, level));

          // ✅ [2026-03-22 FIX] 분산 결과 개별 로깅 — 어떤 계정에 어떤 시간이 배정되었는지 명시
          scheduleItems.forEach((item, idx) => {
            addMALog(`  📅 [${idx + 1}/${scheduleItems.length}] ${(item as any).accountName || '계정'}: ${item.scheduleDate} ${item.scheduleTime}${item.scheduleUserModified ? ' (수동)' : ' (자동)'}`, 'info');
          });
        }
      }

      // ✅ [2026-03-24 BUG-4 FIX v2] 스케줄 항목에서 날짜 OR 시간 누락 시 자동 생성
      // distributeWithProtection은 auto 항목이 2개 이상일 때만 분배 → 1개 항목은 건너뜀 → scheduleDate/Time=undefined
      const incompleteScheduleItems = publishQueue.filter(item => item.publishMode === 'schedule' && (!item.scheduleDate || !item.scheduleTime));
      for (const item of incompleteScheduleItems) {
        const autoTime = new Date(Date.now() + 30 * 60 * 1000); // 30분 후
        const ceilMin = Math.ceil(autoTime.getMinutes() / 10) * 10;
        autoTime.setMinutes(ceilMin % 60, 0, 0);
        if (ceilMin >= 60) autoTime.setHours(autoTime.getHours() + 1);
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
      // ✅ 대기열 순차 처리
      for (let i = 0; i < publishQueue.length && !stopRequested && !(window as any).stopFullAutoPublish; i++) {
        const queueItem = publishQueue[i];
        let generatedPostId: string | null = null;

        // 모달 업데이트 (4단계: 콘텐츠→이미지→로그인→발행)
        const TOTAL_SUB_STEPS = 4;
        resetMASteps();
        currentProgressPercent = (i / totalItems) * 100; // 현재 계정 시작점으로 초기화
        updateMAProgress(i, totalItems, queueItem.accountName, '🚀 처리 시작...', 0, TOTAL_SUB_STEPS);
        addMALog(`📋 [${i + 1}/${totalItems}] ${queueItem.accountName} 처리 시작`, 'info');

        addProgressItem(`📋 [${i + 1}/${totalItems}] ${queueItem.accountName} 처리 시작...`, 'info');

        // ✅ UI 및 데이터 초기화: 이전 항목의 흔적 제거 (연속 발행/다중 계정 안정성)
        try {
          ImageManager.clearAll();
          // UI 즉시 동기화하여 이전 이미지 잔상 제거
          if (typeof syncGlobalImagesFromImageManager === 'function') {
            syncGlobalImagesFromImageManager();
          }
          (window as any).currentStructuredContent = null;
          (window as any).generatedImages = [];
        } catch (clearErr) {
          console.error('[FullAuto] 데이터 초기화 실패:', clearErr);
        }

        // 1. AI 콘텐츠 생성 (1/4 단계)
        updateMAStep('ma-step-content', 'active');
        updateMAProgress(i, totalItems, queueItem.accountName, '📝 AI 콘텐츠 생성 중...', 0.5, TOTAL_SUB_STEPS);
        addMALog('📝 AI 콘텐츠 생성 중...', 'info');
        addProgressItem(`   📝 AI 콘텐츠 생성 중...`, 'info');

        let structuredContent: any = null;
        let generatedImages: any[] = [];

        // ✅ [2026-02-14] 키워드 제목 옵션 설정 (다중계정)
        if (queueItem.sourceKeyword) {
          setKeywordTitleOptionsFromItem(queueItem.sourceKeyword, queueItem.keywordAsTitle, queueItem.keywordTitlePrefix);
        }

        try {
          // 콘텐츠 생성 페이로드 구성
          const contentPayload: any = {
            assembly: {
              generator: UnifiedDOMCache.getGenerator(),
              toneStyle: queueItem.toneStyle,
              targetAge: 'all',
            }
          };

          // ✅ 카테고리(콘텐츠 카테고리) 전달
          try {
            const articleType = String(queueItem.category || '').trim() || 'general';
            contentPayload.assembly.articleType = articleType;
          } catch (e) {
            console.warn('[multiAccountManager] catch ignored:', e);
          }

          // ✅ 콘텐츠 모드 (SEO/홈판) 전달
          try {
            const cm = (queueItem.contentMode || 'seo') as 'seo' | 'homefeed' | 'affiliate';
            contentPayload.assembly.contentMode = cm;
          } catch (e) {
            console.warn('[multiAccountManager] catch ignored:', e);
          }

          const keywordList = queueItem.sourceKeyword
            ? queueItem.sourceKeyword.split(',').map(k => k.trim()).filter(Boolean)
            : [];
          if (keywordList.length > 0) {
            contentPayload.assembly.keywords = keywordList;
          }

          if (queueItem.sourceUrl) {
            contentPayload.assembly.rssUrl = [queueItem.sourceUrl];
          } else if (queueItem.sourceKeyword) {
            contentPayload.assembly.draftText = queueItem.sourceKeyword;
          }

          console.log('[FullAuto] 콘텐츠 생성 요청:', contentPayload);
          const apiClient = EnhancedApiClient.getInstance();
          const apiResponse = await apiClient.call(
            'generateStructuredContent',
            [contentPayload],
            {
              retryCount: 2,       // ✅ 2회 재시도 (Main의 모델 폴백 체인이 이미 3모델 순회)
              retryDelay: 3000,
              timeout: 900000      // ✅ 15분 (Main 최대 12분 + 여유 3분)
            }
          );
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

          // ✅ [2026-03-10 FIX] 중앙화된 URL→제목 방어: 백엔드 응답 수신 직후 URL 즉시 제거
          // 이 방어가 있으면 이후 키워드제목, SEO제목, 이미지heading, preGeneratedContent 등 모든 하류 코드가 자동 보호됨
          if (structuredContent.selectedTitle && /^https?:\/\//i.test(String(structuredContent.selectedTitle).trim())) {
            addMALog(`⚠️ selectedTitle이 URL이므로 제거됨`, 'warning');
            console.warn(`[FullAuto] ⚠️ selectedTitle이 URL이므로 빈 문자열로 대체: "${String(structuredContent.selectedTitle).substring(0, 60)}"`);
            structuredContent.selectedTitle = '';
          }
          if (structuredContent.title && /^https?:\/\//i.test(String(structuredContent.title).trim())) {
            console.warn(`[FullAuto] ⚠️ title이 URL입니다 (원본 소스 참조용 유지, selectedTitle 전파 차단): "${String(structuredContent.title).substring(0, 60)}"`);
          }

          // ✅ [2026-02-14] 키워드 제목 옵션 후처리 (다중계정)
          // generateContentFromKeywords 경로를 거치지 않으므로 직접 적용
          const keywordTitleOpts = (window as any)._keywordTitleOptions;
          if (keywordTitleOpts && structuredContent) {
            if (keywordTitleOpts.useKeywordAsTitle) {
              // 📌 키워드를 그대로 제목으로 사용
              const originalTitle = structuredContent.selectedTitle;
              structuredContent.selectedTitle = keywordTitleOpts.keyword;
              addMALog(`📌 제목 교체: "${(originalTitle || '').substring(0, 20)}..." → "${structuredContent.selectedTitle}"`, 'info');
              console.log(`[FullAuto] 키워드→제목 교체: "${originalTitle}" → "${structuredContent.selectedTitle}"`);
            } else if (keywordTitleOpts.useKeywordTitlePrefix) {
              // 🔝 키워드를 제목 맨 앞에 배치 (중복 제거 강화)
              const keyword = String(keywordTitleOpts.keyword || '').trim();
              const currentTitle = String(structuredContent.selectedTitle || '').trim();
              if (keyword && currentTitle && !currentTitle.startsWith(keyword)) {
                // ✅ [2026-03-14] 강화된 공통 중복 제거 함수 사용
              const cleaned = cleanKeywordFromTitle(keyword, currentTitle);

              // 키워드 + 정리된 제목 조합
              const newTitle = cleaned ? `${keyword} ${cleaned}` : keyword;
              structuredContent.selectedTitle = newTitle;
              addMALog(`🔝 키워드 앞배치: "${currentTitle.substring(0, 20)}..." → "${newTitle.substring(0, 30)}..."`, 'info');
              console.log(`[FullAuto] 키워드 앞배치: "${currentTitle}" → "${newTitle}"`);
            }
            }
            // 옵션 사용 후 정리
            (window as any)._keywordTitleOptions = null;
          }

          // ✅ [2026-02-08] 쇼핑커넥트 모드: 항상 100점 SEO 제목 생성
          // 핵심: 제품명 + 네이버 자동완성 키워드 최소 3개 조합 = 상위노출 보장
          if (queueItem.contentMode === 'affiliate' && structuredContent.selectedTitle) {
            // ✅ [2026-03-10 FIX] URL이 제목에 혼입되는 버그 방지
            // structuredContent.title은 원본 소스 제목(크롤링/RSS)으로, URL이 들어있을 수 있음
            // selectedTitle은 AI가 생성한 최종 제목이므로 더 신뢰할 수 있음
            const isUrl = (str: string) => /^https?:\/\//i.test(str.trim());
            const rawTitle = String(structuredContent.title || '').trim();
            const rawSelectedTitle = String(structuredContent.selectedTitle || '').trim();
            const productName = (!rawTitle || isUrl(rawTitle))
              ? (isUrl(rawSelectedTitle) ? '' : rawSelectedTitle)
              : rawTitle;
            if (productName && productName.length >= 3) {
              try {
                addMALog('🔍 SEO 100점 제목 생성 중... (자동완성 키워드 3개 이상 조합)', 'info');
                const seoResult = await (window as any).api.generateSeoTitle(productName);
                if (seoResult.success && seoResult.title && seoResult.title !== productName) {
                  const originalTitle = structuredContent.selectedTitle;
                  structuredContent.selectedTitle = seoResult.title;
                  console.log(`[SEO] 제목 교체: "${originalTitle}" → "${seoResult.title}"`);
                  addMALog(`✨ SEO 제목 적용: "${seoResult.title.substring(0, 35)}"`, 'success');
                  // ✅ 다른 필드에도 반영하여 덮어쓰기 방지
                  if (structuredContent.title && structuredContent.title === originalTitle) {
                    structuredContent.title = seoResult.title;
                  }
                }
              } catch (seoErr) {
                console.warn('[SEO] 제목 생성 실패 (원본 사용):', seoErr);
              }
            }
          }

          // ✅ UI 업데이트: 현재 처리 중인 콘텐츠를 화면에 표시
          try {
            (window as any).currentStructuredContent = structuredContent;
            await autoAnalyzeHeadings(structuredContent);
          } catch (uiErr) {
            console.error('[FullAuto] UI 업데이트 실패:', uiErr);
          }

          updateMAStep('ma-step-content', 'completed');
          addMALog(`✅ 콘텐츠 생성 완료: "${structuredContent.selectedTitle?.substring(0, 20)}..."`, 'success');
          addProgressItem(`   ✅ 콘텐츠 생성 완료: "${structuredContent.selectedTitle?.substring(0, 25)}..."`, 'success');

          // 2. 이미지 수집/생성 (2/4 단계) - 총 50장 수집 (소제목 + 예비 이미지)
          updateMAStep('ma-step-image', 'active');
          updateMAProgress(i, totalItems, queueItem.accountName, '🎨 이미지 수집 중...', 1, TOTAL_SUB_STEPS);
          addMALog('🎨 이미지 수집 중...', 'info');
          addProgressItem(`   🎨 이미지 수집 중...`, 'info');
          // ✅ [2026-02-24 FIX] 서론이 있으면 썸네일 섹션을 맨 앞에 별도 추가
          const rawHeadingsMA = structuredContent.headings || [];
          const headings = structuredContent.introduction
            ? [{ title: structuredContent.selectedTitle || '🖼️ 썸네일', content: structuredContent.introduction, isThumbnail: true, isIntro: true }, ...rawHeadingsMA]
            : rawHeadingsMA;

          // ✅ 2. 이미지 수집 (건너뜀)

          // ✅ 2. 이미지 수집/생성 실행
          try {
            // 이미지 소스 결정
            const imageSource = queueItem.imageSource || getFullAutoImageSource(); // ✅ [2026-02-09 FIX] 풀오토 이미지 설정 반영
            const skipImages = imageSource === 'skip';
            console.log('[FullAuto] 이미지 소스:', imageSource, ', 건너뛰기:', skipImages);

            // ✅ [2026-02-16 FIX] 쇼핑커넥트 모드: 제휴 링크에서 제품 이미지 자동 수집
            // executeUnifiedAutomation(단건 발행)에는 있지만 다중계정 흐름에서 누락되어 있던 로직
            if (!skipImages && queueItem.contentMode === 'affiliate' && queueItem.affiliateLink) {
              addMALog('🛒 쇼핑커넥트 모드 - 제품 이미지 수집 중...', 'info');
              addProgressItem(`   🛒 제휴 링크에서 제품 이미지 수집 중...`, 'info');
              try {
                const collectResult = await (window as any).api.collectImagesFromShopping(queueItem.affiliateLink);
                if (collectResult?.success && collectResult.images && collectResult.images.length > 0) {
                  generatedImages = collectResult.images.map((imgUrl: string, idx: number) => ({
                    url: imgUrl,
                    filePath: imgUrl,
                    heading: idx === 0 ? '대표 이미지' : `제품 이미지 ${idx + 1}`,
                    provider: 'collected'
                  }));
                  // structuredContent에 수집 이미지 동기화
                  if (structuredContent) {
                    structuredContent.collectedImages = collectResult.images;
                    structuredContent.images = [...generatedImages];
                    (window as any).currentStructuredContent = structuredContent;
                  }
                  addMALog(`✅ 제품 이미지 ${collectResult.images.length}장 수집 완료`, 'success');
                  addProgressItem(`   ✅ 제품 이미지 ${collectResult.images.length}장 수집 완료`, 'success');

                  // 제품 정보 로그
                  if (collectResult.productInfo) {
                    addMALog(`📦 상품: ${collectResult.productInfo.name || '알 수 없음'}`, 'info');
                  }
                } else {
                  addMALog('⚠️ 제품 이미지 수집 실패 - AI 이미지로 대체합니다', 'warning');
                  // 수집 실패 시 일반 이미지 생성으로 폴백 (아래 분기에서 처리)
                }
              } catch (collectError) {
                console.error('[FullAuto] 쇼핑커넥트 이미지 수집 오류:', collectError);
                addMALog(`⚠️ 이미지 수집 오류: ${(collectError as Error).message?.substring(0, 50)} - AI 이미지로 대체`, 'warning');
                // 오류 시에도 계속 진행 (아래 분기에서 AI 이미지 생성)
              }
            }

            // ✅ [2026-02-16 FIX] 쇼핑커넥트 이미지-소제목 매칭 + 썸네일 오버레이
            // executeUnifiedAutomation에 있지만 다중계정 흐름에서 누락되었던 후처리 로직
            const scSubImageSourcePre = localStorage.getItem('scSubImageSource') || 'collected';
            if (generatedImages.length > 0 && queueItem.contentMode === 'affiliate') {
              // A. 이미지-소제목 매칭
              const shouldMatchCollected = scSubImageSourcePre === 'collected';
              if (shouldMatchCollected && (structuredContent.headings || []).length > 0) {
                try {
                  addMALog('🤖 수집 이미지를 소제목에 매칭 중...', 'info');
                  const matchResult = await (window as any).api.matchImages({
                    headings: structuredContent.headings || [],
                    collectedImages: generatedImages.map((img: any) => img.url || img.filePath),
                    scSubImageSource: scSubImageSourcePre
                  });
                  if (matchResult?.success && matchResult.assignments) {
                    matchResult.assignments.forEach((assignment: any) => {
                      const headIdx = assignment.headingIndex;
                      const targetHeading = (structuredContent.headings || [])[headIdx];
                      if (targetHeading) {
                        targetHeading.referenceImagePath = assignment.imageUrl || assignment.imagePath;
                      }
                    });
                    addMALog(`✅ ${matchResult.assignments.length}개 소제목에 이미지 배치 완료`, 'success');
                  }
                } catch (matchErr) {
                  console.error('[FullAuto] 이미지 매칭 실패:', matchErr);
                }
              }

              // B. 썸네일 텍스트 오버레이
              if (queueItem.includeThumbnailText && generatedImages.length > 0) {
                try {
                  const thumbnailImg = generatedImages[0];
                  const thumbnailPath = typeof thumbnailImg === 'string'
                    ? thumbnailImg
                    : (thumbnailImg?.filePath || thumbnailImg?.url || '');
                  if (thumbnailPath) {
                    addMALog('🎨 수집 이미지에 텍스트 오버레이 중...', 'info');
                    const overlayResult = await (window as any).api.createProductThumbnail(
                      thumbnailPath,
                      structuredContent.selectedTitle || '',
                      { position: 'bottom', fontSize: 28, textColor: '#ffffff', opacity: 0.8 }
                    );
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
                } catch (overlayErr) {
                  console.error('[FullAuto] 썸네일 오버레이 실패:', overlayErr);
                }
              }
            }

            // 쇼핑커넥트에서 이미지를 이미 수집했으면 AI 생성 건너뛰기
            const alreadyHasImages = generatedImages.length > 0;

            if (skipImages) {
              // ✅ 이미지 없이 진행
              addMALog('⏭️ 이미지 생성 건너뛰기 (사용자 설정)', 'info');
              generatedImages = [];

            } else if (alreadyHasImages) {
              // ✅ 쇼핑커넥트에서 이미 수집 완료 - 추가 생성 불필요
              console.log('[FullAuto] 쇼핑커넥트 수집 이미지 사용:', generatedImages.length);

            } else if (imageSource === 'local-folder') {
              // ✅ [2026-03-23 REFACTOR] 다중계정 local-folder: 공통 함수로 통합
              // ✅ [2026-03-23 FIX] 동적 import → window 전역 호출 (require is not defined 에러 수정)
              const loadLF = (window as any).loadLocalFolderWithFallback;
              if (!loadLF) throw new Error('loadLocalFolderWithFallback 함수가 아직 로드되지 않았습니다');
              const lfResult = await loadLF({
                headings,
                postTitle: structuredContent.selectedTitle,
                onLog: (msg: string, level?: string) => {
                  addMALog(msg, level === 'success' ? 'success' : level === 'warning' ? 'warning' : 'info');
                },
                aiFallbackFn: generateImagesForAutomation,
                aiOptions: {
                  stopCheck: () => stopRequested || (window as any).stopFullAutoPublish,
                  allowThumbnailText: localStorage.getItem('thumbnailTextInclude') === 'true',
                },
              });
              generatedImages = lfResult.images;
              if (lfResult.source === 'empty') {
                addProgressItem('⚠️ 📂 이미지 없이 진행', 'warning');
              }

            } else if (imageSource === 'naver') {
              // ✅ 네이버 이미지 검색
              addMALog(`🔍 네이버 이미지 검색 시작 (키워드: ${structuredContent.keywords?.[0] || structuredContent.selectedTitle})`, 'info');

              // 네이버 이미지 수집 로직 호출
              // generateImagesForAutomation 내부에서 naver 소스 처리
              generatedImages = await generateImagesForAutomation(
                imageSource,
                headings,
                structuredContent.selectedTitle,
                {
                  // ✅ [2026-01-28 FIX] localStorage 설정 우선 적용 (큐 생성 시점이 아닌 이미지 생성 직전 최신 설정)
                  allowThumbnailText: localStorage.getItem('thumbnailTextInclude') === 'true' || queueItem.includeThumbnailText,
                  stopCheck: () => stopRequested || (window as any).stopFullAutoPublish,
                  onProgress: (msg) => {
                    addMALog(msg, 'info');
                    // updateMAProgress(i, totalItems, queueItem.accountName, msg, 1.5, TOTAL_SUB_STEPS);
                  }
                }
              );

            } else {
              // ✅ AI 이미지 생성
              const _maSourceNames: Record<string, string> = {
                'pollinations': 'Pollinations', 'nano-banana-pro': '나노 바나나 프로',
                'prodia': 'Prodia', 'stability': 'Stability AI',
                'deepinfra': 'DeepInfra FLUX-2', 'deepinfra-flux': 'DeepInfra FLUX-2',
                'falai': 'Fal.ai FLUX', 'naver-search': '네이버 검색', 'naver': '네이버 검색',
              };
              addMALog(`🎨 AI 이미지 생성 시작 (엔진: ${_maSourceNames[imageSource] || imageSource})`, 'info');
              generatedImages = await generateImagesForAutomation(
                imageSource,
                headings,
                structuredContent.selectedTitle,
                {
                  // ✅ [2026-01-28 FIX] localStorage 설정 우선 적용 (큐 생성 시점이 아닌 이미지 생성 직전 최신 설정)
                  allowThumbnailText: localStorage.getItem('thumbnailTextInclude') === 'true' || queueItem.includeThumbnailText,
                  stopCheck: () => stopRequested || (window as any).stopFullAutoPublish,
                  onProgress: (msg) => {
                    addMALog(msg, 'info');
                    // updateMAProgress(i, totalItems, queueItem.accountName, msg, 1.5, TOTAL_SUB_STEPS);
                  }
                }
              );
            }

            if (stopRequested || (window as any).stopFullAutoPublish) break;

          } catch (imgErr) {
            console.error('[FullAuto] 이미지 생성 중 오류:', imgErr);
            addMALog(`⚠️ 이미지 생성 중 오류 발생: ${(imgErr as Error).message}`, 'warning');
            // 이미지가 없어도 계속 진행 (텍스트 위주)
          }

          // ✅ UI 업데이트: 생성된 이미지들을 ImageManager에 등록하고 화면에 표시
          try {
            if (Array.isArray(generatedImages) && generatedImages.length > 0) {
              // 기존 이미지 유지 및 새 이미지 추가
              generatedImages.forEach((img: any) => {
                const titleKey = img.heading || '기타';
                const resolvedKey = ImageManager.resolveHeadingKey(titleKey);

                // 기존 이미지가 있으면 덮어쓰지 않고 추가하되, 첫 번째 이미지(대표)로 설정
                const existing = ImageManager.getImages(resolvedKey) || [];
                const isDuplicate = existing.some((e: any) => (e.url || e.filePath) === (img.url || img.filePath));

                if (!isDuplicate) {
                  ImageManager.imageMap.set(resolvedKey, [img, ...existing]);
                }
              });

              // UI 갱신: ImageManager의 내부 배열을 전역 window 객체와 동기화하고 화면에 표시
              if (typeof ImageManager.syncGeneratedImagesArray === 'function') {
                ImageManager.syncGeneratedImagesArray();
              }
              if (typeof syncGlobalImagesFromImageManager === 'function') {
                syncGlobalImagesFromImageManager();
              }

              // ✅ [수정] 이미지 그리드 UI 업데이트 추가 (작은 그리드 표시)
              const allImagesAfter = ImageManager.getAllImages();
              displayGeneratedImages(allImagesAfter);
            }
          } catch (uiImgErr) {
            console.error('[FullAuto] 이미지 UI 업데이트 실패:', uiImgErr);
          }

          // ✅ [2026-03-11 FIX] 생성된 글 목록에 계정별 올바른 저장소에 저장
          // 기존: getCurrentNaverId()가 항상 활성 계정만 반환 → 모든 글이 한 계정에만 저장되는 버그
          // 수정: queueItem.accountId로 credentials 조회하여 해당 계정의 naverId를 전달
          try {
            if (structuredContent) {
              let saveNaverId = '';
              try {
                const saveCredResult = await window.api.getAccountCredentials(queueItem.accountId);
                saveNaverId = (saveCredResult?.credentials?.naverId || '').trim().toLowerCase();
              } catch (credErr) {
                console.warn('[FullAuto] naverId 조회 실패, 기본값 사용:', credErr);
              }
              generatedPostId = saveGeneratedPostFromData(structuredContent, generatedImages, {
                toneStyle: queueItem.toneStyle,
                ctaText: queueItem.ctaText || '',
                ctaLink: queueItem.ctaUrl || '',
                category: String(queueItem.category || '').trim() || undefined,
                naverId: saveNaverId || undefined, // ✅ 계정별 올바른 저장소에 저장
              });
              if (generatedPostId) {
                addMALog(`💾 생성된 글 목록 저장됨 (ID: ${generatedPostId}, 계정: ${saveNaverId || '기본'})`, 'info');
              }
            }
          } catch (e) {
            console.warn('[multiAccountManager] catch ignored:', e);
          }

          updateMAStep('ma-step-image', 'completed');
          addMALog(`✅ ${generatedImages.length}개 이미지 준비 완료`, 'success');
          addProgressItem(`   ✅ ${generatedImages.length}개 이미지 준비 완료`, 'success');

        } catch (contentError) {
          updateMAStep('ma-step-content', 'error');
          addMALog(`❌ 콘텐츠 생성 실패: ${(contentError as Error).message}`, 'error');
          addProgressItem(`   ❌ 콘텐츠 생성 실패: ${(contentError as Error).message}`, 'error');
          totalFail++;

          // ✅ [2026-03-11 FIX] 치명적 API 에러(429/500/503) 시 전체 발행 중단
          // 연쇄 실패 방지 — 쿼타 초과/서버 장애 시 다음 계정도 같은 에러 발생
          if (isFatalApiError(contentError)) {
            const userMsg = friendlyErrorMessage(contentError);
            addMALog(`🚨 ${userMsg}`, 'error');
            addProgressItem(`🚨 ${userMsg}`, 'error');
            break;
          }

          continue; // 다음 대기열 항목으로
        }

        // 3. 발행 실행
        try {
          if (stopRequested || (window as any).stopFullAutoPublish) {
            break;
          }
          // 계정 자격증명 가져오기 (3/4 단계)
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
          // ✅ 3. 발행 전 CTA 최종 확인 (이전글 자동 연동)
          if (queueItem.ctaType === 'previous-post' && !queueItem.ctaUrl) {
            try {
              const catKey = String(queueItem.category || '').trim();
              const postsAll = loadGeneratedPosts();
              // ✅ [2026-02-26 FIX] 현재 발행 계정의 naverId로 필터링 (타계정 글 엮기 방지)
              const ctaAcctNaverId = (credResult?.credentials?.naverId || '').trim().toLowerCase();
              const published = (postsAll || []).filter((p: any) => {
                const hasUrl = String(p?.publishedUrl || '').trim().length > 0;
                const accountMatch = !ctaAcctNaverId || !p.naverId || p.naverId === ctaAcctNaverId;
                return hasUrl && accountMatch;
              });

              console.log(`[FullAuto] CTA 매칭 시작 - 카테고리: ${catKey}, 계정: ${ctaAcctNaverId || '미지정'}, 발행된 글 수: ${published.length}`);

              if (catKey && published.length > 0) {
                // 카테고리 매칭 로직 강화 (공백 제거, 대소문자 무시 등)
                const normCat = catKey.replace(/\s+/g, '').toLowerCase();
                const candidates = published.filter((p: any) => {
                  const pCat = String(p?.category || '').trim();
                  if (!pCat) return false;
                  const normPCat = pCat.replace(/\s+/g, '').toLowerCase();
                  return normPCat === normCat || normPCat.includes(normCat) || normCat.includes(normPCat);
                });

                console.log(`[FullAuto] 매칭된 후보 수: ${candidates.length}`);

                if (candidates.length > 0) {
                  candidates.sort((a: any, b: any) => {
                    const aT = new Date(a.publishedAt || a.updatedAt || a.createdAt || 0).getTime();
                    const bT = new Date(b.publishedAt || b.updatedAt || b.createdAt || 0).getTime();
                    return bT - aT;
                  });
                  const chosen = candidates[0];
                  queueItem.ctaUrl = String(chosen?.publishedUrl || '').trim();
                  queueItem.ctaText = `📖 ${chosen.title}`;
                  addMALog(`🔗 CTA 자동 연동: "${chosen.title}"`, 'info');
                  console.log(`[FullAuto] CTA 연동 완료: ${queueItem.ctaUrl}`);
                } else {
                  console.log('[FullAuto] 일치하는 카테고리의 이전 글을 찾지 못했습니다.');
                }
              }
            } catch (ctaErr) {
              console.warn('[FullAuto] CTA 자동 연동 실패:', ctaErr);
            }
          }

          // ✅ [2026-02-02 FIX] 이전글 엮기 자동 매칭 (CTA와 별개)
          // 쇼핑커넥트 모드이거나 이전글 엮기가 필요한 경우 자동으로 이전글 찾기
          const isShoppingConnectMode = !!(queueItem.affiliateLink && String(queueItem.affiliateLink).trim());
          const needsPreviousPostLookup = !((queueItem as any)?.previousPostUrl && String((queueItem as any).previousPostUrl).trim());

          if (needsPreviousPostLookup && (isShoppingConnectMode || queueItem.ctaType === 'previous-post')) {
            try {
              const catKey = String(queueItem.category || '').trim();
              const postsAll = loadGeneratedPosts();
              // ✅ [2026-02-26 FIX] 현재 발행 계정의 naverId로 필터링 (타계정 글 엮기 방지)
              const prevAcctNaverId = (credResult?.credentials?.naverId || '').trim().toLowerCase();
              const published = (postsAll || []).filter((p: any) => {
                const hasUrl = String(p?.publishedUrl || '').trim().length > 0;
                const accountMatch = !prevAcctNaverId || !p.naverId || p.naverId === prevAcctNaverId;
                return hasUrl && accountMatch;
              });

              console.log(`[FullAuto] 이전글 엮기 매칭 시작 - 카테고리: ${catKey}, 계정: ${prevAcctNaverId || '미지정'}, 발행된 글 수: ${published.length}, 쇼핑커넥트: ${isShoppingConnectMode}`);

              if (catKey && published.length > 0) {
                const normCat = catKey.replace(/\s+/g, '').toLowerCase();

                // 쇼핑커넥트 모드: 쇼핑커넥트 글 우선 매칭
                let candidates = published.filter((p: any) => {
                  const pCat = String(p?.category || '').trim();
                  if (!pCat) return false;
                  const normPCat = pCat.replace(/\s+/g, '').toLowerCase();
                  const categoryMatch = normPCat === normCat; // ✅ [2026-02-24 FIX] 정확히 같은 카테고리만 매칭 (includes 제거 → 다른 카테고리 엮기 방지)

                  if (isShoppingConnectMode) {
                    // 쇼핑커넥트 글 우선
                    const isPostShoppingConnect = !!(p.affiliateLink || p.contentMode === 'shopping-connect');
                    return categoryMatch && isPostShoppingConnect;
                  }
                  return categoryMatch;
                });

                // 쇼핑커넥트 글이 없으면 같은 카테고리 전체 글 검색
                if (candidates.length === 0 && isShoppingConnectMode) {
                  candidates = published.filter((p: any) => {
                    const pCat = String(p?.category || '').trim();
                    if (!pCat) return false;
                    const normPCat = pCat.replace(/\s+/g, '').toLowerCase();
                    return normPCat === normCat; // ✅ [2026-02-24 FIX] 정확히 같은 카테고리만 매칭
                  });
                }

                console.log(`[FullAuto] 이전글 매칭 후보 수: ${candidates.length}`);

                if (candidates.length > 0) {
                  candidates.sort((a: any, b: any) => {
                    const aT = new Date(a.publishedAt || a.updatedAt || a.createdAt || 0).getTime();
                    const bT = new Date(b.publishedAt || b.updatedAt || b.createdAt || 0).getTime();
                    return bT - aT;
                  });
                  const chosen = candidates[0];
                  if (isShoppingConnectMode) {
                    // ✅ 쇼핑커넥트: CTA=제휴링크, 이전글=별도 URL → previousPostUrl 설정
                    (queueItem as any).previousPostUrl = String(chosen?.publishedUrl || '').trim();
                    (queueItem as any).previousPostTitle = String(chosen?.title || '이전 글 보기').trim();
                  } else {
                    // ✅ [2026-02-18 FIX] ctaType='previous-post': CTA 자체가 이전글 → ctaUrl/ctaText 설정 (중복 방지)
                    (queueItem as any).ctaUrl = String(chosen?.publishedUrl || '').trim();
                    (queueItem as any).ctaText = `📖 추천 글: ${String(chosen?.title || '이전 글 보기').trim()}`;
                    (queueItem as any).previousPostTitle = String(chosen?.title || '이전 글 보기').trim();
                  }
                  addMALog(`📖 이전글 자동 매칭: "${chosen.title}"`, 'info');
                  console.log(`[FullAuto] 이전글 엮기 연동 완료: ${(queueItem as any).previousPostUrl || (queueItem as any).ctaUrl}`);
                } else {
                  console.log('[FullAuto] 일치하는 카테고리의 이전 글을 찾지 못했습니다.');
                }
              }
            } catch (prevPostErr) {
              console.warn('[FullAuto] 이전글 엮기 자동 연동 실패:', prevPostErr);
            }
          }

          // ✅ [2026-03-22 FIX] 발행 직전 예약시간이 처리 중 과거가 된 경우 자동 보정
          // 콘텐츠 생성 + 이미지 생성에 2~10분 소요되므로, 실제 IPC 호출 직전에 재검증
          if (queueItem.publishMode === 'schedule' && queueItem.scheduleDate && queueItem.scheduleTime) {
            const scheduledMoment = new Date(`${queueItem.scheduleDate}T${queueItem.scheduleTime}`);
            const now = new Date();
            if (scheduledMoment.getTime() <= now.getTime()) {
              const BUFFER_MS = 20 * 60 * 1000; // 20분 여유
              const corrected = new Date(now.getTime() + BUFFER_MS);
              // 10분 단위 올림 (네이버 서버 예약 호환)
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
          // ✅ [2026-03-22 FIX] 예약 모드 최종 시간 로깅 (디버깅용)
          if (queueItem.publishMode === 'schedule') {
            addMALog(`📅 예약 시간: ${queueItem.scheduleDate} ${queueItem.scheduleTime} (타입: ${queueItem.scheduleType || 'naver-server'})`, 'info');
          }
          addProgressItem(`   🚀 ${queueItem.accountName} 발행 중...`, 'info');

          // ✅ [2026-03-19 FIX] 다중계정 발행: generatedImages에서 thumbnailPath 추출
          // 단건/풀오토 발행은 filterImagesForPublish()로 처리하지만,
          // 다중계정 흐름은 독립 파이프라인이므로 직접 추출 필요
          let extractedThumbnailPath: string | undefined;
          if (Array.isArray(generatedImages) && generatedImages.length > 0) {
            const thumbImg = generatedImages.find((img: any) => img.isThumbnail === true);
            if (thumbImg) {
              extractedThumbnailPath = thumbImg.filePath || thumbImg.url || undefined;
              console.log(`[FullAuto] 🖼️ 썸네일 추출 (isThumbnail): ${extractedThumbnailPath?.substring(0, 80)}`);
            }
            if (!extractedThumbnailPath && generatedImages[0]) {
              // isThumbnail 플래그 없으면 첫 번째 이미지를 썸네일로 사용
              extractedThumbnailPath = generatedImages[0].filePath || generatedImages[0].url || undefined;
              console.log(`[FullAuto] 🖼️ 썸네일 폴백 (첫 이미지): ${extractedThumbnailPath?.substring(0, 80)}`);
            }
          }

          const publishOptions = {
            naverId: credResult.credentials.naverId,
            naverPassword: credResult.credentials.naverPassword,
            url: queueItem.sourceUrl || undefined,
            keywords: queueItem.sourceKeyword || undefined,
            generator: UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] 하드코딩 'gemini' 제거 → 사용자 선택 엔진 사용
            imageSource: queueItem.imageSource,
            toneStyle: queueItem.toneStyle,
            publishMode: queueItem.publishMode || 'publish',
            // ✅ [2026-03-24 FIX v2] 단일 Date 인스턴스 공유 — 자정 경계 불일치 방지
            ...(() => {
                if (queueItem.publishMode !== 'schedule') return { scheduleDate: undefined, scheduleTime: undefined };
                if (queueItem.scheduleDate && queueItem.scheduleTime) return { scheduleDate: queueItem.scheduleDate, scheduleTime: queueItem.scheduleTime };
                // 누락 시 30분 후 자동 생성 (단일 인스턴스로 날짜/시간 일관성 보장)
                const fb = new Date(Date.now() + 30 * 60 * 1000);
                const cm = Math.ceil(fb.getMinutes() / 10) * 10;
                fb.setMinutes(cm >= 60 ? 0 : cm, 0, 0);
                if (cm >= 60) fb.setHours(fb.getHours() + 1);
                return {
                    scheduleDate: queueItem.scheduleDate || `${fb.getFullYear()}-${String(fb.getMonth()+1).padStart(2,'0')}-${String(fb.getDate()).padStart(2,'0')}`,
                    scheduleTime: queueItem.scheduleTime || `${String(fb.getHours()).padStart(2,'0')}:${String(fb.getMinutes()).padStart(2,'0')}`,
                };
            })(),
            scheduleType: queueItem.scheduleType || 'naver-server',
            scheduleInterval: queueItem.scheduleInterval, // ✅ [2026-02-08 FIX] 계정 간 발행 간격
            categoryName: String(queueItem.realCategoryName || '').trim() || undefined, // ✅ [2026-02-09 FIX] 실제 블로그 카테고리(폴더) 이름 사용 (콘텐츠 카테고리 아님)
            category: queueItem.category || undefined, // ✅ 콘텐츠 카테고리 (CTA 이전글 찾기용)
            // ✅ [2026-02-03 FIX] CTA 설정 - ctaType === 'none'일 때도 skipCta 적용
            skipCta: queueItem.ctaType === 'none' || (queueItem as any)?.formData?.skipCta === true || (queueItem as any)?.skipCta === true,
            ctaPosition: ((queueItem as any)?.formData?.ctaPosition as 'top' | 'middle' | 'bottom' | 'each-heading') || 'bottom',
            ctas: (() => {
              const fromForm = Array.isArray((queueItem as any)?.formData?.ctas) ? (queueItem as any).formData.ctas : [];
              const list = fromForm
                .map((c: any) => ({ text: String(c?.text || '').trim(), link: String(c?.link || '').trim() || undefined }))
                .filter((c: any) => Boolean(c.text));
              if (list.length > 0) return list;
              const t = String(((queueItem as any)?.formData?.ctaText ?? queueItem.ctaText) || '').trim();
              const l = String(((queueItem as any)?.formData?.ctaLink ?? (queueItem as any)?.formData?.ctaUrl ?? queueItem.ctaUrl) || '').trim();
              return t ? [{ text: t, link: l || undefined }] : [];
            })(),
            ctaText: String(((queueItem as any)?.formData?.ctaText ?? queueItem.ctaText) || '').trim() || undefined,
            ctaLink: String(((queueItem as any)?.formData?.ctaLink ?? (queueItem as any)?.formData?.ctaUrl ?? queueItem.ctaUrl) || '').trim() || undefined,
            preGeneratedContent: structuredContent ? {
              // ✅ [2026-02-26 FIX] 제목 오염 방지: 항상 structuredContent.selectedTitle 우선 사용
              // 이전: queueItem.title || formData.title || selectedTitle → 이전 발행의 title이 잔존하여 오염
              // 수정: selectedTitle만 사용하여 현재 생성된 콘텐츠의 제목을 정확하게 전달
              title: String(structuredContent.selectedTitle || '').trim(),
              content: structuredContent.bodyPlain || structuredContent.content,
              hashtags: (structuredContent.hashtags || []).join(' '),
              structuredContent: structuredContent,
              generatedImages: generatedImages,
            } : null,
            keepBrowserOpen: true, // ✅ 항상 브라우저 세션 유지
            includeThumbnailText: queueItem.includeThumbnailText ?? false,
            contentMode: queueItem.contentMode,      // ✅ [2026-01-20] 쇼핑커넥트 모드 전달
            affiliateLink: queueItem.affiliateLink,  // ✅ [2026-01-20] 제휴 링크 전달
            videoOption: queueItem.videoOption,      // ✅ [2026-01-20] VEO 영상 변환 옵션
            useAiImage: queueItem.useAiImage ?? true, // ✅ [2026-01-20] AI 이미지 생성 사용 여부
            createProductThumbnail: queueItem.createProductThumbnail ?? false, // ✅ [2026-01-20] 제품 썸네일 합성
            scSubImageSource: localStorage.getItem('scSubImageSource') || 'collected', // ✅ [2026-02-16 FIX] 수집이미지 직접 사용 설정 전달
            collectedImages: structuredContent?.collectedImages || [],          // ✅ [2026-02-16 FIX] 수집 이미지 직접 전달
            // ✅ [2026-02-02 FIX] 이전글 엮기 필드 추가 (기존 누락으로 인한 버그 수정)
            previousPostUrl: (queueItem as any)?.previousPostUrl || undefined,
            previousPostTitle: (queueItem as any)?.previousPostTitle || undefined,
            thumbnailPath: extractedThumbnailPath || undefined, // ✅ [2026-03-19 FIX] 다중계정 썸네일 경로 전달
          };

          console.log('[FullAuto] 발행 옵션:', publishOptions);
          console.log(`[🔍 DIAG-2 IPC전달] publishMode=${publishOptions.publishMode}, scheduleDate=${publishOptions.scheduleDate}, scheduleTime=${publishOptions.scheduleTime}, scheduleType=${publishOptions.scheduleType}`);
          const result = await window.api.multiAccountPublish([queueItem.accountId], publishOptions);
          console.log('[FullAuto] 발행 결과:', result);

          if (stopRequested || (window as any).stopFullAutoPublish) {
            break;
          }

          if (result.success && result.results?.[0]?.success) {
            updateMAStep('ma-step-publish', 'completed');

            // ✅ 발행 URL을 생성된 글 목록에 저장 (유기적 연동)
            const publishedUrl = result.results?.[0]?.url;
            if (publishedUrl && structuredContent?.selectedTitle) {
              const today = new Date();
              savePublishedPost(today, structuredContent.selectedTitle, publishedUrl);

              // 제목으로 글 찾아서 URL 저장 (postId가 없을 때만 폴백)
              if (!generatedPostId) {
                const posts = loadGeneratedPosts();
                const matchingPost = posts.find(p => p.title === structuredContent.selectedTitle && !p.publishedUrl);
                if (matchingPost) {
                  updatePostAfterPublish(matchingPost.id, publishedUrl, queueItem.publishMode);
                  addMALog(`📎 발행 URL 저장됨: ${publishedUrl}`, 'info');
                }
              }
            }

            // ✅ 이번 다중계정 항목의 postId가 있으면 해당 글에 URL/이미지 확정 저장
            try {
              if (generatedPostId && publishedUrl) {
                updatePostAfterPublish(generatedPostId, publishedUrl, queueItem.publishMode);
                updatePostImages(generatedPostId, generatedImages);
              }
            } catch (e) {
              console.warn('[multiAccountManager] catch ignored:', e);
            }

            addMALog(`✅ ${queueItem.accountName}: 발행 성공!`, 'success');
            addProgressItem(`✅ [${i + 1}/${totalItems}] ${queueItem.accountName}: 발행 성공!`, 'success');
            totalSuccess++;

            // ✅ [2026-03-20 FIX] 이전글 체이닝: 다중계정 발행 시 방금 발행한 URL을 다음 아이템에 전달
            // 첫 글 → 선택한 글 또는 카테고리 최신글, 2번째부터 → 방금 발행한 글
            // ⚠️ 크로스계정 방지: 같은 계정(accountName)의 다음 아이템에만 체이닝
            // (A계정 발행글이 B계정에 엮이는 것을 방지)
            if (queueItem.ctaType === 'previous-post' && publishedUrl) {
              for (let j = i + 1; j < publishQueue.length; j++) {
                const nextItem = publishQueue[j];
                if (nextItem.ctaType === 'previous-post' && nextItem.accountName === queueItem.accountName) {
                  const validChainUrl = publishedUrl.startsWith('http') ? publishedUrl : '';
                  (nextItem as any).ctaUrl = validChainUrl;
                  (nextItem as any).ctaLink = validChainUrl;  // ✅ [2026-03-20 FIX] ctaLink도 동기화
                  (nextItem as any).ctaText = `📖 추천 글: ${structuredContent?.selectedTitle || '이전 글'}`;
                  (nextItem as any).previousPostUrl = validChainUrl;
                  (nextItem as any).previousPostTitle = structuredContent?.selectedTitle || '이전 글';
                  console.log(`[FullAuto] 🔗 이전글 체이닝: 대기열[${j}] (${nextItem.accountName})에 URL 전달 → ${publishedUrl}`);
                  addMALog(`🔗 이전글 체이닝: ${nextItem.accountName}의 다음 항목에 방금 발행한 URL 전달`, 'info');
                  break; // 같은 계정의 바로 다음 아이템 1개만
                }
              }
            }
          } else {
            throw new Error(result.results?.[0]?.message || '발행 실패');
          }
        } catch (error) {
          updateMAStep('ma-step-publish', 'error');
          addMALog(`❌ ${queueItem.accountName}: ${(error as Error).message}`, 'error');
          addProgressItem(`❌ [${i + 1}/${totalItems}] ${queueItem.accountName}: ${(error as Error).message}`, 'error');
          totalFail++;
        }

        // 다음 항목 발행 전 대기 (마지막 항목 제외)
        if (i < publishQueue.length - 1 && !stopRequested && !(window as any).stopFullAutoPublish) {

          // ✅ [2026-03-11] ADB IP 변경 (N번째 발행마다 실행)
          try {
            const adbEnabled = localStorage.getItem('adbIpChangeEnabled') === 'true';
            const adbEvery = Math.max(1, parseInt(localStorage.getItem('adbIpChangeEvery') || '1'));
            const publishedCount = i + 1; // 현재까지 발행 완료된 수

            if (adbEnabled && publishedCount % adbEvery === 0) {
              updateMAProgress(i + 1, totalItems, '📱 IP 변경 중...', '📱 ADB 비행기모드 IP 변경 중...');
              addMALog(`📱 ADB IP 변경 시작 (${publishedCount}번째 발행 완료 후)...`, 'info');
              addProgressItem(`📱 ADB IP 변경 중...`, 'info');

              const adbResult = await window.api.adbChangeIp(5);
              if (adbResult.success) {
                addMALog(`✅ IP 변경 성공: ${adbResult.oldIp} → ${adbResult.newIp}`, 'success');
                addProgressItem(`✅ IP 변경: ${adbResult.oldIp} → ${adbResult.newIp}`, 'success');
              } else {
                addMALog(`⚠️ IP 변경 실패: ${adbResult.message}`, 'warning');
                addProgressItem(`⚠️ IP 변경 실패: ${adbResult.message}`, 'warning');
                // IP 변경 실패해도 발행은 계속 진행
              }
            }
          } catch (adbErr) {
            console.error('[FullAuto] ADB IP 변경 오류:', adbErr);
            addMALog(`⚠️ ADB IP 변경 오류: ${(adbErr as Error).message}`, 'warning');
          }

          if (intervalSeconds > 0) {
            const waitMsg = formatWaitTime(intervalSeconds);
            updateMAProgress(i + 1, totalItems, '대기 중...', `⏳ 다음 발행까지 ${waitMsg} 대기`);
            addMALog(`⏳ 다음 발행까지 ${waitMsg} 대기...`, 'info');
            addProgressItem(`⏳ 다음 발행까지 ${waitMsg} 대기...`, 'info');
            const ok = await waitInterruptible(intervalSeconds, i, totalItems);
            if (!ok) {
              break;
            }
          }
        }
      }
    } finally {
      isPublishing = false;
      const wasStopped = stopRequested || (window as any).stopFullAutoPublish;

      // ✅ [2026-03-18] 발행 종료 → 플로팅 바 즉시 제거 (updateMAProgress보다 먼저!)
      destroyMAFloatingBar();

      if (!wasStopped) {
        publishQueue = [];
        renderQueue();
      }

      updateMAProgress(totalItems, totalItems, '완료', wasStopped ? '⏹️ 발행이 중지되었습니다.' : '🎉 모든 발행 완료!');
      addMALog(wasStopped ? '⏹️ 발행이 중지되었습니다.' : `🎉 모든 발행 완료! (성공: ${totalSuccess}, 실패: ${totalFail})`, wasStopped ? 'warning' : 'success');

      // ✅ [2026-01-29 개선] 발행 완료 후 전체 상태 초기화
      try {
        console.log('[FullAuto] 🧹 발행 완료 → 전체 상태 초기화 시작...');

        // ✅ 통합 초기화 함수 호출
        if (typeof (window as any).resetAfterPublish === 'function') {
          (window as any).resetAfterPublish();
        }

        // 추가 정리: 다중계정 특화 상태
        (window as any).imageManagementGeneratedImages = [];
        (window as any).maPresetThumbnail = null;
        (window as any).maPresetThumbnailPath = null;

        // ImageManager 초기화
        if (typeof ImageManager !== 'undefined') {
          ImageManager.clearAll(); // ✅ [2026-03-29 FIX] clear→clearAll (currentStructuredContent도 초기화)
        }

        console.log('[FullAuto] ✅ 전체 상태 초기화 완료 → 새 발행 준비 완료');
      } catch (memErr) {
        console.warn('[FullAuto] 상태 초기화 중 오류:', memErr);
      }

      // ✅ [2026-03-07 FIX] 자동 닫기 제거 → 사용자가 결과 확인 후 직접 닫기
      showMAResult(totalSuccess, totalFail);
      // ✅ [2026-03-10 FIX] showMACompletion() 제거 — 존재하지 않는 함수 호출으로 인해
      // finally 블록이 크래시되어 이후 UI 정리(버튼 복원, 토스트, 글 목록 갱신)가 전부 스킵되는 치명적 버그 수정

      // ✅ [2026-03-10 FIX] UI 정리를 try-catch로 감싸서 개별 실패가 전체 정리를 방해하지 않도록 보호
      try {
        // 중지/닫기 버튼 전환
        const progressStopBtn = document.getElementById('ma-progress-stop-btn');
        const progressCloseBtn = document.getElementById('ma-progress-close-btn');
        if (progressStopBtn) progressStopBtn.style.display = 'none';
        if (progressCloseBtn) {
          progressCloseBtn.style.display = 'flex';
          if (!progressCloseBtn.hasAttribute('data-listener-added')) {
            progressCloseBtn.setAttribute('data-listener-added', 'true');
            progressCloseBtn.addEventListener('click', () => {
              hideMAFloatingBar(); // ✅ [2026-03-18] 명시적 플로팅 바 숨김 (Bug #2 방어)
              hideMAProgressModal();
            });
          }
        }
      } catch (btnErr) {
        console.warn('[FullAuto] 버튼 전환 오류:', btnErr);
      }

      try {
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.innerHTML = startBtnOriginalHtml || '<span style="font-size: 1.25rem;">🚀</span> 대기열 발행 시작';
        }
      } catch (startBtnErr) {
        console.warn('[FullAuto] 시작 버튼 복원 오류:', startBtnErr);
      }

      if (wasStopped) {
        toastManager.warning(`대기열 발행 중지됨 (성공: ${totalSuccess}개, 실패: ${totalFail}개)`);
      } else {
        toastManager.success(`대기열 발행 완료! 성공: ${totalSuccess}개, 실패: ${totalFail}개`);
      }

      // ✅ [2026-01-23 FIX] 다중계정 발행 완료 후 글 목록 UI 갱신
      try {
        refreshGeneratedPostsList();
        console.log('[FullAuto] ✅ 생성된 글 목록 UI 갱신 완료');
      } catch (e) {
        console.warn('[FullAuto] 글 목록 갱신 실패:', e);
      }
    }
  });

  // ✅ [2026-03-07 FIX] 공통 중지 핸들러 (Bug #5: 중복 코드 통합)
  async function handleStopPublish() {
    stopRequested = true;
    isPublishing = false; // ✅ [2026-03-11 FIX] 즉시 발행 상태 해제 — 중지 후 재발행 가능하도록
    (window as any).stopFullAutoPublish = true;

    // ✅ [2026-03-18 FIX] 중지 시 플로팅 바 즉시 제거 (DOM까지 정리)
    destroyMAFloatingBar();

    // ✅ 다중계정 발행 즉시 중지 (모든 브라우저 강제 종료)
    try {
      await window.api.multiAccountCancel();
    } catch (e) {
      // 무시
    }

    // ✅ [2026-03-11 FIX] 일반 자동화도 취소 (cancelAutomation 누락 수정)
    try {
      await window.api.cancelAutomation();
    } catch (e) {
      // 무시
    }

    // ✅ [2026-03-11 FIX] resetAfterPublish 제거 — 중지 직후 호출 시 stopFullAutoPublish 소실 방지
    // 좀비 타이머/인터벌만 개별 정리
    try {
      const ws = window as any;
      if (ws.publishTimeoutId) { clearTimeout(ws.publishTimeoutId); ws.publishTimeoutId = null; }
      if (ws.progressIntervalId) { clearInterval(ws.progressIntervalId); ws.progressIntervalId = null; }
    } catch (e) {
      console.warn('[handleStopPublish] 타이머 정리 오류:', e);
    }

    // ✅ UI 즉시 리셋 (발행 중 상태 해제)
    const startBtn = document.getElementById('ma-start-publish-btn') as HTMLButtonElement | null;
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = '<span style="font-size: 1.25rem;">🚀</span> 대기열 발행 시작';
    }

    // 버튼 전환: 중지→닫기
    const stopBtn = document.getElementById('ma-progress-stop-btn');
    const closeBtn = document.getElementById('ma-progress-close-btn');
    const completeBtn = document.getElementById('ma-progress-complete-btn');
    if (stopBtn) stopBtn.style.display = 'none';
    if (closeBtn) {
      closeBtn.style.display = 'flex';
      if (!closeBtn.hasAttribute('data-listener-added')) {
        closeBtn.setAttribute('data-listener-added', 'true');
        closeBtn.addEventListener('click', () => {
          hideMAProgressModal();
        });
      }
    }
    if (completeBtn) completeBtn.style.display = 'none';

    addMALog('⏹️ 발행이 강제 중지되었습니다.', 'warning');
    toastManager.warning('발행이 강제 중지되었습니다.');
  }

  // 발행 중지 (두 버튼 모두 동일 핸들러)
  document.getElementById('ma-stop-publish-btn')?.addEventListener('click', handleStopPublish);
  document.getElementById('ma-progress-stop-btn')?.addEventListener('click', handleStopPublish);

  // ✅ [2026-01-27] 이벤트 위임: 동적 버튼들을 위한 폴백 핸들러
  // - ma-fullauto-btn (풀오토 세팅)
  // - ma-add-account-btn (계정 추가)
  // - ma-edit-btn, ma-delete-btn (편집/삭제)
  const multiAccountModalDelegation = document.getElementById('multi-account-modal');
  if (multiAccountModalDelegation) {
    multiAccountModalDelegation.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // 풀오토 세팅 버튼
      if (target.classList.contains('ma-fullauto-btn') || target.closest('.ma-fullauto-btn')) {
        const btn = target.classList.contains('ma-fullauto-btn') ? target : target.closest('.ma-fullauto-btn') as HTMLElement;
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

      // 계정 추가 버튼
      if (target.id === 'ma-add-account-btn' || target.closest('#ma-add-account-btn')) {
        e.stopPropagation();
        console.log('[MultiAccountPublish] 이벤트 위임: 계정 추가 클릭');
        openAccountEditModal();
        return;
      }

      // 편집 버튼
      if (target.classList.contains('ma-edit-btn') || target.closest('.ma-edit-btn')) {
        const btn = target.classList.contains('ma-edit-btn') ? target : target.closest('.ma-edit-btn') as HTMLElement;
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

      // 삭제 버튼
      if (target.classList.contains('ma-delete-btn') || target.closest('.ma-delete-btn')) {
        const btn = target.classList.contains('ma-delete-btn') ? target : target.closest('.ma-delete-btn') as HTMLElement;
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

// DOM 로드 시 다중계정 모달 초기화
document.addEventListener('DOMContentLoaded', () => {
  initMultiAccountPublishModal();
  initMainAccountSelector();
});

// ✅ 메인 대시보드 계정 선택 및 세션 관리
export function initMainAccountSelector() {
  const accountSelector = document.getElementById('main-account-selector') as HTMLSelectElement;
  const addAccountBtn = document.getElementById('main-add-account-btn');
  const selectedAccountInfo = document.getElementById('selected-account-info');
  const selectedAccountName = document.getElementById('selected-account-name');
  const saveSessionBtn = document.getElementById('save-session-btn');
  const loadSessionBtn = document.getElementById('load-session-btn');
  const clearSessionBtn = document.getElementById('clear-session-btn');
  const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
  const naverPwInput = document.getElementById('naver-password') as HTMLInputElement;

  if (!accountSelector) return;

  // 현재 선택된 계정 ID
  let currentAccountId: string | null = null;

  // ✅ 계정 목록을 리렌더링할 때 change 핸들러가 의도치 않게 실행되어 세션이 날아가는 현상 방지
  let isRefreshingAccountList = false;

  let refreshAccountListTimer: any = null;
  let lastMultiAccountModalVisible = false;

  const scheduleAccountListRefresh = () => {
    try {
      if (refreshAccountListTimer) clearTimeout(refreshAccountListTimer);
    } catch (e) {
      console.warn('[multiAccountManager] catch ignored:', e);
    }
    refreshAccountListTimer = setTimeout(() => {
      loadAccountList();
    }, 250);
  };

  // 계정별 세션 데이터 저장소 (메모리)
  const accountSessions: Map<string, any> = new Map();

  // 계정 목록 로드
  async function loadAccountList() {
    try {
      const previousValue = accountSelector.value;
      isRefreshingAccountList = true;
      const result = await window.api.getAllBlogAccounts();
      if (result.success && result.accounts) {
        accountSelector.innerHTML = '<option value="">직접 입력</option>';
        result.accounts.forEach((account: any) => {
          const option = document.createElement('option');
          option.value = account.id;
          option.textContent = `👤 ${account.name}`;
          accountSelector.appendChild(option);
        });

        // ✅ 가능한 경우 기존 선택값 유지
        if (previousValue && Array.from(accountSelector.options).some(o => o.value === previousValue)) {
          accountSelector.value = previousValue;
        }
      }
    } catch (error) {
      console.error('[MainAccountSelector] 계정 목록 로드 실패:', error);
    } finally {
      isRefreshingAccountList = false;
    }
  }

  // ✅ 1개 계정 탭 드롭다운 새로고침 함수 글로벌 노출 (계정 동기화용)
  (window as any).loadMainAccountList = loadAccountList;

  // 현재 UI 상태 수집
  function collectCurrentSession(): any {
    return {
      // 제목/키워드/URL
      title: (document.getElementById('unified-title') as HTMLInputElement)?.value || '',
      keywords: (document.getElementById('unified-keywords') as HTMLInputElement)?.value || '',
      urls: Array.from(document.querySelectorAll('.unified-url-input') as NodeListOf<HTMLInputElement>).map(el => el.value).filter(v => v),

      // 생성된 콘텐츠
      generatedTitle: (document.getElementById('unified-generated-title') as HTMLInputElement)?.value || '',
      generatedContent: (document.getElementById('unified-generated-content') as HTMLTextAreaElement)?.value || '',
      generatedHashtags: (document.getElementById('unified-generated-hashtags') as HTMLInputElement)?.value || '',

      // 설정
      generator: UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] perplexity 지원
      publishMode: (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value || 'publish',
      toneStyle: (document.getElementById('unified-tone-style') as HTMLSelectElement)?.value || 'friendly',
      imageSource: (document.getElementById('unified-image-source') as HTMLSelectElement)?.value || 'gemini',

      // CTA 설정
      ctaText: (document.getElementById('unified-cta-text') as HTMLInputElement)?.value || '',
      ctaLink: (document.getElementById('unified-cta-link') as HTMLInputElement)?.value || '',
      ctas: readUnifiedCtasFromUi(),
      skipCta: (document.getElementById('unified-skip-cta') as HTMLInputElement)?.checked || false,

      // 타임스탬프
      savedAt: new Date().toISOString(),
    };
  }

  // UI 상태 복원
  function restoreSession(session: any) {
    if (!session) return;

    // 제목/키워드
    const titleInput = document.getElementById('unified-title') as HTMLInputElement;
    const keywordsInput = document.getElementById('unified-keywords') as HTMLInputElement;
    if (titleInput) titleInput.value = session.title || '';
    if (keywordsInput) keywordsInput.value = session.keywords || '';

    // URL 필드
    const urlInputs = document.querySelectorAll('.unified-url-input') as NodeListOf<HTMLInputElement>;
    if (urlInputs[0] && session.urls?.[0]) urlInputs[0].value = session.urls[0];

    // 생성된 콘텐츠
    const genTitle = document.getElementById('unified-generated-title') as HTMLInputElement;
    const genContent = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
    const genHashtags = document.getElementById('unified-generated-hashtags') as HTMLInputElement;
    if (genTitle) genTitle.value = session.generatedTitle || '';
    if (genContent) genContent.value = session.generatedContent || '';
    if (genHashtags) genHashtags.value = session.generatedHashtags || '';

    // 설정
    const generator = document.getElementById('unified-generator') as HTMLSelectElement;
    const publishMode = document.getElementById('unified-publish-mode') as HTMLInputElement;
    const toneStyle = document.getElementById('unified-tone-style') as HTMLSelectElement;
    const imageSource = document.getElementById('unified-image-source') as HTMLSelectElement;
    if (generator) generator.value = session.generator || 'gemini';
    if (publishMode) publishMode.value = session.publishMode || 'publish';
    if (toneStyle) toneStyle.value = session.toneStyle || 'friendly';
    if (imageSource) imageSource.value = session.imageSource || 'gemini';

    // CTA 설정
    const ctaText = document.getElementById('unified-cta-text') as HTMLInputElement;
    const ctaLink = document.getElementById('unified-cta-link') as HTMLInputElement;
    const skipCta = document.getElementById('unified-skip-cta') as HTMLInputElement;
    if (ctaText) ctaText.value = session.ctaText || '';
    if (ctaLink) ctaLink.value = session.ctaLink || '';
    if (skipCta) skipCta.checked = session.skipCta || false;

    // ✅ 다중 CTA 복원 (컨테이너가 있는 경우)
    try {
      const container = document.getElementById('unified-cta-items-container');
      if (container && Array.isArray(session.ctas)) {
        container.innerHTML = '';
        for (const c of session.ctas) {
          const text = String((c as any)?.text || '').trim();
          const link = String((c as any)?.link || '').trim();
          if (!text) continue;
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
    } catch (e) {
      console.warn('[multiAccountManager] catch ignored:', e);
    }
  }

  // UI 초기화
  function clearSession() {
    // 제목/키워드
    const titleInput = document.getElementById('unified-title') as HTMLInputElement;
    const keywordsInput = document.getElementById('unified-keywords') as HTMLInputElement;
    if (titleInput) titleInput.value = '';
    if (keywordsInput) keywordsInput.value = '';

    // URL 필드
    const urlInputs = document.querySelectorAll('.unified-url-input') as NodeListOf<HTMLInputElement>;
    urlInputs.forEach(input => input.value = '');

    // 생성된 콘텐츠
    const genTitle = document.getElementById('unified-generated-title') as HTMLInputElement;
    const genContent = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
    const genHashtags = document.getElementById('unified-generated-hashtags') as HTMLInputElement;
    if (genTitle) genTitle.value = '';
    if (genContent) genContent.value = '';
    if (genHashtags) genHashtags.value = '';

    // CTA 설정
    const ctaText = document.getElementById('unified-cta-text') as HTMLInputElement;
    const ctaLink = document.getElementById('unified-cta-link') as HTMLInputElement;
    const skipCta = document.getElementById('unified-skip-cta') as HTMLInputElement;
    if (ctaText) ctaText.value = '';
    if (ctaLink) ctaLink.value = '';
    if (skipCta) skipCta.checked = false;
  }

  // 계정 선택 변경
  accountSelector.addEventListener('change', async () => {
    if (isRefreshingAccountList) return;
    const selectedId = accountSelector.value;

    // 이전 계정 세션 저장
    if (currentAccountId) {
      accountSessions.set(currentAccountId, collectCurrentSession());
    }

    if (selectedId) {
      // 계정 선택됨
      currentAccountId = selectedId;

      // 계정 정보 가져오기
      const result = await window.api.getAllBlogAccounts();
      const account = result.accounts?.find((a: any) => a.id === selectedId);

      if (account) {
        (window as any).currentMainAccountSettings = account.settings || {};
        // 선택된 계정 정보 표시
        if (selectedAccountInfo) selectedAccountInfo.style.display = 'block';
        if (selectedAccountName) selectedAccountName.textContent = account.name;

        // 로그인 정보 채우기
        const credResult = await window.api.getAccountCredentials(selectedId);
        if (credResult.success && credResult.credentials) {
          if (naverIdInput) naverIdInput.value = credResult.credentials.naverId || '';
          if (naverPwInput) naverPwInput.value = credResult.credentials.naverPassword || '';
        }

        // 저장된 세션이 있으면 복원, 없으면 초기화
        if (accountSessions.has(selectedId)) {
          restoreSession(accountSessions.get(selectedId));
          toastManager.info(`📂 ${account.name} 계정의 이전 세션을 불러왔습니다.`);
        } else {
          clearSession();
          toastManager.info(`👤 ${account.name} 계정으로 전환되었습니다. 새로운 세션입니다.`);
        }
      }
    } else {
      // 직접 입력 모드
      currentAccountId = null;
      (window as any).currentMainAccountSettings = null;
      if (selectedAccountInfo) selectedAccountInfo.style.display = 'none';
      clearSession();
      if (naverIdInput) naverIdInput.value = '';
      if (naverPwInput) naverPwInput.value = '';
      toastManager.info('📝 직접 입력 모드로 전환되었습니다.');
    }
  });

  // 계정 추가 버튼 - 다중계정 모달 열기
  addAccountBtn?.addEventListener('click', () => {
    if (typeof (window as any).openAccountEditModal === 'function') {
      (window as any).openAccountEditModal();
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

  // 세션 저장 버튼
  saveSessionBtn?.addEventListener('click', () => {
    if (!currentAccountId) {
      toastManager.warning('계정을 먼저 선택해주세요.');
      return;
    }
    accountSessions.set(currentAccountId, collectCurrentSession());
    toastManager.success('💾 현재 세션이 저장되었습니다.');
  });

  // 세션 불러오기 버튼
  loadSessionBtn?.addEventListener('click', () => {
    if (!currentAccountId) {
      toastManager.warning('계정을 먼저 선택해주세요.');
      return;
    }
    if (accountSessions.has(currentAccountId)) {
      restoreSession(accountSessions.get(currentAccountId));
      toastManager.success('📂 저장된 세션을 불러왔습니다.');
    } else {
      toastManager.warning('저장된 세션이 없습니다.');
    }
  });

  // 세션 초기화 버튼
  clearSessionBtn?.addEventListener('click', () => {
    if (confirm('현재 세션을 초기화하시겠습니까?\n입력된 모든 내용이 삭제됩니다.')) {
      clearSession();
      if (currentAccountId) {
        accountSessions.delete(currentAccountId);
      }
      toastManager.success('🗑️ 세션이 초기화되었습니다.');
    }
  });

  // 초기 로드
  loadAccountList();

  // ✅ [2026-03-11] ADB IP 변경 설정 → 환경설정 모달(settingsModal.ts)로 이전됨


  // 다중계정 모달에서 계정 추가/삭제 시 목록 새로고침
  const observer = new MutationObserver(() => {
    if (!multiAccountModal) return;
    const el = multiAccountModal as HTMLElement;
    const isVisible = el.style.display !== 'none' && getComputedStyle(el).display !== 'none';

    // ✅ 모달이 닫힐 때 1회만 새로고침 (열림/애니메이션 중 잦은 트리거 방지)
    if (lastMultiAccountModalVisible && !isVisible) {
      scheduleAccountListRefresh();
    }
    lastMultiAccountModalVisible = isVisible;
  });

  const multiAccountModal = document.getElementById('multi-account-modal');
  if (multiAccountModal) {
    try {
      const el = multiAccountModal as HTMLElement;
      lastMultiAccountModalVisible = el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
    } catch {
      lastMultiAccountModalVisible = false;
    }
    observer.observe(multiAccountModal, { attributes: true, attributeFilter: ['style'] });
  }

  console.log('[MainAccountSelector] 메인 계정 선택기 초기화 완료');
}
