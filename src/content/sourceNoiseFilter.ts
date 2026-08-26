// src/content/sourceNoiseFilter.ts
// 수집 원문에서 기사 껍데기(메타 정보)를 걷어낸다.
//
// [2026-08-26 사장님 실측] 발행된 글 본문에 이런 문장이 들어갔다.
//   "발행 시각 07:27조회수를 기록한 관련 소식에 따르면, 두 사람은 2014년 6월에…"
// 원본 기사의 발행 시각과 조회수가 본문 재료로 흘러들어가 모델이 사실인 양 엮었다.
//
// 크롤러는 CSS 셀렉터로 노이즈를 지우는데(smartCrawler:815~), 언론사마다 마크업이
// 달라 시각·조회수 같은 짧은 텍스트는 본문 컨테이너 안에 남는 경우가 많다.
// 셀렉터를 계속 쫓는 대신 텍스트 층에서 한 번 더 거른다.
//
// 원칙: 좁고 확실한 패턴만 지운다. 애매하면 남긴다 —
// 사실을 실수로 지우는 것이 껍데기 한 줄이 남는 것보다 나쁘다.

/**
 * 줄 단위 삭제는 짧은 줄에만 건다.
 *
 * [2026-08-26 개발 중 실측] 길이 제한 없이 걸었더니
 * "발행 시각 07:27 조회수 1,234회 를 기록한 관련 소식에 따르면 두 사람은 2014년
 * 6월에 결혼했다." 한 줄이 통째로 사라졌다. 앞머리만 껍데기고 뒤는 진짜 내용이었다.
 * 껍데기 줄은 짧다 — 긴 줄은 줄 단위로 지우지 않고 조각만 뺀다.
 */
const MAX_NOISE_LINE_LENGTH = 40;

/** 줄 전체가 이 모양이면 껍데기다. (짧은 줄에만 적용) */
const NOISE_LINE_PATTERNS: readonly RegExp[] = [
  // 입력/수정/발행 시각 — "입력 2026.08.26. 오전 7:27", "발행 시각 07:27"
  /^(?:기사)?(?:입력|수정|발행)\s*(?:시각|일시)?\s*[:：]?\s*\d{2,4}[.\-/년\s]/,
  /^(?:발행|등록)\s*시각\s*[:：]?\s*\d{1,2}\s*[:시]/,
  // 조회수·댓글수 카운터
  /^조회\s*(?:수)?\s*[:：]?\s*[\d,]+\s*$/,
  /^댓글\s*[:：]?\s*[\d,]+\s*$/,
  // 저작권 고지 — 길이 제한과 무관하게 지운다(아래 ALWAYS 목록)
  // 기자 바이라인 — "홍길동 기자", "홍길동 기자 hong@news.com"
  /^[가-힣]{2,4}\s*기자(?:\s*\S+@\S+)?\s*$/,
  /^\S+@\S+\.\S+\s*$/,
  // 사진 출처 캡션
  /^\[?사진\s*[=:]\s*\S+\]?\s*$/,
  /^\(?사진\s*제공\s*[=:]/,
  // 관련기사 유도
  /^[▶▷►■□]\s*(?:관련|추천|이전|다음)\s*(?:기사|글|뉴스)/,
];

/** 줄 안에 섞여 있어도 걷어낼 조각. 줄 전체를 지우지 않고 이 부분만 뺀다. */
const NOISE_INLINE_PATTERNS: readonly RegExp[] = [
  // "발행 시각 07:27" 이 문장 앞에 붙어 다음 문장과 엉키는 실측 사례
  /(?:기사)?(?:입력|수정|발행|등록)\s*(?:시각|일시)\s*[:：]?\s*\d{1,2}\s*[:시]\s*\d{0,2}분?/g,
  /(?:기사)?(?:입력|수정)\s*[:：]?\s*\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\.?\s*(?:오전|오후)?\s*\d{0,2}[:시]?\d{0,2}분?/g,
  /조회\s*수?\s*[\d,]{2,}\s*회?/g,
  // 저작권 고지 — 줄 단위로 지우면 한 덩어리 본문이 통째로 날아간다(2026-08-26 회귀).
  //   조각으로만 걷어낸다: "<저작권자 ⓒ 스타뉴스, 무단전재 및 재배포 금지>"
  //   끝맺음은 "금지/금합니다"로만 잡는다. "재배포"를 종료어에 넣으면 non-greedy 가
  //   거기서 멈춰 " 금지>" 꼬리가 남는다(실측).
  /[<([]?\s*저작권자[^<>()[\]\n]{0,80}?(?:금지|금합니다)[^\S\n]*[>)\]]?/g,
  /무단\s*(?:전재|복제|배포)[^\n]{0,40}?(?:금지|금합니다)[^\S\n]*[>)\]]?/g,
];

export interface SourceNoiseFilterResult {
  readonly text: string;
  /** 지워진 줄 수 — 로그로 확인할 수 있게. */
  readonly removedLines: number;
  /** 줄 안에서 지워진 조각 수. */
  readonly removedFragments: number;
}

export function stripSourceNoise(rawText: string | null | undefined): SourceNoiseFilterResult {
  const source = String(rawText ?? '');
  if (!source.trim()) return { text: source, removedLines: 0, removedFragments: 0 };

  let removedLines = 0;
  let removedFragments = 0;

  const kept: string[] = [];
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    // [2026-08-26 회귀] 길이 제한 없이 줄을 지우는 규칙을 뒀다가 기사 한 편이 통째로
    //   날아갔다. 크롤러는 textContent 로 본문을 뽑아 줄바꿈이 거의 없는 한 덩어리를
    //   만드는데, 그 덩어리 끝의 "무단전재 및 재배포 금지"가 걸려 전체가 삭제됐다
    //   (사용자 실측: "원본 텍스트가 비어 있습니다"). 줄 삭제는 짧은 줄에만 건다.
    //   긴 줄의 껍데기는 아래 조각 제거가 담당한다.
    const isNoiseLine = trimmed
      && trimmed.length <= MAX_NOISE_LINE_LENGTH
      && NOISE_LINE_PATTERNS.some((re) => re.test(trimmed));
    if (isNoiseLine) {
      removedLines++;
      continue;
    }
    let next = line;
    for (const re of NOISE_INLINE_PATTERNS) {
      next = next.replace(re, () => {
        removedFragments++;
        return ' ';
      });
    }
    kept.push(next.replace(/[ \t]{2,}/g, ' '));
  }

  const cleaned = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // [2026-08-26] 마지막 안전망. 내용이 있던 원문이 통째로 비면 그건 필터가 틀린 것이다.
  //   껍데기 한 줄이 남는 것보다 기사 한 편을 잃는 쪽이 훨씬 나쁘다 — 원문을 그대로 쓴다.
  if (!cleaned && source.trim()) {
    console.warn('[SourceNoise] 필터가 원문을 전부 지웠다 — 원문을 그대로 쓴다.');
    return { text: source, removedLines: 0, removedFragments: 0 };
  }

  return { text: cleaned, removedLines, removedFragments };
}
