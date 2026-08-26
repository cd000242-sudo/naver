// src/content/koreanFactTokens.ts
// 한국어 원문에서 "지켜야 할 고유명사"를 뽑는다.
//
// [2026-08-26 실측] sourceFidelityCheck 의 한글 추출은 [가-힣]{4,12} 가 2회 이상일 때만
// 잡았다. 그래서 이런 일이 벌어졌다.
//   원문: 김윤주 / 권정열 / 박세진 / 옥상달빛 / 십센치 / 아메리카노
//   추출: "김윤주는" 하나 (조사째로), 나머지는 전부 누락
// 한국 인명은 대부분 세 글자라 4자 하한에 걸려 통째로 빠지고, 4자 이상은 조사가 붙은
// 형태로 잡혀 원문·결과물 대조가 어긋난다.
//
// 이 모듈은 조사를 떼고 2~12자 고유명사 후보를 세되, 흔한 일반어를 닫힌 목록으로 막는다.
// 목록은 닫혀 있으므로 진짜 고유명사를 잘못 버릴 위험이 없다.

import { toHashtagCandidate } from './hashtagCandidateFilter.js';

/**
 * 자주 나오지만 고유명사가 아닌 말. 닫힌 목록이라 오탐이 없다.
 * (조사를 뗀 형태로 적는다.)
 */
const COMMON_WORDS = new Set([
  '그리고', '하지만', '그러나', '그래서', '때문', '이번', '지난', '올해', '작년', '내년',
  '오늘', '어제', '내일', '지금', '현재', '최근', '당시', '이후', '이전', '동안',
  '사람', '자신', '우리', '여러', '모든', '다른', '많은', '같은', '경우', '통해',
  '대해', '위해', '관련', '이라는', '라는', '했다', '한다', '있다', '없다', '된다',
  '이라고', '으로', '에서', '까지', '부터', '보다', '처럼', '만큼',
  '기자', '사진', '제공', '뉴스', '기사', '보도', '취재', '연합뉴스', '뉴시스',
  '공개', '전했다', '밝혔다', '말했다', '남겼다', '올렸다', '알려졌다',
  // 흔한 부사·관형형 — 어느 글에나 나오므로 "지켜야 할 사실"이 아니다.
  '함께', '다시', '서로', '아주', '매우', '특히', '물론', '역시', '바로', '먼저',
  '짧은', '좋은', '작은', '새로운', '이런', '그런', '저런', '어떤',
  '정도', '상태', '모습', '이유', '부분', '생각', '하나', '내용', '이야기',
]);

/** 어절에서 앞뒤 군더더기를 떼고 고유명사 후보만 남긴다. 아니면 null. */
/**
 * 동사·형용사 활용 어미. 이걸로 끝나면 고유명사가 아니라 서술어다.
 * 긴 것부터 본다("했으며"를 "며"보다 먼저).
 */
const VERB_ENDINGS = [
  '했으며', '하였으며', '되었으며', '으며', '하며', '셔서', '아서', '어서',
  '합니', '습니', '했', '겠', '였', '겼', '았', '었', '해', '한', '하고', '되고',
  // 과거형 축약 어간 — "구성됐다"→"구성됐", "올렸다"→"올렸"
  '됐', '렸', '났', '왔', '갔', '졌', '쳤', '뒀', '췄', '웠', '혔',
  // 피동·인용 어미 — "적용된다고", "적용되며", "유지된"
  '다고', '되며', '된', '되는', '하는', '이라',
];

/** 두 글자 조각의 끝소리로 자주 쓰이는 조사. */
const SINGLE_PARTICLE_TAILS = new Set(['과', '을', '를', '이', '가', '는', '은', '에', '도', '와', '로', '의', '만']);

function looksLikeVerb(token: string): boolean {
  return VERB_ENDINGS.some(
    (ending) => token.length > ending.length && token.endsWith(ending),
  );
}

export function toFactToken(rawWord: string): string | null {
  let core = toHashtagCandidate(rawWord);
  if (!core) return null;
  // 서술격 조사 '-다' ("부부다" → "부부"). 세 글자 이상일 때만 뗀다 —
  // "바다"처럼 두 글자 단어의 끝소리를 조사로 오인하면 단어를 잃는다.
  if (core.length >= 3 && core.endsWith('다')) core = core.slice(0, -1);
  // [2026-08-26] 조사를 떼고 나면 동사 활용형이 남는다("남겼다"→"남겼",
  //   "공개했다"→"공개했", "주셔서", "데뷔했으며"). 지켜야 할 고유명사가 아니므로 버린다.
  //   어간("공개", "결혼")을 살리는 선택지도 있었지만 그건 일반 동작명사라
  //   "원본에서 지켜야 할 사실"이 아니다.
  if (looksLikeVerb(core)) return null;
  // 두 글자 토큰의 끝소리가 조사면 조각이다("글과", "글을", "이를").
  //   조사 떼기는 세 글자 이상에만 걸리므로 여기서 따로 막는다.
  //   "서울"·"부산"·"제주"처럼 조사와 겹치지 않는 끝소리를 가진 고유명사는 무사하다.
  if (core.length === 2 && SINGLE_PARTICLE_TAILS.has(core[1])) return null;
  if (COMMON_WORDS.has(core)) return null;
  if (core.length < 2 || core.length > 12) return null;
  if (COMMON_WORDS.has(core)) return null;
  // 순수 한글만 — 영문·숫자는 기존 추출기가 따로 담당한다.
  if (!/^[가-힣]+$/.test(core)) return null;
  return core;
}

/**
 * 원문에서 반복 등장하는 한글 고유명사 후보를 빈도순으로 뽑는다.
 *
 * 2회 이상 나오는 말만 본다 — 한 번 스친 말은 그 글의 뼈대가 아니다.
 * 인명(3자)이 대부분이라 하한을 2자로 내렸고, 대신 조사를 떼고 일반어를 막았다.
 */
export function extractKoreanFactTokens(text: string, max: number): string[] {
  if (!text || max <= 0) return [];
  const counts = new Map<string, number>();

  for (const word of String(text).split(/[^가-힣A-Za-z0-9]+/)) {
    const token = toFactToken(word);
    if (!token) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([word]) => word);
}
