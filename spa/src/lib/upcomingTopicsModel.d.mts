export interface UpcomingWatch { name: string; signal: string; quote: string; url: string | null; angles: string[]; publishAt: string; searchVolume: number | null; documentCount: number | null; suggestions: string[]; homeTitles: string[] }
export interface UpcomingCard { id: string; kind: 'sports' | 'schedule'; league: string; title: string; startsAt: string; dateOnly: boolean; articleCount: number; articles: { title: string; url: string }[]; watch: UpcomingWatch[] }
export interface UpcomingBoard { generatedAt: string | null; windowDays: number; cards: UpcomingCard[] }
export function normalizeUpcoming(raw: unknown): UpcomingBoard | null;
export function upcomingView(board: UpcomingBoard | null, nowMs?: number): UpcomingCard[];
export function whenLabel(card: { startsAt: string; dateOnly: boolean }, nowMs?: number): string;
