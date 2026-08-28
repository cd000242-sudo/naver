// src/content/titleAnswerCheck.ts
// 제목이 꺼낸 말을 도입부가 "복창"만 하고 본문이 답하지 않는 경우를 잡는다.
//
// [2026-08-28 사장님 기준] "글자수는 중요하지 않아. 키워드로 만든 제목에 대한 답을
// 정확하게 주는지가 중요하지."
//
// 그 축을 재는 게 titlePayoffCheck 인데, 설계상 **도입부만** 본다("payoffZone").
// 그래서 제목을 도입부에서 그대로 되뇌면 상환율 100% 가 나온다.
//
// 실측(스트레이 키즈, gemini-3.1-flash-lite, 513자):
//   제목  "… 단독 입성, 해외 남성 아티스트 최초 기록"
//   도입부 "해외 남성 아티스트 최초로 … 단독 입성한다는 점에서 특별한 의미"
//   본문  공연 일정만. '최초'가 무엇과 비교해 최초인지(트와이스 구분)는 재료에
//         있는데도 한 줄도 없다.
//   그런데 [TitlePayoff] 는 100% 를 찍었다. 복창이 만점이 되는 구조다.
//
// 그래서 도입부가 아니라 **본문**을 본다. 도입부에만 있고 본문에서 한 번도 전개되지
// 않은 약속 = 답하지 않은 약속이다.
//
// 어휘 검사다. LLM 호출이 없어 비용이 0이고, 답이 '좋은' 답인지는 판단하지 못한다.
// titlePayoffCheck 과 같은 한계이며, 여기서 잡는 건 "아예 안 다룬" 경우뿐이다.
// 경고 전용 — 발행을 막지 않는다.

import { extractTitlePromise } from './titlePayoffCheck';

/** 이보다 약속이 적으면 판단하지 않는다 — 낱말 하나로 글을 나무라지 않는다. */
const MIN_PROMISE_TOKENS = 2;

/** 복창으로 볼 최소 개수. 한둘은 활용형이 어긋난 것일 수 있다. */
const MIN_ECHO_TO_WARN = 2;

export interface TitleAnswerInput {
  readonly title: string;
  readonly primaryKeyword?: string;
  /** 도입부 — 제목을 되뇌는 자리. */
  readonly introduction: string;
  /** 소제목과 본문, 마무리 — 실제로 답해야 하는 자리. */
  readonly body: string;
}

export interface TitleAnswerResult {
  /** 판단할 재료가 없으면 false — 없는 글을 나무라지 않는다. */
  readonly checked: boolean;
  readonly promised: readonly string[];
  /** 도입부에는 있는데 본문이 한 번도 다루지 않은 약속. */
  readonly echoedOnly: readonly string[];
  /** 본문이 다룬 비율 0~1. */
  readonly answerRate: number;
  readonly message: string;
}

const EMPTY: TitleAnswerResult = {
  checked: false,
  promised: [],
  echoedOnly: [],
  answerRate: 0,
  message: '',
};

export function checkTitleAnswer(input: TitleAnswerInput): TitleAnswerResult {
  try {
    const title = String(input?.title || '').trim();
    const intro = String(input?.introduction || '');
    const body = String(input?.body || '');
    if (!title || !intro || !body) return EMPTY;

    const promised = extractTitlePromise(title, input?.primaryKeyword);
    if (promised.length < MIN_PROMISE_TOKENS) return EMPTY;

    const answered = promised.filter((token) => body.includes(token));
    const echoedOnly = promised.filter((token) => intro.includes(token) && !body.includes(token));
    const answerRate = answered.length / promised.length;

    return {
      checked: true,
      promised,
      echoedOnly,
      answerRate,
      message: echoedOnly.length >= MIN_ECHO_TO_WARN
        ? `제목이 꺼낸 "${echoedOnly.join('", "')}" 을(를) 도입부만 되뇌고 본문이 다루지 않았다`
        : `제목의 약속 ${promised.length}개 중 ${answered.length}개를 본문이 다뤘다`,
    };
  } catch {
    return EMPTY; // 검사 실패로 발행을 막지 않는다.
  }
}

/** 로그 한 줄. 볼 게 없으면 빈 문자열. */
export function describeTitleAnswer(result: TitleAnswerResult): string {
  if (!result?.checked) return '';
  const pct = Math.round(result.answerRate * 100);
  return result.echoedOnly.length >= MIN_ECHO_TO_WARN
    ? `[TitleAnswer] ⚠️ 본문 응답 ${pct}% — ${result.message}`
    : `[TitleAnswer] ✅ 본문 응답 ${pct}% — ${result.message}`;
}
