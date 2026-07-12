/**
 * Published Post Tracker — 끝판왕 Phase 3.18.1 (v2.10.198)
 *
 * 발행한 글의 evaluator 결과를 누적 저장 → 24/48/72h 후 *실제 노출*을 검증.
 * 추정 임계를 *실측* 데이터로 보정하는 기반.
 *
 * 저장 위치: userData/published-posts.json
 * 흐름:
 *   1. 발행 시 trackPublishedPost() 호출 — evaluator 결과 + blogId/logNo 저장
 *   2. exposureChecker가 N시간 후 자동 폴링 — 네이버 검색에서 우리 글 노출 위치 확인
 *   3. calibration이 [노출 글] vs [비노출 글] 신호 비교 → 임계 권장값 산출
 */

import fs from 'fs';
import path from 'path';
import { recordCohortEvent, hashAccountId } from '../account/cohortStore.js';

export interface PublishedPost {
  readonly id: string;                    // unique (timestamp + blogId + logNo)
  readonly publishedAt: string;           // ISO 8601
  readonly keyword: string;
  readonly mode: string;                  // seo/homefeed/affiliate/...
  readonly blogId: string;
  readonly logNo: string;
  readonly url: string;
  readonly title: string;
  // evaluator 결과 (qualityEvaluator)
  readonly evaluator: {
    readonly finalScore: number;
    readonly modeScore: number;
    readonly safetyScore: number;
    readonly humanlikeScore: number;
    readonly decision: string;             // pass/patch/regenerate
    readonly details: Readonly<Record<string, number>>;  // 신호별 점수 (concreteNumberCount, directExperience 등)
  };
  // SERP 비교 결과 (이미 있으면)
  readonly serpBenchmark?: {
    readonly ranking: string;
    readonly ourFinalScore: number;
    readonly serpAvgFinalScore: number;
    readonly difficultyTier?: string;
  };
  // 노출 검증 결과 (exposureChecker가 채움)
  exposureChecks?: Array<{
    readonly checkedAt: string;
    readonly hoursAfter: number;            // 발행 후 N시간
    readonly searchedKeyword: string;
    readonly position: number | null;       // 통합탭 노출 위치 (null = 미노출, 1~10 = top10, >10 = 그 외)
    readonly hasSmartblock: boolean;
    readonly notes?: string;
  }>;
}

const DEFAULT_MAX_POSTS = 500;

function getFilePath(userDataPath: string): string {
  return path.join(userDataPath, 'published-posts.json');
}

export function loadPublishedPosts(userDataPath: string): PublishedPost[] {
  const filePath = getFilePath(userDataPath);
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValid);
  } catch {
    return [];
  }
}

function isValid(p: any): p is PublishedPost {
  return p
    && typeof p.id === 'string'
    && typeof p.publishedAt === 'string'
    && typeof p.blogId === 'string'
    && typeof p.logNo === 'string'
    && p.evaluator
    && typeof p.evaluator.finalScore === 'number';
}

/**
 * 새 발행 글 추가 — 발행 직후 호출.
 */
export function trackPublishedPost(
  userDataPath: string,
  post: Omit<PublishedPost, 'id'>,
  maxPosts: number = DEFAULT_MAX_POSTS,
): { ok: boolean; id?: string } {
  try {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const id = `${Date.now()}_${post.blogId}_${post.logNo}`;
    const entry: PublishedPost = { id, ...post };
    const existing = loadPublishedPosts(userDataPath);
    const updated = [...existing, entry];
    const trimmed = updated.length > maxPosts
      ? updated.slice(updated.length - maxPosts)
      : updated;
    fs.writeFileSync(getFilePath(userDataPath), JSON.stringify(trimmed, null, 2), 'utf-8');

    // SPEC-MOAT-2026 Phase 0.3 wiring — cohortStore에 publish 이벤트 기록.
    // recordCohortEvent는 내부에서 opt-in 게이트(env COHORT_TELEMETRY_ENABLED).
    // 익명화는 hashAccountId(sha256). 실패해도 발행 흐름 무관 (try/catch 흡수).
    try {
      void recordCohortEvent({
        eventType: 'publish',
        hashedAccountId: hashAccountId(post.blogId),
        timestamp: post.publishedAt,
      });
    } catch {
      // ignore — cohort 측정 실패가 발행 흐름 영향 X
    }

    return { ok: true, id };
  } catch {
    return { ok: false };
  }
}

