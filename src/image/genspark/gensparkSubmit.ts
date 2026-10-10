// src/image/genspark/gensparkSubmit.ts
// [2026-10-10] 젠스파크 프롬프트 전송: /ai_image 로 직접 이동 → 신호 검사 → 모델 → 설정 → 입력 → 전송 → 작업 주소(/agents?id=) 확보.
//   자동 폴백 금지 — 모델이 없거나 로그인 풀림이면 다른 엔진으로 넘기지 않고 '[젠스파크] …' 오류로 멈춘다.
import {
  GENSPARK_IMAGE_URL,
  gensparkBuildJobUrl,
  gensparkExtractJobId,
  readGensparkPageSignals,
} from './gensparkSelectors';
import {
  GENSPARK_CHALLENGE,
  GENSPARK_COMPOSER_NOT_FOUND,
  GENSPARK_LOGIN_REQUIRED,
  GENSPARK_RATE_LIMITED,
  GENSPARK_SUBMIT_FAILED,
  GensparkError,
} from './gensparkErrors';
import {
  gensparkClickSend,
  gensparkEnsureModel,
  gensparkEnsureSettings,
  gensparkFillComposer,
  gensparkPause,
  gensparkWaitFor,
} from './gensparkSubmitSteps';
import type { GensparkSubmitDeps } from './gensparkSubmitSteps';
import type { GensparkModelEntry } from './gensparkModels';
import type { GensparkJob, GensparkPageLike, GensparkSubmitRequest } from './gensparkTypes';

export type { GensparkSubmitDeps } from './gensparkSubmitSteps';

const DEFAULT_JOB_URL_WAIT_MS = 20_000;
const JOB_URL_POLL_MS = 250;

export async function submitGensparkPrompt(
  page: GensparkPageLike,
  req: GensparkSubmitRequest,
  model: GensparkModelEntry,
  deps: GensparkSubmitDeps,
): Promise<GensparkJob> {
  // 뒤에 숨은 탭은 크롬이 멈춰 입력이 시간 초과되므로 매번 앞으로 가져온다(이미 앞이면 무해)
  await page.bringToFront();
  try {
    await page.goto(GENSPARK_IMAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (error) {
    throw new GensparkError(GENSPARK_SUBMIT_FAILED, `생성 화면 이동 실패: ${(error as Error)?.message || error}`);
  }

  const signals = await gensparkWaitFor(deps, 15_000, 250, async () => {
    const s = await page.evaluate(readGensparkPageSignals);
    return s.hasComposer || s.loginRequired || s.challenge || s.rateLimited ? s : null;
  });
  if (!signals) throw new GensparkError(GENSPARK_COMPOSER_NOT_FOUND, '15초 안에 입력창이 나타나지 않음');
  if (signals.challenge) throw new GensparkError(GENSPARK_CHALLENGE);
  if (signals.loginRequired) throw new GensparkError(GENSPARK_LOGIN_REQUIRED);
  if (signals.rateLimited) throw new GensparkError(GENSPARK_RATE_LIMITED);
  await gensparkPause(deps);

  await gensparkEnsureModel(page, model, deps);
  await gensparkPause(deps);
  await gensparkEnsureSettings(page, req.ratio, deps);
  await gensparkPause(deps);
  await gensparkFillComposer(page, req.prompt, deps);
  await gensparkClickSend(page);

  const waitMs = deps.jobUrlWaitMs ?? DEFAULT_JOB_URL_WAIT_MS;
  const jobId = await gensparkWaitFor(deps, waitMs, JOB_URL_POLL_MS, async () => gensparkExtractJobId(page.url()));
  if (!jobId) {
    const after = await page.evaluate(readGensparkPageSignals);
    if (after.challenge) throw new GensparkError(GENSPARK_CHALLENGE);
    if (after.rateLimited) throw new GensparkError(GENSPARK_RATE_LIMITED);
    throw new GensparkError(GENSPARK_SUBMIT_FAILED, `작업 주소가 ${Math.round(waitMs / 1000)}초 안에 생기지 않음`);
  }
  if (deps.seenJobIds.has(jobId)) {
    throw new GensparkError(GENSPARK_SUBMIT_FAILED, `이미 받은 작업 ID(${jobId})가 다시 나옴`);
  }
  deps.seenJobIds.add(jobId);
  deps.log(`[젠스파크] 전송 완료 #${req.index + 1} → 작업 ${jobId}`);
  return { index: req.index, jobId, jobUrl: gensparkBuildJobUrl(jobId), submittedAt: deps.now() };
}
