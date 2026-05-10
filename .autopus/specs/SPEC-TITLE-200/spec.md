# SPEC-TITLE-200: 제목 시스템 v2.0
**Status**: draft / **Created**: 2026-04-27 / **Domain**: TITLE
**Depends**: HOMEFEED-100, SEO-100, REVIEW-001

## 목적
2026 네이버 변화(연관검색어 4/31 폐지, 제로클릭, AiRS 도파민50+관심사50) 대응. 4모드(SEO/HOMEFEED/AFFILIATE/BUSINESS) × 키워드 → 100점 제목 5개.

## 요구사항 (EARS)
- F1 WHEN 입력(kw,mode,cat) → 5개 제목 < 8s
- F2 WHEN mode=SEO → 키워드 앞3자+롱테일3어절+정의문신호≥1
- F3 WHEN mode=HOMEFEED → 후킹패턴9종≥1+AI못대체4영역≥1, 키워드위치무관
- F4 WHEN mode=AFFILIATE → 1차경험마커≥1+단점단어≥1+광고법위반0
- F5 WHEN mode=BUSINESS → 업체명통일+지역명+숫자근거≥1
- F6 WHILE 점수<80 → 재생성 MaxRetry=2
- F7 WHEN 과거 제목과 코사인≥0.7 → 거부+재생성
- F8 WHERE 한글 형태소+영어 lowercase 매칭
- F9 출력 {title,mode,breakdown,score,reject} ×5 점수내림차순

## 파일
- `src/title/v2/titleEngineV2.ts` 라우터(≤300L)
- `src/title/v2/modes/{seo,homefeed,affiliate,business}TitleMode.ts` 각≤300L
- `src/title/v2/validators/titleScorer.ts` AC1~7(≤300L)
- `src/title/v2/validators/dedupChecker.ts` 임베딩+캐시(≤200L)
- `src/title/v2/regenerator.ts` F6/F7(≤200L)
- `src/__tests__/title/v2/*.test.ts`

## 비기능
- 성능 1세트<8s p95 / 비용 ≤1500in+600out / 정확도 100=AC1~7 PASS, 인간평가 ≥80% 일치

## Skip
본문 검증(HOMEFEED/SEO 위임). 본 SPEC은 제목 단독.
