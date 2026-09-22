// [2026-09-22 Critique Loop] Critic 1 prompt (facts / intent / title promise / missing info)
// and the Editorial/Homefeed critic prompt. Inputs are deliberately short: date, keyword,
// intent, title, the visible introduction, sections, the evidence pack and a short contract.
// The Writer's prompt is never copied here.

import type { ArticleModel, EvidencePack } from './types';
import { describeSections } from './sectionModel';
import { describeEvidence, describeKeyFacts, evidenceHasConcreteValues } from './evidence';

export interface CriticContext {
  readonly today: string;
  readonly keyword: string;
  readonly searchIntent: string;
  readonly contentMode: string;
  readonly topicType: string;
}

const SCHEMA = `{"status":"PASS|REVISION_REQUIRED|NEEDS_MORE_RESEARCH","issues":[{"issueKey":"","severity":"CRITICAL|MAJOR|MINOR","type":"FACT_ERROR|CONTRADICTION|MIXED_ENTITY|UNSUPPORTED_VALUE|MISSING_INFORMATION|TITLE_PROMISE|SEARCH_INTENT|REDUNDANCY|STRUCTURE|STYLE","sectionId":"","exactSpan":"","operation":"ADD|REMOVE|REPLACE|REORDER","evidenceIds":[],"problem":"","requiredChange":""}],"researchQueries":[]}`;

export function describeSearchIntent(keyword: string, topicType: string, contentMode: string): string {
  const base = `"${keyword}" 검색자가 알고 싶은 것`;
  if (topicType === 'POLICY') return `${base}: 대상·조건·기간·금액·신청 방법과 지금 시점의 상태`;
  if (topicType === 'CAR') return `${base}: 가격·트림·옵션·견적 비교와 선택 기준`;
  if (topicType === 'NEWS_ISSUE') return `${base}: 무슨 일이 언제 누구에게 왜 일어났고 지금 어떤 상태인지`;
  return contentMode === 'homefeed' ? `${base}: 제목이 던진 궁금증의 답과 그 근거` : `${base}: 실제로 쓸 수 있는 답과 근거`;
}

export function buildCriticPrompt(ctx: CriticContext, model: ArticleModel, evidence: EvidencePack): string {
  const concrete = evidenceHasConcreteValues(evidence);
  return `너는 네이버 블로그 글의 사실 검수자다. 오늘: ${ctx.today}. 키워드: ${ctx.keyword}. 모드: ${ctx.contentMode}/${ctx.topicType}.
검색 의도: ${ctx.searchIntent}

## 근거 자료 (이것만 사실의 기준이다)
${describeEvidence(evidence) || '(자료 없음)'}

${describeKeyFacts(evidence)}

## 글 (독자가 실제로 보는 상태, sectionId 로 지칭)
제목: ${model.title}
${describeSections(model)}

## 검수 계약 (네 가지만 본다)
A. TITLE PROMISE — 제목이 던진 질문/약속에 본문이 답하는가.
B. SEARCH INTENT — 검색 의도의 핵심 답이 있고, 너무 늦게 나오지 않는가.
C. MISSING INFORMATION — 자료에 있는 핵심 정보(기간·금액·수량·비율·조건·일정·행동 방법)가 본문에 빠졌는가.
D. CONTRADICTION — 자료와 반대되는 사실, 다른 대상/정책/제품/사건의 혼합, 현재/과거 뒤바뀜, 섹션 간 모순.

severity 규칙:
- CRITICAL: 자료와 반대되는 사실, 다른 대상 혼합, 현재/과거 뒤바뀜, 제목 핵심 사실 오류, 검색 대상 자체를 잘못 설명, 명확한 공식 정보와 충돌. 오직 이것만.
- MAJOR: 제목 핵심 질문 미해결, 핵심 의도 미답, 자료에 있는 핵심 정보 누락, 답이 너무 늦음, 섹션 간 모순, 핵심 섹션 비어 있음, 같은 핵심 사실의 무의미한 반복.
- MINOR: 자연스러움·표현·다양성·조사/어미·가벼운 반복·가독성·취향. 문체는 어떤 경우에도 CRITICAL 이 아니다.
- 일반적인 설명 문장, 배경 설명, 독자 공감 문장은 결함이 아니다. 자료와 충돌하지 않는 한 지적하지 않는다.
- 근거 없이 "더 구체적으로/더 자연스럽게/더 풍부하게"를 요구하지 않는다. ${concrete ? '자료에 구체 값이 있으니 빠진 값이 있으면 그 값과 evidenceIds 를 적는다.' : '자료에 구체 값이 없다. 구체성을 요구하지 말고, 필요하면 NEEDS_MORE_RESEARCH 와 researchQueries 로 답한다.'}
- 모든 문장을 자료와 글자 단위로 대조하지 않는다. 자료가 뒷받침하지 않는 "숫자·날짜·기관·조건·인용·통계·명단" 만 문제 삼는다.
- 자료에 없는 인용(발언자·나이 특정), 설문/통계 수치, 기관·은행 명단, 향후 일정 단정은 문체가 아니라 사실 결함이다 — MINOR 로 두지 않는다. 같은 주장이 여러 섹션에 다른 말로 반복되면 섹션마다 issue 를 낸다.

issue 규칙:
- exactSpan 은 해당 section 본문에 실제로 있는 문장/구절을 그대로 복사한다. MISSING_INFORMATION + ADD 는 exactSpan 에 삽입할 소제목(H2/H3) 제목을 적어도 된다.
- FACT_ERROR/CONTRADICTION/MIXED_ENTITY/UNSUPPORTED_VALUE 는 evidenceIds 필수.
- 같은 문제를 여러 issue 로 쪼개지 않는다. 문제가 없으면 issues 는 빈 배열, status 는 PASS.
- 자료가 부족해 판단이 불가능하면 status=NEEDS_MORE_RESEARCH 와 researchQueries(검색어 1~3개).

JSON 으로만 답하라 (설명 금지):
${SCHEMA}`;
}

