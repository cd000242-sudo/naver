/**
 * Title candidate chips under the semi-auto title input.
 *
 * The generator returns titleCandidates[3] on every post, but the result view only
 * showed the one it picked. The owner asked to see the others as buttons and swap
 * with one click. The "제목 A/B" analytics panel is a separate keyword tool and never
 * sees the post's own candidates, so this row lives next to the title input instead.
 *
 * Pure selection (collectTitleCandidateChips) is separated from DOM work so the
 * hide rules are unit-testable. Rendering uses textContent only — no innerHTML.
 *
 * Candidates are not persisted in the light post snapshot (postManager), so a post
 * reloaded from the list shows no chips; callers pass null there to clear stale ones.
 */

export const TITLE_CANDIDATE_CHIPS_HOST_ID = 'unified-title-candidates';

export interface TitleCandidateChip {
  text: string;
  score?: number;
  reasoning?: string;
}

const MIN_DISTINCT_CANDIDATES = 2;

function toChip(raw: unknown): TitleCandidateChip | null {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const text = String(obj ? obj.text ?? '' : raw ?? '').trim();
  if (!text || /^https?:\/\//iu.test(text)) return null;
  return {
    text,
    score: obj && typeof obj.score === 'number' ? obj.score : undefined,
    reasoning: obj && obj.reasoning ? String(obj.reasoning) : undefined,
  };
}

/** Distinct, non-empty candidates worth offering; [] when the row should stay hidden. */
export function collectTitleCandidateChips(structuredContent: unknown): TitleCandidateChip[] {
  const sc = structuredContent && typeof structuredContent === 'object'
    ? (structuredContent as Record<string, unknown>)
    : null;
  if (!sc) return [];
  // Locked titles collapse to one candidate upstream; never offer alternatives to them.
  if (sc.manualTitleLocked || sc.keywordAsTitleLocked) return [];

  const primary = Array.isArray(sc.titleCandidates) ? sc.titleCandidates : [];
  const alternatives = Array.isArray(sc.titleAlternatives) ? sc.titleAlternatives : [];
  const seen = new Set<string>();
  const chips = [...primary, ...alternatives].reduce<TitleCandidateChip[]>((acc, raw) => {
    const chip = toChip(raw);
    if (!chip) return acc;
    const key = chip.text.replace(/\s+/gu, ' ');
    if (seen.has(key)) return acc;
    seen.add(key);
    return [...acc, chip];
  }, []);

  return chips.length >= MIN_DISTINCT_CANDIDATES ? chips : [];
}

function currentTitleOf(structuredContent: unknown): string {
  const sc = structuredContent as Record<string, unknown> | null;
  return String(sc?.selectedTitle || sc?.title || '').trim();
}

/**
 * Renders the chip row into #unified-title-candidates. Hides and empties the host
 * when there is nothing to offer. Safe to call when the host is missing.
 */
export function renderTitleCandidateChips(
  structuredContent: unknown,
  onSelect: (title: string) => void,
  doc: Document = document,
): void {
  const host = doc.getElementById(TITLE_CANDIDATE_CHIPS_HOST_ID);
  if (!host) return;

  const chips = collectTitleCandidateChips(structuredContent);
  host.replaceChildren();
  if (chips.length === 0) {
    host.style.display = 'none';
    return;
  }

  const current = currentTitleOf(structuredContent);
  const label = doc.createElement('span');
  label.className = 'title-candidate-label';
  label.textContent = '제목 후보';
  host.appendChild(label);

  chips.forEach((chip) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'title-candidate-chip';
    if (chip.text === current) button.classList.add('is-active');
    button.textContent = chip.text;
    if (chip.reasoning) button.title = chip.reasoning;
    button.addEventListener('click', () => onSelect(chip.text));
    host.appendChild(button);
  });
  host.style.display = '';
}
