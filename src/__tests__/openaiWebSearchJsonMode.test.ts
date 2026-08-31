import { describe, expect, it } from 'vitest';

import { buildOpenAiSearchResponseParams } from '../openaiResponses';

/**
 * [2026-09-01 라이브 로그] GPT-5.6 웹 검색이 400 으로 거절당했다.
 *
 *   원본 오류: Web Search cannot be used with JSON mode.
 *
 * buildOpenAiSearchResponseParams 가 둘을 함께 보내고 있었다.
 *   tools: [{ type: 'web_search' }]
 *   text:  { format: { type: 'json_object' } }   <- JSON 모드
 *
 * OpenAI 는 이 조합을 받지 않는다. 이 기능은 한 번도 동작한 적이 없다 —
 * 화면에는 선택지로 떠 있었고, 고르면 매번 400 이었다.
 *
 * JSON 모드를 뺀다. 프롬프트가 이미 JSON 을 요구하고 있고, 다른 엔진들도
 * 응답 텍스트에서 JSON 을 파싱해 쓴다. 구조화 강제만 서버에서 클라이언트로 옮기는 셈이다.
 *
 * 진단이 이렇게 빨리 끝난 것은 에러 메시지에 "원본 오류" 줄이 있었기 때문이다.
 * 그 줄이 없었으면 파라미터를 하나씩 지우며 찾아야 했다.
 */
const params = () => buildOpenAiSearchResponseParams({
  model: 'gpt-5.6-terra',
  system: '너는 블로그 작가다.',
  user: '가을 환절기 비염 글을 써라.',
  maxOutputTokens: 4000,
});

describe('웹 검색과 JSON 모드를 함께 보내지 않는다', () => {
  it('web_search 툴이 붙어 있다', () => {
    expect(JSON.stringify(params().tools)).toContain('web_search');
  });

  it('JSON 모드를 함께 보내지 않는다 — OpenAI 가 거부한다', () => {
    expect(JSON.stringify(params().text ?? {})).not.toContain('json_object');
  });

  it('나머지 파라미터는 그대로 둔다', () => {
    const p = params();
    expect(p.model).toBe('gpt-5.6-terra');
    expect(p.instructions).toBe('너는 블로그 작가다.');
    expect(p.input).toBe('가을 환절기 비염 글을 써라.');
    expect(p.max_output_tokens).toBe(4000);
    expect(p.store).toBe(false);
  });
});
