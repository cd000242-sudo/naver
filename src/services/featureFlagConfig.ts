/**
 * Feature flag runtime config — reads a JSON file under userData (or env var
 * in tests) to decide which W1~W4 features are enabled for the current run.
 *
 * Why a config file (not code constants):
 *   - Enables "수동 A/B 실험 없이" — user edits one JSON, restarts Electron.
 *   - Keeps the analytics cohort comparison meaningful (meta records the
 *     actual state, not a compile-time constant).
 *   - Forward-compatible: when a UI toggle is built later, it writes to the
 *     same file, readers remain identical.
 *
 * Default behavior: every flag defaults to TRUE. Disable by explicitly
 * setting to false in the config. This means newly shipped features are
 * active unless the user opts out — which matches the "95점 + 자가 진화"
 * direction.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FeatureFlag } from '../analytics/featureFlagTracker.js';

type ConfigShape = Partial<Record<FeatureFlag, boolean>>;

let cachedConfig: ConfigShape | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5000;

function getConfigPath(): string {
  const override = process.env.AUTOPUS_FEATURE_FLAG_CONFIG;
  if (override) return override;

  let basePath: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron');
    basePath = electron.app?.getPath?.('userData') ?? '';
  } catch {
    basePath = '';
  }
  if (!basePath) {
    const os = require('os') as typeof import('os');
    basePath = os.tmpdir();
  }
  return path.join(basePath, 'feature_flags.json');
}

function readConfig(): ConfigShape {
  const now = Date.now();
  if (cachedConfig !== null && now - cachedAt < CACHE_TTL_MS) return cachedConfig;

  const filePath = getConfigPath();
  let next: ConfigShape;
  if (!fs.existsSync(filePath)) {
    next = {};
  } else {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      next = typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (err) {
      console.error('[featureFlagConfig] read failed, using defaults:', err);
      next = {};
    }
  }
  cachedConfig = next;
  cachedAt = now;
  return next;
}

/**
 * Is the given feature enabled? Returns true when:
 *   - config file is absent (all features on by default)
 *   - config file exists but flag key is missing
 *   - config explicitly sets the flag to true
 * Returns false ONLY when config explicitly sets the flag to false.
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const config = readConfig();
  return config[flag] !== false;
}

/**
 * Get the full set of enabled flags — used by publishMetadataRecorder to
 * annotate each publish event.
 */
export function getEnabledFeatures(allFlags: FeatureFlag[]): FeatureFlag[] {
  return allFlags.filter((f) => isFeatureEnabled(f));
}

/** Test-only: clear cache so the next read picks up a new file. */
export function __resetCacheForTest(): void {
  cachedConfig = null;
  cachedAt = 0;
}
