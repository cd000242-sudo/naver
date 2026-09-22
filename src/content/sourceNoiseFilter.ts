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
//
// [2026-09-22 감사 실측] 자료 5~8건짜리 묶음(총 29,099자)이 7,992자로 잘렸다.
// SUPPLEMENT_BOUNDARY 가 "=== 상위 노출 글 본문 발췌" 라는 옛 표제만 알아서, 실제
// 묶음("=== 사실 자료 ===" ... "[자료 N — 제목]" ... "=== 검색 결과 스니펫 ===")을
// 하나의 덩어리로 보고 cutTrailingChrome 이 첫 자료의 "관련 기사" 를 찾아 그 뒤
// 자료 2~8을 통째로 날렸다. 이 파일은 이제 묶음을 알아본다 — 자료마다 따로 자르고,
// 한 자료의 꼬리 절단이 다른 자료를 건드리지 않는다.

import { parseLegacyMaterialBundle } from './sourceDocument.js';

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

/*
 * [2026-08-27 사장님 지적] "월이 빠져도 되는 거니?"
 *
 * 기사 본문은 "26일 유튜브 채널에는…" 처럼 일만 적는다 — 발행일이 머리에 붙어 있어
 * 독자가 달을 안다. 그 발행일이 앞머리 껍데기 안에 있는데, 껍데기를 지우면서 연·월까지
 * 함께 날리면 글에 "26일"만 남는다. 며칠만 지나도 어느 달인지 알 수 없는 글이 된다.
 *
 * 껍데기의 형식은 지우되 날짜라는 사실은 남긴다. 삭제 규칙보다 먼저 돌려 한국어
 * 표기로 바꿔 두면, 뒤따르는 삭제 규칙은 이미 접두가 사라진 이 문자열을 건드리지 않는다.
 */
