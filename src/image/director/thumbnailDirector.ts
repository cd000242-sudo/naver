/**
 * SPEC-NAVER-IMAGE-2026 — thumbnail director (NAVER IMAGE PIPELINE V1 §4, §8–§10).
 *
 *   composable real photos → compose them (no AI call at all)
 *   none                   → one AI cover driven by the title + card promise
 *   standard mode (default)→ exactly one thumbnail, no judge call (V1 §10, §15, §27)
 *   high mode (opt-in)     → 2–3 free variants of that one image + one vision judge call
 *
 * Text is never the whole title (V1 §9): a short phrase, baked only where the no-overlay flag survives
 * to publish. Every side effect is injected. Optional steps never destroy a result: a failed variant,
 * card or judge keeps the plain first image — the same image the app produced before this module.
 */
import type { GeneratedImage, ImageRequestItem } from '../types.js';
import type { ComposeResult } from './thumbnailComposer.js';
import type { ThumbnailJudgeCandidate, ThumbnailJudgeContext, ThumbnailJudgeVerdict } from './thumbnailJudge.js';
import type { ArticleVisualKind } from './sectionRolePlanner.js';
import { chooseThumbnailDirection, coverDirectionLines, type ThumbnailDirection } from './thumbnailStrategy.js';
import { decideThumbnailText, type ThumbnailTextDecision, type ThumbnailTextMode } from './thumbnailText.js';

export type CandidateKind = 'ai-full' | 'ai-tight' | 'ai-hook' | 'real-square' | 'real-tight' | 'real-hook';

export interface CandidateFile {
  readonly kind: CandidateKind;
  readonly filePath: string;
  readonly label: string;
  readonly bakedText: boolean;
  readonly real: boolean;
}

export interface ThumbnailDirectorInput {
  readonly title: string;
  readonly cardPromise: string;
  /** The thumbnail item exactly as the caller sent it. */
  readonly item: ImageRequestItem;
  readonly textMode: ThumbnailTextMode;
  readonly qualityMode: 'standard' | 'high';
  readonly kind: ArticleVisualKind;
  /** Short text may be baked in (only where the no-overlay flag survives to publish). */
  readonly allowBakedText: boolean;
  /** The caller's prompt is the user's own (regeneration or saved manual prompt): keep it. */
  readonly keepPrompt?: boolean;
  /** The engine draws text itself (nano-banana-2/pro, flow) and the item allows text. */
  readonly engineDrawsText: boolean;
  /** Composable real photos (realAssetResolver), existing local files. */
  readonly realImages: readonly string[];
  /** Directory for real-photo composites (AI variants go next to the AI base file). */
  readonly realWorkDir: string;
}

export interface ThumbnailDirectorDeps {
  generateBase(item: ImageRequestItem): Promise<GeneratedImage | null>;
  composeSquare(input: string, output: string): Promise<ComposeResult>;
  composeTight(input: string, output: string): Promise<ComposeResult>;
  composeHook(input: string, output: string, hook: { main: string }): Promise<ComposeResult>;
  toJudgeImage(filePath: string): Promise<{ base64: string }>;
  judge(
    images: ReadonlyArray<{ base64: string }>,
    ctx: ThumbnailJudgeContext,
    candidates: readonly ThumbnailJudgeCandidate[],
  ): Promise<ThumbnailJudgeVerdict>;
  isLocalFile(filePath: string | undefined): boolean;
  log(message: string): void;
  isCancelled?(): boolean;
}

export interface ThumbnailDirectorResult {
  /** The AI base image, or null when real photos were used. */
  readonly base: GeneratedImage | null;
  readonly winner: CandidateFile;
  readonly candidates: readonly CandidateFile[];
  readonly verdict: ThumbnailJudgeVerdict | null;
  readonly direction: ThumbnailDirection;
  readonly text: ThumbnailTextDecision;
}

const LOG = '[ThumbnailDirector]';

function isSlotName(heading: string): boolean {
  return /썸네일|thumbnail/iu.test(heading);
}

