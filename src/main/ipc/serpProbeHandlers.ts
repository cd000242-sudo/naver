// src/main/ipc/serpProbeHandlers.ts
// SERP 프로브 IPC handler — 끝판왕 Phase 3.4 (v2.10.184)
//
// 사용자 UI에서 SERP 실측 프로브 + 우리 글 비교 실행 가능.
//   - probe-only: 키워드만 받아 상위 노출 글 baseline 산출
//   - compare:    키워드 + 우리 글 + 모드 → benchmark 비교 리포트
//
// API 키는 config에서 자동 로드 (사용자 환경설정에 이미 있는 naverSearchClientId/Secret 활용).

import { ipcMain, app } from 'electron';
import { loadConfig } from '../../configManager.js';
import { probeSerp, type SerpProbeReport } from '../../analytics/serpProbe.js';
import { analyzeBenchmark, type BenchmarkReport } from '../../analytics/benchmarkAnalyzer.js';
import { evaluate as evaluateQuality, type EvaluationInput, type Mode } from '../../content/qualityEvaluator.js';
import { loadHistory, computeStats, getRecentEntries, clearHistory, computeAdaptiveLearningImpact, type SerpHistoryEntry, type SerpHistoryStats, type AdaptiveLearningImpact } from '../../analytics/serpHistory.js';
import { probeDynamicSerp, type DynamicSerpReport } from '../../analytics/dynamicSerpProbe.js';
import {
  trackPublishedPost,
  loadPublishedPosts,
  getPostsNeedingExposureCheck,
  recordExposureCheck,
  clearPublishedPosts,
  type PublishedPost,
} from '../../analytics/publishedPostTracker.js';
import { checkPostExposure, checkBatchExposure } from '../../analytics/exposureChecker.js';
import { computeCalibration, type CalibrationResult } from '../../analytics/calibration.js';

export interface ProbeRequest {
  keyword: string;
  display?: number;
  mode?: Mode;
}

export interface BenchmarkRequest extends ProbeRequest {
  ourBody: string;
  ourTitle?: string;
  ourPrimaryKeyword?: string;
}

export interface ProbeResponse {
  ok: boolean;
  report?: SerpProbeReport;
  error?: string;
}

export interface BenchmarkResponse {
  ok: boolean;
  serpReport?: SerpProbeReport;
  benchmark?: BenchmarkReport;
  error?: string;
}

async function loadSerpApiKeys(): Promise<{ clientId: string; clientSecret: string } | null> {
  try {
    const cfg = await loadConfig();
    const id = (cfg as any).naverSearchClientId || (cfg as any).naverDatalabClientId || '';
    const secret = (cfg as any).naverSearchClientSecret || (cfg as any).naverDatalabClientSecret || '';
    if (!id || !secret) return null;
    return { clientId: id, clientSecret: secret };
  } catch {
    return null;
  }
}

