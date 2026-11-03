/**
 * [2026-11-04] 사장님 "에이전트 모드로 글생성하면 엄청 느리고 가끔씩 글생성마저 안되는경우가".
 * 11/3 로그: 홈판 [글 생성] 두 번 모두 첫 원고 직후 "[PromptAdherence] 🔁 사용자 프롬프트 핵심 반영 부족 (14% · 7%)" 로
 * 같은 원고를 처음부터 다시 썼다(에이전트 한 번 약 3분). 사용자 프롬프트가 아니라 dailyEditorialPipeline 이 customPrompt 에
 * 덧붙인 앱 내부 편집 지시문("[DAILY HOMEFEED EDITORIAL] … 편집 메모의 인용 구절은 원문과 대조하고 …")을 채점하고 있었다.
 * 채점 · 재확인 블록은 사용자가 쓴 부분만 본다. 모델에게 가는 지시문은 그대로다.
 */
import { describe, expect, it, vi } from 'vitest';
import { assessCustomPromptAdherence } from '../contentPromptAdherence';
import { DAILY_EDITORIAL_MARKER, buildCustomPromptReminderBlock, userAuthoredPrompt } from '../contentRequestSections';
import { generateReviewedDailyHomefeedArticle } from '../main/services/dailyEditorialPipeline.js';

// Same wording dailyEditorialPipeline.instruction() appends (the 11/3 failing runs had no user prompt at all).
const INTERNAL = `\n${DAILY_EDITORIAL_MARKER}\n실제 자료에서 가장 의외인 행동·관계·선택을 선명하게 보여주고 그 이유를 궁금하게 만드는 제목을 쓴다. `
  + '독자가 아는 모습과 다른 실제 장면을 구체적으로 연결한다. 원문에 없는 반응·폭로·대사·경험을 만들지 않는다. '
  + '다음 편집 메모의 인용 구절은 원문과 대조하고, 독자·제목 방향은 편집 의견으로만 사용한다.\n{}'
  + '\n내부 편집 심사에서 고른 제목을 그대로 유지하고, 그 제목의 질문에 실제 원문으로 답하는 본문을 작성한다.';
const article = {
  selectedTitle: '현대차 인도 투자 155억 달러, 공장 한 곳 건설비로 읽으면 틀리는 이유',
  introduction: '현대차그룹이 인도에 155억 달러를 투자한다고 밝혔습니다. 이 돈이 모두 공장 건설비는 아닙니다.',
  headings: [{ title: '155억 달러는 어디에 쓰이나', content: '약 20%는 AI와 스타트업 투자에 쓰일 계획입니다. 가격표도 함께 정리했습니다.' }],
  conclusion: '숫자보다 쓰임새를 먼저 보면 기사마다 다른 금액이 이해됩니다.',
} as any;

describe('internal editorial instruction is not the user prompt', () => {
  it('userAuthoredPrompt keeps only what comes before the app marker', () => {
    expect(userAuthoredPrompt(INTERNAL)).toBe('');
    expect(userAuthoredPrompt(`친근한 말투로 써 주세요.${INTERNAL}`)).toBe('친근한 말투로 써 주세요.');
    expect(userAuthoredPrompt('반드시 가격표를 포함해 주세요.')).toBe('반드시 가격표를 포함해 주세요.');
    expect(userAuthoredPrompt(undefined)).toBe('');
  });

  it('no user prompt + internal block: adherence is not checked, so no regeneration is asked for', () => {
    const report = assessCustomPromptAdherence(article, { customPrompt: INTERNAL });
    expect(report.checked).toBe(false);
    expect(report.passed).toBe(true);
    expect(report.retryInstruction).toBe('');
  });

  it('a real user prompt is still judged, on its own words only', () => {
    const kept = assessCustomPromptAdherence(article, { customPrompt: `반드시 가격표를 포함해 주세요.${INTERNAL}` });
    expect(kept.checked).toBe(true);
    expect(kept.passed).toBe(true);
    expect(kept.requiredTerms.join(' ')).not.toMatch(/편집|메모|구절|대조/);
    const missed = assessCustomPromptAdherence(article, { customPrompt: `반드시 환율표와 연도별 비교표를 넣어 주세요.${INTERNAL}` });
    expect(missed.checked).toBe(true);
  });

  it('the personal-prompt reminder repeats only the user part (never the internal block)', () => {
    expect(buildCustomPromptReminderBlock(INTERNAL)).toBe('');
    const block = buildCustomPromptReminderBlock(`친근한 말투로 써 주세요.${INTERNAL}`);
    expect(block).toContain('친근한 말투로 써 주세요.');
    expect(block).not.toContain(DAILY_EDITORIAL_MARKER);
    expect(block).not.toContain('편집 메모');
  });

  it('the editorial pipeline still sends its instruction to the model, starting with the shared marker', async () => {
    const generate = vi.fn(async (source: { customPrompt?: string }) => ({ selectedTitle: '제목', bodyPlain: String(source.customPrompt) }));
    await generateReviewedDailyHomefeedArticle({ source: { rawText: '원문', customPrompt: '내 지시' } }, {
      generate, review: async () => ({ title: '제목' }), validate: async () => ({}),
    });
    const sent = String((generate.mock.calls[0] as any)[0].customPrompt);
    expect(sent.startsWith('내 지시\n')).toBe(true);
    expect(sent).toContain(`${DAILY_EDITORIAL_MARKER}\n`);
    expect(userAuthoredPrompt(sent)).toBe('내 지시');
  });
});
