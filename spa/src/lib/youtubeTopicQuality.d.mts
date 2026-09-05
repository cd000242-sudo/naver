export function isUsefulYoutubeTopic(value: unknown): boolean;
export function isUsefulYoutubeLead(value: unknown): boolean;
export function isRelevantYoutubeTopic(keyword: unknown, title: unknown): boolean;
export function cleanYoutubeSnapshot<T extends { rows: Array<{ keyword: string; expansions?: string[] }> }>(snapshot: T): T;
