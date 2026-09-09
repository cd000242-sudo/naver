// src/content/secretTokenGuard.ts
// [2026-09-09] 자격증명처럼 보이는 문자열이 본문으로 새는 것을 막는다.
//
// 사고: 발행된 글 초반부에 40자짜리 난수 문자열이 그대로 실려 나갔다(사장님 실측).
// 형식이 네이버 클라우드 Secret Key 와 같았다. 공개 블로그라 그대로 노출이다.
//
// 어떻게 들어갔나: 사용자가 키를 입력칸이 아닌 다른 칸(사진 모드의 상황 메모 등)에
// 붙여넣으면 그 텍스트가 그대로 모델 재료가 되고, 모델이 본문에 옮겨 적는다.
// 사람의 실수를 막을 수는 없으니, 재료 단계에서 지우고 발행 직전에 한 번 더 막는다.
//
// 판정은 보수적으로 — 한국어 본문과 URL, 해시태그를 오탐하면 멀쩡한 글이 차단된다.

/** 자격증명으로 의심할 최소 길이. 이보다 짧으면 일반 단어일 수 있다. */
const MIN_TOKEN_LENGTH = 20;

/** 토큰 후보: 영문·숫자·-·_ 로만 이어진 덩어리. 한글이 섞이면 후보가 아니다. */
const TOKEN_CANDIDATE = /[A-Za-z0-9_-]{20,}/g;

/**
 * 자격증명처럼 보이는가.
 *
 * 대문자·소문자·숫자가 모두 섞여 있어야 한다. 사람이 쓰는 긴 영단어나
 * 소문자 슬러그(naver-blog-automation), 숫자 ID(224405387230)는 걸리지 않는다.
 */
export function looksLikeSecretToken(token: string): boolean {
  const value = String(token || '');
  if (value.length < MIN_TOKEN_LENGTH) return false;

  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  if (!hasUpper || !hasLower || !hasDigit) return false;

  // 구분자가 많으면 사람이 읽는 식별자(파일명·슬러그)일 가능성이 높다.
  const separators = (value.match(/[-_]/g) ?? []).length;
  if (separators >= 3) return false;

  return true;
}

/** 본문에서 자격증명처럼 보이는 토큰들을 찾는다(중복 제거, 등장 순서 유지). */
export function findSecretLikeTokens(text: string): string[] {
  const source = String(text || '');
  if (!source) return [];

  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of source.match(TOKEN_CANDIDATE) ?? []) {
    if (!looksLikeSecretToken(match)) continue;
    if (seen.has(match)) continue;
    seen.add(match);
    found.push(match);
  }
  return found;
}

/**
 * 로그에 남길 안전한 표기. 원문을 그대로 찍으면 로그가 또 하나의 유출 경로가 된다.
 * 앞 4자만 남기고 길이를 밝힌다.
 */
export function maskSecretToken(token: string): string {
  const value = String(token || '');
  if (value.length <= 4) return '****';
  return `${value.slice(0, 4)}…(${value.length}자)`;
}

/**
 * 재료 텍스트에서 자격증명 의심 토큰을 지운다.
 *
 * 모델에게 넘기기 전에 부른다 — 애초에 보지 못하면 본문에 옮겨 적을 수도 없다.
 * 지운 자리는 빈칸으로 두고 공백을 정리한다(문장이 붙어버리지 않게).
 */
export function stripSecretLikeTokens(text: string): {
  readonly text: string;
  readonly removed: string[];
} {
  const source = String(text || '');
  const removed = findSecretLikeTokens(source);
  if (removed.length === 0) return { text: source, removed: [] };

  let output = source;
  for (const token of removed) {
    output = output.split(token).join('');
  }
  // 토큰을 들어내며 생긴 연속 공백·빈 줄 정리
  output = output.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return { text: output, removed };
}
