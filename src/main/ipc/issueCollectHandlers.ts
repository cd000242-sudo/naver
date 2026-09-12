// src/main/ipc/issueCollectHandlers.ts
// issue:collectImages — 이슈 끝판왕 이미지 수집 IPC.
// Isolated from search-images-for-headings / image:searchNaver on purpose:
// the issue harness has its own URL policy (news CDNs allowed) and must not
// leak behavior into the shopping/full-auto pipelines.

import { ipcMain } from 'electron';
import { loadConfig, applyConfigToEnv } from '../../configManager.js';
import { ensureLicenseValid, enforceFreeTier } from '../utils/authUtils.js';
import { validateIssueCollectPayload } from './validators.js';

/*
 * 비전 키를 한 곳에서만 찾다가 "키가 있는데 없다고" 하는 일을 막는다.
 * 실측(2026-09-12): 활성 계정 설정에 평문 키(AIza…39자)가 있는데도 수집기는 키 없음으로 돌았다.
 * 저장 위치가 여럿이다 — 정규화된 필드 / 다중 키 배열 / 하이픈 표기 / 환경변수.
 */
export function resolveIssueVisionKey(config: unknown): string {
  const c = (config ?? {}) as Record<string, unknown>;
  const fromList = Array.isArray(c.geminiApiKeys)
    ? (c.geminiApiKeys as unknown[]).map((k) => String(k ?? '').trim()).find((k) => k.length > 0)
    : '';
  const candidate = String(c.geminiApiKey ?? '').trim()
    || String(fromList ?? '').trim()
    || String(c['gemini-api-key'] ?? '').trim()
    || String(process.env.GEMINI_API_KEY ?? '').trim();
  // 암호화 저장본("enc:…")은 복호화 전이라 그대로 쓰면 인증이 실패한다 — 없는 것으로 본다.
  if (!candidate || candidate.startsWith('enc:')) return '';
  return candidate;
}

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
        geminiApiKey = resolveIssueVisionKey(config);
      } catch (e) {
        console.error('[Main] issue:collectImages - 설정 동기화 실패:', e);
      }

      /*
       * [2026-09-12] 키가 없어도 멈추지 않는다 — 캡션 근거로 판정하는 로컬 게이트가 있다
       * (captionRelevanceGate). 다만 워터마크·구도는 텍스트로 못 보므로 그 사실을 화면에
       * 먼저 알린다. 예전에는 경고가 콘솔에만 찍혀 6분 뒤 "0장" 만 보였다.
       */
      if (!geminiApiKey) {
        console.warn('[Main] issue:collectImages — Gemini 키 없음: 캡션 근거로만 판정한다(워터마크·구도 미검사)');
        try {
          _event.sender.send('issue:collectProgress', {
            percent: 1,
            message: '⚠️ Gemini 키가 없어 캡션 텍스트로만 관련성을 판정합니다 — 워터마크·구도는 확인하지 못합니다.',
          });
        } catch { /* window may be gone */ }
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
