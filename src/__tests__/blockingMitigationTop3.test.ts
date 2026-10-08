/**
 * [v2.11.135] 차단 완화 배치 1차(Top 1~3) 회귀 잠금.
 *
 * 전수 분석 결과 확정된 "멀쩡한 글을 죽이던" 3개 축:
 *  1) 사진모드: 사진 1장 추론 실패 = 글 전체 중단 (per-task catch 없음)
 *  2) 발행: 실제 요청 이미지 삽입 실패는 v2.11.327부터 부분 실패도 차단한다.
 *     실행 회귀는 nestedEditorPublishAcceptance / imageInsertionFailureRecovery 참조.
 *  3) 에이전트: bad_json/empty_output/timeout 1회로 즉시 종결 (재시도 0)
 * 사진 추론의 부분 실패 허용과 에이전트의 일시 오류 재시도 정책은 유지한다.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildAgentFailureMessage } from '../agentCli/failureMessage';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('1) 사진모드 — 부분 실패 허용', () => {
  const code = read('imageNarrative/inferenceAggregator/aggregator.ts');

  it('추론 태스크가 per-task catch로 실패 사진을 건너뛴다', () => {
    expect(code).toMatch(/EnrichedInferenceResponse \| null/);
    expect(code).toMatch(/이 사진은 건너뛰고 계속/);
  });

  it('과반 실패(성공 < max(2, 50%))일 때만 중단한다', () => {
    expect(code).toMatch(/Math\.max\(2, Math\.ceil\(images\.length \* 0\.5\)\)/);
    expect(code).toMatch(/enriched\.length < requiredSuccesses/);
  });
});

describe('3) 에이전트 — 일시 오류 1회 재시도', () => {
  it('generateWithAgent가 bad_json/empty_output/timeout/server_overloaded에 한해 1회 재시도한다', () => {
    const code = read('agentCli/index.ts');
    // [2026-09-22] 상류 529(server_overloaded)도 일시 오류 — 1회 재시도 목록에 추가(인증/쿼터는 여전히 무재시도).
    expect(code).toMatch(/RETRY_ONCE_CODES = \['bad_json', 'empty_output', 'timeout', 'server_overloaded'\]/);
    expect(code).toMatch(/attempt === 1/);
    expect(code).toMatch(/signal\?\.aborted !== true/);
  });

  it('실패 메시지가 재시도 여부를 정확히 말한다 (기능 테스트)', () => {
    expect(buildAgentFailureMessage('claude', 'bad_json')).toContain('1회 자동 재시도 후에도 실패');
    expect(buildAgentFailureMessage('gemini', 'timeout')).toContain('1회 자동 재시도 후에도 실패');
    // 인증/쿼터 오류는 여전히 무재시도 계약.
    expect(buildAgentFailureMessage('codex', 'rate_limited')).toContain('자동 재시도하지 않았습니다');
    expect(buildAgentFailureMessage('claude', 'not_logged_in')).toContain('자동 재시도하지 않았습니다');
  });
});
