/**
 * SPEC-CONVERSION-001 L2-1.7 — Chain prompt loader
 *
 * 5단계 체인드 파이프라인의 stage 프롬프트 파일을 로드하고 변수 치환을 수행한다.
 *
 * 위치 해상도(우선순위):
 *   1. process.resourcesPath/prompts/affiliate/chain/   (Electron packaged)
 *   2. <projectRoot>/src/prompts/affiliate/chain/        (dev)
 *   3. <projectRoot>/dist/prompts/affiliate/chain/       (built but unpackaged)
 *
 * promptLoader.ts와 분리한 이유:
 *   - electron `app` API에 의존하지 않아 vitest 단위 테스트에서 직접 호출 가능
 *   - 체인 stage는 변수 치환 패턴이 다름 (TONE_STYLE 단일 → 다중 변수)
 *
 * 메모리 [silent 폴백 금지]: 파일 로드 실패 시 명시 throw — 호출자가 결정.
 */

import * as fs from 'fs';
import * as path from 'path';

export type ChainStage =
  | 'stage1_classify'
  | 'stage2_persona'
  | 'stage3_draft'
  | 'stage4_factgate'
  | 'stage5_optimize'
  | 'editor'
  | 'faq';

const CHAIN_DIR_SEGMENTS = ['prompts', 'affiliate', 'chain'];
const promptCache = new Map<ChainStage, string>();

let cachedDir: string | undefined;

export function resolveChainPromptsDir(): string {
  if (cachedDir && fs.existsSync(cachedDir)) return cachedDir;

  const candidates: string[] = [];

  if (typeof process !== 'undefined' && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, ...CHAIN_DIR_SEGMENTS));
  }

  candidates.push(
    path.resolve(__dirname, '..', ...CHAIN_DIR_SEGMENTS),
    path.resolve(__dirname, '..', '..', 'src', ...CHAIN_DIR_SEGMENTS),
    path.resolve(process.cwd(), 'src', ...CHAIN_DIR_SEGMENTS),
    path.resolve(process.cwd(), 'dist', ...CHAIN_DIR_SEGMENTS),
  );

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      cachedDir = c;
      return c;
    }
  }
  throw new Error(
    `CHAIN_PROMPTS_DIR_NOT_FOUND: 체인 프롬프트 디렉토리를 찾지 못했습니다. 후보: ${candidates.join(' | ')}`,
  );
}

export function loadChainPromptRaw(stage: ChainStage): string {
  if (promptCache.has(stage)) return promptCache.get(stage)!;
  const dir = resolveChainPromptsDir();
  const file = path.join(dir, `${stage}.prompt`);
  if (!fs.existsSync(file)) {
    throw new Error(`CHAIN_PROMPT_NOT_FOUND: ${stage}.prompt 파일이 ${dir}에 없습니다.`);
  }
  const raw = fs.readFileSync(file, 'utf-8');
  promptCache.set(stage, raw);
  return raw;
}

export interface RenderOptions {
  readonly allowMissing?: boolean;
}

/**
 * 변수 치환만 수행 ({{VAR}} → vars[VAR]).
 * vars[VAR]가 undefined이고 allowMissing=false(기본)면 throw.
 */
export function renderTemplate(
  template: string,
  vars: Readonly<Record<string, string>>,
  opts?: RenderOptions,
): string {
  const allowMissing = opts?.allowMissing === true;
  const tokens = template.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [];
  const missing: string[] = [];
  let out = template;
  for (const tok of tokens) {
    const key = tok.slice(2, -2);
    const val = vars[key];
    if (val === undefined) {
      if (!allowMissing) missing.push(key);
      continue;
    }
    out = out.split(tok).join(val);
  }
  if (!allowMissing && missing.length > 0) {
    throw new Error(`CHAIN_PROMPT_MISSING_VARS: ${[...new Set(missing)].join(', ')}`);
  }
  return out;
}

export function loadChainPrompt(
  stage: ChainStage,
  vars: Readonly<Record<string, string>>,
  opts?: RenderOptions,
): string {
  const raw = loadChainPromptRaw(stage);
  return renderTemplate(raw, vars, opts);
}

export function clearChainPromptCache(): void {
  promptCache.clear();
  cachedDir = undefined;
}
