/**
 * [2026-09-23 사장님] "전체 초기화 하면 완전히 껐다 킨 상태로 돌아와야 됩니다."
 *
 * 왜 안 됐나: 전체 초기화는 **DOM 과 전역 변수 몇 개**만 비웠다. 렌더러 모듈 31개가 각자 들고 있는
 * 모듈 상태(`let state = …`)는 그대로 살아남는다. 화면은 비어 보이는데 상태는 지난 글이다.
 * 실제로 2026-09-15 에 같은 신고가 있었고("전체 초기화해도 남아 있습니다") 그때는 사진 모드 한 곳만
 * resetNarrativeState 로 막았다 — 모듈이 늘어나면 또 새는 구조다.
 *
 * 그래서 초기화의 정의를 바꾼다: **열거해서 지우는 대신, 렌더러를 실제로 다시 띄운다.**
 * 새 모듈이 생겨도 자동으로 포함된다.
 *
 * 이 파일은 순수 정책만 담는다 — 무엇을 지우고(작업물) 무엇을 남길지(설정), 어떤 순서로 할지.
 */

/** 재시작해도 되살아나면 안 되는 "이번 글 작업물" 키. autosave_ 접두는 전부 여기 해당한다. */
export const WORK_STORAGE_PREFIXES: readonly string[] = ['autosave_'];

/** 접두로는 안 잡히는 작업물 키(명시 목록). */
export const WORK_STORAGE_KEYS: readonly string[] = ['lastError'];

/**
 * 설정 키는 지우지 않는다 — 껐다 켜도 남는 값이기 때문이다.
 * (imageRatio·ftcDisclosure*·모델 선택·proxy·adspower·multiAccount.lastSettings·각종 "본 적 있음" 플래그)
 */
export function isWorkStorageKey(key: string): boolean {
  const name = String(key || '');
  if (!name) return false;
  if (WORK_STORAGE_KEYS.includes(name)) return true;
  return WORK_STORAGE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function collectWorkStorageKeys(allKeys: readonly string[]): string[] {
  return allKeys.filter(isWorkStorageKey);
}

export type GlobalResetStep =
  | 'cancel-automation'
  | 'reset-image-state'
  | 'clear-work-storage'
  | 'reload-renderer';

/**
 * 순서가 중요하다.
 *  1) 돌고 있는 자동화·브라우저를 먼저 멈춘다 — 안 멈추면 리로드 뒤 주인 없는 창이 남는다.
 *  2) 메인 프로세스 이미지 상태를 비운다(렌더러 리로드로는 안 지워진다).
 *  3) 작업물 저장분을 지운다 — **리로드 전에** 지워야 부팅 때 지난 원고가 되살아나지 않는다.
 *  4) 렌더러를 다시 띄운다 = 모듈 상태 전부 새로.
 */
export const GLOBAL_RESET_STEPS: readonly GlobalResetStep[] = [
  'cancel-automation',
  'reset-image-state',
  'clear-work-storage',
  'reload-renderer',
];

export function describeGlobalResetStep(step: GlobalResetStep): string {
  switch (step) {
    case 'cancel-automation': return '실행 중인 자동화·브라우저 종료';
    case 'reset-image-state': return '메인 프로세스 이미지 상태 초기화';
    case 'clear-work-storage': return '임시 저장된 이번 글 작업물 삭제';
    case 'reload-renderer': return '화면 다시 시작 (껐다 켠 상태)';
    default: return String(step);
  }
}
