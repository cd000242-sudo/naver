// src/image/genspark/gensparkBatch.ts
// [2026-10-10] 젠스파크 배치의 순수 순서 관리. 브라우저·파일·시계는 전부 deps 로 주입받는다.
//   탭은 하나라서 "연달아 보내고 → 작업 주소를 돌며 수거" 방식으로 병렬을 만든다.
//   자동 폴백 금지 — 실패한 항목은 같은 모델로만(무료 1회) 다시 보내고, 그래도 안 되면 실패 목록으로 돌려준다.

import {
  GENSPARK_ABORTED,
  GENSPARK_JOB_FAILED,
  GENSPARK_JOB_TIMEOUT,
  GENSPARK_RATE_LIMITED,
  GensparkError,
  gensparkIsBatchFatal,
  gensparkIsError,
} from './gensparkErrors.js';
import {
  gensparkRetryCount,
  type GensparkBatchDeps,
  type GensparkBatchOptions,
  type GensparkDownloadResult,
  type GensparkJob,
  type GensparkSubmitRequest,
} from './gensparkTypes.js';

export interface GensparkBatchFailure {
  index: number;
  errorCode: string;
  message: string;
}

export interface GensparkBatchOutcome {
  /** 요청 순서대로(requests 배열 위치). 못 받은 자리는 undefined */
  results: Array<GensparkDownloadResult | undefined>;
  failures: GensparkBatchFailure[];
  /** 배치 전체 중단 오류(로그인 풀림·중지 등). 있으면 호출자가 그대로 throw 한다. */
  fatal?: GensparkError;
  /** 마지막으로 적용된 동시 개수(제한 문구로 줄었을 수 있음) */
  finalConcurrency: number;
}

export type GensparkImageDoneCallback = (
  result: GensparkDownloadResult,
  requestIndex: number,
  total: number,
) => void;

interface InFlight {
  job: GensparkJob;
  position: number;
}

/** 동시 개수를 4→2→1 로 줄인다. */
export function gensparkReduceConcurrency(current: number): number {
  if (current > 2) return 2;
  return 1;
}

const SHORT_REASONS: Readonly<Record<string, string>> = Object.freeze({
  [GENSPARK_JOB_TIMEOUT]: '시간 초과',
  [GENSPARK_JOB_FAILED]: '생성 실패',
  [GENSPARK_RATE_LIMITED]: '요청 제한',
  GENSPARK_SUBMIT_FAILED: '전송 실패',
  GENSPARK_DOWNLOAD_FAILED: '내려받기 실패',
  GENSPARK_DUPLICATE_IMAGE: '중복 이미지',
});

/** `IMAGE_BATCH_INCOMPLETE:k/n:[2번 시간 초과, …]` (dropshotGenerator 와 같은 약속) */
export function gensparkFormatIncomplete(
  doneCount: number,
  total: number,
  failures: readonly GensparkBatchFailure[],
): string {
  const sorted = [...failures].sort((a, b) => a.index - b.index);
  const parts = sorted.map((f) => `${f.index + 1}번 ${SHORT_REASONS[f.errorCode] || '실패'}`);
  return `IMAGE_BATCH_INCOMPLETE:${doneCount}/${total}:[${parts.join(', ')}]`;
}

function toFailure(index: number, error: unknown): GensparkBatchFailure {
  if (gensparkIsError(error)) {
    return { index, errorCode: error.code, message: error.userMessage };
  }
  const detail = error instanceof Error ? error.message : String(error);
  const wrapped = new GensparkError(GENSPARK_JOB_FAILED, detail);
  return { index, errorCode: wrapped.code, message: wrapped.userMessage };
}

