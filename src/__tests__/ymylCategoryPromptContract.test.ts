import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05] YMYL 카테고리(건강·반려동물) 프롬프트 계약.
 *
 * 전수 비평 결과 두 파일이 base 근거 게이트의 도메인 어휘 재진술로 채워져 있었고,
 * 정작 이 카테고리에서만 필요한 안전 규율이 없었다. 특히 health.prompt는 13개
 * 파일 중 유일하게 "입력 **또는 신뢰할 근거**에서 확인된 것"이라고 써서 F1의
 * 자료 범위를 모델 자율 판정으로 열어두고 있었다.
 *
 * 여기서 잠그는 것은 문구가 아니라 계약이다. 문장을 다듬는 것은 자유롭게 하되,
 * 아래 항목이 사라지면 실패한다.
 */

const read = (rel: string): string =>
  readFileSync(new URL(`../prompts/${rel}`, import.meta.url), 'utf8');

const health = read('seo/health.prompt');
const pet = read('seo/pet.prompt');
const base = read('seo/base.prompt');

describe('YMYL 프롬프트 — base 우선순위를 선언한다', () => {
  it.each([['health', health], ['pet', pet]])('%s가 base 우선을 명시한다', (_name, prompt) => {
    // 충돌 시 무엇이 이기는지 파일 안에서 알 수 있어야 한다.
    expect(prompt).toMatch(/base\.prompt.*우선/);
  });

  it.each([['health', health], ['pet', pet]])('%s의 base 참조가 실재한다 (댕글링 금지)', (_name, prompt) => {
    const refs = [...prompt.matchAll(/\[SECTION\s+-?[\d.]+\]|\bH\d\b|\bF\d\b|\bR0-\d+\b/g)].map((m) => m[0]);
    expect(refs.length, '참조가 하나도 없으면 우선순위 선언이 형식적이다').toBeGreaterThan(0);
    for (const ref of new Set(refs)) {
      expect(base, `${ref} 가 base.prompt에 없습니다`).toContain(ref);
    }
  });
});

describe('health — 의료 안전 계약', () => {
  it('화자가 의료인이 아님을 명시한다', () => {
    expect(health).toMatch(/의료인이 아니다/);
  });

  it('F1의 자료 범위를 모델 자율 판정으로 열지 않는다', () => {
    // "신뢰할 근거"는 무엇이 신뢰할 만한지를 모델이 정하게 만든다.
    expect(health).not.toMatch(/신뢰할\s*(만한\s*)?근거/);
  });

  it('AdPost 컨텍스트 주입을 이 카테고리에서 끈다', () => {
    // base [SECTION -0.5]가 광고 단가를 위해 실비·암보험·치료비 문장을 넣으라고 지시한다.
    expect(health).toMatch(/AdPost/);
    expect(health).toMatch(/실비|암보험|치료비/);
  });

  it('수치가 없을 때 범용 표현으로 대체하지 않는다', () => {
    // base H5는 "상당수·절반 가량"으로 대체하라고 한다. 유병률·효과율에서는 위험하다.
    expect(health).toMatch(/상당수/);
    expect(health).toMatch(/유병률|효과율|부작용 빈도/);
  });

  it('건강기능식품 질병 예방·치료 서술을 막는다', () => {
    expect(health).toMatch(/건강기능식품/);
    expect(health).toMatch(/예방·치료|예방하거나|치료·개선|예방·치료·개선/);
  });

  it('위험 신호 목록을 지어내지 않는다', () => {
    expect(health).toMatch(/위험 신호 목록을 만들지 않/);
  });

  it('타인의 병력을 본문에 옮기지 않는다', () => {
    expect(health).toMatch(/가족·지인/);
  });
});

describe('pet — 수의 안전 계약', () => {
  it('화자가 수의사가 아님을 명시한다', () => {
    expect(pet).toMatch(/수의사가 아니다/);
  });

  it('종이 없으면 종에 따라 갈리는 서술을 막는다', () => {
    expect(pet).toMatch(/종이 없으면/);
  });

  it('체중 환산값을 계산해 제시하지 않는다', () => {
    expect(pet).toMatch(/환산값을 계산해 제시하지 않/);
  });

  it('품종에서 성격·질환을 추론하지 않는다', () => {
    expect(pet).toMatch(/품종 이름에서/);
  });

  it('위험 신호 목록을 지어내지 않는다', () => {
    expect(pet).toMatch(/위험 신호 목록을 만들지 않/);
  });
});

describe('YMYL 프롬프트 — 환각을 강제하지 않는다', () => {
  it.each([['health', health], ['pet', pet]])('%s에 무조건 포함 지시가 없다', (_name, prompt) => {
    // "반드시 포함한다" 류는 입력에 없을 때 모델이 지어내게 만든다.
    const lines = prompt.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('⛔'));
    for (const line of lines) {
      expect(line, '무조건 포함 지시는 자료가 없을 때 환각이 된다')
        .not.toMatch(/반드시 (포함|넣|쓴다|작성)|필수로 (포함|넣)/);
    }
  });

  it.each([['health', health], ['pet', pet]])('%s가 경험 날조를 요구하지 않는다', (_name, prompt) => {
    expect(prompt).not.toContain('필수 경험 표현');
    expect(prompt).not.toMatch(/구체적 에피소드 필수/);
  });
});
