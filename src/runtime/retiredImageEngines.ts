/**
 * 제품에서 빠진 이미지 엔진(Leonardo AI · DeepInfra · Prodia)의 저장된 선택값 처리.
 * 렌더러 번들에 인라인되는 파일이라 다른 모듈을 import 하지 않는다.
 */

/** 엔진 값을 저장하는 localStorage 키 */
const RETIRED_ENGINE_STORAGE_KEYS = ['fullAutoImageSource', 'globalImageSource', 'scAIImageEngine', 'scSubImageSource', 'localFolderFallbackEngine'];

// ═════════════════════════════════════════════════════════════════
// [2026-11-03] Leonardo AI / DeepInfra / Prodia 는 제품에서 빠졌다 (API 키 정리).
//   저장된 선택값이 조용히 다른 유료 엔진으로 바뀌면 안 된다. 값이 비면 읽는 쪽이 덕트테이프(유료)로
//   떨어지므로, 옛 값을 지우고 끝내지 않는다 — 어느 키에 무엇이 있었는지 보류 표식에 남기고, 기동 뒤
//   차단 안내(retiredImageEngineGate.ts)에서 사용자가 남은 엔진 중 하나를 직접 고를 때 비로소 저장한다.
//   고르기 전 이미지 생성은 assertNoRetiredImageEnginePending() 이 막는다.
// ═════════════════════════════════════════════════════════════════

/** 제품에서 빠진 이미지 엔진 값 → 화면 표시 이름 */
const RETIRED_IMAGE_ENGINE_LABELS: Readonly<Record<string, string>> = {
  leonardoai: 'Leonardo AI',
  deepinfra: 'DeepInfra',
  'deepinfra-flux': 'DeepInfra',
  'deepinfra-flux-2': 'DeepInfra',
  prodia: 'Prodia',
};

/** 보류 표식을 담는 localStorage 키 (사용자가 새 엔진을 고르면 지워진다) */
const RETIRED_ENGINE_PENDING_KEY = 'retiredImageEnginePending';

/** 사용자가 새로 고를 수 있는 엔진 (#image-source-select 에 남은 값과 같다) */
const RETIRED_ENGINE_CHOICES: readonly string[] = ['nano-banana-2', 'openai-image', 'flow', 'dropshot', 'genspark'];

/** 엔진을 고르면 함께 맞춰 저장하는 메인 키 */
const RETIRED_ENGINE_MAIN_KEYS: readonly string[] = ['fullAutoImageSource', 'globalImageSource', 'scAIImageEngine'];

/** 계정별 마지막 풀오토 설정(JSON). 안의 imageSource 에도 옛 엔진이 있을 수 있다. */
const RETIRED_ENGINE_SNAPSHOT_KEY = 'multiAccount.lastSettings';

type RetiredEngineStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 보류 표식: 저장 키 → 거기 있던 옛 엔진 값 */
export interface RetiredImageEnginePending {
  readonly keys: Readonly<Record<string, string>>;
}

function retiredEngineStore(storage?: RetiredEngineStore): RetiredEngineStore | undefined {
  return storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
}

/** 빠진 이미지 엔진 값이면 true */
export function isRetiredImageEngine(value: unknown): boolean {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RETIRED_IMAGE_ENGINE_LABELS, value.trim());
}

/** 빠진 엔진의 화면 표시 이름 (모르는 값이면 값을 그대로) */
export function retiredImageEngineLabel(value: string): string {
  return RETIRED_IMAGE_ENGINE_LABELS[value.trim()] ?? value;
}

/** 사용자가 새로 고를 수 있는 엔진 값 목록 */
export function retiredImageEngineChoices(): readonly string[] {
  return RETIRED_ENGINE_CHOICES;
}

