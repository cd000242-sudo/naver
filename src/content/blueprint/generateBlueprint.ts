/**
 * SPEC-BLUEPRINT-2026 — run the 설계도 call through an injected completer (the caller passes the
 * user's selected engine route). Never throws: a failure returns null and the body generation
 * continues on the plain material path with the same engine. The step is skipped, not swapped.
 */
import { buildBlueprintPrompt, type BlueprintPromptInput } from './buildBlueprintPrompt';
import { parseBlueprint, type ParsedBlueprint } from './parseBlueprint';

export const BLUEPRINT_TIMEOUT_MS = 20_000;

export interface BlueprintDeps {
  readonly complete: (prompt: string) => Promise<string>;
  readonly log?: (message: string) => void;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

export interface BlueprintRun {
  readonly result: ParsedBlueprint | null;
  readonly reason: 'ok' | 'timeout' | 'error' | 'unparsable' | 'empty-material';
  readonly elapsedMs: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('BLUEPRINT_TIMEOUT')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function generateBlueprint(input: BlueprintPromptInput, deps: BlueprintDeps): Promise<BlueprintRun> {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => undefined);
  const started = now();
  const material = String(input.material || '');
  if (material.trim().length < 200) {
    return { result: null, reason: 'empty-material', elapsedMs: 0 };
  }
  try {
    const raw = await withTimeout(deps.complete(buildBlueprintPrompt(input)), deps.timeoutMs ?? BLUEPRINT_TIMEOUT_MS);
    const parsed = parseBlueprint(raw, material);
    const elapsedMs = now() - started;
    if (!parsed) {
      log(`[Blueprint] ⚠️ 응답을 설계도로 읽을 수 없어 생략 (${elapsedMs}ms)`);
      return { result: null, reason: 'unparsable', elapsedMs };
    }
    const b = parsed.blueprint;
    log(`[Blueprint] ✅ 인용 ${b.quotes.length}·사실 ${b.facts.length}·소제목 ${b.skeleton.length}·제외 ${b.offTopic.length}`
      + ` (버림: 인용 ${parsed.dropped.quotes}·사실 ${parsed.dropped.facts}) · ${elapsedMs}ms`);
    return { result: parsed, reason: 'ok', elapsedMs };
  } catch (error) {
    const elapsedMs = now() - started;
    const timeout = (error as Error)?.message === 'BLUEPRINT_TIMEOUT';
    log(`[Blueprint] ⚠️ ${timeout ? `타임아웃 ${Math.round((deps.timeoutMs ?? BLUEPRINT_TIMEOUT_MS) / 1000)}초` : `호출 실패: ${(error as Error)?.message || error}`} — 설계도 없이 기존 경로로 진행`);
    return { result: null, reason: timeout ? 'timeout' : 'error', elapsedMs };
  }
}
