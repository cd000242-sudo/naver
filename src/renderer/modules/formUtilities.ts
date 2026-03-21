/**
 * formUtilities.ts — renderer.ts에서 추출한 폼/입력 유틸리티 모듈
 * initCredentialsSave, initTitleGeneration, initCharCountDisplay, initImageManagementTab
 * @module formUtilities
 * @since 2026-02-24
 */
// ============================================
// 아이디/비밀번호 저장 기능
// ============================================
export async function initCredentialsSave(): Promise<void> {
  // DOM 요소가 로드될 때까지 잠시 대기
  await new Promise(resolve => setTimeout(resolve, 200));

  // 통합 탭의 네이버 계정 필드 사용
  const rememberCheckbox = document.getElementById('remember-credentials') as HTMLInputElement;
  const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
  const naverPasswordInput = document.getElementById('naver-password') as HTMLInputElement;

  if (!rememberCheckbox || !naverIdInput || !naverPasswordInput) {
    console.error('[자격증명] 필수 DOM 요소를 찾을 수 없습니다.');
    return;
  }

  // 저장된 자격증명 로드
  try {
    const config = await window.api.getConfig();
    console.log('[자격증명] 설정 로드됨:', {
      savedNaverId: config.savedNaverId ? '있음' : '없음',
      savedNaverPassword: config.savedNaverPassword ? '있음' : '없음',
      rememberCredentials: config.rememberCredentials
    });

    // ✅ 저장된 값이 있으면 무조건 로드 (rememberCredentials 체크 여부와 관계없이)
    if (config.savedNaverId || config.savedNaverPassword) {
      // 체크박스 자동 체크
      rememberCheckbox.checked = true;

      // 저장된 값 표시
      if (config.savedNaverId) {
        naverIdInput.value = config.savedNaverId;
        console.log('[자격증명] 네이버 아이디 자동 입력:', config.savedNaverId.substring(0, 3) + '***');
      }

      if (config.savedNaverPassword) {
        naverPasswordInput.value = config.savedNaverPassword;
        console.log('[자격증명] 네이버 비밀번호 자동 입력: ***');
      }
    } else {
      console.log('[자격증명] 저장된 네이버 계정 정보가 없습니다.');
    }
  } catch (error) {
    console.error('[자격증명] 로드 실패:', error);
  }

  // 저장 체크박스 변경 시 자동 저장
  if (rememberCheckbox) {
    rememberCheckbox.addEventListener('change', async () => {
      try {
        const config = await window.api.getConfig();

        if (rememberCheckbox.checked) {
          // ✅ 체크 시: 현재 입력된 값 저장
          const updatedConfig: any = {
            ...config,
            rememberCredentials: true,
            savedNaverId: naverIdInput?.value.trim() || config.savedNaverId,
            savedNaverPassword: naverPasswordInput?.value.trim() || config.savedNaverPassword,
          };
          await window.api.saveConfig(updatedConfig);
          (window as any).toastManager.success('✅ 네이버 계정 정보가 저장되었습니다.');
        } else {
          // ✅ 체크 해제 시: 저장된 값 삭제
          const updatedConfig: any = {
            ...config,
            rememberCredentials: false,
            savedNaverId: undefined,
            savedNaverPassword: undefined,
          };
          await window.api.saveConfig(updatedConfig);
          // 입력 필드도 초기화
          if (naverIdInput) naverIdInput.value = '';
          if (naverPasswordInput) naverPasswordInput.value = '';
          (window as any).toastManager.info('네이버 계정 정보 저장이 해제되었습니다.');
        }
      } catch (error) {
        console.error('[자격증명] 저장 실패:', error);
        (window as any).toastManager.error('계정 정보 저장에 실패했습니다.');
      }
    });
  }

  // 아이디/비밀번호 입력 시 자동 저장 (체크박스가 체크되어 있을 때만)
  if (naverIdInput) {
    let saveTimeout: NodeJS.Timeout | null = null;
    naverIdInput.addEventListener('input', () => {
      if (rememberCheckbox?.checked) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          try {
            const config = await window.api.getConfig();
            const updatedConfig: any = {
              ...config,
              savedNaverId: naverIdInput.value.trim() || undefined,
            };
            await window.api.saveConfig(updatedConfig);
            console.log('[자격증명] 아이디 자동 저장 완료');
          } catch (error) {
            console.error('아이디 저장 실패:', error);
          }
        }, 500);
      }
    });
  }

  if (naverPasswordInput) {
    let saveTimeout: NodeJS.Timeout | null = null;
    naverPasswordInput.addEventListener('input', () => {
      if (rememberCheckbox?.checked) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          try {
            const config = await window.api.getConfig();
            const updatedConfig: any = {
              ...config,
              savedNaverPassword: naverPasswordInput.value.trim() || undefined,
            };
            await window.api.saveConfig(updatedConfig);
            console.log('[자격증명] 비밀번호 자동 저장 완료');
          } catch (error) {
            console.error('비밀번호 저장 실패:', error);
          }
        }, 500);
      }
    });
  }
}

