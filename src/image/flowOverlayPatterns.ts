/**
 * Flow/ImageFX overlay 차단용 패턴 — 단위 테스트 가능하게 별도 export.
 *
 * flowGenerator.ts와 imageFxGenerator.ts 두 곳에서 동일 패턴을 *인라인으로 사용*하지만
 * 본 파일은 *동일 정규식의 단일 출처* 역할로 회귀 검증을 가능하게 한다.
 *
 * 변경 시: flowGenerator.ts의 `injectAntiModalObserver`,
 *         imageFxGenerator.ts의 `injectImageFxAntiModalObserver` 인라인 정규식도 같이 갱신.
 */

/** iframe.src/srcdoc URL이 overlay 광고/changelog인지 판단 */
export const OVERLAY_URL_RE = /changelogs?|whats[_-]?new|banner|survey|consent|onboarding|promo/i;

/** dialog/popover의 텍스트 콘텐츠가 overlay 안내 문구인지 */
export const OVERLAY_TEXT_RE = /What['']?s\s*new|새로운\s*기능|변경\s*사항|tour|guide\s*me|onboarding|시작하기|소개/i;

/** 화이트리스트 — 정상 dialog (로그인/입력)는 hide X */
export const SAFE_TEXT_RE = /sign\s*in|로그인|email|password|비밀번호|prompt|프롬프트/i;

/** Flow 이미지 응답 CDN URL 패턴 (Network 리스너에서 사용) */
export const FLOW_CDN_RE = /flowMedia|flow-media|media\.getMediaUrlRedirect|googleusercontent|aitestkitchen|labs\.google|gstatic\.com\/aitestkitchen/i;

/** DOM <img> alt/aria-label에서 "생성된 이미지" 다국어 매칭 */
export const GENERATED_IMAGE_ALT_RE =
  /생성된 이미지|이미지 결과|Generated image|Generated|생성|已生成|生成された|生成图像|Image générée|Imagen generada|Generiertes Bild|Immagine generata|Сгенерированное|Gerada|รูปภาพที่สร้าง/i;

/**
 * page.reload() 최후 보루를 트리거할 에러 패턴.
 * - click 차단(iframe overlay) · 입력창 못 찾음 · submit 버튼 못 찾음 · 이미지 timeout
 *   같은 *DOM 회복 가능 에러*만 매칭.
 * - FLOW_BROWSER_LAUNCH_FAILED · FLOW_LOGIN_TIMEOUT 같은 *구조적 에러*는 reload로 해결 X.
 */
export const RELOAD_RECOVERABLE_RE =
  /Timeout.*exceeded|FLOW_PROMPT_INPUT|FLOW_SUBMIT_BUTTON|FLOW_IMAGE_TIMEOUT|intercepts pointer/i;

/** 분류 헬퍼 — flowGenerator의 인라인 분기와 동일 동작 */
export function isReloadRecoverable(errorMessage: string): boolean {
  if (!errorMessage) return false;
  return RELOAD_RECOVERABLE_RE.test(errorMessage);
}

export function isOverlayUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return OVERLAY_URL_RE.test(url);
}

export function isFlowCdnUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  // overlay URL이면 CDN처럼 보여도 false (changelog iframe이 이미지 응답 가짜로 흘리는 케이스)
  if (OVERLAY_URL_RE.test(url)) return false;
  return FLOW_CDN_RE.test(url);
}

export function isGeneratedImageAlt(altText: string | null | undefined): boolean {
  if (!altText) return false;
  return GENERATED_IMAGE_ALT_RE.test(altText);
}