const NOISE_INLINE_REWRITES: readonly { re: RegExp; to: (m: RegExpMatchArray) => string }[] = [
  {
    re: /(?:기사)?(?:발행|입력|수정|등록)\s*[:：]?\s*(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?\s*[・·ㆍ|]?\s*(?:오전|오후)?\s*\d{1,2}\s*[:시]\s*\d{0,2}분?/g,
    to: (m) => `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일 `,
  },
];

/** 줄 안에 섞여 있어도 걷어낼 조각. 줄 전체를 지우지 않고 이 부분만 뺀다. */
const NOISE_INLINE_PATTERNS: readonly RegExp[] = [
  /*
   * [2026-09-02 실측] 기계 식별자. 기사 본문에 뜻이 없는데 두 번 해를 끼친다.
   *
   * 냉장고 글 본문에 이 문장이 실렸다 —
   *   "4e4fee07-6480-4f15-9023-98d2f1898c72라는 식별 문자열과 함께
   *    99번째, 100번째, 3대 … 라는 표기가 섞여 있습니다"
   * (1) 원문이 그대로 남아 모델 눈에 보였고
   * (2) sourceFidelityCheck 가 4e · 98d 조각으로 잘라 필수 사실 목록에 올렸다.
   * 둘째 경로는 그쪽에서 닫았고, 여기서 첫째를 닫는다.
   *
   * 두 번째 규칙은 숫자와 a-f 를 **둘 다** 요구한다 — 순수 숫자(연도 · 전화번호)와
   * 순수 영단어가 걸리지 않게 하려는 것이다. 이 파일의 원칙(좁고 확실한 패턴만)과 같다.
   */
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{16,}\b/gi,
  // "발행 시각 07:27" 이 문장 앞에 붙어 다음 문장과 엉키는 실측 사례
  /(?:기사)?(?:입력|수정|발행|등록)\s*(?:시각|일시)\s*[:：]?\s*\d{1,2}\s*[:시]\s*\d{0,2}분?/g,
  /(?:기사)?(?:입력|수정)\s*[:：]?\s*\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\.?\s*(?:오전|오후)?\s*\d{0,2}[:시]?\d{0,2}분?/g,
  /조회\s*수?\s*[\d,]{2,}\s*회?/g,
  /*
   * [2026-08-27] 기사 앞머리 껍데기. 꼬리를 자르고 나면 이게 남는다.
   *   "…[레벨업]발행 : 2026.08.26 ・ 22:55조회수 :최진실 기자Google 검색 선호 출처로 추가"
   * 생성된 글에 "22:55조회수 집계와 함께"로 새어 나온 자리다. 위 규칙들은 접두 뒤에
   * "시각/일시"를 요구하거나 조회수 뒤에 숫자를 기대해 이 형태를 놓쳤다.
   */
  /조회\s*수\s*[:：]\s*/g,
  /Google\s*검색\s*선호\s*출처로\s*추가/g,
  /*
   * [2026-08-27] 접두 없는 발행시각이 조회수 문구에 바로 붙어 오는 실측 형태.
   *   "2026. 08. 26 06:00조회수 집계가 시작된 스타뉴스 보도…"
   * 위 두 규칙은 "입력/수정" 접두를 요구하고, 조회수 규칙은 뒤에 숫자를 기대해
   * 둘 다 빗나갔다. 시각과 문구를 각각 잡는다.
   */
  /\d{4}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}\.?\s*\d{1,2}:\d{2}/g,
  /조회\s*수?\s*집계가?\s*시작된\s*/g,
  /*
   * 인기순위 위젯 자국 — "01박수홍 비행기 지연 이슈, 02카자흐스탄 정부 발표 논란,
   * 03박수홍 추가 소식". 뉴스 사이트 사이드바를 본문으로 긁어온 흔적이다.
   * 두 자리 숫자가 공백 없이 한글에 붙은 항목이 셋 이상 이어질 때만 본다 —
   * 둘까지는 정상 문장일 수 있어 건드리지 않는다.
   */
  /\d{2}[가-힣][^,\n]{0,30}(?:,\s*\d{2}[가-힣][^,\n]{0,30}){2,}/g,
  // 위젯을 이끄는 라벨. 항목을 지우고 나면 "…인기 급상승 뉴스 코너의" 만 덩그러니 남는다.
  /(?:포털\s*[가-힣]+(?:[-–][가-힣]+)?\s*)?(?:인기\s*급상승|많이\s*본|실시간\s*인기)\s*뉴스\s*(?:코너의|코너|섹션의|섹션)?\s*/g,
  // 저작권 고지 — 줄 단위로 지우면 한 덩어리 본문이 통째로 날아간다(2026-08-26 회귀).
  //   조각으로만 걷어낸다: "<저작권자 ⓒ 스타뉴스, 무단전재 및 재배포 금지>"
  //   끝맺음은 "금지/금합니다"로만 잡는다. "재배포"를 종료어에 넣으면 non-greedy 가
  //   거기서 멈춰 " 금지>" 꼬리가 남는다(실측).
  /*
   * [2026-08-27 네이트 실측] 광고 CSS 와 자바스크립트가 본문 **중간**에 끼어 온다.
   *   "…함께할 예정이다. div.news_view div.view_cont #ad_innerView {margin:0 auto;}
   *    #ad_innerView{width:320px;height:auto;…}"
   *   "// 감정 이모티콘 jQuery("#md-emotion-view .md-emotion").css({…});"
   * 꼬리 절단은 본문 뒤만 보므로 여기 닿지 않는다.
   *
   * 중괄호나 세미콜론을 사이에 두고 양옆으로 한글 없는 구간이 10자 넘게 이어지면
   * 본문이 아니라 코드다. 영문 인용("Love youuuu")이나 이메일(elnino8919@osen.co.kr)은
   * 그 기호를 쓰지 않아 걸리지 않는다 — 기호를 요구하는 것이 이 규칙의 안전장치다.
   */
  /[^가-힣\n]{10,}[{};][^가-힣\n]{10,}/g,
  /*
   * 감정 반응 위젯 — "최고예요9훈훈해요5어이없어요107속상해요0화나요883".
   * 라벨과 숫자가 공백 없이 붙어 나오는 형태만 본다. 본문의 "화나요라고" 같은 말은
   * 뒤에 숫자가 없어 걸리지 않는다.
   */
  /(?:최고예요|훈훈해요|어이없어요|속상해요|화나요|추천해요)\s*\d+(?:\s*(?:최고예요|훈훈해요|어이없어요|속상해요|화나요|추천해요)\s*\d+)+/g,
  /[<([]?\s*저작권자[^<>()[\]\n]{0,80}?(?:금지|금합니다)[^\S\n]*[>)\]]?/g,
  /무단\s*(?:전재|복제|배포)[^\n]{0,40}?(?:금지|금합니다)[^\S\n]*[>)\]]?/g,
  /*
   * [2026-08-27 뉴스픽 실측] 본문 끝에 그대로 남던 껍데기 둘.
   *   "All rights reserved."          ← 영문 저작권. 위 규칙은 전부 한글을 요구했다.
   *   "'이미지 크게 보기' 안내"        ← 이미지 확대 버튼의 UI 문구
   * 발행된 글에 "All rights reserved." 가 한 줄로 실렸다.
   */
  /(?:Copyright\s*[©ⓒc]?[^\n]{0,60}?)?All\s+rights\s+reserved\.?/gi,
  /Copyright\s*[©ⓒ][^\n]{0,60}?(?=\s|$)/g,
  // "이미지 크게 보기" 는 버튼 문구다. 본문의 "이미지가 공개되며" 같은 말과 형태가 다르다.
  /이미지\s*크게\s*보기\s*/g,
];

