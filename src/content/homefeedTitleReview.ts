/**
 * 홈판 제목 검수 공통 감싸개(2026-10-21) — 발행 화면 [글 생성] · 화면 다중계정 큐 · main 다중계정이 같은 순서를 쓴다.
 *   홈판 모드: 생성 → 제목 후보 캐기 · 토너먼트 · 비평(tournament) → (다른 제목이 이기면 그 제목으로 다시 생성) → 최종 약속 검수.
 *   검수 실패는 그대로 던진다(검수 안 된 초안으로 몰래 돌아가지 않음).
 *   엔진에 검수 경로가 없거나 원문이 없어 사실 대조를 못 하면 그렇다고 기록 · 안내하고 생성만 한다(titleReview 로 구분).
 * 홈판이 아닌 모드는 지금까지처럼 한 번 생성한다.
 */
import { generateReviewedDailyHomefeedArticle } from '../main/services/dailyEditorialPipeline.js';
import { reviewDailyPublishingTitle, validateDailyPublishingTitle } from '../main/services/dailyPublishingTitleReview.js';
import { windowSourceBody } from '../main/services/dailyHomefeedEditorial.js';
import type { DailyEditorialAngle } from '../main/services/dailyHomefeedEditorialContract.js';
import type { DailyTitleCaller, DailyTitleInput } from '../main/services/dailyPublishingTitleReview.js';

type Article = { readonly selectedTitle: string; readonly bodyPlain: string };
type Source = { readonly rawText: string; readonly [key: string]: unknown };
type Caller = { complete: DailyTitleCaller['callText']; timeoutMs?: number };
export type TitleReviewStatus = 'reviewed' | 'not-homefeed' | 'unsupported-engine' | 'no-source';

const MAX_GROUNDING = 48_000;

/**
 * 제목 검수에 넘길 원문(2026-10-21 실측: 키워드 수집 원문 61,209자 → DAILY_TITLE_INPUT 48,000자 상한).
 * 앞부분만 자르지 않고 windowSourceBody 로 뒤쪽 답 문장을 원문 그대로 남긴다 — 앵커 대조가 그대로 성립한다.
 */
export function titleReviewGrounding(rawText: unknown): string {
  return windowSourceBody(String(rawText || ''), MAX_GROUNDING);
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
  const deps = { callText: caller.complete, timeoutMs: caller.timeoutMs };
  const article = await generateReviewedDailyHomefeedArticle({ source: args.source, editorial: args.editorial, signal: args.signal }, {
    generate: args.generate,
    review: a => review(titleInput(a), { ...deps, tournament: true }),
    validate: a => validate(titleInput(a), deps),
    audit: args.audit,
  });
  args.log?.('✅ 제목 후보 캐기 · 토너먼트 · 비평 · 본문 약속 검수를 통과했습니다.');
  return { article, titleReview: 'reviewed' };
}
