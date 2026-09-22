// Persistent per-generation snapshot store — lets a debug user trace one
// article's generation end-to-end on disk (search input -> prompt -> model
// output -> post-process history -> published payload).
//
// Usage:
//   const run = createGenerationRun({ keyword, mode });
//   setActiveGenerationRun(run);
//   run.writeSearchRaw(rawSearchResults);
//   run.writeResearchInput(researchText);
//   run.writeFinalPrompt({ system, user });
//   run.writeModelOutput(output, { stage: 'draft', provider, model });
//   run.appendPostProcess({ stepName: 'trim', beforeChars, afterChars, deletedChars, at: ... });
//   run.writeFinalBeforePublish(finalText);
//   run.writePublishedPayload(payload);
//   run.finish({ publishDecision: 'AUTO_PUBLISH' });
//   setActiveGenerationRun(null);
//
// Every write is best-effort: failures never throw into the generation path,
// and only warn once per run per failure reason.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { GenerationRunMeta, PostProcessStepRecord } from './generationRunTypes';

export type { GenerationRunMeta, PostProcessStepRecord };

const FILE_META = 'meta.json';
const FILE_SEARCH_RAW = 'A-search-raw.json';
const FILE_RESEARCH_INPUT_TXT = 'B-research-input.txt';
const FILE_RESEARCH_INPUT_JSON = 'B-research-input.json';
const FILE_FINAL_PROMPT = 'C-final-prompt.txt';
const FILE_MODEL_OUTPUT = 'D-model-output.txt';
const FILE_POSTPROCESS_HISTORY = 'E-postprocess-history.json';
const FILE_FINAL_BEFORE_PUBLISH = 'F-final-before-publish.txt';
const FILE_PUBLISHED_PAYLOAD = 'G-published-payload.json';

function randomBase36(len: number): string {
  let out = '';
  while (out.length < len) out += Math.random().toString(36).slice(2);
  return out.slice(0, len);
}

/** 'YYYYMMDD-HHmmss-xxxxxx' (6 random base36 chars), local time. */
export function generateRunId(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const mo = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `${y}${mo}${d}-${h}${mi}${s}-${randomBase36(6)}`;
}

/** Resolve the root directory for generation run snapshots. */
export function resolveGenerationRunsRoot(): string {
  if (process.env.GENERATION_RUNS_DIR) return process.env.GENERATION_RUNS_DIR;
  try {
    // Lazy require — this module may run outside the Electron main process.
    const { app } = require('electron') as typeof import('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'generation-runs');
    }
  } catch {
    /* electron unavailable (test/CLI context) — fall through */
  }
  return path.join(os.tmpdir(), 'bln-generation-runs');
}

interface SecretPattern { re: RegExp; mask: string }

// Order matters: more specific prefixes (sk-ant-) must run before their
// generic prefix (sk-) so the specific mask wins.
const SECRET_PATTERNS: SecretPattern[] = [
  { re: /sk-ant-[A-Za-z0-9_-]{16,}/g, mask: 'sk-ant-***' },
  { re: /sk-[A-Za-z0-9_-]{16,}/g, mask: 'sk-***' },
  { re: /AIza[0-9A-Za-z_-]{30,}/g, mask: 'AIza***' },
  { re: /pplx-[A-Za-z0-9]{16,}/g, mask: 'pplx-***' },
  { re: /Bearer\s+[A-Za-z0-9._-]{8,}/gi, mask: 'Bearer ***' },
  { re: /(x-naver-client-secret["']?\s*[:=]\s*["']?)([^\s,"'}]+)/gi, mask: '$1***' },
];

/** Mask API keys/tokens found in text. Leaves normal text untouched. */
export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  for (const { re, mask } of SECRET_PATTERNS) {
    out = out.replace(re, mask);
  }
  return out;
}

export class GenerationRun {
  readonly runId: string;
  readonly dir: string;
  meta: GenerationRunMeta;

  private warnedReasons = new Set<string>();
  private modelOutputWrites = 0;
  private postProcessHistory: PostProcessStepRecord[] = [];

  constructor(init: Partial<GenerationRunMeta> & { keyword: string; mode: string }, root?: string) {
    this.runId = init.runId || generateRunId();
    this.dir = path.join(root || resolveGenerationRunsRoot(), this.runId);
    this.meta = {
      runId: this.runId,
      keyword: init.keyword,
      mode: init.mode,
      selectedProvider: init.selectedProvider ?? '',
      selectedModel: init.selectedModel ?? '',
      actualModelsUsed: init.actualModelsUsed ? [...init.actualModelsUsed] : [],
      startedAt: init.startedAt ?? new Date().toISOString(),
      finishedAt: init.finishedAt,
      sourceCounts: init.sourceCounts ?? {},
      searchFailures: init.searchFailures ?? [],
      searchStatus: init.searchStatus,
      groundingRequested: init.groundingRequested ?? false,
      groundingActuallyUsed: init.groundingActuallyUsed ?? false,
      inputChars: init.inputChars ?? 0,
      sourceChars: init.sourceChars ?? 0,
      instructionChars: init.instructionChars ?? 0,
      outputChars: init.outputChars ?? 0,
      sourceRetention: init.sourceRetention,
      postProcessSteps: init.postProcessSteps ?? 0,
      outputTruncated: init.outputTruncated,
      jsonComplete: init.jsonComplete,
      publishDecision: init.publishDecision,
      integrity: init.integrity,
      extra: init.extra,
    };
    this.persistMeta();
  }

  private warnOnce(reason: string, err: unknown): void {
    if (this.warnedReasons.has(reason)) return;
    this.warnedReasons.add(reason);
    console.warn(`[GenerationRun:${this.runId}] ${reason} failed:`, (err as Error)?.message ?? err);
  }

