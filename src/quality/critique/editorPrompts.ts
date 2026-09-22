// [2026-09-22 Critique Loop] Targeted-revision (Editor) and Verification prompts.
// The Editor receives ONLY the sections it must change, the issues on them, the cited
// evidence and a short context — never the whole article, never healthy sections.

import type { ArticleModel, EvidencePack, QualityIssue } from './types';
import { describeSections } from './sectionModel';
import { describeEvidence } from './evidence';

export interface EditorContext {
  readonly today: string;
  readonly keyword: string;
  readonly title: string;
  readonly searchIntent: string;
}

function describeIssue(issue: QualityIssue): string {
  const anchor = issue.insertionAnchor ? ` (삽입 위치: 소제목 "${issue.insertionAnchor}" 아래)` : '';
  return `- issueKey=${issue.issueKey} [${issue.severity}/${issue.type}/${issue.operation}] section=${issue.sectionId}${anchor}
  대상 구절: "${issue.exactSpan}"
  문제: ${issue.problem}
  요구 변경: ${issue.requiredChange}${issue.evidenceIds.length > 0 ? `\n  근거: ${issue.evidenceIds.join(', ')}` : ''}`;
}

export function buildEditorPrompt(
  ctx: EditorContext,
  model: ArticleModel,
  targetSectionIds: readonly string[],
  issues: readonly QualityIssue[],
  evidence: EvidencePack,
): string {
  const evidenceIds = [...new Set(issues.flatMap((i) => i.evidenceIds))];
  const evidenceBlock = describeEvidence(evidence, evidenceIds.length > 0 ? evidenceIds : undefined);
  return `너는 네이버 블로그 글의 교정 편집자다. 아래 섹션만 최소한으로 고친다. 오늘: ${ctx.today}. 키워드: ${ctx.keyword}. 제목: ${ctx.title}.
검색 의도: ${ctx.searchIntent}

## 근거 자료
${evidenceBlock || '(인용 자료 없음 — 새 사실을 만들지 않는다)'}

## 고칠 섹션 (이 섹션들만 돌려준다)
${describeSections(model, targetSectionIds)}

## 고쳐야 할 문제
${issues.map(describeIssue).join('\n')}

## 규칙
- operation 대로만 한다. REPLACE 는 그 구절만 바꾼다. REMOVE 는 그 구절만 뺀다. ADD 는 지정 위치에 자료 기반 문장을 넣는다. REORDER 는 문장 순서만 바꾼다.
- 문제로 지목되지 않은 문장은 한 글자도 바꾸지 않는다. 문체·어미·분량을 손보지 않는다. 좋은 문장을 다시 쓰지 않는다.
- 자료에 없는 숫자·날짜·기관·조건을 만들지 않는다. 자료가 없으면 그 issue 는 patchedIssueKeys 에 넣지 않고 그대로 둔다.
- 미지원 값을 고칠 때는 자료가 실제로 말하는 표현으로 바꾸거나 그 문장을 통째로 뺀다. 같은 주장을 더 흐린 말("10월 중", "곧", "약")로 바꾸는 것은 수정이 아니다 — 여전히 자료에 없는 단정이다.
- 소제목(title)은 바꾸지 않는다. 섹션을 합치거나 나누지 않는다.
- 요청받지 않은 섹션은 돌려주지 않는다.

JSON 으로만 답하라:
{"sections":[{"sectionId":"","text":"수정된 섹션 본문 전체"}],"patchedIssueKeys":["실제로 고친 issueKey"]}`;
}

export function buildVerificationPrompt(
  ctx: EditorContext,
  model: ArticleModel,
  revisedSectionIds: readonly string[],
  pendingIssues: readonly QualityIssue[],
  evidence: EvidencePack,
  round: number,
): string {
  const evidenceIds = [...new Set(pendingIssues.flatMap((i) => i.evidenceIds))];
  return `너는 수정 검증자다. 편집자가 "고쳤다"고 보고했지만 믿지 않는다. 수정된 섹션을 직접 보고 각 issue 가 실제로 해소됐는지 판정한다. 오늘: ${ctx.today}. 키워드: ${ctx.keyword}. 제목: ${ctx.title}.

## 근거 자료
${describeEvidence(evidence, evidenceIds.length > 0 ? evidenceIds : undefined) || '(자료 없음)'}

## 수정된 섹션 (현재 상태)
${describeSections(model, revisedSectionIds)}

## 판정할 issue
${pendingIssues.map(describeIssue).join('\n')}

## 규칙
- 해소 기준: 요구 변경이 실제로 반영됐고 자료와 충돌하지 않는다. 문구가 달라졌지만 문제가 남았으면 stillOpen.
- 새 issue 는 이번 수정이 새로 만든 CRITICAL(자료와 반대되는 사실·대상 혼합·현재/과거 뒤바뀜)만 적는다.${round >= 2 ? ' 새 MAJOR 는 이번 수정이 원인임이 분명할 때만(causedByRevision=true) 적는다.' : ' 새 MAJOR 는 적지 않는다.'}
- 문체·표현·취향은 판정 대상이 아니다.
- exactSpan 은 수정된 섹션 본문에 있는 구절을 그대로 복사한다.

JSON 으로만 답하라:
{"resolved":["issueKey"],"stillOpen":["issueKey"],"newIssues":[{"severity":"CRITICAL|MAJOR","type":"","sectionId":"","exactSpan":"","operation":"REPLACE|REMOVE|ADD","evidenceIds":[],"problem":"","requiredChange":"","causedByRevision":true}]}`;
}