export interface SourceNoiseFilterResult {
  readonly text: string;
  /** 지워진 줄 수 — 로그로 확인할 수 있게. */
  readonly removedLines: number;
  /** 줄 안에서 지워진 조각 수. */
  readonly removedFragments: number;
  /**
   * 본문 뒤 껍데기로 잘라낸 글자 수.
   *
   * [2026-08-27 회귀] 이 값이 없어서 사고가 났다. 호출부가 줄·조각 카운터만 보고
   * "지운 게 있나"를 판단했는데, 꼬리 절단은 둘 다 올리지 않는다. 네이트 기사에서
   * 3,028자를 잘라내고도 조건이 거짓이 되어 원문이 그대로 넘어갔다.
   */
  readonly removedTailChars: number;
  /** 무언가 지웠는가. 호출부는 카운터가 아니라 이걸 봐야 한다. */
  readonly changed: boolean;
  /**
   * [2026-09-22] 묶음(여러 자료)을 인식했을 때만 채운다. 자료별로 얼마나 잘렸는지
   * 확인할 수 있게 — 자료 하나가 유난히 많이 잘렸으면 의심해 볼 신호다.
   */
  readonly documents?: { total: number; kept: number; removedCharsByDoc: number[] };
}

const EMPTY_RESULT: SourceNoiseFilterResult = {
  text: '', removedLines: 0, removedFragments: 0, removedTailChars: 0, changed: false,
};

/** 줄·조각 단위 정리만 한다. 꼬리 절단은 호출부가 스코프를 정해서 따로 건다. */
function cleanLines(source: string): { text: string; removedLines: number; removedFragments: number } {
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
    // 삭제보다 먼저 — 지우면 사라질 사실(발행일)을 읽을 수 있는 형태로 남긴다.
    for (const { re, to } of NOISE_INLINE_REWRITES) {
      next = next.replace(re, (...args) => {
        removedFragments++;
        return to(args as unknown as RegExpMatchArray);
      });
    }
    for (const re of NOISE_INLINE_PATTERNS) {
      next = next.replace(re, () => {
        removedFragments++;
        return ' ';
      });
    }
    kept.push(next.replace(/[ \t]{2,}/g, ' '));
  }

  const cleaned = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: cleaned, removedLines, removedFragments };
}

