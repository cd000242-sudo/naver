# v2.11.6 — 사진→글 Quick Mode 환경설정 모델 자동 반영

사용자 요청: Gemini 외 다른 글 생성 모델로도 Quick Mode 추론 가능하게.

## 증상 (이전 동작)

Quick Mode `_runQuickInference` 가 `provider: 'gemini'` 하드코딩. 사용자가 환경설정에서 OpenAI GPT-4.1 / Claude Sonnet 등을 선택해도 Quick Mode 추론은 항상 Gemini Flash로 강제됨.

## 조치

`imageNarrativeQuickMode.ts` 에 다음 추가:

- `_textKeyToVisionProvider(textKey)` 헬퍼 — modelRegistry.routeTextToVision 의 단순 미러. gemini-/openai-/claude-/perplexity- 접두사 기반 vendor 매핑.
- `_runQuickInference` 가 `window.api.getConfig()` 로 환경설정 로드 후 `primaryGeminiTextModel` (또는 `geminiModel` 폴백) 키를 매핑 함수에 전달.
- 결정된 provider 를 IPC payload 의 `provider` 필드로 전달. main 핸들러 (vision:infer-and-write) → visionRouter 가 해당 vendor adapter 호출.
- config 로드 실패 시 console.warn + Gemini Flash 기본 (silent fallback 아님 — 디폴트 모델은 사용자 PC에 무료 키 등록 가정).

## 동작 매트릭스

| 환경설정 모델 키 | Vision provider |
|---|---|
| gemini-2.5-flash / pro / lite | gemini |
| openai-gpt4o-mini / openai-gpt41 / openai-gpt4o-search | openai |
| claude-haiku / claude-sonnet / claude-opus | claude |
| perplexity-sonar | gemini (Perplexity vision 미지원) |
| 미지원 키 | gemini (안전 기본) |

`visionRouter` 내부 정책:
- gemini / openai → 직접 호출
- claude / deepinfra → Phase 1 미구현 → 자동 openai fallback (feedback_no_fallback 따라 console.warn 출력)

## 회귀 가드

- vitest 2434/2434 PASS (171 files)
- tsc --noEmit exit 0
- 변경 파일 1개 (imageNarrativeQuickMode.ts), god file 미진입

## 알려진 제한

- Claude/DeepInfra vision adapter 자체는 아직 Phase 1 미구현 — 선택해도 visionRouter에서 OpenAI로 자동 fallback. Phase 1 → Phase 2 별도 작업.
- Quick Mode UI에 "현재 vision provider: X" 표시는 추가 안 함 — Quick Mode 본질이 최소 옵션. console.log 로만 디버깅 가능.
- 환경설정 모델이 변경된 후 Quick Mode 재진입 시 자동 반영. 모달 열려있는 동안 변경 안 됨 (panel 1 진입 시 1회 로드).

## 핵심 commit

- (이번 commit) feat(image-narrative): Quick Mode 환경설정 글 생성 모델 → vision provider 자동 매핑

🐙 SPEC-IMAGE-NARRATIVE-2026 후속 enhancement
