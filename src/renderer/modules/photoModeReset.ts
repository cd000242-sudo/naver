// src/renderer/modules/photoModeReset.ts
// [2026-09-09] 발행이 끝나면 사진 모드도 다음 글을 쓸 수 있는 상태로 되돌린다.
//
// 사장님 요청: "어떤 모드든지 글 발행이 완료되면 다음 글을 발행할 수 있도록 초기화가
// 되어야 합니다. 다음 글 작성할 수 있는 준비가 되어야 되는데 그게 빠졌어요."
//
// 왜 빠졌나: resetAllFields() 는 SEO/반자동 시절에 만들어져 그때 있던 입력칸만 비운다.
// 뒤에 붙은 사진 모드 패널(사진·상황 메모·장소 목록)은 아무도 건드리지 않아, 발행 뒤에도
// 지난 글의 사진과 메모가 그대로 남았다. 그 상태로 다음 글을 만들면 지난 여행의 재료가
// 새 글에 섞여 든다 — 빈 화면으로 시작하는 것보다 나쁘다.

import { clearUploadedImages } from './imageNarrativeUpload.js';
import { resetNarrativeState } from './imageNarrativeMode.js';
import { resetQuickModeState } from './imageNarrativeQuickMode.js';

/** 지난 글의 추론 결과가 그려져 있던 자리. 상태만 비우면 화면에 잔상이 남는다. */
const PHOTO_RESULT_PANEL_IDS = ['image-narrative-review-panel'] as const;

/** 사진 모드 상황 입력칸들. 화면(index.html)과 _readPhotoContext 가 쓰는 id 그대로. */
const PHOTO_CONTEXT_FIELD_IDS = [
  'image-narrative-context-time',
  'image-narrative-context-people',
  'image-narrative-context-place',
  'image-narrative-context-occasion',
  'image-narrative-context-notes',
] as const;

function clearFieldValue(id: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el) el.value = '';
}

/**
 * 사진 모드를 다음 글 상태로 되돌린다.
 *
 * 실패해도 발행 흐름을 막지 않는다 — 초기화는 편의이지 발행의 일부가 아니다.
 * 다만 무엇이 실패했는지는 콘솔에 남긴다(조용히 안 지워지면 다음 글이 오염된다).
 */
export function resetPhotoModeForNextPost(): void {
  try {
    clearUploadedImages();
  } catch (error) {
    console.warn('[PhotoModeReset] 업로드 사진 정리 실패:', (error as Error)?.message);
  }

  /*
   * [2026-09-10 사장님 실측] "장소가 이제는 하나도 삽입이 안 됐어."
   *
   * 여기서 장소를 지우던 것을 뺀다. 사진은 글마다 새로 올리지만 장소는 사장님이 여러 글에
   * 걸쳐 같은 가게를 쓴다. 게다가 이 초기화는 앱 예약 발행 스케줄러가 임의 시점에도
   * 부르므로(automation:reset-fields), 고른 장소가 사용자 모르게 사라졌다. 목록은 화면에
   * 그대로 보이니 지우고 싶으면 사용자가 직접 뺄 수 있다.
   */

  for (const id of PHOTO_CONTEXT_FIELD_IDS) {
    try {
      clearFieldValue(id);
    } catch (error) {
      console.warn(`[PhotoModeReset] ${id} 정리 실패:`, (error as Error)?.message);
    }
  }

  /*
   * [2026-09-15 사장님 실측] "전체 초기화해도 남아 있습니다."
   *
   * 여기까지는 사진과 상황 메모만 비웠다. 지난 글의 **추론 결과(NarrativePlan)** 는
   * imageNarrativeMode / QuickMode 모듈 안에 그대로 살아 있어서, 화면은 비어 보여도
   * 다음 글이 지난 글의 플랜 위에서 시작됐다. 상태와 화면을 같이 되돌린다.
   */
  try {
    resetNarrativeState();
  } catch (error) {
    console.warn('[PhotoModeReset] 추론 결과 정리 실패:', (error as Error)?.message);
  }
  try {
    resetQuickModeState();
  } catch (error) {
    console.warn('[PhotoModeReset] 빠른 모드 정리 실패:', (error as Error)?.message);
  }

  for (const id of PHOTO_RESULT_PANEL_IDS) {
    try {
      const panel = document.getElementById(id);
      if (panel) {
        panel.innerHTML = '';
        panel.style.display = 'none';
      }
    } catch (error) {
      console.warn(`[PhotoModeReset] ${id} 화면 정리 실패:`, (error as Error)?.message);
    }
  }
}
