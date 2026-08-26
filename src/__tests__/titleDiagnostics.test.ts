import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTitleDiagnosticsLines } from '../content/titleDiagnostics';

/**
 * [2026-08-27 Phase 0] 제목이 약한 이유를 아직 모른다.
 *
 * 사장님: "내 눈엔 제목이 별로 클릭을 부르는 제목이 아닌데?"
 * 그런데 evaluateTitleQuality 는 그 제목에 100점을 줬다. 사장님이 맞고 평가기가 틀렸다.
 *
 * 문제는 원인을 가를 재료가 로그에 없다는 것이다.
 *   · 모델이 선언한 clickReason 은 파서가 버려 아무 데도 안 남는다
 *   · 탈락한 후보 2개와 각 whyClick 도 안 남는다
 * 그래서 재료가 약한 건지, 재료는 좋은데 제목이 못 살린 건지 알 수 없다.
 *
 * 채점기를 만들기 전에 이걸 먼저 본다 — 모르고 만들면 잘못된 것을 잰다.
 */
describe('제목 진단 로그', () => {
  const content: any = {
    selectedTitle: '티파니 유리 눈웃음 흉내에 당황한 이유, 19년 쌓인 연관 검색어',
    preWritingAnalysis: {
      clickReason: '아이돌이 멤버의 흉내 때문에 자기 연관 검색어가 바뀔까 걱정한다는 의외성',
      stopReason: '19년 유지된 연관 검색어',
    },
    titleCandidates: [
      { text: '티파니 유리 눈웃음 흉내에 당황한 이유, 19년 쌓인 연관 검색어', score: 95, whyClick: '19년이라는 숫자' },
      { text: '티파니가 유리 눈웃음 흉내에 당황한 진짜 이유', score: 90, whyClick: '이유가 궁금하다' },
      { text: '소녀시대 티파니 눈웃음 연관 검색어 정리', score: 85, whyClick: '정보 요약' },
    ],
  };

  const lines = buildTitleDiagnosticsLines(content);
  const all = lines.join('\n');

  it('모델이 선언한 클릭 사유를 남긴다 — 지금은 버려진다', () => {
    expect(all).toContain('클릭 사유');
    expect(all).toContain('의외성');
  });

  it('후보 3개를 전부 남긴다 — 탈락한 것이 더 나았을 수 있다', () => {
    expect(all).toContain('진짜 이유');
    expect(all).toContain('연관 검색어 정리');
  });

  it('각 후보의 whyClick 을 함께 남긴다', () => {
    expect(all).toContain('19년이라는 숫자');
    expect(all).toContain('정보 요약');
  });

  it('선택된 후보에 표시가 붙는다', () => {
    const picked = lines.find((l) => l.includes('19년 쌓인 연관 검색어') && l.includes('◀'));
    expect(picked).toBeTruthy();
  });

  it('재료가 없으면 아무것도 남기지 않는다 — 빈 줄로 로그를 더럽히지 않는다', () => {
    expect(buildTitleDiagnosticsLines({})).toEqual([]);
    expect(buildTitleDiagnosticsLines(null as never)).toEqual([]);
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => buildTitleDiagnosticsLines({ titleCandidates: 'x', preWritingAnalysis: 3 } as never))
      .not.toThrow();
  });

  it('한 줄이 지나치게 길어지지 않는다 — 터미널에서 읽을 수 있어야 한다', () => {
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(160);
  });
});

describe('본선 배선', () => {
  it('사후 검증기가 진단을 남긴다', () => {
    const source = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf-8');
    expect(source).toMatch(/buildTitleDiagnosticsLines\(/);
  });
});
