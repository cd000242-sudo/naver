import { getVerifiedRealBlogCategoryId, getVerifiedRealBlogCategoryName, getVerifiedRealBlogCategoryValue } from '../utils/realBlogCategoryPolicy.js';

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
    // ✅ [2026-06-30 FIX] 에이전트 모드(agent-codex/agent-claude/agent-gemini)는 사용자가 명시 선택한
    //    0과금 엔진(본인 구독 CLI)이다. 드롭다운(#unified-generator)에 남은 stale API 값이
    //    이 선택을 덮어써 반자동에서 API로 과금되던 버그 차단 — 에이전트 라디오를 최우선.
    //    (풀오토는 드롭다운이 gemini라 우연히 동작했고, 반자동은 stale 값에 가로채였음.)
    const selectedTextModelRadio = document.querySelector(
      'input[name="primaryGeminiTextModel"]:checked',
    ) as HTMLInputElement | null;
    const selectedModelTop = selectedTextModelRadio?.value;
    const AGENT_PROVIDERS = new Set(['agent-codex', 'agent-claude', 'agent-gemini']);
    const modelToProvider: Record<string, string> = {
      'gemini-3.1-flash-lite': 'gemini',
      'gemini-3.5-flash': 'gemini',
      'perplexity-sonar': 'perplexity',
      'openai-gpt4o': 'openai',
      'openai-gpt4o-mini': 'openai',
      'openai-gpt41': 'openai',
      'openai-gpt4o-search': 'openai',
      'claude-haiku': 'claude',
      'claude-sonnet': 'claude',
      'claude-opus': 'claude',
      'agent-codex': 'agent-codex',
      'agent-claude': 'agent-claude',
      'agent-gemini': 'agent-gemini',
    };
    if (
      !selectedTextModelRadio?.disabled
      && selectedModelTop
      && AGENT_PROVIDERS.has(selectedModelTop)
    ) {
      if (this.unifiedGenerator) this.unifiedGenerator.value = selectedModelTop;
      return selectedModelTop;
    }

    // ✅ [2026-02-22 FIX] unified-generator hidden input 우선,
    // 동기화 누락 시 primaryGeminiTextModel 라디오 버튼에서 직접 파생
    const rawHiddenValue = this.unifiedGenerator?.value;
    const selectedProvider = !selectedTextModelRadio?.disabled && selectedModelTop
      ? modelToProvider[selectedModelTop]
      : undefined;
    const hiddenValue = (rawHiddenValue === 'agent-claude' || rawHiddenValue === 'agent-gemini')
      ? selectedProvider && selectedProvider !== rawHiddenValue
        ? selectedProvider
        : 'gemini'
      : rawHiddenValue;
    if (this.unifiedGenerator && hiddenValue && hiddenValue !== rawHiddenValue) {
      this.unifiedGenerator.value = hiddenValue;
    }
    /*
     * [2026-09-02 실측 3회] 낡은 hidden 값이 라디오를 이겨 매번 생성이 터졌다.
     *
     *   [ContentGenerator] ❌ TEXT_MODEL_PROVIDER_MISMATCH:
     *       expected=claude, selected=openai-gpt41, actual=openai
     *
     * 라디오는 GPT(openai-gpt41)를 가리키는데 #unified-generator 에 남은 'claude' 가
     * 아래 return 으로 먼저 나갔다. 그 값이 provider 가 되고, main 은 모델을
     * primaryGeminiTextModel(=openai-gpt41)에서 읽으므로 벤더가 어긋나 던진다.
     * 자동 폴백 금지라 가드는 정직하게 멈춘다 — 가드는 제 일을 했고 값이 틀렸다.
     *
     * 매번 자료 수집을 끝낸 뒤에 터져서, 크롤링 3만 자를 통째로 버렸다.
     *
     * 바로 위 주석(29~32행)이 에이전트 모드에서 같은 stale 문제를 이미 고쳐 뒀다.
     * API 엔진 쪽만 안 고쳤을 뿐이다 — 한 곳만 고치고 나머지를 남긴 그 유형이다.
     *
     * 모델 라디오가 SSOT 다. 그 값이 실제로 호출할 모델을 정하므로 provider 도
     * 거기서 나와야 한다. 어긋나면 라디오를 따르고 hidden 을 맞춰 스스로 낫게 한다.
     */
    if (selectedProvider && hiddenValue && hiddenValue !== selectedProvider) {
      if (this.unifiedGenerator) this.unifiedGenerator.value = selectedProvider;
      return selectedProvider;
    }

    if (hiddenValue && hiddenValue !== 'gemini') {
      return hiddenValue; // 명시적으로 설정된 값 (perplexity, openai, claude 등)
    }

    // ✅ 방어 코드: hidden input이 'gemini' 또는 빈 값이면 라디오 버튼 직접 확인
    const selectedModel = selectedTextModelRadio?.value;
    const derivedProvider = selectedTextModelRadio?.disabled
      ? undefined
      : selectedModel
        ? modelToProvider[selectedModel]
        : undefined;
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
    // [2026-11-03] One base: localStorage `globalImageSource` (the image tab and the full-auto image window write it);
    // `fullAutoImageSource` is only the legacy fallback. The drop-down and the legacy buttons merely DISPLAY it —
    // reading here never rewrites storage, so a stale screen value can no longer overwrite a fresh choice.
    // 'local-folder' (내 폴더) therefore survives even though the drop-down only mirrors it for display.
    const ALIAS_MAP: Record<string, string> = {
      'dall-e-3': 'openai-image',
      local: 'saved',
      // [2026-10-10] 나노바나나 프로·2.5는 화면에서 내려감 — 옛 저장값은 나노바나나2로
      'nano-banana-pro': 'nano-banana-2',
      'nano-banana': 'nano-banana-2',
    };
    // ✅ [v2.11.7] 'dropshot' 추가 — 리더스 나노바나나 무제한
    const VALID_AI_SOURCES = ['nano-banana', 'nano-banana-2', 'nano-banana-pro', 'openai-image', 'imagefx', 'flow', 'dropshot', 'genspark', 'collect-photos', 'pollinations', 'local-folder', 'saved'];

    const normalizeSource = (raw: string | null): string | null => {
      if (!raw || raw === 'undefined' || raw === 'null') return null;
      return ALIAS_MAP[raw] || raw;
    };

    // 'saved' (이미지 보관함) is a one-run choice that is never stored, so a selected legacy button for it still wins.
    for (const selector of ['.image-source-btn.selected', '.unified-img-source-btn.selected', '.full-auto-img-source-btn.selected']) {
      if (normalizeSource(document.querySelector(selector)?.getAttribute('data-source') || null) === 'saved') return 'saved';
    }

    // 1순위: globalImageSource, 2순위: fullAutoImageSource (옛 호환 키)
    for (const key of ['globalImageSource', 'fullAutoImageSource']) {
      const raw = localStorage.getItem(key);
      const stored = normalizeSource(raw);
      if (stored && VALID_AI_SOURCES.includes(stored) && stored !== 'saved') {
        return stored;
      }
      // Only literal "null"/"undefined" strings are junk; other unknown values are kept for the retired-engine gate.
      if (raw === 'null' || raw === 'undefined') {
        console.warn(`[UnifiedDOMCache] ⚠️ ${key} 오염 값 제거: "${raw}"`);
        localStorage.removeItem(key);
      }
    }

    // 3순위(저장값이 아직 없는 첫 실행): 화면에 보이는 값 — 읽기만 하고 저장하지 않는다.
    for (const selector of [
      '.image-source-btn.selected',
      '.unified-img-source-btn.selected',
      '.full-auto-img-source-btn.selected',
    ]) {
      const selectedButton = document.querySelector(selector);
      const buttonSource = normalizeSource(selectedButton?.getAttribute('data-source') || null);
      if (buttonSource && VALID_AI_SOURCES.includes(buttonSource)) return buttonSource;
    }
    const primaryImageSourceSelect = document.getElementById('image-source-select') as HTMLSelectElement | null;
    const primarySelectSource = normalizeSource(primaryImageSourceSelect?.value || null);
    if (primarySelectSource && VALID_AI_SOURCES.includes(primarySelectSource)) return primarySelectSource;

    const domImageSourceSelect =
      (document.getElementById('unified-image-source') as HTMLSelectElement | null) ||
      this.unifiedImageSource;
    const domSelectSource = normalizeSource(domImageSourceSelect?.value || null);
    if (domSelectSource && VALID_AI_SOURCES.includes(domSelectSource)) return domSelectSource;

    return 'openai-image'; // [2026-10-10] 값이 비었을 때 기본 = 덕트테이프
  },

  getRealCategory(): string | undefined {
    const select = document.getElementById('real-blog-category-select') as HTMLSelectElement | null;
    return getVerifiedRealBlogCategoryValue(select);
  },

  getRealCategoryId(): string | undefined {
    return getVerifiedRealBlogCategoryId(document.getElementById('real-blog-category-select') as HTMLSelectElement | null);
  },

  getRealCategoryName(): string | undefined {
    const select = document.getElementById('real-blog-category-select') as HTMLSelectElement | null;
    return getVerifiedRealBlogCategoryName(select);
  }
};

export { UnifiedDOMCache };
