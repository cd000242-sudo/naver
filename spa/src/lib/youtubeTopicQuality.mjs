// 검색량이 높아도 인물 사전/사이트 이동은 급상승 사건·제품의 글감이 아니다.
// 중간의 '프로필'까지 막지 않아 '아이폰 프로필 사진 변경' 같은 사용법은 보존한다.
const LOOKUP_INTENT = /(?:나무\s*위키|위키백과|프로필|인스타(?:그램)?|나이|학력|고향|본명|생년월일|인벤|갤러리|팬카페)(?:\s*(?:주소|링크|바로가기))?$/u;

export function isUsefulYoutubeTopic(value) {
  if (typeof value !== 'string') return false;
  const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return text.length >= 2 && !LOOKUP_INTENT.test(text);
}

export function cleanYoutubeSnapshot(snapshot) {
  return {
    ...snapshot,
    rows: (Array.isArray(snapshot?.rows) ? snapshot.rows : [])
      .filter((row) => isUsefulYoutubeTopic(row?.keyword))
      .map((row) => ({ ...row, expansions: (Array.isArray(row.expansions) ? row.expansions : []).filter(isUsefulYoutubeTopic) })),
  };
}
