/**
 * [v2.11.207] 이미지 없는 섹션에서 본문이 통째로 누락되던 회귀.
 *
 * 출처: 2026-08-22 사용자 진단 리포트 (v2.11.204).
 *   섹션 1은 이미지가 있어 캐럿 복구 사다리를 타고 리치 붙여넣기 성공.
 *   섹션 2는 이미지가 없어 사다리를 통째로 건너뛰었고,
 *   "editor tail caret unavailable before rich paste" → 키보드 폴백도 허공에 타이핑 →
 *   "본문 증가분 부족 (+0자)" 로 발행이 차단됐다.
 *
 * 캐럿은 이미지가 아니라 "본문을 치기 직전"에 필요하다. 사다리가 이미지 분기 안으로
 * 다시 들어가면 같은 사고가 재발하므로 위치를 소스로 못박는다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// [2026-08-23] 줄끝 정규화: rebase/fresh checkout 이 CRLF 로 체크아웃하면 아래 소스 단언이
// 실제 회귀 없이 깨진다. 검증 대상은 코드 구조지 줄끝이 아니다.
const source = readFileSync(
  resolve(__dirname, '..', 'automation', 'editorHelpers.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('섹션 본문 입력 전 캐럿 확보', () => {
  it('캐럿 복구 사다리가 이미지 분기 밖에 있다', () => {
    const imageBranchAt = source.indexOf('if (allSectionImages.length > 0) {');
    const ladderAt = source.indexOf('let bodyReady = await ensureTailTypingReady');
    const bodyTypingAt = source.indexOf('// B. 본문 타이핑');

    expect(imageBranchAt).toBeGreaterThan(-1);
    expect(ladderAt).toBeGreaterThan(-1);
    expect(bodyTypingAt).toBeGreaterThan(-1);

    // 사다리는 이미지 분기보다 뒤, 본문 타이핑보다 앞에 있어야 한다.
    expect(ladderAt).toBeGreaterThan(imageBranchAt);
    expect(ladderAt).toBeLessThan(bodyTypingAt);

    // 그리고 이미지 분기 블록이 사다리 앞에서 닫혀 있어야 한다 —
    // 분기 시작과 사다리 사이에 그 블록을 닫는 `}` 가 존재한다.
    const between = source.slice(imageBranchAt, ladderAt);
    expect(between).toContain('\n          }\n');
  });

  it('이미지 없는 섹션도 캐럿 확보 로그를 남긴다', () => {
    // 로그 문구가 이미지 전용("이미지 삽입 후")으로 고정돼 있으면
    // 사다리가 다시 이미지 분기로 들어갔다는 신호다.
    expect(source).toContain("allSectionImages.length > 0 ? '이미지 삽입 후' : '소제목 직후'");
    expect(source).toContain('본문 입력 캐럿 확보 완료');
  });

  it('사다리는 실패해도 본문 입력을 막지 않는다 (경고만)', () => {
    // 캐럿 확보 실패가 곧 발행 실패가 되면 안 된다 — 본문 입력 단계가 한 번 더 복구한다.
    const ladderAt = source.indexOf('let bodyReady = await ensureTailTypingReady');
    const bodyTypingAt = source.indexOf('// B. 본문 타이핑');
    const block = source.slice(ladderAt, bodyTypingAt);
    expect(block).not.toMatch(/throw new Error/);
    expect(block).toContain('본문 입력 단계에서 추가 복구합니다');
  });
});
