import { app, ipcMain } from 'electron';
import {
  getContentPolicyDashboard,
  pauseContentPolicyPublishing,
  recordManualTestEvidence,
  resumeContentPolicyPublishing,
} from '../../contentPolicy/operatorService.js';
import { runExposureCrossChecks } from '../../contentPolicy/exposureCrossChecker.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerContentPolicyHandlers(): void {
  ipcMain.handle('contentPolicy:getDashboard', async (_event, limit?: number) => {
    try {
      const boundedLimit = Number.isFinite(limit)
        ? Math.max(1, Math.min(500, Math.floor(Number(limit))))
        : 100;
      return {
        success: true,
        dashboard: await getContentPolicyDashboard(app.getPath('userData'), boundedLimit),
      };
    } catch (error) {
      return { success: false, message: errorMessage(error) };
    }
  });

  ipcMain.handle('contentPolicy:pause', async (_event, reason: unknown) => {
    try {
      if (typeof reason !== 'string') throw new Error('PAUSE_REASON_REQUIRED');
      return {
        success: true,
        state: await pauseContentPolicyPublishing(app.getPath('userData'), reason),
      };
    } catch (error) {
      return { success: false, message: errorMessage(error) };
    }
  });

  ipcMain.handle('contentPolicy:resume', async (_event, approval: unknown) => {
    try {
      const value = approval && typeof approval === 'object'
        ? approval as Record<string, unknown>
        : {};
      return {
        success: true,
        state: await resumeContentPolicyPublishing(app.getPath('userData'), {
          approvedBy: typeof value.approvedBy === 'string' ? value.approvedBy : '',
          rootCauseReviewed: value.rootCauseReviewed === true,
          manualTestVerified: value.manualTestVerified === true,
        }),
      };
    } catch (error) {
      return { success: false, message: errorMessage(error) };
    }
  });

  ipcMain.handle('contentPolicy:verifyManualTest', async (_event, request: unknown) => {
    try {
      const value = request && typeof request === 'object' ? request as Record<string, unknown> : {};
      const url = typeof value.url === 'string' ? value.url.trim().slice(0, 500) : '';
      const title = typeof value.title === 'string' ? value.title.trim().slice(0, 200) : '';
      const keyword = typeof value.keyword === 'string' ? value.keyword.trim().slice(0, 200) : '';
      const match = url.match(/^https:\/\/blog\.naver\.com\/([^/?#]+)\/(\d+)(?:[/?#]|$)/i);
      if (!match || !title || !keyword) throw new Error('MANUAL_TEST_TARGET_INVALID');
      const checks = await runExposureCrossChecks({
        articleId: `manual-test-${match[1]}-${match[2]}`,
        title,
        keyword,
        blogId: match[1],
        logNo: match[2],
        url,
      });
      const state = await recordManualTestEvidence(app.getPath('userData'), {
        url,
        title,
        keyword,
        checks,
      });
      return { success: true, state, checks };
    } catch (error) {
      return { success: false, message: errorMessage(error) };
    }
  });
}