  private ensureDir(): boolean {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      return true;
    } catch (err) {
      this.warnOnce('mkdir', err);
      return false;
    }
  }

  private writeFileBestEffort(filename: string, content: string): void {
    if (!this.ensureDir()) return;
    try {
      fs.writeFileSync(path.join(this.dir, filename), content, 'utf-8');
    } catch (err) {
      this.warnOnce(`write:${filename}`, err);
    }
  }

  private stringifySafe(payload: unknown): string {
    try {
      return JSON.stringify(payload, null, 2) ?? 'null';
    } catch (err) {
      this.warnOnce('stringify', err);
      return String(payload);
    }
  }

  private persistMeta(): void {
    this.writeFileBestEffort(FILE_META, this.stringifySafe(this.meta));
  }

  writeSearchRaw(payload: unknown): void {
    this.writeFileBestEffort(FILE_SEARCH_RAW, redactSecrets(this.stringifySafe(payload)));
  }

  writeResearchInput(text: string | object): void {
    if (typeof text === 'string') {
      this.writeFileBestEffort(FILE_RESEARCH_INPUT_TXT, redactSecrets(text));
    } else {
      this.writeFileBestEffort(FILE_RESEARCH_INPUT_JSON, redactSecrets(this.stringifySafe(text)));
    }
  }

  writeFinalPrompt(parts: { system?: string; user?: string; full?: string }): void {
    let content: string;
    if (parts.full !== undefined) {
      content = parts.full;
    } else if (parts.system !== undefined && parts.user !== undefined) {
      content = `${parts.system}\n\n===== USER =====\n\n${parts.user}`;
    } else {
      content = parts.system ?? parts.user ?? '';
    }
    this.writeFileBestEffort(FILE_FINAL_PROMPT, redactSecrets(content));
  }

  writeModelOutput(
    text: string,
    info?: { stage?: string; provider?: string; model?: string; finishReason?: string },
  ): void {
    this.modelOutputWrites += 1;
    const stage = info?.stage ?? 'unknown';
    const redacted = redactSecrets(text);
    if (this.modelOutputWrites === 1) {
      this.writeFileBestEffort(FILE_MODEL_OUTPUT, redacted);
    } else if (this.ensureDir()) {
      try {
        const header = `\n\n===== ${stage} attempt ${this.modelOutputWrites} =====\n`;
        fs.appendFileSync(path.join(this.dir, FILE_MODEL_OUTPUT), header + redacted, 'utf-8');
      } catch (err) {
        this.warnOnce(`append:${FILE_MODEL_OUTPUT}`, err);
      }
    }
    if (info?.provider && info?.model) {
      this.recordModel(stage, info.provider, info.model);
    }
  }

  appendPostProcess(step: Omit<PostProcessStepRecord, 'at'>): void {
    const record: PostProcessStepRecord = { ...step, at: new Date().toISOString() };
    this.postProcessHistory = [...this.postProcessHistory, record];
    this.writeFileBestEffort(FILE_POSTPROCESS_HISTORY, this.stringifySafe(this.postProcessHistory));
    this.meta = { ...this.meta, postProcessSteps: this.postProcessHistory.length };
    this.persistMeta();
  }

  writeFinalBeforePublish(text: string): void {
    this.writeFileBestEffort(FILE_FINAL_BEFORE_PUBLISH, redactSecrets(text));
  }

  writePublishedPayload(payload: unknown): void {
    this.writeFileBestEffort(FILE_PUBLISHED_PAYLOAD, redactSecrets(this.stringifySafe(payload)));
  }

  recordModel(stage: string, provider: string, model: string): void {
    const exists = this.meta.actualModelsUsed.some(
      (m) => m.stage === stage && m.provider === provider && m.model === model,
    );
    if (!exists) {
      this.meta = { ...this.meta, actualModelsUsed: [...this.meta.actualModelsUsed, { stage, provider, model }] };
      this.persistMeta();
    }
  }

  updateMeta(patch: Partial<GenerationRunMeta>): void {
    this.meta = { ...this.meta, ...patch };
    this.persistMeta();
  }

  finish(patch?: Partial<GenerationRunMeta>): void {
    this.meta = { ...this.meta, ...patch, finishedAt: new Date().toISOString() };
    this.persistMeta();
  }
}

export function createGenerationRun(
  init: Partial<GenerationRunMeta> & { keyword: string; mode: string },
): GenerationRun {
  return new GenerationRun(init);
}

let activeRun: GenerationRun | null = null;

/** Set the module-level current run (text generation is serialized in this app). */
export function setActiveGenerationRun(run: GenerationRun | null): void {
  activeRun = run;
}

export function getActiveGenerationRun(): GenerationRun | null {
  return activeRun;
}

/** Runs `fn` against the active run, or no-ops (returns undefined) when there is none. */
export function withActiveRun<T>(fn: (run: GenerationRun) => T): T | undefined {
  if (!activeRun) return undefined;
  return fn(activeRun);
}

/** Delete the oldest run directories under `root` beyond `keep` (sorted by name). */
export function pruneGenerationRuns(root: string, keep = 200): void {
  try {
    if (!fs.existsSync(root)) return;
    const entries = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    if (entries.length <= keep) return;
    const toRemove = entries.slice(0, entries.length - keep);
    for (const name of toRemove) {
      try {
        fs.rmSync(path.join(root, name), { recursive: true, force: true });
      } catch (err) {
        console.warn(`[GenerationRun] prune failed for ${name}:`, (err as Error)?.message ?? err);
      }
    }
  } catch (err) {
    console.warn('[GenerationRun] prune failed:', (err as Error)?.message ?? err);
  }
}
