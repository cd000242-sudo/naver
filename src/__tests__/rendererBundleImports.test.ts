// 렌더러가 modules/ 밖에서 값을 가져오면 번들에 등록해야 한다.
//
// 왜: copy-static 은 렌더러 모듈을 한 스코프로 concat 하면서 import/require 문을 걷어낸다.
// 등록되지 않은 모듈에서 **값**(상수·함수)을 가져오면 번들에 실체가 없어 런타임에
// ReferenceError 가 난다. 타입만 가져오는 경우는 컴파일 시 사라지므로 무관하다.
//
// 실측(2026-08-19): continuousPublishing 이 automation/publishIntervalPolicy 에서
// DEFAULT_MIN_PUBLISH_INTERVAL_MINUTES 를 가져왔는데 등록을 빠뜨려
// "Uncaught ReferenceError: DEFAULT_MIN_PUBLISH_INTERVAL_MINUTES is not defined" 로
// 연속발행이 깨졌다. tsc·lint·유닛테스트는 전부 통과했고 self-test 만 잡아냈다.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const COPY_STATIC = readFileSync(join(ROOT, 'scripts', 'copy-static.mjs'), 'utf-8');

/** `import ... from '../../<path>.js'` 중 타입 전용이 아닌 것만 모은다. */
function valueImportsOutsideRenderer(source: string): string[] {
  const found = new Set<string>();
  const pattern = /import\s+(type\s+)?([\s\S]*?)\s+from\s+'\.\.\/\.\.\/([A-Za-z0-9/_-]+)\.js'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const isTypeOnlyKeyword = Boolean(match[1]);
    const clause = match[2];
    if (isTypeOnlyKeyword) continue;
    // `import { type A, type B }` 처럼 전부 타입이면 런타임 값이 없다.
    const names = clause.replace(/[{}]/g, '').split(',').map((n) => n.trim()).filter(Boolean);
    if (names.length > 0 && names.every((n) => n.startsWith('type '))) continue;
    found.add(match[3]);
  }
  return [...found];
}

function collectRendererSources(): Array<{ rel: string; source: string }> {
  const out: Array<{ rel: string; source: string }> = [];
  for (const dir of ['modules', 'utils']) {
    const abs = join(ROOT, 'src', 'renderer', dir);
    for (const entry of readdirSync(abs)) {
      if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
      out.push({ rel: `${dir}/${entry}`, source: readFileSync(join(abs, entry), 'utf-8') });
    }
  }
  return out;
}

/** copy-static 이 그 모듈을 번들에 넣는가 (런타임 의존성 목록 또는 인라인 모듈 목록). */
function isRegisteredInBundle(modulePath: string): boolean {
  const basename = `${modulePath.split('/').pop()}.js`;
  return COPY_STATIC.includes(`'${modulePath}.js'`)
    || COPY_STATIC.includes(`label: '${modulePath}.js'`)
    || COPY_STATIC.includes(`'${basename}'`);
}

describe('렌더러 번들 — 값을 가져오면 등록해야 한다', () => {
  const sources = collectRendererSources();

  it('렌더러 소스를 실제로 읽었다', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  /**
   * 이미 있던 미등록 import. 아직 터지지 않은 이유는 그 코드 경로가 시작 시점에
   * 실행되지 않아서일 뿐, 같은 종류의 잠재 결함이다(2026-08-19 조사).
   * 하나씩 줄이는 것이 목표이고, **늘어나는 것만은 여기서 막는다**.
   */
  const KNOWN_UNREGISTERED = [
    'modules/contentGeneration.ts → runtime/modelRegistry.js',
    'modules/imageNarrativeQuickMode.ts → imageNarrative/types.js',
    'modules/imageNarrativeQuickMode.ts → runtime/modelRegistry.js',
    'modules/licenseUI.ts → freeTrialPolicy.js',
    'modules/priceInfoModal.ts → runtime/modelRegistry.js',
    'modules/scheduleManager.ts → scheduler/scheduledPostLookupPolicy.js',
    'utils/settingsModal.ts → security/secretValueUtils.js',
    'utils/settingsModal.ts → runtime/modelRegistry.js',
  ];

  function findOffenders(): string[] {
    const offenders: string[] = [];
    for (const { rel, source } of sources) {
      for (const imported of valueImportsOutsideRenderer(source)) {
        if (!isRegisteredInBundle(imported)) offenders.push(`${rel} → ${imported}.js`);
      }
    }
    return offenders;
  }

  it('새로 미등록 import 를 추가하지 않았다', () => {
    // 여기 걸리면 copy-static 의 rendererRuntimeDependencyFiles 에 추가해야 한다.
    // 안 하면 tsc·lint·유닛테스트는 전부 통과하고 런타임에만 ReferenceError 로 터진다.
    const added = findOffenders().filter((o) => !KNOWN_UNREGISTERED.includes(o));
    expect(added).toEqual([]);
  });

  it('알려진 목록이 늘어나지 않았다', () => {
    expect(findOffenders().length).toBeLessThanOrEqual(KNOWN_UNREGISTERED.length);
  });

  it('이번에 터졌던 그 모듈이 등록돼 있다', () => {
    expect(isRegisteredInBundle('automation/publishIntervalPolicy')).toBe(true);
  });
});

describe('셀프테스트 판정이 종료 코드로 전달된다', () => {
  it('강제 종료가 하드코딩 0 을 쓰지 않는다', () => {
    const main = readFileSync(join(ROOT, 'src', 'main.ts'), 'utf-8');
    expect(main).toContain('getSelfTestExitCode()');
    // 하드코딩 process.exit(0) 이 판정을 덮어쓰면 FAIL 이 게이트를 통과한다.
    expect(main).not.toMatch(/Forcing process exit\.\.\.'\);\s*\n\s*process\.exit\(0\);/);
  });

  it('셀프테스트가 판정을 밖으로 남긴다', () => {
    const selfTest = readFileSync(join(ROOT, 'src', 'main', 'selfTest.ts'), 'utf-8');
    expect(selfTest).toContain('export function getSelfTestExitCode()');
    expect(selfTest).toContain('selfTestExitCode = exitCode;');
  });
});
