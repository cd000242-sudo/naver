// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 스케줄 관리 + 관리자 패널 모듈
// renderer.ts에서 추출 — 예약 발행 관리, 시간 변경 모달, 미리보기
// ═══════════════════════════════════════════════════════════════════

import { toastManager } from '../utils/uiManagers.js';
import { GENERATED_POSTS_KEY } from '../utils/postStorageUtils.js';

// TS 컴파일용 — 런타임에서는 renderer.ts의 동일 스코프 함수 사용
declare function showErrorAlertModal(title: string, message: string): void;

// ============================================
// ✅ 시간 변경 모달
// ============================================
export function showRescheduleModal(postId: string, title: string, onConfirm: (newDate: string) => void): void {
    // 기존 모달 제거
    const existingModal = document.getElementById('reschedule-modal');
    if (existingModal) existingModal.remove();

    // 기본값: 현재 시간 + 10분
    const defaultDate = new Date(Date.now() + 10 * 60 * 1000);
    const defaultDateStr = defaultDate.toISOString().slice(0, 16);

    const modal = document.createElement('div');
    modal.id = 'reschedule-modal';
    modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.7); display: flex; align-items: center;
    justify-content: center; z-index: 10000; backdrop-filter: blur(4px);
  `;

    modal.innerHTML = `
    <div style="background: var(--bg-secondary); border-radius: 16px; padding: 2rem; max-width: 450px; width: 90%; border: 1px solid var(--border-light); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
        <div style="width: 48px; height: 48px; background: rgba(245, 158, 11, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">📅</div>
        <div>
          <h3 style="margin: 0; color: var(--text-strong); font-size: 1.2rem;">예약 시간 변경</h3>
          <p style="margin: 0.25rem 0 0 0; color: var(--text-muted); font-size: 0.85rem;">${title}</p>
        </div>
      </div>
      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">새 발행 시간</label>
        <input type="datetime-local" id="reschedule-datetime" value="${defaultDateStr}" style="width: 100%; padding: 0.75rem; background: var(--bg-primary); border: 1px solid var(--border-light); border-radius: 8px; color: var(--text-strong); font-size: 1rem;">
      </div>
      <div style="display: flex; gap: 0.75rem;">
        <button type="button" id="reschedule-cancel-btn" style="flex: 1; padding: 0.75rem; background: var(--bg-tertiary); color: var(--text-muted); border: 1px solid var(--border-light); border-radius: 8px; font-weight: 600; cursor: pointer;">
          취소
        </button>
        <button type="button" id="reschedule-confirm-btn" style="flex: 1; padding: 0.75rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
          시간 변경
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    // 취소 버튼
    const cancelBtn = document.getElementById('reschedule-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.remove());
    }

    // 확인 버튼
    const confirmBtn = document.getElementById('reschedule-confirm-btn');
    const datetimeInput = document.getElementById('reschedule-datetime') as HTMLInputElement;

    if (confirmBtn && datetimeInput) {
        confirmBtn.addEventListener('click', () => {
            const newDate = datetimeInput.value;
            if (!newDate) {
                toastManager.warning('발행 시간을 선택해주세요.');
                return;
            }

            const selectedDate = new Date(newDate);
            if (selectedDate <= new Date()) {
                toastManager.warning('현재 시간 이후로 설정해주세요.');
                return;
            }

            modal.remove();
            onConfirm(newDate);
        });
    }

    // 배경 클릭으로 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================