/** 보류 표식을 읽는다. 없으면 null. */
export function readRetiredImageEnginePending(storage?: RetiredEngineStore): RetiredImageEnginePending | null {
  try {
    const raw = retiredEngineStore(storage)?.getItem(RETIRED_ENGINE_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RetiredImageEnginePending;
    return parsed && typeof parsed === 'object' && parsed.keys && typeof parsed.keys === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** 계정별 마지막 설정 JSON 에서 옛 엔진을 비우고, 비운 계정 수를 돌려준다. */
function parkRetiredSnapshotEngines(store: RetiredEngineStore, found: Record<string, string>): void {
  try {
    const raw = store.getItem(RETIRED_ENGINE_SNAPSHOT_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as Record<string, { imageSource?: unknown }>;
    let changed = false;
    for (const [accountId, snapshot] of Object.entries(all || {})) {
      if (snapshot && isRetiredImageEngine(snapshot.imageSource)) {
        found[`${RETIRED_ENGINE_SNAPSHOT_KEY}#${accountId}`] = String(snapshot.imageSource).trim();
        delete snapshot.imageSource;
        changed = true;
      }
    }
    if (changed) store.setItem(RETIRED_ENGINE_SNAPSHOT_KEY, JSON.stringify(all));
  } catch { /* 깨진 JSON 은 건드리지 않는다 */ }
}

/**
 * 저장소에 남은 빠진 엔진 값을 찾아 보류 표식으로 옮기고 원래 자리는 비운다. 멱등이라 기동 때와 게이트를
 * 띄우기 직전에 다시 불러도 안전하다 (낡은 큐가 옛 값을 다시 써 넣는 경우를 잡는다).
 * @returns 보류 중인 표식 (없으면 null)
 */
export function markRetiredImageEngines(storage?: RetiredEngineStore): RetiredImageEnginePending | null {
  const store = retiredEngineStore(storage);
  if (!store) return null;
  try {
    const found: Record<string, string> = {};
    for (const key of RETIRED_ENGINE_STORAGE_KEYS) {
      const saved = store.getItem(key);
      if (saved !== null && isRetiredImageEngine(saved)) {
        found[key] = saved.trim();
        store.removeItem(key);
      }
    }
    parkRetiredSnapshotEngines(store, found);
    const previous = readRetiredImageEnginePending(store);
    if (Object.keys(found).length === 0) return previous;
    const next: RetiredImageEnginePending = { keys: { ...(previous?.keys ?? {}), ...found } };
    store.setItem(RETIRED_ENGINE_PENDING_KEY, JSON.stringify(next));
    console.log(`[ImageMigration] 지원이 끝난 이미지 엔진 선택 ${Object.keys(found).length}곳을 보류했습니다 — 사용자가 직접 새 엔진을 고를 때까지 생성을 막습니다.`);
    return next;
  } catch (e) {
    console.warn('[ImageMigration] ⚠️ 지원 종료 엔진 보류 실패(무시):', (e as Error).message);
    return readRetiredImageEnginePending(store);
  }
}

/** 보류 표식에 적힌 옛 엔진의 화면 이름 목록 (중복 제거) */
export function pendingRetiredImageEngineLabels(pending: RetiredImageEnginePending): string[] {
  return Array.from(new Set(Object.values(pending.keys).map(retiredImageEngineLabel)));
}

/**
 * 사용자가 고른 엔진을 저장하고 보류 표식을 지운다. 고를 수 없는 값이면 아무것도 바꾸지 않고 false.
 * 메인 키 3개는 옛 값이 있던 곳과 비어 있던 곳만 새 엔진으로 채운다 — 사용자가 다른 키에 직접 고른 엔진은
 * 덮어쓰지 않는다(2026-11-03 검토). 폴더 부족분 엔진(localFolderFallbackEngine)은 옛 값이 있던 경우에만 바꾼다.
 */
export function resolveRetiredImageEngineChoice(choice: string, storage?: RetiredEngineStore): boolean {
  const store = retiredEngineStore(storage);
  if (!store || !RETIRED_ENGINE_CHOICES.includes(choice)) return false;
  const pending = readRetiredImageEnginePending(store);
  for (const key of RETIRED_ENGINE_MAIN_KEYS) {
    const parked = Boolean(pending && key in pending.keys);
    if (parked || store.getItem(key) === null) store.setItem(key, choice);
  }
  if (pending && 'localFolderFallbackEngine' in pending.keys) store.setItem('localFolderFallbackEngine', choice);
  store.removeItem(RETIRED_ENGINE_PENDING_KEY);
  return true;
}

/** 보류 중이면 이미지 생성을 시작하지 못하게 막는다 (자동으로 다른 유료 엔진을 쓰지 않는다). */
export function assertNoRetiredImageEnginePending(storage?: RetiredEngineStore): void {
  const pending = markRetiredImageEngines(storage);
  if (!pending) return;
  const names = pendingRetiredImageEngineLabels(pending).join(', ');
  throw new Error(`선택하셨던 ${names} 이미지 엔진은 지원이 끝났습니다. 이미지 엔진을 다시 골라 주세요.`);
}
