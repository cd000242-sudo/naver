import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { resolvePublishFloorSec } from '../automation/publishIntervalPolicy';
import * as intervalPolicy from '../automation/publishIntervalPolicy';

// Execute the production functions without importing the renderer's window boot code.
const source = readFileSync('src/renderer/modules/continuousPublishing.ts', 'utf8');
const parsed = ts.createSourceFile('continuousPublishing.ts', source, ts.ScriptTarget.Latest, true);
function runtime() {
  const names = ['getImageAwareSafePublishFloorSec', 'normalizeSafePublishInterval',
    'getSafePublishInterval', 'scheduleNextPosting'];
  const code = parsed.statements.filter(s => ts.isFunctionDeclaration(s)
    && names.includes(s.name?.text || '')).map(s => s.getText(parsed).replace(/^export /, '')).join('\n');
  const context = {
    resolvePublishFloorSec, _configuredMinIntervalMinutes: 60,
    getCurrentPublishModeForInterval: () => 'publish',
    getCurrentContinuousImageSourceForSafety: () => 'skip',
    UI_AUTOMATION_IMAGE_SOURCES: new Set(), SLOW_IMAGE_SOURCES: new Set(),
    UI_AUTOMATION_SAFE_PUBLISH_MIN_INTERVAL_SEC: 480,
    IMAGE_HEAVY_SAFE_PUBLISH_MIN_INTERVAL_SEC: 420, SAFE_PUBLISH_MIN_INTERVAL_SEC: 300,
    SAFE_THRESHOLD_SEC: 600, MODERATE_THRESHOLD_SEC: 420,
    COOLDOWN_EVERY_N: 3, COOLDOWN_MIN_SEC: 420, COOLDOWN_MAX_SEC: 720,
    LATE_NIGHT_MULTIPLIER: 1.5, DAILY_POST_LIMIT: 20, DAILY_LIMIT_COOLDOWN_SEC: 1800,
    _lastDailyReset: Date.now(), _dailyPublishCount: 0, _continuousPublishCount: 0,
    isContinuousMode: true, continuousCountdown: 0, continuousInterval: null,
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    document: { getElementById: (id: string) => id === 'continuous-interval-value'
      ? { value: '2' } : id === 'continuous-interval-unit' ? { value: '3600' } : null },
    console: { log() {} }, appendLog() {}, setInterval: () => 1, clearInterval() {},
  };
  const result = runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText + '\n({ normalizeSafePublishInterval, getSafePublishInterval, scheduleNextPosting })', context);
  return { ...result, context };
}

describe('continuous publish interval respects the selected value', () => {
  it.each([600, 1800, 5400, 7200])('keeps %i seconds at queue save and execution', seconds => {
    const app = runtime();
    const stored = app.normalizeSafePublishInterval(seconds);
    expect(stored).toBe(seconds);
    expect(app.getSafePublishInterval(stored, 1).interval).toBe(seconds);
  });

  it('does not cap a two-hour countdown at one hour', () => {
    const app = runtime();
    app.context._configuredMinIntervalMinutes = 5;
    app.scheduleNextPosting();
    expect(app.context.continuousCountdown).toBe(7200);
  });

  it.each([600, 1800, 5400, 7200, 5415])('round-trips %i seconds through edit controls', seconds => {
    const fields = intervalPolicy.publishIntervalToFields(seconds);
    expect(fields.value * fields.unit).toBe(seconds);
  });

  it.each([undefined, 0, NaN])('preserves invalid queue input %s until the policy handles it', value => {
    const declarations = [...source.matchAll(/const rawInterval = ([^;]+);/g)];
    expect(declarations).toHaveLength(2);
    for (const [, expression] of declarations) {
      const input = runInNewContext(expression, { item: { interval: value }, SAFE_PUBLISH_MIN_INTERVAL_SEC: 300 });
      expect(runtime().getSafePublishInterval(input, 1).interval).toBe(3600);
    }
  });

  it('shows a 90-minute interval without truncating it to one hour', () => {
    expect(intervalPolicy.formatContinuousIntervalLabel(5400)).toBe('90분');
  });

  it.each([undefined, 60, 120])('explicit selection wins over the %s-minute fallback', configured => {
    for (const seconds of [600, 1800, 7200]) {
      expect(resolvePublishFloorSec(300, configured, 'publish', seconds)).toBe(300);
    }
  });

  it.each([undefined, NaN, 0, -1, Infinity])('uses configured fallback for invalid %s', value => {
    const app = runtime();
    expect(app.normalizeSafePublishInterval(value)).toBe(3600);
    expect(app.getSafePublishInterval(value, 1).interval).toBe(3600);
  });

  it('keeps image floors and the 24-hour maximum', () => {
    const app = runtime();
    expect(app.normalizeSafePublishInterval(60)).toBe(300);
    expect(app.normalizeSafePublishInterval(999999)).toBe(86400);
    app.context.SLOW_IMAGE_SOURCES.add('skip');
    expect(app.normalizeSafePublishInterval(300)).toBe(420);
    app.context.UI_AUTOMATION_IMAGE_SOURCES.add('skip');
    expect(app.normalizeSafePublishInterval(300)).toBe(480);
  });
});
