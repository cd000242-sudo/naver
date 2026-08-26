import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  describePublicReactionClaims,
  findUngroundedReactionClaims,
} from '../content/publicReactionClaim';

/**
 * [2026-08-27 Phase 1] 실측된 반응 날조 3건.
 *
 * 티파니 눈웃음 글은 원문의 직접 인용 15개를 100% 살렸다 — 사실 보존은 좋았다.
 * 그런데 원문에 없는 것을 세 군데 지어냈고, 셋 다 같은 유형이었다.
 *
 *   "이 장면이 계속 회자되는 이유라고 봐요"          원문 근거 없음
 *   "클립만 잘라서 본 분들이 앞뒤가 안 붙는다고"     원문 근거 없음
 *   "소품 하나 바꿨을 뿐인데 반응이 달라졌습니다"    인과 추정
 *
 * 인물·발언·숫자를 지어내는 것보다 눈에 덜 띄지만, 실존 인물 글에서는 더 위험하다 —
 * "여론이 이렇다"는 서술은 확인할 수 없고 당사자에게 불리하게 작동할 수 있다.
 *
 * 경고 전용이다. 발행을 막지 않는다.
 */
describe('근거 없는 반응 주장 찾기', () => {
  // 실제 크롤 자료와 같은 규모로 둔다 — 자료가 얇으면 대조할 근거가 없어 판정을 건너뛴다.
  const SOURCE = [
    '그룹 소녀시대 티파니가 유리의 눈웃음에 대해 말했다.',
    '서로 서운했던 점을 이야기하던 중, 티파니는 "유리가 내 눈웃음을 좀 특이하게 따라 해서',
    '느낌이 이상했다"라고 말해 웃음을 자아냈다.',
    '그러나 효리수 멤버들은 "되게 똑같았다"라며 똘똘 뭉친 모습을 보였고',
    '티파니는 "내가 언제 코웃음을 했냐"라며 당황해했다.',
  ].join(' ');

  it('원문에 없는 "회자된다"를 잡는다', () => {
    const found = findUngroundedReactionClaims(
      '같은 표정 하나를 두고 해석이 갈린 게 이 장면이 계속 회자되는 이유라고 봐요.',
      SOURCE,
    );
    expect(found.map((f) => f.phrase)).toContain('회자');
  });

  it('원문에 없는 "화제"를 잡는다', () => {
    const found = findUngroundedReactionClaims('이 장면은 큰 화제를 모았습니다.', SOURCE);
    expect(found).toHaveLength(1);
  });

  it('원문에 근거가 있으면 잡지 않는다 — 사실을 지우지 않는다', () => {
    const grounded = '이 장면은 큰 화제를 모았습니다.';
    const src = `${SOURCE} 해당 장면은 공개 직후 화제를 모으며 조회수가 급증했다.`;
    expect(findUngroundedReactionClaims(grounded, src)).toHaveLength(0);
  });

  it('원문에 있는 "웃음을 자아냈다"는 통과한다', () => {
    expect(findUngroundedReactionClaims('티파니의 말이 웃음을 자아냈어요.', SOURCE)).toHaveLength(0);
  });

  it('여러 건을 모두 보고한다', () => {
    const found = findUngroundedReactionClaims(
      '계속 회자되는 장면입니다. 갑론을박이 이어졌고 반응이 뜨거웠습니다.',
      SOURCE,
    );
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  it('자료가 없으면 판정하지 않는다 — 없는 근거로 경고하지 않는다', () => {
    expect(findUngroundedReactionClaims('계속 회자되는 장면입니다.', '')).toHaveLength(0);
  });

  it('빈 글은 조용하다', () => {
    expect(findUngroundedReactionClaims('', SOURCE)).toHaveLength(0);
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => findUngroundedReactionClaims(null as never, undefined as never)).not.toThrow();
  });

  it('경고 문구가 문제 표현과 위치를 함께 말한다', () => {
    const found = findUngroundedReactionClaims('이 장면이 계속 회자되는 이유라고 봐요.', SOURCE);
    const message = describePublicReactionClaims(found);
    expect(message).toContain('회자');
    expect(message).toContain('자료에');
  });

  it('문제가 없으면 빈 문구를 준다', () => {
    expect(describePublicReactionClaims([])).toBe('');
  });
});

describe('본선 배선', () => {
  const source = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf-8');

  it('사후 검증기가 반응 주장을 본다', () => {
    expect(source).toMatch(/findUngroundedReactionClaims\(/);
  });

  it('던지지 않는다 — 발행을 막을 수 없다', () => {
    expect(source).not.toMatch(/throw[^\n]{0,60}reaction/i);
  });
});
