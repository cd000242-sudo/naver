/** [2026-09-06] 제목 약속 미이행 재생성 배선 — god file 소스 핀. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf8');

describe('제목 약속 미이행 → 재생성 1회', () => {
  it('유료 보정 허용·1회 가드·시도 상한 안에서만, 바닥 판정은 titleAnswerRetry 가 맡는다', () => {
    expect(source).toContain("import { TITLE_ANSWER_RETRY_FLOOR, buildTitleAnswerRetryInstruction, shouldRetryForTitleAnswer } from './content/titleAnswerRetry.js';");
    expect(source).toContain('let _titleAnswerRetryUsed = false;');
    expect(source).toContain('if (allowPaidPostGenerationRepair && !_titleAnswerRetryUsed && attempt < QUALITY_ATTEMPT_LIMIT) {');
    expect(source).toContain('if (shouldRetryForTitleAnswer(_ta)) {');
    expect(source).toContain('[TitleAnswer] 🔁 제목 약속 미이행 — 재생성 1회');
  });
  it('재생성이지 차단이 아니다 — continue 로 같은 attempt 를 이어가고 throw 하지 않는다', () => {
    const at = source.indexOf('if (shouldRetryForTitleAnswer(_ta)) {');
    const chunk = source.slice(at, at + 1200);
    expect(chunk).toContain('continue; // 같은 attempt 카운트 보존');
    expect(chunk).not.toMatch(/throw new/);
  });
});

describe('[2026-09-07] 최종 게이트의 후보 교체는 본문이 갚는 제목만', () => {
  it('후보를 점수 매기기 전에 bodyKeepsPromise 로 거르고, 바닥은 titleAnswerRetry 의 상수를 쓴다', () => {
    expect(source).toContain("import { TITLE_ANSWER_RETRY_FLOOR, buildTitleAnswerRetryInstruction, shouldRetryForTitleAnswer } from './content/titleAnswerRetry.js';");
    expect(source).toContain('.filter((t: string) => t.length > 0 && t !== finalContent.selectedTitle)\n          .filter(bodyKeepsPromise);'.replace('\n', source.includes('\r\n') ? '\r\n' : '\n'));
    expect(source).toContain('if (ta.answerRate >= TITLE_ANSWER_RETRY_FLOOR) return true;');
    expect(source).toContain('[FinalQualityGate] 후보 제외 — 본문이 약속을 안 갚음');
    // 약속을 뽑을 수 없는 제목은 막지 않는다 — 짧은 제목을 전부 떨어뜨리면 교체 경로가 죽는다.
    expect(source).toContain('if (!ta.checked) return true;');
  });
});
