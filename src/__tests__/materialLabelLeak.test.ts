import { describe, expect, it } from 'vitest';

import { findMaterialLabelLeaks, describeMaterialLabelLeaks } from '../content/materialLabelLeak';

/**
 * [2026-09-01 퍼플렉시티 실측] 자료 라벨이 본문에 그대로 실렸다.
 *
 *   "상위 글에서 정리 주기는 최소 주 1회가 기본이고…"
 *   "상위 사례에서는 가장 손이 잘 닿는 두 번째, 세 번째 칸 중 한 칸을 비워 두고…"
 *
 * 독자에게 "상위 글" 이 무엇인가. 이건 우리가 수집한 자료를 부르는 내부 명칭이다.
 * sourceAssembler 가 자료를 이렇게 감싸 넘긴다.
 *   === 상위 노출 글 본문 발췌 (사실 자료 …) ===
 *   [상위글 1 — 제목]
 * 모델은 그 라벨을 출처 이름으로 알고 인용한다.
 *
 * 검색 건수 누출과 같은 계열이다 — 도구가 자기 배관을 보여준다.
 * 사람이라면 "블로그 후기들을 보면" 이라고 쓴다.
 *
 * 경고만 낸다. 문장을 고치지 않고 발행도 막지 않는다.
 */
describe('실측 사례를 잡는다', () => {
  it('"상위 글에서" 를 잡는다', () => {
    expect(findMaterialLabelLeaks('상위 글에서 정리 주기는 최소 주 1회가 기본입니다.')).toHaveLength(1);
  });

  it('"상위 사례에서는" 도 잡는다', () => {
    expect(findMaterialLabelLeaks('상위 사례에서는 두 번째 칸을 비워 두었습니다.')).toHaveLength(1);
  });

  it('"상위 노출 글" 같은 헤더 문구도 잡는다', () => {
    expect(findMaterialLabelLeaks('상위 노출 글 본문을 보면 그렇습니다.')).toHaveLength(1);
  });

  it('참고 자료 · 수집 자료 같은 내부 표현도 잡는다', () => {
    for (const s of ['참고 자료에 따르면 그렇습니다.', '수집 자료를 보면 다릅니다.', '제공된 자료에서는 그렇습니다.']) {
      expect(findMaterialLabelLeaks(s).length).toBeGreaterThan(0);
    }
  });

  it('무엇을 고쳐야 하는지 말해준다', () => {
    const message = describeMaterialLabelLeaks(findMaterialLabelLeaks('상위 글에서 그렇습니다.')).join(' ');
    expect(message).toMatch(/상위 글/);
    expect(message).toMatch(/후기|블로그|출처/);
  });
});

describe('정상 표현은 건드리지 않는다', () => {
  it('진짜 출처 귀속은 잡지 않는다', () => {
    for (const s of [
      '삼성 안내에는 1cm 기준이 적혀 있습니다.',
      '후기에서는 이 얘기가 반복됩니다.',
      '블로그 사례에서는 다르게 나옵니다.',
      '통계에 따르면 비율이 늘었습니다.',
      '상위 노출을 노린다면 제목부터 봐야 합니다.',
    ]) {
      expect(findMaterialLabelLeaks(s)).toHaveLength(0);
    }
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(findMaterialLabelLeaks('')).toHaveLength(0);
    expect(() => findMaterialLabelLeaks(undefined as never)).not.toThrow();
  });
});
