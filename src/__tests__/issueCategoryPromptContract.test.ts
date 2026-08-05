import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05 배치 2a] SEO entertainment·society 신규격 계약.
 *
 * 이 두 카테고리는 명예훼손(SPEC-DEFAMATION)·YMYL(정책·금융) 위험군이다.
 * 비평서 실측: 기존 파일은 금지 비율 86%·57%에 base 재진술 3건씩이었고,
 * society 는 정책·경제·정치 3갈래가 한 파일에 뭉개져 있었다.
 */

const read = (rel: string): string =>
  readFileSync(new URL(`../prompts/${rel}`, import.meta.url), 'utf8');

const ent = read('seo/entertainment.prompt');
const soc = read('seo/society.prompt');
const base = read('seo/base.prompt');

describe('배치 2a — 우선순위 선언', () => {
  it.each([['entertainment', ent], ['society', soc]])('%s가 SECTION -2 우선을 선언한다', (_n, p) => {
    expect(p).toMatch(/\[SECTION -2\][\s\S]{0,40}우선/);
  });

  it.each([['entertainment', ent], ['society', soc]])('%s의 룰 ID 참조가 base에 실재한다', (_n, p) => {
    const refs = [...p.matchAll(/\b(F\d+|H\d+|R0-\d+)\b/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of new Set(refs)) {
      expect(base, `${ref} 가 base에 없습니다`).toMatch(new RegExp(`(?:^\s*|\[)${ref}(?:\]|\.)`, 'm'));
    }
  });
});

describe('entertainment — 실존인물 안전 계약', () => {
  it('확정도 구분을 요구한다 (문장 분리)', () => {
    // 네 확정도(발표/보도/추정/해석)가 같은 불릿 안에서 구분돼야 한다. 줄바꿈은 무관.
    expect(ent).toMatch(/공식 발표[\s\S]{0,60}보도된 사실[\s\S]{0,60}추정[\s\S]{0,60}해석/);
    expect(ent).toMatch(/각각 다른 문장/);
  });

  it('미확정 사생활은 완곡 전달도 금지한다', () => {
    // "~로 알려졌다"로 흐리는 것 자체가 불안전 — SPEC-DEFAMATION 의 암시형 오탐 교훈.
    expect(ent).toMatch(/완곡하게 전하지 말고 문장에서 뺀다/);
    expect(ent).toMatch(/알려졌다/);
  });

  it('배역과 실존 인물을 가른다', () => {
    expect(ent).toMatch(/배역[^\n]*실제 인물에 대한 서술이 아니다/);
  });

  it('발언은 실명 귀속한다 (H6 완화 예외와 정렬)', () => {
    expect(ent).toMatch(/발언자가 입력에 명시돼 있으면 그 이름으로/);
    expect(ent).toMatch(/관계자[^\n]*대신하지 않는다/);
  });

  it('시점 이후 상황을 쓰지 않는다', () => {
    expect(ent).toMatch(/시점 이후에 일어났을 상황은 쓰지 않는다/);
  });

  it('반응 다수 판정은 집계 근거가 있을 때만', () => {
    expect(ent).toMatch(/집계 근거가 있을 때만/);
  });
});

describe('society — 3갈래 구분 계약', () => {
  it('정책형·경제형·정치형을 가른다', () => {
    expect(soc).toMatch(/정책형/);
    expect(soc).toMatch(/경제형/);
    expect(soc).toMatch(/정치형/);
    expect(soc).toMatch(/한 글에 두 갈래를 섞지 않는다/);
  });

  it('갈래마다 독자 질문 형태가 있다', () => {
    expect(soc).toMatch(/내가 대상인가/);
    expect(soc).toMatch(/무엇을 기준으로 판단하나/);
    expect(soc).toMatch(/무슨 일이 있었나/);
  });

  it('전망과 판정을 가른다 (경제형)', () => {
    expect(soc).toMatch(/전망임을 문장으로 드러내고/);
    expect(soc).toMatch(/어느 쪽이 맞는지 판정하지 않는다/);
  });

  it('입장 균형을 지어내지 않는다 (정치형)', () => {
    expect(soc).toMatch(/없는 쪽을 지어내 균형을 맞추지 않는다/);
  });

  it('보장 표현을 금지한다', () => {
    expect(soc).toMatch(/보장하는 표현을 쓰지 않는다/);
    expect(soc).toMatch(/보편적 처리 기간[^\n]*확대하지 않는다/);
  });

  it('확인처는 입력에 있을 때만 안내한다 (변환 의무 금지 — 배치 1 원칙)', () => {
    // "바뀌는 정보는 확인처를 함께 안내한다"는 자료에 확인처가 없으면
    // 기관명을 지어내야 이행되는 변환 의무였다.
    expect(soc).toMatch(/확인처는 입력에 있을 때만/);
    expect(soc).not.toMatch(/확인처를 함께 안내한다[.\s]*$/m);
  });
});

describe('배치 2a — 날조 유발 문구 부재', () => {
  it.each([['entertainment', ent], ['society', soc]])('%s에 무조건 포함 지시가 없다', (_n, p) => {
    const lines = p.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('⛔'));
    for (const line of lines) {
      expect(line).not.toMatch(/반드시 (포함|넣|쓴다|작성)|필수로 (포함|넣)/);
    }
  });
});
