// src/image/genspark/gensparkSession.ts
// [2026-10-10] 젠스파크 세션 상태 — 열어 둔 브라우저 컨텍스트·탭 하나, 생성 직렬 잠금, 중지 epoch,
//   로그인/확인/생성이 서로 겹치지 않게 하는 작업 게이트. dropshotSession.ts 구조를 따르되 추적은 분리했다.
//   브라우저·로그인 파일이 순환 import 없이 같은 상태를 보도록 상태만 이 모듈에 둔다.

import { withCleanupTimeout } from '../../runtime/cleanupTimeout.js';

/** 추적 중인 컨텍스트 종류: 생성용(숨긴 창) / 로그인용(사람이 보는 창) */
export type GensparkContextKind = 'generation' | 'login';

let cachedContext: unknown = null;
let cachedPage: unknown = null;
const trackedContexts = new Map<unknown, GensparkContextKind>();

/** 생성 호출 직렬화 — 탭은 하나만 쓴다(두 탭 동시 전송은 서로 튕김). */
let generationChain: Promise<unknown> = Promise.resolve();
let pendingGenerations = 0;
let loginActive = false;
let checkActive = false;
let generationEpoch = 0;

export class GensparkCleanupIncompleteError extends Error {
  readonly code = 'GENSPARK_CLEANUP_INCOMPLETE';

  constructor(message = '[젠스파크] 브라우저 정리가 끝나지 않았습니다.') {
    super(message);
    this.name = 'GensparkCleanupIncompleteError';
  }
}

export interface GensparkOperationState {
  readonly pendingGenerations: number;
  readonly loginActive: boolean;
  readonly checkActive: boolean;
}

// ───────── 캐시(열어 둔 컨텍스트·탭) ─────────

export function getGensparkCachedPage(): unknown {
  return cachedPage;
}

export function getGensparkCachedContext(): unknown {
  return cachedContext;
}

/** 컨텍스트·탭을 보관하고 생성용으로 추적한다(로그인용이었다면 생성용으로 승격). */
export function setGensparkCached(ctx: unknown, page: unknown): void {
  cachedContext = ctx;
  cachedPage = page;
  trackGensparkContext(ctx, 'generation');
}

export function clearGensparkCached(): void {
  cachedContext = null;
  cachedPage = null;
}

// ───────── 컨텍스트 추적 ─────────

export function trackGensparkContext(context: unknown, kind: GensparkContextKind = 'generation'): void {
  if (context) trackedContexts.set(context, kind);
}

export function untrackGensparkContext(context: unknown): void {
  if (context) trackedContexts.delete(context);
}

export function hasTrackedGensparkContexts(): boolean {
  return trackedContexts.size > 0;
}

// ───────── 직렬 잠금 ─────────

/**
 * 생성 작업을 한 번에 하나씩만 실행한다. 앞 작업이 실패해도 뒤 작업은 이어서 실행되고,
 * 호출자는 자기 작업의 결과/오류만 받는다.
 */
export function enqueueGensparkGeneration<T>(task: () => Promise<T>): Promise<T> {
  const run = generationChain.then(task, task);
  generationChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ───────── 중지 epoch ─────────

export function getGensparkGenerationEpoch(): number {
  return generationEpoch;
}

/** 이전 epoch 를 잡고 있던 모든 생성을 무효화한다. */
export function abortGensparkGenerations(): number {
  generationEpoch += 1;
  return generationEpoch;
}

export function isGensparkGenerationAborted(capturedEpoch: number): boolean {
  return capturedEpoch !== generationEpoch;
}

// ───────── 작업 게이트(생성 / 로그인 / 확인 겹침 방지) ─────────

export function getGensparkOperationState(): GensparkOperationState {
  return { pendingGenerations, loginActive, checkActive };
}

export function tryBeginGensparkGeneration(): boolean {
  if (loginActive || checkActive) return false;
  pendingGenerations += 1;
  return true;
}

export function endGensparkGeneration(): void {
  pendingGenerations = Math.max(0, pendingGenerations - 1);
}

export function tryBeginGensparkLogin(): boolean {
  if (pendingGenerations > 0 || loginActive || checkActive) return false;
  loginActive = true;
  return true;
}

export function endGensparkLogin(): void {
  loginActive = false;
}

export function tryBeginGensparkCheck(): boolean {
  if (pendingGenerations > 0 || loginActive || checkActive) return false;
  checkActive = true;
  return true;
}

export function endGensparkCheck(): void {
  checkActive = false;
}

// ───────── 닫기 ─────────

export async function closeTrackedGensparkContext(context: unknown, timeoutMs = 5_000): Promise<boolean> {
  if (!context || typeof (context as { close?: unknown }).close !== 'function') {
    untrackGensparkContext(context);
    return true;
  }
  try {
    await withCleanupTimeout(
      () => (context as { close: () => Promise<void> }).close(),
      timeoutMs,
      'Genspark browser context',
    );
    untrackGensparkContext(context);
    return true;
  } catch {
    // 닫힘이 확인되지 않으면 소유권을 유지해 다음 정리 때 다시 시도한다(새 실행과 프로필 잠김 경쟁 방지).
    return false;
  }
}

/** 캐시된 컨텍스트만 닫는다. 닫힘 확인 전에는 캐시를 버리지 않는다. */
export async function closeGensparkBrowserCache(timeoutMs = 5_000): Promise<void> {
  const context = cachedContext;
  if (!context) return;
  const closed = await closeTrackedGensparkContext(context, timeoutMs);
  if (!closed) throw new GensparkCleanupIncompleteError();
  if (cachedContext === context) {
    cachedContext = null;
    cachedPage = null;
  }
}

export interface GensparkCloseAllOptions {
  /** true 면 로그인용(사람이 보는) 창은 닫지 않는다. */
  keepLoginWindows?: boolean;
  timeoutMs?: number;
}

/** 추적 중인 모든 컨텍스트를 닫는다(앱 종료·정리용). */
export async function closeAllGensparkContexts(options: GensparkCloseAllOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const ownedCached = cachedContext;
  const targets = new Set<unknown>();
  for (const [ctx, kind] of trackedContexts) {
    if (options.keepLoginWindows && kind === 'login') continue;
    targets.add(ctx);
  }
  if (ownedCached) targets.add(ownedCached);

  const list = [...targets];
  const results = await Promise.all(list.map((ctx) => closeTrackedGensparkContext(ctx, timeoutMs)));
  const cachedIndex = ownedCached ? list.indexOf(ownedCached) : -1;
  if (cachedContext === ownedCached && ownedCached && results[cachedIndex] === true) {
    cachedContext = null;
    cachedPage = null;
  }
  if (results.some((ok) => !ok)) {
    throw new GensparkCleanupIncompleteError(
      '[젠스파크] 일부 브라우저를 제한 시간 안에 닫지 못했습니다.',
    );
  }
}
