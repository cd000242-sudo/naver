/**
 * 운영 대시보드 — 셀렉터 실패율, AI 품질, 발행 통계 수집
 *
 * Phase 4-3: 모니터링/옵저빌리티
 * 런타임 메트릭을 수집하여 대시보드 UI에 제공.
 */

// ── 타입 정의 ──

export interface SelectorMetrics {
  readonly totalAttempts: number;
  readonly failures: number;
  readonly failureRate: number;        // 0-100%
  readonly topFailedKeys: readonly FailedKeyEntry[];
  readonly lastFailureAt: string | null;
}

export interface FailedKeyEntry {
  readonly key: string;
  readonly count: number;
  readonly lastAt: string;
}

export interface ContentQualityMetrics {
  readonly totalGenerated: number;
  readonly avgOverallQuality: number;    // 0-100
  readonly avgAiRisk: number;            // 0-100
  readonly verdictCounts: {
    readonly pass: number;
    readonly borderline: number;
    readonly regenerate: number;
  };
  readonly avgExpertiseScore: number;
  readonly avgExperienceScore: number;
}

export interface PublishMetrics {
  readonly totalAttempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly successRate: number;          // 0-100%
  readonly failureReasons: readonly FailureReasonEntry[];
  readonly avgPublishTimeMs: number;
  readonly todayCount: number;
  readonly lastPublishAt: string | null;
}

export interface FailureReasonEntry {
  readonly reason: string;
  readonly count: number;
}

export interface SessionMetrics {
  readonly totalLogins: number;
  readonly reloginCount: number;         // 세션 만료 후 재로그인
  readonly avgSessionLifeMs: number;
  readonly cookieRestoreSuccesses: number;
  readonly cookieRestoreFailures: number;
}

export interface DashboardSnapshot {
  readonly timestamp: string;
  readonly selector: SelectorMetrics;
  readonly contentQuality: ContentQualityMetrics;
  readonly publish: PublishMetrics;
  readonly session: SessionMetrics;
  readonly uptime: number;               // ms since app start
}

// ── 메트릭 수집기 ──

const appStartTime = Date.now();

// 셀렉터 메트릭
let selectorAttempts = 0;
let selectorFailures = 0;
const failedSelectorKeys: Map<string, { count: number; lastAt: string }> = new Map();

// 콘텐츠 품질 메트릭
let totalGenerated = 0;
const qualityScores: number[] = [];
const riskScores: number[] = [];
const expertiseScores: number[] = [];
const experienceScores: number[] = [];
const verdicts = { pass: 0, borderline: 0, regenerate: 0 };

// 발행 메트릭
let publishAttempts = 0;
let publishSuccesses = 0;
let publishFailures = 0;
const failureReasons: Map<string, number> = new Map();
const publishDurations: number[] = [];
let todayPublishCount = 0;
let lastPublishAt: string | null = null;
let todayDate = new Date().toISOString().slice(0, 10);

// 세션 메트릭
let totalLogins = 0;
let reloginCount = 0;
const sessionLifetimes: number[] = [];
let cookieRestoreSuccesses = 0;
let cookieRestoreFailures = 0;

// ── 기록 함수 ──

/** 셀렉터 시도 기록 */
export function recordSelectorAttempt(succeeded: boolean, key?: string): void {
  selectorAttempts++;
  if (!succeeded) {
    selectorFailures++;
    if (key) {
      const existing = failedSelectorKeys.get(key);
      failedSelectorKeys.set(key, {
        count: (existing?.count ?? 0) + 1,
        lastAt: new Date().toISOString(),
      });
    }
  }
}

/** 콘텐츠 품질 평가 결과 기록 */
export function recordContentQuality(assessment: {
  readonly overallQuality: number;
  readonly overallRisk: number;
  readonly expertiseScore: number;
  readonly experienceScore: number;
  readonly verdict: 'pass' | 'borderline' | 'regenerate';
}): void {
  totalGenerated++;
  qualityScores.push(assessment.overallQuality);
  riskScores.push(assessment.overallRisk);
  expertiseScores.push(assessment.expertiseScore);
  experienceScores.push(assessment.experienceScore);
  verdicts[assessment.verdict]++;

  // 최근 100개만 유지
  if (qualityScores.length > 100) {
    qualityScores.shift();
    riskScores.shift();
    expertiseScores.shift();
    experienceScores.shift();
  }
}

