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

/**
 * [2026-08-05 배치 1] 홈판 health·pet 신규격 계약.
 *
 * 26파일 스키마 1차분. 적대 검증에서 확정된 원칙:
 * - 안전 규율의 SEO판 축자 공유는 결함이 아니다 — 로더가 모드당 1파일만 로드하므로
 *   두 파일은 한 조립에 공존하지 않는다. 어휘만 갈면 그게 곧 "도메인 어휘 교체본"이다.
 * - 병원·의료인 이름 평판 금지는 홈판에서도 필수다(경험담에 병원 이름이 실리는 게 흔하다).
 * - 잘린 것들(변환 의무·괄호 장면 예시·압력 꼬리·GAMMA-7 재진술)은 재도입 금지 —
 *   상세 사유는 docs/ultraplan 배치 1 산출물 참조.
 */
const hfHealth = read('homefeed/health.prompt');
const hfPet = read('homefeed/pet.prompt');
const hfBase = read('homefeed/base.prompt');

describe('homefeed YMYL — 우선순위 선언', () => {
  it.each([['health', hfHealth], ['pet', hfPet]])('%s가 base 우선 + 조건부 발동을 선언한다', (_n, p) => {
    expect(p).toMatch(/★[\s\S]*?base\.prompt \[SECTION -2\][\s\S]*?우선한다/);
  });

  it.each([['health', hfHealth], ['pet', hfPet]])('%s의 참조가 homefeed/base에 실재한다', (_n, p) => {
    const refs = [...p.matchAll(/\[SECTION\s+-?[\d.]+\]|\[GAMMA-\d+\]/g)].map((m) => m[0]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of new Set(refs)) {
      expect(hfBase, `${ref} 가 homefeed/base에 없습니다`).toContain(ref);
    }
  });
});

describe('homefeed health — 의료 안전 계약', () => {
  it('핵심 규율이 실물로 있다', () => {
    expect(hfHealth).toMatch(/의료인이 아니다/);
    expect(hfHealth).toMatch(/병원·의원·한의원·의료인 이름/);
    expect(hfHealth).toMatch(/위험 신호 목록을 만들지 않/);
    expect(hfHealth).toMatch(/가족·지인/);
    expect(hfHealth).toMatch(/건강기능식품/);
    expect(hfHealth).toMatch(/유병률|효과율|부작용 빈도/);
    expect(hfHealth).toMatch(/상당수/);
  });

  it('홈판 고유 — 공포 후킹을 막는다', () => {
    expect(hfHealth).toMatch(/공포로 열지 않는다/);
  });
});

describe('homefeed pet — 수의 안전 계약', () => {
  it('핵심 규율이 실물로 있다', () => {
    expect(hfPet).toMatch(/수의사가 아니다/);
    expect(hfPet).toMatch(/품종 이름에서/);
    expect(hfPet).toMatch(/종에 따라 답이 갈리는 서술을 하지 않는다/);
    expect(hfPet).toMatch(/다시 계산하지 않는다/);
    expect(hfPet).toMatch(/목록을 만들지 말고/);
  });

  it('홈판 고유 — 의인화 단정·죄책감 후킹을 막는다', () => {
    expect(hfPet).toMatch(/속마음을 단정하지 않는다/);
    expect(hfPet).toMatch(/죄책감/);
  });
});

describe('homefeed YMYL — 날조 유발 문구 부재', () => {
  it.each([['health', hfHealth], ['pet', hfPet]])('%s에 무조건 포함 지시가 없다', (_n, p) => {
    const lines = p.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('⛔'));
    for (const line of lines) {
      expect(line).not.toMatch(/반드시 (포함|넣|쓴다|작성)|필수로 (포함|넣)/);
    }
  });

  it.each([['health', hfHealth], ['pet', hfPet]])('%s가 GAMMA-7 재진술로 시작하는 불릿이 없다', (_n, p) => {
    // "첫 화면에는 …" 패턴은 13파일 공통 base 재진술이었다.
    const lines = p.split('\n').filter((l) => l.trim().startsWith('-'));
    for (const line of lines) {
      expect(line).not.toMatch(/^- 첫 화면에는/);
    }
  });
});
