/*
 * "썼어요" marks and the next-day "continue the topic" line (2026-11-15).
 *
 * Why follow-ups: the operator's own measurement (sports blog, 2026-11) had a player's 6th post take off after earlier
 * posts on the same player stayed low. So the board suggests a new card about the same person or event, never a promise.
 *
 * Stored only in this browser (localStorage, every access wrapped in try/catch). Card ids can change between rounds,
 * so a mark also matches by the card's source post URLs.
 */
import { useCallback, useState } from 'react';
import type { BenchmarkCandidate } from '../../../lib/homefeedBenchmarkModel.mjs';
import { guideLevel, isRiskyForBeginner } from './beginnerRank';

export interface WrittenEntry { id: string; title: string; tokens: string[]; urls: string[]; at: string }

const KEY = 'leword.hfb.written.v1';
const KEEP_DAYS = 14;
const MAX_ENTRIES = 40;
const DAY_MS = 86_400_000;
const STOP = new Set(['보도', '이후', '공개', '논란', '근황', '사진', '장면', '이유', '결과', '최근', '오늘', '영상', 'SNS', '뉴스', '정리', '총정리', '방법', '소식', '공식', '발표', '화제', '반응', '뜻밖의', '결국', '충격', '사실', '직접', '이번', '지금', '현재', '모습', '한마디', '어떻게', '무엇', '이유는', '관련', '전망', '공개한', '했다', '한다', '있다', '없다', '하는', '위해', '대한', '이것', '이상', '건강', '사람', '아는', '하루', '먼저', '번째', '눈길', '가는', '같은', '있을', '있을까', '정말', '진짜', '바로', '모두', '이제', '다시', '처음', '마지막', '줄거리', '결말', '기본정보', '등장인물', '화이트', '블랙', '여신', '후기', '가격', '추천', '몇부작', '넷플릭스', '출연진', '정보', '개봉일', '방송', '시청률', '드라마', '예능']);
const PARTICLE = /(으로|에서|에게|까지|부터|와|과|의|이|가|은|는|을|를|에|도|로|만)$/;

type Card = Pick<BenchmarkCandidate, 'id' | 'title' | 'keyword' | 'sources'>;

function tokensOf(text: string): string[] {
    const out: string[] = [];
    for (const raw of text.split(/[^0-9A-Za-z가-힣]+/)) {
        const word = raw.length >= 3 && /[가-힣]$/.test(raw) ? raw.replace(PARTICLE, '') : raw;
        if (word.length < 2 || /\d/.test(word) || STOP.has(word) || out.includes(word)) continue;
        out.push(word);
    }
    return out;
}

const urlsOf = (c: Card) => c.sources.map((s) => s.url).filter((u): u is string => Boolean(u)).slice(0, 5);

export function entryOf(c: Card, now = Date.now()): WrittenEntry {
    const tokens = tokensOf(`${c.title || c.keyword} ${c.keyword}`).slice(0, 12);
    return { id: c.id, title: c.title || c.keyword, tokens, urls: urlsOf(c), at: new Date(now).toISOString() };
}

export function kstDay(value: number | string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function valid(v: unknown): v is WrittenEntry {
    const e = v as WrittenEntry;
    return Boolean(e) && typeof e.id === 'string' && typeof e.title === 'string' && typeof e.at === 'string' && Array.isArray(e.tokens) && Array.isArray(e.urls) && Number.isFinite(Date.parse(e.at));
}

export function readWritten(now = Date.now()): WrittenEntry[] {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(valid).filter((e) => now - Date.parse(e.at) < KEEP_DAYS * DAY_MS).slice(0, MAX_ENTRIES) : [];
    } catch {
        return [];
    }
}

function save(list: WrittenEntry[]): void {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES))); } catch { /* the mark still shows for this visit */ }
}

export function isWrittenCard(list: readonly WrittenEntry[], c: Card): boolean {
    const urls = urlsOf(c);
    return list.some((e) => e.id === c.id || e.urls.some((u) => urls.includes(u)));
}

export function useWrittenTopics() {
    const [list, setList] = useState<WrittenEntry[]>(() => readWritten());
    const toggle = useCallback((c: Card) => {
        setList((prev) => {
            const next = isWrittenCard(prev, c) ? prev.filter((e) => !(e.id === c.id || e.urls.some((u) => urlsOf(c).includes(u)))) : [entryOf(c), ...prev];
            save(next);
            return next;
        });
    }, []);
    return { list, toggle };
}

export interface FollowUp { entry: WrittenEntry; card: BenchmarkCandidate; dayLabel: string }

/**
 * A card counts as a follow-up when its source post is newer than the mark, it is not a written card itself, and it
 * shares two rare words with the written card, one of them 3+ letters (a name, place or product, not a generic word).
 * Rare = the word appears in at most 2% of today's cards (at least 3); the 3+ letter word in at most 1%, so generic
 * words do not link two different stories.
 */
export function findFollowUp(list: readonly WrittenEntry[], cards: readonly BenchmarkCandidate[], now = Date.now()): FollowUp | null {
    const today = kstDay(now);
    const past = list.filter((e) => kstDay(e.at) < today);
    if (!past.length || !cards.length) return null;
    const df = new Map<string, number>();
    const cardTokens = cards.map((c) => tokensOf(`${c.title || c.keyword} ${c.keyword}`));
    cardTokens.forEach((tokens) => tokens.forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
    const rareLimit = Math.max(3, Math.round(cards.length * 0.02));
    const nameLimit = Math.max(3, Math.round(cards.length * 0.01));
    for (const entry of past) {
        const rare = entry.tokens.filter((t) => (df.get(t) ?? 0) <= rareLimit);
        if (!rare.length) continue;
        const writtenAt = Date.parse(entry.at);
        const match = cards.find((c, i) => {
            if (isWrittenCard(list, c) || isRiskyForBeginner(c)) return false;
            if (!(c.publishedAt && Date.parse(c.publishedAt) > writtenAt)) return false;
            const shared = rare.filter((t) => cardTokens[i].includes(t));
            return shared.length >= 2 && shared.some((t) => t.length >= 3 && (df.get(t) ?? 0) <= nameLimit);
        });
        if (match) {
            const daysAgo = Math.round((Date.parse(today) - Date.parse(kstDay(entry.at))) / DAY_MS);
            const [, m, d] = kstDay(entry.at).split('-');
            return { entry, card: match, dayLabel: daysAgo === 1 ? '어제' : `${Number(m)}/${Number(d)}에` };
        }
    }
    return null;
}

/**
 * "오늘 쓸 3개": the first cards of the beginner-ordered list that are safe for a beginner, have a writing guide or
 * home titles, are not marked written, and do not repeat a story already picked (two shared words = same story).
 */
export function pickToday(ordered: readonly BenchmarkCandidate[], list: readonly WrittenEntry[], count = 3): BenchmarkCandidate[] {
    const picked: { card: BenchmarkCandidate; tokens: string[] }[] = [];
    for (const card of ordered) {
        if (picked.length >= count) break;
        if (isRiskyForBeginner(card) || guideLevel(card) === 0 || isWrittenCard(list, card)) continue;
        const tokens = tokensOf(`${card.title || card.keyword} ${card.keyword}`);
        if (picked.some((p) => p.tokens.filter((t) => tokens.includes(t)).length >= 2)) continue;
        picked.push({ card, tokens });
    }
    return picked.map((p) => p.card);
}
