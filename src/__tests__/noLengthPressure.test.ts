import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-01] 사장님 판단으로 분량 기준을 걷어낸다.
 *
 *   "굳이 분량을 생각 안 해도 되는 게, 2000자가 안 되어도 제목에 대한 후킹이나
 *    내용에 대한 답변이 정확하게 들어가 있다면 분량은 굳이 신경 안 써도
 *    상위노출이나 홈판노출이 가능하다고 알고 있어."
 *
 * 이 판단이 검증된 근거와 맞는다. 새벽 조사에서 "2,000자/3,000자 기준" 은
 * 출처 없는 속설로 분류해 폐기했다. 네이버 공식은 "좋은 문서" 를 말하지 분량을 말하지 않고,
 * D.I.A.+ 는 "질의 의도가 문서에 실제로 포함되어 있는지" 를 본다.
 *
 * 실측이 그 판단을 받친다. 제미나이 SEO 글은 647자였는데
 *   [TitlePayoff] 제목 상환 86% · [TitleAnswer] 본문 응답 86% · 지어낸 수치 0건
 * 이었다. 짧지만 제목의 약속을 갚았다. 그런데 앱은 "목표 2500자, 26%" 라고 경고했다.
 *
 * 분량 요구가 해로운 이유는 채우기를 부르기 때문이다. 오늘 본 "매 섹션마다 판정 라벨",
 * "매 H2당 정량 수치 2개+" 가 전부 같은 종류의 채우기였고, 그 채우기가 체류시간을 깎는다.
 *
 * 문장 수 힌트(sentencesPerHeading)는 남긴다 — 그건 구조 지침이지 분량 압력이 아니다.
 */
const read = (...p: string[]) => readFileSync(resolve(__dirname, '..', ...p), 'utf-8');

describe('모델에게 분량을 요구하지 않는다', () => {
  it('프롬프트가 목표 분량을 우선순위로 두지 않는다', () => {
    const loader = read('promptLoader.ts');
    expect(loader).not.toMatch(/목표 분량[^\n]*이 분량이 우선/u);
    expect(loader).not.toMatch(/목표 분량을 채우려면 더 써도 좋다/u);
  });

  it('"최소 N자 이상 작성" 지시가 없다', () => {
    expect(read('contentGenerator.ts')).not.toMatch(/최소 \d{3,}자 이상 작성/u);
  });

  it('대신 답이 기준임을 말한다', () => {
    const loader = read('promptLoader.ts');
    expect(loader).toMatch(/분량[^\n]*기준이 아니|길이가 아니라|답했는지/u);
  });
});

describe('구조 지침은 남긴다 — 분량 압력과 구분한다', () => {
  it('소제목당 문장 수 힌트는 유지된다', () => {
    expect(read('promptLoader.ts')).toMatch(/sentencesPerHeading/u);
  });
});
