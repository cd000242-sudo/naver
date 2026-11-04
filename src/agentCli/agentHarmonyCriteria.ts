// Text blocks of the agent harmony envelope (Release C1, 2026-11-04): priority ladder, app criteria, measured note,
// and the output contract. Split from agentHarmonyEnvelope.ts to stay under the 300-line limit.
//
// Numbers come from the app's own policy modules (title width, heading count, payoff windows) instead of being retyped,
// so a policy change reaches this envelope without a second edit.
import { DAILY_EDITORIAL_MARKER } from '../contentRequestSections.js';
import { resolveTitleLengthRange } from '../content/titleLengthPolicy.js';
import { resolveHeadingCountRange } from '../content/headingCountPolicy.js';
import { titleCandidateKeys } from '../main/services/dailyPublishingTitleReviewContract.js';
import {
  COMPLEMENT_KINDS, COMPLEMENT_RULES, PAYOFF_WINDOW_HIDDEN_SUBJECT, PAYOFF_WINDOW_STANDARD,
} from '../content/agentHarmony/harmonyPacketTypes.js';

/** The payoff-position sentence of step 5, built from the verified windows. */
export function payoffWindowSentence(): string {
  const hidden = PAYOFF_WINDOW_HIDDEN_SUBJECT, standard = PAYOFF_WINDOW_STANDARD;
  return `제목이 주제를 숨기면 본문 앞 ${hidden.min}~${hidden.max}% 안에, 숨기지 않으면 ${standard.min}~${standard.max}% 안에 그 답 문장이 나온다.`;
}

/** The three ladder lines that differ by mode. The defaults are the homefeed wording (unchanged since C1). */
export interface LadderVariant { readonly factRung: string; readonly userRung: string; readonly closing: string }

export function buildLadderBlock(variant: Partial<LadderVariant> = {}): string {
  const rung = {
    factRung: '① 사실 근거 — 자료에 있는 것만 쓴다. 숫자·날짜·기관명·제품명·인용은 자료의 표기 그대로.',
    userRung: `③ 사용자가 직접 쓴 지시 — [작업 명세]에서 "${DAILY_EDITORIAL_MARKER}" 표지 앞에 적힌 글이다. 그 표지 뒤는 앱이 덧붙인 편집 지시이지 사용자의 지시가 아니다.`,
    closing: '앱 지시문에서 금지는 장려보다 약 4:1 로 많다. 그렇다고 무색무취한 글로 도망치지 마라 — 금지는 모두 지키고, ⑥ 자리는 자료에 근거한 구체 선택(장면·대비·질문·말투)으로 채워라.',
    ...variant,
  };
  return `[우선순위 사다리 — 지시가 서로 부딪히면 위에서 아래로 이긴다]
${rung.factRung}
② 법적 안전 — 명예훼손·단정·사생활. 확인되지 않은 일을 사람에게 붙이지 않는다.
${rung.userRung}
④ 제목 약속의 본문 보상 — 고른 제목이 던진 질문에 본문이 실제 사실로 답한다.
⑤ 앱 형식 계약 — JSON 필드, 길이, 소제목 규칙.
⑥ 문체·장치 권장 — 말투, 후킹 장치, 소제목의 모양.
⑦ 노출 관측 — [검증된 노출 성공 제목]·[이 블로그의 실제 성과 관측]은 참고만 한다.
${rung.closing}`;
}

