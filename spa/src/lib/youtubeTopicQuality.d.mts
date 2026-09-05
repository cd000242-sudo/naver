export function isUsefulYoutubeTopic(value: unknown): boolean;
export function cleanYoutubeSnapshot<T extends { rows: Array<{ keyword: string; expansions?: string[] }> }>(snapshot: T): T;