export interface EditorialContext extends CriticContext {
  readonly homefeed: boolean;
  /** Values already removed as unsupported by the fact loop — the editorial critic must not ask for them back. */
  readonly removedValues?: readonly string[];
}

export function buildEditorialPrompt(ctx: EditorialContext, model: ArticleModel): string {
  const homefeedRules = ctx.homefeed
    ? `
홈판(모바일 첫 화면) 기준 추가 항목 — 사실 과장으로 고치라고 하지 않는다. "더 자극적으로"는 금지:
- 첫 화면(도입부 3문장)에 계속 읽을 이유가 있는가. 제목의 궁금증이 도입부로 이어지는가.
- 답이 본문 뒤쪽에 숨어 있지 않은가.
- 훅을 위해 사실을 부풀린 문장이 있는가 (있으면 REPLACE, 근거대로 낮춘다).
- "오늘은 ~에 대해 알아보겠습니다" 식 메타 시작이 있는가.
- 섹션마다 같은 사실을 다시 쓰는가. 억지 SEO 문구가 있는가.`
    : '';
  const removed = ctx.removedValues && ctx.removedValues.length > 0
    ? `
## 사실 검수에서 제거된 값 (자료에 없어 지워졌다 — 제목·구조를 맞추려고 다시 넣으라고 요구하지 않는다. 제목과 어긋나면 제목 쪽을 고치라고 한다)
${ctx.removedValues.join(', ')}
`
    : '';
  return `너는 네이버 블로그 글의 편집 데스크다. 사실 검수는 끝났다. 구조·중복·제목-본문 초점만 본다. 오늘: ${ctx.today}. 키워드: ${ctx.keyword}. 모드: ${ctx.contentMode}.
검색 의도: ${ctx.searchIntent}
${removed}
## 글
제목: ${model.title}
${describeSections(model)}

## 블로킹 후보 (MAJOR 까지만, CRITICAL 없음)
- 큰 반복: 같은 핵심 숫자·날짜·조건·사실이 3개 이상 섹션에서 새 의미 없이 반복 (도입 언급 + 상세 + 요약 1회는 정상). type=REDUNDANCY, 반복되는 문장 중 하나를 exactSpan, operation=REMOVE 또는 REPLACE.
- 답이 너무 늦음: 핵심 답이 마지막 섹션에만 있음. type=STRUCTURE.
- 소제목과 본문 불일치: 소제목이 약속한 내용이 본문에 없음. type=STRUCTURE.
- 빈 섹션. type=STRUCTURE, exactSpan=소제목, operation=ADD.
- 억지 키워드 삽입: 문장이 깨질 정도로 키워드를 넣음. type=STYLE 은 MINOR 이지만, 문장이 깨졌으면 STRUCTURE MAJOR.
- 제목·도입부·본문의 초점이 서로 다름. type=TITLE_PROMISE.
${homefeedRules}

MINOR(자연스러움·표현·취향)는 적어도 되지만 수정 요구가 아니다. 좋은 섹션은 건드리지 않는다. 정보형 글은 답→근거→설명→행동 순서가 자연스럽지만 하나의 틀을 강요하지 않는다. 이슈/연예형은 이야기 흐름을 허용하되 제목의 궁금증은 반드시 풀려야 한다.
exactSpan 은 본문에 있는 문장을 그대로 복사한다.

JSON 으로만 답하라:
${SCHEMA}`;
}
