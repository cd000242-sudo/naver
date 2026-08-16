// src/main/ipc/issueCollectHandlers.ts
// issue:collectImages — 이슈 끝판왕 이미지 수집 IPC.
// Isolated from search-images-for-headings / image:searchNaver on purpose:
// the issue harness has its own URL policy (news CDNs allowed) and must not
// leak behavior into the shopping/full-auto pipelines.

import { ipcMain } from 'electron';
import { loadConfig, applyConfigToEnv } from '../../configManager.js';
import { ensureLicenseValid, enforceFreeTier } from '../utils/authUtils.js';
import { validateIssueCollectPayload } from './validators.js';

export function registerIssueCollectHandlers(): void {
  ipcMain.handle('issue:collectImages', async (_event, payload: unknown) => {
    try {
      const v = validateIssueCollectPayload(payload);
      if (!v.ok) {
        console.error(`[Main] 🛡️ issue:collectImages payload 검증 실패: ${v.error}`);
        return { success: false, message: v.error, images: {}, candidates: {} };
      }

      // 실행 직전 최신 설정 동기화 (Naver env 키 포함)
      let geminiApiKey = '';
      try {
        const config = await loadConfig();
        applyConfigToEnv(config);
        geminiApiKey = String((config as any).geminiApiKey || '');
      } catch (e) {
        console.error('[Main] issue:collectImages - 설정 동기화 실패:', e);
      }

      if (!(await ensureLicenseValid())) {
        return { success: false, message: '라이선스 인증이 필요합니다.', images: {}, candidates: {} };
      }
      const mediaCheck = await enforceFreeTier('media', 1);
      if (!mediaCheck.allowed) {
        return mediaCheck.response;
      }

      console.log(`[Main] 🏆 issue:collectImages 시작: "${v.value.title}" (${v.value.headings.length}개 소제목)`);
      const { collectIssueImages } = await import('../../crawler/issueHarness/harness.js');
      const result = await collectIssueImages(v.value, {
        geminiApiKey,
        // 진행 상황을 렌더러 진행 모달로 실시간 중계
        onProgress: (info) => {
          try { _event.sender.send('issue:collectProgress', info); } catch { /* window may be gone */ }
        },
      });

      console.log(
        `[Main] ✅ issue:collectImages 완료: 후보 ${result.stats.totalCandidates} → 필터 ${result.stats.afterFilter}, 소스별 ${JSON.stringify(result.stats.perSource)}`,
      );
      return { success: true, ...result };
    } catch (error: any) {
      console.error('[Main] ❌ issue:collectImages 실패:', error);
      return { success: false, message: error?.message || 'unknown', images: {}, candidates: {} };
    }
  });
}