// ============================================
// AI 자동 제목 생성 기능
// ============================================
export function initTitleGeneration(): void {
  const generateTitleBtn = document.getElementById('generate-title-btn') as HTMLButtonElement;
  const titleInput = document.getElementById('post-title') as HTMLInputElement;
  const contentTextarea = document.getElementById('post-content') as HTMLTextAreaElement;
  const urlFields = document.querySelectorAll('.url-field-input') as NodeListOf<HTMLInputElement>;

  // 수동 제목으로 글생성하기 버튼
  const generateFromManualTitleBtn = document.getElementById('generate-from-manual-title-btn') as HTMLButtonElement;
  if (generateFromManualTitleBtn) {
    generateFromManualTitleBtn.addEventListener('click', async () => {
      if (!generateFromManualTitleBtn) return;

      generateFromManualTitleBtn.disabled = true;
      generateFromManualTitleBtn.textContent = '글 생성 중...';

      // ✅ 새 글 생성 전 이전 콘텐츠 자동 초기화 (제목 버그 방지)
      if ((window as any).currentStructuredContent) {
        console.log('[ManualTitle] 이전 콘텐츠를 초기화합니다...');
        (window as any).currentStructuredContent = null;
        (window as any).currentStructuredContent = null;
        (window as any).generatedImages = [];
        (window as any).imageManagementGeneratedImages = null;
      }

      console.log('🤖 수동 제목으로 글 생성을 시작합니다...');

      try {
        // 입력된 정보 수집
        const title = titleInput?.value.trim() || '';
        const urls = Array.from(urlFields)
          .map(field => field.value.trim())
          .filter(url => url.length > 0)
          .join('\n');

        if (!title) {
          alert('글 생성을 위해 제목을 입력해주세요.');
          generateFromManualTitleBtn.disabled = false;
          generateFromManualTitleBtn.textContent = '수동 제목으로 글생성하기';
          return;
        }

        if (!urls) {
          alert('글 생성을 위해 URL을 입력해주세요.');
          generateFromManualTitleBtn.disabled = false;
          generateFromManualTitleBtn.textContent = '수동 제목으로 글생성하기';
          return;
        }

        // 구조화 콘텐츠 생성 (수동 제목 기반)
        const targetAgeSelect = document.getElementById('target-age') as HTMLSelectElement;
        const targetAge = (targetAgeSelect?.value as '20s' | '30s' | '40s' | '50s' | 'all') || 'all';

        const apiClient = (window as any).EnhancedApiClient.getInstance();
        const apiResponse = await apiClient.call(
          'generateStructuredContent',
          [{
            assembly: {
              rssUrl: urls,
              baseText: title, // 수동 제목을 baseText로 사용
              targetAge: targetAge,
              generator: (window as any).UnifiedDOMCache.getGenerator(),
              minChars: 2500,
            }
          }],
          {
            retryCount: 3,
            retryDelay: 2000,
            timeout: 600000
          }
        );

        const result = apiResponse.data || { success: false, message: apiResponse.error };

        if ((window as any).isPaywallPayload(result)) {
          (window as any).activatePaywall(result);
          return;
        }

        if (result.success && result.content) {
          const structuredContent = result.content as any;

          // 필드 채우기 (타이밍 보장)
          setTimeout(async () => {
            // 제목 필드는 이미 입력되어 있으므로 유지
            // 본문 필드에 입력
            if (contentTextarea && structuredContent.bodyPlain) {
              const normalized = (window as any).normalizeReadableBodyText(structuredContent.bodyPlain);
              structuredContent.bodyPlain = normalized;
              structuredContent.content = normalized;
              contentTextarea.value = normalized;
            }

            // 해시태그 필드에 입력
            const tagsInput = document.getElementById('post-tags') as HTMLInputElement;
            if (tagsInput && structuredContent.hashtags) {
              tagsInput.value = structuredContent.hashtags.join(' ');
            }

            // 소제목 정보 저장 (이미지 생성에 사용)
            (window as any).currentStructuredContent = structuredContent;

            // 소제목 표시 (반자동 발행 탭)
            (window as any).displayStructuredContentPreview(structuredContent);

            // 풀오토 탭에도 소제목 표시
            updateFullAutoHeadingsPreview(structuredContent);

            // 모든 탭의 제목 필드에 설정 (이미 입력된 제목을 다른 탭에도 복사)
            setTitleInAllTabs(title);

            // 성공 알림 및 로그
            console.log('✅ 수동 제목으로 글 생성이 완료되었습니다!');
            console.log(`📝 제목: "${title}" (수동 입력)`);
            console.log(`📄 본문: ${structuredContent.bodyPlain.length}자`);
            console.log(`🏷️ 해시태그: ${structuredContent.hashtags?.join(', ') || '없음'}`);
            console.log(`📑 소제목: ${structuredContent.headings?.length || 0}개`);

            // 필드가 채워진 후 알림 표시
            alert('✅ 수동 제목으로 글 생성이 완료되었습니다!\n\n본문과 해시태그가 자동으로 입력되었습니다.');

            // 이미지 자동 생성 및 발행 (옵션)
            const autoPublishCheckbox = document.getElementById('auto-publish-after-generate') as HTMLInputElement;
            if (autoPublishCheckbox?.checked) {
              setTimeout(() => {
                autoGenerateImagesAndPublish(structuredContent);
              }, 1000);
            }
          }, 500); // 필드 채우기 대기 시간 추가

        } else {
          console.log(`❌ 글 생성 실패: ${result.message || '알 수 없는 오류'}`);
          alert(`❌ 글 생성 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        console.log(`❌ 글 생성 오류: ${(error as Error).message}`);
        alert(`❌ 오류: ${(error as Error).message}`);
      } finally {
        generateFromManualTitleBtn.disabled = false;
        generateFromManualTitleBtn.textContent = '수동 제목으로 글생성하기';
      }
    });
  }

  // AI 자동 글 생성하기 버튼
  if (generateTitleBtn) {
    generateTitleBtn.addEventListener('click', async () => {
      if (!generateTitleBtn) return;

      generateTitleBtn.disabled = true;
      generateTitleBtn.textContent = '글 생성 중...';

      // ✅ 새 글 생성 전 이전 콘텐츠 자동 초기화 (제목 버그 방지)
      if ((window as any).currentStructuredContent) {
        console.log('[AIGenerate] 이전 콘텐츠를 초기화합니다...');
        (window as any).currentStructuredContent = null;
        (window as any).currentStructuredContent = null;
        (window as any).generatedImages = [];
        (window as any).imageManagementGeneratedImages = null;
      }

      console.log('🤖 AI 글 생성을 시작합니다...');

      try {
        // 입력된 정보 수집
        const urls = Array.from(urlFields)
          .map(field => field.value.trim())
          .filter(url => url.length > 0)
          .join('\n');

        if (!urls) {
          alert('글 생성을 위해 URL을 입력해주세요.');
          generateTitleBtn.disabled = false;
          generateTitleBtn.textContent = 'AI 자동 글 생성하기';
          return;
        }

        // 구조화 콘텐츠 생성 (전체 콘텐츠)
        const targetAgeSelect = document.getElementById('target-age') as HTMLSelectElement;
        const targetAge = (targetAgeSelect?.value as '20s' | '30s' | '40s' | '50s' | 'all') || 'all';

        const apiClient = (window as any).EnhancedApiClient.getInstance();
        const apiResponse = await apiClient.call(
          'generateStructuredContent',
          [{
            assembly: {
              rssUrl: urls,
              targetAge: targetAge,
              generator: (window as any).UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] perplexity 지원
              minChars: 2500,
            }
          }],
          {
            retryCount: 3,
            retryDelay: 2000,
            timeout: 600000
          }
        );

        const result = apiResponse.data || { success: false, message: apiResponse.error };

        if ((window as any).isPaywallPayload(result)) {
          (window as any).activatePaywall(result);
          return;
        }

        if (result.success && result.content) {
          const structuredContent = result.content as any;

          // 제목 필드에 입력
          if (titleInput && structuredContent.selectedTitle) {
            titleInput.value = structuredContent.selectedTitle;
          }

          // 본문 필드에 입력
          if (contentTextarea && structuredContent.bodyPlain) {
            const normalized = (window as any).normalizeReadableBodyText(structuredContent.bodyPlain);
            structuredContent.bodyPlain = normalized;
            structuredContent.content = normalized;
            contentTextarea.value = normalized;
          }

          // 해시태그 필드에 입력
          const tagsInput = document.getElementById('post-tags') as HTMLInputElement;
          if (tagsInput && structuredContent.hashtags) {
            tagsInput.value = structuredContent.hashtags.join(' ');
          }

          // 소제목 정보 저장 (이미지 생성에 사용)
          (window as any).currentStructuredContent = structuredContent;

          // 소제목 표시 (반자동 발행 탭)
          (window as any).displayStructuredContentPreview(structuredContent);

          // 풀오토 탭에도 소제목 표시
          updateFullAutoHeadingsPreview(structuredContent);

          // 성공 알림 및 로그
          console.log('✅ AI 글 생성이 완료되었습니다!');
          console.log(`📝 제목: "${structuredContent.selectedTitle}"`);
          console.log(`📄 본문: ${structuredContent.bodyPlain.length}자`);
          console.log(`🏷️ 해시태그: ${structuredContent.hashtags?.join(', ') || '없음'}`);
          console.log(`📑 소제목: ${structuredContent.headings?.length || 0}개`);

          alert('✅ AI 글 생성이 완료되었습니다!\n\n제목, 본문, 해시태그가 자동으로 입력되었습니다.');

          // 이미지 자동 생성 및 발행 (옵션)
          const autoPublishCheckbox = document.getElementById('auto-publish-after-generate') as HTMLInputElement;
          if (autoPublishCheckbox?.checked) {
            setTimeout(() => {
              autoGenerateImagesAndPublish(structuredContent);
            }, 1000);
          }

        } else {
          console.log(`❌ 글 생성 실패: ${result.message || '알 수 없는 오류'}`);
          alert(`❌ 글 생성 실패: ${result.message || '알 수 없는 오류'}`);
        }
      } catch (error) {
        console.log(`❌ 글 생성 오류: ${(error as Error).message}`);
        alert(`❌ 오류: ${(error as Error).message}`);
      } finally {
        generateTitleBtn.disabled = false;
        generateTitleBtn.textContent = 'AI 자동 글 생성하기';
      }
    });
  }
}

// ============================================
// 글자수 표시 및 목표 글자수 업데이트 기능
// ============================================
export function initCharCountDisplay(): void {
  const contentTextarea = document.getElementById('post-content') as HTMLTextAreaElement;
  const charCountSpan = document.getElementById('content-char-count') as HTMLSpanElement;
  const targetCharCountDisplay = document.getElementById('target-char-count-display') as HTMLSpanElement;
  const targetAgeSelect = document.getElementById('target-age') as HTMLSelectElement;

  // 연령대별 목표 글자수
  const getTargetCharsForAge = (targetAge: string): number => {
    switch (targetAge) {
      case '20s':
        return 3000;
      case '30s':
        return 4250;
      case '40s':
      case '50s':
        return 5500;
      case 'all':
      default:
        return 3000;
    }
  };

  // 글자수 업데이트 함수
  const updateCharCount = (): void => {
    if (!contentTextarea || !charCountSpan) return;

    const text = contentTextarea.value;
    const charCount = text.replace(/\s+/g, '').length;
    charCountSpan.textContent = `${charCount.toLocaleString()}자`;

    // 목표 글자수 표시
    if (targetCharCountDisplay && targetAgeSelect) {
      const targetAge = targetAgeSelect.value;
      const targetRange = targetAge === '20s' ? '2,500~3,500자'
        : targetAge === '30s' ? '3,500~5,000자'
          : targetAge === '40s' || targetAge === '50s' ? '4,500~6,500자'
            : '2,000자 이상';

      targetCharCountDisplay.textContent = `(목표: ${targetRange})`;

      // 목표 달성 여부에 따라 색상 변경
      const targetChars = getTargetCharsForAge(targetAge);
      if (charCount >= targetChars * 0.9) {
        charCountSpan.style.color = 'var(--text-strong)';
      } else if (charCount >= targetChars * 0.7) {
        charCountSpan.style.color = 'var(--text-gold)';
      } else {
        charCountSpan.style.color = 'var(--text-muted)';
      }
    }
  };

  // 본문 입력 시 글자수 업데이트
  if (contentTextarea) {
    contentTextarea.addEventListener('input', updateCharCount);
    contentTextarea.addEventListener('paste', () => {
      setTimeout(updateCharCount, 10);
    });
    updateCharCount();
  }

  // 연령대 변경 시 목표 글자수 업데이트
  if (targetAgeSelect && targetCharCountDisplay) {
    targetAgeSelect.addEventListener('change', updateCharCount);
    updateCharCount();
  }
}

// ============================================
// 풀오토 미리보기 기능
// ============================================

// 풀오토 콘텐츠 미리보기 업데이트
export function updateFullAutoPreview(structuredContent: any): void {
  const previewSection = document.getElementById('full-auto-preview-section');
  if (!previewSection) return;

  previewSection.style.display = 'block';

  const contentPreview = document.getElementById('full-auto-content-preview');
  if (contentPreview) {
    const contentText = structuredContent.bodyPlain || structuredContent.content || '';
    const sentences = contentText.split(/([.!?。！？])\s*/).filter((s: string) => s.trim());
    let formattedContent = '';
    let sentenceCount = 0;
    let currentParagraph = '';

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;

      currentParagraph += sentence;

      if (/[.!?。！？]/.test(sentence)) {
        sentenceCount++;
        if (sentenceCount % 5 === 0 || i === sentences.length - 1) {
          formattedContent += currentParagraph + '\n\n';
          currentParagraph = '';
        } else {
          currentParagraph += ' ';
        }
      }
    }

    const truncatedContent = formattedContent.length > 500 ? formattedContent.substring(0, 500) + '...' : formattedContent;
    contentPreview.innerHTML = truncatedContent ?
      `<div style="white-space: pre-line; line-height: 1.6;">${truncatedContent.replace(/\n/g, '<br>')}</div>` :
      '<div style="color: var(--text-muted); font-style: italic;">생성된 본문이 없습니다.</div>';
  }

  const integratedPreview = document.getElementById('full-auto-integrated-preview');
  if (integratedPreview) {
    const hs = Array.isArray(structuredContent?.headings) ? structuredContent.headings : [];
    const integratedHtml = hs.map((heading: any, index: number) =>
      `<div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border-light);">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">
          <div style="width: 40px; height: 40px; border-radius: 6px; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem; font-weight: 600;">${index + 1}</div>
          <div style="flex: 1;">
            <div style="font-size: 0.9rem; color: var(--text-strong); font-weight: 500;">🖼️ 이미지 생성 예정</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">소제목에 맞는 이미지가 생성됩니다</div>
          </div>
          <div style="font-size: 0.8rem; color: var(--accent); font-weight: 600;">⏳ 준비중</div>
        </div>
        <div style="padding: 0.5rem; background: var(--bg-primary); border-radius: 6px; border-left: 3px solid var(--success);">
          <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.5rem;">📝 ${heading.title || '제목 없음'}</div>
          <div style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${(heading.content || '').substring(0, 150)}${(heading.content || '').length > 150 ? '...' : ''}</div>
        </div>
      </div>`
    ).join('');

    integratedPreview.innerHTML = integratedHtml || '<div style="color: var(--text-muted); font-style: italic;">생성할 이미지가 없습니다.</div>';
  }
}

// 풀오토 최종 이미지 미리보기 업데이트
export function updateFullAutoFinalImagePreview(generatedImages: any[]): void {
  const integratedPreview = document.getElementById('full-auto-integrated-preview');
  if (!integratedPreview) return;

  const integratedHtml = generatedImages.map((image: any, index: number) =>
    `<div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border-light);">
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(16, 185, 129, 0.1); border-radius: 6px;">
        <div style="width: 40px; height: 40px; border-radius: 6px; background: linear-gradient(135deg, #10b981, #059669); display: flex; align-items: center; justify-content: center; color: white; font-size: 1rem; font-weight: 600;">✓</div>
        <div style="flex: 1;">
          <div style="font-size: 0.9rem; color: var(--text-strong); font-weight: 500;">🖼️ 이미지 생성 완료</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">이미지가 성공적으로 생성되었습니다</div>
        </div>
        <div style="font-size: 0.8rem; color: var(--success); font-weight: 600;">✅ 완료</div>
      </div>
      <div style="padding: 0.5rem; background: var(--bg-primary); border-radius: 6px; border-left: 3px solid var(--success);">
        <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.5rem;">📝 ${image.headingTitle || `소제목 ${index + 1}`}</div>
        <div style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${(image.headingContent || '').substring(0, 150)}${(image.headingContent || '').length > 150 ? '...' : ''}</div>
      </div>
    </div>`
  ).join('');

  integratedPreview.innerHTML = integratedHtml || '<div style="color: var(--text-muted); font-style: italic;">생성된 이미지가 없습니다.</div>';
}

// 미리보기 활성화/비활성화 토글
function toggleFullAutoPreview(): void {
  // ✅ [2026-03-10 CLEANUP] full-auto-enable-preview 유령 참조 제거 → 미리보기 섹션이 있으면 항상 표시
  const previewSection = document.getElementById('full-auto-preview-section');

  if (previewSection) {
    previewSection.style.display = 'block';
  }
}

// 풀오토 탭 소제목 미리보기 업데이트
function updateFullAutoHeadingsPreview(structuredContent: any): void {
  const headingsPreview = document.getElementById('full-auto-headings-preview');
  if (!headingsPreview || !structuredContent.headings) return;

  const headingsHtml = structuredContent.headings.map((heading: any, index: number) =>
    `<div style="margin-bottom: 0.75rem; padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px; border-left: 3px solid var(--primary);">
      <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem;">${index + 1}. ${heading.title || '제목 없음'}</div>
      <div style="font-size: 0.85rem; color: var(--text-muted);">${(heading.content || '').substring(0, 100)}${(heading.content || '').length > 100 ? '...' : ''}</div>
    </div>`
  ).join('');

  headingsPreview.innerHTML = headingsHtml || '<div style="color: var(--text-muted); font-style: italic;">소제목이 없습니다.</div>';
}

// 소제목에서 검색 의도가 명확한 키워드 추출
export function extractSearchKeywords(title: string, content?: string): string[] {
  const keywords: string[] = [];

  const titleWords = title.split(' ').filter(word => word.length > 1);
  const personNamePattern = /^[가-힣]{2,4}$|^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/;

  const personNames = titleWords.filter(word => personNamePattern.test(word));
  if (personNames.length > 0) {
    keywords.push(...personNames);
    console.log(`👤 인물 감지됨: ${personNames.join(', ')}`);
  }

  const titleKeywords = titleWords.filter(word => {
    if (personNames.includes(word)) return false;
    if (/^[가-힣]{2,10}$/.test(word)) return true;
    if (/^[A-Za-z]{3,}$/.test(word)) return true;
    return false;
  });

  keywords.push(...titleKeywords);

  if (content) {
    const contentWords = content.split(' ').filter(word => word.length > 1);
    const contentKeywords = contentWords.filter(word =>
      /^[가-힣]{2,6}$/.test(word) || /^[A-Za-z]{4,}$/.test(word)
    ).slice(0, 3);
    keywords.push(...contentKeywords);
  }

  const uniqueKeywords = Array.from(new Set(keywords)).slice(0, 5);
  return uniqueKeywords.length > 0 ? uniqueKeywords : [title];
}

// 모든 탭의 제목 필드에 제목 설정
function setTitleInAllTabs(title: string): void {
  if (!title) return;

  const semiAutoTitleInput = document.getElementById('post-title') as HTMLInputElement;
  if (semiAutoTitleInput) {
    semiAutoTitleInput.value = title;
  }

  const imageTabTitleInput = document.querySelector('#tab-images input[type="text"][placeholder*="제목"]') as HTMLInputElement;
  if (imageTabTitleInput) {
    imageTabTitleInput.value = title;
  }

  const libraryTabTitleInput = document.querySelector('#tab-library input[type="text"][placeholder*="제목"]') as HTMLInputElement;
  if (libraryTabTitleInput) {
    libraryTabTitleInput.value = title;
  }

  const allTitleInputs = document.querySelectorAll('input[type="text"][id*="title"], input[type="text"][placeholder*="제목"]') as NodeListOf<HTMLInputElement>;
  allTitleInputs.forEach(input => {
    if (input.id !== 'post-title') {
      input.value = title;
    }
  });

  console.log(`📝 모든 탭의 제목 필드에 "${title}" 설정됨`);
}

// 이미지 자동 생성 및 발행
async function autoGenerateImagesAndPublish(structuredContent: any): Promise<void> {
  try {
    console.log('🎨 이미지 자동 생성을 시작합니다...');

    // ✅ [2026-02-01 FIX] collectedImages 전달하여 중복 크롤링 방지
    const genImages = await (window as any).generateImagesForContent(structuredContent, {
      imageSource: 'nano-banana-pro',
      skipImages: false,
      collectedImages: structuredContent?.collectedImages || structuredContent?.images || []
    });

    console.log('📤 자동 발행을 시작합니다...');

    await (window as any).executeBlogPublishing(structuredContent, genImages, {
      publishMode: 'publish'
    });

    console.log('🎉 자동 발행이 완료되었습니다!');
    alert('🎉 이미지 생성 및 발행이 자동으로 완료되었습니다!');

    // ✅ [2026-01-29] 발행 완료 후 상태 초기화
    if (typeof (window as any).resetAfterPublish === 'function') {
      (window as any).resetAfterPublish();
    }

  } catch (error) {
    console.log(`❌ 자동 발행 실패: ${(error as Error).message}`);
    alert(`❌ 자동 발행 실패: ${(error as Error).message}`);

    // ✅ [2026-03-22 FIX] 실패 시 발행 상태 리셋 (재시도 가능하도록)
    if (typeof (window as any).resetPublishing === 'function') {
      (window as any).resetPublishing();
    }
  }
}

// ✅ [2026-03-16] initImageManagementTab은 imageManagementTab.ts로 완전 이전됨
// formUtilities.ts의 구버전은 삭제 — 번들 시 동명 함수 충돌로 버튼 로직이 덮어쓰기 되는 버그 방지





