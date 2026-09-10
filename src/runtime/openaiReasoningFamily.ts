// src/runtime/openaiReasoningFamily.ts
// [2026-09-10] OpenAI 추론(reasoning) 계열 판정. 의존성 없는 순수 함수.
//
// 사장님 제보(다른 툴 화면): "Unsupported parameter: 'max_tokens' is not supported with
// this model. Use 'max_completion_tokens' instead." (model=gpt-6-astra)
//
// 우리 툴은 max_tokens 문제는 없다 — contentGenerator.ts 가 이미 max_completion_tokens 를
// 쓴다. 그런데 **같은 계열의 문제**가 남아 있었다: 추론 모델 판정이
// `startsWith('gpt-5.6-')` 로 버전에 못 박혀 있어, gpt-6-astra 가 오면 검사에 걸리지 않고
// temperature + top_p 가 실려 나간다. 추론 모델은 기본값이 아닌 temperature 를 max_tokens 와
// 똑같이 거부한다(openaiVisionAdapter.ts:183 에 실측 기록).
//
// 그리고 이 경로는 실제로 도달한다 — modelRegistry 가 `gpt-` 로 시작하는 **모든** 이름을
// explicitModel 로 받아들인다.
//
// 계약: 계열을 버전에 못 박지 않는다. 새 세대가 나올 때마다 앱을 고쳐야 하는 구조를
// 만들지 않는다(에이전트 모델 목록을 열어 둔 것과 같은 이유다).

/**
 * gpt-5.6 이상 세대는 전부 추론 계열로 본다.
 *   맞음: gpt-5.6-luna · gpt-6-astra · gpt-6.1-nova · gpt-7-x
 *   아님: gpt-4o · gpt-4.1-mini · gpt-3.5-turbo
 *
 * 새 세대를 추론 계열로 **먼저 가정**하는 쪽이 안전하다. 아니었다면 temperature 를
 * 안 보내는 것뿐이라 품질 손해가 없지만, 반대로 틀리면 400 으로 글 생성이 죽는다.
 */
const REASONING_FAMILY = /^gpt-(?:5\.[6-9]|[6-9])(?:[.-]|$)/i;

export function isOpenAiReasoningModel(model: string | null | undefined): boolean {
  return REASONING_FAMILY.test(String(model ?? '').trim());
}
