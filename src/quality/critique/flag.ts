// [2026-09-22 Critique Loop] Feature flag. Default OFF: the P1 generation path and its
// results stay byte-identical unless the user config sets `naverQualityLoop: true` or the
// process runs with NAVER_QUALITY_LOOP=1. `NAVER_QUALITY_LOOP=0` always wins (kill switch).

export interface QualityLoopFlagSource {
  readonly naverQualityLoop?: unknown;
}

export function isQualityLoopEnabled(
  config: QualityLoopFlagSource | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envValue = String(env.NAVER_QUALITY_LOOP ?? '').trim().toLowerCase();
  if (envValue === '0' || envValue === 'false' || envValue === 'off') return false;
  if (envValue === '1' || envValue === 'true' || envValue === 'on') return true;
  return config?.naverQualityLoop === true;
}
