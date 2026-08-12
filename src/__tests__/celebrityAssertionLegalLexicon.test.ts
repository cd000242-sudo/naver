/**
 * 실존인물 단정 가드 — 재판 진행 중 사건 어휘 보강 (2026-08-12 실측)
 *
 * 사용자가 에이전트 모드로 뽑은 황정민 스토킹 재판 글을 외부 팩트체크에 돌린 결과,
 * 지적된 문장이 전부 한 유형이었다 — **재판부보다 반 발 먼저 결론을 내림**.
 * 그런데 가드는 하나도 발동하지 않았다. 코드를 열어보니 이유가 둘이었다.
 *
 *   1) CRIME_NOUNS 에 '스토킹'이 없다 → 위험명사가 없으니 애초에 검사 대상이 아니다
 *   2) ASSERTION_RE 에 '증명·입증·방증'이 없다 → 재판 문맥에서 가장 위험한 단정어가 무방비
 *      연예 가십 어휘(구속·시인·자백)는 촘촘한데 법정 어휘만 통째로 비어 있었다.
 *
 * 1심 선고 전에 "법정에서 증명됐다"고 쓰면 피고인 측 권리침해 신고 사유가 된다.
 * 후킹을 죽이지 않고 단정만 덜어내는 것이 목표라, 탐지는 경고(legalRisk)로만 쓴다.
 */
import { describe, expect, it } from 'vitest';
import { buildCelebrityFactGuardBlock, isRiskyAssertionSentence } from '../content/celebrityAssertionSanitizer';

describe('재판 진행 중 사건의 확정 단정을 잡는다', () => {
  it('"법정에서 증명됐다" — 선고 전인데 증명됐다고 못박는 문장', () => {
    expect(isRiskyAssertionSentence(
      '스토킹 괴롭힘이 이어졌다는 사실이 법정에서 고스란히 증명된 셈이죠.',
    )).toBe(true);
  });

  it('"입증됐다" 도 같은 유형이다', () => {
    expect(isRiskyAssertionSentence('스토킹 혐의가 재판에서 입증됐습니다.')).toBe(true);
  });

  it('"방증" — 잠정조치를 유죄의 근거로 읽게 만드는 표현', () => {
    expect(isRiskyAssertionSentence(
      '세 차례 잠정조치는 스토킹 행위가 심각했다는 강력한 방증이네요.',
    )).toBe(true);
  });

  it('과거형이 아닌 활용형도 잡는다 — 드러나고 / 밝혀지면서', () => {
    expect(isRiskyAssertionSentence('스토킹 범죄의 실체가 드러나고 있습니다.')).toBe(true);
    expect(isRiskyAssertionSentence('스토킹 정황이 밝혀지면서 충격을 줬습니다.')).toBe(true);
  });

  it('스토킹·협박이 위험명사로 등록돼 있다', () => {
    expect(isRiskyAssertionSentence('스토킹 혐의가 사실로 확인됐습니다.')).toBe(true);
    expect(isRiskyAssertionSentence('협박 행각이 드러났다.')).toBe(true);
  });
});

describe('오탐 방어 — 안전한 표현까지 잡으면 못 쓴다', () => {
  it('제시·주장 단계로 쓴 문장은 잡지 않는다 — 이게 권장 표현이다', () => {
    expect(isRiskyAssertionSentence(
      '공판에서 스토킹 관련 정황과 자료가 제시됐습니다.',
    )).toBe(false);
    expect(isRiskyAssertionSentence(
      '검찰은 스토킹 혐의로 벌금 1000만원을 구형했습니다.',
    )).toBe(false);
  });

  it('증명서·서류 문맥의 "증명"은 잡지 않는다', () => {
    expect(isRiskyAssertionSentence('스토킹 피해 사실 증명서를 발급받았습니다.')).toBe(false);
  });

  it('무죄·해명 문맥은 그대로 통과시킨다', () => {
    expect(isRiskyAssertionSentence(
      '스토킹 혐의는 사실무근이라고 밝혀지면서 무죄가 선고됐습니다.',
    )).toBe(false);
  });

  it('극중·작품 문맥은 통과시킨다', () => {
    expect(isRiskyAssertionSentence(
      '드라마 극중에서 스토킹 범인의 정체가 드러나고 있습니다.',
    )).toBe(false);
  });

  it('위험명사가 없으면 단정어만으로는 잡지 않는다', () => {
    expect(isRiskyAssertionSentence('맛집의 진가가 드러나고 있습니다.')).toBe(false);
    expect(isRiskyAssertionSentence('효과가 입증됐습니다.')).toBe(false);
  });
});

/**
 * 생성 억제 — 탐지는 사후이고, 애초에 안 쓰게 만드는 쪽이 싸다.
 * 다만 "쓰지 마라"만 주면 글이 밋밋해지므로 대체 표현을 함께 준다.
 */
describe('프롬프트가 재판 문맥 단정을 미리 막는다', () => {
  const block = buildCelebrityFactGuardBlock();

  it('선고 전 유죄 확정 표현을 금지한다', () => {
    expect(block).toContain('증명됐다');
    expect(block).toContain('입증됐다');
    expect(block).toContain('방증');
  });

  it('금지만 하지 않고 쓸 수 있는 대체 표현을 준다 — 후킹을 죽이지 않기 위해', () => {
    expect(block).toContain('정황과 자료가 제시됐다');
    expect(block).toContain('구형했다');
  });

  it('구형·선고, 형사·민사, 청구·인정액을 섞지 말라고 못박는다', () => {
    expect(block).toContain('구형액과 선고액');
    expect(block).toContain('형사와 민사');
  });

  it('스토킹·협박을 범죄 예시에 포함한다', () => {
    expect(block).toContain('스토킹');
    expect(block).toContain('협박');
  });
});
