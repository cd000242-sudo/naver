import type { DailyEditorialAngle } from './dailyHomefeedEditorialContract.js';
import { DAILY_EDITORIAL_MARKER } from '../../contentRequestSections.js';

interface Source {
  readonly rawText: string;
  readonly customPrompt?: string;
  readonly manualTitleOverride?: string;
  readonly [key: string]: unknown;
}
interface Article { readonly selectedTitle: string; readonly bodyPlain: string }
interface Choice { readonly title: string }
interface Dependencies<T extends Article> {
  readonly generate: (source: Source) => Promise<T>;
  readonly review: (article: T) => Promise<Choice>;
  readonly validate: (article: T, lockedTitle: string) => Promise<unknown>;
  readonly audit?: (value: Record<string, unknown>) => Promise<void>;
}
function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw Error('DAILY_CANCELLED');
}
/** A selected scene is only reusable when the fetched original still contains its anchors. */
function assertEditorialAnchors(source: Source, editorial?: DailyEditorialAngle): void {
  if (editorial === undefined) return;
  const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const invalid = () => { throw Error('DAILY_EDITORIAL_STALE: 선정한 장면의 근거가 현재 원문과 일치하지 않습니다. 소재를 다시 수집해 주세요.'); };
  if (!editorial || typeof editorial !== 'object' || Array.isArray(editorial) || typeof source.rawText !== 'string' || !source.rawText.trim()) invalid();
  const original = normalize(source.rawText);
  for (const key of ['scene', 'expectationGap', 'visualHook', 'bodyPayoff'] as const) {
    const quote = editorial[key];
    if (typeof quote !== 'string' || normalize(quote).length < 12 || quote.length > 500 || !original.includes(normalize(quote))) invalid();
  }
}
function instruction(source: Source, editorial?: DailyEditorialAngle): string {
  return `${source.customPrompt || ''}\n${DAILY_EDITORIAL_MARKER}\n`
    + '실제 자료에서 가장 의외인 행동·관계·선택을 선명하게 보여주고 그 이유를 궁금하게 만드는 제목을 쓴다. '
    + '독자가 아는 모습과 다른 실제 장면을 구체적으로 연결한다. 원문에 없는 반응·폭로·대사·경험을 만들지 않는다. '
    + '말줄임표나 그 이유라는 말만 붙인 제목은 거부한다. 제목의 질문에 도입에서 첫 답을 주고 뒤에 새로운 장면·근거를 더한다. '
    + '예고와 실제 방송, 코스 가격과 한 잔 가격 등 조건을 바꾸지 않는다. '
    + '다음 편집 메모의 인용 구절은 원문과 대조하고, 독자·제목 방향은 편집 의견으로만 사용한다.\n'
    + JSON.stringify(editorial || {});
}

/**
 * The source every homefeed generation starts from: cancellation + editorial anchor checks, then the editorial
 * instruction appended to the custom prompt. Shared so the harmony branch prepares exactly what this pipeline does.
 */
export function prepareEditorialSource(input: { readonly source: Source; readonly editorial?: DailyEditorialAngle; readonly signal?: AbortSignal }): Source {
  assertActive(input.signal);
  assertEditorialAnchors(input.source, input.editorial);
  return { ...input.source, customPrompt: instruction(input.source, input.editorial) };
}

/** Never edit an admitted V3 result; a different winner needs a fresh generation. */
export async function generateReviewedDailyHomefeedArticle<T extends Article>(
  input: { readonly source: Source; readonly editorial?: DailyEditorialAngle; readonly signal?: AbortSignal },
  deps: Dependencies<T>,
): Promise<T> {
  const prepared = prepareEditorialSource(input);
  const original = await deps.generate(prepared);
  assertActive(input.signal);
  const locked = String(input.source.manualTitleOverride || '').trim();
  if (locked) {
    if (original.selectedTitle !== locked) throw Error('DAILY_TITLE_LOCK_MISMATCH');
    const validation = await deps.validate(original, locked);
    assertActive(input.signal);
    await deps.audit?.({ version: 1, originalTitle: locked, finalTitle: locked, regenerated: false, validation });
    assertActive(input.signal);
    return original;
  }
  const review = await deps.review(original);
  assertActive(input.signal);
  const chosen = String(review.title || '').trim();
  if (!chosen) throw Error('DAILY_TITLE_REVIEW_REQUIRED');
  let final = original;
  let validation: unknown;
  if (chosen !== original.selectedTitle) {
    final = await deps.generate({ ...prepared, manualTitleOverride: chosen,
      customPrompt: `${prepared.customPrompt}\n내부 편집 심사에서 고른 제목을 그대로 유지하고, 그 제목의 질문에 실제 원문으로 답하는 본문을 작성한다.` });
    assertActive(input.signal);
    if (final.selectedTitle !== chosen) throw Error('DAILY_TITLE_LOCK_MISMATCH');
  }
  // 2026-10-21: 원래 제목이 이긴 분기도 최종 제목 · 본문 약속 검증을 거친다 — 실패하면 감사 기록 · 전달 전에 멈춘다.
  validation = await deps.validate(final, chosen);
  assertActive(input.signal);
  await deps.audit?.({ version: 1, originalTitle: original.selectedTitle, finalTitle: chosen,
    regenerated: final !== original, review, validation });
  assertActive(input.signal);
  return final;
}
