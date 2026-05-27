# SPEC-LLM-PROVIDER-WARN-2026: 본문 LLM provider OpenAI 선택 시 Tier 경고

## 1. 목적

작업 16/17이 **이미지 모델(gpt-image-1/1.5/2)** 에만 적용되어 있어 사용자가 **본문 LLM**으로 OpenAI(gpt-4o/4.1/o1/o3 등)를 선택할 때는 Tier 안내가 표시되지 않는다. 본 SPEC은 본문 LLM provider 선택 UI 모든 위치에 동일 경고 적용.

## 2. 배경

### 작업 16/17 적용 영역
- ✅ 이미지 엔진 카드(`source-option[data-value="openai-image"]`)
- ✅ 폴더 폴백 드롭다운 (`#local-folder-fallback-engine` 옵션)
- ✅ 429 발생 시 자동 모달 (이미지 생성 흐름)

### 미적용 영역 (조사 결과)

| 위치 | 파일·라인 | 현재 상태 |
|---|---|---|
| 메인 발행 본문 LLM provider | `public/index.html` (`#unified-generator` hidden + 어디 선택 UI?) | 미조사 — 분산 가능 |
| 부수 작업 모델 select | `public/index.html:4366` `#sub-work-provider` | 옵션에 `gpt-mini` 있음 — 경고 없음 |
| 환경설정 OpenAI 키 입력란 | 추정 위치 | OpenAI 키 입력 시 안내 없음 |
| 다계정 매니저 모델 선택 | `multiAccountManager.ts` (Tier별 모델 분기?) | 미조사 |
| 연속발행 모달 모델 선택 | `continuousPublishing.ts` | 미조사 |

→ **본문 LLM provider UI가 4~6곳에 분산**되어 있을 가능성. 일관 경고 추가하려면 모든 위치 파악 후 동일 패턴 적용 필요.

## 3. 작업 분리 근거

| 항목 | 작업 16/17 | 본 SPEC |
|---|---|---|
| 대상 모델 | 이미지 (gpt-image-1/1.5/2) | LLM (gpt-4o/4.1/o1/o3 등) |
| UI 위치 | 1~2곳 (이미지 설정 모달 안) | 4~6곳 분산 (메인/부수/환경/다계정/연속) |
| 변경 범위 | 단일 모듈 | 다중 모듈 (각 UI 패치) |
| 회귀 위험 | 낮음 | 中~高 (UI 분산 + 모드별 호출 흐름 다름) |

→ 별도 SPEC로 분리. UI 매핑 조사 + planner 정밀 계획 필요.

## 4. 범위

### In Scope
1. **모든 본문 LLM provider 선택 UI 매핑**:
   - 메인 풀오토 발행
   - 환경설정 → API 키 입력
   - 부수 작업 모델 select (`#sub-work-provider`)
   - 다계정 발행 모달
   - 연속발행 모달
2. **각 위치에 OpenAI 선택 시 경고**:
   - 정적 안내: 옵션 텍스트에 `⚠️ Tier1=500RPM, $50+7일 후 권장` 추가
   - 동적 안내: 첫 선택 시 작업 16의 모달 재호출 (`'precheck-llm'` 모드 추가)
3. **본문 429 에러 시 자동 모달**:
   - 본문 LLM 호출 catch에서 429 + OpenAI 키워드 → `showOpenAiTierWarningModal('rate-limit-hit')`
   - 위치: 본문 LLM 호출 함수 (anthropicLLMAdapter / openaiLLM / unified caller)

### Out of Scope (별도 SPEC)
- LLM 모델별 RPM 추적 (SPEC-OPENAI-USAGE-TRACK-2026과 통합 가능)
- Anthropic Claude Tier 안내 (별도)
- 자동 모델 폴백 (사용자 선택 존중 원칙 — silent 폴백 금지)

## 5. 제약

- **no_feature_bloat**: UI 5~6곳에 동일 경고 추가는 합리적이나, 사용자 명시 요청 없이 진행 시 옵션 과잉 위험 → 사용자 요청 시 진행
- **no_cascade_fix**: UI 분산 패치라 단계 분할 필수 (1단계: 매핑 조사, 2단계: 정적 경고, 3단계: 동적 모달)
- **surgical change**: 각 UI 위치별 인접 라인 손대지 말 것
- **언어 정책**: 한글 안내

## 6. 구현 단계 (Phase 분할)

### Phase 1: UI 매핑 조사 (research, 1일)
- 본문 LLM provider 선택 UI 모든 위치 grep + 정리
- 각 위치의 옵션 변경 패턴 분석
- 산출물: `mapping.md` (위치 + 변경 패턴 표)

### Phase 2: 정적 옵션 텍스트 경고 (1주)
- 매핑된 모든 UI 옵션에 `⚠️ Tier1=500RPM` 추가
- 패치 위치 5~6곳 동시 변경

### Phase 3: 동적 모달 호출 (3일)
- 작업 16의 `showOpenAiTierWarningModal`에 `'precheck-llm'` 모드 추가
- 헤더 텍스트: "⚠️ OpenAI LLM 선택 — Tier 시스템 적용"
- 본문 LLM 분기 핸들러에서 OpenAI 선택 첫 1회 모달

### Phase 4: 본문 429 자동 안내 (1주)
- 본문 LLM 호출 catch에 429 + OpenAI 감지 → `showOpenAiTierWarningModal('rate-limit-hit')`
- 위치: anthropicLLMAdapter / openaiLLM / 통합 caller — 정확 위치는 Phase 1 매핑 결과 의존

## 7. 회귀 검증 게이트

1. `npx vitest run` — 전체 통과 (UI 변경은 단위 테스트 영향 X 예상)
2. `npx tsc --noEmit` — 0 errors
3. 수동: OpenAI LLM 선택 5개 위치 모두에서 경고 표시 확인
4. 수동: 본문 발행 시 OpenAI 429 발생 → 모달 자동 표시

## 8. 다음 단계

1. **Phase 1 (research)**: explorer 에이전트로 본문 LLM provider 선택 UI 매핑 (1일)
2. **planner**: Phase 2~4 정밀 구현 계획
3. **executor + reviewer**: 각 Phase 순차 진행
4. SPEC-OPENAI-USAGE-TRACK-2026과 통합 가능성 검토

## 9. 우선순위

**낮음**. 본문 LLM은 보통 한 글당 1~2회 호출이라 RPM 도달 빈도가 이미지(소제목 N개)보다 낮음. 사용자 명시 요청 시 진행.

## 10. 관련

- 작업 16: OpenAI Image 카드 클릭 시 Tier 안내
- 작업 17: 이미지 429 발생 시 자동 모달
- SPEC-OPENAI-USAGE-TRACK-2026: 사용량 실시간 추적
- 본 SPEC: 본문 LLM provider 영역으로 작업 16/17 확장

## 11. 작성 메타

- 작성일: 2026-05-27
- 작성자: Claude Opus 4.7 + 사용자 위임
- 상태: **draft** (구현 미시작)
- 트리거: 사용자 "추가 가능 추가해줘" (2026-05-27) 중 "(3) gpt-image-1 본문 LLM" 부분 — 본문 LLM provider UI 분산으로 별도 SPEC 분리 결정
