/**
 * The 32 Naver blog topic names LEWORD's "today picks" file is organized by.
 * A plan may only name these; the file itself is external input and is validated separately when it is read.
 */
export const DAILY_LEWORD_TOPICS: readonly string[] = Object.freeze([
  '문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마', '스타·연예인', '만화·애니',
  '방송', '일상·생각', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용', '인테리어·DIY', '요리·레시피',
  '상품리뷰', '원예·재배', '게임', '스포츠', '사진', '자동차', '취미', '국내여행',
  '세계여행', '맛집', 'IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문',
]);
/** A plan reads from at most this many topics so one post never mixes unrelated fields. */
export const DAILY_LEWORD_MAX_TOPICS = 3;