export function registerSerpProbeHandlers(): void {
  // 1. probe-only — 키워드만 받아 baseline 산출
  ipcMain.handle('serp:probe', async (_evt, req: ProbeRequest): Promise<ProbeResponse> => {
    try {
      if (!req?.keyword || !req.keyword.trim()) {
        return { ok: false, error: '키워드가 필요합니다.' };
      }
      const keys = await loadSerpApiKeys();
      if (!keys) {
        return {
          ok: false,
          error: '네이버 검색 API 키 미설정. 환경설정 → API 키에서 naverSearchClientId/Secret 입력 필요.',
        };
      }
      const report = await probeSerp(req.keyword.trim(), keys.clientId, keys.clientSecret, {
        display: req.display ?? 10,
        mode: req.mode ?? 'seo',
      });
      return { ok: true, report };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // 2. compare — 키워드 + 우리 글 → 직접 비교 benchmark
  ipcMain.handle('serp:benchmark', async (_evt, req: BenchmarkRequest): Promise<BenchmarkResponse> => {
    try {
      if (!req?.keyword || !req.keyword.trim()) {
        return { ok: false, error: '키워드가 필요합니다.' };
      }
      if (!req?.ourBody || req.ourBody.length < 100) {
        return { ok: false, error: '우리 글 본문이 너무 짧습니다 (최소 100자).' };
      }
      const keys = await loadSerpApiKeys();
      if (!keys) {
        return {
          ok: false,
          error: '네이버 검색 API 키 미설정. 환경설정 → API 키에서 naverSearchClientId/Secret 입력 필요.',
        };
      }

      // 1) SERP 프로브
      const serpReport = await probeSerp(req.keyword.trim(), keys.clientId, keys.clientSecret, {
        display: req.display ?? 10,
        mode: req.mode ?? 'seo',
      });

      // 2) 우리 글 평가
      const ourEvalInput: EvaluationInput = {
        body: req.ourBody,
        title: req.ourTitle || '',
        rawText: '',
        primaryKeyword: req.ourPrimaryKeyword || req.keyword,
        mode: req.mode ?? 'seo',
      };
      const ourEval = evaluateQuality(ourEvalInput);
      const ourConcrete = (ourEval.modeScore.details as Record<string, number>).concreteNumberCount ?? 0;
      const ourDirectExp = (ourEval.humanlikeScore.details as Record<string, number>).directExperience ?? 0;

      // 3) benchmark 비교
      const benchmark = analyzeBenchmark(ourEval, req.ourBody.length, ourConcrete, ourDirectExp, serpReport);

      return { ok: true, serpReport, benchmark };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // 3. history:stats — 누적 SERP 통계 (실측 추이 확인용) + 학습 효과
  ipcMain.handle('serp:historyStats', async (): Promise<{
    ok: boolean;
    stats?: SerpHistoryStats;
    recentEntries?: SerpHistoryEntry[];
    learningImpact?: AdaptiveLearningImpact;
    error?: string;
  }> => {
    try {
      const userDataPath = app.getPath('userData');
      const history = loadHistory(userDataPath);
      const stats = computeStats(history);
      const recentEntries = getRecentEntries(history, 30);
      const learningImpact = computeAdaptiveLearningImpact(history);
      return { ok: true, stats, recentEntries, learningImpact };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 5. serp:dynamicProbe — 실제 통합탭 HTML 동적 분석 (스마트블록 + 실제 노출)
  ipcMain.handle('serp:dynamicProbe', async (_evt, req: { keyword: string; maxCards?: number }): Promise<{
    ok: boolean;
    report?: DynamicSerpReport;
    error?: string;
  }> => {
    try {
      if (!req?.keyword || !req.keyword.trim()) {
        return { ok: false, error: '키워드가 필요합니다.' };
      }
      const report = await probeDynamicSerp(req.keyword.trim(), { maxCards: req.maxCards ?? 10 });
      return { ok: true, report };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 4. history:clear — 누적 history 초기화 (사용자 명시 요청 시)
  ipcMain.handle('serp:historyClear', async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const userDataPath = app.getPath('userData');
      const ok = clearHistory(userDataPath);
      return { ok };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ✅ [v2.10.199 Phase 3.18.4] 발행 후 자동 trackPublishedPost — renderer가 발행 완료 이벤트 후 호출
  ipcMain.handle('publishedPost:track', async (_evt, req: {
    publishedAt?: string;
    keyword: string;
    mode: string;
    publishedUrl: string;
    title: string;
    evaluator: PublishedPost['evaluator'];
    serpBenchmark?: PublishedPost['serpBenchmark'];
  }): Promise<{ ok: boolean; id?: string; error?: string }> => {
    try {
      // URL에서 blogId / logNo 추출 (https://blog.naver.com/{blogId}/{logNo})
      const m = req.publishedUrl.match(/blog\.naver\.com\/([^/?]+)\/(\d+)/i);
      if (!m) {
        return { ok: false, error: `publishedUrl 형식 불일치: ${req.publishedUrl}` };
      }
      const [, blogId, logNo] = m;
      const userDataPath = app.getPath('userData');
      const result = trackPublishedPost(userDataPath, {
        publishedAt: req.publishedAt || new Date().toISOString(),
        keyword: req.keyword,
        mode: req.mode,
        blogId,
        logNo,
        url: req.publishedUrl,
        title: req.title,
        evaluator: req.evaluator,
        serpBenchmark: req.serpBenchmark,
      });
      return result;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ✅ [v2.10.199] exposure 폴링 trigger (사용자 수동 또는 백그라운드 호출)
  ipcMain.handle('publishedPost:checkExposure', async (_evt, req: {
    hoursAfter?: 24 | 48 | 72;
    delayMs?: number;
  }): Promise<{ ok: boolean; checked: number; updated: number; error?: string }> => {
    try {
      const userDataPath = app.getPath('userData');
      const posts = loadPublishedPosts(userDataPath);
      const hoursAfter = req.hoursAfter ?? 24;
      const needCheck = getPostsNeedingExposureCheck(posts, hoursAfter);
      if (needCheck.length === 0) {
        return { ok: true, checked: 0, updated: 0 };
      }
      const targets = needCheck.map(p => ({
        id: p.id, keyword: p.keyword, blogId: p.blogId, logNo: p.logNo, hoursAfter,
      }));
      const results = await checkBatchExposure(targets, { delayMs: req.delayMs ?? 1500 });
      let updated = 0;
      for (const r of results) {
        if (r.result.fetchSuccess) {
          recordExposureCheck(userDataPath, r.id, {
            checkedAt: r.result.checkedAt,
            hoursAfter: r.hoursAfter,
            searchedKeyword: r.result.searchedKeyword,
            position: r.result.position,
            hasSmartblock: r.result.hasSmartblock,
            notes: r.result.notes,
          });
          updated++;
        }
      }
      return { ok: true, checked: needCheck.length, updated };
    } catch (err) {
      return { ok: false, checked: 0, updated: 0, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ✅ [v2.10.199] calibration 결과 조회
  ipcMain.handle('publishedPost:calibration', async (): Promise<{
    ok: boolean;
    calibration?: CalibrationResult;
    totalPosts?: number;
    error?: string;
  }> => {
    try {
      const userDataPath = app.getPath('userData');
      const posts = loadPublishedPosts(userDataPath);
      const calibration = computeCalibration(posts);
      return { ok: true, calibration, totalPosts: posts.length };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ✅ [v2.10.199] published posts 초기화 (사용자 명시 요청 시)
  ipcMain.handle('publishedPost:clear', async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const userDataPath = app.getPath('userData');
      const ok = clearPublishedPosts(userDataPath);
      return { ok };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  console.log('[IPC] SERP Probe handlers registered (serp:probe, serp:benchmark, serp:historyStats, serp:historyClear, serp:dynamicProbe, publishedPost:track/checkExposure/calibration/clear)');
}
