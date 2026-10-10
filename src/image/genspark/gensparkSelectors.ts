// src/image/genspark/gensparkSelectors.ts
// [2026-10-10] 젠스파크(genspark.ai) 화면 상수와 화면 읽기 함수. 2026-10-10 실제 화면(CDP) 실측값.
//   아래 readGenspark* / locateGenspark* 함수는 page.evaluate 로 직렬화되므로 자기완결이어야 한다(바깥 식별자 참조 금지).
//   크기(getBoundingClientRect)는 locateGensparkPoint 에서만 쓰고, 읽기 함수는 글자·클래스·속성만 본다(happy-dom 시험).

export const GENSPARK_IMAGE_URL = 'https://www.genspark.ai/ai_image';
export const GENSPARK_ORIGIN = 'https://www.genspark.ai';
export const GENSPARK_JOB_PATH = '/agents';
export const GENSPARK_JOB_QUERY_KEY = 'id';
export const GENSPARK_IMAGE_PATH_MARKER = '/api/files/s/';

export const GENSPARK_SELECTORS = Object.freeze({
  composer: 'textarea.search-input',
  sendButton: '[aria-label="메시지 전송"]',
  sendButtonFallbacks: Object.freeze(['[aria-label="Send"]', '[aria-label="Send message"]']),
  modelButton: '.model-select-bar .model-selector .model-button',
  modelSelected: '.model-select-bar .model-selector .model-selected',
  settingsButton: '.model-button.aspect-ratio-selector',
  menuRoot: '.v-binder-follower-content',
  modelItem: '.model-container',
  sizeOption: '.size-option',
});

export const GENSPARK_PHRASES = Object.freeze({
  sendLabels: Object.freeze(['메시지 전송', 'Send', 'Send message']),
  noCreditCost: 'No credit cost',
  needsInputImage: '이 모델은 입력 이미지가 필요합니다',
  newBadge: 'New',
  countHeading: '생성 횟수',
  ratioHeading: '종횡비',
  autoRatio: '자동 크기',
  loginSignals: Object.freeze(['로그인', 'Sign in', 'Log in']),
  challengeSignals: Object.freeze(['사람인지 확인', 'Verify you are human', 'Just a moment', 'captcha', '보안 확인']),
  rateLimitSignals: Object.freeze(['너무 많은 요청', 'Too many requests', 'rate limit', '요청 한도']),
  failureSignals: Object.freeze(['생성에 실패', 'Generation failed', 'Something went wrong', '오류가 발생']),
});

/** 종횡비 메뉴 글자(실측). 우리는 이 중 하나를 고른다. */
export const GENSPARK_RATIO_LABELS: readonly string[] = Object.freeze([
  '자동 크기', '21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '5:4', '4:5',
]);

/** 작업 주소(/agents?id=<작업ID>)에서 작업 ID 를 꺼낸다. 아니면 null. */
export function gensparkExtractJobId(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url, GENSPARK_ORIGIN);
    if (parsed.pathname.replace(/\/+$/, '') !== GENSPARK_JOB_PATH) return null;
    const id = parsed.searchParams.get(GENSPARK_JOB_QUERY_KEY);
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export function gensparkBuildJobUrl(jobId: string): string {
  return `${GENSPARK_ORIGIN}${GENSPARK_JOB_PATH}?${GENSPARK_JOB_QUERY_KEY}=${encodeURIComponent(jobId)}`;
}

/** 결과 이미지 주소인가(/api/files/s/<id>). */
export function gensparkIsResultImageUrl(url: unknown): boolean {
  return typeof url === 'string' && url.includes(GENSPARK_IMAGE_PATH_MARKER);
}

export interface GensparkMenuModelItem {
  label: string;
  creditFree: boolean;
  needsInput: boolean;
  isNew: boolean;
}
export interface GensparkSettingOption { label: string; selected: boolean }
export interface GensparkSettingsMenu { ratios: GensparkSettingOption[]; counts: GensparkSettingOption[] }
export interface GensparkComposerState { found: boolean; value: string }
export interface GensparkPageSignals {
  url: string;
  hasComposer: boolean;
  loginRequired: boolean;
  challenge: boolean;
  rateLimited: boolean;
  failed: boolean;
}
export interface GensparkPointRequest { selector: string; label?: string; scope?: string }

/** 열린 모델 메뉴의 항목들. 첫 줄이 'New' 면 둘째 줄이 이름이다. 메뉴가 닫혀 있으면 빈 배열. */
export function readGensparkModelMenu(): GensparkMenuModelItem[] {
  const out: GensparkMenuModelItem[] = [];
  const roots = Array.from(document.querySelectorAll('.v-binder-follower-content'));
  for (const root of roots) {
    for (const item of Array.from(root.querySelectorAll('.model-container'))) {
      const lines: string[] = [];
      const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (t) lines.push(t);
      }
      if (lines.length === 0) continue;
      const isNew = lines[0] === 'New';
      const label = isNew ? lines[1] || '' : lines[0];
      if (!label) continue;
      const all = lines.join('\n');
      out.push({
        label,
        creditFree: all.includes('No credit cost'),
        needsInput: all.includes('이 모델은 입력 이미지가 필요합니다'),
        isNew,
      });
    }
  }
  return out;
}

