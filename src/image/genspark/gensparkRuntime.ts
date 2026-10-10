// src/image/genspark/gensparkRuntime.ts
// [2026-10-10] 젠스파크 실행 환경 어댑터: 세션 잠금 · 생성 게이트 · 탭 준비/로그인 확인을 묶어
//   gensparkGenerator 가 쓰는 GensparkRuntime 으로 제공한다. 자동 폴백 없음 — 모든 실패는 '[젠스파크] …' 오류로 멈춘다.

import {
  GENSPARK_ABORTED,
  GENSPARK_PROFILE_IN_USE,
  GENSPARK_DOWNLOAD_FAILED,
  GensparkError,
} from './gensparkErrors.js';
import type { GensparkModelEntry } from './gensparkModels.js';
import {
  enqueueGensparkGeneration,
  endGensparkGeneration,
  getGensparkGenerationEpoch,
  isGensparkGenerationAborted,
  tryBeginGensparkGeneration,
} from './gensparkSession.js';
import { prepareGensparkGenerationPage } from './gensparkLogin.js';
import { submitGensparkPrompt } from './gensparkSubmit.js';
import { checkGensparkJob, fetchGensparkImageBytes } from './gensparkCollect.js';
import { GENSPARK_ORIGIN } from './gensparkSelectors.js';
import type { GensparkEngineHandle, GensparkRuntime } from './gensparkGenerator.js';
import type { GensparkPageLike } from './gensparkTypes.js';

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

function createEngine(page: GensparkPageLike, model: GensparkModelEntry, epoch: number): GensparkEngineHandle {
  const seenJobIds = new Set<string>();
  const seenUrls = new Set<string>();
  const guard = (): void => {
    // 중지(epoch 변경)가 들어오면 새 작업을 보내지 않고 ABORTED 로 멈춘다
    if (isGensparkGenerationAborted(epoch)) throw new GensparkError(GENSPARK_ABORTED);
  };
  return {
    submit: async (request) => {
      guard();
      return submitGensparkPrompt(page, request, model, {
        now: () => Date.now(),
        sleep,
        random: () => Math.random(),
        seenJobIds,
        log: (m) => console.log(m),
      });
    },
    check: async (job) => {
      guard();
      return checkGensparkJob(page, job, seenUrls, { sleep });
    },
    fetchImage: async (job, imageUrl) => {
      guard();
      // 로그인 쿠키가 필요해 같은 출처 페이지 안에서 받는다 — 다른 곳에 있으면 작업 화면으로 돌아간다
      if (!page.url().startsWith(GENSPARK_ORIGIN)) {
        await page.goto(job.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      }
      const fetched = await page.evaluate(fetchGensparkImageBytes, imageUrl);
      if (!fetched || !fetched.ok || !fetched.b64) {
        throw new GensparkError(GENSPARK_DOWNLOAD_FAILED, `HTTP ${fetched?.status ?? '?'}`);
      }
      const buffer = Buffer.from(fetched.b64, 'base64');
      seenUrls.add(imageUrl);
      return { buffer, mimeType: fetched.type || undefined };
    },
  };
}

export function createGensparkRuntime(): GensparkRuntime {
  return {
    withSession: (model, fn) =>
      enqueueGensparkGeneration(async () => {
        if (!tryBeginGensparkGeneration()) {
          throw new GensparkError(GENSPARK_PROFILE_IN_USE, '로그인 확인 또는 다른 생성이 진행 중');
        }
        try {
          const epoch = getGensparkGenerationEpoch();
          const page = (await prepareGensparkGenerationPage()) as GensparkPageLike;
          return await fn(createEngine(page, model, epoch));
        } finally {
          endGensparkGeneration();
        }
      }),
  };
}
