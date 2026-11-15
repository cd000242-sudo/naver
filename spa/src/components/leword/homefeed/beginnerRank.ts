/*
 * Beginner order for the homefeed benchmark board (2026-11-15 owner: "make it easy for beginners and make them come back").
 *
 * The board's own order (scripts-side `priority`) lifts topics many channels already covered and topics from blogs with a
 * long homefeed-top history, which for a new blogger is a head-on fight with big blogs. This order uses only fields the
 * board already carries; the data format is not changed.
 *
 *   score = guide * 100 - channels * 10 - tops * 2 - (risky ? 1000 : 0)
 *
 *   guide    writingDirection present = 2, plus homeTitles (or the editor homeTitle) present = 1  -> 0..3
 *            The guide weight (100) is larger than any competition penalty (max 50 + 40), so a card without a guide
 *            always sorts below every card that has one.
 *   channels distinct source channel ids in `sources` (1..5, capped at 5). Fewer channels = less competition.
 *   tops     highest `homefeedTops` among the card's sources (0..20, capped at 20) = the source blog's recent homefeed-top
 *            count measured by the advisor. Lower = the topic did not come from a homefeed regular.
 *   risky    stale status, or a flag the board already raises against beginners: private-person, sponsored,
 *            sensitive-claim. These cards go to the very end.
 *
 * Ties keep the incoming order (stable sort), so the hourly shuffle still spreads readers across equal cards.
 */
import { useCallback, useState } from 'react';
import type { BenchmarkCandidate } from '../../../lib/homefeedBenchmarkModel.mjs';

const RISK_FLAGS = new Set(['private-person', 'sponsored', 'sensitive-claim']);
const MAX_CHANNELS = 5;
const MAX_TOPS = 20;

type Rankable = Pick<BenchmarkCandidate, 'writingDirection' | 'homeTitles' | 'homeTitle' | 'sources' | 'flags' | 'status'>;

export function channelCount(c: Pick<BenchmarkCandidate, 'sources'>): number {
    return new Set(c.sources.map((s) => s.id || s.url || s.name)).size;
}

export function sourceTops(c: Pick<BenchmarkCandidate, 'sources'>): number {
    return c.sources.reduce((max, s) => Math.max(max, s.homefeedTops ?? 0), 0);
}

export function guideLevel(c: Pick<BenchmarkCandidate, 'writingDirection' | 'homeTitles' | 'homeTitle'>): number {
    return (c.writingDirection ? 2 : 0) + (c.homeTitles.length > 0 || c.homeTitle ? 1 : 0);
}

export function isRiskyForBeginner(c: Pick<BenchmarkCandidate, 'flags' | 'status'>): boolean {
    return c.status === 'stale' || c.flags.some((f) => RISK_FLAGS.has(f));
}

export function beginnerScore(c: Rankable): number {
    const channels = Math.min(Math.max(channelCount(c), 1), MAX_CHANNELS);
    const tops = Math.min(sourceTops(c), MAX_TOPS);
    return guideLevel(c) * 100 - channels * 10 - tops * 2 - (isRiskyForBeginner(c) ? 1000 : 0);
}

/** Returns a new array in beginner order; the input is not changed. */
export function sortForBeginner<T extends Rankable>(cards: readonly T[]): T[] {
    return cards
        .map((card, index) => ({ card, index, score: beginnerScore(card) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.card);
}

export type BoardSort = 'beginner' | 'popular';
const SORT_KEY = 'leword.hfb.sort.v1';

/** Board order choice; beginner order is the default, the reader's last choice is remembered in this browser. */
export function useBoardSort(): [BoardSort, (next: BoardSort) => void] {
    const [sort, setSort] = useState<BoardSort>(() => {
        try { return localStorage.getItem(SORT_KEY) === 'popular' ? 'popular' : 'beginner'; } catch { return 'beginner'; }
    });
    const choose = useCallback((next: BoardSort) => {
        setSort(next);
        try { localStorage.setItem(SORT_KEY, next); } catch { /* the choice still applies for this visit */ }
    }, []);
    return [sort, choose];
}
