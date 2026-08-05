import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';

/**
 * [2026-08-05] 렌더러 번들이 "호출은 있는데 정의가 없는" 심볼을 갖지 않는지 검사.
 *
 * copy-static.mjs는 dist 모듈을 **단일 스코프로 concat**한다. import 문은 제거되고
 * 등록된 파일만 인라인된다. 그래서 renderer 모듈이 미등록 공유 모듈을 import하면
 * tsc·eslint·build가 전부 통과하는데 **런타임에서만** ReferenceError가 난다.
 *
 * 실제 사례: src/shared/categoryTaxonomy.ts를 만들어 contentGeneration.ts에서
 * import했더니 번들에 호출 2회 / 정의 0회로 들어갔다. copy-static.mjs의
 * rendererRuntimeDependencyFiles에 등록하고서야 정의가 실렸다.
 *
 * 번들이 없으면(테스트만 돌린 경우) 건너뛴다 — 빌드를 강제하지 않는다.
 */

const BUNDLE = new URL('../../dist/public/renderer.js', import.meta.url);

/** 이 심볼들은 공유 모듈에서 와야 하며, 번들에 정의가 실려 있어야 한다. */
const REQUIRED_SHARED_SYMBOLS: ReadonlyArray<{ readonly name: string; readonly source: string }> = [
  { name: 'resolveArticleTypeHint', source: 'src/shared/categoryTaxonomy.ts' },
  { name: 'ARTICLE_TYPE_TO_HINT', source: 'src/shared/categoryTaxonomy.ts' },
];

describe('렌더러 번들 — 호출하는 심볼의 정의가 실려 있다', () => {
  const bundleExists = existsSync(BUNDLE);
  const bundle = bundleExists ? readFileSync(BUNDLE, 'utf8') : '';

  it.each(REQUIRED_SHARED_SYMBOLS)('$name 정의가 번들에 있다 ($source)', ({ name, source }) => {
    if (!bundleExists) return; // 빌드 전이면 검사 생략

    const used = bundle.includes(name);
    if (!used) return; // 호출조차 없으면 검사 대상이 아니다

    // 번들은 minify되므로 `const X=` / `function X(` / `,X={` 형태를 모두 인정한다.
    const defined = new RegExp(
      `(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=|[,;{]\\s*${name}\\s*=\\s*[{[])`,
    ).test(bundle);

    expect(
      defined,
      `${name} 을(를) 호출하는데 정의가 번들에 없습니다. `
      + `${source} 를 scripts/copy-static.mjs 의 rendererRuntimeDependencyFiles 에 등록하세요. `
      + '이 결함은 tsc/eslint/build 를 통과하고 런타임에서만 터집니다.',
    ).toBe(true);
  });

  it('copy-static.mjs에 공유 모듈이 등록돼 있다', () => {
    const script = readFileSync(new URL('../../scripts/copy-static.mjs', import.meta.url), 'utf8');
    expect(script).toMatch(/shared['/\\]+categoryTaxonomy\.js/);
  });
});
