export interface SeasonalTopic {
  id: string; month: number; category: string; type: string; keyword: string; angle: string; prep: string; money: boolean;
  sourceTitle: string; sourceUrl: string; sourceStatus: string; suggestions: string[]; observedAt: string | null;
}
export interface SeasonalBoard {
  version: 1; updatedAt: string;
  audit: { originalTopics: number; addedTopics: number; excludedSuggestions: number; notes: string[] };
  stats: { topics: number; autocompleteUnique: number; moneyTopics: number }; topics: SeasonalTopic[];
}
export function safeSourceUrl(value: unknown): string | null;
export function parseSeasonalBoard(value: unknown): SeasonalBoard;
export function koreaMonth(now?: Date): number;
export function nextMonth(month: number): number;
export function isPlanningPriority(topic: SeasonalTopic, month: number): boolean;
export function filterSeasonalTopics(topics: SeasonalTopic[], options?: { month?: number | 'all'; category?: string; query?: string; moneyOnly?: boolean }): SeasonalTopic[];
export function paginateTopics(topics: SeasonalTopic[], requestedPage: number, pageSize?: number): { items: SeasonalTopic[]; page: number; pages: number; total: number };
export function timingNotice(type: string): string;
export function loadSeasonalBoard(signal: AbortSignal, fetcher?: typeof fetch): Promise<SeasonalBoard>;