/** The cover item: title and card promise drive the brief instead of the slot name "🖼️ 썸네일". */
export function buildCoverItem(
  input: ThumbnailDirectorInput,
  direction: ThumbnailDirection,
  titleBandPlanned = false,
): ImageRequestItem {
  const heading = String(input.item.heading || '');
  const slot = isSlotName(heading) || !heading.trim();
  // The slot-name translation ("🖼️ 썸네일" → prompt) carries no meaning; the brief anchors do. A prompt
  // the user wrote or regenerated with is theirs and always wins (V1 §16).
  const replacePrompt = slot && input.keepPrompt !== true;
  return {
    ...input.item,
    heading: slot ? input.title : heading,
    prompt: replacePrompt ? input.title : input.item.prompt,
    englishPrompt: replacePrompt ? '' : input.item.englishPrompt,
    isThumbnail: true,
    sectionContent: [input.cardPromise, input.item.sectionContent]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' / ')
      .slice(0, 900) || undefined,
    coverDirection: coverDirectionLines(direction, { titleBandPlanned, cardPromise: input.cardPromise }),
  };
}

function variantPath(baseFile: string, suffix: string): string {
  const slash = Math.max(baseFile.lastIndexOf('/'), baseFile.lastIndexOf('\\'));
  const dir = slash >= 0 ? baseFile.slice(0, slash) : '.';
  const name = (slash >= 0 ? baseFile.slice(slash + 1) : baseFile).replace(/\.[a-z0-9]+$/iu, '');
  return `${dir}/thumb-candidates/${name}-${suffix}.png`;
}

async function tryCompose(deps: ThumbnailDirectorDeps, label: string, run: () => Promise<ComposeResult>): Promise<string | null> {
  try {
    return (await run()).filePath;
  } catch (error) {
    deps.log(`${LOG} ⚠️ '${label}' 합성 실패 — 건너뜀: ${(error as Error)?.message || error}`);
    return null;
  }
}

type Maker = () => Promise<CandidateFile | null>;

async function collect(makers: readonly Maker[]): Promise<CandidateFile[]> {
  const out: CandidateFile[] = [];
  for (const make of makers) {
    const made = await make();
    if (made) out.push(made);
  }
  return out.slice(0, 3);
}

function realMakers(input: ThumbnailDirectorInput, bake: { main: string } | null, deps: ThumbnailDirectorDeps): Maker[] {
  const [first, second] = input.realImages;
  const stamp = `${Date.now()}`;
  const at = (suffix: string) => `${input.realWorkDir}/real-${stamp}-${suffix}.png`;
  const make = (kind: CandidateKind, label: string, bakedText: boolean, run: () => Promise<ComposeResult>): Maker =>
    async () => {
      const filePath = await tryCompose(deps, label, run);
      return filePath ? { kind, filePath, label, bakedText, real: true } : null;
    };
  const card = bake ? make('real-hook', '실제 사진 + 짧은 문구', true, () => deps.composeHook(first, at('text'), bake)) : null;
  const square = make('real-square', '실제 사진', false, () => deps.composeSquare(first, at('square')));
  if (input.qualityMode !== 'high') return card ? [card, square] : [square];
  const tight = make('real-tight', '실제 사진(가까이)', false, () => deps.composeTight(first, at('tight')));
  const other = second ? make('real-square', '다른 실제 사진', false, () => deps.composeSquare(second, at('square2'))) : null;
  return [square, card ?? tight, other].filter(Boolean) as Maker[];
}

