import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-01] 사장님 지적.
 *   "스타 연예 이슈도 본인 경험보다 본인 생각이나 의견, 그리고 트렌드 이슈 쪽이면
 *    드라마 또는 예능이면 개인 생각도 개인 경험으로 포함되지 않니?"
 *
 * 맞다. 드라마를 본 것은 실존 인물을 만난 것이 아니다.
 * 시청 · 관람은 누구나 하는 1차 경험이고, 검증이 필요 없으며 날조 위험도 없다.
 *
 * 그런데 프롬프트가 그것까지 막고 있었다.
 *   human-writing-anti-pattern:36  ⛔ "제가 ~해 봤는데"
 *                            :38  ("~해 봤" 은 체험 표기)
 *   homefeed/base:115             ⛔ 제가 직접, 써보니, 가봤더니, 신청해봤는데
 *
 * "3화를 봤는데" 가 "~해 봤" 패턴에 걸린다. 모델은 지시를 지키느라 시청 소감을
 * 통째로 피하고, 이슈 글은 정보 요약만 남는다 — 네이버 D.I.A. 가 찾는
 * "본인이 실제 경험한 체험기" 에 미달한다.
 *
 * 선은 사람이 아니라 작품에 그어야 한다.
 *   ✅ 작품을 본 경험과 그에 대한 의견
 *   ⛔ 인물의 사생활 · 성격 · 의도 단정 (명예훼손 영역)
 *   ⛔ 만났다 · 관계자에게 들었다 (없는 취재원)
 */
const read = (...p: string[]) => readFileSync(resolve(__dirname, '..', ...p), 'utf-8');

describe('시청 · 관람 경험은 열어둔다', () => {
  const overlay = read('prompts', 'shared', 'human-writing-anti-pattern.prompt');

  it('허용 목록에 시청 · 관람이 있다', () => {
    expect(overlay).toMatch(/✅\s*시청/);
  });

  it('무엇이 시청 경험인지 예시로 보여준다', () => {
    expect(overlay).toMatch(/화(?:를|에서)?\s*보다가|회차|장면/);
  });
});

describe('사람에 대한 단정은 계속 막는다', () => {
  const overlay = read('prompts', 'shared', 'human-writing-anti-pattern.prompt');

  it('만났다 · 들었다는 여전히 금지다', () => {
    expect(overlay).toMatch(/만났|관계자/);
  });

  it('인물 단정과 작품 의견을 구분해 적어둔다', () => {
    expect(overlay).toMatch(/작품/);
  });
});

describe('홈피드 금지 목록이 시청까지 쓸어 담지 않는다', () => {
  it('체험 금지 목록에 시청 표현이 없다', () => {
    const line = read('prompts', 'homefeed', 'base.prompt')
      .split('\n').find((l) => l.includes('내돈내산')) ?? '';
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/봤더니.*시청|시청/);
  });
});