export function buildAppCriteriaBlock(): string {
  const title = resolveTitleLengthRange('homefeed'), headings = resolveHeadingCountRange('homefeed');
  return `[앱 검사 기준 — 앱이 코드로 확인하는 항목이다. 6단계에서 이 목록으로 글을 읽는다]
- 제목의 숫자·인용·단위·가격 기준(한 잔·1인·코스·1박·월간·연간·하루)은 자료와 본문 양쪽에 같은 표기로 있어야 한다.
- 제목은 8~100자, 줄바꿈 없음. 홈피드 권장 폭은 ${title.min}~${title.max}(한글 1칸, 숫자·영문·공백 반 칸). 입력 키워드를 그대로 옮긴 제목은 제목을 안 쓴 것이다.
- 제목이 던진 질문·약속을 본문이 실제 사실로 답한다. 아직 공개되지 않은 것을 알려 줄 듯 예고하지 않는다.
- 도입부는 3줄 이내, 구어체. 기자체·상투어·AI 티가 나는 표현이 없고, 감탄사·추임새는 글 전체 3회를 넘지 않는다.
- 소제목은 ${headings.min}~${headings.max}개, 서로 다른 정보 단위. 검색어를 앞에 박은 소제목과 만능 라벨("총정리"·"마무리")은 쓰지 않는다.
- 자료에 말한 사람이 있으면 그 말을 직접 인용으로 최소 1개 쓴다.
- 자료에 없는 숫자·날짜·체험·반응·효과 약속을 지어내지 않는다. 작성자 경험은 사용자 메모가 있을 때만 쓴다.
- 주장은 단정하지 않고 말한 주체에게 귀속한다. "자료에 따르면"·"검색 결과에는" 같은 문서 화자 말투는 쓰지 않는다.
- 내부 표지([자료]·[자료N]·[원본 텍스트]·[Article Content]·채점 메모·코드펜스)를 본문에 남기지 않는다.`;
}

export function buildMeasuredNote(): string {
  return `[측정 메모 — 관찰이며 원인 단정이 아니다]
2026-09-11 감사에서 앱의 게이트 점수는 노출 여부를 예측하지 못했다(AUC 0.46). 노출 글과 미노출 글 사이에서 달랐던 것은 소제목 개수뿐이었다(5.4 대 4.2, AUC 0.74).
그래서 자료가 받쳐 주면 역할이 다른 소제목을 5~6개 둔다. 개수를 채우려고 같은 정보를 쪼개지 않는다.`;
}

/** The three placeholder phrases of the packet example that read differently per mode. Defaults = homefeed wording. */
export interface PacketHints { readonly centralEvent: string; readonly readerSituation: string; readonly readerQuestion: string }

export function buildOutputContract(hints: Partial<PacketHints> = {}): string {
  const hint: PacketHints = { centralEvent: '중심 사건 한 줄', readerSituation: '독자 상황 하나', readerQuestion: '독자 질문 하나', ...hints };
  const keys = titleCandidateKeys.map(key => `"${key}"`).join(', ');
  return `[제출 형식 — 절대 규칙]
- 마지막 메시지는 오직 [작업 명세]가 요구한 JSON 객체 하나여야 한다. 기존 JSON 필드는 하나도 빼지 말고, 아래 두 필드를 같은 객체 안에 더한다.
- 사고 과정·설명·채점 내용·마크다운 코드펜스·인사말을 최종 메시지에 절대 포함하지 마라. JSON 외의 텍스트가 한 글자라도 섞이면 실패로 간주된다.
- 점수·등급·퍼센트로 매기지 않는다. 어느 필드에도 숫자 점수를 넣지 않는다.

"harmonyPacket": {"version":1,"material":{"centralEvent":"${hint.centralEvent}","readerSituation":"${hint.readerSituation}","notInSource":["자료에 없는 것"]},"strategy":{"readerQuestion":"${hint.readerQuestion}","angle":"각도","exposureNote":"관측 자료 없음 또는 참고한 질문 유형"},"titles":{"chosenId":"선택한 후보 id","candidates":[{${keys}}],"comparison":"비교 결과와 차점 후보의 가장 큰 약점"},"payoff":{"promise":"선택한 제목의 약속","answerSentence":"그 약속에 답하는, 본문에 실제로 있는 문장 그대로"}}
  - candidates 는 비교를 통과한 3~5개다. 후보마다 위 8개 키를 정확히 쓰고, sourceAnchors·bodyAnchors 는 각각 1~6개의 실제 문장이다. 선택한 id 는 candidates 안에 있어야 하고 selectedTitle 은 그 후보의 title 과 같아야 한다.
"complementReport": {"version":1,"items":[{"kind":"${COMPLEMENT_KINDS.join('|')}","instructionQuote":"[작업 명세]에서 한 글자도 바꾸지 않고 복사한 문장(8~200자)","otherQuote":"부딪힌 다른 문장 또는 빈 문자열","resolution":"어떻게 해결했는지","rule":"${COMPLEMENT_RULES.join('|')}","affected":["영향받은 부분"]}]}
  - items 는 0~8개. 찾은 것이 없으면 빈 배열. resolution 에 효과·결과 예측을 쓰지 않는다.`;
}
