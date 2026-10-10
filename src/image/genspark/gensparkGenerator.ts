// src/image/genspark/gensparkGenerator.ts
// [2026-10-10] 젠스파크 이미지 엔진 어댑터(dropshotGenerator 와 같은 자리). 브라우저 쪽은 GensparkRuntime 으로 주입받고,
//   여기서는 모델 확인 · 배치 실행 · 중복 검사 · 파일 저장 · 완전성 확인만 맡는다. 자동 폴백 금지.

import type { ImageRequestItem } from '../types.js';
import { writeImageFile } from '../imageUtils.js';
import { probeDuplicate, commitHashes } from '../imageHashUtils.js';
import { loadConfig } from '../../configManager.js';
import {
  GENSPARK_DUPLICATE_IMAGE,
  GENSPARK_MODEL_NOT_FOUND,
  GensparkError,
} from './gensparkErrors.js';
import { gensparkDefaultModel, gensparkNormalizeModelId, type GensparkModelEntry } from './gensparkModels.js';
import { GENSPARK_RATIO_LABELS } from './gensparkSelectors.js';
import { gensparkFormatIncomplete, runGensparkBatch } from './gensparkBatch.js';
import {
  GENSPARK_DEFAULT_BATCH_OPTIONS,
  type GensparkBatchDeps,
  type GensparkCollectResult,
  type GensparkGeneratedImage,
  type GensparkJob,
  type GensparkSubmitRequest,
} from './gensparkTypes.js';

/** 브라우저·로그인 쪽이 제공해야 하는 동작(통합 단계에서 gensparkSession/Browser/Login 위에 만든다). */
export interface GensparkEngineHandle {
  submit(request: GensparkSubmitRequest): Promise<GensparkJob>;
  check(job: GensparkJob): Promise<GensparkCollectResult>;
  /** 작업 페이지 안에서 이미지를 받아 온다(로그인 쿠키가 필요해서 페이지 안 fetch). */
  fetchImage(job: GensparkJob, imageUrl: string): Promise<{ buffer: Buffer; mimeType?: string }>;
}

export interface GensparkRuntime {
  /** 세션 잠금 아래에서 브라우저 준비 → 로그인 확인 → 모델·설정 선택 후 fn 실행. 끝나면 잠금 해제. */
  withSession<T>(model: GensparkModelEntry, fn: (engine: GensparkEngineHandle) => Promise<T>): Promise<T>;
}

export type GensparkImageCallback = (img: GensparkGeneratedImage, index: number, total: number) => void;

async function loadDefaultRuntime(): Promise<GensparkRuntime> {
  const mod = await import('./gensparkRuntime.js');
  return mod.createGensparkRuntime();
}

function resolveModel(configValue: unknown): GensparkModelEntry {
  if (configValue === undefined || configValue === null || configValue === '') return gensparkDefaultModel();
  const found = gensparkNormalizeModelId(configValue);
  if (!found) {
    throw new GensparkError(GENSPARK_MODEL_NOT_FOUND, '설정에서 젠스파크 모델을 다시 골라 주세요');
  }
  return found;
}

function resolveRatio(item: ImageRequestItem, config: unknown): string {
  const fromItem = (item as unknown as { imageRatio?: unknown }).imageRatio;
  const fromConfig = (config as { imageRatio?: unknown } | null)?.imageRatio;
  const wanted = String(fromItem || fromConfig || '1:1');
  return (GENSPARK_RATIO_LABELS as readonly string[]).includes(wanted) ? wanted : '1:1';
}

export async function generateWithGenspark(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  stopCheck?: () => boolean,
  onImageGenerated?: GensparkImageCallback,
  runtime?: GensparkRuntime,
): Promise<GensparkGeneratedImage[]> {
  const config = (await loadConfig()) as unknown as Record<string, unknown>;
  const model = resolveModel(config?.gensparkImageModel);
  const log = (m: string): void => console.log(m);
  if (!model.creditFree) {
    log(`[젠스파크] 경고: "${model.menuLabel}" 모델은 크레딧이 차감됩니다. 실패해도 같은 요청을 다시 보내지 않습니다.`);
  }

  const requests: GensparkSubmitRequest[] = items.map((item, index) => ({
    index,
    prompt: item.prompt,
    ratio: resolveRatio(item, config),
  }));

  const usedSha256 = new Set<string>();
  const usedAHashes: bigint[] = [];
  const images = new Map<number, GensparkGeneratedImage>();
  const rt = runtime ?? (await loadDefaultRuntime());

  const outcome = await rt.withSession(model, async (engine) => {
    const deps: GensparkBatchDeps = {
      submit: (req) => engine.submit(req),
      check: (job) => engine.check(job),
      download: async (job, imageUrl) => {
        const { buffer, mimeType } = await engine.fetchImage(job, imageUrl);
        // 중복 검사(dropshotGenerator 와 같은 방식) — 중복이면 그 항목만 실패 처리되어 무료 모델은 1회 다시 받는다.
        const probe = await probeDuplicate(buffer, usedSha256, usedAHashes);
        if (probe.isDuplicate || probe.isSimilar) {
          throw new GensparkError(GENSPARK_DUPLICATE_IMAGE, `${job.index + 1}번`);
        }
        commitHashes(probe, usedSha256, usedAHashes);
        const ext = /png/i.test(mimeType || '') ? 'png' : /webp/i.test(mimeType || '') ? 'webp' : 'jpg';
        const item = items[job.index];
        const saved = await writeImageFile(buffer, ext, item.heading, postTitle, postId);
        images.set(job.index, {
          heading: item.heading,
          filePath: saved.savedToLocal || saved.filePath,
          previewDataUrl: saved.previewDataUrl,
          provider: 'genspark',
          savedToLocal: saved.savedToLocal,
          originalIndex: (item as unknown as { originalIndex?: number }).originalIndex,
          sourceUrl: `젠스파크 ${model.menuLabel}`,
          blobId: saved.blobId,
          mimeType: saved.mimeType,
          width: saved.width,
          height: saved.height,
          byteSize: saved.byteSize,
          sha256: saved.sha256,
          createdAt: saved.createdAt,
        });
        return {
          filePath: saved.savedToLocal || saved.filePath,
          byteSize: saved.byteSize ?? buffer.length,
          mimeType: saved.mimeType,
          sha256: saved.sha256,
          width: saved.width,
          height: saved.height,
        };
      },
      now: () => Date.now(),
      sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      isStopped: () => Boolean(stopCheck?.()),
      log,
    };
    return runGensparkBatch(
      requests,
      deps,
      { ...GENSPARK_DEFAULT_BATCH_OPTIONS, modelCreditFree: model.creditFree },
      (_result, requestIndex, total) => {
        const img = images.get(requestIndex);
        if (img) onImageGenerated?.(img, requestIndex, total);
      },
    );
  });

  // 로그인 풀림·모델 없음·중지 등은 다른 엔진으로 넘기지 않고 '[젠스파크] …' 오류로 멈춘다.
  if (outcome.fatal) throw outcome.fatal;

  const ordered = [...images.entries()].sort((a, b) => a[0] - b[0]).map(([, img]) => img);
  if (ordered.length !== items.length) {
    throw new Error(gensparkFormatIncomplete(ordered.length, items.length, outcome.failures));
  }
  return ordered;
}
