# SPEC-REVIEW-001 — Acceptance Criteria

본 문서는 SPEC-REVIEW-001의 각 단계(P0~P3)별 완료 판정 기준과 비기능 회귀 기준을 정의합니다. 판정은 **자동화된 검증 증거** 또는 **재현 가능한 스크립트 실행 로그**로만 인정합니다. 주관적 판단·추측("그럴 것이다")은 증거로 불인정합니다(Golden Principle #10).

## P0 — 즉시 출혈 차단

### P0-AC1: 금지 경험 표현 0개
- **Given**: 빈 리뷰 배열(`source.productReviews = []`), 스모크 샘플 3종(쇼핑/블로그/일반 각 1건)
- **When**: `contentGenerator.ts` 생성 파이프 실행 → LLM 응답 수신
- **Then**: 생성 본문 3건에서 다음 문자열이 모두 **0개** — "써봤·써본·써보니", 체험 기간 맥락의 "2주·한 달·3개월", "테스트해보니·직접 써보고·경험상", "구매해서 받아보니·배송받자마자"
- **증거**: `tests/smoke/review-guard.test.ts` 실행 로그 `3 passed, 0 failed` + `src/content/forbiddenPhrases.ts`가 위 목록을 export하고 테스트에서 동일 목록 참조

### P0-AC2: 리뷰 블록 치환 확인
- **Given**: `reviewAvailable = false` 플래그
- **When**: `buildFullPrompt()` 결과 프롬프트 문자열 획득
- **Then**: 리뷰 섹션 자리에 "스펙/공식 설명 기반 분석" 블록 포함, 기존 "사용자 리뷰 바탕 후기" 지시문 미포함
- **증거**: 단위 테스트 프롬프트 문자열 스냅샷/부분 매칭

### P0-AC3: Feature Flag 작동
- **Given**: `REVIEW_GUARD_V1 = false` 환경변수
- **When**: 동일 파이프 실행
- **Then**: 기존 경로(변경 전 프롬프트)로 회귀, 리뷰 블록 치환 미발생
- **증거**: flag ON/OFF 각각의 프롬프트 diff 로그

## P1 — 블로그/일반 모드 리뷰 수집 도입

### P1-AC1: 댓글 확보율 임계
- **Given**: 테스트용 블로그 URL 10건(공개 댓글 1개 이상 존재), `USER_VOICE_COLLECT = true`
- **When**: `naverBlogCrawler.ts`로 10건 순차 크롤링
- **Then**: 10건 중 **8건 이상(80%)** 에서 `comments.length >= 1`
- **증거**: `scripts/spike/comment-collect-rate.ts` 실행 결과 JSON `{ total: 10, succeeded: >=8, rate: >=0.80 }`
- **임계 미달 시**: 셀렉터 재조사 → P1 재작업 (flag OFF 유지)
- **비고**: 사전에 공개 댓글 URL만 필터링하여 측정하므로 80% 설정

### P1-AC2: userVoice 조립 확인
- **Given**: `comments.length >= 1`인 수집 결과
- **When**: `sourceAssembler.ts`가 `userVoice` 필드 조립
- **Then**: `userVoice.comments: string[]` 채워짐, `userVoice.questions: string[]`(Q&A)는 별도 키로 분리(없으면 빈 배열)
- **증거**: 단위 테스트 고정 입력 → `userVoice` 스냅샷 일치

### P1-AC3: 프라이버시 스크럽 강제
- **Given**: 개인정보(전화/이메일/실명 추정 문자열) 포함 댓글 샘플
- **When**: `sourceAssembler.ts` 통과
- **Then**: 프롬프트 주입 전 해당 패턴 마스킹(`***` 등), `privacyScrubber.ts` 경유 없이는 `userVoice` 생성 불가(타입 레벨 강제)
- **증거**: 단위 테스트 5케이스(전화/이메일/카드/주민번호/정상) 통과

### P1-AC4: 크롤링 시간 회귀 30% 이내
- **Given**: 기준선 T0(P1 적용 전 10건 평균 소요), 적용 후 T1
- **Then**: `T1 <= T0 × 1.30`
- **증거**: 측정 로그(ms 단위) 비교

### P1-AC5: 셀렉터 중앙 레지스트리 준수
- **Given**: 신규 댓글 셀렉터
- **When**: 코드 리뷰(grep)
- **Then**: `src/automation/selectors/commentSelectors.ts` 경유, `naverBlogCrawler.ts` 내부 CSS 셀렉터 문자열 하드코드 **0건**
- **증거**: `rg "\.se-|#comment" src/naverBlogCrawler.ts` 출력에서 신규 라인 0건

## P2 — 분량 정책 탄력화

### P2-AC1: 공식 적용 단위 테스트
- **Given**: `computeTargetLength(reviewCount, hasSpec)` 입력 조합
- **When**: 함수 호출
- **Then**: `(0, true)` → 상한 **1,200자**, `(1, true)` → 1,000자, `(5, true)` → 1,800자, `(10, true)` → 2,200자(상한 클램프), `(0, false)` → 최소 800자
- **증거**: `tests/content/target-length.test.ts` `5 passed, 0 failed`

### P2-AC2: 프롬프트 플레이스홀더 치환
- **Given**: 동적 `targetLength = 1400`
- **When**: `buildFullPrompt()` 실행
- **Then**: 결과 프롬프트에 "1,400자 내외" 또는 동등 표현 포함, 기존 "1,800~2,200자" 고정 문구 미포함
- **증거**: 단위 테스트 스냅샷

### P2-AC3: SEO 하한 비충돌
- **Given**: `publishingStrategy.ts`의 SEO 최소 글자수 기준
- **When**: `computeTargetLength` 결과와 비교
- **Then**: 모든 조합에서 `targetLength >= SEO_MIN`
- **증거**: 통합 테스트 로그

## P3 — 환각 검증 레이어

### P3-AC1: 추출 정확도 5건
- **Given**: 회귀 시나리오 5건
  1. **수치 환각**: "배터리 48시간 지속" (원문에 수치 없음)
  2. **기간 환각**: "2주간 테스트" (원문에 체험 기간 언급 없음)
  3. **비교 환각**: "A보다 30% 저렴" (원문에 비교 없음)
  4. **정상**: "제조사 스펙상 24시간" (원문 일치)
  5. **모호**: "오래 쓸 수 있다" (정성 표현, 환각 아님)
- **When**: `factChecker.ts` 실행
- **Then**: 케이스 1~3은 **환각으로 판정**, 케이스 4~5는 **환각 아님으로 판정**
- **증거**: `tests/content/fact-checker.test.ts` `5 passed, 0 failed`

### P3-AC2: 재생성·삭제 루프
- **Given**: 환각 판정된 문장 1개
- **When**: 발행 직전 훅 실행
- **Then**: 1회 재생성 후 여전히 환각이면 해당 문장 삭제, 최대 2회 시도 후 종료(무한 루프 방지)
- **증거**: 모의 LLM 응답으로 흐름 단위 테스트

### P3-AC3: 대시보드 메트릭 노출
- **Given**: `operationsDashboard.ts` 메트릭 수집기
- **When**: 10건 발행 후 대시보드 조회
- **Then**: `hallucinationRate = (환각 판정 건수 / 총 생성 문장 수)`가 0.0~1.0 범위 숫자로 노출
- **증거**: 대시보드 화면 캡처 + 메트릭 값 로그

### P3-AC4: 오탐률 임계
- **Given**: 정상 문장 100개 샘플
- **When**: `factChecker.ts` 실행
- **Then**: 오탐(정상→환각 판정) 비율 **10% 이하**
- **증거**: 샘플 검증 로그

## 비기능 (Non-Functional) Acceptance

### NFR-AC1: 빌드 통과
- **Then**: `npm run build` 종료 코드 0, 에러 0, 경고 증가 없음(기존 대비)
- **증거**: 빌드 로그 tail

### NFR-AC2: 기존 테스트 회귀 0
- **Then**: `npx vitest run` 결과 기존 236+ 테스트 100% 통과, 신규 테스트 추가로 인한 기존 테스트 실패 없음
- **증거**: vitest 전체 로그

### NFR-AC3: 파일 크기 정책 준수
- **Then**: 모든 신규/수정 파일 **300줄 이하**, `factChecker.ts` 250줄 이하
- **증거**: `wc -l` 출력

### NFR-AC4: 언어 정책 준수
- **Then**: 신규 코드 주석 영어, 커밋 메시지 한국어(Lore 포맷), SPEC 문서 한국어
- **증거**: 코드 리뷰 + `git log` 확인

### NFR-AC5: 셀렉터 원격 패치 호환
- **Then**: 신규 댓글 셀렉터가 `src/automation/selectors/remoteUpdate.ts` 패치 경로에 포함
- **증거**: `remoteUpdate.ts` 매니페스트에 댓글 셀렉터 엔트리 존재

## Definition of Done

위 P0-AC1~P3-AC4 및 NFR-AC1~NFR-AC5 **전부**가 증거와 함께 충족되고, Feature flag를 통한 롤백 경로가 확인된 상태.

- [ ] P0-AC1~AC3 통과
- [ ] P1-AC1~AC5 통과
- [ ] P2-AC1~AC3 통과
- [ ] P3-AC1~AC4 통과
- [ ] NFR-AC1~AC5 통과
- [ ] 각 Feature flag OFF 시 회귀 없음 확인
- [ ] `hallucinationRate` 기준선 확정 (운영자 인수)
