// src/content/postDraftFactCheck.ts
// 초안이 나온 뒤 돌리는 팩트체크 라우터 호출부.
//
// [2026-08-28 실측] 같은 키워드를 세 엔진으로 돌렸더니 Gemini 글에서만 팩트체크가
// 아예 실행되지 않았다. 로그에 `팩트체크(...)` 줄이 없었다.
//
// 엔진 문제가 아니었다. contentGenerator 의 생성 루프는 분량이 목표를 넘으면
// `성공!` 분기에서 휴머나이저 → 팩트체크를 거쳐 반환하는데, **마지막 시도까지
// 분량이 모자라면** "글자수 경고 (최종)" 분기로 빠져 그 후처리를 통째로 건너뛰고
// 반환한다. Gemini 가 770자(목표 2,500자)를 냈기 때문에 그 분기로 간 것뿐이다.
//
// 게이트가 거꾸로 걸려 있었다. 짧은 초안은 모델이 재료를 제대로 못 쓴 결과라
// **가장 검사가 필요한 글인데 검사를 가장 적게 받는다.**
//
// 그래서 호출부를 모듈로 빼고 두 분기 모두에서 부른다.
// 실패는 절대 던지지 않는다 — 팩트체크가 발행을 막아선 안 된다(기존 계약 유지).
//
// [2026-09-22] 검수자는 삭제자가 아니다. 이 모듈은 더 이상 기본으로 본문을
// 고치지 않는다. runFactCheck 가 넘긴 issues 를 그대로 보고하고, `applyCorrections:
// true` 를 명시적으로 넘긴 경우에만 — 그것도 원문에 그대로 있는 claim + 비어 있지
// 않은 suggestedCorrection 조합만 — 치환한다. 무엇을 고쳤는지는 항상 changes 에 남긴다.

import type { FactIssue, FactIssueStatus, FactCheckCaller } from '../factCheckRouter.js';

interface FactCheckableDraft {
  bodyPlain?: string;
  bodyHtml?: string;
}

interface FactCheckSource {
  title?: unknown;
  keyword?: unknown;
  primaryKeyword?: unknown;
  rawText?: unknown;
  factCheckRawSource?: unknown;
}

export interface PostDraftFactCheckChange {
  readonly before: string;
  readonly after: string;
  readonly status: FactIssueStatus;
}

export interface PostDraftFactCheckOptions {
  /** Opt-in only. When false/omitted (default), the draft is never modified. */
  applyCorrections?: boolean;
  /** Routes the fact-check LLM call through the user-selected engine instead of the key-order chain. */
  caller?: FactCheckCaller;
}

export interface PostDraftFactCheckResult {
  /** The draft body — unchanged unless applyCorrections:true actually replaced something. */
  readonly content: string;
  readonly issues: FactIssue[];
  readonly applied: boolean;
  readonly engine: string;
  readonly model?: string;
  readonly changes: PostDraftFactCheckChange[];
}

function skippedResult(bodyPlain: string): PostDraftFactCheckResult {
  return { content: bodyPlain, issues: [], applied: false, engine: '', changes: [] };
}

/**
 * 초안에 팩트체크를 적용한다. 기본값(applyCorrections 생략/false)에서는 본문을
 * 절대 고치지 않는다 — issues 만 보고한다. `applyCorrections: true` 를 넘긴
 * 경우에만, 원문에 그대로 있는 claim + 비어 있지 않은 suggestedCorrection 쌍만
 * 골라 `draft` 를 제자리에서 고친다(호출부가 같은 객체를 계속 다듬는 구조라
 * 새 객체를 돌려주면 흐름이 끊긴다).
 */
export async function applyPostDraftFactCheck(
  draft: FactCheckableDraft,
  source: FactCheckSource,
  loadConfig: () => Promise<Record<string, unknown> | null>,
  options: PostDraftFactCheckOptions = {},
): Promise<PostDraftFactCheckResult> {
  const bodyPlain = draft?.bodyPlain || '';
  try {
    if (!bodyPlain) return skippedResult(bodyPlain);

    const config = await loadConfig().catch(() => null);
    const { resolveFactCheckEngine, runFactCheck } = await import('../factCheckRouter.js');
    const engine = resolveFactCheckEngine(config);
    if (engine === 'off') return skippedResult(bodyPlain);

    const topic = String(source?.title || source?.keyword || source?.primaryKeyword || '').slice(0, 100);
    const keyword = String(source?.keyword || source?.primaryKeyword || '').slice(0, 60) || undefined;

    const outcome = await runFactCheck(engine, {
      bodyPlain,
      topic,
      keyword,
      rawText: String(source?.rawText || source?.factCheckRawSource || ''),
      config,
      caller: options.caller,
    });

    for (const note of outcome.notes) console.log(`[FactCheck] ℹ️ ${note}`);

    const engineLabel = outcome.engineUsed;
    const shouldApply = options.applyCorrections === true;
    const changes: PostDraftFactCheckChange[] = [];
    let content = bodyPlain;

    if (shouldApply) {
      for (const issue of outcome.issues) {
        const suggestion = issue.suggestedCorrection?.trim();
        // Never apply an empty/deletion-shaped "correction" — that is a
        // deletion instruction, and this pipeline no longer honors those.
        if (!suggestion) continue;
        if (!content.includes(issue.claim)) continue;
        content = content.replace(issue.claim, suggestion);
        changes.push({ before: issue.claim, after: suggestion, status: issue.status });
      }
      if (changes.length > 0) {
        draft.bodyPlain = content;
        if (draft.bodyHtml) {
          let html = draft.bodyHtml;
          for (const change of changes) {
            if (html.includes(change.before)) html = html.replace(change.before, change.after);
          }
          draft.bodyHtml = html;
        }
        console.log(`[ContentGenerator] 🔎 팩트체크(${engineLabel}): ${changes.length}개 교정 적용`);
      } else if (outcome.issues.length > 0) {
        console.log(`[ContentGenerator] 🔎 팩트체크(${engineLabel}): ${outcome.issues.length}개 이슈 발견 (적용 가능한 교정 없음)`);
      } else {
        console.log(`[ContentGenerator] 🔎 팩트체크(${engineLabel}): 의심 문장 없음`);
      }
    } else if (outcome.issues.length > 0) {
      console.log(`[ContentGenerator] 🔎 팩트체크(${engineLabel}): ${outcome.issues.length}개 이슈 발견 (자동 교정 없음 — 검수 필요)`);
    } else {
      console.log(`[ContentGenerator] 🔎 팩트체크(${engineLabel}): 의심 문장 없음`);
    }

    return {
      content,
      issues: outcome.issues,
      applied: changes.length > 0,
      engine: engineLabel,
      model: outcome.model,
      changes,
    };
  } catch (error) {
    // 팩트체크 실패는 글 생성 실패가 아니다 — 경고만 남기고 원문을 그대로 쓴다.
    console.warn('[ContentGenerator] 팩트체크 실패 (글은 그대로 사용):', (error as Error)?.message || error);
    return skippedResult(bodyPlain);
  }
}
