import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-03 사장님 화면] ReferenceError: paragraphGroupSizes is not defined (renderer.js).
 * 렌더러 인라인 번들은 CommonJS require 를 지우고 파일들을 한 스코프에 이어 붙인다. 번들 밖 파일을 import 하면
 * tsc·빌드는 통과하지만 런타임에 식별자가 없다(기록의 함정 — 오늘 richTextPaste → content/sentenceParagraphs).
 * 번들에 들어가는 모든 소스의 "렌더러 밖 import" 는 copy-static.mjs 에 라벨로 등록돼 있어야 한다. 여기서 잠근다.
 */
const ROOT = resolve(__dirname, '..');
const SRC = ROOT;
const copyStatic = readFileSync(resolve(ROOT, '..', 'scripts', 'copy-static.mjs'), 'utf-8').replace(/\r/g, '');
const registered = new Set([...copyStatic.matchAll(/label:\s*'([^']+\.js)'/g)].map((m) => m[1]));
const bundledModuleNames = new Set([...copyStatic.matchAll(/^\s*'([A-Za-z0-9_]+\.js)',/gm)].map((m) => m[1]));

function listTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).map((f) => join(dir, f));
}

function outsideImports(file: string): string[] {
  const src = readFileSync(file, 'utf-8').replace(/\r/g, '');
  const out: string[] = [];
  const re = /^(?:import|export)\s+(?!type\s)[^'";]*?from\s+'(\.{1,2}\/[^']+)'/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const spec = m[1];
    const resolved = resolve(dirname(file), spec).replace(/\.js$/, '');
    const relToSrc = relative(SRC, resolved).replace(/\\/g, '/');
    if (relToSrc.startsWith('renderer/')) continue;
    out.push(`${relToSrc}.js`);
  }
  return out;
}

describe('렌더러 번들에 들어가는 소스의 밖 import 는 copy-static 에 등록돼 있다', () => {
  const rendererFiles = [
    ...listTs(resolve(SRC, 'renderer', 'modules')).filter((f) => bundledModuleNames.has(f.split(/[\\/]/).pop()!.replace(/\.ts$/, '.js'))),
    ...listTs(resolve(SRC, 'renderer', 'components')),
  ];
  const dependencyFiles = [...registered].map((label) => resolve(SRC, label.replace(/\.js$/, '.ts'))).filter((f) => existsSync(f));

  it('오늘의 사고 — richTextPaste 가 쓰는 content/sentenceParagraphs 가 등록돼 있다', () => {
    expect(registered.has('content/sentenceParagraphs.js')).toBe(true);
  });

  it('번들 소스 전체 — 등록 안 된 밖 import 가 없다 (있으면 런타임 ReferenceError)', () => {
    const missing: string[] = [];
    for (const file of [...rendererFiles, ...dependencyFiles]) {
      for (const label of outsideImports(file)) {
        // runtime/<name>.js 는 copy-static 의 runtimeModules 로 먼저 인라인된다(geminiTextModelNormalization 등) — 등록된 것으로 본다
        const inlinedRuntime = label.startsWith('runtime/') && bundledModuleNames.has(label.slice('runtime/'.length));
        if (!registered.has(label) && !inlinedRuntime) missing.push(`${relative(SRC, file).replace(/\\/g, '/')} → ${label}`);
      }
    }
    expect(missing, missing.join('\n')).toEqual([]);
  });

  // [2026-09-03 TDZ] prepend 는 나중에 붙일수록 번들 앞으로 간다. runtime 모듈(import 0)이 의존 파일보다 앞에 오려면
  //   utils 블록을 먼저, runtime 블록을 나중에 붙여야 한다. 반대면 modelRegistry 상위 const 가 GEMINI_TEXT_MODELS 를 선언 전에 읽는다.
  it('prepends runtime modules after utils so they land at the very top of the bundle', () => {
    const utilsAt = copyStatic.indexOf('if (utilsSource) {');
    const runtimeAt = copyStatic.indexOf('if (runtimeSource) {');
    expect(utilsAt).toBeGreaterThan(0);
    expect(runtimeAt).toBeGreaterThan(utilsAt);
  });
});
