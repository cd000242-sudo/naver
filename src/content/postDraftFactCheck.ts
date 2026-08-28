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

export interface PostDraftFactCheckResult {
  readonly ran: boolean;
  readonly engineUsed: string;
  readonly correctedCount: number;
}

const SKIPPED: PostDraftFactCheckResult = { ran: false, engineUsed: '', correctedCount: 0 };

/**
 * 초안에 팩트체크를 적용한다. `draft` 를 제자리에서 고친다 —
 * 호출부(생성 루프)가 같은 객체를 계속 다듬는 구조라 새 객체를 돌려주면 흐름이 끊긴다.
 */
export async function applyPostDraftFactCheck(
  draft: FactCheckableDraft,
  source: FactCheckSource,
  loadConfig: () => Promise<Record<string, unknown> | null>,
): Promise<PostDraftFactCheckResult> {
  try {
    if (!draft?.bodyPlain) return SKIPPED;

    const config = await loadConfig().catch(() => null);
    const { resolveFactCheckEngine, runFactCheck } = await import('../factCheckRouter.js');
    const engine = resolveFactCheckEngine(config);
    if (engine === 'off') return SKIPPED;

    const topic = String(source?.title || source?.keyword || source?.primaryKeyword || '').slice(0, 100);
    const keyword = String(source?.keyword || source?.primaryKeyword || '').slice(0, 60) || undefined;

    const outcome = await runFactCheck(engine, {
      bodyPlain: draft.bodyPlain,
      topic,
      keyword,
      rawText: String(source?.rawText || source?.factCheckRawSource || ''),
      config,
    });

    for (const note of outcome.notes) console.log(`[FactCheck] ℹ️ ${note}`);

    if (outcome.suspicious.length > 0) {
      draft.bodyPlain = outcome.corrected;
      if (draft.bodyHtml) {
        for (const item of outcome.suspicious) {
          if (draft.bodyHtml.includes(item.original)) {
            draft.bodyHtml = draft.bodyHtml.replace(item.original, item.replacement);
          }
        }
      }
      console.log(`[ContentGenerator] 🔎 팩트체크(${outcome.engineUsed}): ${outcome.suspicious.length}개 의심 문장 교정`);
    } else {
      console.log(`[ContentGenerator] 🔎 팩트체크(${outcome.engineUsed}): 의심 문장 없음`);
    }

    return { ran: true, engineUsed: outcome.engineUsed, correctedCount: outcome.suspicious.length };
  } catch (error) {
    // 팩트체크 실패는 글 생성 실패가 아니다 — 경고만 남기고 원문을 그대로 쓴다.
    console.warn('[ContentGenerator] 팩트체크 실패 (글은 그대로 사용):', (error as Error)?.message || error);
    return SKIPPED;
  }
}
