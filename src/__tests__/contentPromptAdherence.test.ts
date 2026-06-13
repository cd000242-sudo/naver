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
          '비교표 항목 기준 비교 결과 장점 단점 체크 포인트를 정리했습니다.',
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
