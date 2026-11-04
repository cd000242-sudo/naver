/**
 * [2026-11-04] 사장님 목표: 글쓰기 2분대. 본문 호출 한 번이 150~204초인데 그 안에서 에이전트가 몇 턴을 돌고
 * 입력 · 출력이 몇 토큰인지 기록이 없었다(결과 텍스트만 읽고 나머지는 버림). claude -p --output-format json 봉투의
 * 통계를 한 줄로 남겨 어디서 시간이 쓰이는지 숫자로 본다. 순수 관측 — 결과 텍스트와 오류 처리는 그대로.
 */
import { describe, expect, it } from 'vitest';
import { describeClaudeEnvelopeStats } from '../agentCli/parse.js';

const envelope = (extra: Record<string, unknown>) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '본문', ...extra });

describe('describeClaudeEnvelopeStats', () => {
  it('turns, wall and API time, and token usage in one line', () => {
    const line = describeClaudeEnvelopeStats(envelope({
      num_turns: 3,
      duration_ms: 152_340,
      duration_api_ms: 140_120,
      usage: { input_tokens: 4210, cache_creation_input_tokens: 38_900, cache_read_input_tokens: 0, output_tokens: 6120 },
    }));
    expect(line).toBe('턴 3 · 전체 152.3초 · API 140.1초 · 입력 4,210 · 캐시생성 38,900 · 캐시읽기 0 · 출력 6,120 토큰');
  });

  it('only the fields the CLI printed', () => {
    expect(describeClaudeEnvelopeStats(envelope({ num_turns: 1, usage: { output_tokens: 900 } }))).toBe('턴 1 · 출력 900 토큰');
  });

  it('no stats, broken JSON or empty output → empty string (never throws)', () => {
    expect(describeClaudeEnvelopeStats(envelope({}))).toBe('');
    expect(describeClaudeEnvelopeStats('not json')).toBe('');
    expect(describeClaudeEnvelopeStats('')).toBe('');
  });
});