/*
 * [2026-08-27] 기사 본문이 끝나는 자리 표지.
 *
 * 사장님 실측: 스타뉴스 크롤 1,932자 중 뒤 640자(전체의 1/3)가 사이드바였고
 * — 브리핑·추천 기사·인기 급상승 뉴스·최신 뉴스·AD — 모델이 그 640자로 소제목을
 * 하나 만들어 냈다(지예은·김동준·코레일·아이유). 조각 규칙을 늘리는 방식으로는
 * 못 막는다. 사이트마다 문구가 다르고, 크롤 결과에 줄바꿈이 없어 줄 단위로도 못 가른다.
 *
 * 대신 구조를 쓴다 — 저작권 표시가 본문의 끝이고 그 뒤는 전부 사이트 껍데기다.
 * 표지를 못 찾으면 아무것도 자르지 않는다.
 */
const BODY_END_MARKERS: readonly RegExp[] = [
  /[<([]?\s*저작권자\s*[©ⓒ]/,
  /무단\s*(?:전재|복제|배포)/,
  /추천\s*기사/,
  /관련\s*기사/,
  /인기\s*급상승\s*뉴스/,
  /최신\s*뉴스/,
  /많이\s*본\s*뉴스/,
  /이슈\s*보러가기/,
];

/*
 * 표지 앞에 이만큼은 남아야 자른다 — 앞머리 표지에 본문을 통째로 내주지 않는다.
 *
 * [2026-08-27] 네이트 기사는 본문이 전체의 43%뿐이었다(본문 2,282자 / 껍데기 3,026자).
 * 하한이 40%였을 때 크롤 길이가 조금만 흔들려도 못 넘겨, 껍데기가 통째로 남았다.
 * 비율은 낮추고 글자 수 하한을 올린다 — 앞머리 오절단은 글자 수가 막는다.
 */
const MIN_BODY_CHARS = 400;
const MIN_BODY_RATIO = 0.25;

/**
 * [2026-09-22] 한 자료 안에서 꼬리 절단이 그 자료 몸통의 대부분을 먹어치우면
 * 안전장치를 건다 — 진짜 사이트 껍데기는 자료 하나를 통째로 차지하지 않는다.
 * 이 표지가 자료 본문 자체의 문구("무단 전재된 사진을 다뤘다" 류)와 우연히 겹쳤을
 * 때를 잡아낸다.
 */
const BODY_TAIL_CUT_SAFETY_RATIO = 0.6;

/*
 * Marks where the deliberately-attached supplement begins.
 *
 * [2026-08-27 뉴스픽 실측] 절단이 보강 자료를 통째로 날렸다.
 *   원본 1,072자 + 보강 2,681자 = 3,753자 → 절단 후 1,015자.
 * 원본 끝의 저작권 표시에서 자르면서 그 뒤에 붙여 둔 블로그 자료까지 사라졌다.
 * 절단은 기사 본문의 끝을 찾는 장치지, 우리가 의도적으로 붙인 자료를 지우는 장치가 아니다.
 *
 * [2026-09-22] 묶음 표지를 더했다 — "=== 사실 자료", "=== 검색 결과 스니펫",
 * "[자료 N" 앞에서도 멈춘다. 이 경로(레거시/단일 블록 처리)는 parseLegacyMaterialBundle
 * 이 자료를 하나도 못 찾았을 때만 타므로 사실상 방어용이지만, 형태가 살짝 어긋난
 * 입력에도 안전망이 있어야 한다.
 */
const SUPPLEMENT_BOUNDARY =
  /(?:^|\n)\s*(?:---\s*참고 자료|===\s*상위 노출 글 본문 발췌|===\s*사실 자료|===\s*검색 결과 스니펫|\[자료 \d+)/;

function cutTrailingChrome(text: string): { text: string; cutChars: number } {
  // 보강 구간은 손대지 않는다. 기사 본문 쪽만 잘라 내고 그대로 다시 붙인다.
  const boundary = text.search(SUPPLEMENT_BOUNDARY);
  if (boundary >= 0) {
    const head = cutTrailingChrome(text.slice(0, boundary));
    return { text: head.text + text.slice(boundary), cutChars: head.cutChars };
  }

  let earliest = -1;
  for (const re of BODY_END_MARKERS) {
    const at = text.search(re);
    if (at >= 0 && (earliest < 0 || at < earliest)) earliest = at;
  }
  if (earliest < 0) return { text, cutChars: 0 };
  if (earliest < MIN_BODY_CHARS) return { text, cutChars: 0 };
  if (earliest < text.length * MIN_BODY_RATIO) return { text, cutChars: 0 };
  return { text: text.slice(0, earliest), cutChars: text.length - earliest };
}

/**
 * 자료 하나(문서 하나)의 몸통에만 적용하는 꼬리 절단. cutTrailingChrome 과 달리
 * 이 함수는 다른 자료로 번지지 않는다 — 호출부가 이미 그 자료의 몸통만 넘긴다.
 */
function cutTrailingChromeScoped(text: string): { text: string; cutChars: number } {
  let earliest = -1;
  for (const re of BODY_END_MARKERS) {
    const at = text.search(re);
    if (at >= 0 && (earliest < 0 || at < earliest)) earliest = at;
  }
  if (earliest < 0) return { text, cutChars: 0 };
  if (earliest < MIN_BODY_CHARS) return { text, cutChars: 0 };
  if (earliest < text.length * MIN_BODY_RATIO) return { text, cutChars: 0 };

  const cutChars = text.length - earliest;
  if (cutChars > text.length * BODY_TAIL_CUT_SAFETY_RATIO) {
    console.log(
      `[SourceNoise] 꼬리 절단 건너뜀 — ${cutChars}자는 자료 본문(${text.length}자)의 `
      + `${BODY_TAIL_CUT_SAFETY_RATIO * 100}%를 넘는다 (진짜 껍데기는 자료 하나를 통째로 차지하지 않는다)`,
    );
    return { text, cutChars: 0 };
  }
  return { text: text.slice(0, earliest), cutChars };
}

/**
 * 로그 한 줄로 절단 규모를 알린다. removed_ratio 가 30%를 넘으면 경고, 50%를
 * 넘으면 품질 게이트 급 신호를 접두어로 붙인다. 지운 게 없으면 조용히 넘어간다.
 */
function logNoiseSummary(docsCount: number, rawChars: number, cleanChars: number): void {
  const removedChars = rawChars - cleanChars;
  if (removedChars <= 0) return;
  const removedRatio = rawChars > 0 ? (removedChars / rawChars) * 100 : 0;
  const ratioLabel = removedRatio.toFixed(1);
  let prefix = '';
  if (removedRatio > 50) prefix = '⛔ QUALITY_GATE_WEAK ';
  else if (removedRatio > 30) prefix = '⚠️ WARNING ';
  console.log(
    `${prefix}[SourceNoise] docs=${docsCount} raw_chars=${rawChars} clean_chars=${cleanChars} `
    + `removed_chars=${removedChars} removed_ratio=${ratioLabel}%`,
  );
}

/**
 * 자료 하나(하나의 SourceDocument.body)에만 적용하는 노이즈 제거.
 * 꼬리 절단은 이 몸통 안에서만 일어나고, 안전망(전부 지워지면 원문 유지)도
 * 이 몸통 단위로 건다 — 자료 A의 실패가 자료 B를 건드리지 않는다.
 */
export function stripSourceNoiseFromBody(body: string | null | undefined): SourceNoiseFilterResult {
  const original = String(body ?? '');
  if (!original.trim()) return { ...EMPTY_RESULT, text: original };

  const tail = cutTrailingChromeScoped(original);
  const { text: cleaned, removedLines, removedFragments } = cleanLines(tail.text);

  // 안전망: 필터가 이 자료 하나를 통째로 비우면 그건 필터가 틀린 것이다. 원문을 지킨다.
  if (!cleaned && original.trim()) {
    console.warn('[SourceNoise] 필터가 자료 본문을 전부 지웠다 — 그 자료는 원문을 그대로 쓴다.');
    return { ...EMPTY_RESULT, text: original };
  }

  return {
    text: cleaned,
    removedLines,
    removedFragments,
    removedTailChars: tail.cutChars,
    changed: cleaned !== original.trim(),
  };
}

/**
 * 묶음(여러 자료)을 알아봤을 때 경로. 자료마다 stripSourceNoiseFromBody 를 따로 걸고,
 * 서두(등급 안내·"=== 사실 자료 ===" 표제·※ 안내문)와 스니펫 구간은 손대지 않고
 * 그대로 되돌린다 — 노이즈 제거는 자료 본문의 일이지, 우리가 붙인 안내문의 일이 아니다.
 */
function stripSourceNoiseBlockAware(
  original: string,
  parsed: { documents: { title: string; body: string }[]; preamble: string; snippetSection: string },
): SourceNoiseFilterResult {
  let removedLines = 0;
  let removedFragments = 0;
  let removedTailChars = 0;
  const removedCharsByDoc: number[] = [];
  const renderedDocs: string[] = [];

  for (const doc of parsed.documents) {
    const result = stripSourceNoiseFromBody(doc.body);
    removedLines += result.removedLines;
    removedFragments += result.removedFragments;
    removedTailChars += result.removedTailChars;
    removedCharsByDoc.push(Math.max(0, doc.body.length - result.text.length));
    const header = `[자료 ${renderedDocs.length + 1}${doc.title ? ` — ${doc.title}` : ''}]`;
    renderedDocs.push(`${header}\n${result.text}`);
  }

  const rebuilt = [parsed.preamble, renderedDocs.join('\n\n'), parsed.snippetSection]
    .filter((part) => part.trim().length > 0)
    .join('\n\n')
    .trim();

  logNoiseSummary(parsed.documents.length, original.length, rebuilt.length);

  return {
    text: rebuilt,
    removedLines,
    removedFragments,
    removedTailChars,
    changed: rebuilt !== original.trim(),
    documents: { total: parsed.documents.length, kept: parsed.documents.length, removedCharsByDoc },
  };
}

/** 묶음 구조를 못 찾았을 때의 예전 경로 — 텍스트 전체를 한 덩어리로 다룬다. */
function stripSourceNoiseLegacyPath(original: string): SourceNoiseFilterResult {
  const tail = cutTrailingChrome(original);
  const source = tail.text;
  if (tail.cutChars > 0) {
    console.log(`[SourceNoise] 본문 뒤 사이트 껍데기 ${tail.cutChars}자 절단`);
  }

  const { text: cleaned, removedLines, removedFragments } = cleanLines(source);

  // [2026-08-26] 마지막 안전망. 내용이 있던 원문이 통째로 비면 그건 필터가 틀린 것이다.
  //   껍데기 한 줄이 남는 것보다 기사 한 편을 잃는 쪽이 훨씬 나쁘다 — 원문을 그대로 쓴다.
  if (!cleaned && original.trim()) {
    console.warn('[SourceNoise] 필터가 원문을 전부 지웠다 — 원문을 그대로 쓴다.');
    return { ...EMPTY_RESULT, text: original };
  }

  logNoiseSummary(1, original.length, cleaned.length);

  return {
    text: cleaned,
    removedLines,
    removedFragments,
    removedTailChars: tail.cutChars,
    // 원문과 다르면 무언가 지운 것이다. 카운터 합계로 판단하면 꼬리 절단을 놓친다.
    changed: cleaned !== original.trim(),
  };
}

export function stripSourceNoise(rawText: string | null | undefined): SourceNoiseFilterResult {
  const original = String(rawText ?? '');
  if (!original.trim()) return { ...EMPTY_RESULT, text: original };

  const parsed = parseLegacyMaterialBundle(original);
  if (parsed && parsed.documents.length > 0) {
    return stripSourceNoiseBlockAware(original, parsed);
  }
  return stripSourceNoiseLegacyPath(original);
}
