/**
 * 이미지 provider 저장값 1회성 마이그레이션 — v2.10.335 나노바나나 3종 분리.
 *
 * 배경: v2.7.57~v2.10.334 동안 'nano-banana-pro'는 통합된 단일 옵션으로,
 *   기본 모델 키 'gemini-3-1-flash'(현재 gemini-3.1-flash-image)를 호출했다.
 *   v2.10.335부터 'nano-banana-pro'는 "나노바나나 프로"(현재 gemini-3-pro-image, 고가)를
 *   의미하고, gemini-3.1-flash는 "나노바나나2"(nano-banana-2)로 분리됐다.
 *
 *   따라서 레거시 저장값 'nano-banana-pro'를 행동 보존을 위해 'nano-banana-2'로 1회 변환한다.
 *   (Stage 0 캐릭터라이제이션 측정으로 확정한 타깃 — 추측 아님.)
 *
 * 1회성: 버전 플래그로 가드한다. 마이그레이션 완료 후에는 사용자가 직접 고른
 *   'nano-banana-pro'(나노바나나 프로) 선택을 절대 다시 건드리지 않는다.
 *
 * 레거시 'nano-banana-2'는 변환하지 않는다 — 신규 체계에서도 동일하게
 *   gemini-3.1-flash-image로 라우팅되어 동작이 보존되기 때문이다.
 */

/** 마이그레이션 완료 플래그 (1회성 가드) */
const MIGRATION_FLAG = 'imageEngineTrioMigrated_v2_10_335';

/** 이미지 엔진을 저장하는 localStorage 키 목록 */
const ENGINE_STORAGE_KEYS = ['fullAutoImageSource', 'globalImageSource', 'scAIImageEngine'];

/**
 * 레거시 'nano-banana-pro' 저장값을 'nano-banana-2'로 1회 변환한다.
 * renderer 초기화 시점에 가장 먼저 호출해야 한다 (다른 코드가 값을 읽기 전).
 */
export function migrateImageProviderStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(MIGRATION_FLAG) === '1') return;

    let migratedCount = 0;
    for (const key of ENGINE_STORAGE_KEYS) {
      if (localStorage.getItem(key) === 'nano-banana-pro') {
        localStorage.setItem(key, 'nano-banana-2');
        migratedCount++;
        console.log(`[ImageMigration] 🔄 ${key}: nano-banana-pro → nano-banana-2 (행동 보존 1회 변환)`);
      }
    }

    localStorage.setItem(MIGRATION_FLAG, '1');
    console.log(`[ImageMigration] ✅ 나노바나나 3종 분리 마이그레이션 완료 (${migratedCount}개 키 변환)`);
  } catch (e) {
    // 마이그레이션 실패는 비치명적 — 기본 동작 유지
    console.warn('[ImageMigration] ⚠️ 마이그레이션 실패(무시):', (e as Error).message);
  }
}

/** 마이그레이션 완료 여부 (테스트/진단용) */
export function isImageProviderMigrationDone(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MIGRATION_FLAG) === '1';
  } catch {
    return false;
  }
}
