import { describe, expect, it } from 'vitest';
import { snapToMaterial } from '../content/blueprint/parseBlueprint';

/*
 * [2026-09-17 생성 실측] 조여정 패션 글에 말이 중간부터 시작하는 인용이 실렸다.
 *
 *   원문 고 입체적이라, 어떤 착장을 입느냐에 따라 …
 *   원문 , 핏되는 정도에소 차이가 있었어요
 *
 * snapToMaterial 이 자료를 문자 오프셋으로 그대로 slice 했기 때문이다.
 * best.from 은 8글자 shingle 이 맞은 자리라 단어 한가운데일 수 있고,
 * 그 조각이 그대로 따옴표 안에 담겨 발행됐다.
 *
 * 이제 오프셋을 단어 경계로 맞추고 양끝 구두점을 턴다.
 * 문장 처음까지 넓히는 것은 되돌렸다 — haystack 에서 따옴표가 지워져 있어
 * 전달절("담당자는 …고 말했다")까지 인용 안으로 들어왔다(contentBlueprint.test.ts 가 잡았다).
 */
const MATERIAL = '조여정은 얼굴이 작고 입체적이라, 어떤 착장을 입느냐에 따라 비율이 꽤 다르게 보이는 편인데요. '
  + '이번에는 상의 길이와 핏되는 정도에서 차이가 있었어요. 그래서 이번에도 긴 슬랙스를 입었는데 '
  + '체형이 훨씬 더 자연스럽게 예뻐 보이면서 전체적인 밸런스도 안정적으로 보였어요.';

describe('인용은 단어 중간에서 시작하지 않는다', () => {
  it('단어 한가운데서 잘린 조각을 단어 경계로 되돌린다', () => {
    const out = snapToMaterial('고 입체적이라, 어떤 착장을 입느냐에 따라 비율이 꽤 다르게 보이는 편인데요', MATERIAL);
    // 문장 처음까지 넓히지는 않는다 — 전달절("담당자는 …고 말했다")을 인용에 넣지 않기 위해서다.
    expect(out?.startsWith('고 ')).toBe(false);
    expect(out).toContain('작고 입체적이라');
  });

  it('앞에 남은 구두점을 턴다', () => {
    const out = snapToMaterial(', 핏되는 정도에서 차이가 있었어요', MATERIAL);
    expect(out?.startsWith(',')).toBe(false);
    expect(out).toContain('핏되는 정도에서 차이가 있었어요');
  });

  it('이미 온전한 문장은 그대로 문장 끝까지 담는다', () => {
    expect(snapToMaterial('체형이 훨씬 더 자연스럽게 예뻐 보이면서 전체적인 밸런스도 안정적으로 보였어요', MATERIAL))
      .toContain('체형이 훨씬 더 자연스럽게 예뻐 보이면서');
  });
});

describe('근거 없는 문장은 여전히 거부한다', () => {
  it('자료에 없는 내용은 매칭되지 않는다', () => {
    expect(snapToMaterial('전혀 다른 문장이라 자료에 없는 내용입니다 매칭되면 안 됩니다 여기는', MATERIAL)).toBeNull();
  });

  it('너무 짧은 조각은 애초에 대상이 아니다', () => {
    expect(snapToMaterial('작고', MATERIAL)).toBeNull();
  });

  it('빈 자료에는 매칭되지 않는다', () => {
    expect(snapToMaterial('체형이 훨씬 더 자연스럽게 예뻐 보이면서', '')).toBeNull();
  });
});
