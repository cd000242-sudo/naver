import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSelectorAttempt,
  recordContentQuality,
  recordPublishAttempt,
  recordLogin,
  recordSessionLifetime,
  recordCookieRestore,
  getDashboardSnapshot,
  getDashboardSummary,
  resetAllMetrics,
} from '../monitor/operationsDashboard';

beforeEach(() => {
  resetAllMetrics();
});

describe('셀렉터 메트릭', () => {
  it('성공/실패를 기록한다', () => {
    recordSelectorAttempt(true);
    recordSelectorAttempt(true);
    recordSelectorAttempt(false, 'confirmPublishButton');
    recordSelectorAttempt(false, 'confirmPublishButton');
    recordSelectorAttempt(false, 'categoryButton');

    const snap = getDashboardSnapshot();
    expect(snap.selector.totalAttempts).toBe(5);
    expect(snap.selector.failures).toBe(3);
    expect(snap.selector.failureRate).toBe(60);
    expect(snap.selector.topFailedKeys).toHaveLength(2);
    expect(snap.selector.topFailedKeys[0].key).toBe('confirmPublishButton');
    expect(snap.selector.topFailedKeys[0].count).toBe(2);
  });

  it('실패 없으면 failureRate 0%', () => {
    recordSelectorAttempt(true);
    const snap = getDashboardSnapshot();
    expect(snap.selector.failureRate).toBe(0);
  });
});

describe('콘텐츠 품질 메트릭', () => {
  it('품질 평가를 기록하고 평균을 산출한다', () => {
    recordContentQuality({ overallQuality: 80, overallRisk: 20, expertiseScore: 70, experienceScore: 60, verdict: 'pass' });
    recordContentQuality({ overallQuality: 40, overallRisk: 60, expertiseScore: 30, experienceScore: 20, verdict: 'borderline' });

    const snap = getDashboardSnapshot();
    expect(snap.contentQuality.totalGenerated).toBe(2);
    expect(snap.contentQuality.avgOverallQuality).toBe(60);
    expect(snap.contentQuality.avgAiRisk).toBe(40);
    expect(snap.contentQuality.verdictCounts.pass).toBe(1);
    expect(snap.contentQuality.verdictCounts.borderline).toBe(1);
    expect(snap.contentQuality.verdictCounts.regenerate).toBe(0);
  });
});

describe('발행 메트릭', () => {
  it('성공/실패를 기록한다', () => {
    recordPublishAttempt(true, 5000);
    recordPublishAttempt(true, 7000);
    recordPublishAttempt(false, undefined, '카테고리 선택 실패');
    recordPublishAttempt(false, undefined, '카테고리 선택 실패');
    recordPublishAttempt(false, undefined, '발행 버튼 없음');

    const snap = getDashboardSnapshot();
    expect(snap.publish.totalAttempts).toBe(5);
    expect(snap.publish.successes).toBe(2);
    expect(snap.publish.failures).toBe(3);
    expect(snap.publish.successRate).toBe(40);
    expect(snap.publish.avgPublishTimeMs).toBe(6000);
    expect(snap.publish.todayCount).toBe(2);
    expect(snap.publish.lastPublishAt).toBeTruthy();
    expect(snap.publish.failureReasons[0].reason).toBe('카테고리 선택 실패');
    expect(snap.publish.failureReasons[0].count).toBe(2);
  });
});

describe('세션 메트릭', () => {
  it('로그인/세션/쿠키를 기록한다', () => {
    recordLogin(false);
    recordLogin(true);
    recordSessionLifetime(3600000);
    recordSessionLifetime(7200000);
    recordCookieRestore(true);
    recordCookieRestore(false);

    const snap = getDashboardSnapshot();
    expect(snap.session.totalLogins).toBe(2);
    expect(snap.session.reloginCount).toBe(1);
    expect(snap.session.avgSessionLifeMs).toBe(5400000);
    expect(snap.session.cookieRestoreSuccesses).toBe(1);
    expect(snap.session.cookieRestoreFailures).toBe(1);
  });
});

describe('getDashboardSnapshot', () => {
  it('빈 상태에서도 안전하게 동작한다', () => {
    const snap = getDashboardSnapshot();
    expect(snap.timestamp).toBeTruthy();
    expect(snap.uptime).toBeGreaterThanOrEqual(0);
    expect(snap.selector.failureRate).toBe(0);
    expect(snap.contentQuality.avgOverallQuality).toBe(0);
    expect(snap.publish.successRate).toBe(0);
  });
});

describe('getDashboardSummary', () => {
  it('읽을 수 있는 문자열을 반환한다', () => {
    recordPublishAttempt(true, 3000);
    recordSelectorAttempt(true);
    const summary = getDashboardSummary();
    expect(typeof summary).toBe('string');
    expect(summary).toContain('[Dashboard]');
    expect(summary).toContain('발행');
    expect(summary).toContain('셀렉터');
  });
});

describe('resetAllMetrics', () => {
  it('모든 메트릭을 초기화한다', () => {
    recordPublishAttempt(true);
    recordSelectorAttempt(false, 'test');
    recordContentQuality({ overallQuality: 80, overallRisk: 20, expertiseScore: 70, experienceScore: 60, verdict: 'pass' });

    resetAllMetrics();
    const snap = getDashboardSnapshot();

    expect(snap.selector.totalAttempts).toBe(0);
    expect(snap.contentQuality.totalGenerated).toBe(0);
    expect(snap.publish.totalAttempts).toBe(0);
    expect(snap.session.totalLogins).toBe(0);
  });
});
