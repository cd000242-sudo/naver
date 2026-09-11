import { describe, expect, it } from 'vitest';
import { assessCustomPromptAdherence } from '../contentPromptAdherence.js';

describe('contentPromptAdherence', () => {
  it('skips scoring when no custom prompt is provided', () => {
    const report = assessCustomPromptAdherence(
      { selectedTitle: '장마철 빨래 건조 팁', bodyPlain: '본문입니다.' },
      {},
    );

    expect(report.checked).toBe(false);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.retryInstruction).toBe('');
  });

  it('detects missing required terms, missing structures, and forbidden terms', () => {
    const report = assessCustomPromptAdherence(
      {
        selectedTitle: '장마철 빨래 건조 팁',
        bodyPlain: '광고문구처럼 보일 수 있는 일반 설명만 있습니다.',
        headings: [{ title: '건조 핵심', content: '습도와 환기를 함께 봅니다.' }],
      },
      {
        customPrompt: [
          "반드시 'CTA 버튼'을 포함하고 FAQ와 비교표를 넣어주세요.",
          "'광고문구'는 쓰지 말아주세요.",
        ].join('\n'),
      },
    );

    expect(report.checked).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.missingTerms).toContain('CTA 버튼');
    expect(report.foundForbiddenTerms).toContain('광고문구');
    expect(report.missingFeatures).toEqual(expect.arrayContaining(['FAQ/Q&A', '비교표/표']));
    expect(report.retryInstruction).toContain('[PROMPT_ADHERENCE_REPAIR]');
    expect(report.retryInstruction).toContain('반드시 추가할 구조 요소');
  });

  it('passes when required prompt terms and structures are reflected', () => {
    const report = assessCustomPromptAdherence(
      {
        selectedTitle: '전기요금 줄이는 제습기 사용법',
        bodyPlain: [
          '전기요금 부담을 줄이려면 사용 시간을 먼저 정해야 합니다.',
          'FAQ 형식으로 Q1. 하루 종일 켜도 되나요? 답변은 사용 환경에 따라 다릅니다.',
          // [2026-09-12] 실제 표가 있어야 "표를 넣었다" 로 친다. 예전에는 본문에 '비교' 라는
          //   낱말만 있어도 통과해, 표 없는 글이 "구조 누락 없음" 으로 나갔다.
          '| 구분 | 내용 |',
          '| --- | --- |',
          '| 하루 사용 | 4시간 기준 |',
        ].join('\n'),
        hashtags: ['#전기요금', '#제습기'],
      },
      {
        customPrompt: [
          "반드시 'FAQ', '비교표', '전기요금'.",
          '과장광고는 쓰지 마세요.',
        ].join('\n'),
      },
    );

    expect(report.checked).toBe(true);
    expect(report.passed).toBe(true);
    expect(report.missingTerms).toEqual([]);
    expect(report.foundForbiddenTerms).toEqual([]);
    expect(report.missingFeatures).toEqual([]);
    expect(report.retryInstruction).toBe('');
  });
});

/*
 * [2026-09-12] "요청사항이 정확히 반영되는가" 가 관건이라는 사장님 지적으로 실측한 네 가지.
 * 고치기 전에는 검사기가 오히려 방해했다 — 지시 동사를 요구 내용으로 착각하고, 한 문장에
 * 섞인 금지와 지시를 통째로 금지로 보고, 표 없는 글을 "구조 누락 없음" 으로 통과시켰다.
 */
describe('요청사항 반영 판정 — 실측 네 가지', () => {
  const BODY = [
    '청약통장 해지를 고민 중이라면 순서부터 봅니다.',
    '가입 기간과 납입 횟수를 먼저 봅니다. 사용 환경에 따라 유불리가 갈립니다.',
    '은행 앱에서 신청하고, 신분증을 준비합니다.',
    '해지하면 가점이 사라집니다.',
  ].join('\n');

  it('인용 문구는 통째로 하나의 요구다 — 낱말로 쪼개지 않는다', () => {
    const r = assessCustomPromptAdherence(
      { bodyPlain: BODY } as never,
      { customPrompt: '"본 글은 법률 자문이 아닙니다"라는 문장을 결론에 반드시 넣어주세요.' },
    );
    expect(r.requiredTerms).toEqual(['본 글은 법률 자문이 아닙니다']);
    expect(r.passed).toBe(false);          // 본문에 그 문구가 없으니 재생성이 맞다
    expect(r.requiredTerms).not.toContain('라는');
    expect(r.requiredTerms.some((t) => /주세요/.test(t))).toBe(false);
  });

  it('한 문장에 금지와 지시가 섞이면 앞절만 금지다', () => {
    const r = assessCustomPromptAdherence(
      { bodyPlain: BODY } as never,
      { customPrompt: '가격 비교는 빼고 사용 환경 위주로 써주세요.' },
    );
    expect(r.forbiddenTerms).toEqual(expect.arrayContaining(['가격', '비교']));
    expect(r.forbiddenTerms).not.toContain('환경');   // 요구한 것을 금지로 보면 안 된다
    expect(r.foundForbiddenTerms).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('표·체크리스트를 요청했는데 없으면 구조 누락으로 잡는다', () => {
    const r = assessCustomPromptAdherence(
      { bodyPlain: BODY } as never,
      { customPrompt: '신청 절차는 표로 정리하고, 마지막에 준비물 체크리스트를 넣어주세요.' },
    );
    expect(r.missingFeatures).toEqual(expect.arrayContaining(['비교표/표', '체크리스트']));
    expect(r.passed).toBe(false);
  });

  it('실제 표가 있으면 본문이 "비교표" 라고 적지 않아도 인정한다', () => {
    const withTable = [BODY, '| 구분 | 내용 |', '| --- | --- |', '| 납입 | 24회 |'].join('\n');
    const r = assessCustomPromptAdherence(
      { bodyPlain: withTable } as never,
      { customPrompt: '납입 조건을 비교표로 정리해주세요.' },
    );
    expect(r.missingFeatures).not.toContain('비교표/표');
    expect(r.missingTerms).not.toContain('비교표');
  });

  it('조사가 붙어도 본문과 대조된다 — 요청의 "가입기간을" 이 본문의 "가입 기간" 과 맞는다', () => {
    const withList = [BODY, '- 신분증', '- 통장 사본', '- 인감'].join('\n');
    const r = assessCustomPromptAdherence(
      { bodyPlain: withList } as never,
      { customPrompt: '가입기간을 반드시 언급하고, 체크리스트를 넣어주세요.' },
    );
    // 구조(체크리스트)는 불릿 세 줄로 충족되고, 낱말은 조사를 떼고 대조된다.
    expect(r.missingFeatures).not.toContain('체크리스트');
    expect(r.requiredTerms.some((t) => /주세요/.test(t))).toBe(false);
  });
});
