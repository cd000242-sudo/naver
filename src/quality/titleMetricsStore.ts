// Phase 3 (5 Opus 합의): 제목 검증 메트릭 영구 저장 — 100점 시스템 측정 기반.
//
// 측정 5지표 (M1~M5):
//   M1 Intent Match Score (LLM judge)
//   M2 Pattern Diversity Index (Shannon entropy)
//   M3 5초 Bounce Rate (외부 데이터, 추후 연동)
//   M4 CTR Lift vs Baseline (외부 데이터, 추후 연동)
//   M5 Hallucination Rate (정규식 + LLM judge 이중 검사)

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { app } from 'electron';
import type { VerificationMetric } from './verificationLoop.js';

const STORE_DIR = (() => {
  try {
    return path.join(app.getPath('userData'), 'title-metrics');
  } catch {
    return path.join(process.cwd(), 'title-metrics');
  }
})();

const METRICS_FILE = path.join(STORE_DIR, 'metrics.jsonl');
const STATS_FILE = path.join(STORE_DIR, 'stats.json');

if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });

export async function recordMetric(metric: VerificationMetric): Promise<void> {
  try {
    await fs.appendFile(METRICS_FILE, JSON.stringify(metric) + '\n');
  } catch (err) {
    console.warn('[TitleMetrics] 기록 실패:', (err as Error).message);
  }
}

export interface AggregatedStats {
  total: number;
  premiumCount: number;
  standardCount: number;
  avgScore: number;
  avgAttempts: number;
  exhaustedRate: number;
  modeBreakdown: Record<string, { count: number; avgScore: number; avgAttempts: number }>;
  patternDiversityIndex: number; // M2 — Shannon entropy
  lastUpdated: string;
}

export async function aggregateStats(windowDays: number = 7): Promise<AggregatedStats | null> {
  if (!existsSync(METRICS_FILE)) return null;

  try {
    const raw = await fs.readFile(METRICS_FILE, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const metrics: VerificationMetric[] = [];

    for (const line of lines) {
      try {
        const m = JSON.parse(line);
        if (new Date(m.timestamp).getTime() >= cutoff) metrics.push(m);
      } catch { /* ignore */ }
    }

    if (metrics.length === 0) return null;

    const premiumCount = metrics.filter((m) => m.premium).length;
    const standardCount = metrics.length - premiumCount;
    const avgScore = metrics.reduce((s, m) => s + m.selectedScore, 0) / metrics.length;
    const avgAttempts = metrics.reduce((s, m) => s + m.attempts, 0) / metrics.length;
    const exhaustedRate = metrics.filter((m) => m.exhausted).length / metrics.length;

    const modeBreakdown: AggregatedStats['modeBreakdown'] = {};
    for (const m of metrics) {
      if (!modeBreakdown[m.mode]) {
        modeBreakdown[m.mode] = { count: 0, avgScore: 0, avgAttempts: 0 };
      }
      const e = modeBreakdown[m.mode];
      e.count++;
      e.avgScore += m.selectedScore;
      e.avgAttempts += m.attempts;
    }
    for (const k of Object.keys(modeBreakdown)) {
      const e = modeBreakdown[k];
      e.avgScore = Math.round(e.avgScore / e.count);
      e.avgAttempts = Math.round(e.avgAttempts / e.count * 10) / 10;
    }

    // M2 Pattern Diversity Index — Shannon entropy on (mode, score range)
    const buckets = new Map<string, number>();
    for (const m of metrics) {
      const bucket = `${m.mode}:${Math.floor(m.selectedScore / 10) * 10}`;
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }
    let entropy = 0;
    const total = metrics.length;
    for (const count of buckets.values()) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    const stats: AggregatedStats = {
      total: metrics.length,
      premiumCount,
      standardCount,
      avgScore: Math.round(avgScore),
      avgAttempts: Math.round(avgAttempts * 10) / 10,
      exhaustedRate: Math.round(exhaustedRate * 100) / 100,
      modeBreakdown,
      patternDiversityIndex: Math.round(entropy * 100) / 100,
      lastUpdated: new Date().toISOString(),
    };

    await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
    return stats;
  } catch (err) {
    console.warn('[TitleMetrics] 집계 실패:', (err as Error).message);
    return null;
  }
}
