// src/main/ipc/issueCollectHandlers.ts
// issue:collectImages — 이슈 끝판왕 이미지 수집 IPC.
// Isolated from search-images-for-headings / image:searchNaver on purpose:
// the issue harness has its own URL policy (news CDNs allowed) and must not
// leak behavior into the shopping/full-auto pipelines.

import { ipcMain } from 'electron';
import { loadConfig, applyConfigToEnv } from '../../configManager.js';
import { ensureLicenseValid, enforceFreeTier } from '../utils/authUtils.js';
import { validateIssueCollectPayload } from './validators.js';
import { resolveIssueVisionRoute, resolveIssueVisionKey, type IssueVisionRoute } from '../../crawler/issueHarness/visionRoute.js';

// 키 해석은 수집기 쪽 단일 구현(visionRoute)으로 옮겼다 — 기존 호출부/테스트를 위해 그대로 내보낸다.
export { resolveIssueVisionKey };
import { resolveIssueTextGenerator, type IssuePlanCaller } from '../../crawler/issueHarness/textRoute.js';
import { resolveSelectedEngineRoute } from './paraphraseAnalysisHandlers.js';

export function registerIssueCollectHandlers(): void {
  ipcMain.handle('issue:collectImages', async (_event, payload: unknown) => {
    try {
      const v = validateIssueCollectPayload(payload);
      if (!v.ok) {
        console.error(`[Main] 🛡️ issue:collectImages payload 검증 실패: ${v.error}`);
        return { success: false, message: v.error, images: {}, candidates: {} };
      }

      // 실행 직전 최신 설정 동기화 (Naver env 키 포함)
      let visionRoute: IssueVisionRoute | null = null;
      let planCaller: IssuePlanCaller | undefined;
      let planEngineLabel: string | undefined;
      try {
        const config = await loadConfig();
        applyConfigToEnv(config);
        /*
         * 검색어 플랜(텍스트)도 고른 엔진으로 간다 — 예전엔 Gemini 로 박혀 있었다.
         * 에이전트를 골랐으면 구독 CLI라 추가 과금이 없다. 고른 엔진을 쓸 수 없으면
         * 휴리스틱 플랜(무료)으로 내려간다.
         */
        const generator = resolveIssueTextGenerator(config);
        const textRoute = generator ? resolveSelectedEngineRoute(generator, config as unknown as Record<string, unknown>) : null;
        if (textRoute) {
          planEngineLabel = textRoute.engine;
          // 구독 CLI는 API 호출보다 훨씬 느리다 — 기다릴 수 있다고 알려 준다.
          const timeoutMs = textRoute.subscription ? 300_000 : undefined;
          planCaller = (prompt: string) => textRoute.callModel(prompt, { maxTokens: 4096, timeoutMs });
        }
        /*
         * [2026-09-15 사장님] "지피티면 지피티, 클로드면 클로드, 에이전트면 에이전트로
         * 비전이 돌아가게 해줘야 정상이잖아." 고른 글생성 엔진이 비전 벤더를 정한다.
         * 고른 엔진으로 비전을 못 하면 다른 벤더로 몰래 청구하지 않고 무료 게이트로 간다.
         */
        visionRoute = resolveIssueVisionRoute(config);
      } catch (e) {
        console.error('[Main] issue:collectImages - 설정 동기화 실패:', e);
      }

      /*
       * [2026-09-12] 경로가 없어도 멈추지 않는다 — 캡션 근거로 판정하는 로컬 게이트가 있다
       * (captionRelevanceGate). 다만 워터마크·구도는 텍스트로 못 보므로 그 사실을 화면에
       * 먼저 알린다. 예전에는 경고가 콘솔에만 찍혀 6분 뒤 "0장" 만 보였다.
       */
      const planNotice = planEngineLabel
        ? `🧠 검색어 플랜: ${planEngineLabel}`
        : '🧠 검색어 플랜: 휴리스틱(무료) — 고른 엔진으로 AI 플랜을 만들 수 없습니다.';
      console.log(`[Main] issue:collectImages — ${planNotice}`);
      const notice = !visionRoute
        ? '⚠️ 고른 AI 엔진으로 이미지 검사를 할 수 없어 캡션 텍스트로만 판정합니다(무료) — 워터마크·구도는 확인하지 못합니다.'
        : visionRoute.free
          ? `🖼️ 이미지 검사: ${visionRoute.label} — 구독으로 돌아가 API 추가 과금이 없습니다.`
          : `🖼️ 이미지 검사: ${visionRoute.label}${visionRoute.fellBack ? ' (고른 엔진이 비전 미지원이라 같은 계열로 대체)' : ''} — API 비용이 발생합니다.`;
      console.log(`[Main] issue:collectImages — ${notice}`);
      try {
        _event.sender.send('issue:collectProgress', { percent: 1, message: notice });
      } catch { /* window may be gone */ }

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
        planCaller,
        planEngineLabel,
        visionRoute,
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
