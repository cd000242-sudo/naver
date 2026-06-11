# SPEC-STABILITY-2026 수락 기준 · 추적성 매트릭스

> 원칙: 모든 증상은 ① 수정 커밋 ② 재발 방지 가드 ③ 라이브 판정 기준의 3점 잠금.
> 셋 중 하나라도 비면 "고쳐졌다"고 말하지 않는다.

## 1. 추적성 매트릭스 (증상 ↔ 수정 ↔ 가드 ↔ 라이브 판정)

| ID | 증상/발견 | 수정 | 가드 테스트 | 라이브 판정 | 상태 |
|----|----------|------|------------|------------|------|
| S1 | 구분선/이전글/CTA/해시태그 꼬리 누락 | 3f271f46(구분선 보존·━복원·정제) + bb0f0850(키 입력 검증 사다리 4지점, 후킹→링크 형식) | bodyArtifactCleanup.test(7) + richPasteTailWiring.test(7) | 풀오토 1건: 꼬리 4종 표시 + `[TailOptions]` 값 정상 + `[PrePublish]` 5/5 | 코드 완료 · 라이브 대기 |
| S2 | 로그인 세션 안 유지 | d6dbe940(runPostOnly ensureServerSession 게이트) | richPasteTailWiring.test 게이트 배선 가드 | 연속 2건째 "서버 세션 유효 확인" 로그 / 쿠키 삭제 시 자동 재로그인 | 코드 완료 · 라이브 대기 |
| S2' | keepalive 활성계정 영구 skip (근본) → 세션 만료 → 재로그인 → 캡차 | (R7 완료) publishInProgress 플래그 — 발행 중에만 skip, 유휴 세션은 ping 유지 | sessionKeepalivePublishGate.test(3) + sessionKeepaliveV2 갱신 | 발행 후 유휴 15~30분, 다음 발행 시 재로그인/캡차 없이 세션 재사용 | 코드 완료 · 라이브 대기 |
| S3 | 소제목 이미지 빈 결과 (원인 불명 중단) | R3 예정 (null 삼킴 → 구조화 에러) — 사용자 측 dropshot 로그인 원인 1건은 해소 | R3 가드 예정 | 실패 시 로그에 원인 코드(쿼터/세션/429) 표시 | 대기 |
| S4 | 반자동 이미지 뒤섞임 + 이중 생성 — 6/11 연속발행(deepinfra)에서 2차 실측: 같은 글 [1/1]×8 개별 생성 직후 [1/7] 배치 재생성(글당 2배) | 48cde1ed(run#+호출자 계측) → R4 예정(single-flight+키 매핑) | continuousImageFailFast.test 일부 + R4 가드 예정 | run # 중복 0 / 반자동 10건 뒤섞임 0 | 계측 완료 · 본수정 대기 (research.md §F) |
| S5 | 풀오토 썸네일 이미지관리 공란 | R5 예정 (로컬 저장 등록 + 키 폴백) | R5 가드 예정 | 발행 후 이미지관리 첫 슬롯 표시 | 대기 |
| S6 | "세팅 안 했는데 썸네일만" (연속/다중계정) | e4a42bbe(레거시 키 격리 + 모드 동기화) | thumbnailOnlyScope.test(2) | 연속발행에서 소제목 이미지 정상 생성 | 코드 완료 · 라이브 대기 |
| S7 | 수집만 무한, 발행 0 | c9fcebda(대기 상한 + 연속 실패 차단기 + 수집 이미지 존중) | continuousImageFailFast.test(5) | 이미지 2글 연속 실패 시 "⛔ 연속발행 중단" 표출 | 코드 완료 · 라이브 대기 |
| N1 | blob/migration/recovery IPC 전멸 → localStorage 폭발·글 목록 저장 실패 | 13b29f9a(main.ts 직접 배선) | ipcWiringGuards.test(2) | 콘솔에서 blob:hasMany 에러 소멸 + NUCLEAR CLEANUP 미발생 | 코드 완료 · 라이브 대기 |
| N9 | 발행 후 글 백업 저장 시 quota 초과 → NUCLEAR CLEANUP 반복 | (근본=R5) normalizeImageForStorage가 previewDataUrl에 base64(data:) 인라인 저장 — 글당 수MB. blob 이관(R5/Phase8)으로 처리 | — | NUCLEAR CLEANUP 빈도 측정 → migration:imageModelV1 dry-run 규모 확인 | 진단 완료 · R5 대기 (NUCLEAR CLEANUP이 글 목록 보존하므로 데이터 손실 없음) |
| S9 | 추천글/다음글 같은 링크 2개 (CTA 미추가인데) | e(다음 커밋)(자동 관련글 opt-in 전환 — 기본 OFF) | autoRelatedLinkOptIn.test(2) | 풀오토 발행 시 이전글 엮기 링크 1개만 | 코드 완료 · 라이브 대기 |
| S10 | progress 모달에 이전 발행 이미지 잔존 | (다음 커밋)(reset()에서 clearImages() 호출) | — (DOM 부수효과) | 새 발행 시작 시 이미지 그리드 빈 상태 | 코드 완료 · 라이브 대기 |
| N2 | 붙여넣기 직후 키보드 입력 사망 (간헐) | bb0f0850(ensureTailTypingReady — 라이브 사다리 복구 실측) | richPasteTailWiring.test | `⌨️ 키보드 입력 확인` 로그 + 꼬리 정상 | 라이브 1회 검증됨 |
| N3 | 좌표 클릭이 본문 중간에 꼬리 삽입 | bb0f0850(클릭 제거, 끝캐럿 정밀클릭 최후수단화) | richPasteTailWiring(클릭 부재 가드) + 하네스 꼬리위치 검사 | 하네스 "꼬리 위치(본문 뒤)" PASS | 라이브 검증됨 |
| N7 | 꼬리가 마지막 문단 "앞"에 삽입 (마무리 별도 붙여넣기 시) | (다음 커밋)(root-end 우선 + 센티넬 probe로 문서끝 검증 + 텍스트블록 클릭) | richPasteTailWiring(root-end/sentinel/endsWith 가드) | 하네스 마무리-별도-붙여넣기 시나리오 "꼬리 위치 PASS" 2회 재현 | 라이브 검증됨 |
| N8 | 이전글 URL→링크카드 변환 간헐 실패 | (다음 커밋)(URL 입력 후 600ms 인식 대기 후 트리거 Enter) | — (네이버 서버 의존, 100% 보장 불가) | 새 URL 1회 발행 시 카드 생성 — 앱엔 waitForLinkCard 15초 polling, 실패해도 URL 텍스트 잔존 | 부분 — 동일 URL 반복 테스트로 억제 의심, 실발행 재확인 |
| N4 | 네이버 에디터 개편 (se-main-container 제거) | 하네스 프레임 탐색 수정 — 앱 셀렉터 전수 정비는 R6 전후 | 하네스가 조기경보 역할 | 하네스 1분 실행 PASS | 부분 대응 |
| N5 | 기준선 테스트 상시 1 fail | f6bcb1d2(costInvariants 정상화) | suite 0 fail 자체가 가드 | — | 완료 |
| 기존 | 발행 직전 검증 부재 (반쪽 발행) | 6c2a0b77(Pre-publish Assertion 관찰 모드) → R6 차단 전환 | prePublishAssertion.test(10) | `[PrePublish] N/5` 로그 표시 → 오탐 데이터 수집 | 관찰 모드 가동 |
| S8 | 연속발행 상세설정 글톤 구버전 (2026 신규 5종 누락) | 톤 카탈로그 동기화 — continuous-modal 12종+레거시 호환 3종, 표시 맵 2곳 | toneCatalogParity.test(5) — 통합 목록과 어긋나면 RED | 상세설정 모달에 신뢰/교육 그룹 표시 | 코드 완료 · 라이브 대기 |
| N6 | 다중계정 계정 편집 모달(ma-edit-*) HTML 부재 — JS 배선만 존재(죽은 UI) | 후속 R 배정 필요 (모달 복원 or 배선 제거 결정) | — | — | 발견 · 대기 |
| S11 | DeepInfra 이미지가 키워드와 무관한 인물 사진 (한국어 전용 프롬프트 → strip 후 빈 프롬프트) | 83691ad9(englishPrompt 한국어 검증 + 빈손 시 AI 번역 복구, promptSafety.ts 신설) | promptSafetyGuard.test(6) | 동일 키워드 재발행 시 "🔤 AI 번역 복구" 로그 + 주제 연관 이미지 (빈 프롬프트 API 호출 0) | 코드 완료 · 라이브 대기 |
| S12 | 연속발행 중지한 키워드, 재시작 시 건너뜀 | c6c77452(재시작 복구 필터에 cancelled 추가) | continuousCancelledResume.test(2) | 중지→재시작 시 중지했던 키워드부터 재개 ("다시 시도합니다" 토스트) | 코드 완료 · 라이브 대기 |
| S13 | 꼬리(구분선/CTA/해시태그) 에디터엔 존재·발행물에서 통째 소실 — root-end 캐럿이 컴포넌트 모델 밖(7488c0e2 회귀, 발행물 224312474175 실측) | 96fbcf2b(컴포넌트 내부 캐럿 + probe inModel 검증 + PrePublish CTA/해시태그 그물) | richPasteTailWiring.test(+4) | 연속발행 1건 발행물(모바일 페이지)에서 꼬리 4종 실물 확인 + hashtag-presence 체크 가동 | 코드 완료 · 라이브 대기 |
| S14 | Flow 연속 타임아웃 — 생성은 성공했는데 감지 실패 + 오류 카드(다시 시도) 미대응 + 이전 생성분 오인(2초 가짜 감지=뒤섞임) | (커밋)(에러 카드 자동 재시도 2회+FLOW_GENERATION_ERROR 즉시 표출 + UUID 기반 신규 판별) | flowDetectionGuards.test(2) + continuousImageGenerationSafety 갱신 | Flow 연속발행에서 타임아웃율 급감 + "다시 시도 자동 클릭" 로그 동작 + 글당 이미지가 해당 글 생성분 | 코드 완료 · 라이브 대기 |

## 2. 릴리즈 공통 게이트 (모든 출고 전)

1. vitest 전체 0 fail (현재 2,906개) — 1 fail도 출고 불가
2. lint 0 errors / build + 번들 검증 통과
3. `npm run self-test` 통과
4. 라이브 하네스 PASS (~1분, 로그인 프로필 재사용)
5. 패키징 후 실발행 스모크: 풀오토 1건 → 발행물 7항목 검수(제목/본문/구분선/이전글카드/CTA/이미지 순서/썸네일)
6. 본인 계정 1일 운용 → 공개 / 이전 버전 롤백 링크 상시 유지
7. 커밋 단위 = 1목적 (bisect 가능), Lore 형식

## 3. 플로우별 라이브 체크리스트 (다음 검증 세션용)

### 풀오토 단일
- [ ] 꼬리 4종(━구분선/후킹+링크카드/해시태그) 발행물 표시
- [ ] 로그: `[TailOptions] 이전글=O / CTA n / 해시태그 n` + `[PrePublish] 5/5` + `⌨️ 키보드 입력 확인`
- [ ] 소제목(heading-N) CTA 위치 지정 시 해당 소제목 아래 삽입
- [ ] 이미지관리 썸네일 슬롯 (S5 — 수정 전이므로 현상 기록만)

### 연속발행 (2건)
- [ ] 소제목 이미지 정상 생성 (썸네일만 오진 소멸)
- [ ] 이미지 실패 유발 시 2글째에서 "⛔ 연속발행 중단" 표출 (조용한 무한 수집 소멸)
- [ ] 2건째 로그 "서버 세션 유효 확인"

### 다중계정
- [ ] 계정별 이미지 정상 생성/배치
- [ ] run # 태그가 글당 1개만 (이중 생성 소멸 확인 — 재발 시 caller 로그 수집)

## 4. SPEC 종결 조건

spec.md §5의 [견고]/[안정]/[플로우 독립]/[빠르고 쾌적] 체크박스 전부 + 위 매트릭스 "상태" 열 전부 "완료" + 연속 2주 신규 회귀 0건.