/** 발행 시도 결과 기록 */
export function recordPublishAttempt(
  succeeded: boolean,
  durationMs?: number,
  failureReason?: string,
): void {
  // 날짜 변경 시 카운트 리셋
  const today = new Date().toISOString().slice(0, 10);
  if (today !== todayDate) {
    todayDate = today;
    todayPublishCount = 0;
  }

  publishAttempts++;
  if (succeeded) {
    publishSuccesses++;
    todayPublishCount++;
    lastPublishAt = new Date().toISOString();
  } else {
    publishFailures++;
    if (failureReason) {
      failureReasons.set(failureReason, (failureReasons.get(failureReason) ?? 0) + 1);
    }
  }

  if (durationMs !== undefined) {
    publishDurations.push(durationMs);
    if (publishDurations.length > 100) publishDurations.shift();
  }
}

/** 로그인 기록 */
export function recordLogin(isRelogin: boolean = false): void {
  totalLogins++;
  if (isRelogin) reloginCount++;
}

/** 세션 수명 기록 */
export function recordSessionLifetime(lifetimeMs: number): void {
  sessionLifetimes.push(lifetimeMs);
  if (sessionLifetimes.length > 50) sessionLifetimes.shift();
}

/** 쿠키 복원 결과 기록 */
export function recordCookieRestore(succeeded: boolean): void {
  if (succeeded) cookieRestoreSuccesses++;
  else cookieRestoreFailures++;
}

// ── 스냅샷 생성 ──

function avg(arr: readonly number[]): number {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

/** 현재 대시보드 스냅샷 생성 */
export function getDashboardSnapshot(): DashboardSnapshot {
  // 셀렉터 실패 키 정렬 (상위 10개)
  const topFailedKeys: FailedKeyEntry[] = [...failedSelectorKeys.entries()]
    .map(([key, data]) => ({ key, count: data.count, lastAt: data.lastAt }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const lastSelectorFailure = topFailedKeys.length > 0
    ? topFailedKeys[0].lastAt
    : null;

  // 발행 실패 사유 정렬
  const sortedReasons: FailureReasonEntry[] = [...failureReasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    timestamp: new Date().toISOString(),
    selector: {
      totalAttempts: selectorAttempts,
      failures: selectorFailures,
      failureRate: selectorAttempts > 0
        ? Math.round((selectorFailures / selectorAttempts) * 10000) / 100
        : 0,
      topFailedKeys,
      lastFailureAt: lastSelectorFailure,
    },
    contentQuality: {
      totalGenerated,
      avgOverallQuality: avg(qualityScores),
      avgAiRisk: avg(riskScores),
      verdictCounts: { ...verdicts },
      avgExpertiseScore: avg(expertiseScores),
      avgExperienceScore: avg(experienceScores),
    },
    publish: {
      totalAttempts: publishAttempts,
      successes: publishSuccesses,
      failures: publishFailures,
      successRate: publishAttempts > 0
        ? Math.round((publishSuccesses / publishAttempts) * 10000) / 100
        : 0,
      failureReasons: sortedReasons,
      avgPublishTimeMs: avg(publishDurations),
      todayCount: todayPublishCount,
      lastPublishAt,
    },
    session: {
      totalLogins,
      reloginCount,
      avgSessionLifeMs: avg(sessionLifetimes),
      cookieRestoreSuccesses,
      cookieRestoreFailures,
    },
    uptime: Date.now() - appStartTime,
  };
}

/** 모든 메트릭 초기화 (테스트용) */
export function resetAllMetrics(): void {
  selectorAttempts = 0;
  selectorFailures = 0;
  failedSelectorKeys.clear();
  totalGenerated = 0;
  qualityScores.length = 0;
  riskScores.length = 0;
  expertiseScores.length = 0;
  experienceScores.length = 0;
  verdicts.pass = 0;
  verdicts.borderline = 0;
  verdicts.regenerate = 0;
  publishAttempts = 0;
  publishSuccesses = 0;
  publishFailures = 0;
  failureReasons.clear();
  publishDurations.length = 0;
  todayPublishCount = 0;
  lastPublishAt = null;
  totalLogins = 0;
  reloginCount = 0;
  sessionLifetimes.length = 0;
  cookieRestoreSuccesses = 0;
  cookieRestoreFailures = 0;
}

/** 대시보드 요약 문자열 (로그용) */
export function getDashboardSummary(): string {
  const snap = getDashboardSnapshot();
  return [
    `[Dashboard] uptime: ${Math.round(snap.uptime / 60000)}분`,
    `셀렉터: ${snap.selector.failures}/${snap.selector.totalAttempts} 실패 (${snap.selector.failureRate}%)`,
    `콘텐츠: ${snap.contentQuality.totalGenerated}건, 품질 ${snap.contentQuality.avgOverallQuality}점`,
    `발행: ${snap.publish.successes}/${snap.publish.totalAttempts} 성공 (${snap.publish.successRate}%), 오늘 ${snap.publish.todayCount}건`,
    `세션: 로그인 ${snap.session.totalLogins}회, 재로그인 ${snap.session.reloginCount}회`,
  ].join(' | ');
}
