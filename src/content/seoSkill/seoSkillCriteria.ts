/**
 * claude-seo review pass — criteria extraction.
 *
 * The app ships two third-party skill files untouched (MIT, github.com/AgriciDaniel/claude-seo) under
 * `src/prompts/vendor/claude-seo/` (copied into resources/prompts with the other prompt files). Those files audit
 * whole websites; only some sections apply to a single post. This module lifts exactly those sections, verbatim,
 * into one "criteria" text for the review prompt. Same rules as LEADERNAM Orbit's copy of this step.
 *
 * Rules:
 *  - The skill text is DATA. Nothing in it is executed; lines such as "run the script" or "fetch the URL" are never
 *    acted on by the app, and the review prompt tells the model the same.
 *  - Headings are matched by prefix (the "(date)" / "(25%)" suffixes change between editions of the skill).
 *  - A heading that vanished (the skill was updated) is skipped and reported; if nothing at all can be lifted the
 *    result is `ok: false` and the caller treats the review as failed.
 */
import { loadPromptFile } from '../../promptLoader.js';

export interface CriteriaSpec {
  readonly file: 'content' | 'geo';
  /** Heading prefix with its hashes, matched against the start of a line. */
  readonly heading: string;
  /** Also stop before the first line that starts with one of these (headings of a lower level). */
  readonly endBefore?: readonly string[];
  /** Also stop before the first blockquote line ("> ...") inside the section. */
  readonly stopAtBlockquote?: boolean;
}

export const SEO_CRITERIA_SPECS: readonly CriteriaSpec[] = [
  { file: 'content', heading: '## Google\'s "Who / How / Why" Test' },
  { file: 'content', heading: '### Experience' },
  { file: 'content', heading: '### Expertise' },
  { file: 'content', heading: '### Readability' },
  { file: 'content', heading: '### Keyword Optimization' },
  { file: 'content', heading: '### Content Structure' },
  // Keeps the two sub-sections, drops the blockquote notes that follow them (they talk about reports and scoring).
  { file: 'content', heading: '## AI Content Assessment', stopAtBlockquote: true },
  { file: 'content', heading: '## AI Citation Readiness', endBefore: ['### AI Search Visibility'] },
  { file: 'geo', heading: '## Primary Source: Google\'s AI Optimization Guide' },
  { file: 'geo', heading: '### 1. Citability Score' },
  { file: 'geo', heading: '### 2. Structural Readability' },
];

export interface SeoCriteria {
  readonly ok: boolean;
  /** The lifted sections, verbatim, grouped per skill file. Empty when `ok` is false. */
  readonly text: string;
  readonly found: readonly string[];
  /** Spec headings that were not found (skill updated?). */
  readonly missing: readonly string[];
}

const FILE_LABEL: Record<CriteriaSpec['file'], string> = {
  content: '--- claude-seo / seo-content (verbatim excerpts) ---',
  geo: '--- claude-seo / seo-geo (verbatim excerpts) ---',
};

const isFence = (line: string): boolean => /^\s*(```|~~~)/.test(line);

/** Returns the section for one spec, or null when its heading is not in the file. */
function liftSection(lines: readonly string[], spec: CriteriaSpec): string | null {
  const level = (spec.heading.match(/^#+/) || ['#'])[0].length;
  let inFence = false;
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (isFence(line)) { inFence = !inFence; continue; }
    if (!inFence && line.startsWith(spec.heading)) { start = i; break; }
  }
  if (start < 0) return null;

  const collected: string[] = [lines[start] ?? ''];
  inFence = false;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (isFence(line)) inFence = !inFence;
    if (!inFence && !isFence(line)) {
      const hashes = (line.match(/^(#{1,6}) /) || [])[1];
      if (hashes && hashes.length <= level) break;
      if (spec.endBefore?.some((prefix) => line.startsWith(prefix))) break;
      if (spec.stopAtBlockquote && line.startsWith('>')) break;
    }
    collected.push(line);
  }
  return collected.join('\n').trimEnd();
}

/** Lifts the configured sections out of the two SKILL.md texts (CRLF or LF). */
export function extractSeoCriteria(files: { content: string; geo: string }): SeoCriteria {
  const lines = {
    content: String(files.content || '').replace(/\r\n/g, '\n').split('\n'),
    geo: String(files.geo || '').replace(/\r\n/g, '\n').split('\n'),
  };
  const found: string[] = [];
  const missing: string[] = [];
  const groups: Record<CriteriaSpec['file'], string[]> = { content: [], geo: [] };

  for (const spec of SEO_CRITERIA_SPECS) {
    const block = liftSection(lines[spec.file], spec);
    if (block === null) { missing.push(spec.heading); continue; }
    found.push(spec.heading);
    groups[spec.file].push(block);
  }

  if (found.length === 0) return { ok: false, text: '', found, missing };
  const text = (['content', 'geo'] as const)
    .filter((key) => groups[key].length > 0)
    .map((key) => [FILE_LABEL[key], ...groups[key]].join('\n\n'))
    .join('\n\n');
  return { ok: true, text, found, missing };
}

export const SEO_SKILL_FILES = {
  content: 'vendor/claude-seo/skills/seo-content/SKILL.md',
  geo: 'vendor/claude-seo/skills/seo-geo/SKILL.md',
} as const;

/** Reads the shipped bundle through the prompt loader (dev: src/prompts, packaged: resources/prompts). Never throws. */
export function loadSeoCriteria(read: (relPath: string) => string = loadPromptFile): SeoCriteria & { fileErrors: string[] } {
  const fileErrors: string[] = [];
  const get = (key: keyof typeof SEO_SKILL_FILES): string => {
    try {
      const text = read(SEO_SKILL_FILES[key]);
      if (!text) fileErrors.push(`${SEO_SKILL_FILES[key]}: 비어 있거나 읽지 못함`);
      return text;
    } catch (error: unknown) {
      fileErrors.push(`${SEO_SKILL_FILES[key]}: ${String((error as Error)?.message || error).slice(0, 80)}`);
      return '';
    }
  };
  return { ...extractSeoCriteria({ content: get('content'), geo: get('geo') }), fileErrors };
}