export async function runGensparkBatch(
  requests: readonly GensparkSubmitRequest[],
  deps: GensparkBatchDeps,
  options: GensparkBatchOptions,
  onImage?: GensparkImageDoneCallback,
): Promise<GensparkBatchOutcome> {
  const total = requests.length;
  const results: Array<GensparkDownloadResult | undefined> = new Array(total).fill(undefined);
  const failures: GensparkBatchFailure[] = [];
  const attempts = new Map<number, number>();
  const maxRetry = gensparkRetryCount(options);
  const queue: number[] = requests.map((_, i) => i); // requests 배열 위치
  let inflight: InFlight[] = [];
  let concurrency = Math.max(1, Math.floor(options.concurrency) || 1);
  let fatal: GensparkError | undefined;

  const setFatal = (error: unknown): void => {
    if (!fatal && gensparkIsError(error)) fatal = error;
  };

  // 실패 처리: 전체 중단이면 멈춤, 아니면 재시도 한도 안에서 같은 모델로 다시 보냄
  const handleFailure = (position: number, error: unknown): void => {
    const req = requests[position];
    if (gensparkIsBatchFatal(error)) {
      setFatal(error);
      return;
    }
    if (gensparkIsError(error) && error.code === GENSPARK_RATE_LIMITED && concurrency > 1) {
      const next = gensparkReduceConcurrency(concurrency);
      deps.log(`[젠스파크] 요청 제한 감지 → 동시 진행 ${concurrency}개에서 ${next}개로 줄입니다.`);
      concurrency = next;
    }
    const used = attempts.get(position) ?? 0;
    if (used <= maxRetry - 1 && maxRetry > 0) {
      attempts.set(position, used + 1);
      deps.log(`[젠스파크] ${req.index + 1}번 실패 → 같은 모델로 다시 보냅니다. (${used + 1}/${maxRetry}) · ${toFailure(req.index, error).message}`);
      queue.unshift(position);
      return;
    }
    const failure = toFailure(req.index, error);
    deps.log(`[젠스파크] ${req.index + 1}번 최종 실패 · ${failure.message}`);
    failures.push(failure);
  };

  const stopIfRequested = (): boolean => {
    if (!deps.isStopped()) return false;
    setFatal(new GensparkError(GENSPARK_ABORTED));
    return true;
  };

  const submitNext = async (): Promise<void> => {
    const position = queue.shift() as number;
    try {
      const job = await deps.submit(requests[position]);
      inflight.push({ job, position });
    } catch (error) {
      handleFailure(position, error);
    }
  };

  // 작업 하나를 확인. 끝났거나(성공·실패) 자리가 비면 true
  const settle = async (entry: InFlight): Promise<boolean> => {
    const { job, position } = entry;
    try {
      const res = await deps.check(job);
      if (res.status === 'done' && res.imageUrl) {
        const downloaded = await deps.download(job, res.imageUrl);
        results[position] = downloaded;
        onImage?.(downloaded, requests[position].index, total);
        return true;
      }
      if (res.status === 'failed') {
        throw new GensparkError(GENSPARK_JOB_FAILED, res.reason);
      }
      if (deps.now() - job.submittedAt >= options.jobDeadlineMs) {
        throw new GensparkError(GENSPARK_JOB_TIMEOUT);
      }
      return false;
    } catch (error) {
      handleFailure(position, error);
      return true;
    }
  };

  while (!fatal) {
    if (queue.length > 0 && inflight.length < concurrency) {
      if (stopIfRequested()) break;
      await submitNext();
      continue; // 보낸 직후 다음 요청 보내러 감
    }
    if (inflight.length === 0 && queue.length === 0) break;
    if (inflight.length === 0) continue; // 재시도로 큐만 남은 경우 → 위에서 전송

    if (stopIfRequested()) break;
    let freed = false;
    for (const entry of [...inflight]) {
      if (fatal) break;
      const finished = await settle(entry);
      if (finished) {
        inflight = inflight.filter((e) => e !== entry);
        freed = true;
        if (queue.length > 0) break; // 빈자리 → 다음 요청 전송
      }
    }
    if (!fatal && !freed) await deps.sleep(options.pollIntervalMs);
  }

  return { results, failures, fatal, finalConcurrency: concurrency };
}