/** 지금 선택된 모델의 글자. 없으면 null. */
export function readGensparkSelectedModel(): string | null {
  const el = document.querySelector('.model-select-bar .model-selector .model-selected');
  const text = el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  return text || null;
}

/** 열린 설정 메뉴의 종횡비 항목과 생성 횟수(.size-option). selected 는 해당 요소 또는 바로 위 부모의 class. */
export function readGensparkSettingsMenu(): GensparkSettingsMenu {
  const ratios: GensparkSettingOption[] = [];
  const counts: GensparkSettingOption[] = [];
  const hasSelected = (el: Element): boolean =>
    el.classList.contains('selected') || (!!el.parentElement && el.parentElement.classList.contains('selected'));
  const ratioPattern = /^(자동 크기|\d{1,2}:\d{1,2})$/;
  for (const root of Array.from(document.querySelectorAll('.v-binder-follower-content'))) {
    for (const el of Array.from(root.querySelectorAll('.size-option'))) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^\d+$/.test(text)) counts.push({ label: text, selected: el.classList.contains('selected') });
    }
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (el.children.length > 0 && !el.classList.contains('size-option')) continue;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (ratioPattern.test(text)) ratios.push({ label: text, selected: hasSelected(el) });
    }
  }
  return { ratios, counts };
}

/** 작업 화면의 결과 이미지 주소('/api/files/s/' 만). 중복 제거·화면 순서. 사이드바·내비게이션 안의 이미지는 제외. */
export function readGensparkJobImages(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const img of Array.from(document.querySelectorAll('img'))) {
    let src = img.getAttribute('src') || '';
    if (!src.includes('/api/files/s/')) continue;
    if (img.closest('nav, aside, [class*="sidebar"], [class*="Sidebar"]')) continue;
    if (src.startsWith('/')) src = 'https://www.genspark.ai' + src;
    if (seen.has(src)) continue;
    seen.add(src);
    out.push(src);
  }
  return out;
}

/** 입력창 존재 여부와 현재 값. */
export function readGensparkComposer(): GensparkComposerState {
  const el = document.querySelector('textarea.search-input') as HTMLTextAreaElement | null;
  return { found: !!el, value: el ? String(el.value || '') : '' };
}

/**
 * 로그인 필요 / 보안 확인 / 제한 / 실패 신호. 입력창이 없고 로그인 버튼·주소가 보일 때만 로그인 필요로 본다.
 * 제한·실패 문구는 짧은 글자 조각(120자 이하)만 보고, 입력창·편집 영역 안 글자는 제외한다(프롬프트 에코 오탐 방지).
 */
export function readGensparkPageSignals(): GensparkPageSignals {
  const url = String(location.href || '');
  const hasComposer = !!document.querySelector('textarea.search-input');
  const challengeWords = ['사람인지 확인', 'Verify you are human', 'Just a moment', 'captcha', '보안 확인'];
  const rateWords = ['너무 많은 요청', 'Too many requests', 'rate limit', '요청 한도'];
  const failWords = ['생성에 실패', 'Generation failed', 'Something went wrong', '오류가 발생'];
  const loginWords = ['로그인', 'Sign in', 'Log in'];

  const lower = (s: string): string => s.toLowerCase();
  const hit = (text: string, words: string[]): boolean => words.some((w) => lower(text).includes(lower(w)));

  let challenge = hit(document.title || '', challengeWords);
  if (document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]')) {
    challenge = true;
  }
  let rateLimited = false;
  let failed = false;
  let loginButton = false;
  const walker = document.createTreeWalker(document.body || document, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 120) continue;
    const parent = n.parentElement;
    if (!parent || parent.closest('textarea, [contenteditable="true"], script, style')) continue;
    if (hit(text, challengeWords)) challenge = true;
    if (hit(text, rateWords)) rateLimited = true;
    if (hit(text, failWords)) failed = true;
    if (loginWords.some((w) => lower(text) === lower(w)) && parent.closest('a, button, [role="button"]')) loginButton = true;
  }
  const urlLogin = /\/(login|signin|sign-in|auth)(\/|\?|$)/i.test(url);
  return { url, hasComposer, loginRequired: !hasComposer && (loginButton || urlLogin), challenge, rateLimited, failed };
}

/**
 * 마우스 클릭용 중심 좌표. 젠스파크 모델·설정 버튼은 DOM click() 이 무반응이라 CDP 마우스로 눌러야 한다.
 * label 이 있으면 그 요소의 첫 줄('New' 줄 제외)이 정확히 일치하는 것만, scope 가 있으면 그 안에서만 찾는다.
 * 보이지 않거나 크기 0 이면 null.
 */
export function locateGensparkPoint(req: GensparkPointRequest): { x: number; y: number } | null {
  const scope = req.scope ? document.querySelector(req.scope) : document;
  if (!scope) return null;
  for (const el of Array.from(scope.querySelectorAll(req.selector))) {
    if (req.label !== undefined) {
      const lines: string[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (t) lines.push(t);
      }
      const first = lines[0] === 'New' ? lines[1] : lines[0];
      if (first !== req.label) continue;
    }
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }
  return null;
}
