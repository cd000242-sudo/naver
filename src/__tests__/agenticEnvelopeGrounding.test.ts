import { describe, expect, it } from 'vitest';

import { wrapAsAgenticTask } from '../agentCli/agenticEnvelope';

/**
 * [2026-09-02 사장님 지시] "에이전트모드로해도 할루시네이션없이 잘나와야되는데"
 *
 * 에이전트 경로는 API 와 같은 prompt(자료·dateBasis 스키마)를 받고 그 위에 자율추론 봉투를 쓴다.
 * 도구는 전부 차단(--disallowedTools '*')이라 검색·검증을 못 한다. 그런데 봉투의 자기비평은
 * 문체 항목이 대부분이었고, 4단계 "수정" 에는 자료 밖 사실을 넣지 말라는 말이 없었다 —
 * 통과할 때까지 고쳐 쓰는 매 반복이 기억 속 수치·날짜·기관명을 들일 기회였다.
 *
 * 규칙은 형태다: "자료 안에 있는가" 와 "없으면 빼거나 좁힌다". 낱말 목록이 아니다.
 */

const BASE = '[목표] 침구 세탁\n[자료] 1) 세탁기 표준코스 40도';

describe('자율추론 봉투가 반복 안에서 근거를 다시 묶는다', () => {
  it.each([['homefeed'], ['seo'], ['affiliate'], ['photo'], [undefined]])(
    'mode=%s — 자기비평이 자료 대조를 요구한다',
    (mode) => {
      const out = wrapAsAgenticTask(BASE, mode as string | undefined);
      expect(out).toContain('전부 [작업 명세]의 자료 안에 있는가');
      expect(out).toContain('자료에 없는 것은 하나라도 환각이다');
      expect(out).toContain('검색이 막혀 있으니 기억으로 보태지 마라');
    },
  );

  it('수정 단계가 "빼거나 좁힌다" 를 말한다 — 채워 넣기가 아니라', () => {
    const out = wrapAsAgenticTask(BASE, 'homefeed');
    expect(out).toContain('고칠 때 자료에 없는 사실을 새로 넣지 않는다');
    expect(out).toContain('근거가 없으면 빼거나 범위를 좁힌다');
    // 되돌린 흔적 — 근거 조항 없는 옛 수정 단계 문장
    expect(out).not.toContain('4. 수정: 비평에서 찾은 문제를 고친다. 기준을 통과할 때까지');
  });

  it('원본 prompt 는 그대로 뒤에 붙는다 — 자료가 깎이지 않는다', () => {
    const out = wrapAsAgenticTask(BASE, 'seo');
    expect(out.endsWith(BASE)).toBe(true);
  });

  it('빈 prompt 는 손대지 않는다', () => {
    expect(wrapAsAgenticTask('', 'seo')).toBe('');
  });
});
