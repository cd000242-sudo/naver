// Phase 4 (5 Opus 합의): "100점 모드" IPC 핸들러 + 메트릭 조회.
//
// 사용자 노출 API:
//   - title-quality:get-stats — 최근 7일 집계
//   - title-quality:set-premium — 100점 모드 토글 ON/OFF
//   - title-quality:get-premium — 현재 토글 상태

import { ipcMain } from 'electron';
import { aggregateStats } from '../../quality/titleMetricsStore.js';
import { loadConfig, saveConfig } from '../../configManager.js';

export function registerTitleQualityHandlers(): void {
  ipcMain.handle('title-quality:get-stats', async (_evt, days?: number) => {
    return aggregateStats(days || 7);
  });

  ipcMain.handle('title-quality:set-premium', async (_evt, enabled: boolean) => {
    const cfg = await loadConfig();
    (cfg as any).premiumTitleMode = !!enabled;
    await saveConfig(cfg);
    return { ok: true, premiumTitleMode: !!enabled };
  });

  ipcMain.handle('title-quality:get-premium', async () => {
    const cfg = await loadConfig();
    return { premiumTitleMode: !!(cfg as any).premiumTitleMode };
  });
}