async function pick(
  candidates: readonly CandidateFile[],
  input: ThumbnailDirectorInput,
  titleBandPlanned: boolean,
  deps: ThumbnailDirectorDeps,
): Promise<{ winner: CandidateFile; verdict: ThumbnailJudgeVerdict | null }> {
  if (input.qualityMode !== 'high' || candidates.length < 2 || deps.isCancelled?.()) {
    return { winner: candidates[0], verdict: null };
  }
  try {
    const images = await Promise.all(candidates.map((c) => deps.toJudgeImage(c.filePath)));
    const verdict = await deps.judge(
      images,
      { title: input.title, cardPromise: input.cardPromise || input.title, titleBandPlanned },
      candidates.map((c) => ({ label: c.label, hasBakedText: c.bakedText })),
    );
    return { winner: candidates[verdict.pickIndex] ?? candidates[0], verdict };
  } catch (error) {
    deps.log(`${LOG} ⚠️ 심사 준비 실패 — 1번 유지: ${(error as Error)?.message || error}`);
    return { winner: candidates[0], verdict: null };
  }
}

/**
 * Returns null only when the AI base itself could not be produced — the caller then reports the
 * failure exactly as before. Every later step degrades to "keep the plain image".
 */
export async function runThumbnailDirector(
  input: ThumbnailDirectorInput,
  deps: ThumbnailDirectorDeps,
): Promise<ThumbnailDirectorResult | null> {
  const direction = chooseThumbnailDirection(input.title, input.cardPromise);
  const realFirst = input.realImages.length > 0;
  const text = decideThumbnailText({
    mode: input.textMode, title: input.title, cardPromise: input.cardPromise, realPhotoCover: realFirst, kind: input.kind,
  });
  const bake = input.allowBakedText && text.include && text.text ? { main: text.text } : null;
  // Where text cannot be baked, the legacy overlays add it later (short text) — tell the brief/judge.
  const titleBandPlanned = !input.allowBakedText && text.include;
  deps.log(`${LOG} 🧭 방향=${direction} · 모드=${input.qualityMode} · 문구=${text.include ? `"${text.text}"` : '없음'}(${text.reason}) · 실제 사진 ${input.realImages.length}장`);

  if (realFirst) {
    const real = await collect(realMakers(input, bake, deps));
    if (real.length > 0) {
      const { winner, verdict } = await pick(real, input, titleBandPlanned, deps);
      return { base: null, winner, candidates: real, verdict, direction, text };
    }
    deps.log(`${LOG} ⚠️ 실제 사진 합성이 모두 실패 — AI 썸네일로 진행`);
  }

  const cover = buildCoverItem(input, direction, titleBandPlanned);
  // An engine that draws its own text renders the decided short phrase, never the title (V1 §9).
  const drawn = input.engineDrawsText && text.include && text.text ? { ...cover, thumbnailText: text.text } : cover;
  const base = await deps.generateBase(drawn);
  if (!base) return null;
  const full: CandidateFile = { kind: 'ai-full', filePath: String(base.filePath || ''), label: 'AI 장면', bakedText: false, real: false };
  // An engine that drew its own text must not be cropped or overprinted.
  if (!deps.isLocalFile(base.filePath) || input.engineDrawsText || deps.isCancelled?.()) {
    return { base, winner: full, candidates: [full], verdict: null, direction, text };
  }
  const cardMaker: Maker | null = bake
    ? async () => {
      const filePath = await tryCompose(deps, '짧은 문구 카드', () => deps.composeHook(full.filePath, variantPath(full.filePath, 'text'), bake));
      return filePath ? { kind: 'ai-hook', filePath, label: '짧은 문구 카드', bakedText: true, real: false } : null;
    }
    : null;
  const tightMaker: Maker = async () => {
    const filePath = await tryCompose(deps, 'AI 장면(가까이)', () => deps.composeTight(full.filePath, variantPath(full.filePath, 'tight')));
    return filePath ? { kind: 'ai-tight', filePath, label: 'AI 장면(가까이)', bakedText: false, real: false } : null;
  };
  const makers: Maker[] = input.qualityMode === 'high'
    ? [async () => full, ...(cardMaker ? [cardMaker] : []), tightMaker]
    : [...(cardMaker ? [cardMaker] : []), async () => full];
  const candidates = await collect(makers);
  const { winner, verdict } = await pick(candidates, input, titleBandPlanned, deps);
  return { base, winner, candidates, verdict, direction, text };
}