// 스케줄 관리 초기화
// ============================================
export async function initScheduleManagement(): Promise<void> {
    console.log('[ScheduleManager] 스케줄 관리 초기화 시작');

    const refreshScheduleBtn = document.getElementById('schedule-refresh-btn') as HTMLButtonElement;
    const scheduledPostsList = document.getElementById('schedule-list-container') as HTMLDivElement;
    const scheduleFilter = document.getElementById('schedule-filter') as HTMLSelectElement;

    console.log('[ScheduleManager] 요소 확인:', {
        refreshScheduleBtn: !!refreshScheduleBtn,
        scheduledPostsList: !!scheduledPostsList,
        scheduleFilter: !!scheduleFilter
    });

    async function loadScheduledPosts(): Promise<void> {
        if (!scheduledPostsList) {
            console.warn('[ScheduleManager] schedule-list-container 요소가 없습니다.');
            return;
        }

        try {
            console.log('[ScheduleManager] getScheduledPosts 호출 시도...');

            if (!window.api) {
                console.error('[ScheduleManager] window.api가 정의되지 않았습니다!');
                scheduledPostsList.innerHTML = `
          <div style="text-align: center; padding: 3rem; color: #ef4444;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
            <p style="font-size: 1.1rem;">API가 초기화되지 않았습니다</p>
            <p style="font-size: 0.9rem; margin-top: 0.5rem;">앱을 재시작해주세요</p>
          </div>
        `;
                return;
            }

            if (typeof window.api.getScheduledPosts !== 'function') {
                console.error('[ScheduleManager] window.api.getScheduledPosts 함수가 없습니다!');
                scheduledPostsList.innerHTML = `
          <div style="text-align: center; padding: 3rem; color: #ef4444;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
            <p style="font-size: 1.1rem;">스케줄 API가 없습니다</p>
            <p style="font-size: 0.9rem; margin-top: 0.5rem;">앱 버전을 확인해주세요</p>
          </div>
        `;
                return;
            }

            const result = await window.api.getScheduledPosts();
            console.log('[ScheduleManager] getScheduledPosts 결과:', result);

            if (result.success && result.posts && result.posts.length > 0) {
                const filterValue = scheduleFilter?.value || 'all';
                const filteredPosts = filterValue === 'all'
                    ? result.posts
                    : result.posts.filter(post => post.status === filterValue);

                if (filteredPosts.length === 0) {
                    scheduledPostsList.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
              <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
              <p style="font-size: 1.1rem;">필터 조건에 맞는 예약이 없습니다</p>
            </div>
          `;
                    return;
                }

                scheduledPostsList.innerHTML = filteredPosts.map((post: any) => {
                    const scheduleDate = new Date(post.scheduleDate);
                    const now = new Date();
                    const isPast = scheduleDate < now;
                    const scheduleDateStr = scheduleDate.toLocaleString('ko-KR', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                    });

                    let publishedDateStr = '';
                    if (post.publishedAt) {
                        const publishedDate = new Date(post.publishedAt);
                        publishedDateStr = publishedDate.toLocaleString('ko-KR', {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                        });
                    }

                    let statusText = '';
                    let statusColor = '';
                    let statusIcon = '';
                    if (post.status === 'published') {
                        statusText = '✅ 발행 완료'; statusColor = '#10b981'; statusIcon = '✅';
                    } else if (post.status === 'cancelled') {
                        statusText = '❌ 취소됨'; statusColor = '#ef4444'; statusIcon = '❌';
                    } else if (post.status === 'failed') {
                        statusText = '⚠️ 발행 실패'; statusColor = '#ef4444'; statusIcon = '⚠️';
                    } else if (isPast) {
                        statusText = '⏰ 발행 대기'; statusColor = '#f59e0b'; statusIcon = '⏰';
                    } else {
                        statusText = '📅 예약됨'; statusColor = '#3b82f6'; statusIcon = '📅';
                    }

                    const titleClickable = post.status === 'published' && post.publishedUrl;
                    const titleHtml = titleClickable
                        ? `<a href="${post.publishedUrl}" target="_blank" style="font-size: 1.2rem; font-weight: 600; color: var(--primary); margin: 0; text-decoration: none; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${post.title || '제목 없음'} 🔗</a>`
                        : `<h3 style="font-size: 1.2rem; font-weight: 600; color: var(--text-strong); margin: 0;">${post.title || '제목 없음'}</h3>`;

                    return `
            <div style="background: var(--bg-secondary); border: 2px solid var(--border-light); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; transition: all 0.3s;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                ${titleHtml}
                <div style="display: flex; gap: 0.5rem;">
                  <button type="button" class="scheduled-post-preview" data-post-id="${post.postId || ''}" data-title="${(post.title || '').replace(/"/g, '&quot;')}" style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
                    👁️ 미리보기
                  </button>
                  <button type="button" class="scheduled-post-remove" data-post-id="${post.id}" style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
                    🗑️ 삭제
                  </button>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.95rem; margin-bottom: 0.75rem;">
                <div>
                  <span style="color: var(--text-muted);">📅 예약 일시:</span>
                  <span style="color: var(--text-strong); font-weight: 600; margin-left: 0.5rem;">${scheduleDateStr}</span>
                </div>
                <div>
                  <span style="color: var(--text-muted);">상태:</span>
                  <span style="color: ${statusColor}; font-weight: 600; margin-left: 0.5rem;">${statusText}</span>
                </div>
              </div>
              ${post.status === 'published' && publishedDateStr ? `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.95rem;">
                  <div>
                    <span style="color: var(--text-muted);">⏰ 완료 시간:</span>
                    <span style="color: #10b981; font-weight: 600; margin-left: 0.5rem;">${publishedDateStr}</span>
                  </div>
                  ${post.publishedUrl ? `
                    <div>
                      <span style="color: var(--text-muted);">🔗 발행 URL:</span>
                      <a href="#" class="external-link-btn" data-url="${post.publishedUrl}" style="color: var(--primary); font-weight: 600; margin-left: 0.5rem; text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">바로가기</a>
                    </div>
                  ` : ''}
                </div>
              ` : ''}
              ${post.status === 'failed' ? `
                <div style="margin-top: 1rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px;">
                  <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <span style="font-size: 1.25rem;">⚠️</span>
                    <strong>발행 실패</strong>
                  </div>
                  <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0 0 1rem 0; line-height: 1.5;">
                    ${post.error || '알 수 없는 오류가 발생했습니다.'}
                  </p>
                  <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button type="button" class="scheduled-post-reschedule" data-post-id="${post.id}" data-title="${(post.title || '').replace(/"/g, '&quot;')}" style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem;">
                      📅 시간 변경 후 재시도
                    </button>
                    <button type="button" class="scheduled-post-retry" data-post-id="${post.id}" style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem;">
                      🔄 즉시 재시도
                    </button>
                  </div>
                </div>
              ` : ''}
            </div>
          `;
                }).join('');

                // 미리보기 버튼 이벤트
                scheduledPostsList.querySelectorAll('.scheduled-post-preview').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const postId = (btn as HTMLButtonElement).getAttribute('data-post-id');
                        const title = (btn as HTMLButtonElement).getAttribute('data-title');

                        try {
                            const generatedPosts = JSON.parse(localStorage.getItem(GENERATED_POSTS_KEY) || '[]');
                            let postData;
                            if (postId && postId.trim() && postId !== 'null' && postId !== 'undefined') {
                                postData = generatedPosts.find((p: any) => p.id === postId);
                            }

                            if (!postData && title) {
                                postData = generatedPosts.find((p: any) => p.title === title);
                                if (!postData) {
                                    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
                                    postData = generatedPosts.find((p: any) => {
                                        const normalizedPostTitle = (p.title || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
                                        return normalizedPostTitle.includes(normalizedTitle) || normalizedTitle.includes(normalizedPostTitle);
                                    });
                                }
                                if (!postData && generatedPosts.length > 0) {
                                    postData = generatedPosts.sort((a: any, b: any) => {
                                        return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
                                    })[0];
                                    toastManager.warning('⚠️ 정확한 글을 찾지 못해 가장 최근 글을 표시합니다.');
                                }
                            }

                            if (!postData) {
                                toastManager.error('❌ 글 데이터를 찾을 수 없습니다.');
                                return;
                            }

                            showSchedulePreviewModal(postData);
                        } catch (error) {
                            toastManager.error(`❌ 미리보기 오류: ${(error as Error).message}`);
                        }
                    });
                });

                // 삭제 버튼 이벤트
                scheduledPostsList.querySelectorAll('.scheduled-post-remove').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const postId = (btn as HTMLButtonElement).getAttribute('data-post-id');
                        if (postId && confirm('예약된 포스팅을 삭제하시겠습니까?')) {
                            try {
                                const result = await window.api.removeScheduledPost(postId);
                                if (result.success) {
                                    toastManager.success('✅ 예약이 삭제되었습니다');
                                    await loadScheduledPosts();
                                } else {
                                    toastManager.error(`❌ 삭제 실패: ${result.message || '알 수 없는 오류'}`);
                                }
                            } catch (error) {
                                toastManager.error(`❌ 오류: ${(error as Error).message}`);
                            }
                        }
                    });
                });

                // ✅ 시간 변경 후 재시도 버튼 이벤트
                scheduledPostsList.querySelectorAll('.scheduled-post-reschedule').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const postId = (btn as HTMLButtonElement).getAttribute('data-post-id');
                        const title = (btn as HTMLButtonElement).getAttribute('data-title') || '예약 발행';
                        if (!postId) return;

                        showRescheduleModal(postId, title, async (newDate: string) => {
                            try {
                                const result = await window.api.reschedulePost(postId, newDate);
                                if (result.success) {
                                    toastManager.success('✅ 예약 시간이 변경되었습니다.');
                                    await loadScheduledPosts();
                                } else {
                                    showErrorAlertModal('예약 시간 변경 실패', result.message || '알 수 없는 오류');
                                }
                            } catch (error) {
                                showErrorAlertModal('예약 시간 변경 오류', (error as Error).message);
                            }
                        });
                    });
                });

                // ✅ 즉시 재시도 버튼 이벤트
                scheduledPostsList.querySelectorAll('.scheduled-post-retry').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const postId = (btn as HTMLButtonElement).getAttribute('data-post-id');
                        if (!postId) return;

                        if (confirm('지금 바로 발행을 재시도하시겠습니까?')) {
                            try {
                                toastManager.info('🔄 발행 재시도 중...');
                                const result = await window.api.retryScheduledPost(postId);
                                if (result.success) {
                                    toastManager.success('✅ 발행이 완료되었습니다!');
                                    if (typeof (window as any).resetAfterPublish === 'function') {
                                        (window as any).resetAfterPublish();
                                    }
                                    await loadScheduledPosts();
                                } else {
                                    showErrorAlertModal('발행 재시도 실패', result.message || '알 수 없는 오류');
                                }
                            } catch (error) {
                                showErrorAlertModal('발행 재시도 오류', (error as Error).message);
                            }
                        }
                    });
                });

            } else {
                scheduledPostsList.innerHTML = `
          <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
            <p style="font-size: 1.1rem;">예약된 발행이 없습니다</p>
            <p style="font-size: 0.9rem; margin-top: 0.5rem;">스마트 자동 발행 탭에서 예약 발행을 설정해보세요!</p>
          </div>
        `;
            }
        } catch (error) {
            console.error('스케줄 로드 실패:', error);
            scheduledPostsList.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #ef4444;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
          <p style="font-size: 1.1rem;">예약된 포스팅을 불러오는 중 오류가 발생했습니다</p>
          <p style="font-size: 0.9rem; margin-top: 0.5rem;">${(error as Error).message}</p>
        </div>
      `;
        }
    }

    if (refreshScheduleBtn) {
        refreshScheduleBtn.addEventListener('click', async () => {
            refreshScheduleBtn.disabled = true;
            const originalText = refreshScheduleBtn.textContent;
            refreshScheduleBtn.textContent = '로딩 중...';
            await loadScheduledPosts();
            refreshScheduleBtn.disabled = false;
            refreshScheduleBtn.textContent = originalText || '🔄 새로고침';
            toastManager.success('✅ 새로고침 완료');
        });
    }

    if (scheduleFilter) {
        scheduleFilter.addEventListener('change', async () => {
            await loadScheduledPosts();
        });
    }

    await loadScheduledPosts();
}

// ============================================
// 스케줄 미리보기 모달
// ============================================
export function showSchedulePreviewModal(postData: any): void {
    const existingModal = document.getElementById('schedule-preview-modal');
    if (existingModal) existingModal.remove();

    let formattedBody = postData.content || postData.bodyPlain || '';
    if (formattedBody) {
        formattedBody = formattedBody
            .split('\n')
            .filter((line: string) => line.trim())
            .map((line: string) => `<p style="margin-bottom: 1rem; line-height: 1.8;">${line}</p>`)
            .join('');
    }

    let formattedHashtags = '';
    if (postData.hashtags && postData.hashtags.length > 0) {
        formattedHashtags = postData.hashtags.map((tag: string) => `<span style="display: inline-block; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(16, 185, 129, 0.05)); color: var(--primary); padding: 0.25rem 0.75rem; border-radius: 6px; margin-right: 0.5rem; margin-bottom: 0.5rem; font-size: 0.9rem;">#${tag}</span>`).join('');
    }

    const modalHtml = `
    <div id="schedule-preview-modal" class="modal-backdrop" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(5px);">
      <div class="modal-panel" style="background: var(--bg-primary); border: 3px solid var(--border-gold); border-radius: 20px; max-width: 900px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.3); position: relative; padding: 2rem;">
        <button type="button" class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: #ef4444; color: white; border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">×</button>
        
        <h2 style="font-size: 1.8rem; font-weight: 700; color: var(--text-strong); margin-bottom: 2rem; padding-right: 3rem;">📄 글 미리보기</h2>
        
        <div style="margin-bottom: 2rem; padding: 1.5rem; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(16, 185, 129, 0.05)); border-radius: 12px; border: 2px solid rgba(59, 130, 246, 0.3);">
          <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.75rem;">📌 제목</h3>
          <p style="font-size: 1.3rem; font-weight: 600; color: var(--text-strong); line-height: 1.6; margin: 0;">${postData.title || '제목 없음'}</p>
        </div>

        <div style="margin-bottom: 2rem; padding: 1.5rem; background: var(--bg-secondary); border-radius: 12px; border: 2px solid var(--border-light);">
          <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 1rem;">📝 본문</h3>
          <div style="color: var(--text-strong); line-height: 1.8; max-height: 400px; overflow-y: auto;">
            ${formattedBody || '<p style="color: var(--text-muted); font-style: italic;">본문 내용이 없습니다</p>'}
          </div>
        </div>

        ${postData.hashtags && postData.hashtags.length > 0 ? `
          <div style="margin-bottom: 2rem; padding: 1.5rem; background: var(--bg-secondary); border-radius: 12px; border: 2px solid var(--border-light);">
            <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 1rem;">🏷️ 해시태그</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">${formattedHashtags}</div>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: center; margin-top: 2rem;">
          <button type="button" class="close-modal-btn" style="padding: 0.875rem 2.5rem; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer;">
            닫기
          </button>
        </div>
      </div>
    </div>
  `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('schedule-preview-modal');
    modal?.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => modal?.remove());
    });
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================
// 관리자 패널 연동
// ============================================
export async function connectToAdminPanel(): Promise<void> {
    try {
        console.log('[AdminPanel] 라이선스 유효 - 관리자 패널 연결 시도...');
        const adminStatus = document.getElementById('admin-panel-status');
        if (adminStatus) {
            adminStatus.textContent = '관리자 패널 연결 중...';
            adminStatus.style.color = '#ffd700';
        }

        const result = await (window.api as any).adminConnect();
        if (!result.success) {
            throw new Error(result.message);
        }

        console.log('[AdminPanel] 관리자 패널 연결 성공');
        if (adminStatus) {
            adminStatus.textContent = '관리자 패널 연결됨';
            adminStatus.style.color = '#4caf50';
        }

        await syncAdminSettings();
    } catch (error) {
        console.error('[AdminPanel] 관리자 패널 연결 실패:', error);
        const adminStatus = document.getElementById('admin-panel-status');
        if (adminStatus) {
            adminStatus.textContent = '관리자 패널 연결 실패';
            adminStatus.style.color = '#f44336';
        }
    }
}

export async function syncAdminSettings(): Promise<void> {
    try {
        console.log('[AdminPanel] 관리자 설정 동기화 중...');
        const result = await (window.api as any).adminSyncSettings();
        if (!result.success) throw new Error(result.message);

        if (result.settings) {
            const currentConfig = await window.api.getConfig();
            const updatedConfig = { ...currentConfig, ...result.settings };
            await window.api.saveConfig(updatedConfig);
            console.log('[AdminPanel] 관리자 설정이 로컬에 적용됨');
        }
        console.log('[AdminPanel] 관리자 설정 동기화 완료');
    } catch (error) {
        console.error('[AdminPanel] 관리자 설정 동기화 실패:', error);
    }
}

export async function sendAdminReport(data: any): Promise<void> {
    try {
        console.log('[AdminPanel] 관리자 보고서 전송 중...');
        const result = await (window.api as any).adminSendReport(data);
        if (!result.success) throw new Error(result.message);
        console.log('[AdminPanel] 관리자 보고서 전송 완료');
    } catch (error) {
        console.error('[AdminPanel] 관리자 보고서 전송 실패:', error);
    }
}

export async function checkAdminPermissions(): Promise<any> {
    try {
        console.log('[AdminPanel] 관리자 권한 확인 중...');
        const result = await (window.api as any).adminCheckPermissions();
        if (!result.success) {
            console.warn('[AdminPanel] 권한 확인 실패:', result);
            return { isValid: false };
        }
        console.log('[AdminPanel] 관리자 권한 확인 완료:', result.permissions);
        return result.permissions;
    } catch (error) {
        console.error('[AdminPanel] 권한 확인 실패:', error);
        return { isValid: false, error: (error as Error).message };
    }
}
