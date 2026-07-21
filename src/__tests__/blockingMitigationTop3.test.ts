/**
 * [v2.11.135] 차단 완화 배치 1차(Top 1~3) 회귀 잠금.
 *
 * 전수 분석 결과 확정된 "멀쩡한 글을 죽이던" 3개 축:
 *  1) 사진모드: 사진 1장 추론 실패 = 글 전체 중단 (per-task catch 없음)
 *  2) 발행: 이미지 부분 삽입 실패 = 배치 전체 throw = 발행 중단
 *  3) 에이전트: bad_json/empty_output/timeout 1회로 즉시 종결 (재시도 0)
 * 완화 원칙: 경고+계속, 임계(과반 실패/전량 실패) 미달 시에만 중단.
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

describe('2) 발행 — 이미지 부분 삽입 실패 허용', () => {
  it('전량 실패일 때만 IMAGE_INSERTION_FAILED를 던진다', () => {
    const code = read('automation/imageHelpers.ts');
    expect(code).toMatch(/failures\.length > 0 && failures\.length >= images\.length/);
    expect(code).toMatch(/나머지로 발행을 계속합니다/);
    // 부분 실패 무조건 throw 패턴이 부활하면 안 된다.
    expect(code).not.toMatch(/if \(failures\.length > 0\) \{\s*\n\s*throw new Error\(`IMAGE_INSERTION_FAILED/);
  });
});

describe('3) 에이전트 — 일시 오류 1회 재시도', () => {
  it('generateWithAgent가 bad_json/empty_output/timeout에 한해 1회 재시도한다', () => {
    const code = read('agentCli/index.ts');
    expect(code).toMatch(/RETRY_ONCE_CODES = \['bad_json', 'empty_output', 'timeout'\]/);
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
