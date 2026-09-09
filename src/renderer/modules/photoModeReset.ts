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
import { clearPickedPlaces } from './placePicker.js';

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

  try {
    clearPickedPlaces();
  } catch (error) {
    console.warn('[PhotoModeReset] 장소 목록 정리 실패:', (error as Error)?.message);
  }

  for (const id of PHOTO_CONTEXT_FIELD_IDS) {
    try {
      clearFieldValue(id);
    } catch (error) {
      console.warn(`[PhotoModeReset] ${id} 정리 실패:`, (error as Error)?.message);
    }
  }
}
