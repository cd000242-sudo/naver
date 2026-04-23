// ============================================
// unifiedDOMCache.ts — renderer.ts에서 추출한 DOM 캐시 시스템
// Phase 5B-2: UnifiedDOMCache 객체
// ============================================

const UnifiedDOMCache = {
  // 통합 탭 요소들
  unifiedGenerator: null as HTMLSelectElement | null,
  unifiedToneStyle: null as HTMLSelectElement | null,
  unifiedImageSource: null as HTMLSelectElement | null,
  unifiedUrlInputs: null as NodeListOf<HTMLInputElement> | null,

  // 캐시 초기화
  init() {
    this.unifiedGenerator = document.getElementById('unified-generator') as HTMLSelectElement;
    this.unifiedToneStyle = document.getElementById('unified-tone-style') as HTMLSelectElement; // ✅ 드롭다운에서 글톤 값 읽기 복원
    this.unifiedImageSource = document.getElementById('unified-image-source') as HTMLSelectElement;
  },

  // 캐시 갱신
  refresh() {
    this.unifiedUrlInputs = document.querySelectorAll('.unified-url-input') as NodeListOf<HTMLInputElement>;
  },

  // 안전한 getter
  getGenerator(): string {
    // ✅ [2026-02-22 FIX] unified-generator hidden input 우선,
    // 동기화 누락 시 primaryGeminiTextModel 라디오 버튼에서 직접 파생
    const hiddenValue = this.unifiedGenerator?.value;
    if (hiddenValue && hiddenValue !== 'gemini') {
      return hiddenValue; // 명시적으로 설정된 값 (perplexity, openai, claude 등)
    }

    // ✅ 방어 코드: hidden input이 'gemini' 또는 빈 값이면 라디오 버튼 직접 확인
    const selectedModel = (document.querySelector('input[name="primaryGeminiTextModel"]:checked') as HTMLInputElement)?.value;
    const modelToProvider: Record<string, string> = {
      'perplexity-sonar': 'perplexity',
      'openai-gpt4o': 'openai',
      'openai-gpt4o-mini': 'openai',
      'openai-gpt41': 'openai',
      'claude-haiku': 'claude',
      'claude-sonnet': 'claude',
      'claude-opus': 'claude',
    };
    const derivedProvider = modelToProvider[selectedModel];
    if (derivedProvider) {
      // hidden input도 동기화
      if (this.unifiedGenerator) {
        this.unifiedGenerator.value = derivedProvider;
      }
      return derivedProvider;
    }

    return hiddenValue || 'gemini';
  },

  getToneStyle(context?: 'ma' | 'continuous' | 'normal'): string {
    // 1. 컨텍스트별 전용 셀렉트 확인
    if (context === 'ma') {
      const maSel = document.getElementById('ma-tone-style-select') as HTMLSelectElement;
      if (maSel) return maSel.value;
    } else if (context === 'continuous') {
      const contSel = document.getElementById('continuous-tone-style-select') as HTMLSelectElement;
      if (contSel) return contSel.value;
    }

    // 2. 기본 드롭다운 확인
    if (this.unifiedToneStyle) return this.unifiedToneStyle.value;

    // 3. 최후의 수단 (DOM 직접 확인)
    const fallback = document.getElementById('unified-tone-style') as HTMLSelectElement;
    return fallback?.value || 'professional';
  },

  getImageSource(): string {
    // ✅ [2026-02-02] 풀오토/연속/다중계정 발행 전용 이미지 소스
    // 이미지 관리 탭의 globalImageSource와 완전히 분리됨
    // ✅ [v1.4.80] 'flow' 추가 — Google Labs Flow 엔진이 풀오토/연속발행에서 nano-banana-pro로 폴백되던 버그 수정
    const VALID_AI_SOURCES = ['nano-banana-pro', 'deepinfra', 'openai-image', 'leonardoai', 'imagefx', 'flow', 'local-folder'];

    // ✅ [v1.4.90 FIX] 레거시 저장값 자동 마이그레이션
    //   증상: 사용자가 UI에서 'flow' 선택했지만 fullAutoImageSource에는 예전 'nano-banana-pro'가 남아있어 무시됨
    //   원인: v1.4.85 이전 빌드에서 setGlobalImageSource가 두 키를 동기화하지 않았던 잔재
    //   해결: globalImageSource가 유효한 AI 엔진이고 fullAutoImageSource와 다르면, UI 선택이 최신이므로 덮어쓰기
    const rawGlobal = localStorage.getItem('globalImageSource');
    const rawFullAuto = localStorage.getItem('fullAutoImageSource');
    if (rawGlobal && VALID_AI_SOURCES.includes(rawGlobal) && rawFullAuto !== rawGlobal) {
      console.log(`[UnifiedDOMCache] 🔄 UI 선택 우선 동기화: globalImageSource="${rawGlobal}" → fullAutoImageSource 덮어쓰기 (이전: "${rawFullAuto || '없음'}")`);
      localStorage.setItem('fullAutoImageSource', rawGlobal);
    }

    // 1순위: fullAutoImageSource (풀오토 전용, 위에서 동기화된 최신값)
    const fullAutoSource = localStorage.getItem('fullAutoImageSource');
    if (fullAutoSource && fullAutoSource !== 'undefined' && fullAutoSource !== 'null' && VALID_AI_SOURCES.includes(fullAutoSource)) {
      console.log(`[UnifiedDOMCache] 🎨 fullAutoImageSource 사용 (풀오토 전용): ${fullAutoSource}`);
      return fullAutoSource;
    }
    // ✅ [2026-02-18 FIX] 오염된 값("null", "undefined" 등)이 있으면 정리
    if (fullAutoSource && (fullAutoSource === 'null' || fullAutoSource === 'undefined' || !VALID_AI_SOURCES.includes(fullAutoSource))) {
      console.warn(`[UnifiedDOMCache] ⚠️ fullAutoImageSource 오염 값 제거: "${fullAutoSource}"`);
      localStorage.removeItem('fullAutoImageSource');
    }

    // ✅ [v1.4.80 FIX] globalImageSource 읽기만, 쓰기 제거
    //   이전: globalImageSource 값을 읽고 fullAutoImageSource에 자동 복제
    //         → 이미지 관리 탭에서 다른 엔진 선택 시 풀오토 설정이 silently 오염됨
    //   수정: 읽어서 사용만 하고 localStorage 쓰기 제거
    const globalSource = localStorage.getItem('globalImageSource');
    if (globalSource && globalSource !== 'undefined' && globalSource !== 'null' && VALID_AI_SOURCES.includes(globalSource)) {
      console.log(`[UnifiedDOMCache] 🎨 globalImageSource 폴백 사용 (읽기만): ${globalSource}`);
      return globalSource;
    }

    // 3순위: 선택된 버튼 확인
    const selectedBtn = document.querySelector('.unified-img-source-btn.selected');
    if (selectedBtn) {
      const btnSource = selectedBtn.getAttribute('data-source') || 'nano-banana-pro';
      console.log(`[UnifiedDOMCache] 🎨 DOM 버튼 선택됨, data-source = "${btnSource}"`);
      return btnSource;
    }

    // 4순위: 드롭다운(select) 확인
    if (this.unifiedImageSource) {
      const selectVal = this.unifiedImageSource.value || 'nano-banana-pro';
      console.log(`[UnifiedDOMCache] 🎨 드롭다운 값 = "${selectVal}"`);
      return selectVal;
    }

    // 5순위: 최후의 보루 (DOM 직접 확인)
    const fallbackSelect = document.getElementById('unified-image-source') as HTMLSelectElement;
    const finalVal = fallbackSelect?.value || 'nano-banana-pro';
    console.log(`[UnifiedDOMCache] ⚠️ 최후의 보루: fallback = "${finalVal}"`);
    return finalVal;
  },

  getRealCategory(): string | undefined {
    return (document.getElementById('real-blog-category-select') as HTMLSelectElement)?.value || undefined;
  },

  getRealCategoryName(): string | undefined {
    const select = document.getElementById('real-blog-category-select') as HTMLSelectElement;
    if (select && select.selectedIndex >= 0) {
      const selectedOption = select.options[select.selectedIndex];
      if (!selectedOption?.value) {
        return undefined;
      }
      return selectedOption?.text?.trim() || undefined;
    }
    return undefined;
  }
};

export { UnifiedDOMCache };
