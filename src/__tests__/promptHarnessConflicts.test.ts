import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildFullPrompt } from '../promptLoader';

const P = (rel: string) => readFileSync(resolve(process.cwd(), 'src', 'prompts', rel), 'utf-8');

/**
 * [2026-08-26 사장님 지시] "충돌하는 요소를 전부 확인해봐"
 *
 * 오늘 나온 문제가 전부 같은 모양이었다 — 두 규칙이 반대로 말하고, 뒤에 오는 쪽이
 * 이겨서 앞의 의도가 조용히 죽는다. 제목 프롬프트 30개가 그랬고(9f5db79f),
 * 요약 표 규칙이 본문 중간 표까지 막은 것도 그랬다.
 *
 * 조립된 프롬프트는 40,000자를 넘는다. 사람이 매번 훑을 수 없으므로 축별로 잠근다.
 * 여기 걸리면 두 파일 중 하나가 양보해야 한다 — 둘 다 두면 모델이 흘린다.
 */
describe('축별 단일 계약 — 같은 것을 두 번 다르게 말하지 않는다', () => {
  it('FAQ 개수를 고정하는 곳이 없다', () => {
    /*
     * base(R0-3)는 "FAQ 는 실제 반복 질문이 있을 때만, 고정 위치를 만들지 않는다"인데
     * ES-3 가 "3~6개"로 고정하고 있었다. ES 가 뒤에 와서 base 의 의도를 죽였다.
     * 실측 상위노출 글 3편에는 FAQ 가 하나도 없었다.
     */
    const es = P('shared/exposure-structure.prompt');
    expect(es).not.toMatch(/FAQ 섹션 \(\d+~\d+개\)/);
    expect(es).toContain('개수를 고정하지 않는다');
    expect(P('seo/base.prompt')).toContain('고정 위치를 만들지 않는다');
  });

  it('맨 앞 요약 표 금지가 본문 중간 표까지 막지 않는다', () => {
    /*
     * BH-1 이 "본문에 표를 직접 그리지 마라"였는데, 그러면 ES-4(비교·비용 표)와
     * IB-4(일정·순위 표)를 정면으로 막는다. 범위를 맨 앞 요약 표로 좁혔다.
     */
    const header = P('shared/fact-brief-header.prompt');
    expect(header).toContain('맨 앞 요약 표에만');
    expect(header).toContain('본문 중간의 비교표·일정표는');
    expect(header).not.toMatch(/^★ 본문에 표를 직접 그리지 마라/m);
  });

  it('도입부 길이를 두 곳에서 다르게 정하지 않는다', () => {
    // BH-2 가 문장 수를 따로 정하면 base 의 3~4줄과 어긋난다.
    const header = P('shared/fact-brief-header.prompt');
    expect(header).toContain('base 의 도입부 규칙(3~4줄)을 따른다');
    expect(header).not.toMatch(/이어서 3~5문장으로/);
  });

  it('이슈형 FAQ 배제가 실용 카테고리까지 끄지 않는다', () => {
    const issue = P('shared/issue-brief-structure.prompt');
    expect(issue).toContain('이슈형에만');
    expect(issue).toContain('절차·비용·자격');
  });
});

describe('조립 결과 — 실제 프롬프트에 상충 지시가 함께 실리지 않는다', () => {
  it('FAQ 개수 고정 문구가 조립본에 없다', () => {
    for (const [mode, cat] of [['seo', '연예'], ['seo', '생활'], ['mate', '생활']] as const) {
      const p = buildFullPrompt(mode, cat);
      expect(p, `${mode}/${cat}`).not.toMatch(/FAQ 섹션 \(\d+~\d+개\)/);
    }
  });

  it('이슈형에는 전개 순서가, 실용형에는 안 실린다', () => {
    expect(buildFullPrompt('seo', '연예')).toContain('[IB-3]');
    expect(buildFullPrompt('seo', '생활')).not.toContain('[IB-3]');
  });

  it('요약 표는 두 모드 모두 스키마 필드로만 요구한다', () => {
    for (const cat of ['연예', '생활']) {
      const p = buildFullPrompt('seo', cat);
      expect(p, cat).toContain('summaryTable');
      expect(p, cat).toContain('맨 앞 요약 표에만');
    }
  });

  it('홈판에는 SEO 전용 첫 화면 규칙이 실리지 않는다', () => {
    const p = buildFullPrompt('homefeed', '연예');
    expect(p).not.toContain('[BRIEF-HEAD]');
    expect(p).not.toContain('summaryTable');
    expect(p).toContain('[ISSUE-STORY]');
  });
});
