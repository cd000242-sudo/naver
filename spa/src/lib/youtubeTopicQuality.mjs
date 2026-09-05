// 검색량이 높아도 인물 사전/사이트 이동은 급상승 사건·제품의 글감이 아니다.
// 중간의 '프로필'까지 막지 않아 '아이폰 프로필 사진 변경' 같은 사용법은 보존한다.
const LOOKUP_INTENT = /(?:나무\s*위키|위키백과|프로필|인스타(?:그램)?|나이|학력|고향|본명|생년월일|국적|직업|와이프|아내|남편|가족관계|혈액형|몸무게|인벤|갤러리|팬카페|\s키|\smbti)(?:\s*(?:주소|링크|바로가기))?$/iu;
const NUMBER_ONLY = /^\d+(?:년|월|일|회|화|기|부|위|시|분|초)?$/u;
// 검색 목적은 확장할 수 있지만 새 인물·작품·사건을 붙이지 않는다.
const FOLLOWUP_INTENTS = new Set([
  '가격', '비교', '후기', '리뷰', '추천', '구매', '구입', '할인', '최저가', '사용법', '방법',
  '이유', '일정', '시간', '날짜', '기간', '신청', '신청방법', '신청기간', '출시일',
  '재방송', '편성표', '다시보기', '몇부작', '방송시간', '결말', '줄거리',
]);
const wordsOf = (value) => typeof value === 'string'
  ? value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [] : [];

export function isUsefulYoutubeTopic(value) {
  if (typeof value !== 'string') return false;
  const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return text.length >= 2 && !LOOKUP_INTENT.test(text);
}

export function isUsefulYoutubeLead(value) {
  return isUsefulYoutubeTopic(value) && wordsOf(value).some((word) => !NUMBER_ONLY.test(word));
}

export function isRelevantYoutubeTopic(keyword, title) {
  if (!isUsefulYoutubeLead(keyword) || typeof title !== 'string' || !title.trim()) return false;
  const evidence = wordsOf(title).join('');
  const subjects = wordsOf(keyword).filter((word) => !NUMBER_ONLY.test(word) && !FOLLOWUP_INTENTS.has(word));
  return subjects.length > 0 && subjects.every((word) => evidence.includes(word));
}

export function cleanYoutubeSnapshot(snapshot) {
  return {
    ...snapshot,
    rows: (Array.isArray(snapshot?.rows) ? snapshot.rows : [])
      .filter((row) => isRelevantYoutubeTopic(row?.keyword, row?.video?.title))
      .map((row) => ({ ...row, expansions: (Array.isArray(row.expansions) ? row.expansions : [])
        .filter((keyword) => isRelevantYoutubeTopic(keyword, row.video.title)) })),
  };
}