/** Idempotent registration used by the main-process policy pipeline. */
export function ensureTrackedPublishedPost(
  userDataPath: string,
  post: Omit<PublishedPost, 'id'>,
  maxPosts: number = DEFAULT_MAX_POSTS,
): { ok: boolean; id?: string } {
  const existing = loadPublishedPosts(userDataPath).find((item) => (
    item.url === post.url
    || (item.blogId === post.blogId && item.logNo === post.logNo)
  ));
  if (existing) return { ok: true, id: existing.id };
  return trackPublishedPost(userDataPath, post, maxPosts);
}

/**
 * 발행 후 N시간 지난 글만 — 노출 검증 대상.
 *   exposureChecker가 자동 폴링 시 사용.
 */
export function getPostsNeedingExposureCheck(
  posts: PublishedPost[],
  hoursAfter: 24 | 48 | 72,
  now: number = Date.now(),
): PublishedPost[] {
  const targetMs = hoursAfter * 60 * 60 * 1000;
  const toleranceMs = 6 * 60 * 60 * 1000; // ±6시간 윈도우
  return posts.filter(p => {
    const publishedMs = new Date(p.publishedAt).getTime();
    if (isNaN(publishedMs)) return false;
    const elapsed = now - publishedMs;
    if (elapsed < targetMs - toleranceMs) return false; // 아직 시점 도달 안 함
    if (elapsed > targetMs + toleranceMs) return false; // 너무 늦음 (다른 시점에서 확인)
    // 이미 같은 시점 체크했으면 skip
    const alreadyChecked = (p.exposureChecks ?? []).some(c => Math.abs(c.hoursAfter - hoursAfter) <= 1);
    return !alreadyChecked;
  });
}

/**
 * 노출 검증 결과 업데이트.
 */
export function recordExposureCheck(
  userDataPath: string,
  postId: string,
  check: PublishedPost['exposureChecks'] extends Array<infer C> | undefined ? C : never,
): boolean {
  try {
    const posts = loadPublishedPosts(userDataPath);
    const updated = posts.map(p => {
      if (p.id !== postId) return p;
      const checks = [...(p.exposureChecks ?? []), check];
      return { ...p, exposureChecks: checks };
    });
    fs.writeFileSync(getFilePath(userDataPath), JSON.stringify(updated, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * 노출 vs 비노출 통계 — calibration의 입력.
 *   - 노출 (position ≤ 10)
 *   - 비노출 (position null 또는 > 10)
 */
export function splitExposureGroups(posts: PublishedPost[]): {
  exposed: PublishedPost[];
  notExposed: PublishedPost[];
  unknownCheck: PublishedPost[];
} {
  const exposed: PublishedPost[] = [];
  const notExposed: PublishedPost[] = [];
  const unknownCheck: PublishedPost[] = [];

  for (const p of posts) {
    const checks = p.exposureChecks ?? [];
    if (checks.length === 0) {
      unknownCheck.push(p);
      continue;
    }
    // 가장 늦은 체크 결과 사용
    const latest = [...checks].sort((a, b) => b.hoursAfter - a.hoursAfter)[0];
    if (latest.position !== null && latest.position <= 10) {
      exposed.push(p);
    } else {
      notExposed.push(p);
    }
  }

  return { exposed, notExposed, unknownCheck };
}

export function clearPublishedPosts(userDataPath: string): boolean {
  try {
    const fp = getFilePath(userDataPath);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return true;
  } catch {
    return false;
  }
}
