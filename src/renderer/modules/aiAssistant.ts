/**
 * ✅ [2026-02-26 모듈화] AI 어시스턴트 패널 모듈
 * - renderer.ts에서 분리됨
 * - AI 챗봇 패널 초기화, 메시지 전송/수신, 빠른 동작 버튼
 * - 의존: escapeHtml (htmlUtils), window.api, DOM
 */

import { escapeHtml } from '../utils/htmlUtils.js';
import { toastManager } from '../utils/uiManagers.js';

export function initAIAssistant() {
  const assistantBtn = document.getElementById('ai-assistant-btn');
  const assistantPanel = document.getElementById('ai-assistant-panel');
  const closeBtn = document.getElementById('ai-assistant-close');
  const chatInput = document.getElementById('ai-chat-input') as HTMLInputElement;
  const sendBtn = document.getElementById('ai-chat-send');
  const messagesContainer = document.getElementById('ai-chat-messages');
  const quickBtns = document.querySelectorAll('.ai-quick-btn');

  if (!assistantBtn || !assistantPanel) {
    console.log('[AIAssistant] 요소를 찾을 수 없음');
    return;
  }

  // ✅ [2026-01-26] 버튼과 패널을 body로 이동시켜 항상 표시되도록 함
  if (assistantBtn.parentElement !== document.body) {
    document.body.appendChild(assistantBtn);
    console.log('[AIAssistant] ✅ 버튼을 body로 이동 - 항상 표시됨');
  }
  if (assistantPanel.parentElement !== document.body) {
    document.body.appendChild(assistantPanel);
    console.log('[AIAssistant] ✅ 패널을 body로 이동');
  }


  // 패널 열기/닫기
  assistantBtn.addEventListener('click', () => {
    const isVisible = assistantPanel.style.display === 'flex';
    assistantPanel.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible && chatInput) {
      chatInput.focus();
    }
  });

  closeBtn?.addEventListener('click', () => {
    assistantPanel.style.display = 'none';
  });

  // 메시지 전송
  async function sendMessage(message: string) {
    if (!message.trim() || !messagesContainer) return;

    // 사용자 메시지 추가
    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = 'ai-message user';
    userMsgDiv.innerHTML = `<div style="color: var(--text-strong); line-height: 1.6;">${escapeHtml(message)}</div>`;
    messagesContainer.appendChild(userMsgDiv);

    // 입력창 초기화
    if (chatInput) chatInput.value = '';

    // 타이핑 인디케이터 추가
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-message assistant';
    typingDiv.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <span style="font-size:1.1rem;">✨</span>
        <div class="ai-typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    typingDiv.style.background = 'linear-gradient(135deg, rgba(212, 175, 55, 0.12), rgba(184, 134, 11, 0.08))';
    typingDiv.style.padding = '0.75rem 1rem';
    typingDiv.style.borderRadius = '12px';
    typingDiv.style.border = '1px solid rgba(212, 175, 55, 0.25)';
    messagesContainer.appendChild(typingDiv);
    typingDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      // AI 응답 요청
      console.log('[AIAssistant] IPC 호출 시작:', message);
      console.log('[AIAssistant] window.api.aiAssistantChat 존재:', typeof window.api.aiAssistantChat);
      if (!window.api.aiAssistantChat) {
        throw new Error('aiAssistantChat API가 정의되지 않았습니다');
      }
      const result = await window.api.aiAssistantChat(message);
      console.log('[AIAssistant] IPC 응답:', result);

      // 타이핑 인디케이터 제거
      typingDiv.remove();

      // AI 응답 추가
      const aiMsgDiv = document.createElement('div');
      aiMsgDiv.className = 'ai-message assistant';
      aiMsgDiv.style.background = 'linear-gradient(135deg, rgba(212, 175, 55, 0.08), rgba(184, 134, 11, 0.05))';
      aiMsgDiv.style.padding = '1rem';
      aiMsgDiv.style.borderRadius = '12px';
      aiMsgDiv.style.border = '1px solid rgba(212, 175, 55, 0.2)';

      const responseText = result?.response || '죄송해요, 응답을 생성하지 못했어요.';
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      aiMsgDiv.innerHTML = `<div style="display:flex;align-items:flex-start;gap:0.6rem;"><span style="font-size:1.2rem;flex-shrink:0;margin-top:2px;">✨</span><div style="flex:1;min-width:0;"><div class="ai-response-content" style="color: var(--text-strong); line-height: 1.7;">${formatAIResponse(responseText)}</div><div style="font-size:0.65rem;color:var(--text-muted);margin-top:0.5rem;text-align:right;opacity:0.7;">${timeStr}</div></div></div>`;
      messagesContainer.appendChild(aiMsgDiv);

      // 액션 버튼 추가
      if (result?.actions && result.actions.length > 0) {
        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; padding-left: 1.8rem;';
        result.actions.forEach((action: any) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = action.label;
          if (action.primary) {
            btn.style.cssText = 'padding: 0.5rem 0.85rem; background: linear-gradient(135deg, #d4af37, #b8860b); border: none; border-radius: 10px; color: #fff; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(212,175,55,0.3);';
          } else {
            btn.style.cssText = 'padding: 0.5rem 0.75rem; background: rgba(212, 175, 55, 0.12); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 10px; color: var(--text-strong); font-size: 0.8rem; cursor: pointer; transition: all 0.2s;';
          }
          btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateY(-1px)'; });
          btn.addEventListener('mouseleave', () => { btn.style.transform = 'translateY(0)'; });
          btn.addEventListener('click', () => handleAIAction(action.action));
          actionsDiv.appendChild(btn);
        });
        aiMsgDiv.appendChild(actionsDiv);
      }

      // 후속 질문 제안 (활성화됨)
      const followUps = result?.suggestFollowUp ?? [];
      if (followUps.length > 0) {
        const suggestDiv = document.createElement('div');
        suggestDiv.style.cssText = 'margin-top: 0.75rem; display: flex; gap: 0.4rem; flex-wrap: wrap; padding-left: 1.8rem;';
        const label = document.createElement('span');
        label.textContent = '💬';
        label.style.cssText = 'font-size: 0.7rem; color: var(--text-muted); margin-right: 0.2rem; align-self: center;';
        suggestDiv.appendChild(label);
        followUps.slice(0, 3).forEach((suggestion: string) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = suggestion;
          btn.style.cssText = 'padding: 0.35rem 0.65rem; background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.25); border-radius: 14px; color: #d4af37; font-size: 0.72rem; cursor: pointer; transition: all 0.2s;';
          btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(212, 175, 55, 0.2)'; btn.style.transform = 'translateY(-1px)'; });
          btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(212, 175, 55, 0.1)'; btn.style.transform = 'translateY(0)'; });
          btn.addEventListener('click', () => sendMessage(suggestion));
          suggestDiv.appendChild(btn);
        });
        aiMsgDiv.appendChild(suggestDiv);
      }

      aiMsgDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
      typingDiv.remove();
      const errorDiv = document.createElement('div');
      errorDiv.className = 'ai-message assistant';
      errorDiv.innerHTML = `<div style="color: var(--text-strong);">❌ 오류가 발생했어요. 다시 시도해주세요.</div>`;
      errorDiv.style.background = 'rgba(239, 68, 68, 0.15)';
      errorDiv.style.padding = '1rem';
      errorDiv.style.borderRadius = '12px';
      errorDiv.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      messagesContainer.appendChild(errorDiv);

      errorDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // AI 응답 포맷팅 (마크다운 → HTML 변환)
  function formatAIResponse(text: string): string {
    let html = text;
    // 코드블록 보호 (임시 치환)
    const codeBlocks: string[] = [];
    html = html.replace(/```([\s\S]*?)```/g, (_m, code) => {
      codeBlocks.push(code.trim());
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });
    // 헤더 (### → h4, ## → h3)
    html = html.replace(/^### (.+)$/gm, '<h4 style="margin:0.8rem 0 0.3rem;font-size:0.95rem;color:#d4af37;font-weight:700;">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 style="margin:1rem 0 0.4rem;font-size:1.05rem;color:#d4af37;font-weight:700;">$1</h3>');
    // 굵은 글씨
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e5c76b;">$1</strong>');
    // 이탤릭
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // 인라인 코드
    html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(212,175,55,0.12);padding:0.15em 0.4em;border-radius:4px;font-size:0.88em;color:#d4af37;">$1</code>');
    // 번호 리스트
    html = html.replace(/^(\d+)\. (.+)$/gm, '<div style="display:flex;gap:0.4rem;margin:0.2rem 0;padding-left:0.5rem;"><span style="color:#d4af37;font-weight:600;min-width:1.2em;">$1.</span><span>$2</span></div>');
    // 불릿 리스트 (•, -, *)
    html = html.replace(/^[•\-\*] (.+)$/gm, '<div style="display:flex;gap:0.4rem;margin:0.15rem 0;padding-left:0.5rem;"><span style="color:#d4af37;">•</span><span>$1</span></div>');
    // URL 링크
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="#" onclick="window.api?.openExternalUrl?.(\'$1\');return false;" style="color:#d4af37;text-decoration:underline;cursor:pointer;">$1</a>');
    // 줄바꿈
    html = html.replace(/\n/g, '<br>');
    // 코드블록 복원
    codeBlocks.forEach((code, i) => {
      html = html.replace(`__CODE_BLOCK_${i}__`, `<pre style="background:rgba(0,0,0,0.3);padding:0.75rem;border-radius:8px;overflow-x:auto;margin:0.5rem 0;font-size:0.82rem;border:1px solid rgba(212,175,55,0.15);"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
    });
    return html;
  }

  // AI 액션 처리
  function handleAIAction(action: string) {
    // AI 패널 닫기
    const panel = document.getElementById('ai-assistant-panel');
    if (panel) panel.style.display = 'none';

    switch (action) {
      case 'openUnifiedTab':
        // 스마트 자동 발행 탭으로 이동 (포커스는 강제하지 않음)
        const unifiedTabBtn = document.querySelector('[data-tab="unified"]') as HTMLElement;
        unifiedTabBtn?.click();
        setTimeout(() => {
          document.getElementById('unified-semi-auto-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350);
        break;
      case 'openImagesTab':
        // 이미지 관리 탭으로 이동
        const imagesTabBtn = document.querySelector('[data-tab="images"]') as HTMLElement;
        imagesTabBtn?.click();
        break;
      case 'switchToUrlMode':
      case 'switchToKeywordMode':
      case 'startGeneration':
        // 스마트 자동 발행 탭으로 이동
        const unifiedTab = document.querySelector('[data-tab="unified"]') as HTMLElement;
        unifiedTab?.click();
        // 키워드 입력란에 포커스
        setTimeout(() => {
          const keywordInput = document.getElementById('ua-keyword') as HTMLInputElement;
          keywordInput?.focus();
        }, 300);
        break;
      case 'startFullAuto':
      case 'openMultiAccountModal':
        // 풀오토 다중계정 버튼 클릭
        const multiAccountBtn = document.getElementById('multi-account-btn');
        multiAccountBtn?.click();
        break;
      case 'generateImage':
        // 썸네일 생성기 탭으로 이동
        const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
        imageToolsTab?.click();
        break;
      case 'openSettings':
        const settingsBtn = document.getElementById('settings-button-fixed');
        settingsBtn?.click();
        break;
      case 'openToolsHub':
        // 가이드/분석 모음 모달 열기
        const toolsHubBtn = document.getElementById('tools-hub-btn');
        toolsHubBtn?.click();
        break;
      case 'openExternalTools':
        // 가이드/분석 모음 모달 열고 외부유입 탭으로 이동
        const toolsBtn1 = document.getElementById('tools-hub-btn');
        toolsBtn1?.click();
        setTimeout(() => {
          const externalTab = document.querySelector('[data-tools-tab="external"]') as HTMLElement;
          externalTab?.click();
        }, 300);
        break;
      case 'openAnalyticsTools':
        // 가이드/분석 모음 모달 열고 분석도구 탭으로 이동
        const toolsBtn2 = document.getElementById('tools-hub-btn');
        toolsBtn2?.click();
        setTimeout(() => {
          const analyticsTab = document.querySelector('[data-tools-tab="analytics"]') as HTMLElement;
          analyticsTab?.click();
        }, 300);
        break;
      case 'openLeword':
        // LEWORD 키워드 분석 받으러 오픈채팅으로 이동
        window.api?.openExternalUrl?.('https://open.kakao.com/o/sPcaslwh');
        break;
      case 'openDatalab':
        // 네이버 데이터랩 열기
        window.api?.openExternalUrl?.('https://datalab.naver.com/');
        break;
      case 'openScheduleTab':
        // 예약 발행 탭으로 이동
        const scheduleTab = document.querySelector('[data-tab="schedule"]') as HTMLElement;
        scheduleTab?.click();
        break;
      case 'openContinuousTab':
        // 연속 발행 탭으로 이동
        const continuousTab = document.querySelector('[data-tab="continuous"]') as HTMLElement;
        continuousTab?.click();
        break;
      case 'playTutorialVideo':
        // 가이드/분석 모음 모달 열고 사용법 탭으로 이동
        const toolsBtn3 = document.getElementById('tools-hub-btn');
        toolsBtn3?.click();
        setTimeout(() => {
          const tutorialsTab = document.querySelector('[data-tools-tab="tutorials"]') as HTMLElement;
          tutorialsTab?.click();
        }, 300);
        break;
      case 'runAutoFix':
        // 🔧 자동 수정 실행
        runSystemAutoFix();
        break;
    }
  }

  // ✅ 시스템 자동 수정 실행
  async function runSystemAutoFix() {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;

    const pin = prompt('관리자 PIN을 입력하세요');
    if (pin === null) {
      return;
    }

    try {
      const verify = await window.api.verifyAdminPin?.(pin);
      if (!verify?.success) {
        const failDiv = document.createElement('div');
        failDiv.className = 'ai-message assistant';
        failDiv.style.cssText = 'background: rgba(239, 68, 68, 0.15); padding: 1rem; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3);';
        failDiv.innerHTML = `<div style="color: var(--text-strong); line-height: 1.6;">❌ ${escapeHtml(verify?.message || 'PIN 확인 실패')}</div>`;
        messagesContainer.appendChild(failDiv);
        failDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    } catch (e) {
      const failDiv = document.createElement('div');
      failDiv.className = 'ai-message assistant';
      failDiv.style.cssText = 'background: rgba(239, 68, 68, 0.15); padding: 1rem; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3);';
      failDiv.innerHTML = `<div style="color: var(--text-strong); line-height: 1.6;">❌ PIN 확인 중 오류가 발생했습니다.</div>`;
      messagesContainer.appendChild(failDiv);
      failDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // 진행 중 메시지 표시
    const progressDiv = document.createElement('div');
    progressDiv.className = 'ai-message assistant';
    progressDiv.style.cssText = 'background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.1)); padding: 1rem; border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.3);';
    progressDiv.innerHTML = `<div style="color: var(--text-strong); line-height: 1.6;">🔧 자동 수정 실행 중...</div>`;
    messagesContainer.appendChild(progressDiv);
    progressDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const result = await window.api.aiAssistantRunAutoFix();
      progressDiv.remove();

      const resultDiv = document.createElement('div');
      resultDiv.className = 'ai-message assistant';

      if (result.success && result.fixResults && result.fixResults.length > 0) {
        resultDiv.style.cssText = 'background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1)); padding: 1rem; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.3);';
        let html = `<div style="color: var(--text-strong); line-height: 1.6;">`;
        html += `<strong>✅ 자동 수정 완료!</strong><br><br>`;
        result.fixResults.forEach((fix: any) => {
          html += `• <strong>${fix.action}</strong>: ${fix.message}<br>`;
        });
        html += `<br>설정이 저장되었습니다. 앱을 재시작하면 변경사항이 적용됩니다.</div>`;
        resultDiv.innerHTML = html;
      } else {
        resultDiv.style.cssText = 'background: linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(184, 134, 11, 0.1)); padding: 1rem; border-radius: 12px; border: 1px solid rgba(212, 175, 55, 0.3);';
        resultDiv.innerHTML = `<div style="color: var(--text-strong); line-height: 1.6;">ℹ️ ${result.message}</div>`;
      }

      messagesContainer.appendChild(resultDiv);
      resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

      toastManager.success(result.message);

    } catch (error) {
      progressDiv.remove();

      const errorDiv = document.createElement('div');
      errorDiv.className = 'ai-message assistant';
      errorDiv.style.cssText = 'background: rgba(239, 68, 68, 0.15); padding: 1rem; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3);';
      errorDiv.innerHTML = `<div style="color: var(--text-strong);">❌ 자동 수정 중 오류가 발생했습니다.</div>`;
      messagesContainer.appendChild(errorDiv);

      errorDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

      toastManager.error('자동 수정 실패');
    }
  }

  // 전송 버튼 클릭
  sendBtn?.addEventListener('click', () => {
    if (chatInput) sendMessage(chatInput.value);
  });

  // Enter 키로 전송
  chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });

  // 빠른 질문 버튼
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const question = btn.getAttribute('data-question');
      if (question) sendMessage(question);
    });
  });

  // ✅ 오늘의 팁 기능
  // 시간대별 스마트 팁 시스템
  const smartTips: Record<string, string[]> = {
    morning: [
      '☀️ 오전은 정보성 글이 유입 높아요! "방법", "가이드" 키워드 추천',
      '🌅 아침에 발행하면 오후 유입 피크를 잡을 수 있어요',
      '📊 출근길 검색 트렌드: 건강, 재테크, 자기계발이 인기!',
      '⏰ 오전 8~9시 발행은 직장인 검색과 맞물려 효과적이에요',
      '💡 아침에 키워드 리서치 → 점심에 발행하면 최적의 타이밍!',
    ],
    afternoon: [
      '🔥 점심시간(11:30~13:00)이 가장 검색량이 높아요!',
      '🛍️ 오후엔 쇼핑/맛집/여행 키워드 검색이 급증해요',
      '📈 오전에 발행한 글의 유입 현황을 체크해보세요',
      '🎯 경쟁도 낮은 롱테일 키워드를 오후에 공략하세요',
      '💰 쇼핑 커넥트는 오후 2~5시 발행이 전환율 높아요',
    ],
    evening: [
      '🌙 저녁 8~10시는 모바일 검색 피크 시간이에요',
      '📱 저녁엔 후기, 비교, 추천 키워드가 잘 돼요',
      '🔄 내일 아침 자동발행을 예약해두세요! (예약발행 탭)',
      '📝 하루 마무리: 오늘 발행한 글의 검색 순위를 확인해보세요',
      '⭐ 저품질 방지! 하루 최대 2~3개 발행이 안전해요',
    ],
    general: [
      '키워드는 검색량 500~3000 사이가 상위노출 확률이 높아요!',
      '이미지는 최소 3개 이상 넣으면 체류시간이 늘어나요 🖼️',
      '본문에 키워드를 자연스럽게 5~7회 반복하면 좋아요',
      '소제목(H2, H3)을 활용하면 가독성이 좋아져요',
      '글 길이는 1500~2500자가 가장 이상적이에요',
      'LEWORD에서 경쟁도 낮은 키워드를 찾아보세요 🔍',
      '썸네일은 밝고 눈에 띄는 색상이 클릭률이 높아요',
      '관련 키워드를 태그에 5~10개 추가하세요 🏷️',
      '정기적으로 과거 글을 업데이트하면 노출이 유지돼요',
    ]
  };

  function getSmartTipCategory(): string {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 || hour < 2) return 'evening';
    return 'general';
  }

  const tipContent = document.getElementById('ai-tip-content');
  const tipRefreshBtn = document.getElementById('ai-tip-refresh');

  function showRandomTip() {
    if (tipContent) {
      const category = getSmartTipCategory();
      const tips = smartTips[category] || smartTips.general;
      const randomTip = tips[Math.floor(Math.random() * tips.length)];
      tipContent.textContent = randomTip;
    }
  }
  // 초기 팁 표시
  showRandomTip();

  tipRefreshBtn?.addEventListener('click', showRandomTip);

  // ✅ 대화 초기화 버튼
  const clearChatBtn = document.getElementById('ai-clear-chat');
  clearChatBtn?.addEventListener('click', () => {
    if (messagesContainer) {
      messagesContainer.innerHTML = `
        <div class="ai-message assistant" style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(184, 134, 11, 0.1)); padding: 1rem; border-radius: 12px; border: 1px solid rgba(212, 175, 55, 0.3);">
          <div style="color: var(--text-strong); line-height: 1.6;">
            대화가 초기화되었어요! ✨<br><br>
            무엇이든 물어보세요! 🙌
          </div>
        </div>
      `;
    }

    try {
      window.api?.aiAssistantClearChat?.();
    } catch (e) {
      console.warn('[aiAssistant] catch ignored:', e);
    }
  });

  // ✅ 바로가기 링크 클릭 처리
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('ai-action-link')) {
      e.preventDefault();
      const action = target.getAttribute('data-action');
      if (action) {
        handleAIAction(action);
      }
    }
  });

  console.log('[AIAssistant] AI 어시스턴트 초기화 완료');
}
