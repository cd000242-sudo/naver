/**
 * 아직 오지 않은 날을 과거형으로 쓴 문장 감지.
 *
 * 사장님 실측(2026-09-01):
 *   "2026년 9월 마지막 주부터 10월 9일까지 침구류 매출은 전주 대비 25% 증가했습니다."
 * 오늘이 9월 1일인데 10월 9일까지의 실적을 과거형으로 단정했다.
 *
 * 같은 글에서 행사 이름은 "2025 구스&울 페어" 인데 기간은 "2026년 10월 17일~11월 9일" 이다.
 * 2025년 보도자료를 읽고 연도만 갱신한 것이다.
 *
 * 뿌리는 우리 지시다. contentGenerator 가 "지금은 2026년입니다. 년도를 표기할 때는
 * 반드시 '2026년' 형태로 쓰세요" 라고 못박는데, 자료에 적힌 날짜는 건드리지 말라는
 * 단서가 없었다. 그래서 과거 자료의 날짜까지 갱신했다.
 *
 * 독자가 이걸 읽고 백화점에 가면 행사가 없다. 신뢰가 한 번에 무너지는 종류라
 * 근거 게이트로는 못 잡는다 — 그 날짜가 자료에 실제로 있기 때문이다.
 *
 * 경고만 낸다.
 */

export interface FutureDatedPastClaim {
  readonly sentence: string;
  readonly date: string;
}

/** 한국어 과거 종결. 현재·미래형은 잡지 않는다. */
const PAST_TENSE = /(?:했습니다|했다|했어요|됐습니다|됐다|됐어요|였습니다|이었습니다|[아었았]습니다|[늘줄]었|증가했|감소했|기록했|진행됐|마감됐)/u;

/** "2026년 10월 9일" · "10월 9일" 둘 다 잡는다. */
const DATE = /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/gu;

const MAX_REPORTED = 6;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function findFutureDatedPastClaims(
  text: string | undefined,
  now: Date = new Date(),
): FutureDatedPastClaim[] {
  const body = String(text ?? '');
  if (!body.trim()) return [];

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const found: FutureDatedPastClaim[] = [];

  for (const sentence of splitSentences(body)) {
    if (!PAST_TENSE.test(sentence)) continue;

    for (const match of sentence.matchAll(DATE)) {
      const year = match[1] ? Number(match[1]) : today.getFullYear();
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;
      if (!Number.isFinite(day) || day < 1 || day > 31) continue;

      const when = new Date(year, month - 1, day);
      if (when.getTime() <= today.getTime()) continue;

      found.push({ sentence, date: match[0] });
      break; // 한 문장에 여러 날짜가 있어도 한 번만 보고한다.
    }
    if (found.length >= MAX_REPORTED) break;
  }
  return found;
}

export function describeFutureDatedPastClaims(claims: readonly FutureDatedPastClaim[]): string[] {
  return claims.map((claim) => (
    `아직 오지 않은 날("${claim.date}")을 이미 일어난 일처럼 썼습니다`
    + ` — 자료가 지난해 것이라면 연도를 그대로 옮겨야 합니다: "${claim.sentence.slice(0, 44)}…"`
  ));
}
