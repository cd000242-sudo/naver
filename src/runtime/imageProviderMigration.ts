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

// ═════════════════════════════════════════════════════════════════
// [2026-10-10] 나노바나나는 나노바나나2(Gemini 3.1 Flash Image) 한 종류만 노출한다.
//   옛 저장값(nano-banana-pro / nano-banana)과 슬롯 모델(2.5 / 3-pro / 3-pro-4k)을
//   어디서 읽든 나노바나나2로 돌린다. 백엔드의 pro·nano 라우팅은 남겨 두되
//   사용자 선택·저장값으로는 더 이상 도달하지 않게 한다.
// ═════════════════════════════════════════════════════════════════

/** 화면에서 내려간 옛 나노바나나 엔진 값 */
const RETIRED_NANO_ENGINES: ReadonlySet<string> = new Set(['nano-banana-pro', 'nano-banana']);

/** 화면에서 내려간 옛 슬롯 모델 값 (Gemini 2.5 Flash / 3 Pro / 3 Pro 4K) */
const RETIRED_NANO_SLOT_MODELS: ReadonlySet<string> = new Set(['gemini-2.5-flash', 'gemini-3-pro', 'gemini-3-pro-4k']);

/** 엔진 값을 저장하는 localStorage 키 (옛 값 이관 대상) */
const SINGLE_ENGINE_STORAGE_KEYS = [
  'fullAutoImageSource',
  'globalImageSource',
  'scAIImageEngine',
  'scSubImageSource',
  'localFolderFallbackEngine',
];

/** 나노바나나 슬롯 모델을 저장하는 localStorage 키 */
const NANO_SLOT_STORAGE_KEYS = ['nanoBananaMainModel', 'nanoBananaSubModel', 'nanoBananaModel'];

/** 옛 나노바나나 엔진 값이면 nano-banana-2로, 아니면 그대로 돌려준다. */
export function normalizeRetiredNanoEngine<T>(value: T): T | 'nano-banana-2' {
  return typeof value === 'string' && RETIRED_NANO_ENGINES.has(value.trim()) ? 'nano-banana-2' : value;
}

/** 옛 슬롯 모델 값이면 gemini-3-1-flash로, 아니면 그대로 돌려준다. */
export function normalizeRetiredNanoSlotModel<T>(value: T): T | 'gemini-3-1-flash' {
  return typeof value === 'string' && RETIRED_NANO_SLOT_MODELS.has(value.trim()) ? 'gemini-3-1-flash' : value;
}

/**
 * 저장소에 남은 옛 나노바나나 값을 나노바나나2로 이관한다. 멱등이라 매 기동 호출해도 안전하다
 * (프로·2.5는 더 이상 고를 수 없으므로 되돌릴 사용자 선택이 없다).
 * @returns 바꾼 키 개수
 */
export function migrateNanoBananaSingleEngine(storage?: Pick<Storage, 'getItem' | 'setItem'>): number {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    if (!store) return 0;
    let changed = 0;
    for (const key of SINGLE_ENGINE_STORAGE_KEYS) {
      const saved = store.getItem(key);
      const next = normalizeRetiredNanoEngine(saved);
      if (saved !== null && next !== saved) {
        store.setItem(key, next as string);
        changed++;
        console.log(`[ImageMigration] 🔄 ${key}: ${saved} → ${next} (나노바나나 단일화)`);
      }
    }
    for (const key of NANO_SLOT_STORAGE_KEYS) {
      const saved = store.getItem(key);
      const next = normalizeRetiredNanoSlotModel(saved);
      if (saved !== null && next !== saved) {
        store.setItem(key, next as string);
        changed++;
        console.log(`[ImageMigration] 🔄 ${key}: ${saved} → ${next} (나노바나나 단일화)`);
      }
    }
    return changed;
  } catch (e) {
    console.warn('[ImageMigration] ⚠️ 나노바나나 단일화 이관 실패(무시):', (e as Error).message);
    return 0;
  }
}
