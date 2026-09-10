/**
 * SPEC-EVENT-RETRIEVAL-2026 Phase 2 (순수 함수) — 자료 부족 감지 · 키워드 분해 · 다리 엔티티.
 *
 * 사장님 지적: "황금키워드는 보통 검색량은 올라오는데 정확히 그 키워드를 제목으로 다룬
 * 문서가 아직 적은 상태잖아. 이때 자동화가 그대로 검색해서 상위 문서를 긁으면, 관련
 * 자료가 부족하니까 모델이 주변에 있는 서로 다른 기사를 억지로 하나의 이야기로 조립해."
 *
 * 사람의 검색은 이렇게 간다:
 *   김서현 류현진 평행이론 → 왜 이런 검색어가 생겼지? → 김서현+류현진+플레이오프
 *   → 류현진+김영웅 홈런 → 김서현+김영웅 홈런 → 날짜 비교
 *   → 아, 이틀 연속 김영웅에게 스리런 맞은 게 핵심이구나
 *
 * 이 파일은 그 세 단계를 순수 함수로 잠근다. 이번 커밋은 **배선하지 않는다** —
 * 함수만 있고 아무도 부르지 않으므로 동작이 변하지 않는다.
 *
 * 중요: 키워드의 엔티티는 NER 이 필요 없다. 키워드는 사용자가 준 짧은 문자열이라
 * 띄어쓰기로 갈리기 때문이다("김서현 류현진 평행이론" → 김서현/류현진/평행이론).
 * Phase 0 이 막혔던 것은 **자료 본문**에서 인물을 뽑는 일이었지 키워드가 아니다.
 */
import { describe, it, expect } from 'vitest';
import {
  keywordEntities,
  decomposeKeyword,
  detectThinMaterial,
  findBridgeCandidates,
} from '../content/thinMaterialExpansion';

const SEP = '\n\n---\n\n';

describe('keywordEntities — 키워드를 엔티티로 가른다 (NER 불필요)', () => {
  it('띄어쓰기로 가른다', () => {
    expect(keywordEntities('김서현 류현진 평행이론')).toEqual(['김서현', '류현진', '평행이론']);
  });

  it('한 글자·조사성 꼬리는 버린다', () => {
    expect(keywordEntities('제주 도 가볼만한곳 은')).toEqual(['제주', '가볼만한곳']);
  });

  it('중복은 한 번만', () => {
    expect(keywordEntities('김서현 김서현 홈런')).toEqual(['김서현', '홈런']);
  });

  it('빈 키워드는 빈 배열', () => {
    expect(keywordEntities('   ')).toEqual([]);
  });
});

describe('detectThinMaterial — 자료가 마른 키워드인가', () => {
  const rich = [
    '김서현 류현진 평행이론이 화제다. 두 선수 모두 김영웅에게 맞았다.',
    '김서현과 류현진의 평행이론, 팬들이 비교하고 있다.',
    '류현진 김서현 평행이론 정리.',
  ].join(SEP);

  it('엔티티 2개 이상을 동시에 담은 문서가 충분하면 부족이 아니다', () => {
    expect(detectThinMaterial(rich, '김서현 류현진 평행이론').thin).toBe(false);
  });

  it('주변 자료만 있으면 부족으로 판정한다 (실측 사례)', () => {
    const thin = [
      '류현진 평행이론에 대한 이야기.',
      '송영진이 151km를 던졌다.',
      '김서현 플레이오프 등판 기록.',
    ].join(SEP);
    const r = detectThinMaterial(thin, '김서현 류현진 평행이론');
    expect(r.thin).toBe(true);
    expect(r.matchedDocs).toBeLessThan(r.requiredDocs);
  });

  it('키워드 엔티티가 2개 미만이면 판정하지 않는다 — 분해할 것이 없다', () => {
    expect(detectThinMaterial(rich, '평행이론').thin).toBe(false);
  });

  it('자료가 아예 없으면 부족이다', () => {
    expect(detectThinMaterial('', '김서현 류현진 평행이론').thin).toBe(true);
  });

  it('판정 근거를 돌려준다 — 숫자 없이 "부족" 이라고만 하면 조정할 수가 없다', () => {
    const r = detectThinMaterial(rich, '김서현 류현진 평행이론');
    expect(r.totalDocs).toBe(3);
    expect(typeof r.matchedDocs).toBe('number');
    expect(typeof r.requiredDocs).toBe('number');
  });
});

describe('decomposeKeyword — 엔티티 조합으로 2차 질의를 만든다', () => {
  it('두 개씩 짝지어 만든다', () => {
    const q = decomposeKeyword('김서현 류현진 평행이론');
    expect(q).toContain('김서현 류현진');
    expect(q).toContain('김서현 평행이론');
    expect(q).toContain('류현진 평행이론');
  });

  it('원래 키워드는 다시 넣지 않는다 — 이미 검색했다', () => {
    expect(decomposeKeyword('김서현 류현진')).not.toContain('김서현 류현진');
  });

  it('키워드 안의 낱말만 쓴다 — 바깥 낱말을 지어내지 않는다', () => {
    for (const q of decomposeKeyword('김서현 류현진 평행이론')) {
      for (const word of q.split(' ')) {
        expect('김서현 류현진 평행이론').toContain(word);
      }
    }
  });

  it('질의 수에 상한이 있다 — 무한 확장 금지', () => {
    const many = decomposeKeyword('가가가 나나나 다다다 라라라 마마마 바바바');
    expect(many.length).toBeLessThanOrEqual(6);
  });

  it('엔티티가 하나뿐이면 분해하지 않는다', () => {
    expect(decomposeKeyword('평행이론')).toEqual([]);
  });
});

describe('findBridgeCandidates — 서로 다른 엔티티를 잇는 말을 찾는다', () => {
  it('실측 사례: 김영웅이 다리로 잡힌다', () => {
    const docs = [
      '김서현은 10월 22일 김영웅에게 스리런을 맞았다. 김영웅의 타격감이 좋다.',
      '류현진도 김영웅에게 스리런을 허용했다. 김영웅이 이틀 연속 홈런을 쳤다.',
    ];
    const bridges = findBridgeCandidates(docs, ['김서현', '류현진', '평행이론']);
    expect(bridges[0]).toBe('김영웅');
  });

  it('키워드에 이미 있는 말은 다리가 아니다', () => {
    const docs = ['김서현 류현진 이야기 김서현', '류현진 김서현 비교 류현진'];
    expect(findBridgeCandidates(docs, ['김서현', '류현진'])).not.toContain('김서현');
  });

  it('한 문서에만 나오는 말은 다리가 아니다 — 이어주지 못한다', () => {
    const docs = [
      '김서현은 김영웅에게 맞았다. 김영웅 김영웅.',
      '류현진은 다른 경기를 했다. 송영진 송영진 송영진.',
    ];
    expect(findBridgeCandidates(docs, ['김서현', '류현진'])).not.toContain('송영진');
  });

  it('문서가 2개 미만이면 다리를 찾지 않는다', () => {
    expect(findBridgeCandidates(['김서현 김영웅 김영웅'], ['김서현', '류현진'])).toEqual([]);
  });

  it('상한이 있다', () => {
    const docs = [
      '가가가 나나나 다다다 라라라 마마마 김서현 가가가 나나나 다다다 라라라 마마마',
      '가가가 나나나 다다다 라라라 마마마 류현진 가가가 나나나 다다다 라라라 마마마',
    ];
    expect(findBridgeCandidates(docs, ['김서현', '류현진']).length).toBeLessThanOrEqual(3);
  });
});
