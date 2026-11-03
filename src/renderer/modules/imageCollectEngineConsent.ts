// src/renderer/modules/imageCollectEngineConsent.ts
// Copyright consent gate for the "관련 사진 찾기" image engine (value 'collect-photos').
// The agreement lives in the main config (imageCollectConsent) so unattended flows can read it in main;
// choosing the engine in a select shows the notice first and puts the previous choice back when it is declined.
// NOTE: inline bundle = single scope. Every top-level identifier is prefixed collectEngine* / COLLECT_ENGINE_*.
import { ensureIssueCopyrightConsent, hasIssueCopyrightConsent } from './issueCollectConsent.js';

export const COLLECT_ENGINE_VALUE = 'collect-photos';
/** Mirrors IMAGE_COLLECT_CONSENT_VERSION in runtime/collectPhotosPolicy (a test pins the two). */
const COLLECT_ENGINE_CONSENT_VERSION = 1;
const COLLECT_ENGINE_PASSED_FLAG = '__collectEngineConsentPassed';

export function collectEngineConsentRecorded(value: unknown): boolean {
  const record = value as { version?: unknown; agreedAt?: unknown } | null | undefined;
  return !!record && typeof record.version === 'number' && record.version >= COLLECT_ENGINE_CONSENT_VERSION
    && typeof record.agreedAt === 'string' && record.agreedAt.length > 0;
}

/**
 * True once the user has agreed (now or before). An agreement given to the issue collector earlier is the same
 * notice text, so it is carried into the config instead of asking twice. Declining returns false and saves nothing.
 */
export async function ensureCollectEngineConsent(): Promise<boolean> {
  const api = (window as any).api;
  let config: any = null;
  try { config = await api?.getConfig?.(); } catch { config = null; }
  if (collectEngineConsentRecorded(config?.imageCollectConsent)) return true;
  if (!(hasIssueCopyrightConsent() || await ensureIssueCopyrightConsent())) return false;
  try {
    await api?.saveConfig?.({ imageCollectConsent: { version: COLLECT_ENGINE_CONSENT_VERSION, agreedAt: new Date().toISOString() } });
  } catch (error) {
    console.warn('[CollectEngine] 동의 기록 저장 실패:', error);
    return false;
  }
  return true;
}

/**
 * Gate for every place that SAVES an engine pick (select change, the full-auto card modal's 확인 button): true when
 * the pick may be saved. Only 'collect-photos' needs the agreement; declining returns false so the caller keeps the
 * previous engine and saves nothing.
 */
export async function collectEngineAllowPick(engine: string): Promise<boolean> {
  return engine === COLLECT_ENGINE_VALUE ? ensureCollectEngineConsent() : true;
}

/** Holds the change event of an engine select until the user agrees; declining restores the previous value. */
export function collectEngineWireSelect(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select || select.dataset.collectEngineGate === '1') return;
  select.dataset.collectEngineGate = '1';
  let accepted = select.value;
  select.addEventListener('change', (event) => {
    if (select.value !== COLLECT_ENGINE_VALUE || (event as any)[COLLECT_ENGINE_PASSED_FLAG]) { accepted = select.value; return; }
    event.stopImmediatePropagation();
    void ensureCollectEngineConsent().then((agreed) => {
      if (!agreed) { select.value = accepted; return; }
      const again = new Event('change', { bubbles: true });
      (again as any)[COLLECT_ENGINE_PASSED_FLAG] = true;
      select.dispatchEvent(again);
    });
  }, true);
}
