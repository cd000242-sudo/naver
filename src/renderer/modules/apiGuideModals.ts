// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] API 가이드 모달 모듈
// renderer.ts에서 추출 — API 키 발급 가이드 + 통합 API 키 모달
// ═══════════════════════════════════════════════════════════════════

declare const window: Window & { api: any };
// ============================================
// API 키 발급 가이드 모달
// ============================================
export function initApiGuideModal(): void {
  const apiGuideModal = document.getElementById('api-guide-modal');
  const apiGuideBtns = document.querySelectorAll('.api-guide-btn');
  const closeApiGuideBtns = document.querySelectorAll('[data-close-api-guide]');
  const apiGuideOpenSiteBtn = document.getElementById('api-guide-open-site-btn') as HTMLButtonElement;

  // API 키별 가이드 내용
  const apiGuides: Record<string, { title: string; content: string; url: string }> = {
    gemini: {
      title: '📖 Gemini API 키 발급 가이드 (완전 초보자용)',
      url: 'https://aistudio.google.com/apikey',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: var(--primary); margin-bottom: 1rem;">🎯 Gemini API 키란?</h3>
          <p style="margin-bottom: 1rem;">Gemini는 Google의 AI 모델입니다. 이 키를 발급받으면 AI로 글을 자동 생성할 수 있습니다.</p>
          
          <h3 style="color: var(--primary); margin-bottom: 1rem;">📝 발급 방법 (단계별)</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;">
              <strong>1단계: Google 계정으로 로그인</strong><br>
              Google 계정이 필요합니다. Gmail 계정이 있으면 됩니다.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>2단계: AI Studio 접속</strong><br>
              아래 "사이트로 이동" 버튼을 클릭하거나, 브라우저에서 <code style="background: var(--bg-tertiary); padding: 0.25rem 0.5rem; border-radius: 4px;">https://aistudio.google.com/apikey</code> 를 입력하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>3단계: API 키 생성</strong><br>
              화면에서 "Create API Key" 또는 "API 키 만들기" 버튼을 클릭하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>4단계: 프로젝트 선택</strong><br>
              새 프로젝트를 만들거나 기존 프로젝트를 선택하세요. 처음이면 "새 프로젝트 만들기"를 선택하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>5단계: API 키 복사</strong><br>
              생성된 API 키가 화면에 표시됩니다. <strong style="color: var(--primary);">이 키를 복사</strong>하세요! (나중에 다시 볼 수 없으니 꼭 복사하세요)
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>6단계: 여기에 붙여넣기</strong><br>
              복사한 API 키를 환경설정의 "Gemini API Key" 입력창에 붙여넣으세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>7단계: 저장</strong><br>
              환경설정 하단의 "저장" 버튼을 클릭하세요.
            </li>
          </ol>
          
          <div style="background: rgba(212, 175, 55, 0.1); border: 2px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #D4AF37; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">Gemini API는 <strong>Google 정책/계정 설정에 따라 무료 티어 또는 과금</strong>이 적용될 수 있습니다. 사용 전 Google 콘솔에서 결제/할당량 설정을 확인해주세요.</p>
          </div>
          
          <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 팁</h4>
            <ul style="padding-left: 1.5rem; margin: 0;">
              <li>API 키는 비밀번호처럼 중요합니다. 다른 사람에게 공유하지 마세요.</li>
              <li>API 키가 노출되면 AI Studio에서 삭제하고 새로 발급받으세요.</li>
              <li>발급 후 바로 사용할 수 있습니다. 별도 승인 절차는 없습니다.</li>
            </ul>
          </div>
        </div>
      `
    },
    openai: {
      title: '📖 OpenAI API 키 발급 가이드 (완전 초보자용)',
      url: 'https://platform.openai.com/api-keys',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: var(--primary); margin-bottom: 1rem;">🎯 OpenAI API 키란?</h3>
          <p style="margin-bottom: 1rem;">OpenAI는 ChatGPT를 만든 회사입니다. 이 키를 발급받으면 고품질 AI 글을 생성할 수 있습니다.</p>
          
          <h3 style="color: var(--primary); margin-bottom: 1rem;">📝 발급 방법 (단계별)</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;">
              <strong>1단계: OpenAI 계정 만들기</strong><br>
              <a href="https://platform.openai.com/signup" target="_blank" style="color: var(--primary); text-decoration: underline;">OpenAI 플랫폼</a>에서 계정을 만드세요. 이메일 주소와 비밀번호가 필요합니다.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>2단계: 결제 정보 등록</strong><br>
              OpenAI는 유료 서비스입니다. 신용카드나 체크카드를 등록해야 합니다. (최소 $5 충전 필요)
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>3단계: API 키 페이지 접속</strong><br>
              아래 "사이트로 이동" 버튼을 클릭하거나, 로그인 후 왼쪽 메뉴에서 "API keys"를 클릭하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>4단계: 새 API 키 생성</strong><br>
              "Create new secret key" 또는 "새 비밀 키 만들기" 버튼을 클릭하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>5단계: 이름 지정 (선택)</strong><br>
              API 키에 이름을 붙일 수 있습니다. 예: "블로그 자동화"
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>6단계: API 키 복사</strong><br>
              생성된 API 키가 화면에 표시됩니다. <strong style="color: var(--primary);">이 키를 즉시 복사</strong>하세요! (다시 볼 수 없습니다)
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>7단계: 여기에 붙여넣기</strong><br>
              복사한 API 키를 환경설정의 "OpenAI API Key" 입력창에 붙여넣으세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>8단계: 저장</strong><br>
              환경설정 하단의 "저장" 버튼을 클릭하세요.
            </li>
          </ol>
          
          <div style="background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #EF4444; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">OpenAI API는 <strong>유료 서비스</strong>입니다. 사용한 만큼 비용이 청구됩니다. 글 1개 생성 시 약 $0.01~0.03 정도 소요됩니다. 사용량은 OpenAI 대시보드에서 확인할 수 있습니다.</p>
          </div>
          
          <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 팁</h4>
            <ul style="padding-left: 1.5rem; margin: 0;">
              <li>사용량을 제한하여 예상치 못한 비용을 방지할 수 있습니다.</li>
              <li>API 키는 절대 공유하지 마세요. 노출되면 즉시 삭제하고 새로 발급받으세요.</li>
              <li>OpenAI는 무료 크레딧을 제공하는 경우가 있습니다. 프로모션을 확인하세요.</li>
            </ul>
          </div>
        </div>
      `
    },
    claude: {
      title: '📖 Claude API 키 발급 가이드 (완전 초보자용)',
      url: 'https://console.anthropic.com/settings/keys',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: var(--primary); margin-bottom: 1rem;">🎯 Claude API 키란?</h3>
          <p style="margin-bottom: 1rem;">Claude는 Anthropic의 AI 모델입니다. 고품질 글 생성에 특화되어 있습니다.</p>
          
          <h3 style="color: var(--primary); margin-bottom: 1rem;">📝 발급 방법 (단계별)</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;">
              <strong>1단계: Anthropic 계정 만들기</strong><br>
              <a href="https://console.anthropic.com/signup" target="_blank" style="color: var(--primary); text-decoration: underline;">Anthropic Console</a>에서 계정을 만드세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>2단계: 결제 정보 등록</strong><br>
              Claude API는 유료 서비스입니다. 신용카드를 등록해야 합니다.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>3단계: API 키 페이지 접속</strong><br>
              아래 "사이트로 이동" 버튼을 클릭하거나, 로그인 후 "API Keys" 메뉴를 클릭하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>4단계: 새 API 키 생성</strong><br>
              "Create Key" 또는 "키 만들기" 버튼을 클릭하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>5단계: 이름 지정</strong><br>
              API 키에 이름을 붙일 수 있습니다. 예: "블로그 자동화"
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>6단계: API 키 복사</strong><br>
              생성된 API 키를 <strong style="color: var(--primary);">즉시 복사</strong>하세요! (다시 볼 수 없습니다)
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>7단계: 여기에 붙여넣기</strong><br>
              복사한 API 키를 환경설정의 "Claude API Key" 입력창에 붙여넣으세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>8단계: 저장</strong><br>
              환경설정 하단의 "저장" 버튼을 클릭하세요.
            </li>
          </ol>
          
          <div style="background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #EF4444; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">Claude API는 <strong>유료 서비스</strong>입니다. 사용한 만큼 비용이 청구됩니다.</p>
          </div>
        </div>
      `
    },
    pexels: {
      title: '📖 Pexels API 키 발급 가이드 (완전 초보자용)',
      url: 'https://www.pexels.com/api/',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: var(--primary); margin-bottom: 1rem;">🎯 Pexels API 키란?</h3>
          <p style="margin-bottom: 1rem;">Pexels는 무료 고품질 사진을 제공하는 사이트입니다. 이 키를 발급받으면 블로그 글에 이미지를 자동으로 삽입할 수 있습니다.</p>
          
          <h3 style="color: var(--primary); margin-bottom: 1rem;">📝 발급 방법 (단계별)</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;">
              <strong>1단계: Pexels 계정 만들기</strong><br>
              <a href="https://www.pexels.com/join" target="_blank" style="color: var(--primary); text-decoration: underline;">Pexels</a>에서 무료 계정을 만드세요. 이메일 주소만 있으면 됩니다.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>2단계: API 페이지 접속</strong><br>
              아래 "사이트로 이동" 버튼을 클릭하거나, 로그인 후 <a href="https://www.pexels.com/api/" target="_blank" style="color: var(--primary); text-decoration: underline;">https://www.pexels.com/api/</a> 로 이동하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>3단계: API 키 생성</strong><br>
              "Get Started" 또는 "시작하기" 버튼을 클릭하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>4단계: 애플리케이션 정보 입력</strong><br>
              애플리케이션 이름을 입력하세요. 예: "블로그 자동화"
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>5단계: API 키 복사</strong><br>
              생성된 API 키가 화면에 표시됩니다. <strong style="color: var(--primary);">이 키를 복사</strong>하세요!
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>6단계: 여기에 붙여넣기</strong><br>
              복사한 API 키를 환경설정의 "Pexels API Key" 입력창에 붙여넣으세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>7단계: 저장</strong><br>
              환경설정 하단의 "저장" 버튼을 클릭하세요.
            </li>
          </ol>
          
          <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #10B981; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">Pexels API는 <strong>일반적으로 무료</strong>로 사용할 수 있으며, 사용량 제한이 있습니다. 자세한 조건은 Pexels 정책을 확인해주세요.</p>
          </div>
          
          <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 팁</h4>
            <ul style="padding-left: 1.5rem; margin: 0;">
              <li>Pexels의 모든 이미지는 무료로 사용 가능합니다.</li>
              <li>이미지 저작권 걱정 없이 사용할 수 있습니다.</li>
              <li>시간당 200회 요청 제한이 있습니다. (충분합니다)</li>
            </ul>
          </div>
        </div>
      `
    },
    prodia: {
      title: '📖 Prodia Token 발급 가이드 (이미지 생성)',
      url: 'https://app.prodia.com/api',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: var(--primary); margin-bottom: 1rem;">🎯 Prodia Token이란?</h3>
          <p style="margin-bottom: 1rem;">Prodia는 빠르고 가성비 좋은 이미지 생성 API입니다. Prodia Token을 발급받아 환경설정에 입력하면 <strong>Prodia AI 이미지 생성</strong>을 사용할 수 있습니다.</p>

          <h3 style="color: var(--primary); margin-bottom: 1rem;">📝 발급 방법 (단계별)</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;"><strong>1단계: Prodia 접속</strong><br>
              아래 "사이트로 이동" 버튼을 클릭해 <a href="https://app.prodia.com/api" target="_blank" style="color: var(--primary); text-decoration: underline;">Prodia API 페이지</a>로 이동하세요.</li>
            <li style="margin-bottom: 0.75rem;"><strong>2단계: 로그인/가입</strong><br>
              Prodia 계정으로 로그인하거나 새로 가입하세요.</li>
            <li style="margin-bottom: 0.75rem;"><strong>3단계: Token 생성</strong><br>
              API 페이지에서 Token을 생성/복사하세요.</li>
            <li style="margin-bottom: 0.75rem;"><strong>4단계: 환경설정에 입력</strong><br>
              환경설정 → "Prodia API Token" 입력창에 붙여넣고 "저장"을 누르세요.</li>
          </ol>

          <div style="background: rgba(239, 68, 68, 0.08); border: 2px solid rgba(239, 68, 68, 0.2); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #EF4444; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">Prodia는 <strong>1,000회 이후부터 $0.0025</strong> 수준으로 저렴합니다. (정확한 과금/무료 정책은 Prodia 정책 및 계정 설정을 확인해주세요)</p>
          </div>

          <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">📚 참고 문서</h4>
            <ul style="padding-left: 1.5rem; margin: 0;">
              <li><a href="https://docs.prodia.com/guides/generating-images/" target="_blank" style="color: var(--primary); text-decoration: underline;">이미지 생성 가이드</a></li>
              <li><a href="https://docs.prodia.com/guides/generating-videos/" target="_blank" style="color: var(--primary); text-decoration: underline;">영상 생성 가이드</a></li>
            </ul>
          </div>
        </div>
      `
    },
    stability: {
      title: '📖 Stability AI API 키 발급 가이드 (고품질 실사/영상)',
      url: 'https://key.stablediffusionapi.com/',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: #3b82f6; margin-bottom: 1rem;">🎯 Stability AI API 키란?</h3>
          <p style="margin-bottom: 1rem;">Stability AI는 현존 최고 수준의 실사 이미지 생성 및 영상 생성 모델을 제공합니다.</p>
          
          <h3 style="color: #3b82f6; margin-bottom: 1rem;">📝 발급 방법 (단계별)</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;">
              <strong>1단계: Stability AI 계정 가입</strong><br>
              <a href="https://dreamstudio.ai/" target="_blank" style="color: #3b82f6; text-decoration: underline;">DreamStudio</a> 또는 <a href="https://platform.stability.ai/" target="_blank" style="color: #3b82f6; text-decoration: underline;">Stability Platform</a>에서 가입하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>2단계: 결제 정보 및 크레딧 구매</strong><br>
              Stability AI는 종량제(크레딧) 방식입니다. 최소 $10 단위로 충전하여 사용할 수 있습니다.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>3단계: API 키 관리 페이지 접속</strong><br>
              아래 "사이트로 이동" 버튼을 클릭하거나 <a href="https://platform.stability.ai/account/keys" target="_blank" style="color: #3b82f6; text-decoration: underline;">계정 키 페이지</a>로 이동하세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>4단계: 새 API 키 생성</strong><br>
              "Create API Key" 버튼을 클릭하여 새 키를 발급받으세요.
            </li>
            <li style="margin-bottom: 0.75rem;">
              <strong>5단계: 키 복사 및 입력</strong><br>
              발급된 키를 복사하여 환경설정의 <strong>Stability AI API 키</strong> 칸에 붙여넣으세요.
            </li>
          </ol>
          
          <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #3b82f6; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;"><strong>Ultra 이미지</strong>: 장당 약 130원 | <strong>SVD 영상</strong>: 편당 약 270원 수준입니다. (크레딧 단가 기준)</p>
          </div>
        </div>
      `
    },
    falai: {
      title: '📖 Fal.ai API 키 발급 가이드 (FLUX 이미지)',
      url: 'https://fal.ai/dashboard/keys',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: #ec4899; margin-bottom: 1rem;">🎯 Fal.ai API 키란?</h3>
          <p style="margin-bottom: 1rem;">Fal.ai는 FLUX 모델 기반의 빠른 이미지 생성 API입니다.</p>
          
          <h3 style="color: #ec4899; margin-bottom: 1rem;">📝 발급 방법</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;"><strong>1단계:</strong> Fal.ai 사이트 접속 및 가입</li>
            <li style="margin-bottom: 0.75rem;"><strong>2단계:</strong> Dashboard → Keys 메뉴 이동</li>
            <li style="margin-bottom: 0.75rem;"><strong>3단계:</strong> Create API Key 클릭</li>
            <li style="margin-bottom: 0.75rem;"><strong>4단계:</strong> 발급된 키 복사하여 입력</li>
          </ol>
          
          <div style="background: rgba(236, 72, 153, 0.1); border: 2px solid rgba(236, 72, 153, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #ec4899; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">FLUX 이미지 생성: 장당 약 $0.01~0.02</p>
          </div>
        </div>
      `
    },
    perplexity: {
      title: '📖 Perplexity API 키 발급 가이드 (실시간 검색)',
      url: 'https://www.perplexity.ai/settings/api',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: #a855f7; margin-bottom: 1rem;">🎯 Perplexity API 키란?</h3>
          <p style="margin-bottom: 1rem;">Perplexity는 실시간 검색+AI 분석 기반 콘텐츠를 생성합니다.</p>
          
          <h3 style="color: #a855f7; margin-bottom: 1rem;">📝 발급 방법</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;"><strong>1단계:</strong> Perplexity 사이트 로그인</li>
            <li style="margin-bottom: 0.75rem;"><strong>2단계:</strong> Settings → API 메뉴 이동</li>
            <li style="margin-bottom: 0.75rem;"><strong>3단계:</strong> Generate API Key 클릭</li>
            <li style="margin-bottom: 0.75rem;"><strong>4단계:</strong> pplx-로 시작하는 키 복사</li>
          </ol>
          
          <div style="background: rgba(168, 85, 247, 0.1); border: 2px solid rgba(168, 85, 247, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #a855f7; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">요청당 약 $0.005~0.02 (모델에 따라 다름)</p>
          </div>
        </div>
      `
    },
    deepinfra: {
      title: '📖 DeepInfra API 키 발급 가이드 (FLUX-2 이미지)',
      url: 'https://deepinfra.com/dash/api_keys',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: #fb923c; margin-bottom: 1rem;">🎯 DeepInfra API 키란?</h3>
          <p style="margin-bottom: 1rem;">DeepInfra는 FLUX-2 모델을 사용한 가성비 좋은 이미지 생성 API입니다.</p>
          
          <h3 style="color: #fb923c; margin-bottom: 1rem;">📝 발급 방법</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;"><strong>1단계:</strong> DeepInfra 사이트 가입</li>
            <li style="margin-bottom: 0.75rem;"><strong>2단계:</strong> Dashboard → API Keys 이동</li>
            <li style="margin-bottom: 0.75rem;"><strong>3단계:</strong> Create Key 클릭</li>
            <li style="margin-bottom: 0.75rem;"><strong>4단계:</strong> 발급된 키 복사하여 입력</li>
          </ol>
          
          <div style="background: rgba(251, 146, 60, 0.1); border: 2px solid rgba(251, 146, 60, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #fb923c; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">FLUX-2 이미지: 장당 약 $0.01 (매우 저렴!)</p>
          </div>
        </div>
      `
    },
    naver: {
      title: '📖 네이버 검색 API 키 발급 가이드 (크롤링 강화)',
      url: 'https://developers.naver.com/apps/#/register',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: #03c75a; margin-bottom: 1rem;">🎯 네이버 검색 API란?</h3>
          <p style="margin-bottom: 1rem;">URL 크롤링 실패 시 네이버 블로그/뉴스에서 콘텐츠를 수집합니다.</p>
          
          <h3 style="color: #03c75a; margin-bottom: 1rem;">📝 발급 방법</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;"><strong>1단계:</strong> 네이버 개발자 센터 접속</li>
            <li style="margin-bottom: 0.75rem;"><strong>2단계:</strong> 애플리케이션 등록 클릭</li>
            <li style="margin-bottom: 0.75rem;"><strong>3단계:</strong> 검색 API 선택 후 앱 생성</li>
            <li style="margin-bottom: 0.75rem;"><strong>4단계:</strong> Client ID와 Secret 복사</li>
          </ol>
          
          <div style="background: rgba(3, 199, 90, 0.1); border: 2px solid rgba(3, 199, 90, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #03c75a; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">네이버 검색 API는 <strong>하루 25,000회까지 무료</strong>입니다.</p>
          </div>
        </div>
      `
    },
    'naver-ad': {
      title: '📖 네이버 광고 API 키 발급 가이드 (키워드 분석)',
      url: 'https://manage.searchad.naver.com/customers/4025252/tool/api-document',
      content: `
        <div style="line-height: 1.8; color: var(--text-strong);">
          <h3 style="color: #06b6d4; margin-bottom: 1rem;">🎯 네이버 광고 API란?</h3>
          <p style="margin-bottom: 1rem;">검색량 조회, 키워드 헌팅 등 SEO 분석 기능을 제공합니다.</p>
          
          <h3 style="color: #06b6d4; margin-bottom: 1rem;">📝 발급 방법</h3>
          <ol style="padding-left: 1.5rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.75rem;"><strong>1단계:</strong> 네이버 검색광고 가입</li>
            <li style="margin-bottom: 0.75rem;"><strong>2단계:</strong> 도구 → API 사용 관리 이동</li>
            <li style="margin-bottom: 0.75rem;"><strong>3단계:</strong> API 라이선스 발급</li>
            <li style="margin-bottom: 0.75rem;"><strong>4단계:</strong> Access License, Secret Key, Customer ID 복사</li>
          </ol>
          
          <div style="background: rgba(6, 182, 212, 0.1); border: 2px solid rgba(6, 182, 212, 0.3); border-radius: 8px; padding: 1rem; margin: 1rem 0;">
            <h4 style="color: #06b6d4; margin-bottom: 0.5rem;">💰 비용 안내</h4>
            <p style="margin: 0;">네이버 광고 API는 <strong>무료</strong>이며 일일 호출 제한이 있습니다.</p>
          </div>
        </div>
      `
    }
  };

  // 가이드 버튼 클릭 이벤트
  apiGuideBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const apiType = btn.getAttribute('data-api');
      if (apiType && apiGuides[apiType] && apiGuideModal) {
        const guide = apiGuides[apiType];
        const titleEl = document.getElementById('api-guide-title');
        const contentEl = document.getElementById('api-guide-content');

        if (titleEl) titleEl.textContent = guide.title;
        if (contentEl) contentEl.innerHTML = guide.content;

        // 사이트로 이동 버튼
        if (apiGuideOpenSiteBtn) {
          apiGuideOpenSiteBtn.onclick = () => {
            window.api.openExternalUrl(guide.url);
          };
        }

        // 모달 표시
        apiGuideModal.style.display = 'flex';
        apiGuideModal.setAttribute('aria-hidden', 'false');
      }
    });
  });

  // 모달 닫기
  closeApiGuideBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (apiGuideModal) {
        apiGuideModal.style.display = 'none';
        apiGuideModal.setAttribute('aria-hidden', 'true');
      }
    });
  });

  // 모달 배경 클릭 시 닫기
  if (apiGuideModal) {
    apiGuideModal.addEventListener('click', (e) => {
      if (e.target === apiGuideModal) {
        apiGuideModal.style.display = 'none';
        apiGuideModal.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // ✅ Stability AI 발급 바로가기 버튼
  const stabilityIssuanceBtn = document.getElementById('stability-api-issuance-btn');
  if (stabilityIssuanceBtn) {
    stabilityIssuanceBtn.addEventListener('click', () => {
      window.open('https://platform.stability.ai/account/keys', '_blank');
    });
  }

  // ✅ [2026-01-26] 통합 API 키 발급 모달 초기화
  initAllApiKeysModal();
}

// ============================================
// 통합 API 키 발급 모달
// ============================================
export function initAllApiKeysModal(): void {
  const openBtn = document.getElementById('open-all-api-keys-modal-btn');
  const modal = document.getElementById('all-api-keys-modal');
  const closeBtn = document.getElementById('all-api-keys-modal-close');
  const confirmBtn = document.getElementById('all-api-keys-modal-confirm');
  const linkBtns = document.querySelectorAll('.api-key-link-btn');

  if (!modal) return;

  // 모달 열기
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
    });
  }

  // 모달 닫기 - X 버튼
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    });
  }

  // 모달 닫기 - 확인 버튼
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    });
  }

  // 모달 외부 클릭 시 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  });

  // 각 API 키 링크 버튼 클릭 시 외부 URL 열기
  linkBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      if (url) {
        window.api?.openExternalUrl?.(url) || window.open(url, '_blank');
      }
    });

    // 호버 효과
    btn.addEventListener('mouseenter', () => {
      (btn as HTMLElement).style.transform = 'translateX(4px)';
      (btn as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    });
    btn.addEventListener('mouseleave', () => {
      (btn as HTMLElement).style.transform = '';
      (btn as HTMLElement).style.boxShadow = '';
    });
  });

  console.log('[AllApiKeysModal] ✅ 통합 API 키 발급 모달 초기화 완료');
}
