// src/content/hashtagCandidateFilter.ts
// 제목·소제목을 쪼개서 만든 해시태그 후보 중 "검색되지 않는 조각"을 걸러낸다.
//
// [2026-08-26 라이브 실측] 발행된 글의 해시태그가 이랬다.
//   #김윤주 권정열 연애, #옥상달빛 럽스타그램, … (여기까지는 서브키워드 — 정상)
//   #8월, #25일, #친함, #셀카, #장으로                (여기부터 제목 어절 조각)
// "한 장으로"를 공백으로 쪼개 "#장으로"가 태그가 됐다. 아무도 검색하지 않는 말이다.
//
// 모델이 해시태그를 하나도 안 줬을 때만 도는 폴백이라 기능 자체는 남긴다.
// 다만 조각을 태그로 만들지는 않는다 — hashtag-strategy HT-2 가 금지하는 채우기다.

/** 명사 뒤에 붙어 조각을 만드는 조사·어미. 긴 것부터 본다. */
const TRAILING_PARTICLES = [
  '으로부터', '에게서', '으로서', '으로써', '이라는', '라는', '이라고', '라고',
  '에서는', '에서도', '에서', '에게는', '에게도', '에게', '한테', '까지', '부터',
  '으로', '로서', '로써', '보다', '처럼', '만큼', '조차', '마저', '이나', '거나',
  '으로', '이며', '이고', '와의', '과의', '에는', '에도',
  '의', '를', '을', '는', '은', '이', '가', '도', '만', '과', '와', '에', '로',
];

// 의존명사에 조사가 붙은 조각 — 그 자체로는 아무도 검색하지 않는다.
// 닫힌 목록이라 "바다"·"사이"처럼 우연히 조사로 끝나는 진짜 단어를 다치지 않는다.
const BOUND_NOUN_FRAGMENTS = new Set([
  '것을', '것이', '것은', '것도', '것만', '것과', '것보다',
  '수가', '수는', '수도', '때가', '때는', '때도', '데가', '데는',
  '등을', '등이', '등은', '등과', '줄을', '뿐이', '바가',
]);

function stripTrailingParticle(token: string): string {
  for (const particle of TRAILING_PARTICLES) {
    if (!token.endsWith(particle)) continue;
    // 두 글자 이상 조사("으로"·"에서"…)는 떼고 남은 게 한 글자여도 뗀다.
    //   "장으로" → "장" → 뒤의 길이 검사에서 걸러진다.
    // 한 글자 조사(는·을·이…)는 세 글자 이상일 때만 뗀다.
    //   "사이"의 '이'를 조사로 오인해 "사"로 만들면 멀쩡한 단어를 잃는다.
    const minLength = particle.length >= 2 ? particle.length + 1 : 3;
    if (token.length >= minLength) return token.slice(0, -particle.length);
  }
  return token;
}

/**
 * 해시태그로 쓸 만한 조각인지 판정한다.
 *
 * 거르는 것:
 *  - 숫자가 섞인 조각 — "8월", "25일", "3가지". 날짜·수량은 검색어가 아니다.
 *  - 조사를 떼면 한 글자만 남는 조각 — "장으로" → "장".
 *  - 한 글자 토큰.
 *
 * 남기는 것은 조사를 뗀 형태다. "셀카를" → "셀카".
 */
export function toHashtagCandidate(rawToken: string): string | null {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  if (/\d/.test(token)) return null;
  if (BOUND_NOUN_FRAGMENTS.has(token)) return null;

  const core = stripTrailingParticle(token);
  if (core.length < 2) return null;
  // 조사를 떼고 나서도 한글·영문·숫자 외 문자만 남으면 버린다.
  if (!/[가-힣a-zA-Z]{2,}/.test(core)) return null;
  return core;
}

/** 토큰 목록을 해시태그 후보로 정제한다. 중복은 앞의 것을 남긴다. */
export function filterHashtagCandidates(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    const candidate = toHashtagCandidate(token);
    if (candidate && !out.includes(candidate)) out.push(candidate);
  }
  return out;
}
