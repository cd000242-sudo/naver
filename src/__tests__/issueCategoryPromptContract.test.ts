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

/**
 * [2026-08-05 배치 2b] 홈판 entertainment·society 신규격 계약.
 *
 * 이 두 카테고리에서만 issue-story 골격(실측 승자, 불가침)이 카테고리 파일 **뒤에**
 * 주입된다. 계약의 두 축:
 * ① 골격 소유 규칙(인용 실재·도입 줄수·전개 순서)을 재진술하지 않는다 — 골격 개정 시
 *   함께 썩는 드리프트 커플링이 된다.
 * ② 실존인물 가드 블록은 홈판에서 주입되지 않는다(contentGenerator.ts:2317 이
 *   contentMode !== 'homefeed' 로 스킵, 실측). 따라서 이 두 파일이 홈판의 **유일한
 *   파일 수준 방어선**이다. 그리고 골격 :55 는 완곡 전달("~로 알려졌다")을 허용하므로,
 *   파일의 "완곡도 금지"는 골격 :7 의 자기 양보("실존 인물 단정 금지는 언제나 이
 *   골격보다 우선")를 파일 안에서 원용해야 recency 에 밀리지 않는다.
 */
const hfEnt = read('homefeed/entertainment.prompt');
const hfSoc = read('homefeed/society.prompt');
const issueStory = read('homefeed/issue-story.prompt');

describe('homefeed 이슈픽 — 우선순위·골격 선언', () => {
  it.each([['entertainment', hfEnt], ['society', hfSoc]])('%s가 base 우선 + 골격 후행을 선언한다', (_n, p) => {
    expect(p).toMatch(/★[\s\S]*?base\.prompt \[SECTION -2\][\s\S]*?우선한다/);
    expect(p).toContain('[ISSUE-STORY]');
  });

  it('골격 참조가 실재한다 (댕글링 금지)', () => {
    expect(issueStory).toContain('[ISSUE-STORY]');
    expect(issueStory).toMatch(/실존 인물[\s\S]{0,20}단정 금지[\s\S]{0,20}(?:언제나|항상)[\s\S]{0,10}이 골격보다 우선/);
  });

  it.each([['entertainment', hfEnt], ['society', hfSoc]])('%s의 안전 규율이 골격 완곡 허용에 밀리지 않게 자기 양보를 원용한다', (_n, p) => {
    // 골격이 뒤에 오므로(recency 우위) 골격 :7 의 양보를 파일 안에서 명시해야 한다.
    expect(p).toMatch(/골격[\s\S]{0,30}실존 인물 단정 금지를[\s\S]{0,10}(?:자신|자기)보다[\s\S]{0,6}(?:우선|위)/);
  });
});

describe('homefeed entertainment — 실존인물 안전', () => {
  it('확정도 규율이 실물로 있다 (SEO판 축자 공유)', () => {
    expect(hfEnt).toMatch(/확정도가 다른 정보를 한 문장에 섞지 않는다/);
    expect(hfEnt).toMatch(/완곡하게 전하지 말고 문장에서 뺀다/);
    expect(hfEnt).toMatch(/배역·연기 서술은 실제 인물에 대한 서술이 아니다/);
    expect(hfEnt).toMatch(/시점 이후에 일어났을 상황은 쓰지 않는다/);
  });

  it('확정 사안에는 출처를 같은 문장에 동반한다 (홈판 유일 방어선 보강)', () => {
    expect(hfEnt).toMatch(/출처[\s\S]{0,30}같은 문장에 밝힌다/);
  });

  it('발언자 미상 발언은 따옴표 인용 자체를 막는다', () => {
    // 골격의 "주체 명시" 요구가 익명 발언을 실명에 오귀속시키는 압력을 차단.
    expect(hfEnt).toMatch(/명시되지 않은 발언은[\s\S]{0,30}따옴표 인용하지 않는다/);
  });

  it('궁금증 갭의 소재를 공적 활동으로 한정한다 (홈판 고유)', () => {
    expect(hfEnt).toMatch(/궁금증 소재로 쓰지 않는다/);
  });

  it('일반인 신상을 막는다', () => {
    expect(hfEnt).toMatch(/가족·지인·일반인의 실명/);
  });
});

describe('homefeed society — 갈래·중립·숫자 규율', () => {
  it('3갈래와 독자 질문이 실물로 있다', () => {
    expect(hfSoc).toMatch(/내가 대상인가/);
    expect(hfSoc).toMatch(/무엇을 기준으로 판단하나/);
    expect(hfSoc).toMatch(/무슨 일이 있었나/);
    expect(hfSoc).toMatch(/한 글에 두 갈래를 섞지 않는다/);
  });

  it('갈래별 골격 사용을 가른다 (정책형은 판별 먼저)', () => {
    expect(hfSoc).toMatch(/해당 없는 독자가 첫 화면에서/);
  });

  it('질문은 자료에 답이 실재할 때만 세운다', () => {
    expect(hfSoc).toMatch(/답이 자료에 없는 질문은 세우지 않는다/);
  });

  it('수치를 임의로 합산·환산하지 않는다', () => {
    expect(hfSoc).toMatch(/임의로 합산·환산·어림하지 않는다/);
  });

  it('정치 중립 — 없는 쪽을 지어내 균형을 맞추지 않는다', () => {
    expect(hfSoc).toMatch(/없는 쪽을 지어내 균형을 맞추지 않는다/);
    expect(hfSoc).toMatch(/지지·비난·조롱으로는 쓰지 않는다/);
  });

  it('갈등 구도를 지어내지 않는다 (홈판 고유)', () => {
    expect(hfSoc).toMatch(/세대·지역·계층·성별 갈등 구도를 세우지 않는다/);
  });

  it('촉박함은 근거가 있을 때만 쓴다', () => {
    expect(hfSoc).toMatch(/촉박함을 뒷받침하는 날짜·잔여 근거가[\s\S]{0,6}있을 때만 쓴다/);
  });

  it('확인처는 입력에 있을 때만 (변환 의무 금지)', () => {
    expect(hfSoc).toMatch(/입력에 있을 때만 안내한다/);
    expect(hfSoc).toMatch(/구체 기관명·창구를 만들지 않는다/);
  });
});

describe('배치 2b — 골격 소유 규칙 재진술 금지', () => {
  it.each([['entertainment', hfEnt], ['society', hfSoc]])('%s가 골격의 도입 줄수·전개 괄호를 재진술하지 않는다', (_n, p) => {
    expect(p).not.toMatch(/도입 3~5줄/);
    expect(p).not.toMatch(/배경 → 사건 → 발언 → 반응 → 전망/);
  });

  it.each([['entertainment', hfEnt], ['society', hfSoc]])('%s에 무조건 포함 지시가 없다', (_n, p) => {
    const lines = p.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('⛔'));
    for (const line of lines) {
      expect(line).not.toMatch(/반드시 (포함|넣|쓴다|작성)|필수로 (포함|넣)/);
    }
  });
});
