/**
 * 사이트판 설계실 제목 엔진 사본 만들기(2026-10-06). 단일 출처는 앱 레포 src/utils/title-forge/varied.ts(+forge · frame-analysis ·
 * shopping-purchase-angle). 이 스크립트가 그것을 하나로 묶어 src/lib/titleForge.generated.mjs 로 쓴다 — 손으로 고치지 말 것.
 * 실행: node spa/scripts/build-title-forge.mjs  (앱 레포 경로는 LEWORD_APP_REPO, 기본 C:/Users/park/leword-app)
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.LEWORD_APP_REPO || 'C:/Users/park/leword-app';
const SOURCES = ['varied.ts', 'forge.ts', 'frame-analysis.ts', 'issue.ts'].map((f) => path.join(APP, 'src/utils/title-forge', f))
  .concat(path.join(APP, 'src/utils/shopping-purchase-angle.ts'));
const hash = createHash('sha256').update(SOURCES.map((f) => readFileSync(f, 'utf8').replace(/\r/g, '')).join('\n')).digest('hex').slice(0, 16);
const here = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [SOURCES[0]],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  outfile: path.join(here, '..', 'src', 'lib', 'titleForge.generated.mjs'),
  banner: { js: `// 자동 생성 — 앱 레포 src/utils/title-forge/varied.ts 묶음(원본 해시 ${hash}). 손으로 고치지 말고 spa/scripts/build-title-forge.mjs 를 다시 돌릴 것.` },
  logLevel: 'warning',
});
console.log('제목 엔진 사본 생성 · 원본 해시', hash);
