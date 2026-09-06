/**
 * [2026-09-06 사장님] "글 올리면 굳이 글을 신경 안 써도 되게" — 기준 1번은 제목의 궁금증을 본문이 푸는가다.
 *
 * 그동안 이 축은 재기만 했다(TitleAnswer 로그). 59편 실측: 본문 응답률 중앙값 83%, 60% 미만 10편(17%),
 * 국민연금 편은 0% 인데도 나갔다. 나머지 기준(환각·모드 점수·소제목·인용)은 게이트가 잡아 다시 쓰게
 * 하는데 이것만 빠져 있었다. 이제 응답률이 바닥 아래면 한 번 다시 쓰게 한다 — 새 차단은 없다.
 *
 * 순수 함수. 재시도 지시문은 "무엇을 안 갚았는지"를 그대로 적는다 — 모델은 규칙보다 재료를 따른다(09-04 실측).
 */
import type { TitleAnswerResult } from './titleAnswerCheck';

/** 이 아래면 제목이 약속한 것을 본문이 갚지 않은 글로 본다. 59편 실측에서 17% 가 걸린다. */
export const TITLE_ANSWER_RETRY_FLOOR = 0.6;

export function shouldRetryForTitleAnswer(result: Pick<TitleAnswerResult, 'checked' | 'answerRate' | 'promised'> | null | undefined): boolean {
  if (!result || !result.checked) return false;
  if (!Array.isArray(result.promised) || result.promised.length < 2) return false;
  return Number(result.answerRate) < TITLE_ANSWER_RETRY_FLOOR;
}

export function buildTitleAnswerRetryInstruction(
  title: string,
  result: Pick<TitleAnswerResult, 'promised' | 'echoedOnly' | 'answerRate'>,
  unpaid: readonly string[],
): string {
  const missing = unpaid.filter(Boolean).slice(0, 6);
  const pct = Math.round(Number(result.answerRate || 0) * 100);
  return [
    '[제목 약속 미이행 — 반드시 고칠 것]',
    `제목 "${String(title || '').trim()}" 이 독자에게 답하겠다고 약속한 것 중 본문이 다루지 않은 것: ${missing.join(', ')} (본문 응답 ${pct}%).`,
    '- 위 항목 하나하나를 소제목 하나 또는 첫 화면 문단에서 직접 답한다. 언급만 하지 말고 독자가 판단할 수 있는 내용(조건·수치·순서·기준)을 쓴다.',
    '- 제목은 그대로 두고 본문을 채운다. 제목을 바꿔 약속을 줄이는 방식으로 맞추지 않는다.',
    '- 자료에 답이 없는 항목은 "자료에서 확인되지 않는다"고 본문에 밝힌다. 지어내지 않는다.',
  ].join('\n');
}
