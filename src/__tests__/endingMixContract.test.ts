import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-02 사장님 지적, 5번째 글] "홈판 제목은 잘 나오는데 종결어미 혼용 / 어미 다양화가 안 된다."
 *
 * 의도(그대로): 문어체와 구어체를 혼합해 리듬감을 주는 방식 ·
 *               동일 어미 반복을 피해 자연스러운 호흡을 만드는 기법 ·
 *               AI 특유의 균일한 어미 패턴을 깨는 어미 믹싱.
 * ~거든요·~잖아요·~죠는 부연·동의 유도 뉘앙스라 구어 리듬을 만들고, ~했어요/~합니다를 섞으면
 * 격식이 오르내리며 "생각하며 말하는" 느낌이 난다.
 *
 * 균일함의 뿌리는 멘토 페르소나 자체였다:
 *   · 어미 풀 9종이 전부 해요체 변주 — 풀이라면서 격식이 한 층
 *   · 격려 문장을 글자 그대로 예시로 줌("여러분도 할 수 있어요", "이거 하나만 알아도")
 *     → 5번째 글에 토씨 그대로 나왔다 (예시 은행 복사)
 *   · "여러분/우리/같이" 동행 표현 글당 3회+ → "우리 모두" 가 박힌다
 * 공통 계층(human-writing-anti-pattern)에는 이미 형태 규칙이 있었는데 페르소나의 문자 강제가 이겼다.
 *
 * 고치는 규칙은 형태다 — 어미 목록을 또 만들지 않는다.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('멘토 톤은 베낄 격려 문구와 횟수 강제를 주지 않는다', () => {
  const src = read('promptLoader.ts');
  const mentor = src.slice(src.indexOf('  mentor: {'), src.indexOf('  },', src.indexOf('  mentor: {')));

  it('글자 그대로의 격려 예시가 없다 — 있으면 그대로 본문에 나온다', () => {
    expect(mentor).not.toContain('여러분도 할 수 있어요');
    expect(mentor).not.toContain('이거 하나만 알아도');
  });

  it('동행 표현에 횟수를 강제하지 않는다', () => {
    expect(mentor).not.toMatch(/동행 표현 글당 \d+회/u);
    expect(mentor).toContain('횟수를 맞추지 않는다');
  });

  it('해요체 일색 어미 풀 대신 격식 오르내림 원칙을 준다', () => {
    expect(mentor).not.toContain('~포인트예요');
    expect(mentor).toContain('격식이 오르내리게');
    expect(mentor).toContain('한 문체로 끝까지 밀지 않는다');
  });

  it('부연·동의 어미의 자리를 말한다 — 목록이 아니라 기능', () => {
    expect(mentor).toContain('이유를 붙이거나 동의를 구하는 자리에만');
  });
});

describe('공통 계층이 격식 오르내림을 형태 규칙으로 요구한다', () => {
  const shared = read('prompts/shared/human-writing-anti-pattern.prompt');

  it('문어와 구어를 한 글 안에서 섞으라고 한다', () => {
    expect(shared).toContain('격식이 오르내려야 사람이 말하는 것처럼 읽힌다');
    expect(shared).toContain('문어(~합니다/~입니다)와');
  });

  it('부연·동의 어미의 자리를 기능으로 설명한다', () => {
    expect(shared).toContain('이유를 붙이거나');
    expect(shared).toContain('동의를 구하는 자리에서만 자연스럽다');
  });

  it('연속 동일 어미를 막는 형태 규칙이 살아 있다', () => {
    expect(shared).toContain('~합니다/~해요만 3문장 이상 연속되면');
    expect(shared).toContain('같은 어미가 연달아 왔으면 다음 문장은 다른 층으로 바꾼다');
  });
});
