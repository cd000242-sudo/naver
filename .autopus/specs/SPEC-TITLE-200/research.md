# SPEC-TITLE-200 리서치

## 영상 매핑(2026-04-27/28)
- 연관검색어 4/31 폐지 → F2+AC2 / 키워드반복❌ → AC3+모드별위치 / 제목=답명시 → F2+AC7
- 홈판 콘텐츠퍼포먼스 → F3+AC6 / AiRS 도파민50+관심사50 → F3신호+카테고리hint
- 5초이탈/완독/재방문 → Phase3 T11 postMetricsStore / 키워드❌소재후킹✅ → F3 위치무관
- 제로클릭 → F2 SEO "공식/오피셜" 보강 / AI못대체4영역 → AC7

## 기존 코드
- `neoHookTitles.ts` 9패턴×80+ 템플릿+유사도 → Phase1 재사용
- `titleCockpit.ts analyzeTitle()` 0~100점+5tier+클리셰감지 → AC1·AC3 기반
- `titleABTester.ts` 8×4 레거시 → V2 후 deprecated
- `ctrCombat.ts scoreTitleForHomefeed/CTR_BENCHMARKS/resolveCTRCategory` → 모드 점수정규화
- `titleSelector.ts parseTitles()` `[TITLE_N]` 파싱 → V2 출력 어댑터(T5)
- `analytics/postMetricsStore.ts` → Phase3 T11
- `learning/recentWinnersExtractor.ts` mode-agnostic → Phase3 T13

## 설계
- D1 모드라우터 채택. HOME=후킹/SEO=정확 반대방향. 단일프롬프트는 절충만
- D2 MaxRetry=2 hard cap (HOMEFEED W1 합의), 폴백=발행비차단
- D3 임베딩 dedup(ada-002 or nano-banana + jsonl). neoHookTitles 표면유사도(0.5) 어순 변경 취약
- D4 `adLawDictionary.ts` 신규(모드무관). authgrDefense는 본문용
- D5 100점 정량=AC1~7 PASS. 실전 ≥85 (과최적화 위험, HOMEFEED 100점포기 동일근거)

## Risk
- LLM 광고법 반복 출력(High) → 슬롯단위 재생성
- 임베딩비용(Med) → 키워드캐시 TTL30일
- 모드 분기폭증(Med) → zod discriminated union
- 알고리즘 변경(Med) → Phase3 자가보정

Ref: HOMEFEED-100, SEO-100, REVIEW-001, 영상로그2건
