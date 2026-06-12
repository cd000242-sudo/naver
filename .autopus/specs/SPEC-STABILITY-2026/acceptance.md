# SPEC-STABILITY-2026 수락 기준 · 추적성 매트릭스

> 원칙: 모든 증상은 ① 수정 커밋 ② 재발 방지 가드 ③ 라이브 판정 기준의 3점 잠금.
> 셋 중 하나라도 비면 "고쳐졌다"고 말하지 않는다.

## 1. 추적성 매트릭스 (증상 ↔ 수정 ↔ 가드 ↔ 라이브 판정)

| ID | 증상/발견 | 수정 | 가드 테스트 | 라이브 판정 | 상태 |
|----|----------|------|------------|------------|------|
| S1 | 구분선/이전글/CTA/해시태그 꼬리 누락 | 3f271f46(구분선 보존·━복원·정제) + bb0f0850(키 입력 검증 사다리 4지점, 후킹→링크 형식) | bodyArtifactCleanup.test(7) + richPasteTailWiring.test(7) | 풀오토 1건: 꼬리 4종 표시 + `[TailOptions]` 값 정상 + `[PrePublish]` 5/5 | 코드 완료 · 라이브 대기 |
| S2 | 로그인 세션 안 유지 | d6dbe940(runPostOnly ensureServerSession 게이트) | richPasteTailWiring.test 게이트 배선 가드 | 연속 2건째 "서버 세션 유효 확인" 로그 / 쿠키 삭제 시 자동 재로그인 | 코드 완료 · 라이브 대기 |
| S2' | keepalive 활성계정 영구 skip (근본) → 세션 만료 → 재로그인 → 캡차 | (R7 완료) publishInProgress 플래그 — 발행 중에만 skip, 유휴 세션은 ping 유지 | sessionKeepalivePublishGate.test(3) + sessionKeepaliveV2 갱신 | 발행 후 유휴 15~30분, 다음 발행 시 재로그인/캡차 없이 세션 재사용 | 코드 완료 · 라이브 대기 |
| S3 | 소제목 이미지 빈 결과 (원인 불명 중단) | 787d99e6(R3 — 종단 실패 3경로 원인 기록 + 전부 실패 시 NANO_<code> throw. 429 키 로테이션은 기구현 확인) | nanoEmptyResultCause.test(4) | 의도적 실패 유발 시 로그에 NANO_<code> 원인 표시 | 코드 완료 · 라이브 대기 |
| S4 | 반자동 이미지 뒤섞임 + 이중 생성 (트리거 확정: 연속발행 생성본을 formData로 인계 안 함 → fullAutoFlow 진입부가 전역 초기화 후 전량 재생성) | fa28b451(R4-1 — imageManagementImages 정식 인계 + single-flight 명시 거부) + a37a7bf2(R4-2 — 이중 신호 리매핑 + 매칭 실패 폴백 금지) | imageDoubleGenerationGuard.test(5) | run # 중복 0 / 반자동 10건 뒤섞임 0 / 글당 이미지 생성 1회(비용 절반) | 코드 완료 · 라이브 대기 |
| S5 | 풀오토 썸네일 이미지관리 공란 | 819cf634(R5 — 썸네일 정본 키 등록 + 웹 URL 로컬 저장 + sync 키 폴백 + 그리드 대체소스 1회) | thumbnailSlotRegistration.test(4) | 풀오토 발행 후 이미지관리 첫 슬롯 썸네일 표시 | 코드 완료 · 라이브 대기 |
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
| S18 | 모바일 가독성 — 쉼표 시작 줄/단어 중간 절단/빈 줄 낀 표 원문 노출 | 35bc3c67(줄나눔 재설계: 구두점 소비+공백 후퇴+외톨이 병합+22자 폭, 표 행 스티칭) | richTextPaste.test 가독성 계약(5) | 발행물 모바일 실측을 사용자 레퍼런스와 비교 | 코드 완료 · 라이브 대기 |
| S18-2 | 표 뒤 외톨이 파이프 행(헤더/구분자 없는 단독 콜아웃) 원문 노출 — 6/12 발행물 실측 | 3abe6b04(파이프 전용 블록 → "첫셀 — 나머지" 문장 변환 + 떠돌이 구분자 제거) | richTextPaste orphan(3) | 동일 패턴 글 재발행 시 파이프 0 + "판단 — ..." 문장 렌더 | 완료 — 라이브 224314042809: 파이프 0 · 잔재 0 · 표 3개 정상 (6/12) |
| S18-3 | 표 미생성(프롬프트 자기모순 "마크다운 금지" + 휴머나이저 표 분쇄 + 형식예시 보일러플레이트 복사) — 발행물 5건 실측 표 0 | c9ff7aaa+5a1ca07e+07d7b17c+01f4a5d9(항목화 주제 표 필수 강제조건 승격 + 금지 범위 JSON 밖 한정 + humanize 표 행 placeholder 격리 + 예시 헤더 제거) | contentModePromptContracts(5) + contentHumanizationGuard(1) + richTextPaste orphan/boilerplate(9) | 항목화 주제 발행 시 표 1개 이상 + 잔재 0 | 완료 — 라이브 224314042809: 표 3개 렌더 (6/12) |
| R8 | 에러 삼킴 A-1/A-2 — 카테고리 실패 시 암묵 기본값 발행 | 550f177d(침묵 5경로 → CATEGORY_* 명시 중단, allowCategoryFallback 옵트인) | categoryFailureGate.test(3) | 의도적 오설정 카테고리 발행 시 사유와 함께 중단 | 코드 완료 · 라이브 대기 |
| R11 | 에러 삼킴 A-3/A-4 — 발행→임시저장 silent 전환(3경로) + 발행 미확인 성공 통과 | 16f37e75(PUBLISH_BUTTON_NOT_FOUND 중단 + PUBLISH_UNCONFIRMED 명시 실패 + 이중발행 재시도 금지) | publishConfirmIntegrity.test(3) | 정상 발행 무회귀 + 미확인 시 자동 재발행 0 | 코드 완료 · 라이브 대기 |
| R6 | 반쪽 발행 구조 차단 (관찰→차단 전환) | 0cbe0042(결정적 4검사 차단: body/image/marker/hashtag — PRE_PUBLISH_BLOCKED, 서버 의존 2검사는 관찰 유지, prePublishObserveOnly 비상해제) | prePublishAssertion.test R6(2) | 정상 발행 무차단 + 의도적 누락 시 차단 / 오탐 발생 시 즉시 관찰 강등 | 라이브 누적 — 6/6 통과 ×5 + 관찰항목(link-card) 정탐 1건 발행 진행 (오탐 0, 6/12) |
| R12 | 허용된 침묵 실패의 빈도 비가시 | da5a2735(silentFailureCounter + 대표 지점 배선 + 발행 진입 요약 로그) + 28f0baec(운영 대시보드 silentFailures 스냅샷/요약 배선) | silentFailureCounter.test(3) + operationsDashboard.test R12(3) | [SilentFailures] 요약 라인 출력 + 대시보드 요약에 "침묵실패: key×n" 표시 | 코드 완료 · 라이브 대기 |

## 2. 릴리즈 공통 게이트 (모든 출고 전)

1. vitest 전체 0 fail (현재 2,906개) — 1 fail도 출고 불가
2. lint 0 errors / build + 번들 검증 통과
3. `npm run self-test` 통과 (6.3 확장: 모의 smoke + 실부팅 + 번들 헬스 + IPC 핸드셰이크 5종 — 6/12 PASS 실측)
4. 라이브 하네스 PASS (`npm run harness:tail [fullauto|continuous|multi]`, ~1분, 로그인 프로필 재사용 — 6.5 게이트화 + 런북 문서화 완료)
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
