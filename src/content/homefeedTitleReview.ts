/**
 * 홈판 제목 검수 공통 감싸개(2026-10-21) — 발행 화면 [글 생성] · 화면 다중계정 큐 · main 다중계정이 같은 순서를 쓴다.
 *   홈판 모드: 생성 → 제목 후보 캐기 · 토너먼트 · 비평(tournament) → (다른 제목이 이기면 그 제목으로 다시 생성) → 최종 약속 검수.
 *   2026-11-03: 사람이 보는 이 경로는 검수 실패(판정 · 검수 엔진 문제)로 글을 버리지 않는다 — 판정을 그대로 기록하고
 *   ⚠️ 경고로 알린다(몰래 통과시키지 않음). 취소 · 그 밖의 오류는 그대로 던진다. 무인 매일 발행은 main.ts 가 보류한다.
 *   엔진에 검수 경로가 없거나 원문이 없어 사실 대조를 못 하면 그렇다고 기록 · 안내하고 생성만 한다(titleReview 로 구분).
 * 2026-11-04 Release D: 조화 세션 글(에이전트가 패킷을 낸 글)은 위 4회 검수 · 재생성 대신 패킷 최종 대조 + 독립 검수 1회(agentHarmony/harmonyReview).
 *   패킷이 없으면(플래그 OFF · API 엔진 · 패킷 누락) 아래 기존 경로가 그대로 돈다.
 * 홈판이 아닌 모드는 지금까지처럼 한 번 생성한다.
 */
import { generateReviewedDailyHomefeedArticle, prepareEditorialSource } from '../main/services/dailyEditorialPipeline.js';
import { reviewHarmonyArticle } from './agentHarmony/harmonyReview.js';
import { readAgentHarmony } from './agentHarmony/harmonyRuntime.js';
import { reviewDailyPublishingTitle, validateDailyPublishingTitle } from '../main/services/dailyPublishingTitleReview.js';
import { windowSourceBody } from '../main/services/dailyHomefeedEditorial.js';
import type { DailyEditorialAngle } from '../main/services/dailyHomefeedEditorialContract.js';
import type { DailyTitleCaller, DailyTitleInput } from '../main/services/dailyPublishingTitleReview.js';

type Article = { readonly selectedTitle: string; readonly bodyPlain: string };
type Source = { readonly rawText: string; readonly [key: string]: unknown };
type Caller = { complete: DailyTitleCaller['callText']; timeoutMs?: number };
export type TitleReviewStatus = 'reviewed' | 'review-warning' | 'not-homefeed' | 'unsupported-engine' | 'no-source';

const MAX_GROUNDING = 48_000;

/**
 * 제목 검수에 넘길 원문(2026-10-21 실측: 키워드 수집 원문 61,209자 → DAILY_TITLE_INPUT 48,000자 상한).
 * 앞부분만 자르지 않고 windowSourceBody 로 뒤쪽 답 문장을 원문 그대로 남긴다 — 앵커 대조가 그대로 성립한다.
 */
export function titleReviewGrounding(rawText: unknown): string {
  return windowSourceBody(String(rawText || ''), MAX_GROUNDING);
}

/**
 * 2026-11-04: log how long every title-review engine call took ("stage=<stage> <seconds>s"). The ~3 min 40 s review
 * (mining -> tournament -> candidates -> review) used to leave no line at all; the caller's log sink adds the
 * "[TitleReview] " prefix (main.ts). A call the review aborted (timeout / cancel) is logged once at the abort
 * moment even if the engine never settles. Pure observation: the answer and the thrown error pass through untouched.
 */
function withStageTiming(complete: Caller['complete'], log?: (message: string) => void, now: () => number = () => Date.now()): Caller['complete'] {
  if (!log) return complete;
  return async (prompt, options) => {
    const startedAt = now();
    let logged = false;
    const finish = (mark: string) => {
      if (logged) return;
      logged = true;
      try { log(`stage=${options.stage} ${((now() - startedAt) / 1000).toFixed(1)}s${mark}`); } catch { /* a log sink must never change the review */ }
    };
    const onAbort = () => finish(' 중단');
    options.signal.addEventListener('abort', onAbort, { once: true });
    try { const answer = await complete(prompt, options); finish(''); return answer; }
    catch (error) { finish(' 실패'); throw error; }
    finally { options.signal.removeEventListener('abort', onAbort); }
  };
}

