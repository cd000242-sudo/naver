import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { buildSituationDepthContract } from '../content/situationDepthContract';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-31] 상황별 깊이 계약 — 사용자 제공 실전 자료 접목.
 *
 * 핵심: AI가 1초 만에 요약하는 단순 정보 나열은 클릭이 사라진다. 살아남는 글은
 * (1) AI가 못 만드는 디테일 (2) 검색자의 결정 지원 (3) 좁고 깊은 주제.
 * 단, 직접 경험이 없어도 되고 — 자료를 따라가 본 간접 경험이면 충분하다.
 * 없는 경험을 지어내는 것만 금지.
 */
describe('situation depth contract', () => {
  it('직접 경험 메모가 있으면 육하원칙 디테일을 요구한다', () => {
    const c = buildSituationDepthContract({
      personalExperience: '토요일 오후 2시에 8세 아이와 다녀왔고 40분 대기했다',
    });
    expect(c).toContain('[디테일 — 직접 경험 있음]');
    expect(c).toContain('육하원칙');
    expect(c).toContain('AI가 만들 수 없다');
    // 메모 밖 날조는 여전히 금지
    expect(c).toContain('메모에 없는 시간·인원·금액·대기시간을 새로 만들지 마라');
  });

  it('경험이 없고 자료만 있으면 간접 경험(절차 추적) 서술을 요구한다', () => {
    const c = buildSituationDepthContract({ rawText: '자료 원문입니다. '.repeat(30) });
    expect(c).toContain('[디테일 — 자료 기반 간접 경험]');
    expect(c).toContain('끝까지 따라가 본');
    expect(c).toContain('어디서 막히기 쉬운지');
    // 간접 경험도 날조는 금지
    expect(c).toContain('자료에 없는 대기시간·후기·개인 감상을 지어내지 마라');
    expect(c).not.toContain('[디테일 — 직접 경험 있음]');
  });

  it('근거가 거의 없으면 분량 채우기 대신 판단 기준을 요구한다', () => {
    const c = buildSituationDepthContract({});
    expect(c).toContain('[디테일 — 근거 부족]');
    expect(c).toContain('짧고 정확한 편이 낫다');
    expect(c).toContain('없는 수치·후기·경험을 만들어 채우지 마라');
  });

  it('세 근거 상태 모두 상황분기·결정지원·좁고깊게·질문선점을 공통 요구한다', () => {
    for (const source of [
      { personalExperience: '직접 다녀온 메모입니다' },
      { rawText: '자료 원문입니다. '.repeat(30) },
      {},
    ]) {
      const c = buildSituationDepthContract(source);
      expect(c).toContain('[상황 분기]');
      expect(c).toContain('[결정 지원]');
      expect(c).toContain('[좁고 깊게]');
      expect(c).toContain('[질문 선점]');
      // 숫자를 생활 의미로 번역하라는 지시 (AI 요약이 못 하는 부분)
      expect(c).toContain('그 숫자가 생활에서 뭘 뜻하는지');
    }
  });

  it('전 모드 공통 배선 — 특정 모드에서 빠지지 않는다', () => {
    const gen = read('contentGenerator.ts');
    // finalContract 분기 밖에서 무조건 조립된다
    expect(gen).toContain('const situationDepth = buildSituationDepthContract(source as any)');
    expect(gen).toMatch(/\$\{jsonOutputFormat\}\\n\\n\$\{situationDepth\}/);
  });
});

describe('rich paste paragraph rhythm (타이핑과 동일)', () => {
  it('빈 스페이서 문단을 넣지 않는다 — 문장 간격이 줄간의 3배가 되던 원인', () => {
    const rich = read('automation/richTextPaste.ts');
    expect(rich).toMatch(/function shouldInsertParagraphSpacer\(_html: string\): boolean \{\s*return false;/);
    expect(rich).toContain('리치 붙여넣기의 문단 리듬을 타이핑과 맞춘다');
  });
});
