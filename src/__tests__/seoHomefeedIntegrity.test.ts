import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildModeBasedPrompt, type ContentSource } from '../contentGenerator';
import { evaluate } from '../content/qualityEvaluator';
import {
  buildTitleEvidenceFinalContract,
  collectUnsupportedConcreteClaims,
} from '../content/evidenceIntegrity';
import { evaluateOfficialExposure } from '../content/officialExposureRubric';
import { selectTitleFormula } from '../contentTitleSelector';

const root = process.cwd();

function source(mode: 'seo' | 'homefeed'): ContentSource {
  return {
    sourceType: 'custom_text',
    rawText: '정부24 안내에서는 신청 대상, 준비 서류, 처리 순서를 확인하도록 설명합니다.',
    title: '정부지원 신청 전 확인할 내용',
    metadata: { keywords: ['정부지원 신청', '준비 서류', '신청 순서'] },
    contentMode: mode,
    categoryHint: 'life',
  };
}

describe('SEO/Homefeed evidence-first integrity', () => {
  it.each(['seo', 'homefeed'] as const)('appends a final evidence contract after legacy rules for %s', (mode) => {
    const prompt = buildModeBasedPrompt(source(mode), mode, undefined, 1600);
    const finalContract = prompt.lastIndexOf('[EVIDENCE AND INTENT FINAL CONTRACT]');
    expect(finalContract).toBeGreaterThan(-1);
    expect(prompt.slice(finalContract)).toContain('이 블록과 충돌하는 앞선 규칙은 무효');
    expect(prompt.slice(finalContract)).toContain('사용자 직접 경험 메모가 없으므로');
    expect(prompt.slice(finalContract)).toContain('숫자·기간·금액을 새로 만들지 않는다');
    expect(finalContract).toBeGreaterThan(prompt.lastIndexOf('[최종 강제 조건'));
  });

  it('does not treat a numeric substring as grounded evidence', () => {
    expect(collectUnsupportedConcreteClaims('처리 기간은 3일입니다.', '공식 안내에는 13일로 적혀 있습니다.'))
      .toEqual(['3일']);
    expect(collectUnsupportedConcreteClaims('처리 기간은 13일입니다.', '공식 안내에는 13일로 적혀 있습니다.'))
      .toEqual([]);
  });

  it('places a source-aware evidence contract at the end of title generation', () => {
    const noExperience = buildTitleEvidenceFinalContract(source('homefeed'), 'homefeed');
    expect(noExperience).toContain('직접 경험 메모가 없으므로');
    expect(noExperience).toContain('제목 맨 앞이나 첫 3글자로 강제하지 않는다');
    expect(noExperience).toContain('같은 연도나 핵심어를 중복하지 않는다');

    const withExperience = buildTitleEvidenceFinalContract({
      ...source('seo'),
      personalExperience: '제가 신청 화면에서 준비 서류를 직접 확인했습니다.',
    }, 'seo');
    expect(withExperience).toContain('직접 경험 메모에 적힌 범위에서만');
  });

  it('never rewards repeated unsupported numbers as supported evidence', () => {
    const result = evaluateOfficialExposure({
      title: '신청 처리 기간 확인 기준',
      body: '신청은 3일이면 됩니다. 다시 말해 3일 안에 끝납니다.',
      rawText: '공식 안내에는 처리 기간이 13일이라고 적혀 있습니다.',
      groundingText: '공식 안내에는 처리 기간이 13일이라고 적혀 있습니다.',
      primaryKeyword: '신청 처리 기간',
      mode: 'seo',
      firstPartyEvidenceAvailable: false,
    });

    expect(result.details.supportedConcreteNumberCount).toBe(0);
    expect(result.details.unsupportedConcreteNumberCount).toBeGreaterThan(0);
  });

  it('hard-fails unsupported first-person experience outside affiliate mode', () => {
    const result = evaluate({
      title: '정부지원 신청 제가 직접 해보니 달랐던 점',
      body: '제가 직접 신청해보니 사흘 만에 50만원을 받았고 가족도 놀랐어요.',
      rawText: '정부24에서 대상 조건과 준비 서류를 확인할 수 있습니다.',
      primaryKeyword: '정부지원 신청',
      mode: 'seo',
      contentMode: 'seo',
      firstPartyEvidenceAvailable: false,
    });

    expect(result.safetyScore.score).toBeLessThan(50);
    expect(result.decision).toBe('regenerate');
    expect(result.safetyScore.issues.some((issue) => issue.includes('근거 없는 1인칭'))).toBe(true);
  });

  it('scores intent-complete SEO above keyword-stuffed unsupported copy', () => {
    const rawText = '정부지원 신청은 대상 조건 확인, 준비 서류 점검, 공식 신청처 확인 순서로 진행합니다. 조건은 개인별로 다를 수 있습니다.';
    const useful = evaluate({
      title: '정부지원 신청 전 대상과 서류를 확인하는 순서',
      body: `정부지원 신청은 대상 조건과 준비 서류를 먼저 확인하는 것이 핵심입니다. 개인 상황에 따라 결과가 달라질 수 있어 공식 신청처의 현재 안내를 함께 봐야 합니다.

대상 조건부터 확인하기
거주지, 소득, 연령처럼 제도마다 달라지는 기준을 먼저 대조하세요. 조건이 맞지 않으면 다음 단계로 넘어가기 전에 다른 제도를 찾는 편이 낫습니다.

준비 서류와 신청 순서
- 대상 조건 확인
- 준비 서류 점검
- 공식 신청처에서 최종 확인

확인되지 않은 금액이나 처리 기간은 단정하지 않는 것이 안전합니다.`,
      rawText,
      headings: [
        { title: '대상 조건부터 확인하기' },
        { title: '준비 서류와 신청 순서' },
        { title: '공식 신청처에서 다시 볼 내용' },
      ],
      primaryKeyword: '정부지원 신청',
      secondaryKeywords: ['대상 조건', '준비 서류'],
      mode: 'seo',
      contentMode: 'seo',
      firstPartyEvidenceAvailable: false,
    });
    const stuffed = evaluate({
      title: '정부지원 신청 정부지원 신청 충격 100% 성공',
      body: '정부지원 신청은 정부지원 신청입니다. 정부지원 신청을 하면 무조건 3일 안에 50만원을 받습니다. 제가 직접 정부지원 신청을 해보니 100% 성공했습니다. 정부지원 신청을 꼭 하세요.',
      rawText,
      headings: [{ title: '정부지원 신청' }, { title: '정부지원 신청 방법' }],
      primaryKeyword: '정부지원 신청',
      mode: 'seo',
      contentMode: 'seo',
      firstPartyEvidenceAvailable: false,
    });

    expect(useful.modeScore.score).toBeGreaterThan(stuffed.modeScore.score);
    expect(useful.safetyScore.score).toBeGreaterThan(stuffed.safetyScore.score);
  });

  it('scores useful restrained homefeed copy above clickbait and emotional stuffing', () => {
    const grounded = evaluate({
      title: '정부지원 신청 전에 서류부터 보면 덜 헷갈려요',
      body: `신청 버튼부터 찾으면 중간에 다시 돌아오게 됩니다. 먼저 볼 건 대상 조건과 준비 서류예요.

조건은 제도마다 다릅니다. 내 상황과 맞는 항목을 표시해 두면 신청할지 말지 판단하기 쉬워져요.

- 대상 조건
- 준비 서류
- 공식 신청처

이 세 가지만 먼저 확인해도 불필요한 왕복을 줄일 수 있습니다.`,
      rawText: '신청 전에 대상 조건, 준비 서류, 공식 신청처를 확인합니다.',
      headings: [{ title: '버튼보다 조건을 먼저 보는 이유' }, { title: '준비 서류를 빠르게 거르는 기준' }, { title: '마지막 공식 확인처' }],
      primaryKeyword: '정부지원 신청',
      mode: 'homefeed',
      contentMode: 'homefeed',
      firstPartyEvidenceAvailable: false,
    });
    const clickbait = evaluate({
      title: '정부지원 신청 충격 대박 소름 진짜 비밀 공개',
      body: '솔직히 진짜 대박이거든요. 제가 직접 해봤는데 충격이었어요. 진짜 소름이고 완전 놀랐잖아요. 여러분은 어떠세요? 꼭 댓글과 공유 부탁드려요.',
      rawText: '신청 전에 대상 조건과 준비 서류를 확인합니다.',
      headings: [{ title: '충격 반전' }, { title: '진짜 비밀' }],
      primaryKeyword: '정부지원 신청',
      mode: 'homefeed',
      contentMode: 'homefeed',
      firstPartyEvidenceAvailable: false,
    });

    expect(grounded.modeScore.score).toBeGreaterThan(clickbait.modeScore.score);
    expect(clickbait.safetyScore.score).toBeLessThan(50);
  });

  it('does not select firsthand homefeed title formulas without explicit user evidence', () => {
    const forbidden = new Set([
      'hf_duration_exp', 'hf_direct_exp', 'hf_before_after', 'hf_accumulated',
      'hf_me_too', 'hf_confession', 'hf_final_choice',
    ]);
    const used: string[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const formula = selectTitleFormula('homefeed', attempt, used, '건강', undefined, true, false);
      expect(forbidden.has(formula.id)).toBe(false);
      used.push(formula.id);
    }
  });

  it('keeps SEO post-processing intent-first instead of force-injecting keywords', () => {
    const generator = fs.readFileSync(path.join(root, 'src', 'contentGenerator.ts'), 'utf8');
    expect(generator).not.toContain('ensureFront3: _isSeoModeForKw');
    expect(generator).not.toContain('enforceIntroConclusionKeyword(finalContent, primaryKeyword)');
    expect(generator).not.toContain('SEO 키워드 강제 앞배치');
    expect(generator).not.toContain('홈판 키워드 강제 앞배치');
    expect(generator).not.toContain('본문 2~4회 이상 자연스럽게 배치');
    expect(generator).not.toContain('메인 키워드는 앞 3글자');
    expect(generator).not.toContain('서브키워드 중 1~2개를 제목에 반드시 포함');
    expect(generator).toMatch(/titlePromptFull\s*=.*titleEvidenceContract/s);
  });
});