export async function generateWithHomefeedReview<T extends Article>(args: {
  contentMode: string;
  source: Source;
  generate: (source: any) => Promise<T>;
  /** 선택한 작성 엔진의 검수 호출기. 엔진이 지원하지 않으면 null. */
  createCaller: () => Promise<Caller | null>;
  signal?: AbortSignal;
  editorial?: DailyEditorialAngle;
  blogProfile?: unknown;
  audit?: (record: Record<string, unknown>) => Promise<void>;
  log?: (message: string) => void;
  /** 테스트 · 특수 경로용 주입(기본은 실제 검수 함수). */
  review?: (input: DailyTitleInput, deps: DailyTitleCaller) => Promise<{ title: string }>;
  validate?: (input: DailyTitleInput, deps: DailyTitleCaller) => Promise<unknown>;
}): Promise<{ article: T; titleReview: TitleReviewStatus }> {
  if (args.contentMode !== 'homefeed') return { article: await args.generate(args.source), titleReview: 'not-homefeed' };
  const grounding = titleReviewGrounding(args.source.rawText);
  if (!grounding) {
    args.log?.('⚠️ 수집 원문이 없어 제목 검수를 하지 못했습니다 — 제목 · 본문 사실을 직접 확인해 주세요.');
    return { article: await args.generate(args.source), titleReview: 'no-source' };
  }
  let caller: Caller | null;
  try { caller = await args.createCaller(); } catch { caller = null; }
  if (!caller) {
    args.log?.('⚠️ 선택한 작성 엔진으로는 제목 검수를 하지 못했습니다 — 제목 · 본문 사실을 직접 확인해 주세요.');
    return { article: await args.generate(args.source), titleReview: 'unsupported-engine' };
  }
  const review = args.review || reviewDailyPublishingTitle;
  const validate = args.validate || validateDailyPublishingTitle;
  const titleInput = (article: Article): DailyTitleInput => ({
    title: article.selectedTitle, body: article.bodyPlain, sourceGrounding: grounding, sourceVerification: String(args.source.rawText),
    editorialAngle: args.editorial, blogProfile: args.blogProfile, signal: args.signal,
  });
  const deps = { callText: withStageTiming(caller.complete, args.log), timeoutMs: caller.timeoutMs };
  // 2026-11-03: a title-review failure here keeps the article and warns (the verdict is logged and audited as it came back).
  let reviewFailed = false, warned = false;
  const warn = (stage: string, error: unknown) => { warned = true; args.log?.(titleReviewWarning(stage, error)); return failure(error); };
  // 2026-11-04 Release D: generate first (same prepared source the pipeline uses). A harmony-session article (packet present)
  // gets the independent check only; anything else hands this same first article to the existing pipeline below.
  const prepared = prepareEditorialSource({ source: args.source, editorial: args.editorial, signal: args.signal });
  const first = await args.generate(prepared);
  const harmony = readAgentHarmony(first);
  if (harmony?.packet) {
    const check = await reviewHarmonyArticle({
      article: first, record: harmony, rawText: String(args.source.rawText), locked: String(args.source.manualTitleOverride || '').trim(),
      audit: args.audit, log: args.log, signal: args.signal,
      validate: async a => {
        try { return await validate(titleInput(a), deps); }
        catch (error) { if (!isSoftTitleFailure(error)) throw error; return warn('final', error); }
      },
    });
    if (warned || !check.ok) return { article: first, titleReview: 'review-warning' };
    args.log?.('✅ 조화 세션 제목 · 본문 약속 독립 검수를 통과했습니다.');
    return { article: first, titleReview: 'reviewed' };
  }
  let pending: T | undefined = first;
  const article = await generateReviewedDailyHomefeedArticle({ source: args.source, editorial: args.editorial, signal: args.signal }, {
    generate: async source => { if (pending) { const reuse = pending; pending = undefined; return reuse; } return args.generate(source); },
    review: async a => {
      try { return await review(titleInput(a), { ...deps, tournament: true }); }
      catch (error) { if (!isSoftTitleFailure(error)) throw error; reviewFailed = true; return { title: a.selectedTitle, ...warn('candidates', error) }; }
    },
    validate: async a => {
      if (reviewFailed) return { skipped: 'candidate-review-failed' };
      try { return await validate(titleInput(a), deps); }
      catch (error) { if (!isSoftTitleFailure(error)) throw error; return warn('final', error); }
    },
    audit: args.audit,
  });
  if (warned) return { article, titleReview: 'review-warning' };
  args.log?.('✅ 제목 후보 캐기 · 토너먼트 · 비평 · 본문 약속 검수를 통과했습니다.');
  return { article, titleReview: 'reviewed' };
}

function failure(error: unknown): { failed: string; message: string } {
  return { failed: titleErrorCode(error), message: String((error as Error)?.message || error).slice(0, 300) };
}
function titleErrorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === 'string') return code;
  return /^(DAILY_TITLE_[A-Z_]+)/u.exec(String((error as Error)?.message || ''))?.[1] || '';
}
/** Review verdicts and review-engine trouble are soft for a person-run [글 생성]; cancellation and other errors are not. */
function isSoftTitleFailure(error: unknown): boolean {
  const code = titleErrorCode(error);
  return code.startsWith('DAILY_TITLE_') && code !== 'DAILY_TITLE_CANCELLED';
}
function titleReviewWarning(stage: 'candidates' | 'final' | string, error: unknown): string {
  const code = titleErrorCode(error);
  const keep = stage === 'candidates' ? '처음 제목 그대로 글을 두었습니다' : '글은 그대로 두었습니다';
  if (code === 'DAILY_TITLE_QUALITY') {
    const reason = String(((error as { reasons?: unknown[] })?.reasons || [])[0] || '').trim().slice(0, 160);
    return `⚠️ 제목 검수: 읽을 이유 · 실제 장면이 약하다는 판정이 나왔습니다 — ${keep}. 발행 전에 제목을 확인하거나 바꿔 주세요.${reason ? ` (검수 의견: ${reason})` : ''}`;
  }
  if (['DAILY_TITLE_NUMBER', 'DAILY_TITLE_QUOTE', 'DAILY_TITLE_EVIDENCE', 'DAILY_TITLE_PRICE_BASIS'].includes(code)) {
    return `⚠️ 제목 검수: 제목의 숫자 · 인용을 원문과 끝까지 대조하지 못했습니다 — ${keep}. 발행 전에 제목의 숫자 · 인용을 직접 확인해 주세요.`;
  }
  return `⚠️ 제목 검수를 끝내지 못했습니다(${code}) — ${keep}. 발행 전에 제목을 직접 확인해 주세요.`;
}
