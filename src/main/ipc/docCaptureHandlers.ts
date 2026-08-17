// src/main/ipc/docCaptureHandlers.ts
// doc:captureOfficial — 공식문서 캡처 하네스 IPC (경제·지원금 글 전용, 옵트인).
// Progress is relayed to the renderer progress modal via doc:captureProgress.

import { ipcMain, app } from 'electron';
import { join } from 'path';
import { loadConfig, applyConfigToEnv } from '../../configManager.js';
import { ensureLicenseValid, enforceFreeTier } from '../utils/authUtils.js';
import { validateIssueCollectPayload } from './validators.js';

function sanitizeDirToken(s: string): string {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'post';
}

export function registerDocCaptureHandlers(): void {
  ipcMain.handle('doc:captureOfficial', async (_event, payload: unknown) => {
    try {
      // Same shape as issue:collectImages (title + headings[{title,body}]).
      const v = validateIssueCollectPayload(payload);
      if (!v.ok) {
        console.error(`[Main] 🛡️ doc:captureOfficial payload 검증 실패: ${v.error}`);
        return { success: false, message: v.error, captures: [] };
      }

      let geminiApiKey = '';
      try {
        const config = await loadConfig();
        applyConfigToEnv(config);
        geminiApiKey = String((config as any).geminiApiKey || '');
      } catch (e) {
        console.error('[Main] doc:captureOfficial - 설정 동기화 실패:', e);
      }

      if (!(await ensureLicenseValid())) {
        return { success: false, message: '라이선스 인증이 필요합니다.', captures: [] };
      }
      const mediaCheck = await enforceFreeTier('media', 1);
      if (!mediaCheck.allowed) {
        return mediaCheck.response;
      }

      const saveDir = join(
        app.getPath('downloads'),
        'naver-blog-images',
        sanitizeDirToken(v.value.title),
        '공식문서',
      );

      console.log(`[Main] 🏛️ doc:captureOfficial 시작: "${v.value.title}" (${v.value.headings.length}개 소제목)`);
      const { captureOfficialDocs } = await import('../../crawler/docCapture/harness.js');
      const result = await captureOfficialDocs(v.value, saveDir, {
        geminiApiKey,
        onProgress: (info) => {
          try { _event.sender.send('doc:captureProgress', info); } catch { /* window may be gone */ }
        },
      });

      console.log(
        `[Main] ✅ doc:captureOfficial 완료: 페이지 ${result.stats.pagesVisited}, 캡처 ${result.stats.segmentsCaptured}컷 → 배치 ${result.captures.length}`,
      );
      return { success: true, ...result };
    } catch (error: any) {
      console.error('[Main] ❌ doc:captureOfficial 실패:', error);
      return { success: false, message: error?.message || 'unknown', captures: [] };
    }
  });
}
