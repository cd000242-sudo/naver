// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 사용 가이드 모달 모듈
// renderer.ts에서 추출 — 사용 가이드 모달 (대용량 HTML 컨텐츠 포함)
// ═══════════════════════════════════════════════════════════════════

declare const window: Window & { api: any };
const appendLog = (window as any).appendLog || ((...args: any[]) => console.log("[guideModals]", ...args));
// ============================================
// 사용 가이드 모달
// ============================================
export function initUserGuideModal(): void {
  const userGuideModal = document.getElementById('user-guide-modal') as HTMLDivElement;
  const userGuideBtn = document.getElementById('user-guide-btn') as HTMLButtonElement;
  const closeUserGuideBtns = document.querySelectorAll('[data-close-user-guide]');
  const guideTabBtns = document.querySelectorAll('.guide-tab-btn');
  const guideContent = document.getElementById('user-guide-content');

  // 사용 가이드 내용 (2025년 12월 최신 버전)
  const guideContents: Record<string, string> = {
    start: `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">🎉 Better Life Naver 사용 가이드</h3>
        <p style="margin-bottom: 1.5rem; font-size: 1.1rem;">AI 기반 네이버 블로그 자동화 프로그램입니다. 10분 안에 시작할 수 있습니다!</p>
        
        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(6, 182, 212, 0.1)); border: 2px solid var(--primary); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
          <h4 style="color: var(--primary); margin-bottom: 1rem;">🚀 빠른 시작 (5단계)</h4>
          <ol style="padding-left: 1.5rem; margin: 0;">
            <li style="margin-bottom: 1rem;">
              <strong>1단계: API 키 발급</strong><br>
              <span style="color: var(--text-muted);">우측 <strong>⚙️ 환경 설정</strong> 버튼 클릭 → 각 API 키 옆의 "📖 가이드" 버튼으로 발급 방법 확인</span>
            </li>
            <li style="margin-bottom: 1rem;">
              <strong>2단계: API 키 입력 및 저장</strong><br>
              <span style="color: var(--text-muted);">발급받은 API 키를 입력창에 붙여넣고 <strong>"저장"</strong> 버튼 클릭 (앱 재시작해도 유지됨)</span>
            </li>
            <li style="margin-bottom: 1rem;">
              <strong>3단계: 네이버 계정 입력</strong><br>
              <span style="color: var(--text-muted);"><strong>🚀 스마트 자동 발행</strong> 탭에서 네이버 아이디/비밀번호 입력 후 "기억하기" 체크</span>
            </li>
            <li style="margin-bottom: 1rem;">
              <strong>4단계: 콘텐츠 생성</strong><br>
              <span style="color: var(--text-muted);">URL 또는 키워드 입력 → 카테고리 선택 → <strong>"⚡ 풀오토 발행"</strong> 또는 <strong>"🔧 반자동 발행"</strong> 클릭</span>
            </li>
            <li style="margin-bottom: 1rem;">
              <strong>5단계: 완료!</strong><br>
              <span style="color: var(--text-muted);">AI가 글 생성 → 이미지 삽입 → 네이버 블로그 자동 발행까지 완료!</span>
            </li>
          </ol>
        </div>
        
        <div style="background: rgba(212, 175, 55, 0.1); border: 2px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #D4AF37; margin-bottom: 0.5rem;">💡 추천 시작 방법</h4>
          <p style="margin: 0;">처음 사용하시는 분은 <strong>반자동 발행</strong>을 추천합니다. 생성된 글을 확인하고 수정할 수 있어 안전합니다!</p>
        </div>
        
        <div style="background: rgba(6, 182, 212, 0.1); border: 2px solid rgba(6, 182, 212, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #06b6d4; margin-bottom: 0.5rem;">🆕 주요 기능</h4>
          <ul style="padding-left: 1.5rem; margin: 0; font-size: 0.9rem;">
            <li><strong>📊 분석 도구</strong> - 키워드 경쟁도 분석, 경쟁 블로그 분석, 제목 A/B 테스트</li>
            <li><strong>🎨 이미지 도구</strong> - AI 이미지 생성, 썸네일 자동 생성</li>
            <li><strong>📅 스케줄 관리</strong> - 예약 발행, 연속 발행</li>
            <li><strong>🔗 외부유입</strong> - 외부 링크 자동 삽입</li>
          </ul>
        </div>
        
        <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: var(--primary); margin-bottom: 0.5rem;">❓ 자주 묻는 질문</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li><strong>Q: 어떤 API 키가 필수인가요?</strong><br>A: <strong>Gemini API 키 하나만</strong> 있으면 됩니다! 글 생성 + 이미지 생성 모두 가능합니다.</li>
            <li><strong>Q: 비용이 얼마나 드나요?</strong><br>A: Gemini API는 <strong>Google 정책/계정 설정에 따라 무료 티어 또는 과금</strong>이 적용될 수 있습니다. 사용 전 Google 콘솔에서 결제/할당량 설정을 확인해주세요.</li>
            <li><strong>Q: 네이버 계정 정보가 안전한가요?</strong><br>A: 네, 모든 정보는 로컬 PC에만 저장되며 외부로 전송되지 않습니다.</li>
          </ul>
        </div>
      </div>
    `,
    api: `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">🔑 API 키 발급 가이드</h3>
        
        <div style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(255, 215, 0, 0.1)); border: 2px solid rgba(212, 175, 55, 0.5); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
          <h4 style="color: #D4AF37; margin-bottom: 1rem; font-size: 1.2rem;">🔑 Gemini API 키 (필수, 이것만 있으면 됨!)</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li><strong>무료 티어(정책/계정 설정에 따라 다름)</strong> - 일일/월간 할당량은 Google 정책에 따릅니다</li>
            <li><strong>글 생성</strong> - Gemini 2.0 Flash (빠르고 안정적)</li>
            <li><strong>이미지 생성</strong> - 나노 바나나 프로 (Gemini 3) / Imagen 4</li>
          </ul>
          <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(212, 175, 55, 0.2); border-radius: 8px;">
            <strong>발급 방법:</strong> <a href="https://aistudio.google.com/apikey" target="_blank" style="color: #D4AF37;">aistudio.google.com/apikey</a> → Google 로그인 → "Create API Key" 클릭
          </div>
        </div>
        
        <div style="background: rgba(6, 182, 212, 0.1); border: 2px solid rgba(6, 182, 212, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
          <h4 style="color: #06b6d4; margin-bottom: 0.5rem;">📊 네이버 API 키 (선택, 분석 기능용)</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li><strong>네이버 검색 API</strong> - 🆓 무료, 크롤링 성공률 향상</li>
            <li><strong>네이버 키워드 도구 API</strong> - 🆓 무료, 정확한 검색량 분석</li>
          </ul>
        </div>
        
        <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 발급 팁</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li><strong>Gemini API 키 하나만</strong> 발급받으면 모든 기능을 사용할 수 있습니다!</li>
            <li>API 키는 비밀번호처럼 중요합니다. 절대 공유하지 마세요.</li>
            <li>발급 후 바로 사용할 수 있습니다. 별도 승인 절차는 없습니다.</li>
            <li>API 키를 입력한 후 반드시 "저장" 버튼을 클릭하세요.</li>
          </ul>
        </div>
      </div>
    `,
    'full-auto': `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">⚡ 풀오토 발행 사용법</h3>
        <p style="margin-bottom: 1.5rem;">풀오토 발행은 URL이나 키워드만 입력하면 AI가 자동으로 글을 생성하고 이미지를 삽입한 후 네이버 블로그에 발행하는 완전 자동 기능입니다.</p>
        
        <h4 style="color: var(--primary); margin: 1.5rem 0 1rem 0;">📝 사용 방법 (단계별)</h4>
        <ol style="padding-left: 1.5rem; margin-bottom: 1.5rem;">
          <li style="margin-bottom: 1rem;">
            <strong>1단계: 네이버 계정 입력</strong><br>
            <span style="color: var(--text-muted);">메인 화면 상단의 "네이버 아이디"와 "비밀번호"를 입력하세요. "기억하기"를 체크하면 다음에 자동으로 입력됩니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>2단계: 콘텐츠 소스 선택</strong><br>
            <span style="color: var(--text-muted);">두 가지 방법 중 하나를 선택하세요:</span>
            <ul style="padding-left: 1.5rem; margin-top: 0.5rem; color: var(--text-muted);">
              <li><strong>URL 입력:</strong> 네이버 블로그 URL을 입력하면 해당 글을 참고하여 새 글을 생성합니다.</li>
              <li><strong>키워드 입력:</strong> 제목과 키워드를 입력하면 해당 주제로 글을 생성합니다.</li>
            </ul>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>3단계: 이미지 소스 선택</strong><br>
            <span style="color: var(--text-muted);">"이미지 소스"에서 <strong>나노 바나나 프로</strong> 또는 <strong>Imagen 4</strong>를 선택하세요. (Gemini API 키 사용 / 과금 가능)</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>4단계: 발행 모드 선택</strong><br>
            <span style="color: var(--text-muted);">"발행 방식"에서 즉시발행, 임시저장, 예약발행 중 선택하세요.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>5단계: 풀오토 발행 시작</strong><br>
            <span style="color: var(--text-muted);">"⚡ 풀오토 발행" 버튼을 클릭하세요. AI가 자동으로 모든 작업을 수행합니다!</span>
          </li>
        </ol>
        
        <div style="background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #EF4444; margin-bottom: 0.5rem;">⚠️ 주의사항</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>풀오토 발행은 생성된 글을 확인하지 않고 바로 발행합니다.</li>
            <li>처음 사용자는 반자동 발행을 먼저 사용해보세요.</li>
            <li>발행 전에 생성된 콘텐츠를 확인하고 싶다면 반자동 발행을 사용하세요.</li>
          </ul>
        </div>
        
        <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: #10B981; margin-bottom: 0.5rem;">💡 풀오토 발행의 장점</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>한 번의 클릭으로 모든 작업이 자동으로 완료됩니다.</li>
            <li>시간을 크게 절약할 수 있습니다.</li>
            <li>여러 글을 연속으로 발행할 때 유용합니다.</li>
          </ul>
        </div>
      </div>
    `,
    'semi-auto': `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">🔧 반자동 발행 사용법</h3>
        <p style="margin-bottom: 1.5rem;">반자동 발행은 AI가 글을 생성한 후, 사용자가 확인하고 수정한 다음 발행하는 방식입니다. 처음 사용자에게 추천합니다!</p>
        
        <h4 style="color: var(--primary); margin: 1.5rem 0 1rem 0;">📝 사용 방법 (단계별)</h4>
        <ol style="padding-left: 1.5rem; margin-bottom: 1.5rem;">
          <li style="margin-bottom: 1rem;">
            <strong>1단계: 콘텐츠 생성</strong><br>
            <span style="color: var(--text-muted);">URL을 입력하거나 제목/키워드를 입력한 후 "✏️ 키워드,제목으로 AI 글 생성하기" 버튼을 클릭하세요.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>2단계: 생성된 글 확인</strong><br>
            <span style="color: var(--text-muted);">AI가 생성한 제목, 본문, 해시태그를 확인하세요. 필요하면 수정할 수 있습니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>3단계: 이미지 생성 (선택)</strong><br>
            <span style="color: var(--text-muted);">"이미지 관리" 탭으로 이동하여 "소제목 분석" 버튼을 클릭하면 각 소제목에 맞는 이미지를 자동으로 생성합니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>4단계: 이미지 확인 및 수정</strong><br>
            <span style="color: var(--text-muted);">생성된 이미지를 확인하고, 마음에 들지 않으면 "재생성" 버튼을 클릭하여 다시 생성할 수 있습니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>5단계: 발행</strong><br>
            <span style="color: var(--text-muted);">모든 내용을 확인한 후 "🔧 반자동 발행" 버튼을 클릭하면 네이버 블로그에 발행됩니다.</span>
          </li>
        </ol>
        
        <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #10B981; margin-bottom: 0.5rem;">✅ 반자동 발행의 장점</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>생성된 글을 확인하고 수정할 수 있어 안전합니다.</li>
            <li>이미지를 선택적으로 생성하고 관리할 수 있습니다.</li>
            <li>발행 전에 최종 확인이 가능합니다.</li>
            <li>처음 사용자에게 가장 추천하는 방식입니다!</li>
          </ul>
        </div>
        
        <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 활용 팁</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>생성된 글의 톤이나 스타일을 수정하고 싶다면 "페러프레이징 모드"를 사용하세요.</li>
            <li>이미지가 마음에 들지 않으면 "재생성" 버튼을 여러 번 클릭하여 다른 이미지를 생성할 수 있습니다.</li>
            <li>생성된 글은 "생성된 글 목록"에 저장되므로 나중에 다시 불러와서 사용할 수 있습니다.</li>
          </ul>
        </div>
      </div>
    `,
    images: `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">🖼️ 이미지 관리 사용법</h3>
        <p style="margin-bottom: 1.5rem;">이미지 관리 탭에서는 소제목에 맞는 이미지를 생성하고 관리할 수 있습니다.</p>
        
        <h4 style="color: var(--primary); margin: 1.5rem 0 1rem 0;">📝 사용 방법 (단계별)</h4>
        <ol style="padding-left: 1.5rem; margin-bottom: 1.5rem;">
          <li style="margin-bottom: 1rem;">
            <strong>1단계: 소제목 분석</strong><br>
            <span style="color: var(--text-muted);">먼저 "통합" 탭에서 글을 생성하거나, 제목을 입력한 후 "이미지 관리" 탭으로 이동하세요.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>2단계: 소제목 분석 버튼 클릭</strong><br>
            <span style="color: var(--text-muted);">"이미지 관리" 탭에서 "소제목 분석" 버튼을 클릭하면 제목을 기반으로 소제목들이 자동으로 분석됩니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>3단계: 이미지 소스 선택</strong><br>
            <span style="color: var(--text-muted);">"이미지 소스"에서 DALL-E 3 또는 Pexels를 선택하세요. Pexels는 무료입니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>4단계: 이미지 생성</strong><br>
            <span style="color: var(--text-muted);">"이미지 생성 시작" 버튼을 클릭하면 각 소제목에 맞는 이미지가 자동으로 생성됩니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>5단계: 이미지 확인 및 수정</strong><br>
            <span style="color: var(--text-muted);">생성된 이미지를 확인하고, 마음에 들지 않으면 "재생성" 버튼을 클릭하세요.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>6단계: 이미지 선택 및 적용</strong><br>
            <span style="color: var(--text-muted);">이미지 위에 마우스를 올리면 "사용하기" 버튼이 나타납니다. 클릭하면 해당 소제목에 이미지가 적용됩니다.</span>
          </li>
        </ol>
        
        <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: var(--primary); margin-bottom: 0.5rem;">🔄 이미지 재생성 기능</h4>
          <p style="margin: 0;">생성된 이미지가 마음에 들지 않으면 "재생성" 버튼을 클릭하면 다른 이미지가 생성됩니다. 여러 번 시도할 수 있습니다!</p>
        </div>
        
        <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: #10B981; margin-bottom: 0.5rem;">💡 이미지 재사용 기능</h4>
          <p style="margin: 0;">"생성된 글 목록"에서 "🖼️ 이미지 재사용" 버튼을 클릭하면 이전에 생성한 이미지를 다시 사용할 수 있습니다. 시간과 비용을 절약할 수 있습니다!</p>
        </div>
      </div>
    `,
    schedule: `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">⏰ 예약 발행 사용법</h3>
        <p style="margin-bottom: 1.5rem;">예약 발행 기능을 사용하면 원하는 날짜와 시간에 자동으로 블로그 글이 발행됩니다.</p>
        
        <h4 style="color: var(--primary); margin: 1.5rem 0 1rem 0;">📝 사용 방법 (단계별)</h4>
        <ol style="padding-left: 1.5rem; margin-bottom: 1.5rem;">
          <li style="margin-bottom: 1rem;">
            <strong>1단계: 발행 방식 선택</strong><br>
            <span style="color: var(--text-muted);">"발행 방식" 드롭다운에서 "예약발행"을 선택하세요.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>2단계: 날짜 및 시간 선택</strong><br>
            <span style="color: var(--text-muted);">"예약 시간" 입력 필드가 나타나면 클릭하여 달력을 열고 원하는 날짜와 시간을 선택하세요.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>3단계: 확인 버튼 클릭</strong><br>
            <span style="color: var(--text-muted);">날짜와 시간을 선택한 후 "✅ 확인" 버튼을 클릭하여 예약을 확정하세요.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>4단계: 발행 시작</strong><br>
            <span style="color: var(--text-muted);">"풀오토 발행" 또는 "반자동 발행" 버튼을 클릭하면 예약된 시간에 자동으로 발행됩니다.</span>
          </li>
        </ol>
        
        <div style="background: rgba(212, 175, 55, 0.1); border: 2px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #D4AF37; margin-bottom: 0.5rem;">⏰ 예약 시간 제한</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>예약 시간은 현재 시간보다 이후여야 합니다.</li>
            <li>최소 1분 후부터 예약할 수 있습니다.</li>
            <li>예약된 글은 "스케줄 관리" 탭에서 확인할 수 있습니다.</li>
          </ul>
        </div>
        
        <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 활용 팁</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>여러 글을 미리 작성하여 예약 발행하면 시간을 효율적으로 관리할 수 있습니다.</li>
            <li>특정 시간대에 발행하면 조회수가 높아질 수 있습니다.</li>
            <li>예약된 글은 "스케줄 관리" 탭에서 수정하거나 취소할 수 있습니다.</li>
          </ul>
        </div>
      </div>
    `,
    dashboard: `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">🏠 메인 대시보드 사용법</h3>
        <p style="margin-bottom: 1.5rem;">메인 대시보드는 블로그 자동화 현황을 한눈에 확인할 수 있는 대시보드입니다.</p>
        
        <h4 style="color: var(--primary); margin: 1.5rem 0 1rem 0;">📊 주요 기능</h4>
        <ol style="padding-left: 1.5rem; margin-bottom: 1.5rem;">
          <li style="margin-bottom: 1rem;">
            <strong>🕐 현재 시간 표시</strong><br>
            <span style="color: var(--text-muted);">실시간으로 현재 시간과 날짜를 표시합니다. 블로그 발행 시간을 확인할 때 유용합니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>📅 블로그 일정 달력</strong><br>
            <span style="color: var(--text-muted);">예약 발행된 블로그 글의 일정을 달력으로 확인할 수 있습니다. 언제 어떤 글이 발행되는지 한눈에 볼 수 있습니다.</span>
          </li>
        </ol>
        
        <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 활용 방법</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>앱을 실행하면 자동으로 메인 대시보드가 표시됩니다.</li>
            <li>달력에서 예약된 발행 일정을 확인할 수 있습니다.</li>
            <li>현재 시간을 확인하여 발행 시간을 계획할 수 있습니다.</li>
          </ul>
        </div>
        
        <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: #10B981; margin-bottom: 0.5rem;">📝 팁</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>달력에서 날짜를 클릭하면 해당 날짜의 예약 발행 목록을 볼 수 있습니다.</li>
            <li>시간은 실시간으로 업데이트되므로 정확한 발행 시간을 확인할 수 있습니다.</li>
          </ul>
        </div>
      </div>
    `,
    'smart-auto': `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">🚀 스마트 자동 발행 탭 사용법</h3>
        <p style="margin-bottom: 1.5rem;">스마트 자동 발행 탭은 AI를 활용하여 블로그 글을 자동으로 생성하고 발행하는 핵심 기능입니다.</p>
        
        <h4 style="color: var(--primary); margin: 1.5rem 0 1rem 0;">📝 주요 기능</h4>
        <ol style="padding-left: 1.5rem; margin-bottom: 1.5rem;">
          <li style="margin-bottom: 1rem;">
            <strong>🔐 네이버 계정 정보</strong><br>
            <span style="color: var(--text-muted);">네이버 아이디와 비밀번호를 입력하세요. "기억하기"를 체크하면 다음에 자동으로 입력됩니다. <strong style="color: var(--primary);">체크박스를 체크하고 입력하면 앱을 껐다 켜도 저장됩니다!</strong></span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>📝 콘텐츠 입력</strong><br>
            <span style="color: var(--text-muted);">두 가지 방법으로 콘텐츠를 입력할 수 있습니다:</span>
            <ul style="padding-left: 1.5rem; margin-top: 0.5rem; color: var(--text-muted);">
              <li><strong>URL 입력:</strong> 네이버 블로그 URL을 입력하면 해당 글을 참고하여 새 글을 생성합니다.</li>
              <li><strong>키워드 입력:</strong> 제목과 키워드를 입력하면 해당 주제로 글을 생성합니다.</li>
            </ul>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>🤖 AI 모델 선택</strong><br>
            <span style="color: var(--text-muted);">Gemini(정책/계정 설정에 따라 무료 티어 또는 과금), OpenAI(유료), Claude(유료) 중에서 선택할 수 있습니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>🎨 이미지 소스 선택</strong><br>
            <span style="color: var(--text-muted);">DALL-E 3(유료) 또는 Pexels(일반적으로 무료)를 선택할 수 있습니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>📤 발행 모드 선택</strong><br>
            <span style="color: var(--text-muted);">즉시발행, 임시저장, 예약발행 중 선택할 수 있습니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>⚡ 풀오토 발행 / 🔧 반자동 발행</strong><br>
            <span style="color: var(--text-muted);">풀오토는 자동으로 모든 작업을 수행하고, 반자동은 생성된 글을 확인한 후 발행합니다.</span>
          </li>
        </ol>
        
        <div style="background: rgba(212, 175, 55, 0.1); border: 2px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #D4AF37; margin-bottom: 0.5rem;">💾 네이버 계정 저장 기능</h4>
          <p style="margin: 0;"><strong>중요:</strong> "기억하기" 체크박스를 체크하고 네이버 아이디와 비밀번호를 입력하면, 앱을 껐다 켜도 자동으로 입력됩니다. 체크박스를 해제하면 저장되지 않습니다.</p>
        </div>
        
        <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #10B981; margin-bottom: 0.5rem;">✅ 생성된 글 목록</h4>
          <p style="margin: 0;">생성된 글은 자동으로 "생성된 글 목록"에 저장됩니다. 나중에 다시 불러와서 수정하거나 재발행할 수 있습니다.</p>
        </div>
        
        <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 활용 팁</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>처음 사용자는 반자동 발행을 추천합니다. 생성된 글을 확인하고 수정할 수 있어 안전합니다.</li>
            <li>여러 글을 연속으로 발행하려면 "연속 발행" 기능을 사용하세요.</li>
            <li>생성된 글은 "페러프레이징 모드"로 글의 퀄리티를 개선할 수 있습니다.</li>
          </ul>
        </div>
      </div>
    `,
    'image-tab': `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">🖼️ 이미지 관리 탭 사용법</h3>
        <p style="margin-bottom: 1.5rem;">이미지 관리 탭에서는 블로그 글에 삽입할 이미지를 생성하고 관리할 수 있습니다.</p>
        
        <h4 style="color: var(--primary); margin: 1.5rem 0 1rem 0;">📝 사용 방법 (단계별)</h4>
        <ol style="padding-left: 1.5rem; margin-bottom: 1.5rem;">
          <li style="margin-bottom: 1rem;">
            <strong>1단계: 제목 입력</strong><br>
            <span style="color: var(--text-muted);">"제목" 입력 필드에 블로그 글 제목을 입력하세요. 또는 "스마트 자동 발행" 탭에서 생성한 제목이 자동으로 입력됩니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>2단계: 이미지 소스 선택</strong><br>
            <span style="color: var(--text-muted);">DALL-E 3(유료) 또는 Pexels(일반적으로 무료) 중에서 선택하세요. Pexels는 보통 무료로 사용 가능하여 추천합니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>3단계: 소제목 분석</strong><br>
            <span style="color: var(--text-muted);">"소제목 분석하기" 버튼을 클릭하면 제목을 기반으로 소제목들이 자동으로 분석되고, 각 소제목에 대한 영어 프롬프트가 생성됩니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>4단계: 이미지 생성</strong><br>
            <span style="color: var(--text-muted);">"이미지 생성 시작" 버튼을 클릭하면 각 소제목에 맞는 이미지가 자동으로 생성됩니다. 진행 상황이 표시됩니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>5단계: 이미지 확인 및 수정</strong><br>
            <span style="color: var(--text-muted);">생성된 이미지를 확인하세요. 마음에 들지 않으면 각 이미지의 "재생성" 버튼을 클릭하여 다시 생성할 수 있습니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>6단계: 이미지 선택 및 적용</strong><br>
            <span style="color: var(--text-muted);">이미지 위에 마우스를 올리면 "사용하기" 버튼이 나타납니다. 클릭하면 해당 소제목에 이미지가 적용됩니다.</span>
          </li>
        </ol>
        
        <div style="background: rgba(139, 92, 246, 0.1); border: 2px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #8b5cf6; margin-bottom: 0.5rem;">🔄 이미지 재생성 기능</h4>
          <p style="margin: 0;">생성된 이미지가 마음에 들지 않으면 "재생성" 버튼을 클릭하면 다른 이미지가 생성됩니다. 여러 번 시도할 수 있습니다!</p>
        </div>
        
        <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #10B981; margin-bottom: 0.5rem;">🖼️ 이미지 재사용 기능</h4>
          <p style="margin: 0;">"생성된 글 목록"에서 "🖼️ 이미지 재사용" 버튼을 클릭하면 이전에 생성한 이미지를 다시 사용할 수 있습니다. 시간과 비용을 절약할 수 있습니다!</p>
        </div>
        
        <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 활용 팁</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>소제목 분석은 "스마트 자동 발행" 탭에서 생성한 제목을 자동으로 사용합니다.</li>
            <li>이미지는 각 소제목에 맞게 최적화된 영어 프롬프트로 생성됩니다.</li>
            <li>생성된 이미지는 자동으로 저장되므로 나중에 다시 사용할 수 있습니다.</li>
            <li>이미지 위에 마우스를 올리면 "크게보기" 버튼으로 전체 화면에서 확인할 수 있습니다.</li>
          </ul>
        </div>
      </div>
    `,
    'schedule-tab': `
      <div style="line-height: 1.8; color: var(--text-strong);">
        <h3 style="color: var(--primary); margin-bottom: 1rem; font-size: 1.3rem;">📅 스케줄 관리 탭 사용법</h3>
        <p style="margin-bottom: 1.5rem;">스케줄 관리 탭에서는 예약 발행된 블로그 글들을 확인하고 관리할 수 있습니다.</p>
        
        <h4 style="color: var(--primary); margin: 1.5rem 0 1rem 0;">📊 주요 기능</h4>
        <ol style="padding-left: 1.5rem; margin-bottom: 1.5rem;">
          <li style="margin-bottom: 1rem;">
            <strong>📈 스케줄 통계</strong><br>
            <span style="color: var(--text-muted);">예약된 글, 완료된 글, 실패한 글의 개수를 한눈에 확인할 수 있습니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>📋 예약 발행 목록</strong><br>
            <span style="color: var(--text-muted);">예약 발행된 모든 글의 목록을 확인할 수 있습니다. 각 글의 제목, 예약 시간, 상태 등을 볼 수 있습니다.</span>
          </li>
          <li style="margin-bottom: 1rem;">
            <strong>🔄 새로고침</strong><br>
            <span style="color: var(--text-muted);">"새로고침" 버튼을 클릭하면 최신 예약 발행 목록을 불러옵니다.</span>
          </li>
        </ol>
        
        <div style="background: rgba(212, 175, 55, 0.1); border: 2px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #D4AF37; margin-bottom: 0.5rem;">⏰ 예약 발행 상태</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li><strong>예약됨:</strong> 아직 발행되지 않은 예약된 글입니다.</li>
            <li><strong>완료됨:</strong> 예약된 시간에 성공적으로 발행된 글입니다.</li>
            <li><strong>실패:</strong> 발행 중 오류가 발생한 글입니다.</li>
          </ul>
        </div>
        
        <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <h4 style="color: #10B981; margin-bottom: 0.5rem;">📝 예약 발행 설정 방법</h4>
          <p style="margin: 0;">"스마트 자동 발행" 탭에서 "발행 방식"을 "예약발행"으로 선택하고 날짜와 시간을 설정한 후 발행하면, 여기에서 확인할 수 있습니다.</p>
        </div>
        
        <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1rem;">
          <h4 style="color: var(--primary); margin-bottom: 0.5rem;">💡 활용 팁</h4>
          <ul style="padding-left: 1.5rem; margin: 0;">
            <li>예약 발행 목록을 정기적으로 확인하여 발행 상태를 모니터링하세요.</li>
            <li>실패한 글은 원인을 확인한 후 다시 발행할 수 있습니다.</li>
            <li>여러 글을 미리 작성하여 예약 발행하면 시간을 효율적으로 관리할 수 있습니다.</li>
          </ul>
        </div>
      </div>
    `
  };

  // 사용 가이드 버튼 클릭
  if (userGuideBtn) {
    userGuideBtn.addEventListener('click', () => {
      if (userGuideModal && guideContent) {
        // 첫 번째 탭(시작하기) 내용 표시
        guideContent.innerHTML = guideContents.start;
        userGuideModal.style.display = 'flex';
        userGuideModal.setAttribute('aria-hidden', 'false');
      }
    });
  }

  // 탭 전환
  guideTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');

      // 모든 탭 버튼 스타일 초기화
      guideTabBtns.forEach(b => {
        b.classList.remove('active');
        (b as HTMLElement).style.background = 'var(--bg-tertiary)';
        (b as HTMLElement).style.color = 'var(--text-strong)';
        (b as HTMLElement).style.borderColor = 'var(--border-light)';
      });

      // 선택된 탭 버튼 강조
      btn.classList.add('active');
      (btn as HTMLElement).style.background = 'var(--primary)';
      (btn as HTMLElement).style.color = 'white';
      (btn as HTMLElement).style.borderColor = 'var(--primary)';

      // 해당 탭 내용 표시
      if (tab && guideContent && guideContents[tab]) {
        guideContent.innerHTML = guideContents[tab];
      }
    });
  });

  // 모달 닫기
  closeUserGuideBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (userGuideModal) {
        userGuideModal.style.display = 'none';
        userGuideModal.setAttribute('aria-hidden', 'true');
      }
    });
  });

  // 모달 배경 클릭 시 닫기
  if (userGuideModal) {
    userGuideModal.addEventListener('click', (e) => {
      if (e.target === userGuideModal) {
        userGuideModal.style.display = 'none';
        userGuideModal.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // ✅ 분석 도구 버튼 클릭 - 분석 도구 탭으로 이동
  const analyticsBtn = document.getElementById('analytics-btn');
  if (analyticsBtn) {
    analyticsBtn.addEventListener('click', () => {
      // 분석 도구 탭 패널 표시
      const analyticsTab = document.getElementById('tab-analytics');
      const allTabs = document.querySelectorAll('.tab-panel');
      const allTabButtons = document.querySelectorAll('.tab-button');

      // 모든 탭 숨기기
      allTabs.forEach(tab => {
        tab.classList.remove('active');
        (tab as HTMLElement).style.display = 'none';
      });

      // 모든 탭 버튼 비활성화
      allTabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });

      // 분석 도구 탭 표시
      if (analyticsTab) {
        analyticsTab.classList.add('active');
        (analyticsTab as HTMLElement).style.display = 'block';
        analyticsTab.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      appendLog('📊 분석 도구 탭으로 이동했습니다.');
    });
  }

  // ✅ 사용법 버튼 클릭 - 사용법 탭으로 이동
  const tutorialsBtn = document.getElementById('tutorials-btn');
  if (tutorialsBtn) {
    tutorialsBtn.addEventListener('click', () => {
      // 사용법 탭 패널 표시
      const tutorialsTab = document.getElementById('tab-tutorials');
      const allTabs = document.querySelectorAll('.tab-panel');
      const allTabButtons = document.querySelectorAll('.tab-button');

      // 모든 탭 숨기기
      allTabs.forEach(tab => {
        tab.classList.remove('active');
        (tab as HTMLElement).style.display = 'none';
      });

      // 모든 탭 버튼 비활성화
      allTabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });

      // 사용법 탭 표시
      if (tutorialsTab) {
        tutorialsTab.classList.add('active');
        (tutorialsTab as HTMLElement).style.display = 'block';
        tutorialsTab.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      appendLog('📹 사용법 탭으로 이동했습니다.');
    });
  }
}
